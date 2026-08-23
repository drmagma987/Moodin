import { scoreStatProjection, yahooLeagueConfig } from "@/lib/fantasy/scoring";
import type { DraftCandidate, PlayerPosition, StatProjection } from "@/lib/fantasy/types";

const POSITIONS: Array<Extract<PlayerPosition, "QB" | "RB" | "WR" | "TE">> = ["QB", "RB", "WR", "TE"];
const MINIMUM_ROWS: Record<(typeof POSITIONS)[number], number> = {
  QB: 10,
  RB: 10,
  WR: 10,
  TE: 10,
};

export type FantasyProsPublicProjectionRow = {
  fantasyProsId: string;
  name: string;
  team: string;
  position: (typeof POSITIONS)[number];
  stats: StatProjection;
  pprPoints: number;
};

function readNumber(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowStats(position: FantasyProsPublicProjectionRow["position"], values: number[]): StatProjection {
  if (position === "QB") {
    return {
      passingYards: values[2],
      passingTouchdowns: values[3],
      interceptions: values[4],
      rushingYards: values[6],
      rushingTouchdowns: values[7],
      fumblesLost: values[8],
    };
  }
  if (position === "RB") {
    return {
      rushingYards: values[1],
      rushingTouchdowns: values[2],
      receptions: values[3],
      receivingYards: values[4],
      receivingTouchdowns: values[5],
      fumblesLost: values[6],
    };
  }
  if (position === "WR") {
    return {
      receptions: values[0],
      receivingYards: values[1],
      receivingTouchdowns: values[2],
      rushingYards: values[4],
      rushingTouchdowns: values[5],
      fumblesLost: values[6],
    };
  }
  return {
    receptions: values[0],
    receivingYards: values[1],
    receivingTouchdowns: values[2],
    fumblesLost: values[3],
  };
}

export function parseFantasyProsPublicProjectionHtml(
  html: string,
  position: FantasyProsPublicProjectionRow["position"],
) {
  const rows: FantasyProsPublicProjectionRow[] = [];
  const rowPattern = /<tr class="mpb-player-(\d+)[\s\S]*?<a[^>]*fp-player-name="([^"]+)"[^>]*>[^<]+<\/a>\s*([A-Z]{2,3})<\/td>([\s\S]*?)<\/tr>/g;
  for (const match of html.matchAll(rowPattern)) {
    const values = Array.from(match[4].matchAll(/<td class="center"[^>]*>([^<]+)<\/td>/g)).map((cell) => readNumber(cell[1]));
    const expectedCells = position === "QB" ? 10 : position === "RB" || position === "WR" ? 8 : 5;
    if (values.length < expectedCells) continue;
    rows.push({
      fantasyProsId: match[1],
      name: match[2],
      team: match[3],
      position,
      stats: rowStats(position, values),
      pprPoints: values[values.length - 1],
    });
  }
  if (rows.length < MINIMUM_ROWS[position]) {
    throw new Error(`FantasyPros public ${position} projections returned ${rows.length} rows; expected at least ${MINIMUM_ROWS[position]}.`);
  }
  return rows;
}

export function applyFantasyProsPublicProjections(
  candidates: DraftCandidate[],
  rows: FantasyProsPublicProjectionRow[],
) {
  const byId = new Map(rows.map((row) => [row.fantasyProsId, row] as const));
  let appliedCount = 0;
  const nextCandidates = candidates.map((candidate) => {
    const id = candidate.player.externalIds.fantasyPros;
    const row = id ? byId.get(id) : undefined;
    if (!row || candidate.player.positions[0] !== row.position) return candidate;
    appliedCount += 1;
    const exactYahooPoints = Number(scoreStatProjection(row.stats, yahooLeagueConfig.scoring).toFixed(2));
    const downsideSpread = Math.max(18, candidate.projection.range.p50 - candidate.projection.range.p10);
    const upsideSpread = Math.max(20, candidate.projection.range.p90 - candidate.projection.range.p50);
    return {
      ...candidate,
      projection: {
        ...candidate.projection,
        provider: "fantasypros",
        scoringType: "YAHOO-CUSTOM",
        asOf: new Date().toISOString(),
        stats: row.stats,
        range: {
          p10: Number(Math.max(0, exactYahooPoints - downsideSpread).toFixed(2)),
          p50: exactYahooPoints,
          p90: Number((exactYahooPoints + upsideSpread).toFixed(2)),
        },
      },
    } satisfies DraftCandidate;
  });
  return { candidates: nextCandidates, appliedCount };
}

export async function fetchFantasyProsPublicProjections() {
  const pages = await Promise.all(
    POSITIONS.map(async (position) => {
      const response = await fetch(
        `https://www.fantasypros.com/nfl/projections/${position.toLowerCase()}.php?scoring=PPR&week=draft`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`FantasyPros public ${position} projections failed (${response.status}).`);
      return parseFantasyProsPublicProjectionHtml(await response.text(), position);
    }),
  );
  return pages.flat();
}
