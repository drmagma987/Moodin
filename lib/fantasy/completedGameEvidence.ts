import type {
  CompletedGameReviewSnapshot,
  InSeasonPlayerSnapshot,
  UsageWindowSnapshot,
} from "@/lib/fantasy/types";
import { weekOneClosingBoxScoreGroups } from "@/lib/fantasy/data/weekOneClosingBoxScores.generated";
import { weekOneSundayBoxScoreGroups } from "@/lib/fantasy/data/weekOneSundayBoxScores.generated";

const WEEK_ONE_EVIDENCE_WEIGHT = 0.18;

type PlayerGameUsage = {
  name: string;
  teamSnaps?: number;
  teamRoutes?: number;
  teamTargets: number;
  snaps?: number;
  routes?: number;
  carries: number;
  targets: number;
  receivingYards?: number;
  airYards?: number;
  fantasyPoints: number;
  boxScoreOnly?: boolean;
  rushingYardsOverExpected?: number;
  rushingYardsOverExpectedPerAttempt?: number;
};

export const completedGameEvidenceMeta = {
  week: 1,
  completedGames: 16,
  scheduledGames: 16,
  capturedAt: "2026-09-15T10:20:49-04:00",
  latestGame: "Week 1 complete · 16 of 16 games final",
  evidenceWeight: WEEK_ONE_EVIDENCE_WEIGHT,
  sources: [
    {
      label: "Official Patriots/NFL box score",
      url: "https://www.patriots.com/game-day/2026/reg-week1/patriots-at-seahawks/box-score",
    },
    {
      label: "PFF Week 1 usage recap",
      url: "https://www.pff.com/news/nfl-week-1-recap-immediate-fantasy-football-takeaways-from-patriots-seahawks",
    },
    {
      label: "PFF 49ers-Rams usage recap",
      url: "https://www.pff.com/news/fantasy-football-week-1-recap-49ers-rams",
    },
    {
      label: "Official Rams game recap",
      url: "https://www.therams.com/news/game-recap-rams-fall-to-49ers-27-7-in-week-1-in-australia",
    },
    {
      label: "nflverse play-by-play and Next Gen Stats",
      url: "https://github.com/nflverse/nflverse-data/releases",
    },
    {
      label: "ESPN Week 1 scoreboard and box scores",
      url: "https://www.espn.com/nfl/scoreboard/_/week/1/year/2026/seasontype/2",
    },
    {
      label: "Official Giants-Cowboys game stats",
      url: "https://www.giants.com/game-day/game-stats",
    },
  ],
} as const;

const openingGameUsage: PlayerGameUsage[] = [
  { name: "Jaxon Smith-Njigba", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 45, routes: 26, carries: 0, targets: 11, receivingYards: 122, airYards: 76, fantasyPoints: 28.2 },
  { name: "Cooper Kupp", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 39, routes: 21, carries: 0, targets: 3, receivingYards: 35, airYards: 49, fantasyPoints: 5.5 },
  { name: "Rashid Shaheed", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 33, routes: 20, carries: 0, targets: 3, receivingYards: 4, airYards: 19, fantasyPoints: 1.4 },
  { name: "AJ Barner", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 44, routes: 19, carries: 0, targets: 2, receivingYards: 13, airYards: -1, fantasyPoints: 3.3 },
  { name: "Elijah Arroyo", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 11, routes: 7, carries: 0, targets: 0, receivingYards: 0, airYards: 0, fantasyPoints: 0 },
  { name: "Jadarian Price", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 24, routes: 12, carries: 10, targets: 2, receivingYards: 6, airYards: -1, fantasyPoints: 7.8, rushingYardsOverExpected: 6.834, rushingYardsOverExpectedPerAttempt: 0.683 },
  { name: "George Holani", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 23, routes: 8, carries: 8, targets: 1, receivingYards: 0, airYards: 6, fantasyPoints: 2.9 },
  { name: "Emanuel Wilson", teamSnaps: 50, teamRoutes: 27, teamTargets: 24, snaps: 3, routes: 1, carries: 2, targets: 0, receivingYards: 0, airYards: 0, fantasyPoints: 0.3 },
  { name: "Mack Hollins", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 50, routes: 25, carries: 0, targets: 5, receivingYards: 51, airYards: 62, fantasyPoints: 9.1 },
  { name: "DeMario Douglas", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 44, routes: 33, carries: 0, targets: 7, receivingYards: 20, airYards: 44, fantasyPoints: 7 },
  { name: "Romeo Doubs", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 40, routes: 32, carries: 0, targets: 3, receivingYards: 0, airYards: 75, fantasyPoints: 0 },
  { name: "A.J. Brown", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 31, routes: 16, carries: 0, targets: 4, receivingYards: 26, airYards: 19, fantasyPoints: 5.6 },
  { name: "Hunter Henry", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 54, routes: 26, carries: 0, targets: 3, receivingYards: 26, airYards: 12, fantasyPoints: 5.6 },
  { name: "Eli Raridon", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 38, routes: 10, carries: 0, targets: 1, receivingYards: 2, airYards: 2, fantasyPoints: 7.2 },
  { name: "Rhamondre Stevenson", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 60, routes: 32, carries: 18, targets: 6, receivingYards: 44, airYards: -6, fantasyPoints: 14.5, rushingYardsOverExpected: -22.122, rushingYardsOverExpectedPerAttempt: -1.229 },
  { name: "Corey Kiner", teamSnaps: 71, teamRoutes: 42, teamTargets: 31, snaps: 8, routes: 1, carries: 6, targets: 0, receivingYards: 0, airYards: 0, fantasyPoints: 1.1 },
];

