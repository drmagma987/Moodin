import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

/**
 * Current decision boundary for live in-season evidence.
 *
 * Keep an unfinished prime-time game explicit: an absent player row from a
 * team that has not played is unknown, never a zero or a role loss.
 */
export const activeWeeklySlate = {
  season: leagueSourceOfTruth.season,
  week: 2,
  completedGames: 16,
  scheduledGames: 16,
  capturedAt: "2026-09-22T11:00:00-04:00",
  latestGame: "Week 2 complete · all 16 games final",
  evidenceWeight: 0.22,
  pendingTeams: [],
  sources: [
    {
      label: "nflverse 2026 weekly player stats",
      url: "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
    },
    {
      label: "NFL Week 2 schedule",
      url: "https://www.nfl.com/schedules/2026/by-week/week-2",
    },
  ],
} as const;
