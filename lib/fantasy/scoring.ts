import type {
  FantasyScoringRules,
  LeagueConfig,
  ProjectionSnapshot,
  StatProjection,
} from "@/lib/fantasy/types";
import {
  assertLeagueMatchesSourceOfTruth,
  leagueSourceOfTruth,
} from "@/lib/fantasy/leagueSourceOfTruth";

export const yahooLeagueRules: FantasyScoringRules = {
  passingYardsPerPoint: leagueSourceOfTruth.scoring.passingYardsPerPoint,
  passingTouchdownPoints: leagueSourceOfTruth.scoring.passingTouchdownPoints,
  interceptionPoints: leagueSourceOfTruth.scoring.interceptionPoints,
  rushingYardsPerPoint: leagueSourceOfTruth.scoring.rushingYardsPerPoint,
  rushingTouchdownPoints: leagueSourceOfTruth.scoring.rushingTouchdownPoints,
  receptionPoints: leagueSourceOfTruth.scoring.receptionPoints,
  receivingYardsPerPoint: leagueSourceOfTruth.scoring.receivingYardsPerPoint,
  receivingTouchdownPoints: leagueSourceOfTruth.scoring.receivingTouchdownPoints,
  returnTouchdownPoints: leagueSourceOfTruth.scoring.returnTouchdownPoints,
  fumbleLostPoints: leagueSourceOfTruth.scoring.fumbleLostPoints,
  offensiveFumbleReturnTouchdownPoints: leagueSourceOfTruth.scoring.offensiveFumbleReturnTouchdownPoints,
  twoPointConversionPoints: leagueSourceOfTruth.scoring.twoPointConversionPoints,
  kickerPoints: { ...leagueSourceOfTruth.scoring.kickerPoints },
  defenseSpecialTeamsPoints: { ...leagueSourceOfTruth.scoring.defenseSpecialTeamsPoints },
  pointsAllowed: leagueSourceOfTruth.scoring.pointsAllowed.map((band) => ({ ...band })),
  yardageBonuses: {
    passing300: leagueSourceOfTruth.scoring.passing300Bonus,
    rushing100: leagueSourceOfTruth.scoring.rushing100Bonus,
    receiving100: leagueSourceOfTruth.scoring.receiving100Bonus,
  },
};

export const yahooLeagueConfig: LeagueConfig = {
  id: leagueSourceOfTruth.leagueId,
  name: leagueSourceOfTruth.leagueName,
  teams: leagueSourceOfTruth.teams,
  rosterSlots: [
    ...Array.from({ length: leagueSourceOfTruth.lineup.QB }, () => "QB" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.WR }, () => "WR" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.RB }, () => "RB" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.TE }, () => "TE" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.FLEX }, () => "W/R/T" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.K }, () => "K" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.BN }, () => "BN" as const),
    ...Array.from({ length: leagueSourceOfTruth.lineup.IR }, () => "IR" as const),
  ],
  flexSlots: [...leagueSourceOfTruth.lineup.flexEligible],
  benchSlots: leagueSourceOfTruth.lineup.BN,
  irSlots: leagueSourceOfTruth.lineup.IR,
  faabBudget: leagueSourceOfTruth.waivers.faabBudget,
  scoringType: "Head-to-Head",
  waiverDays: leagueSourceOfTruth.waivers.days,
  waiverType: leagueSourceOfTruth.waivers.type,
  playoffTeams: leagueSourceOfTruth.playoffs.teams,
  playoffWeeks: [...leagueSourceOfTruth.playoffs.weeks],
  keeperLeague: true,
  scoring: yahooLeagueRules,
};

assertLeagueMatchesSourceOfTruth(yahooLeagueConfig);

function scorePointsAllowed(pointsAllowed: number, rules: FantasyScoringRules) {
  const matchedBand = rules.pointsAllowed.find(
    (band) => pointsAllowed >= band.min && (band.max === null || pointsAllowed <= band.max),
  );
  return matchedBand?.points ?? 0;
}