const secondGameUsage: PlayerGameUsage[] = [
  { name: "Brock Purdy", teamTargets: 34, carries: 5, targets: 0, fantasyPoints: 28.1, boxScoreOnly: true },
  { name: "Mike Evans", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 49, routes: 26, carries: 0, targets: 7, receivingYards: 49, airYards: 55, fantasyPoints: 16.9 },
  { name: "Demarcus Robinson", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 41, routes: 21, carries: 0, targets: 3, receivingYards: 50, airYards: 45, fantasyPoints: 13 },
  { name: "Deebo Samuel Sr.", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 27, routes: 19, carries: 1, targets: 7, receivingYards: 48, airYards: 17, fantasyPoints: 18 },
  { name: "De'Zhaun Stribling", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 21, routes: 14, carries: 0, targets: 0, receivingYards: 0, airYards: 0, fantasyPoints: 0 },
  { name: "Luke Farrell", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 46, routes: 19, carries: 0, targets: 2, receivingYards: 19, airYards: 3, fantasyPoints: 3.9 },
  { name: "George Kittle", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 30, routes: 17, carries: 0, targets: 5, receivingYards: 12, airYards: 38, fantasyPoints: 3.2 },
  { name: "Christian McCaffrey", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 36, routes: 22, carries: 10, targets: 8, receivingYards: 20, airYards: -3, fantasyPoints: 13.8, rushingYardsOverExpected: 16.194, rushingYardsOverExpectedPerAttempt: 1.619 },
  { name: "Kaelon Black", teamSnaps: 65, teamRoutes: 36, teamTargets: 34, snaps: 28, routes: 13, carries: 14, targets: 1, receivingYards: 5, airYards: -5, fantasyPoints: 8, rushingYardsOverExpected: -5.314, rushingYardsOverExpectedPerAttempt: -0.38 },
  { name: "Puka Nacua", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 43, routes: 20, carries: 0, targets: 9, receivingYards: 74, airYards: 115, fantasyPoints: 12.4 },
  { name: "Davante Adams", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 33, routes: 21, carries: 0, targets: 6, receivingYards: 26, airYards: 73, fantasyPoints: 5.6 },
  { name: "Jordan Whittington", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 25, routes: 13, carries: 0, targets: 1, receivingYards: 8, airYards: 8, fantasyPoints: 1.8 },
  { name: "Konata Mumpfield", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 16, routes: 11, carries: 0, targets: 1, receivingYards: 0, airYards: 13, fantasyPoints: 0 },
  { name: "Colby Parkinson", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 47, routes: 19, carries: 0, targets: 2, receivingYards: 6, airYards: 9, fantasyPoints: 1.6 },
  { name: "Terrance Ferguson", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 31, routes: 14, carries: 0, targets: 1, receivingYards: 0, airYards: 24, fantasyPoints: 0 },
  { name: "Tyler Higbee", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 12, routes: 5, carries: 0, targets: 2, receivingYards: 12, airYards: 9, fantasyPoints: 1.2 },
  { name: "Kyren Williams", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 39, routes: 21, carries: 11, targets: 3, receivingYards: 24, airYards: 7, fantasyPoints: 15.5 },
  { name: "Blake Corum", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 14, routes: 3, carries: 10, targets: 0, receivingYards: 0, airYards: 0, fantasyPoints: 5.4 },
  { name: "Ronnie Rivers", teamSnaps: 61, teamRoutes: 29, teamTargets: 27, snaps: 8, routes: 3, carries: 5, targets: 1, receivingYards: 5, airYards: 2, fantasyPoints: 3.4 },
];

