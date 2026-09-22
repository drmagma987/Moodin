export type WeeklyWaiverExpertSignal = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  sourceCount?: 1 | 2;
  rotoballer?: {
    rank: number;
    move: string;
  };
  fantasyPros?: {
    rank: number;
    trueValue: number;
    budget: number;
    desperate: number;
  };
  opportunity: string;
  primaryRisk: string;
};

export const weeklyWaiverContext = {
  season: 2026,
  week: 3,
  checkedAt: "2026-09-22T12:30:00-04:00",
  sources: {
    rotoballer: {
      label: "RotoBaller Week 3 waiver rankings",
      url: "https://www.rotoballer.com/waiver-wire-rankings-fantasy-football-week-3-2026/1946337",
      publishedAt: "2026-09-22",
    },
    fantasyPros: {
      label: "FantasyPros Week 3 PPR waiver rankings and FAAB",
      url: "https://www.fantasypros.com/2026/09/fantasy-football-waiver-wire-rankings-pickups-week-3-2026/",
      updatedAt: "2026-09-22",
    },
  },
  signals: [
    {
      playerName: "Jonah Coleman", position: "RB", sourceCount: 2,
      rotoballer: { rank: 1, move: "Add in all leagues" },
      fantasyPros: { rank: 1, trueValue: 16, budget: 8, desperate: 29 },
      opportunity: "Ten carries, three targets, a touchdown, and the stronger post-injury snap role put Coleman at the front of Denver's uncertain backfield for Week 3.",
      primaryRisk: "J.K. Dobbins and RJ Harvey can both compress the role if their hamstring injuries clear quickly.",
    },
    {
      playerName: "Denzel Boston", position: "WR", sourceCount: 2,
      rotoballer: { rank: 3, move: "Add in 10+ team leagues" },
      fantasyPros: { rank: 2, trueValue: 10, budget: 5, desperate: 20 },
      opportunity: "Boston stayed in Cleveland's lead-receiver role and converted the Week 2 volume into a breakout fantasy result.",
      primaryRisk: "Cleveland's passing environment can still make a rookie WR1 volatile even when the route share is secure.",
    },
    {
      playerName: "Tyler Shough", position: "QB", sourceCount: 2,
      rotoballer: { rank: 62, move: "Add in 12+ team leagues" },
      opportunity: "Back-to-back 22-plus point games, high passing volume, and three upcoming home dates make Shough a legitimate streaming option.",
      primaryRisk: "Quarterback is replaceable in a one-QB league, so he should not outrank a scarce RB or WR role.",
    },
    {
      playerName: "Adonai Mitchell", position: "WR", sourceCount: 1,
      rotoballer: { rank: 20, move: "Add in 12+ team leagues" },
      opportunity: "A team-high 12 targets in Week 2 followed a productive opener and strengthens his claim as the Jets' No. 2 receiver.",
      primaryRisk: "The role sits behind Garrett Wilson and remains attached to a passing offense with a modest weekly ceiling.",
    },
    {
      playerName: "Dalton Schultz", position: "TE", sourceCount: 2,
      rotoballer: { rank: 2, move: "Add in all leagues" },
      opportunity: "Two weeks of usable involvement have returned Schultz to the streaming tier at a position with few bankable routes.",
      primaryRisk: "Houston's target tree can rotate behind its lead wideouts, leaving a touchdown-sensitive ceiling.",
    },
    {
      playerName: "Keon Coleman", position: "WR", sourceCount: 1,
      rotoballer: { rank: 21, move: "Add in 12+ team leagues" },
      opportunity: "Coleman's Week 2 involvement keeps him live as a high-leverage outside receiver in Buffalo's productive offense.",
      primaryRisk: "The Bills can spread low-volume passing production across several targets from week to week.",
    },
    {
      playerName: "Kaleb Johnson", position: "RB", sourceCount: 2,
      rotoballer: { rank: 53, move: "Add in 14+ team leagues" },
      opportunity: "Johnson earned more late work after MarShawn Lloyd's fumble and offers contingent value while Josh Jacobs is unavailable.",
      primaryRisk: "A 3.2-point Week 2 and an unsettled Green Bay rotation make this a stash, not a proven starter.",
    },
    {
      playerName: "Darren Waller", position: "TE", sourceCount: 1,
      rotoballer: { rank: 24, move: "Add in 12+ team leagues" },
      opportunity: "Five catches through two games and repeated red-zone usage, including two Week 2 scores, create immediate tight-end streaming appeal.",
      primaryRisk: "The touchdown rate is unsustainable and the five total targets leave a thin floor.",
    },
    {
      playerName: "Bryce Young", position: "QB", sourceCount: 2,
      rotoballer: { rank: 63, move: "Add in 12+ team leagues" },
      fantasyPros: { rank: 4, trueValue: 1, budget: 0, desperate: 2 },
      opportunity: "Young followed his opener with another useful fantasy result and remains widely available as a matchup streamer.",
      primaryRisk: "His history of uneven efficiency makes him a weekly matchup play rather than a set-and-forget starter.",
    },
  ] satisfies WeeklyWaiverExpertSignal[],
} as const;