export function scoreStatProjection(
  stats: StatProjection,
  rules: FantasyScoringRules,
  options: { explicitMilestoneGamesOnly?: boolean } = {},
): number {
  let total = 0;

  total += (stats.passingYards ?? 0) / rules.passingYardsPerPoint;
  total += (stats.passingTouchdowns ?? 0) * rules.passingTouchdownPoints;
  total += (stats.interceptions ?? 0) * rules.interceptionPoints;
  total += (stats.rushingYards ?? 0) / rules.rushingYardsPerPoint;
  total += (stats.rushingTouchdowns ?? 0) * rules.rushingTouchdownPoints;
  total += (stats.receptions ?? 0) * rules.receptionPoints;
  total += (stats.receivingYards ?? 0) / rules.receivingYardsPerPoint;
  total += (stats.receivingTouchdowns ?? 0) * rules.receivingTouchdownPoints;
  total += (stats.returnTouchdowns ?? 0) * rules.returnTouchdownPoints;
  total += (stats.fumblesLost ?? 0) * rules.fumbleLostPoints;
  total +=
    (stats.offensiveFumbleReturnTouchdowns ?? 0) *
    rules.offensiveFumbleReturnTouchdownPoints;
  total += (stats.twoPointConversions ?? 0) * rules.twoPointConversionPoints;

  total += (stats.fieldGoals0to19 ?? 0) * rules.kickerPoints.fieldGoals0to19;
  total += (stats.fieldGoals20to29 ?? 0) * rules.kickerPoints.fieldGoals20to29;
  total += (stats.fieldGoals30to39 ?? 0) * rules.kickerPoints.fieldGoals30to39;
  total += (stats.fieldGoals40to49 ?? 0) * rules.kickerPoints.fieldGoals40to49;
  total += (stats.fieldGoals50Plus ?? 0) * rules.kickerPoints.fieldGoals50Plus;
  total += (stats.pointAfterMakes ?? 0) * rules.kickerPoints.pointAfterMakes;
  total += (stats.pointAfterMisses ?? 0) * rules.kickerPoints.pointAfterMisses;

  total += (stats.defensiveSacks ?? 0) * rules.defenseSpecialTeamsPoints.sack;
  total +=
    (stats.defensiveInterceptions ?? 0) * rules.defenseSpecialTeamsPoints.interception;
  total +=
    (stats.defensiveFumbleRecoveries ?? 0) *
    rules.defenseSpecialTeamsPoints.fumbleRecovery;
  total +=
    (stats.defensiveTouchdowns ?? 0) * rules.defenseSpecialTeamsPoints.touchdown;
  total += (stats.defensiveSafeties ?? 0) * rules.defenseSpecialTeamsPoints.safety;
  total += (stats.blockedKicks ?? 0) * rules.defenseSpecialTeamsPoints.blockedKick;
  total +=
    ((stats.kickReturnTouchdowns ?? 0) + (stats.puntReturnTouchdowns ?? 0)) *
    rules.defenseSpecialTeamsPoints.kickOrPuntReturnTouchdown;
  total += (stats.extraPointReturns ?? 0) * rules.defenseSpecialTeamsPoints.extraPointReturn;

  if (stats.pointsAllowed !== undefined) {
    total += scorePointsAllowed(stats.pointsAllowed, rules);
  }

  // Preserve the production model's legacy one-bonus approximation until its feeds
  // provide game counts. Research experiments opt into strict explicit counts so a
  // season total cannot masquerade as evidence of weekly threshold frequency.
  const passing300Games = stats.passing300Games ?? (
    !options.explicitMilestoneGamesOnly && (stats.passingYards ?? 0) >= 300 ? 1 : 0
  );
  const rushing100Games = stats.rushing100Games ?? (
    !options.explicitMilestoneGamesOnly && (stats.rushingYards ?? 0) >= 100 ? 1 : 0
  );
  const receiving100Games = stats.receiving100Games ?? (
    !options.explicitMilestoneGamesOnly && (stats.receivingYards ?? 0) >= 100 ? 1 : 0
  );
  total += passing300Games * (rules.yardageBonuses?.passing300 ?? 0);
  total += rushing100Games * (rules.yardageBonuses?.rushing100 ?? 0);
  total += receiving100Games * (rules.yardageBonuses?.receiving100 ?? 0);

  return Number(total.toFixed(2));
}

export function scoreProjectionSnapshot(
  projection: ProjectionSnapshot,
  rules: FantasyScoringRules,
) {
  return {
    p10: Number(projection.range.p10.toFixed(2)),
    p50: Number(projection.range.p50.toFixed(2)),
    p90: Number(projection.range.p90.toFixed(2)),
    exact: scoreStatProjection(projection.stats, rules),
  };
}
