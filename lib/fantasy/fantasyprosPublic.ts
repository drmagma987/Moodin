import { buildCanonicalPlayers } from "@/lib/fantasy/identity";
import { scoreStatProjection, yahooLeagueRules } from "@/lib/fantasy/scoring";
import type {
  DraftCandidate,
  MarketSnapshot,
  PlayerPosition,
  ProjectionSnapshot,
  ProviderPlayerRecord,
  StatProjection,
} from "@/lib/fantasy/types";

const PUBLIC_ECR_URL = "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php?export=xls";
const PUBLIC_ADP_URL = "https://www.fantasypros.com/nfl/adp/ppr-overall.php?export=xls";
const DRAFT_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

type PublicBoardSeed = {
  playerId: string;
  record: ProviderPlayerRecord;
  market: MarketSnapshot;
  positionRank: number;
};

export type FantasyProsPublicDraftSource = {
  candidates: DraftCandidate[];
  directAdpCount: number;
  proxiedAdpCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function normalizePosition(input: unknown): PlayerPosition | null {
  const value = readString(input)?.toUpperCase();
  if (!value) {
    return null;
  }

  return DRAFT_POSITIONS.includes(value as PlayerPosition) ? (value as PlayerPosition) : null;
}

function extractJsonObjectAfterMarker(html: string, marker: string) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`FantasyPros public page missing marker: ${marker}`);
  }

  const startIndex = html.indexOf("{", markerIndex + marker.length);
  if (startIndex === -1) {
    throw new Error(`FantasyPros public page missing JSON object after marker: ${marker}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;

  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = index + 1;
        break;
      }
    }
  }

  if (endIndex === -1) {
    throw new Error(`FantasyPros public page JSON object did not terminate for marker: ${marker}`);
  }

  return JSON.parse(html.slice(startIndex, endIndex)) as Record<string, unknown>;
}

function parsePositionRank(value: unknown) {
  const text = readString(value);
  if (!text) {
    return undefined;
  }

  const match = text.match(/(\d+)/);
  if (!match) {
    return undefined;
  }

  const rank = Number(match[1]);
  return Number.isFinite(rank) ? rank : undefined;
}

function interpolateCurve(rank: number, anchors: Array<{ rank: number; points: number }>) {
  if (rank <= anchors[0].rank) {
    return anchors[0].points;
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const current = anchors[index];
    if (rank <= current.rank) {
      const span = current.rank - previous.rank;
      const progress = span === 0 ? 0 : (rank - previous.rank) / span;
      return previous.points + (current.points - previous.points) * progress;
    }
  }

  const tail = anchors[anchors.length - 1];
  const previous = anchors[anchors.length - 2] ?? tail;
  const slope = tail.rank === previous.rank ? 0 : (tail.points - previous.points) / (tail.rank - previous.rank);
  return Math.max(25, tail.points + slope * (rank - tail.rank));
}

function estimateMedianPoints(
  position: PlayerPosition,
  positionRank: number,
  market: MarketSnapshot,
) {
  const anchorsByPosition: Record<PlayerPosition, Array<{ rank: number; points: number }>> = {
    QB: [
      { rank: 1, points: 374 },
      { rank: 6, points: 328 },
      { rank: 12, points: 282 },
      { rank: 18, points: 244 },
      { rank: 24, points: 214 },
      { rank: 30, points: 186 },
    ],
    RB: [
      { rank: 1, points: 372 },
      { rank: 6, points: 304 },
      { rank: 12, points: 248 },
      { rank: 18, points: 206 },
      { rank: 24, points: 171 },
      { rank: 36, points: 121 },
      { rank: 48, points: 86 },
      { rank: 60, points: 62 },
    ],
    WR: [
      { rank: 1, points: 336 },
      { rank: 6, points: 291 },
      { rank: 12, points: 246 },
      { rank: 18, points: 212 },
      { rank: 24, points: 182 },
      { rank: 36, points: 141 },
      { rank: 48, points: 107 },
      { rank: 60, points: 86 },
      { rank: 72, points: 70 },
    ],
    TE: [
      { rank: 1, points: 257 },
      { rank: 3, points: 209 },
      { rank: 6, points: 191 },
      { rank: 9, points: 179 },
      { rank: 12, points: 168 },
      { rank: 18, points: 150 },
      { rank: 24, points: 134 },
      { rank: 30, points: 119 },
    ],
    K: [{ rank: 1, points: 150 }],
    DST: [{ rank: 1, points: 120 }],
  };

  const base = interpolateCurve(positionRank, anchorsByPosition[position]);
  const valueSignal = (market.adp - market.ecr) * 0.85;
  const volatilityPenalty = Math.min(market.expertStdDev ?? 0, 18) * 0.45;

  return Number(Math.max(35, base + valueSignal - volatilityPenalty).toFixed(2));
}

function buildEstimatedStats(
  position: PlayerPosition,
  medianPoints: number,
  positionRank: number,
): StatProjection {
  switch (position) {
    case "QB": {
      const rushingBias = Math.max(0.08, 0.18 - Math.min(positionRank, 24) * 0.003);
      const rushingPoints = medianPoints * rushingBias;
      const passingPoints = medianPoints - rushingPoints;
      const passingTouchdowns = Number(Math.max(18, 36 - positionRank * 0.45).toFixed(1));
      const interceptions = Number((7 + Math.min(positionRank, 24) * 0.28).toFixed(1));
      const rushingTouchdowns = Number(Math.max(1, 6 - positionRank * 0.12).toFixed(1));
      const rushingYards = Number(
        Math.max(120, rushingPoints * 8.5 - rushingTouchdowns * 38).toFixed(1),
      );
      const passingYards = Number(
        Math.max(
          2800,
          (passingPoints - passingTouchdowns * 6 + interceptions) * 25,
        ).toFixed(1),
      );
      return {
        passingYards,
        passingTouchdowns,
        interceptions,
        rushingYards,
        rushingTouchdowns,
        fumblesLost: 3,
      };
    }
    case "RB": {
      const receptions = Number(Math.max(16, 72 - positionRank * 0.85).toFixed(1));
      const receivingTouchdowns = Number(Math.max(0.8, 4.5 - positionRank * 0.07).toFixed(1));
      const rushingTouchdowns = Number(Math.max(2, 13 - positionRank * 0.18).toFixed(1));
      const receivingYards = Number(Math.max(140, receptions * 8.1).toFixed(1));
      const rushingYards = Number(
        Math.max(
          320,
          (medianPoints - receptions - receivingYards / 10 - receivingTouchdowns * 6 - rushingTouchdowns * 6 + 2) * 10,
        ).toFixed(1),
      );
      return {
        receptions,
        receivingYards,
        receivingTouchdowns,
        rushingYards,
        rushingTouchdowns,
        fumblesLost: 1.5,
      };
    }
    case "WR": {
      const receptions = Number(Math.max(38, 112 - positionRank * 0.82).toFixed(1));
      const receivingTouchdowns = Number(Math.max(2.2, 10.5 - positionRank * 0.12).toFixed(1));
      const rushingYards = Number(Math.max(0, 24 - positionRank * 0.6).toFixed(1));
      const rushingTouchdowns = rushingYards >= 10 ? 0.2 : 0;
      const receivingYards = Number(
        Math.max(
          460,
          (medianPoints - receptions - receivingTouchdowns * 6 - rushingYards / 10 - rushingTouchdowns * 6 + 1) * 10,
        ).toFixed(1),
      );
      return {
        receptions,
        receivingYards,
        receivingTouchdowns,
        rushingYards,
        rushingTouchdowns,
        fumblesLost: 1,
      };
    }
    case "TE":
    default: {
      const receptions = Number(Math.max(28, 92 - positionRank * 1.55).toFixed(1));
      const receivingTouchdowns = Number(Math.max(1.5, 8 - positionRank * 0.22).toFixed(1));
      const receivingYards = Number(
        Math.max(
          320,
          (medianPoints - receptions - receivingTouchdowns * 6 + 1) * 10,
        ).toFixed(1),
      );
      return {
        receptions,
        receivingYards,
        receivingTouchdowns,
        fumblesLost: 0.8,
      };
    }
  }
}

export function tuneStatsToTarget(
  position: PlayerPosition,
  stats: StatProjection,
  targetPoints: number,
) {
  const current = scoreStatProjection(stats, yahooLeagueRules);
  if (Math.abs(targetPoints - current) < 0.2 || current <= 0) {
    return stats;
  }

  const scalableByPosition: Record<PlayerPosition, Array<keyof StatProjection>> = {
    QB: ["passingYards", "passingTouchdowns", "rushingYards", "rushingTouchdowns"],
    RB: ["rushingYards", "rushingTouchdowns", "receptions", "receivingYards", "receivingTouchdowns"],
    WR: ["rushingYards", "rushingTouchdowns", "receptions", "receivingYards", "receivingTouchdowns"],
    TE: ["receptions", "receivingYards", "receivingTouchdowns"],
    K: [],
    DST: [],
  };
  const keys = scalableByPosition[position];
  if (keys.length === 0) return stats;

  const fixedStats = { ...stats };
  for (const key of keys) delete fixedStats[key];
  const fixedPoints = scoreStatProjection(fixedStats, yahooLeagueRules, {
    explicitMilestoneGamesOnly: true,
  });
  const scalablePoints = scoreStatProjection(stats, yahooLeagueRules, {
    explicitMilestoneGamesOnly: true,
  }) - fixedPoints;
  if (scalablePoints <= 0) return stats;

  // Preserve the internal football shape of the estimate (YPR, TD rates and
  // rushing/receiving split) while reconciling it to the market point target.
  // Adjusting only yards made low-ranked receivers mathematically impossible.
  const initialBonus = current - scoreStatProjection(stats, yahooLeagueRules, {
    explicitMilestoneGamesOnly: true,
  });
  const factor = Math.max(0, (targetPoints - fixedPoints - initialBonus) / scalablePoints);
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === "number") {
      stats[key] = Number((value * factor).toFixed(2));
    }
  }

  // A proportional move can cross a legacy milestone-bonus boundary. Reconcile
  // once more after that discrete bonus is known without changing any ratios.
  const reconciled = scoreStatProjection(stats, yahooLeagueRules);
  if (Math.abs(reconciled - targetPoints) >= 0.2) {
    const strictPoints = scoreStatProjection(stats, yahooLeagueRules, {
      explicitMilestoneGamesOnly: true,
    });
    const bonus = reconciled - strictPoints;
    const nextFactor = Math.max(0, (targetPoints - fixedPoints - bonus) / (strictPoints - fixedPoints));
    for (const key of keys) {
      const value = stats[key];
      if (typeof value === "number") stats[key] = Number((value * nextFactor).toFixed(2));
    }
  }

  return stats;
}

function estimateRange(
  position: PlayerPosition,
  medianPoints: number,
  expertStdDev?: number,
): ProjectionSnapshot["range"] {
  const baseSpreadByPosition: Record<PlayerPosition, number> = {
    QB: 28,
    RB: 38,
    WR: 35,
    TE: 27,
    K: 18,
    DST: 16,
  };
  const spread = Math.max(baseSpreadByPosition[position], (expertStdDev ?? 0) * 5);

  return {
    p10: Number(Math.max(0, medianPoints - spread).toFixed(2)),
    p50: Number(medianPoints.toFixed(2)),
    p90: Number((medianPoints + spread * 1.08).toFixed(2)),
  };
}

function buildProjection(
  playerId: string,
  position: PlayerPosition,
  positionRank: number,
  market: MarketSnapshot,
): ProjectionSnapshot {
  const medianPoints = estimateMedianPoints(position, positionRank, market);
  const stats = tuneStatsToTarget(
    position,
    buildEstimatedStats(position, medianPoints, positionRank),
    medianPoints,
  );

  return {
    season: 2026,
    provider: "fantasypros",
    scoringType: "PPR",
    asOf: new Date().toISOString(),
    playerId,
    stats,
    range: estimateRange(position, medianPoints, market.expertStdDev),
  };
}

function parseAdpMapFromHtml(html: string) {
  const data = extractJsonObjectAfterMarker(html, "window.FP.reportConfig = ");
  const table = asRecord(data.table);
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const adpByPlayerId = new Map<string, number>();

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }

    const playerId = readString(record.id);
    const adp = readNumber(record.avg, record.realtime, record.rank);
    if (!playerId || adp === undefined) {
      continue;
    }

    adpByPlayerId.set(playerId, adp);
  }

  return adpByPlayerId;
}

function parsePublicBoardSeeds(rankingsHtml: string, adpHtml?: string) {
  const ecrData = extractJsonObjectAfterMarker(rankingsHtml, "var ecrData = ");
  const players = Array.isArray(ecrData.players) ? ecrData.players : [];
  const directAdpByPlayerId = adpHtml ? parseAdpMapFromHtml(adpHtml) : new Map<string, number>();

  const seeds: PublicBoardSeed[] = [];
  const positionFallbackRank = new Map<PlayerPosition, number>();
  let directAdpCount = 0;

  for (const row of players) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }

    const playerId = readString(record.player_id, record.id, record.fpid);
    const fullName = readString(record.player_name, record.name, record.full_name);
    const team = readString(record.player_team_id, record.team_id, record.team);
    const position = normalizePosition(record.player_position_id ?? record.position_id ?? record.position);
    if (!playerId || !fullName || !team || !position) {
      continue;
    }

    const ecr = readNumber(record.rank_ecr, record.ecr, record.rank);
    if (ecr === undefined) {
      continue;
    }

    const parsedPositionRank = parsePositionRank(record.pos_rank);
    const fallbackPositionRank = (positionFallbackRank.get(position) ?? 0) + 1;
    positionFallbackRank.set(position, fallbackPositionRank);
    const positionRank = parsedPositionRank ?? fallbackPositionRank;

    const directAdp = directAdpByPlayerId.get(playerId);
    if (directAdp !== undefined) {
      directAdpCount += 1;
    }

    seeds.push({
      playerId,
      record: {
        provider: "fantasypros",
        providerPlayerId: playerId,
        fullName,
        team,
        positions: [position],
        rookie: Boolean(record.is_rookie ?? record.rookie),
        age: readNumber(record.age),
        externalIds: {
          fantasyPros: playerId,
        },
      },
      market: {
        adp: directAdp ?? readNumber(record.adp, record.rank_ave, record.avg, ecr) ?? ecr,
        adpSource: directAdp !== undefined ? "direct" : "rank-proxy",
        adpProvider: "fantasypros",
        ecr,
        ecrProvider: "fantasypros",
        tier: readNumber(record.tier, record.player_tier) ?? Math.max(1, Math.ceil(ecr / 12)),
        expertStdDev: readNumber(record.rank_std, record.rank_std_dev, record.expert_std_dev),
      },
      positionRank,
    });
  }

  return {
    seeds,
    directAdpCount,
  };
}

export function buildFantasyProsPublicDraftCandidatesFromHtml(
  rankingsHtml: string,
  adpHtml?: string,
): FantasyProsPublicDraftSource {
  const { seeds, directAdpCount } = parsePublicBoardSeeds(rankingsHtml, adpHtml);
  const canonicalPlayers = buildCanonicalPlayers(seeds.map((seed) => seed.record));
  const marketByPlayerId = new Map<string, MarketSnapshot>();
  const projectionByPlayerId = new Map<string, ProjectionSnapshot>();

  for (const seed of seeds) {
    marketByPlayerId.set(seed.playerId, seed.market);
    projectionByPlayerId.set(
      seed.playerId,
      buildProjection(seed.playerId, seed.record.positions[0] ?? "WR", seed.positionRank, seed.market),
    );
  }

  const candidates = canonicalPlayers
    .map((player) => {
      const fantasyProsId = player.externalIds.fantasyPros;
      if (!fantasyProsId) {
        return null;
      }

      const market = marketByPlayerId.get(fantasyProsId);
      const projection = projectionByPlayerId.get(fantasyProsId);
      if (!market || !projection) {
        return null;
      }

      return {
        player,
        market,
        projection,
      } satisfies DraftCandidate;
    })
    .filter((candidate): candidate is DraftCandidate => candidate !== null)
    .sort((a, b) => a.market.ecr - b.market.ecr);

  return {
    candidates,
    directAdpCount,
    proxiedAdpCount: Math.max(0, candidates.length - directAdpCount),
  };
}

async function fetchFantasyProsPublicPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FantasyPros public page failed (${response.status} ${response.statusText}).`);
  }

  return response.text();
}

export async function fetchFantasyProsPublicDraftCandidates() {
  const [rankingsHtml, adpResult] = await Promise.all([
    fetchFantasyProsPublicPage(PUBLIC_ECR_URL),
    fetchFantasyProsPublicPage(PUBLIC_ADP_URL).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
  ]);

  return buildFantasyProsPublicDraftCandidatesFromHtml(
    rankingsHtml,
    adpResult.ok ? adpResult.value : undefined,
  );
}
