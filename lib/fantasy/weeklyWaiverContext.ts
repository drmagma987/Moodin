export type WeeklyWaiverExpertSignal = {
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
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
  week: 2,
  checkedAt: "2026-09-16T10:30:00-04:00",
  sources: {
    rotoballer: {
      label: "RotoBaller Week 2 FAAB",
      url: "https://www.rotoballer.com/faab-waiver-wire-advice-week-2-fantasy-pickups-2026/1931602",
      publishedAt: "2026-09-15",
    },
    fantasyPros: {
      label: "FantasyPros PPR waiver consensus",
      url: "https://www.fantasypros.com/nfl/rankings/waiver-wire-ppr-overall.php",
      updatedAt: "2026-09-16",
    },
  },
  signals: [
    {
      playerName: "Kaelon Black", position: "RB",
      rotoballer: { standard: "6-10%", aggressive: "10-14%", desperation: "14-20%" },
      fantasyPros: { rank: 3, rankLow: 4, rankHigh: 19 },
      opportunity: "Fourteen carries and a 43% snap share created possible standalone flex value plus premium handcuff upside.",
      primaryRisk: "Christian McCaffrey's managed Australia workload may have made the split look more durable than it is.",
    },
    {
      playerName: "Devaughn Vele", position: "WR",
      rotoballer: { standard: "7-10%", aggressive: "10-15%", desperation: "15-20%" },
      fantasyPros: { rank: 10, rankLow: 1, rankHigh: 27 },
      opportunity: "An every-down role and nine targets while Jordyn Tyson is out create immediate PPR usability.",
      primaryRisk: "New Orleans' 90-play overtime game is not a repeatable volume baseline.",
    },
    {
      playerName: "Tyler Shough", position: "QB",
      rotoballer: { standard: "1%", aggressive: "2-4%" },
      fantasyPros: { rank: 4, rankLow: 5, rankHigh: 12 },
      opportunity: "Aggressive downfield volume and a friendly Week 3-4 home runway make him a useful early stash.",
      primaryRisk: "The 56-attempt overtime comeback inflated Week 1, and Baltimore is a difficult immediate matchup.",
    },
    {
      playerName: "Michael Mayer", position: "TE",
      rotoballer: { standard: "3-4%", aggressive: "4-5%", desperation: "5-8%" },
      fantasyPros: { rank: 13, rankLow: 7, rankHigh: 30 },
      opportunity: "Seven targets and a team-leading receiving role make him a short-term tight-end answer.",
      primaryRisk: "Brock Bowers' return could erase the temporary route and target ceiling quickly.",
    },
    {
      playerName: "Caleb Douglas", position: "WR",
      rotoballer: { standard: "7-10%", aggressive: "10-15%", desperation: "15-20%" },
      opportunity: "Seven targets, 94 yards, and downfield usage give him the cleanest claim to Miami's emerging WR pecking order.",
      primaryRisk: "Miami's pass volume and quarterback efficiency may not support consistent weekly production.",
    },
    {
      playerName: "Dontayvion Wicks", position: "WR",
      rotoballer: { standard: "6-8%", aggressive: "8-12%", desperation: "12-16%" },
      opportunity: "Near-full route participation and a large air-yards role offer spike-week upside in a strong offense.",
      primaryRisk: "Only two catches means the Week 1 fantasy result was highly efficiency dependent.",
    },
    {
      playerName: "Denzel Boston", position: "WR",
      rotoballer: { standard: "2-4%", aggressive: "4-5%", desperation: "5-8%" },
      opportunity: "A team-high 27 routes and 115 air yards are the sort of underlying workload that can precede a breakout.",
      primaryRisk: "Most production came on one late touchdown inside a low-floor Cleveland passing environment.",
    },
    {
      playerName: "Kendre Miller", position: "RB",
      rotoballer: { standard: "2-3%", aggressive: "3-5%", desperation: "5-8%" },
      opportunity: "Nine carries and a touchdown keep him live as a cheap contingent-backfield bet.",
      primaryRisk: "Alvin Kamara's return can compress a role that already sits behind Travis Etienne.",
    },
    {
      playerName: "Demarcus Robinson", position: "WR",
      rotoballer: { standard: "1-2%", aggressive: "2-4%", desperation: "4-6%" },
      opportunity: "An injury-created every-play role plus 2.38 YPRR and a 30% air-yards share makes him a model-backed dart throw.",
      primaryRisk: "Three targets and one long touchdown leave a fragile floor once San Francisco's pass catchers get healthier.",
    },
    {
      playerName: "Bryce Young", position: "QB",
      rotoballer: { standard: "1%", aggressive: "2-4%" },
      opportunity: "A four-touchdown opener and improving weapon set create streaming upside in Atlanta's dome.",
      primaryRisk: "Previous spike games have not held, and the underlying opportunity model does not yet confirm a durable jump.",
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
  return weeklyWaiverContext.signals.find((signal) => signal.playerName === playerName);
}
