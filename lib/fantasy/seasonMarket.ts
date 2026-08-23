import { parseCsv } from "@/lib/fantasy/csv";
import { scoreStatProjection } from "@/lib/fantasy/scoring";
import type {
  CandidateSeasonMarketSnapshot,
  DraftCandidate,
  FantasyScoringRules,
  PlayerPosition,
  SeasonMarketProjectionAdjustment,
  SeasonMarketProjectionStats,
  StatProjection,
} from "@/lib/fantasy/types";

const WIN_WITH_ODDS_CSV_URL =
  "https://www.winwithodds.com/download/season_long_proj_table.csv";
const SUPPORTED_POSITIONS = new Set<PlayerPosition>(["QB", "RB", "WR", "TE"]);
const DEFAULT_BLEND_WEIGHT = 0.25;
const DEFAULT_RANK_CUTOFF = 300;
const CONTEXT_CORRECTION_WEIGHT = 0.65;
const CONTEXT_CORRECTION_CAP = 0.7;

const CSV_STAT_MAP: Record<string, keyof SeasonMarketProjectionStats> = {
  Attempts: "passingAttempts",
  Comps: "completions",
  "Pass TDs": "passingTouchdowns",
  "Pass Yards": "passingYards",
  Ints: "interceptions",
  Receptions: "receptions",
  "Rec Yards": "receivingYards",
  "Rec TDs": "receivingTouchdowns",
  "Rush Attempts": "rushingAttempts",
  "Rush Yards": "rushingYards",
  "Rush TDs": "rushingTouchdowns",
  Fumbles: "fumbles",
  Projections: "sourcePprPoints",
};

const SCOREABLE_STATS = new Set<keyof StatProjection>([
  "passingTouchdowns",
  "passingYards",
  "interceptions",
  "receptions",
  "receivingYards",
  "receivingTouchdowns",
  "rushingYards",
  "rushingTouchdowns",
]);

export type SeasonMarketPlayerProjection = {
  playerName: string;
  position: PlayerPosition;
  rank: number;
  stats: SeasonMarketProjectionStats;
};

export type SeasonMarketFeed = {
  provider: "win-with-odds";
  players: Map<string, SeasonMarketPlayerProjection>;
  rowCount: number;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
};