export type WeeklyWaiverMarketRow = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  rotoballerRank: number;
  rotoballerMove: string;
  fantasyProsPprRank?: number;
  fantasyProsTrueValue?: number;
  fantasyProsBudget?: number;
  fantasyProsDesperate?: number;
};

const rotoballerRows: WeeklyWaiverMarketRow[] = [
  { playerName: "Jonah Coleman", position: "RB", rotoballerRank: 1, rotoballerMove: "Add in all leagues", fantasyProsPprRank: 1, fantasyProsTrueValue: 16, fantasyProsBudget: 8, fantasyProsDesperate: 29 },
  { playerName: "Dalton Schultz", position: "TE", rotoballerRank: 2, rotoballerMove: "Add in all leagues" },
  { playerName: "Denzel Boston", position: "WR", rotoballerRank: 3, rotoballerMove: "Add in 10+ team leagues", fantasyProsPprRank: 2, fantasyProsTrueValue: 10, fantasyProsBudget: 5, fantasyProsDesperate: 20 },
  { playerName: "Emanuel Wilson", position: "RB", rotoballerRank: 4, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Devaughn Vele", position: "WR", rotoballerRank: 5, rotoballerMove: "Add in 10+ team PPR leagues" },
  { playerName: "Romeo Doubs", position: "WR", rotoballerRank: 6, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Tank Bigsby", position: "RB", rotoballerRank: 7, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Kaelon Black", position: "RB", rotoballerRank: 8, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Emmett Johnson", position: "RB", rotoballerRank: 9, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Tyler Allgeier", position: "RB", rotoballerRank: 10, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Tre Tucker", position: "WR", rotoballerRank: 11, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Khalil Shakir", position: "WR", rotoballerRank: 12, rotoballerMove: "Add in 12+ team PPR leagues" },
  { playerName: "Tyjae Spears", position: "RB", rotoballerRank: 13, rotoballerMove: "Add in 12+ team PPR leagues" },
  { playerName: "Xavier Worthy", position: "WR", rotoballerRank: 14, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Keenan Allen", position: "WR", rotoballerRank: 15, rotoballerMove: "Add in 12+ team PPR leagues" },
  { playerName: "Dontayvion Wicks", position: "WR", rotoballerRank: 16, rotoballerMove: "Add in 12+ team leagues", fantasyProsPprRank: 3, fantasyProsTrueValue: 2, fantasyProsBudget: 1, fantasyProsDesperate: 4 },
  { playerName: "Rashod Bateman", position: "WR", rotoballerRank: 17, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Mike Washington Jr.", position: "RB", rotoballerRank: 18, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Brenton Strange", position: "TE", rotoballerRank: 19, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Adonai Mitchell", position: "WR", rotoballerRank: 20, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Keon Coleman", position: "WR", rotoballerRank: 21, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Bryce Young", position: "QB", rotoballerRank: 63, rotoballerMove: "Add in 12+ team leagues", fantasyProsPprRank: 4, fantasyProsTrueValue: 1, fantasyProsBudget: 0, fantasyProsDesperate: 2 },
];

export const weeklyWaiverMarketRows = rotoballerRows;

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
