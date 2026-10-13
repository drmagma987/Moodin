import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

/**
 * Current decision boundary for live in-season evidence.
 *
 * Keep an unfinished prime-time game explicit: an absent player row from a
 * team that has not played is unknown, never a zero or a role loss.
 */
export const activeWeeklySlate = {
  season: leagueSourceOfTruth.season,
  week: 5,
  completedGames: 15,
  scheduledGames: 15,
  capturedAt: "2026-10-13T15:15:00-04:00",
  latestGame: "Week 5 complete · 15 of 15 games final",
  evidenceWeight: 0.34,
  pendingTeams: [],
  sources: [
    {
      label: "nflverse 2026 Week 5 player stats",
      url: "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
    },
    {
      label: "NFL Week 5 final schedule",
      url: "https://www.nfl.com/schedules/2026/by-week/week-5",
    },
  ],
} as const;