function readNumber(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeSeasonMarketName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function parseWinWithOddsSeasonCsv(csv: string) {
  const players = new Map<string, SeasonMarketPlayerProjection>();

  for (const row of parseCsv(csv)) {
    const playerName = row.Name?.trim();
    const position = row.Pos?.trim().toUpperCase() as PlayerPosition;
    const rawRank = readNumber(row.Rank);
    if (!playerName || !SUPPORTED_POSITIONS.has(position) || rawRank === undefined) {
      continue;
    }

    const stats: SeasonMarketProjectionStats = {};
    for (const [column, stat] of Object.entries(CSV_STAT_MAP)) {
      const value = readNumber(row[column]);
      if (value !== undefined) {
        stats[stat] = value;
      }
    }

    // The export is zero-indexed even though the web table is one-indexed.
    const rank = rawRank + 1;
    players.set(normalizeSeasonMarketName(playerName), {
      playerName,
      position,
      rank,
      stats,
    });
  }

  return players;
}

export async function fetchSeasonMarketFeed(): Promise<SeasonMarketFeed> {
  const response = await fetch(WIN_WITH_ODDS_CSV_URL, {
    headers: { Accept: "text/csv" },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) {
    throw new Error(
      `Win With Odds season projection request failed (${response.status} ${response.statusText}).`,
    );
  }

  const players = parseWinWithOddsSeasonCsv(await response.text());
  if (players.size === 0) {
    throw new Error("Win With Odds season projection export contained no usable players.");
  }

  return {
    provider: "win-with-odds",
    players,
    rowCount: players.size,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: response.headers.get("last-modified"),
  };
}

function indicatesExpandedRoleOrHealthRebound(
  candidate: DraftCandidate,
  source: SeasonMarketPlayerProjection,
) {
  const baseline = candidate.projection.stats;
  const projected = source.stats;
  const ratio = (sourceValue: number | undefined, baselineValue: number | undefined) =>
    typeof sourceValue === "number" && typeof baselineValue === "number" && baselineValue > 0
      ? sourceValue / baselineValue
      : 0;

  switch (source.position) {
    case "QB":
      return (
        (projected.passingAttempts ?? 0) >= 350 &&
        (ratio(projected.passingYards, baseline.passingYards) >= 1.3 ||
          ratio(projected.rushingYards, baseline.rushingYards) >= 1.65)
      );
    case "RB":
      return (
        (projected.rushingAttempts ?? 0) >= 150 &&
        (ratio(projected.rushingYards, baseline.rushingYards) >= 1.35 ||
          ratio(projected.receptions, baseline.receptions) >= 1.5)
      );
    case "WR":
      return (
        (projected.receptions ?? 0) >= 50 &&
        ratio(projected.receivingYards, baseline.receivingYards) >= 1.35
      );
    case "TE":
      return (
        (projected.receptions ?? 0) >= 45 &&
        ratio(projected.receivingYards, baseline.receivingYards) >= 1.35
      );
    default:
      return false;
  }
}

export function applySeasonMarketToCandidates(
  candidates: DraftCandidate[],
  feed: SeasonMarketFeed,
  rules: FantasyScoringRules,
  options?: { blendWeight?: number; rankCutoff?: number; maxStatChange?: number },
) {
  const blendWeight = Math.max(0, Math.min(0.4, options?.blendWeight ?? DEFAULT_BLEND_WEIGHT));
  const rankCutoff = Math.max(1, options?.rankCutoff ?? DEFAULT_RANK_CUTOFF);
  const maxStatChange = Math.max(0.05, Math.min(0.4, options?.maxStatChange ?? 0.2));
  let appliedCount = 0;

  const adjustedCandidates = candidates.map((candidate) => {
    const source = feed.players.get(normalizeSeasonMarketName(candidate.player.fullName));
    const position = candidate.player.positions[0];
    if (!source || source.rank > rankCutoff || source.position !== position) {
      return candidate;
    }

    const context = indicatesExpandedRoleOrHealthRebound(candidate, source)
      ? "expanded-role-or-health-rebound" as const
      : "standard" as const;
    const effectiveBlendWeight =
      context === "expanded-role-or-health-rebound" ? CONTEXT_CORRECTION_WEIGHT : blendWeight;
    const effectiveMaxStatChange =
      context === "expanded-role-or-health-rebound" ? CONTEXT_CORRECTION_CAP : maxStatChange;

    const stats: StatProjection = { ...candidate.projection.stats };
    const adjustments: SeasonMarketProjectionAdjustment[] = [];
    for (const [stat, sourceProjection] of Object.entries(source.stats) as Array<
      [keyof SeasonMarketProjectionStats, number]
    >) {
      if (!SCOREABLE_STATS.has(stat as keyof StatProjection)) {
        continue;
      }
      const scoreableStat = stat as keyof StatProjection;
      const previousProjection = stats[scoreableStat];
      if (typeof previousProjection !== "number" || previousProjection <= 0) {
        continue;
      }

      const maxChange = Math.max(0.5, Math.abs(previousProjection) * effectiveMaxStatChange);
      const rawChange = (sourceProjection - previousProjection) * effectiveBlendWeight;
      const adjustedProjection = Number(
        Math.max(0, previousProjection + Math.max(-maxChange, Math.min(maxChange, rawChange))).toFixed(2),
      );
      stats[scoreableStat] = adjustedProjection;
      adjustments.push({
        stat: scoreableStat,
        sourceProjection,
        previousProjection,
        adjustedProjection,
      });
    }

    if (adjustments.length === 0) {
      return candidate;
    }

    appliedCount += 1;
    const previousScore = scoreStatProjection(candidate.projection.stats, rules);
    const adjustedScore = scoreStatProjection(stats, rules);
    const projectionDelta = Number((adjustedScore - previousScore).toFixed(2));
    const sourcePprPoints = source.stats.sourcePprPoints ?? null;
    const seasonMarket: CandidateSeasonMarketSnapshot = {
      provider: "win-with-odds",
      context,
      sourceRank: source.rank,
      sourcePosition: source.position,
      sourcePprPoints,
      blendWeight: effectiveBlendWeight,
      projectionDelta,
      stats: source.stats,
      adjustments,
      summary:
        context === "expanded-role-or-health-rebound"
          ? `${adjustments.length} season-long Vegas-derived stat categories moved the Yahoo projection ${projectionDelta >= 0 ? "+" : ""}${projectionDelta.toFixed(1)} points at a ${Math.round(effectiveBlendWeight * 100)}% corrective weight because the full-season volume implies an expanded role or health rebound missing from the baseline.`
          : `${adjustments.length} season-long Vegas-derived stat categories moved the Yahoo projection ${projectionDelta >= 0 ? "+" : ""}${projectionDelta.toFixed(1)} points at a ${Math.round(effectiveBlendWeight * 100)}% blend weight.`,
    };

    return {
      ...candidate,
      player: {
        ...candidate.player,
        sources: candidate.player.sources.includes("win-with-odds")
          ? candidate.player.sources
          : [...candidate.player.sources, "win-with-odds"],
      },
      seasonMarket,
      projection: { ...candidate.projection, stats },
    } satisfies DraftCandidate;
  });

  return { candidates: adjustedCandidates, appliedCount };
}
