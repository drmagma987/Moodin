export type WeeklyWaiverExpertSignal = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  sourceCount?: 1 | 2 | 3;
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
  nflRank?: number;
  opportunity: string;
  primaryRisk: string;
};

export const weeklyWaiverContext = {
  season: 2026,
  week: 4,
  checkedAt: "2026-09-29T09:30:00-04:00",
  sources: {
    rotoballer: {
      label: "RotoBaller Week 4 waiver rankings",
      url: "https://www.rotoballer.com/waiver-wire-rankings-fantasy-football-week-4-2026/1952574",
      publishedAt: "2026-09-28",
    },
    fantasyPros: {
      label: "FantasyPros Week 4 PPR waiver rankings and FAAB",
      url: "https://www.fantasypros.com/2026/09/fantasy-football-waiver-wire-rankings-pickups-week-4-2026/",
      updatedAt: "2026-09-28",
    },
    nfl: {
      label: "NFL Fantasy Week 4 waiver targets",
      url: "https://www.nfl.com/news/2026-nfl-fantasy-football-waiver-wire-week-4-te-juwan-johnson-rb-braelon-allen-headline-targets",
      updatedAt: "2026-09-28",
    },
  },
  signals: [
    {
      playerName: "Ollie Gordon II", position: "RB", sourceCount: 3,
      rotoballer: { rank: 1, move: "Add in all leagues" },
      fantasyPros: { rank: 2, trueValue: 14, budget: 8, desperate: 28 },
      nflRank: 7,
      opportunity: "Gordon inherited every Miami RB snap after Achane exited, finishing with 17 carries, three targets, a touchdown, and an 84% full-game snap share.",
      primaryRisk: "Jaylen Wright can force a split when healthy, and Miami's low-scoring offense limits the value of inefficient volume.",
    },
    {
      playerName: "Braelon Allen", position: "RB", sourceCount: 3,
      rotoballer: { rank: 2, move: "Add in all leagues" },
      fantasyPros: { rank: 1, trueValue: 15, budget: 9, desperate: 28 },
      nflRank: 2,
      opportunity: "Breece Hall is considered week to week, creating a near-term starting path for Allen after his snap share rose to 52% in Week 3.",
      primaryRisk: "Allen produced only seven opportunities before Hall left; this is an injury-created projection, not proof that he already seized a durable lead role.",
    },
    {
      playerName: "Kenyon Sadiq", position: "TE", sourceCount: 2,
      rotoballer: { rank: 4, move: "Add in all leagues" },
      nflRank: 5,
      opportunity: "Sadiq's role and production rose together: 58% of snaps, eight targets, seven catches, 105 yards, and a touchdown in Week 3.",
      primaryRisk: "It is a one-game target spike after five total targets in Weeks 1-2, so the volume still needs to repeat.",
    },
    {
      playerName: "Keenan Allen", position: "WR", sourceCount: 2,
      rotoballer: { rank: 6, move: "Add in 10+ team PPR leagues" },
      nflRank: 12,
      opportunity: "Allen drew a season-high nine targets and scored with Alec Pierce on injured reserve, supporting immediate PPR usability.",
      primaryRisk: "The role is partly injury-created and can contract when Indianapolis' receiving group gets healthier.",
    },
    {
      playerName: "Mack Hollins", position: "WR", sourceCount: 2,
      rotoballer: { rank: 20, move: "Add in 12+ team leagues" },
      nflRank: 3,
      opportunity: "Hollins caught six of nine targets for 87 yards and owns New England's best short-term route to WR1 volume while A.J. Brown is out.",
      primaryRisk: "The elevated role may shrink when Brown returns in October, making Hollins more bridge than season-long cornerstone.",
    },
    {
      playerName: "Malik Washington", position: "WR", sourceCount: 2,
      rotoballer: { rank: 18, move: "Add in 12+ team PPR leagues" },
      nflRank: 13,
      opportunity: "Washington led Miami with 34 routes and 10 targets in Week 3, giving him the clearest repeatable receiving volume in a weakened offense.",
      primaryRisk: "Miami's scoring ceiling is low, and short-area volume may not translate into difference-making weekly upside.",
    },
    {
      playerName: "Keaton Mitchell", position: "RB", sourceCount: 1,
      nflRank: 11,
      opportunity: "Mitchell played five red-zone snaps and scored in Week 3, while his explosive-run rate keeps a larger role within reach.",
      primaryRisk: "Omarion Hampton still leads the backfield; Mitchell remains a contingent and efficiency-dependent bench back.",
    },
    {
      playerName: "Jaylen Wright", position: "RB", sourceCount: 1,
      nflRank: 10,
      opportunity: "Achane's season-ending injury opens a path to Miami's RB1 role, and Wright was the listed RB2 before missing Week 3.",
      primaryRisk: "Wright must first clear his foot and stinger injuries, while Gordon's 84% snap performance gives the healthy back the initial advantage.",
    },
    {
      playerName: "Tre' Harris", position: "WR", sourceCount: 1,
      fantasyPros: { rank: 3, trueValue: 1, budget: 0, desperate: 2 },
      opportunity: "Harris earned a team-high seven targets, a 21% target share, and 76 yards despite running a route on only 63% of dropbacks.",
      primaryRisk: "He has not passed Quentin Johnston on the depth chart and faces difficult Seattle and Denver matchups next.",
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
  nflRank?: number;
};

const rotoballerRows: WeeklyWaiverMarketRow[] = [
  { playerName: "Ollie Gordon II", position: "RB", rotoballerRank: 1, rotoballerMove: "Add in all leagues", fantasyProsPprRank: 2, fantasyProsTrueValue: 14, fantasyProsBudget: 8, fantasyProsDesperate: 28, nflRank: 7 },
  { playerName: "Braelon Allen", position: "RB", rotoballerRank: 2, rotoballerMove: "Add in all leagues", fantasyProsPprRank: 1, fantasyProsTrueValue: 15, fantasyProsBudget: 9, fantasyProsDesperate: 28, nflRank: 2 },
  { playerName: "Kenny Gainwell", position: "RB", rotoballerRank: 3, rotoballerMove: "Add in all leagues" },
  { playerName: "Kenyon Sadiq", position: "TE", rotoballerRank: 4, rotoballerMove: "Add in all leagues", nflRank: 5 },
  { playerName: "Emmett Johnson", position: "RB", rotoballerRank: 5, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Keenan Allen", position: "WR", rotoballerRank: 6, rotoballerMove: "Add in 10+ team PPR leagues", nflRank: 12 },
  { playerName: "Emanuel Wilson", position: "RB", rotoballerRank: 7, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Devaughn Vele", position: "WR", rotoballerRank: 8, rotoballerMove: "Add in 10+ team PPR leagues" },
  { playerName: "Dontayvion Wicks", position: "WR", rotoballerRank: 9, rotoballerMove: "Add in 10+ team leagues", nflRank: 4 },
  { playerName: "Jakobi Meyers", position: "WR", rotoballerRank: 10, rotoballerMove: "Add in 10+ team PPR leagues" },
  { playerName: "Jordyn Tyson", position: "WR", rotoballerRank: 11, rotoballerMove: "Add in 10+ team PPR leagues" },
  { playerName: "Alvin Kamara", position: "RB", rotoballerRank: 12, rotoballerMove: "Add in 10+ team PPR leagues" },
  { playerName: "Kaelon Black", position: "RB", rotoballerRank: 13, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Rachaad White", position: "RB", rotoballerRank: 14, rotoballerMove: "Add in 10+ team PPR leagues" },
  { playerName: "Terrance Ferguson", position: "TE", rotoballerRank: 15, rotoballerMove: "Add in 10+ team leagues" },
  { playerName: "Tre Tucker", position: "WR", rotoballerRank: 16, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Adonai Mitchell", position: "WR", rotoballerRank: 17, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Malik Washington", position: "WR", rotoballerRank: 18, rotoballerMove: "Add in 12+ team PPR leagues", nflRank: 13 },
  { playerName: "Wan'Dale Robinson", position: "WR", rotoballerRank: 19, rotoballerMove: "Add in 12+ team PPR leagues" },
  { playerName: "Mack Hollins", position: "WR", rotoballerRank: 20, rotoballerMove: "Add in 12+ team leagues", nflRank: 3 },
  { playerName: "Chris Rodriguez Jr.", position: "RB", rotoballerRank: 21, rotoballerMove: "Add in 12+ team leagues" },
  { playerName: "Tre' Harris", position: "WR", rotoballerRank: 24, rotoballerMove: "Add in 12+ team leagues", fantasyProsPprRank: 3, fantasyProsTrueValue: 1, fantasyProsBudget: 0, fantasyProsDesperate: 2 },
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
