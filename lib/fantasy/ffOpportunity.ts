import { parseCsv } from "@/lib/fantasy/csv";
import type { PlayerPosition } from "@/lib/fantasy/types";

const FF_OPPORTUNITY_BASE =
  "https://github.com/ffverse/ffopportunity/releases/download/latest-data";

export type FfOpportunitySeasonStats = {
  playerId: string;
  playerName: string;
  team: string;
  position: PlayerPosition;
  season: number;
  weeks: number;
  actualFantasyPoints: number;
  expectedFantasyPoints: number;
  actualTouchdowns: number;
  expectedTouchdowns: number;
  actualYards: number;
  expectedYards: number;
  weeklyActualVolatility: number;
  weeklyExpectedVolatility: number;
  weeklyConsistencyScore: number;
  evidenceSeasons: number[];
  currentSeasonWeeks: number;
  currentSeasonWeight: number;
};

type WeeklyAccumulator = Omit<
  FfOpportunitySeasonStats,
  | "weeks"
  | "weeklyActualVolatility"
  | "weeklyExpectedVolatility"
  | "weeklyConsistencyScore"
  | "evidenceSeasons"
  | "currentSeasonWeeks"
  | "currentSeasonWeight"
> & {
  actualByWeek: number[];
  expectedByWeek: number[];
};

function readNumber(value: string | undefined) {
  if (!value || value === "NA") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPosition(value: string | undefined): PlayerPosition | null {
  const position = value?.trim().toUpperCase();
  return position === "QB" || position === "RB" || position === "WR" || position === "TE"
    ? position
    : null;
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

export function buildFfOpportunitySeasonStatsFromCsv(csv: string) {
  const accumulators = new Map<string, WeeklyAccumulator>();

  for (const row of parseCsv(csv)) {
    const playerId = row.player_id;
    const playerName = row.full_name;
    const team = row.posteam;
    const position = asPosition(row.position);
    const season = readNumber(row.season);

    if (!playerId || playerId === "NA" || !playerName || playerName === "NA" || !team || !position) {
      continue;
    }

    const actualFantasyPoints = readNumber(row.total_fantasy_points);
    const expectedFantasyPoints = readNumber(row.total_fantasy_points_exp);
    const actualTouchdowns = readNumber(row.total_touchdown);
    const expectedTouchdowns = readNumber(row.total_touchdown_exp);
    const actualYards = readNumber(row.total_yards_gained);
    const expectedYards = readNumber(row.total_yards_gained_exp);
    const current = accumulators.get(playerId) ?? {
      playerId,
      playerName,
      team,
      position,
      season,
      actualFantasyPoints: 0,
      expectedFantasyPoints: 0,
      actualTouchdowns: 0,
      expectedTouchdowns: 0,
      actualYards: 0,
      expectedYards: 0,
      actualByWeek: [],
      expectedByWeek: [],
    };

    current.team = team;
    current.actualFantasyPoints += actualFantasyPoints;
    current.expectedFantasyPoints += expectedFantasyPoints;
    current.actualTouchdowns += actualTouchdowns;
    current.expectedTouchdowns += expectedTouchdowns;
    current.actualYards += actualYards;
    current.expectedYards += expectedYards;
    current.actualByWeek.push(actualFantasyPoints);
    current.expectedByWeek.push(expectedFantasyPoints);
    accumulators.set(playerId, current);
  }

  return new Map(
    [...accumulators.entries()].map(([playerId, stats]) => {
      const weeklyActualVolatility = standardDeviation(stats.actualByWeek);
      const weeklyExpectedVolatility = standardDeviation(stats.expectedByWeek);
      const weeklyConsistencyScore = Math.round(
        Math.min(96, Math.max(12, 94 - weeklyExpectedVolatility * 8.5)),
      );

      return [
        playerId,
        {
          playerId: stats.playerId,
          playerName: stats.playerName,
          team: stats.team,
          position: stats.position,
          season: stats.season,
          weeks: stats.expectedByWeek.length,
          actualFantasyPoints: rounded(stats.actualFantasyPoints),
          expectedFantasyPoints: rounded(stats.expectedFantasyPoints),
          actualTouchdowns: rounded(stats.actualTouchdowns),
          expectedTouchdowns: rounded(stats.expectedTouchdowns),
          actualYards: rounded(stats.actualYards),
          expectedYards: rounded(stats.expectedYards),
          weeklyActualVolatility: rounded(weeklyActualVolatility),
          weeklyExpectedVolatility: rounded(weeklyExpectedVolatility),
          weeklyConsistencyScore,
          evidenceSeasons: [stats.season],
          currentSeasonWeeks: stats.expectedByWeek.length,
          currentSeasonWeight: 1,
        } satisfies FfOpportunitySeasonStats,
      ] as const;
    }),
  );
}

export async function fetchFfOpportunitySeasonStats(season = 2025) {
  const response = await fetch(`${FF_OPPORTUNITY_BASE}/ep_weekly_${season}.csv`, {
    // This feed is larger than Next's 2 MB data-cache item limit. Attempting
    // to persist it blocks the server-rendered draft page before Next rejects
    // the cache write, so parse it in memory under the caller's timeout.
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(
      `ffopportunity request failed (${response.status} ${response.statusText}).`,
    );
  }

  return buildFfOpportunitySeasonStatsFromCsv(await response.text());
}