const sundayAfternoonUsage: PlayerGameUsage[] = weekOneSundayBoxScoreGroups.flatMap((group) =>
  group.players.map(([name, carries, targets, fantasyPoints]) => ({
    name,
    teamTargets: group.teamTargets,
    carries,
    targets,
    fantasyPoints,
    boxScoreOnly: true,
  })),
);

const closingSlateUsage: PlayerGameUsage[] = weekOneClosingBoxScoreGroups.flatMap((group) =>
  group.players.map(([name, carries, targets, fantasyPoints]) => ({
    name,
    teamTargets: group.teamTargets,
    carries,
    targets,
    fantasyPoints,
    boxScoreOnly: true,
  })),
);

const completedGameUsage = [
  ...openingGameUsage,
  ...secondGameUsage,
  ...sundayAfternoonUsage,
  ...closingSlateUsage,
];

const teamAirYards = { SEA: 154, NE: 205, SF: 149, LAR: 259 } as const;
const teamProe = { SEA: -5.48, NE: -2.58, SF: 4.95, LAR: -17.3 } as const;

const quarterbackEvidence = [
  { name: "Drake Maye", team: "NE" as const, attempts: 33, cpoe: 5.14 },
  { name: "Drew Lock", team: "SEA" as const, attempts: 22, cpoe: 4.57 },
  { name: "Sam Darnold", team: "SEA" as const, attempts: 2, cpoe: -16.14 },
  { name: "Brock Purdy", team: "SF" as const, attempts: 34, cpoe: 0.77 },
  { name: "Matthew Stafford", team: "LAR" as const, attempts: 24, cpoe: -4.69 },
  { name: "Stetson Bennett IV", team: "LAR" as const, attempts: 3, cpoe: -5.17 },
];

const injuryStatusOverrides = new Map<string, InSeasonPlayerSnapshot["injuryStatus"]>([
  ["a j brown", "Questionable"],
  ["kyler murray", "Questionable"],
]);

const opportunityContextOverrides = new Map<string, NonNullable<InSeasonPlayerSnapshot["opportunityContext"]>>([
  [
    "rhamondre stevenson",
    {
      stability: "contingent",
      reason: "Week 1 workload expanded with TreVeyon Henderson inactive; do not treat it as a durable role gain until both backs are active.",
    },
  ],
]);

