import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

/**
 * Current decision boundary for live in-season evidence.
 *
 * Keep an unfinished prime-time game explicit: an absent player row from a
 * team that has not played is unknown, never a zero or a role loss.
 */
export const activeWeeklySlate = {
  season: leagueSourceOfTruth.season,
  week: 4,
  completedGames: 16,
  scheduledGames: 16,
  capturedAt: "2026-10-06T09:30:00-04:00",
  latestGame: "Week 4 complete · 16 of 16 games final",
  evidenceWeight: 0.3,
  pendingTeams: [],
  sources: [
    {
      label: "nflverse 2026 Week 4 player stats",
      url: "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
    },
    {
      label: "NFL Week 4 final schedule",
      url: "https://www.nfl.com/schedules/2026/by-week/week-4",
    },
  ],
} as const;
