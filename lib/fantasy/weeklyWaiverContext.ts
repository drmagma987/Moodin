export type WeeklyWaiverExpertSignal = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  sourceCount?: 1 | 2 | 3;
  cbs?: { rank: number; move: string; budget: string };
  fantasyPros?: { rank: number; trueValue: number; budget: number; desperate: number };
  nflRank?: number;
  opportunity: string;
  primaryRisk: string;
};

export const weeklyWaiverContext = {
  season: 2026,
  week: 6,
  byeTeams: ["CIN", "DET", "MIA", "MIN"],
  checkedAt: "2026-10-13T15:30:00-04:00",
  sources: {
    cbs: {
      label: "CBS Sports Week 6 waiver priorities",
      url: "https://www.cbssports.com/fantasy/football/news/fantasy-football-week-6-2026-waiver-wire/",
      updatedAt: "2026-10-13",
    },
    fantasyPros: {
      label: "FantasyPros Week 6 PPR waiver advice and FAAB",
      url: "https://www.fantasypros.com/2026/10/fantasy-football-waiver-wire-advice-players-to-add-stash-drop-week-6-2026/",
      updatedAt: "2026-10-13",
    },
    nfl: {
      label: "NFL Fantasy Week 6 waiver targets",
      url: "https://www.nfl.com/news/2026-nfl-fantasy-football-waiver-wire-week-6-rb-woody-marks-te-brenton-strange-among-targets",
      updatedAt: "2026-10-12",
    },
  },
  signals: [
    {
      playerName: "Zach Charbonnet", position: "RB", sourceCount: 1, nflRank: 1,
      opportunity: "Seattle can return Charbonnet directly to a starting role with a low-end RB2 floor and touchdown-driven upside.",
      primaryRisk: "He is still returning from PUP, and the current Yahoo snapshot shows Peyton and Brady place already rosters him.",
    },
    {
      playerName: "Woody Marks", position: "RB", sourceCount: 2,
      cbs: { rank: 1, move: "Add in all leagues", budget: "20%+" }, nflRank: 3,
      opportunity: "David Montgomery is week to week with a groin injury, leaving Marks as Houston's primary back after four straight games with at least 8.2 PPR points.",
      primaryRisk: "The Week 6 Jacksonville matchup is difficult, and the current Yahoo snapshot shows Gabagool already rosters him.",
    },
    {
      playerName: "Dameon Pierce", position: "RB", sourceCount: 2,
      cbs: { rank: 2, move: "Priority injury replacement", budget: "Up to 10%" }, nflRank: 8,
      opportunity: "Will Shipley is expected to miss multiple weeks, so Pierce projects to start against Carolina if Saquon Barkley's hamstring keeps him out.",
      primaryRisk: "Barkley could return in Week 6, which would collapse Pierce's immediate workload after an inefficient 13-touch Week 5.",
    },
    {
      playerName: "Kendre Miller", position: "RB", sourceCount: 2,
      cbs: { rank: 3, move: "Immediate flex and depth add", budget: "5-10%" },
      fantasyPros: { rank: 1, trueValue: 4, budget: 2, desperate: 8 },
      opportunity: "Miller handled a season-high 10 carries and scored in Week 5 while Alvin Kamara played through a back issue and Travis Etienne remained on IR.",
      primaryRisk: "He played only 31% of snaps and remains part of a committee, so the usable floor depends on continued health issues ahead of him.",
    },
    {
      playerName: "Kimani Vidal", position: "RB", sourceCount: 1,
      cbs: { rank: 4, move: "Emerging-role add", budget: "3-5%" },
      opportunity: "Vidal led the Chargers backfield in Week 5 snaps and has produced at least 11.6 PPR points in consecutive games as his role has grown.",
      primaryRisk: "The Chargers are eight-point underdogs at Kansas City and have a Week 7 bye, lowering the short-term floor.",
    },
    {
      playerName: "Dylan Sampson", position: "RB", sourceCount: 1, nflRank: 11,
      opportunity: "Sampson remains one of the top widely available RB contingency targets and has an immediate home matchup with Baltimore.",
      primaryRisk: "Quinshon Judkins still leads Cleveland's backfield, leaving Sampson dependent on game script or an injury for bankable volume.",
    },
    {
      playerName: "Tyler Allgeier", position: "RB", sourceCount: 1,
      fantasyPros: { rank: 2, trueValue: 1, budget: 0, desperate: 2 },
      opportunity: "Allgeier remains one of fantasy's higher-value pure handcuffs and would inherit a major Arizona role if Jeremiyah Love misses time.",
      primaryRisk: "He is a bench stash rather than a dependable Week 6 starter while Love is active.",
    },
    {
      playerName: "Dontayvion Wicks", position: "WR", sourceCount: 1,
      fantasyPros: { rank: 1, trueValue: 2, budget: 1, desperate: 4 },
      opportunity: "Wicks has topped 60 yards in three of five games and drew eight Week 5 targets while DeVonta Smith remained out.",
      primaryRisk: "Smith's return would reduce Wicks to a secondary role, and the current Yahoo snapshot shows Juggalo All-Stars already rosters him.",
    },
  ] satisfies WeeklyWaiverExpertSignal[],
} as const;

export type WeeklyWaiverMarketRow = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  cbsRank?: number;
  cbsMove?: string;
  cbsFaab?: string;
  fantasyProsPprRank?: number;
  fantasyProsTrueValue?: number;
  fantasyProsBudget?: number;
  fantasyProsDesperate?: number;
  nflRank?: number;
};

export const weeklyWaiverMarketRows: WeeklyWaiverMarketRow[] = [
  { playerName: "Zach Charbonnet", position: "RB", nflRank: 1 },
  { playerName: "Woody Marks", position: "RB", cbsRank: 1, cbsMove: "Add in all leagues", cbsFaab: "20%+", nflRank: 3 },
  { playerName: "Dameon Pierce", position: "RB", cbsRank: 2, cbsMove: "Priority injury replacement", cbsFaab: "Up to 10%", nflRank: 8 },
  { playerName: "Kendre Miller", position: "RB", cbsRank: 3, cbsMove: "Immediate flex and depth add", cbsFaab: "5-10%", fantasyProsPprRank: 1, fantasyProsTrueValue: 4, fantasyProsBudget: 2, fantasyProsDesperate: 8 },
  { playerName: "Kimani Vidal", position: "RB", cbsRank: 4, cbsMove: "Emerging-role add", cbsFaab: "3-5%" },
  { playerName: "Dylan Sampson", position: "RB", nflRank: 11 },
  { playerName: "Tyler Allgeier", position: "RB", fantasyProsPprRank: 2, fantasyProsTrueValue: 1, fantasyProsBudget: 0, fantasyProsDesperate: 2 },
  { playerName: "Brenton Strange", position: "TE", nflRank: 2 },
  { playerName: "Keenan Allen", position: "WR", nflRank: 7 },
  { playerName: "Dontayvion Wicks", position: "WR", fantasyProsPprRank: 1, fantasyProsTrueValue: 2, fantasyProsBudget: 1, fantasyProsDesperate: 4 },
];

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