export const completedGameTeamEnvironments = [
  { team: "SEA", week: 1, plays: 47, proe: teamProe.SEA, quarterbacks: quarterbackEvidence.filter((qb) => qb.team === "SEA").map((qb) => ({ playerName: qb.name, attempts: qb.attempts, cpoe: qb.cpoe, status: qb.attempts >= 10 ? "verified" as const : "insufficient-sample" as const })) },
  { team: "NE", week: 1, plays: 67, proe: teamProe.NE, quarterbacks: quarterbackEvidence.filter((qb) => qb.team === "NE").map((qb) => ({ playerName: qb.name, attempts: qb.attempts, cpoe: qb.cpoe, status: qb.attempts >= 10 ? "verified" as const : "insufficient-sample" as const })) },
  { team: "SF", week: 1, plays: 64, proe: teamProe.SF, quarterbacks: quarterbackEvidence.filter((qb) => qb.team === "SF").map((qb) => ({ playerName: qb.name, attempts: qb.attempts, cpoe: qb.cpoe, status: qb.attempts >= 10 ? "verified" as const : "insufficient-sample" as const })) },
  { team: "LAR", week: 1, plays: 56, proe: teamProe.LAR, quarterbacks: quarterbackEvidence.filter((qb) => qb.team === "LAR").map((qb) => ({ playerName: qb.name, attempts: qb.attempts, cpoe: qb.cpoe, status: qb.attempts >= 10 ? "verified" as const : "insufficient-sample" as const })) },
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function blend(prior: number, observed: number) {
  return Number((prior * (1 - WEEK_ONE_EVIDENCE_WEIGHT) + observed * WEEK_ONE_EVIDENCE_WEIGHT).toFixed(3));
}

function blendedUsage(
  baseline: UsageWindowSnapshot,
  observed: PlayerGameUsage,
): UsageWindowSnapshot {
  return {
    games: 1,
    snapShare: observed.snaps !== undefined && observed.teamSnaps
      ? blend(baseline.snapShare, observed.snaps / observed.teamSnaps)
      : baseline.snapShare,
    routeParticipation: observed.routes !== undefined && observed.teamRoutes
      ? blend(baseline.routeParticipation, observed.routes / observed.teamRoutes)
      : baseline.routeParticipation,
    carriesPerGame: blend(baseline.carriesPerGame, observed.carries),
    targetsPerGame: blend(baseline.targetsPerGame, observed.targets),
    targetShare: blend(baseline.targetShare, observed.targets / observed.teamTargets),
    // Air yards and red-zone touches were not present in the verified public
    // snapshot. Preserve the prior instead of manufacturing proxy values.
    airYardsShare: baseline.airYardsShare,
    redZoneTouchesPerGame: baseline.redZoneTouchesPerGame,
    fantasyPointsPerGame: blend(baseline.fantasyPointsPerGame, observed.fantasyPoints),
  };
}

export function applyCompletedGameEvidence(players: InSeasonPlayerSnapshot[]) {
  const usageByName = new Map(completedGameUsage.map((usage) => [normalizeName(usage.name), usage] as const));
  const quarterbackByName = new Map(quarterbackEvidence.map((usage) => [normalizeName(usage.name), usage] as const));
  let matchedPlayers = 0;
  const nextPlayers = players.map((player) => {
    const observed = usageByName.get(normalizeName(player.player.fullName));
    const quarterback = quarterbackByName.get(normalizeName(player.player.fullName));
    if (!observed && !quarterback) return player;
    matchedPlayers += 1;
    const withObservedUsage: InSeasonPlayerSnapshot = { ...(observed
      ? {
          ...player,
          recentUsage: blendedUsage(player.baselineUsage, observed),
          injuryStatus: injuryStatusOverrides.get(normalizeName(player.player.fullName)) ?? player.injuryStatus,
          opportunityContext: opportunityContextOverrides.get(normalizeName(player.player.fullName)) ?? player.opportunityContext,
        }
      : player), evidence: {
        week: completedGameEvidenceMeta.week,
        participation: "played",
        capturedAt: completedGameEvidenceMeta.capturedAt,
        source: observed ? "Official NFL box score / published usage report" : "nflverse play-by-play",
        boxScore: Boolean(observed || quarterback),
        snaps: observed?.snaps !== undefined && Boolean(observed.teamSnaps),
        routes: observed?.routes !== undefined && Boolean(observed.teamRoutes),
        ...(observed ? { observedTargets: observed.targets, observedCarries: observed.carries,
          ...(observed.receivingYards !== undefined ? { observedReceivingYards: observed.receivingYards } : {}) } : {}),
      } };
    if (quarterback) {
      return {
        ...withObservedUsage,
        advancedUsage: {
          week: 1,
          games: 1,
          routes: null,
          targetsPerRouteRun: null,
          yardsPerRouteRun: null,
          airYards: null,
          airYardsShare: null,
          rushingYardsOverExpected: null,
          rushingYardsOverExpectedPerAttempt: null,
          forcedMissedTackles: null,
          forcedMissedTackleRate: null,
          cpoe: quarterback.cpoe,
          teamProe: teamProe[quarterback.team],
          statuses: {
            routes: "insufficient-sample",
            airYards: "insufficient-sample",
            rushingYardsOverExpected: "insufficient-sample",
            forcedMissedTackles: "pending-source",
            quarterbackEnvironment: quarterback.attempts >= 10 ? "verified" : "insufficient-sample",
          },
          sources: ["nflverse play-by-play"],
        },
      } satisfies InSeasonPlayerSnapshot;
    }
    if (!observed) return player;
    if (observed.boxScoreOnly) return withObservedUsage;
    const observedRoutes = observed.routes ?? null;
    const observedAirYards = observed.airYards ?? null;
    return {
      ...withObservedUsage,
      advancedUsage: {
        week: 1,
        games: 1,
        routes: observedRoutes,
        targetsPerRouteRun: observedRoutes !== null && observedRoutes > 0 ? Number((observed.targets / observedRoutes).toFixed(3)) : null,
        yardsPerRouteRun: observedRoutes !== null && observedRoutes > 0 && observed.receivingYards !== undefined ? Number((observed.receivingYards / observedRoutes).toFixed(3)) : null,
        airYards: observedAirYards,
        airYardsShare: observedAirYards !== null && teamAirYards[player.player.team as keyof typeof teamAirYards]
          ? Number((observedAirYards / teamAirYards[player.player.team as keyof typeof teamAirYards]).toFixed(3)) : null,
        rushingYardsOverExpected: observed.rushingYardsOverExpected ?? null,
        rushingYardsOverExpectedPerAttempt: observed.rushingYardsOverExpectedPerAttempt ?? null,
        forcedMissedTackles: null,
        forcedMissedTackleRate: null,
        cpoe: null,
        teamProe: teamProe[player.player.team as keyof typeof teamProe],
        statuses: {
          routes: observedRoutes !== null ? "verified" : "pending-source",
          airYards: observedAirYards !== null ? "verified" : "pending-source",
          rushingYardsOverExpected: observed.rushingYardsOverExpected === undefined ? "insufficient-sample" : "verified",
          forcedMissedTackles: "pending-source",
          quarterbackEnvironment: "verified",
        },
        sources: ["PFF routes", "official NFL box score", "nflverse play-by-play", ...(observed.rushingYardsOverExpected === undefined ? [] : ["NFL Next Gen Stats via nflverse"])],
      },
    } satisfies InSeasonPlayerSnapshot;
  });
  return { players: nextPlayers, matchedPlayers };
}

export const completedGameReviews: CompletedGameReviewSnapshot[] = [
  {
    playerName: "Jahmyr Gibbs",
    team: "DET",
    rosterContext: "Your roster",
    action: "Locked start · workload ceiling hit",
    confidence: "high",
    statLine: "29 carries · 156 rush yds · 2 TD · 5/5 rec · 35.6 pts",
    usageLine: "34 opportunities despite one lost fumble",
    analysis: "Detroit made Gibbs the offense's clear volume engine. The workload and receiving floor matter more than the fumble; keep treating him as a weekly lineup anchor.",
  },
  {
    playerName: "Amon-Ra St. Brown",
    team: "DET",
    rosterContext: "Your roster",
    action: "Locked start · alpha role confirmed",
    confidence: "high",
    statLine: "10/14 rec · 67 yds · 2 TD · 28.7 pts",
    usageLine: "37% of Detroit's targets",
    analysis: "Fourteen targets confirm the elite volume survived Detroit's offseason changes. The touchdowns inflated Week 1, but the target dominance is the repeatable part.",
  },
  {
    playerName: "Chris Olave",
    team: "NO",
    rosterContext: "Your roster",
    action: "Locked start · target ceiling raised",
    confidence: "high",
    statLine: "10/13 rec · 182 yds · 30.2 pts",
    usageLine: "26% target share in a 50-target game",
    analysis: "Olave paired true alpha volume with downfield production. New Orleans will not throw 50 times every week, but this is strong evidence that his ceiling belongs in your lineup.",
  },
  {
    playerName: "Harold Fannin Jr.",
    team: "CLE",
    rosterContext: "Your roster",
    action: "Hold on bench · role check pending",
    confidence: "low",
    statLine: "2/3 rec · 21 yds · 4.1 pts",
    usageLine: "3 of Cleveland's 21 targets",
    analysis: "The opener did not create a breakout case, but one box score is not enough to cut a young tight end. Route data will decide whether this was a quiet full role or limited deployment.",
  },
  {
    playerName: "Tyjae Spears",
    team: "TEN",
    rosterContext: "Your roster",
    action: "Primary drop candidate",
    confidence: "medium",
    statLine: "3 carries · 2/4 rec · 24 scrimmage yds · 4.4 pts",
    usageLine: "7 opportunities behind a low-volume Tennessee offense",
    analysis: "Spears did not earn enough rushing work to protect his bench spot. The live roster optimizer now prefers using him as the cut for Dalton Schultz or Kaelon Black.",
  },
  {
    playerName: "Dalton Schultz",
    team: "HOU",
    rosterContext: "Free agent",
    action: "Priority add · 7-11% bid",
    confidence: "medium",
    statLine: "4/8 rec · 35 yds · 7.5 pts",
    usageLine: "24% of Houston's targets",
    analysis: "Eight targets at a scarce position create the best immediate roster fit in the refreshed waiver model. Add for volume, not because the modest yardage was a breakout.",
  },
  {
    playerName: "Kalif Raymond",
    team: "CHI",
    rosterContext: "Free agent",
    action: "Watchlist · verify routes before bidding",
    confidence: "low",
    statLine: "8/9 rec · 84 yds · 16.4 pts",
    usageLine: "35% of Chicago's targets",
    analysis: "The target spike is real box-score evidence, but the Bears' 59-point outlier and missing route data make an aggressive waiver bid premature.",
  },
  {
    playerName: "Matthew Golden",
    team: "GB",
    rosterContext: "Dirty Sanchez",
    action: "Role breakout · price rising",
    confidence: "medium",
    statLine: "6/12 rec · 95 yds · 15.5 pts",
    usageLine: "32% of Green Bay's targets",
    analysis: "Twelve targets are stronger evidence than the touchdown-free result. His manager now has a legitimate usage case, so any trade inquiry should happen before route data hardens the breakout.",
  },
  {
    playerName: "DK Metcalf",
    team: "PIT",
    rosterContext: "Like a good Nabers...",
    action: "Buy-low watch · volume beat result",
    confidence: "medium",
    statLine: "4/10 rec · 40 yds · 8.0 pts",
    usageLine: "27% of Pittsburgh's targets",
    analysis: "The box score disappointed, but ten targets preserve a correction case. Route and air-yard data should determine whether this becomes an actionable buy-low rather than a name-value guess.",
  },
  {
    playerName: "Kyler Murray",
    team: "MIN",
    rosterContext: "Peyton and Brady place",
    action: "Concussion watch · do not trade for now",
    confidence: "high",
    statLine: "3/5 · 18 pass yds · INT · 0.6 pts",
    usageLine: "Exited in the first quarter; Carson Wentz finished",
    analysis: "The tiny stat line is injury-driven, not a usable performance sample. Keep him out of trade valuation until Minnesota publishes his concussion-protocol status.",
  },
  {
    playerName: "Ashton Jeanty",
    team: "LV",
    rosterContext: "Dirty Sanchez",
    action: "Elite role confirmed",
    confidence: "high",
    statLine: "23 carries · 102 rush yds · 6/6 rec · 2 TD · 34.7 pts",
    usageLine: "29 opportunities",
    analysis: "This was a genuine three-down workload with passing-game and scoring equity. Treat the manager's acquisition price as elite-RB territory immediately.",
  },
  {
    playerName: "Ja'Marr Chase",
    team: "CIN",
    rosterContext: "Peyton and Brady place",
    action: "Hold · no panic discount",
    confidence: "low",
    statLine: "2/4 rec · 12 yds · 3.2 pts",
    usageLine: "4 of Cincinnati's 31 targets",
    analysis: "The target count was a real Week 1 disappointment, but one low-volume game cannot override an elite baseline. Watch routes and defensive coverage before calling this a role change.",
  },
  {
    playerName: "Jadarian Price",
    team: "SEA",
    rosterContext: "Your roster",
    action: "Start again · workload bet",
    confidence: "medium",
    statLine: "10 carries · 52 rush yds · 2/2 rec · 7.8 pts",
    usageLine: "48% snaps · 44% route participation · 2 targets",
    analysis: "The role was a committee, but 12 opportunities and solid efficiency are enough to start Price again given your thin RB room. The missing third-down and goal-line work cap his ceiling; they do not make your current alternative stronger.",
  },
  {
    playerName: "Dak Prescott",
    team: "DAL",
    rosterContext: "Your roster",
    action: "Keep starting · lowered ceiling",
    confidence: "medium",
    statLine: "22/34 · 175 pass yds · 2 TD · INT · 19.4 pts",
    usageLine: "Dallas produced 244 total yards and 30 receiver targets",
    analysis: "The six-point passing-touchdown format rescued a poor efficiency night. Dak remains your starter, but the low yardage and pressure problems make this a floor result rather than evidence that the offense is healthy.",
  },
  {
    playerName: "J.K. Dobbins",
    team: "DEN",
    rosterContext: "Your roster",
    action: "Bench behind Price · role concern",
    confidence: "medium",
    statLine: "8 carries · 36 rush yds · 0 targets · 3.6 pts",
    usageLine: "11 fewer opportunities than Price; no receiving work",
    analysis: "Dobbins was efficient enough on the ground, but eight carries and zero targets give him a thinner Week 2 case than Price. Keep him rostered while Denver's split settles, but he is not the better start from your current RB options.",
  },
  {
    playerName: "Kenneth Walker III",
    team: "KC",
    rosterContext: "Nabers think I did 9🏈11",
    action: "Elite role confirmed · do not chase",
    confidence: "high",
    statLine: "23 carries · 173 rush yds · 3/6 rec · 2 TD · 36.1 pts",
    usageLine: "29 opportunities and both rushing/receiving scoring equity",
    analysis: "The workload was elite and the breakout was fully visible. He is a top-tier asset now, but the 60-yard score and 7.5 yards per carry make this a poor moment to pay a post-Week 1 premium.",
  },
  {
    playerName: "Isaiah Likely",
    team: "NYG",
    rosterContext: "Njigba Please",
    action: "Role breakout · price already rising",
    confidence: "high",
    statLine: "8/8 rec · 78 yds · 2 TD · 27.8 pts",
    usageLine: "28% target share; caught every target",
    analysis: "Eight targets make this much more than touchdown noise, but two scores still lifted the result far above a repeatable weekly median. Treat him as a real TE riser without chasing the full box-score price.",
  },
  {
    playerName: "Hunter Henry",
    team: "NE",
    rosterContext: "Free agent",
    action: "No longer rostered · monitor",
    confidence: "medium",
    statLine: "3/3 rec · 26 yds · 5.6 pts",
    usageLine: "76% snaps · 62% route participation",
    analysis: "The route share was usable and every target was caught. A.J. Brown's ankle status could open a little more short-area volume, but one quiet scoring game is not a reason to change Henry's tier.",
  },
  {
    playerName: "Brock Purdy",
    team: "SF",
    rosterContext: "Your roster",
    action: "Strong QB2 · trade chip, not a cut",
    confidence: "high",
    statLine: "25/34 · 205 pass yds · 3 TD · INT · 29 rush yds · 28.1 pts",
    usageLine: "+5.0% team PROE · 0.8 CPOE",
    analysis: "Purdy's three-touchdown opener gives you a credible alternative if Dak's offense stays sluggish. Keep him unless the Trade Lab returns a meaningful starter upgrade; he is useful leverage now, not expendable waiver-level depth.",
  },
  {
    playerName: "Romeo Doubs",
    team: "NE",
    rosterContext: "Your roster",
    action: "Bench · monitor Brown news",
    confidence: "medium",
    statLine: "0/3 rec · 0 yds · 0 pts",
    usageLine: "56% snaps · 76% route participation",
    analysis: "The zero hurts, but 32 routes keep this from being a blind drop. Mack Hollins led the wideouts in snaps; Doubs needs A.J. Brown's absence or a target-rate jump to become playable.",
  },
  {
    playerName: "Jaxon Smith-Njigba",
    team: "SEA",
    rosterContext: "Njigba Please",
    action: "Elite role confirmed",
    confidence: "high",
    statLine: "8/11 rec · 122 yds · TD · 28.2 league pts",
    usageLine: "90% snaps · 96% route participation · 46% target share",
    analysis: "This was a true alpha workload, not a touchdown-only spike. His trade price should rise immediately; do not pay as though the market missed it.",
  },
  {
    playerName: "Rhamondre Stevenson",
    team: "NE",
    rosterContext: "Gabagool",
    action: "Contingent volume · monitor Henderson",
    confidence: "medium",
    statLine: "18 carries · 5/6 rec · 95 scrimmage yds · 14.5 pts",
    usageLine: "85% snaps · 76% route participation",
    analysis: "With TreVeyon Henderson inactive, Stevenson handled 24 opportunities and every-down work. The workload is useful evidence of what he can do as the replacement lead, but it is not evidence that his normal role grew and should not create a buy-low recommendation.",
  },
  {
    playerName: "A.J. Brown",
    team: "NE",
    rosterContext: "Husky Fever",
    action: "Monitor ankle · ignore usage decline",
    confidence: "high",
    statLine: "3/4 rec · 26 yds · 5.6 pts",
    usageLine: "31 snaps before third-quarter exit",
    analysis: "The shortened route total is injury-driven, so the model must not label it a role collapse. His availability is the relevant signal before Week 2.",
  },
  {
    playerName: "Kaelon Black",
    team: "SF",
    rosterContext: "Free agent",
    action: "Priority waiver target",
    confidence: "high",
    statLine: "14 carries · 65 rush yds · 1/1 rec · 8.0 pts",
    usageLine: "43% snaps · 36% route participation · team-high 14 carries",
    analysis: "Black immediately became San Francisco's early-down complement and the clear McCaffrey contingency. The workload is the actionable signal; his negative RYOE says not to mistake a useful role for proven independent rushing dominance yet.",
  },
  {
    playerName: "Christian McCaffrey",
    team: "SF",
    rosterContext: "Husky Fever",
    action: "Elite start · reduced workload ceiling",
    confidence: "high",
    statLine: "10 carries · 68 rush yds · 5/8 rec · 13.8 pts",
    usageLine: "55% snaps · 61% route participation · 18 opportunities",
    analysis: "The snap share fell sharply, but third downs, short yardage, goal-line work, eight targets, and +1.62 RYOE per attempt preserve elite weekly value. Black lowers McCaffrey's season-long touch ceiling more than his weekly floor.",
  },
  {
    playerName: "Puka Nacua",
    team: "LAR",
    rosterContext: "Juggalo All-Stars",
    action: "Elite role confirmed",
    confidence: "high",
    statLine: "5/9 rec · 74 yds · 12.4 pts",
    usageLine: "70% snaps · 69% route participation · 45% TPRR",
    analysis: "Nine targets and 44% of the Rams' air yards arrived despite a broken offense. That is alpha-volume confirmation, not a reason to discount him after a touchdown-free game.",
  },
  {
    playerName: "Davante Adams",
    team: "LAR",
    rosterContext: "Husky Fever",
    action: "Hold · air-yards rebound watch",
    confidence: "medium",
    statLine: "3/6 rec · 26 yds · 5.6 pts",
    usageLine: "54% snaps · 72% route participation · 28% air-yards share",
    analysis: "The result was poor, but the downfield opportunity remained meaningful. Treat this as a likely efficiency correction candidate, while watching whether the Rams' heavy personnel keeps capping his snaps.",
  },
  {
    playerName: "George Kittle",
    team: "SF",
    rosterContext: "Dirty Sanchez",
    action: "Bench until route ramp-up",
    confidence: "high",
    statLine: "2/5 rec · 12 yds · 3.2 pts",
    usageLine: "46% snaps · 47% route participation",
    analysis: "Five targets were encouraging, but this was a managed Achilles return with Luke Farrell handling most early downs. Kittle needs a route-participation rebound before his name value and per-route target rate become trustworthy starter evidence.",
  },
  {
    playerName: "Matthew Stafford",
    team: "LAR",
    rosterContext: "Gabagool",
    action: "Bench · monitor offensive rebound",
    confidence: "medium",
    statLine: "15/25 · 155 pass yds · INT · 5.1 pts",
    usageLine: "−4.7 CPOE · Rams −17.3% PROE",
    analysis: "Both accuracy and contextual pass tendency disappointed. The travel and lopsided opener are legitimate noise, but Stafford should not be trusted over a healthy higher-volume alternative until the offense normalizes.",
  },
];
