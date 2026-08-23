import { parseCsv } from "@/lib/fantasy/csv";
import type { PlayerPosition } from "@/lib/fantasy/types";
import { nflMilestones2025 } from "@/lib/fantasy/data/nflMilestones2025.generated";

const NFLVERSE_PLAYER_STATS_BASE =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player";

export type NflversePlayerSeasonStats = {
  playerId: string;
  playerName: string;
  team: string;
  position: PlayerPosition;
  games: number;
  attempts: number;
  sacksSuffered?: number;
  carries: number;
  targets: number;
  receptions: number;
  passingYards: number;
  rushingYards: number;
  receivingYards: number;
  passingTouchdowns: number;
  passingEpa?: number;
  passingCpoe?: number;
  rushingTouchdowns: number;
  receivingTouchdowns: number;
  targetShare: number;
  airYardsShare: number;
  fantasyPointsPpr: number;
  passing300Games?: number;
  rushing100Games?: number;
  receiving100Games?: number;
};

function readNumber(value: string | undefined) {
  if (!value || value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPosition(value: string | undefined): PlayerPosition | null {
  if (!value) {
    return null;
  }

  const position = value.trim().toUpperCase();
  if (position === "QB" || position === "RB" || position === "WR" || position === "TE") {
    return position;
  }
  if (position === "K" || position === "PK") {
    return "K";
  }
  return null;
}

export async function fetchNflverseSeasonStats(season = 2025) {
  const response = await fetch(`${NFLVERSE_PLAYER_STATS_BASE}/stats_player_reg_${season}.csv`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `nflverse player stats request failed (${response.status} ${response.statusText}).`,
    );
  }

  const rows = parseCsv(await response.text());
  const stats = new Map<string, NflversePlayerSeasonStats>();

  for (const row of rows) {
    const position = asPosition(row.position);
    const playerId = row.player_id;
    const playerName = row.player_display_name || row.player_name;
    const team = row.recent_team;

    if (!position || !playerId || !playerName || !team) {
      continue;
    }

    stats.set(playerId, {
      playerId,
      playerName,
      team,
      position,
      games: readNumber(row.games),
      attempts: readNumber(row.attempts),
      sacksSuffered: readNumber(row.sacks_suffered),
      carries: readNumber(row.carries),
      targets: readNumber(row.targets),
      receptions: readNumber(row.receptions),
      passingYards: readNumber(row.passing_yards),
      rushingYards: readNumber(row.rushing_yards),
      receivingYards: readNumber(row.receiving_yards),
      passingTouchdowns: readNumber(row.passing_tds),
      passingEpa: readNumber(row.passing_epa),
      passingCpoe: readNumber(row.passing_cpoe),
      rushingTouchdowns: readNumber(row.rushing_tds),
      receivingTouchdowns: readNumber(row.receiving_tds),
      targetShare: readNumber(row.target_share),
      airYardsShare: readNumber(row.air_yards_share),
      fantasyPointsPpr: readNumber(row.fantasy_points_ppr),
    });
  }

  if (season === 2025) {
    for (const [playerId, milestone] of Object.entries(nflMilestones2025)) {
      const current = stats.get(playerId);
      if (!current) continue;
      current.passing300Games = milestone.passing300Games;
      current.rushing100Games = milestone.rushing100Games;
      current.receiving100Games = milestone.receiving100Games;
    }
  }

  return stats;
}
