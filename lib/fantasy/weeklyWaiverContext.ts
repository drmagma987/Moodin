export type WeeklyWaiverExpertSignal = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  sourceCount?: 1 | 2;
  rotoballer?: {
    standard: string;
    aggressive: string;
    desperation?: string;
  };
  fantasyPros?: {
    rank: number;
    rankLow: number;
    rankHigh: number;
  };
  opportunity: string;
  primaryRisk: string;
};

export const weeklyWaiverContext = {
  season: 2026,
  week: 3,
  checkedAt: "2026-09-21T11:30:00-04:00",
  sources: {
    rotoballer: {
      label: "PFF Week 3 waiver targets",
      url: "https://www.pff.com/news/fantasy-football-waiver-wire-targets-2026",
      publishedAt: "2026-09-21",
    },
    fantasyPros: {
      label: "FantasyPros Week 3 waiver advice",
      url: "https://www.fantasypros.com/2026/09/fantasy-football-waiver-wire-advice-players-to-add-stash-drop-week-3-2026/",
      updatedAt: "2026-09-21",
    },
  },
  signals: [
    {
      playerName: "Jonah Coleman", position: "RB", sourceCount: 2,
      opportunity: "Ten carries, three targets, a touchdown, and the stronger post-injury snap role put Coleman at the front of Denver's uncertain backfield for Week 3.",
      primaryRisk: "J.K. Dobbins and RJ Harvey can both compress the role if their hamstring injuries clear quickly.",
    },
    {
      playerName: "Denzel Boston", position: "WR", sourceCount: 2,
      opportunity: "Boston stayed in Cleveland's lead-receiver role and converted the Week 2 volume into a breakout fantasy result.",
      primaryRisk: "Cleveland's passing environment can still make a rookie WR1 volatile even when the route share is secure.",
    },
    {
      playerName: "Tyler Shough", position: "QB", sourceCount: 2,
      opportunity: "Back-to-back 22-plus point games, high passing volume, and three upcoming home dates make Shough a legitimate streaming option.",
      primaryRisk: "Quarterback is replaceable in a one-QB league, so he should not outrank a scarce RB or WR role.",
    },
    {
      playerName: "Adonai Mitchell", position: "WR", sourceCount: 1,
      opportunity: "A team-high 12 targets in Week 2 followed a productive opener and strengthens his claim as the Jets' No. 2 receiver.",
      primaryRisk: "The role sits behind Garrett Wilson and remains attached to a passing offense with a modest weekly ceiling.",
    },
    {
      playerName: "Dalton Schultz", position: "TE", sourceCount: 2,
      opportunity: "Two weeks of usable involvement have returned Schultz to the streaming tier at a position with few bankable routes.",
      primaryRisk: "Houston's target tree can rotate behind its lead wideouts, leaving a touchdown-sensitive ceiling.",
    },
    {
      playerName: "Keon Coleman", position: "WR", sourceCount: 1,
      opportunity: "Coleman's Week 2 involvement keeps him live as a high-leverage outside receiver in Buffalo's productive offense.",
      primaryRisk: "The Bills can spread low-volume passing production across several targets from week to week.",
    },
    {
      playerName: "Kaleb Johnson", position: "RB", sourceCount: 2,
      opportunity: "Johnson earned more late work after MarShawn Lloyd's fumble and offers contingent value while Josh Jacobs is unavailable.",
      primaryRisk: "A 3.2-point Week 2 and an unsettled Green Bay rotation make this a stash, not a proven starter.",
    },
    {
      playerName: "Darren Waller", position: "TE", sourceCount: 1,
      opportunity: "Five catches through two games and repeated red-zone usage, including two Week 2 scores, create immediate tight-end streaming appeal.",
      primaryRisk: "The touchdown rate is unsustainable and the five total targets leave a thin floor.",
    },
    {
      playerName: "Bryce Young", position: "QB", sourceCount: 2,
      opportunity: "Young followed his opener with another useful fantasy result and remains widely available as a matchup streamer.",
      primaryRisk: "His history of uneven efficiency makes him a weekly matchup play rather than a set-and-forget starter.",
    },
  ] satisfies WeeklyWaiverExpertSignal[],
} as const;

export function weeklyWaiverContextStatus(now = Date.now()) {
  const checkedAt = Date.parse(weeklyWaiverContext.checkedAt);
  const age = now - checkedAt;
  const current = Number.isFinite(checkedAt) && age >= -86_400_000 && age <= 7 * 86_400_000;
  return {
    current,
    checkedAt: weeklyWaiverContext.checkedAt,
    message: current
      ? `Week ${weeklyWaiverContext.week} sources verified ${new Date(checkedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
      : `Week ${weeklyWaiverContext.week} external waiver sources are stale or unavailable; their ranks and FAAB ranges are excluded.`,
  };
}

export function getWeeklyWaiverExpertSignal(playerName: string, now = Date.now()) {
  if (!weeklyWaiverContextStatus(now).current) return undefined;
  return weeklyWaiverContext.signals.find((signal) => signal.playerName === playerName) as WeeklyWaiverExpertSignal | undefined;
}
