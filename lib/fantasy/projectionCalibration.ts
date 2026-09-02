import { buildExpectedOpportunitySignal } from "@/lib/fantasy/expectedOpportunity";
import { scoreStatProjection } from "@/lib/fantasy/scoring";
import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { FfOpportunitySeasonStats } from "@/lib/fantasy/ffOpportunity";
import { buildRegressionSignal } from "@/lib/fantasy/regression";
import { buildRoleSecuritySignal } from "@/lib/fantasy/roleSecurity";
import { buildScoringProfileSignal } from "@/lib/fantasy/scoringProfile";
import type { SleeperTrendSnapshot } from "@/lib/fantasy/sleeper";
import type {
  CandidateExpectedOpportunitySnapshot,
  CandidateProfileCompletenessSnapshot,
  CandidateRegressionSnapshot,
  CandidateRoleSecuritySnapshot,
  CandidateScoringProfileSnapshot,
  CandidateConvictionDossier,
  DraftCandidate,
  FantasyScoringRules,
  MarketSnapshot,
  PlayerPosition,
  ProjectionRobustnessSnapshot,
  ProjectionScenarioSnapshot,
  ProjectionSignalSnapshot,
} from "@/lib/fantasy/types";
import { buildEvidenceConfidence } from "@/lib/fantasy/evidenceConfidence";
import { assessPlayerSituation } from "@/lib/fantasy/playerContext";
import { buildQualitativeAdjustment } from "@/lib/fantasy/qualitativeAdjustment";
import {
  ageFragilityPoints,
  buildAdvancedUsageSnapshot,
  opportunityScoreFromZ,
  populationMoments,
  positionalZScore,
  weightedOpportunityRating,
} from "@/lib/fantasy/advancedUsage";
import { applyMilestoneGameProjection } from "@/lib/fantasy/milestoneProjection";

const CALIBRATED_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function buildProfileCompleteness(input: {
  candidate: DraftCandidate;
  nflverseStats?: NflversePlayerSeasonStats;
  ffOpportunityStats?: FfOpportunitySeasonStats;
  sleeperTrend?: SleeperTrendSnapshot;
  hasResearchProfile?: boolean;
}): CandidateProfileCompletenessSnapshot {
  const { candidate, nflverseStats, ffOpportunityStats, sleeperTrend, hasResearchProfile } = input;
  const projectedValues = Object.values(candidate.projection.stats)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const projection = projectedValues.length >= 5 ? 25 : projectedValues.length >= 2 ? 18 : 10;
  const market = Math.min(15,
    (candidate.market.ecr > 0 ? 5 : 0) +
    (candidate.market.adp > 0 ? 3 : 0) +
    (candidate.market.expertStdDev !== null && candidate.market.expertStdDev !== undefined ? 2 : 0) +
    (candidate.seasonMarket ? 3 : 0) +
    (candidate.vegas ? 2 : 0) +
    (sleeperTrend ? 2 : 0),
  );
  const historicalUsage = nflverseStats
    ? Math.round(20 * clamp(nflverseStats.games / 15, 0.2, 1))
    : 0;
  const expectedOpportunity = ffOpportunityStats
    ? Math.min(15, 9 + Math.round(6 * clamp(ffOpportunityStats.weeks / 15, 0, 1)))
    : 0;
  const context = candidate.context;
  const knownContextFields = context
    ? [
        context.currentRole !== "unknown",
        context.healthStatus !== "unknown",
        context.trackRecord !== "unknown",
        context.roleContinuity !== "unknown",
        context.environment !== "uncertain",
      ].filter(Boolean).length
    : 0;
  const currentContext = Math.min(15,
    knownContextFields * 2 +
    (context && context.source !== "inferred-default" ? 3 : 0) +
    (context?.qualitative?.evidence.length ? 2 : 0),
  );
  const identity = Math.min(10,
    (candidate.player.externalIds.nflverse ? 4 : 0) +
    (candidate.player.externalIds.sleeper ? 3 : 0) +
    (candidate.player.team ? 2 : 0) +
    (candidate.player.rookie || candidate.player.age !== null ? 1 : 0),
  );
  const research = hasResearchProfile ? 15 : 0;
  const score = Math.round(clamp(
    projection + market + historicalUsage + expectedOpportunity + currentContext + identity + research,
    0,
    100,
  ));
  const adjustmentScale = Number((0.35 + score * 0.0065).toFixed(2));
  const label = score >= 80 ? "complete" : score >= 58 ? "usable" : "limited";
  return {
    score,
    adjustmentScale,
    label,
    components: { projection, market, historicalUsage, expectedOpportunity, currentContext, identity, research },
    summary: `Profile completeness is ${score}/100; player-specific adjustments apply at ${Math.round(adjustmentScale * 100)}% strength.`,
  };
}

function scaledDelta(value: number, scale: number) {
  return Number((value * scale).toFixed(2));
}

function scaleSignalAdjustments<T extends { adjustedMedianDelta: number; stabilityImpact: number }>(
  signal: T,
  scale: number,
): T {
  return {
    ...signal,
    adjustedMedianDelta: scaledDelta(signal.adjustedMedianDelta, scale),
    stabilityImpact: scaledDelta(signal.stabilityImpact, scale),
  };
}

function exactProjectionScore(candidate: DraftCandidate, rules: FantasyScoringRules) {
  return scoreStatProjection(candidate.projection.stats, rules);
}

function opportunityRawScore(
  position: PlayerPosition,
  stats: NflversePlayerSeasonStats | undefined,
) {
  if (!stats) {
    return null;
  }

  switch (position) {
    case "QB":
      return (
        stats.attempts * 0.7 +
        stats.passingTouchdowns * 5 +
        stats.rushingYards * 0.08 +
        stats.carries * 0.2
      );
    case "RB":
      return (
        stats.carries * 0.52 +
        stats.targets * 1.35 +
        stats.receptions * 0.5 +
        stats.targetShare * 80
      );
    case "WR": {
      const wopr = weightedOpportunityRating(stats) ?? 0;
      return stats.targets * 0.62 + stats.receptions * 0.22 + wopr * 105;
    }
    case "TE": {
      const wopr = weightedOpportunityRating(stats) ?? 0;
      return stats.targets * 0.58 + stats.receptions * 0.2 + wopr * 98;
    }
    case "K":
      return stats.fantasyPointsPpr * 0.55 + stats.games * 1.2;
    default:
      return null;
  }
}

function marketWindowAverage(
  candidates: DraftCandidate[],
  scoredById: Map<string, number>,
  index: number,
) {
  const weights = [
    { offset: 0, weight: 1 },
    { offset: -1, weight: 0.75 },
    { offset: 1, weight: 0.75 },
    { offset: -2, weight: 0.45 },
    { offset: 2, weight: 0.45 },
  ];

  let totalWeight = 0;
  let weightedScore = 0;

  for (const { offset, weight } of weights) {
    const candidate = candidates[index + offset];
    if (!candidate) {
      continue;
    }

    const score = scoredById.get(candidate.player.id);
    if (score === undefined) {
      continue;
    }

    weightedScore += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedScore / totalWeight : 0;
}

function marketDiscountSignal(market: MarketSnapshot) {
  const averageRank = (market.adp + market.ecr) / 2;
  const tierRankEstimate = Math.max(1, market.tier) * 12;
  return Math.max(0, (averageRank - tierRankEstimate) / 12);
}

function opportunityWeight(position: PlayerPosition) {
  switch (position) {
    case "RB":
      return 4.2;
    case "WR":
      return 3.6;
    case "TE":
      return 3;
    case "QB":
      return 2.4;
    case "K":
      return 1;
    default:
      return 0;
  }
}

function momentumDelta(
  trend: SleeperTrendSnapshot | undefined,
  position: PlayerPosition,
) {
  if (!trend) {
    return 0;
  }

  const base = Math.log10(Math.max(1, trend.count) + 1);
  const positionMultiplier = position === "RB" || position === "WR" ? 0.7 : 0.5;
  const signed = trend.trend === "add" ? base : -base;
  return Number((signed * positionMultiplier).toFixed(2));
}

function outlierSnapshot(input: {
  exactVsMarketGap: number;
  opportunityScore: number | null;
  momentumScore: number;
}) {
  const disagreement = Math.abs(input.exactVsMarketGap);
  const roleFragile =
    input.opportunityScore !== null &&
    input.opportunityScore <= 34 &&
    input.exactVsMarketGap >= 6;

  if (roleFragile) {
    const opportunityScore = input.opportunityScore ?? 34;
    return {
      outlierTag: "role-fragile" as const,
      outlierScore: Number((disagreement + (40 - opportunityScore) * 0.35).toFixed(2)),
    };
  }

  if (input.exactVsMarketGap <= -8) {
    return {
      outlierTag: "projection-over-market" as const,
      outlierScore: Number((disagreement + Math.max(0, input.momentumScore) * 2.4).toFixed(2)),
    };
  }

  if (input.exactVsMarketGap >= 8) {
    return {
      outlierTag: "market-over-projection" as const,
      outlierScore: Number((disagreement + Math.max(0, -input.momentumScore) * 2.4).toFixed(2)),
    };
  }

  return {
    outlierTag: "aligned" as const,
    outlierScore: Number(disagreement.toFixed(2)),
  };
}

function positionVolatilityBase(position: PlayerPosition) {
  switch (position) {
    case "QB":
      return 20;
    case "RB":
      return 34;
    case "WR":
      return 30;
    case "TE":
      return 24;
    case "K":
      return 14;
    default:
      return 18;
  }
}

function buildCalibratedRange(
  median: number,
  position: PlayerPosition,
  expertStdDev: number | undefined,
  exactVsMarketGap: number,
  rookie: boolean,
) {
  const volatility =
    positionVolatilityBase(position) +
    (expertStdDev ?? 0) * 3.6 +
    Math.abs(exactVsMarketGap) * 0.38;
  const rookieMultiplier = rookie ? 1.12 : 1;
  const lowSide = volatility * 0.94 * rookieMultiplier;
  const highSide = volatility * 1.08 * rookieMultiplier;

  return {
    p10: Number(Math.max(0, median - lowSide).toFixed(2)),
    p50: Number(median.toFixed(2)),
    p90: Number((median + highSide).toFixed(2)),
  };
}

function buildScenarioDrivers(
  position: PlayerPosition,
  label: ProjectionScenarioSnapshot["label"],
  input: {
    rookie: boolean;
    opportunityScore: number | null;
    sleeperTrend: SleeperTrendSnapshot | undefined;
    outlierTag: ProjectionSignalSnapshot["outlierTag"];
    expectedOpportunity: CandidateExpectedOpportunitySnapshot;
    roleSecurity: CandidateRoleSecuritySnapshot;
      scoringProfile: CandidateScoringProfileSnapshot;
      regression: CandidateRegressionSnapshot;
  },
) {
  const drivers: string[] = [];

  if (label === "downside") {
    if (position === "RB") {
      drivers.push("Passing-down work or goal-line share softens.");
    } else if (position === "WR") {
      drivers.push("Target share settles closer to the room average.");
    } else if (position === "QB") {
      drivers.push("Rushing spike weeks cool off and passing volume has to carry.");
    } else if (position === "TE") {
      drivers.push("Weekly target floor narrows if the offense spreads the ball.");
    } else {
      drivers.push("Weekly volume normalizes and range widens.");
    }

    if (input.opportunityScore !== null && input.opportunityScore <= 40) {
      drivers.push("Role prior is lighter than the draft price implies.");
    }
    if (input.sleeperTrend?.trend === "drop") {
      drivers.push("Recent market activity has been cooling.");
    }
    if (input.regression.direction === "negative") {
      drivers.push("Regression layer sees last season's scoring as a little hot for the role.");
    }
    if (input.scoringProfile.label === "touchdown-fragile") {
      drivers.push("Scoring profile is leaning too hard on touchdown variance.");
    }
    if (input.expectedOpportunity.label === "thin") {
      drivers.push("Expected-opportunity base is thinner than the price implies.");
    }
    if (input.roleSecurity.label === "fragile") {
      drivers.push("Competition pressure makes the role less secure week to week.");
    }
  }

  if (label === "base") {
    if (position === "RB") {
      drivers.push("Lead-touch role translates cleanly in this scoring format.");
    } else if (position === "WR") {
      drivers.push("Weekly target volume stays healthy enough for PPR stability.");
    } else if (position === "QB") {
      drivers.push("Passing base plus rushing floor keeps the weekly median intact.");
    } else if (position === "TE") {
      drivers.push("Tight-end scarcity keeps a normal season playable.");
    } else {
      drivers.push("Median case mostly holds if role and health remain normal.");
    }

    if (input.opportunityScore !== null && input.opportunityScore >= 65) {
      drivers.push("Prior-year opportunity signals support the median projection.");
    }
    if (input.regression.direction === "positive") {
      drivers.push("Regression layer sees last season's fantasy finish as light for the role.");
    }
    if (input.scoringProfile.label === "volume-backed") {
      drivers.push("Scoring profile is being carried by volume instead of a TD heater.");
    }
    if (input.expectedOpportunity.label === "strong") {
      drivers.push("Expected-opportunity base is already carrying starter-level volume.");
    }
    if (input.roleSecurity.label === "secure") {
      drivers.push("Role security says the weekly workload is less likely to wobble.");
    }
  }

  if (label === "ceiling") {
    if (position === "RB") {
      drivers.push("High-value touches consolidate and touchdown variance breaks right.");
    } else if (position === "WR") {
      drivers.push("Target alpha status plus explosive weeks unlocks a tier jump.");
    } else if (position === "QB") {
      drivers.push("Passing efficiency and rushing TDs crest together.");
    } else if (position === "TE") {
      drivers.push("Target concentration turns scarce volume into a weekly edge.");
    } else {
      drivers.push("Volume and scoring efficiency both land near the upper band.");
    }

    if (input.sleeperTrend?.trend === "add") {
      drivers.push("Rising market momentum suggests the room is starting to price in the upside.");
    }
    if (input.regression.direction === "positive") {
      drivers.push("If efficiency bounces back toward normal, the ceiling case gets cleaner.");
    }
    if (input.scoringProfile.label === "volume-backed") {
      drivers.push("The volume base means the upside does not need reckless touchdown luck.");
    }
    if (input.expectedOpportunity.label === "strong") {
      drivers.push("Ceiling does not need a heroic workload jump to become real.");
    }
  }

  if (input.rookie) {
    drivers.push(
      label === "ceiling"
        ? "Rookie growth path still matters more here than with established veterans."
        : "Rookie volatility keeps the range wider than a veteran comp.",
    );
  }

  if (input.outlierTag === "role-fragile" && label !== "ceiling") {
    drivers.push("Role fragility is the main thing that can break the median case.");
  }

  return drivers.slice(0, 3);
}

function buildScenarioSummary(
  label: ProjectionScenarioSnapshot["label"],
  points: number,
  drivers: string[],
) {
  const lead =
    label === "downside"
      ? `Downside case lands around ${points.toFixed(1)} points if the fragile parts of the profile wobble.`
      : label === "base"
        ? `Base case still lands around ${points.toFixed(1)} points if the current role mostly holds.`
        : `Ceiling case pushes toward ${points.toFixed(1)} points if the high-value outcomes connect.`;

  return drivers.length > 0 ? `${lead} ${drivers[0]}` : lead;
}

function buildRobustnessSnapshot(input: {
  candidate: DraftCandidate;
  calibratedRange: DraftCandidate["projection"]["range"];
  opportunityScore: number | null;
  sleeperTrend: SleeperTrendSnapshot | undefined;
  outlierTag: ProjectionSignalSnapshot["outlierTag"];
  expectedOpportunity: CandidateExpectedOpportunitySnapshot;
  roleSecurity: CandidateRoleSecuritySnapshot;
  scoringProfile: CandidateScoringProfileSnapshot;
  regression: CandidateRegressionSnapshot;
}) {
  const {
    candidate,
    calibratedRange,
    opportunityScore,
    sleeperTrend,
    outlierTag,
    expectedOpportunity,
    roleSecurity,
    scoringProfile,
    regression,
  } = input;
  const floorGap = Number((calibratedRange.p50 - calibratedRange.p10).toFixed(2));
  const ceilingGap = Number((calibratedRange.p90 - calibratedRange.p50).toFixed(2));
  const expertStdDev = candidate.market.expertStdDev ?? 0;
  const volatilityScore = Math.round(
    clamp(
      24 +
        (floorGap + ceilingGap) * 0.88 +
        expertStdDev * 2.6 +
        (candidate.player.rookie ? 6 : 0),
      20,
      96,
    ),
  );
  const fragilityScore = Math.round(
    clamp(
      volatilityScore * 0.56 +
        (opportunityScore === null ? 6 : (50 - opportunityScore) * 0.45) +
        expertStdDev * 0.9 +
        (sleeperTrend?.trend === "drop" ? 7 : 0) +
        expectedOpportunity.stabilityImpact * -0.95 +
        roleSecurity.stabilityImpact * -1.1 +
        (scoringProfile.label === "touchdown-fragile"
          ? scoringProfile.dependencyScore * 0.1
          : scoringProfile.label === "volume-backed"
            ? -Math.abs(scoringProfile.stabilityImpact) * 0.9
            : 0) +
        (regression.direction === "negative" ? regression.regressionScore * 0.08 : 0) -
        (regression.direction === "positive" ? regression.regressionScore * 0.05 : 0) +
        (outlierTag === "market-over-projection" ? 6 : 0) +
        (outlierTag === "role-fragile" ? 12 : 0) +
        (candidate.player.rookie ? 5 : 0) +
        ageFragilityPoints(candidate.player.positions[0] ?? "WR", candidate.player.age),
      18,
      96,
    ),
  );
  const fragility =
    fragilityScore >= 68 ? "fragile" : fragilityScore >= 44 ? "balanced" : "stable";
  const medianStickiness = Math.round(
    clamp(
      100 -
        fragilityScore +
        (opportunityScore === null ? 0 : (opportunityScore - 50) * 0.18) +
        expectedOpportunity.stabilityImpact * 1.45 +
        roleSecurity.stabilityImpact * 1.55 +
        scoringProfile.stabilityImpact * 1.5 +
        regression.stabilityImpact * 1.4 +
        (sleeperTrend?.trend === "add" ? 5 : 0),
      8,
      92,
    ),
  );

  const downsideDrivers = buildScenarioDrivers(candidate.player.positions[0] ?? "WR", "downside", {
    rookie: candidate.player.rookie,
    opportunityScore,
    sleeperTrend,
    outlierTag,
    expectedOpportunity,
    roleSecurity,
    scoringProfile,
    regression,
  });
  const baseDrivers = buildScenarioDrivers(candidate.player.positions[0] ?? "WR", "base", {
    rookie: candidate.player.rookie,
    opportunityScore,
    sleeperTrend,
    outlierTag,
    expectedOpportunity,
    roleSecurity,
    scoringProfile,
    regression,
  });
  const ceilingDrivers = buildScenarioDrivers(candidate.player.positions[0] ?? "WR", "ceiling", {
    rookie: candidate.player.rookie,
    opportunityScore,
    sleeperTrend,
    outlierTag,
    expectedOpportunity,
    roleSecurity,
    scoringProfile,
    regression,
  });

  return {
    fragility,
    fragilityScore,
    volatilityScore,
    medianStickiness,
    floorGap,
    ceilingGap,
    downside: {
      label: "downside",
      points: calibratedRange.p10,
      deltaFromMedian: Number((calibratedRange.p10 - calibratedRange.p50).toFixed(2)),
      summary: buildScenarioSummary("downside", calibratedRange.p10, downsideDrivers),
      drivers: downsideDrivers,
    },
    base: {
      label: "base",
      points: calibratedRange.p50,
      deltaFromMedian: 0,
      summary: buildScenarioSummary("base", calibratedRange.p50, baseDrivers),
      drivers: baseDrivers,
    },
    ceiling: {
      label: "ceiling",
      points: calibratedRange.p90,
      deltaFromMedian: Number((calibratedRange.p90 - calibratedRange.p50).toFixed(2)),
      summary: buildScenarioSummary("ceiling", calibratedRange.p90, ceilingDrivers),
      drivers: ceilingDrivers,
    },
  } satisfies ProjectionRobustnessSnapshot;
}

function buildDossierSupport(candidate: DraftCandidate) {
  const support: string[] = [];
  const signals = candidate.signals!;
  if (signals.evidenceConfidence.projection.level === "high") {
    support.push("Independent statistical projections are relatively aligned.");
  }
  if (signals.situation.certainty === "high") {
    support.push("Current role, health, and environment have a stable reviewed baseline.");
  }
  if (signals.opportunityLabel === "Strong role") {
    support.push("Opportunity prior is strong enough to support the median case.");
  } else if (signals.opportunityLabel === "Usable role") {
    support.push("There is enough prior-year usage to keep the profile draftable.");
  }
  if (signals.expectedOpportunity.label === "strong") {
    support.push("Expected-opportunity baseline already looks like a real starter profile.");
  }
  if (signals.roleSecurity.label === "secure") {
    support.push("Role concentration suggests the workload is less fragile than nearby bets.");
  }
  if (signals.sleeperTrend === "add") {
    support.push("Market momentum is supportive instead of fighting the model.");
  }
  if (signals.regression.direction === "positive") {
    support.push("Regression pass says last year's scoring probably undersold the role.");
  }
  if (signals.scoringProfile.label === "volume-backed") {
    support.push("Scoring mix is supported by real volume instead of needing a TD spike.");
  }
  if (signals.robustness.fragility === "stable") {
    support.push("Floor-to-ceiling band is tighter than most nearby options.");
  }
  return support.slice(0, 3);
}

function buildWhatHasToGoRight(candidate: DraftCandidate) {
  const signals = candidate.signals!;
  const position = candidate.player.positions[0] ?? "WR";
  const items: string[] = [];

  if (position === "RB") {
    items.push("Touch leadership has to stay intact, especially in high-value touches.");
  } else if (position === "WR") {
    items.push("Target share has to stay sticky enough to cash the PPR median.");
  } else if (position === "QB") {
    items.push("The weekly rushing floor has to remain part of the profile.");
  } else if (position === "TE") {
    items.push("The offense has to keep funnelling enough work through the tight end.");
  } else {
    items.push("The current usage lane has to survive through the fantasy playoffs.");
  }

  if (signals.opportunityLabel !== "Strong role") {
    items.push("Role clarity has to sharpen instead of staying ambiguous.");
  }
  if (signals.expectedOpportunity.label !== "strong") {
    items.push("Opportunity has to land efficiently enough to beat a merely usable volume base.");
  }
  if (signals.roleSecurity.label !== "secure") {
    items.push("The player has to hold off enough competition to keep the role sticky.");
  }
  if (signals.sleeperTrend === "add") {
    items.push("The positive market momentum has to reflect something real, not just summer drift.");
  }
  if (candidate.player.rookie) {
    items.push("The learning curve has to be shallow enough for early-season usability.");
  }

  return items.slice(0, 3);
}

function buildFailureModes(candidate: DraftCandidate) {
  const signals = candidate.signals!;
  const failures: string[] = [];

  if (signals.robustness.fragility === "fragile") {
    failures.push("The range is wide enough that this profile can miss even without a total collapse.");
  }
  if (signals.outlierTag === "market-over-projection") {
    failures.push("You may be paying for consensus rank instead of the underlying scoring base.");
  }
  if (signals.outlierTag === "role-fragile") {
    failures.push("If the role slips at all, the downside arrives quickly.");
  }
  if (signals.sleeperTrend === "drop") {
    failures.push("Cooling market sentiment can turn this into a poor timing bet.");
  }
  if (signals.regression.direction === "negative") {
    failures.push("Regression pass says last year's scoring likely ran a little hot.");
  }
  if (signals.expectedOpportunity.label === "thin") {
    failures.push("Expected-opportunity baseline is not strong enough to justify overpaying.");
  }
  if (signals.roleSecurity.label === "fragile") {
    failures.push(
      signals.roleSecurity.competitionEvidence
        ? "Verified role competition could erode the weekly floor fast."
        : "The historical workload profile may not support the projected weekly floor.",
    );
  }
  if (signals.scoringProfile.label === "touchdown-fragile") {
    failures.push("Too much of the scoring case depends on touchdown efficiency holding.");
  }
  if (candidate.player.rookie) {
    failures.push("Rookie uncertainty still leaves more paths to early-season disappointment.");
  }
  if (signals.projectionDisagreement >= 10) {
    failures.push("Source disagreement is already telling us the profile is not clean.");
  }

  return failures.slice(0, 3);
}

function buildUsagePlan(stance: CandidateConvictionDossier["stance"]) {
  switch (stance) {
    case "priority-target":
      return "Worth taking at cost, and even a touch early, when the tier is under real pressure.";
    case "pocket-value":
      return "Prefer when he slips to you or when you can pair the swing with safer roster structure.";
    case "fragile-bet":
      return "Only make this click if your roster already has enough floor to absorb a miss.";
    case "market-trap":
      return "Let the room pay list price unless the board collapses and the discount becomes real.";
    case "neutral":
    default:
      return "Draftable at a fair price, but not a player the board should bend around.";
  }
}

function buildCandidateDossier(
  candidate: DraftCandidate,
  modelRank: number,
  marketRank: number,
) {
  const signals = candidate.signals!;
  const rankDelta = marketRank - modelRank;
  const marketGap = modelRank - marketRank;
  let stance: CandidateConvictionDossier["stance"] = "neutral";

  if (
    rankDelta >= 6 &&
    signals.robustness.fragility !== "fragile" &&
    signals.evidenceConfidence.projection.level !== "low" &&
    signals.situation.certainty !== "low"
  ) {
    stance = "priority-target";
  } else if (
    rankDelta >= 2 &&
    signals.evidenceConfidence.projection.score >= 58 &&
    signals.situation.certainty !== "low" &&
    signals.outlierTag !== "role-fragile"
  ) {
    stance = "pocket-value";
  } else if (
    signals.robustness.fragilityScore >= 62 ||
    signals.outlierTag === "role-fragile"
  ) {
    stance = "fragile-bet";
  } else if (
    (marketGap >= 4 && signals.outlierTag === "market-over-projection") ||
    (signals.outlierTag === "market-over-projection" &&
      signals.evidenceConfidence.projection.level === "low" &&
      signals.robustness.fragilityScore >= 54)
  ) {
    stance = "market-trap";
  }

  if (
    stance === "neutral" &&
    signals.regression.direction === "positive" &&
    rankDelta >= 1 &&
    signals.robustness.fragility !== "fragile"
  ) {
    stance = "pocket-value";
  }

  if (
    stance === "neutral" &&
    signals.scoringProfile.label === "volume-backed" &&
    rankDelta >= 1 &&
    signals.robustness.fragility !== "fragile"
  ) {
    stance = "pocket-value";
  }

  if (
    stance === "neutral" &&
    signals.expectedOpportunity.label === "strong" &&
    signals.roleSecurity.label !== "fragile" &&
    rankDelta >= 1
  ) {
    stance = "pocket-value";
  }

  if (
    signals.regression.direction === "negative" &&
    (stance === "neutral" || stance === "pocket-value") &&
    (signals.outlierTag === "market-over-projection" || marketGap >= 2)
  ) {
    stance = "market-trap";
  }

  if (
    signals.scoringProfile.label === "touchdown-fragile" &&
    (stance === "neutral" || stance === "pocket-value") &&
    (signals.outlierTag === "market-over-projection" || marketGap >= 1)
  ) {
    stance = "market-trap";
  }

  if (
    signals.expectedOpportunity.label === "thin" &&
    signals.roleSecurity.label === "fragile" &&
    (stance === "neutral" || stance === "pocket-value")
  ) {
    stance = "fragile-bet";
  }

  const convictionScore = Math.round(
    clamp(
      48 +
        rankDelta * 2.4 -
        Math.max(0, marketGap) * 1.6 +
        signals.evidenceConfidence.projection.score * 0.12 +
        signals.evidenceConfidence.role.score * 0.1 -
        signals.robustness.fragilityScore * 0.24 +
        signals.expectedOpportunity.stabilityImpact * 1.2 +
        signals.roleSecurity.stabilityImpact * 1.3 +
        signals.scoringProfile.stabilityImpact * 1.35 +
        signals.regression.stabilityImpact * 1.2 +
        signals.regression.adjustedMedianDelta * 0.8 +
        (signals.opportunityScore === null ? 0 : (signals.opportunityScore - 50) * 0.16),
      16,
      96,
    ),
  );

  const summary =
    stance === "priority-target"
      ? `${candidate.player.fullName} is one of the clearest spots where our model is ahead of the market without taking on ugly fragility.`
      : stance === "pocket-value"
        ? `${candidate.player.fullName} looks like a live value pocket, but the case is cleaner if the room gives you a little discount.`
        : stance === "fragile-bet"
          ? `${candidate.player.fullName} has upside worth acknowledging, but too many things have to go right for this to be a blind click.`
          : stance === "market-trap"
            ? `${candidate.player.fullName} is being drafted on a stronger market story than the projection base really supports.`
            : `${candidate.player.fullName} looks playable, but not like a conviction anchor for the board.`;

  return {
    stance,
    convictionScore,
    summary,
    support: buildDossierSupport(candidate),
    whatHasToGoRight: buildWhatHasToGoRight(candidate),
    failureModes: buildFailureModes(candidate),
    usagePlan: buildUsagePlan(stance),
  } satisfies CandidateConvictionDossier;
}

type CalibrationContext = {
  nflverseByPlayerId?: Map<string, NflversePlayerSeasonStats>;
  ffOpportunityByPlayerId?: Map<string, FfOpportunitySeasonStats>;
  sleeperTrendsByPlayerId?: Map<string, SleeperTrendSnapshot>;
  useQualitativeContext?: boolean;
  researchProfileNames?: Set<string>;
};

export function calibrateDraftCandidates(
  candidates: DraftCandidate[],
  rules: FantasyScoringRules,
  context?: CalibrationContext,
) {
  const scoringCandidates = candidates.map((candidate) => {
    const nflverseId = candidate.player.externalIds.nflverse;
    return applyMilestoneGameProjection(
      candidate,
      nflverseId ? context?.nflverseByPlayerId?.get(nflverseId) : undefined,
    );
  });
  const exactScoreById = new Map<string, number>();
  for (const candidate of scoringCandidates) {
    exactScoreById.set(candidate.player.id, exactProjectionScore(candidate, rules));
  }

  const byPosition = new Map<PlayerPosition, DraftCandidate[]>();
  for (const position of CALIBRATED_POSITIONS) {
    byPosition.set(
      position,
      scoringCandidates
        .filter((candidate) => primaryPosition(candidate) === position)
        .sort((a, b) => a.market.ecr - b.market.ecr),
    );
  }

  const opportunityMoments = new Map<PlayerPosition, { mean: number; standardDeviation: number }>();
  for (const position of CALIBRATED_POSITIONS) {
    const values = scoringCandidates
      .map((candidate) => {
        if (primaryPosition(candidate) !== position) {
          return null;
        }
        const nflverseId = candidate.player.externalIds.nflverse;
        return opportunityRawScore(position, nflverseId ? context?.nflverseByPlayerId?.get(nflverseId) : undefined);
      })
      .filter((value): value is number => value !== null);

    opportunityMoments.set(position, populationMoments(values));
  }

  const calibratedCandidates = scoringCandidates.map((candidate) => {
    const position = primaryPosition(candidate);
    const positionCandidates = byPosition.get(position) ?? [];
    const candidateIndex = positionCandidates.findIndex(
      (item) => item.player.id === candidate.player.id,
    );
    const exactScore = exactScoreById.get(candidate.player.id) ?? candidate.projection.range.p50;
    const marketScore =
      candidateIndex >= 0
        ? marketWindowAverage(positionCandidates, exactScoreById, candidateIndex)
        : exactScore;
    const exactVsMarketGap = marketScore - exactScore;
    const nflverseId = candidate.player.externalIds.nflverse;
    const nflverseStats = nflverseId ? context?.nflverseByPlayerId?.get(nflverseId) : undefined;
    const ffOpportunityStats = nflverseId
      ? context?.ffOpportunityByPlayerId?.get(nflverseId)
      : undefined;
    const opportunityRaw = opportunityRawScore(position, nflverseStats);
    const moments = opportunityMoments.get(position) ?? { mean: 0, standardDeviation: 0 };
    const opportunityZScore = opportunityRaw === null
      ? null
      : positionalZScore(opportunityRaw, moments.mean, moments.standardDeviation);
    const opportunityScore =
      opportunityRaw === null
        ? null
        : opportunityScoreFromZ(opportunityZScore!);
    const rawOpportunityDelta =
      opportunityScore === null
        ? 0
        : Number(
            ((((opportunityScore - 50) / 50) * opportunityWeight(position)) / 2).toFixed(2),
          );
    const sleeperTrend = candidate.player.externalIds.sleeper
      ? context?.sleeperTrendsByPlayerId?.get(candidate.player.externalIds.sleeper)
      : undefined;
    const rawSleeperMomentumDelta = momentumDelta(sleeperTrend, position);
    const profileCompleteness = buildProfileCompleteness({
      candidate,
      nflverseStats,
      ffOpportunityStats,
      sleeperTrend,
      hasResearchProfile: context?.researchProfileNames?.has(
        candidate.player.fullName.toLowerCase().replace(/[^a-z0-9]/g, ""),
      ),
    });
    const adjustmentScale = profileCompleteness.adjustmentScale;
    const opportunityDelta = scaledDelta(rawOpportunityDelta, adjustmentScale);
    const sleeperMomentumDelta = scaledDelta(rawSleeperMomentumDelta, adjustmentScale);
    const expectedOpportunity = scaleSignalAdjustments(buildExpectedOpportunitySignal({
      candidate,
      rules,
      nflverseStats,
      ffOpportunityStats,
    }), adjustmentScale);
    const roleSecurity = scaleSignalAdjustments(buildRoleSecuritySignal({
      candidate,
      nflverseStats,
    }), adjustmentScale);
    const scoringProfile = scaleSignalAdjustments(buildScoringProfileSignal({
      candidate,
      rules,
      nflverseStats,
    }), adjustmentScale);
    const regression = scaleSignalAdjustments(buildRegressionSignal({
      candidate,
      rules,
      nflverseStats,
      ffOpportunityStats,
    }), adjustmentScale);
    const advancedUsage = buildAdvancedUsageSnapshot({
      position,
      stats: nflverseStats,
      opportunityZScore,
      age: candidate.player.age,
    });
    const marketWeight = clamp(
      0.18 +
        (candidate.market.expertStdDev ?? 0) / 24 +
        Math.abs(exactVsMarketGap) / 42 +
        marketDiscountSignal(candidate.market) / 10,
      0.18,
      0.52,
    );
    const calibratedFromExact = exactScore * (1 - marketWeight) + marketScore * marketWeight;
    const medianBeforeQualitative =
      calibratedFromExact +
      opportunityDelta +
      sleeperMomentumDelta +
      expectedOpportunity.adjustedMedianDelta +
      roleSecurity.adjustedMedianDelta +
      scoringProfile.adjustedMedianDelta +
      regression.adjustedMedianDelta;
    const rawQualitativeAdjustment = buildQualitativeAdjustment(
      candidate,
      medianBeforeQualitative,
      context?.useQualitativeContext !== false,
    );
    const qualitativeAdjustment = {
      ...rawQualitativeAdjustment,
      percentDelta: scaledDelta(rawQualitativeAdjustment.percentDelta, adjustmentScale),
      pointsDelta: scaledDelta(rawQualitativeAdjustment.pointsDelta, adjustmentScale),
      summary: rawQualitativeAdjustment.applied
        ? `${rawQualitativeAdjustment.summary} Applied at ${Math.round(adjustmentScale * 100)}% strength for profile completeness.`
        : rawQualitativeAdjustment.summary,
    };
    const calibratedMedian = medianBeforeQualitative + qualitativeAdjustment.pointsDelta;
    const calibratedRange = buildCalibratedRange(
      calibratedMedian,
      position,
      candidate.market.expertStdDev,
      exactVsMarketGap,
      candidate.player.rookie,
    );
    const outlier = outlierSnapshot({
      exactVsMarketGap,
      opportunityScore,
      momentumScore: sleeperMomentumDelta,
    });
    const robustness = buildRobustnessSnapshot({
      candidate,
      calibratedRange,
      opportunityScore,
      sleeperTrend,
      outlierTag: outlier.outlierTag,
      expectedOpportunity,
      roleSecurity,
      scoringProfile,
      regression,
    });
    const situation = assessPlayerSituation(candidate);
    const evidenceConfidence = buildEvidenceConfidence({
      candidate,
      expectedOpportunity,
      roleSecurity,
      robustness,
      situation,
    });
    const notes: string[] = [];
    if (profileCompleteness.adjustmentScale < 0.9) {
      notes.push(profileCompleteness.summary);
    }
    if (opportunityScore !== null && opportunityScore >= 72) {
      notes.push(`Strong ${nflverseStats?.games ?? 0}-game nflverse role prior.`);
    } else if (opportunityScore !== null && opportunityScore <= 35) {
      notes.push("Thin prior-year usage versus this draft range.");
    }

    if (sleeperTrend?.trend === "add") {
      notes.push(`Sleeper market is rising (${sleeperTrend.count} adds in the lookback window).`);
    } else if (sleeperTrend?.trend === "drop") {
      notes.push(`Sleeper market is cooling (${sleeperTrend.count} drops in the lookback window).`);
    }

    if (Math.abs(exactVsMarketGap) >= 10) {
      notes.push("Projection and market neighborhood disagree more than usual here.");
    }
    if (expectedOpportunity.label !== "none") {
      notes.push(expectedOpportunity.summary);
      notes.push(...expectedOpportunity.drivers);
    }
    if (roleSecurity.label !== "unknown") {
      notes.push(roleSecurity.summary);
      notes.push(...roleSecurity.drivers);
    }
    if (scoringProfile.label !== "balanced") {
      notes.push(scoringProfile.summary);
      notes.push(...scoringProfile.drivers);
    }
    if (regression.direction === "positive" || regression.direction === "negative") {
      notes.push(regression.summary);
      notes.push(...regression.luckDrivers);
    }
    notes.push(...advancedUsage.evidence);
    if (qualitativeAdjustment.applied) {
      notes.push(qualitativeAdjustment.summary);
      notes.push(...qualitativeAdjustment.drivers);
    }

    const signals: ProjectionSignalSnapshot = {
      sourceCount:
        1 +
        (opportunityScore !== null ? 1 : 0) +
        (ffOpportunityStats ? 1 : 0) +
        (candidate.seasonMarket ? 1 : 0) +
        (candidate.vegas ? 1 : 0) +
        (sleeperTrend ? 1 : 0),
      profileCompleteness,
      evidenceConfidence,
      situation,
      qualitativeAdjustment,
      calibratedFromExact: Number((calibratedMedian - exactScore).toFixed(2)),
      projectionDisagreement: Number(Math.abs(exactVsMarketGap).toFixed(2)),
      opportunityScore:
        opportunityScore === null ? null : Number(opportunityScore.toFixed(1)),
      opportunityLabel:
        opportunityScore === null
          ? "No prior"
          : opportunityScore >= 72
            ? "Strong role"
            : opportunityScore >= 45
              ? "Usable role"
              : "Fragile role",
      sleeperTrend: sleeperTrend?.trend ?? "steady",
      momentumScore: sleeperMomentumDelta,
      outlierTag: outlier.outlierTag,
      outlierScore: outlier.outlierScore,
      expectedOpportunity,
      roleSecurity,
      scoringProfile,
      regression,
      advancedUsage,
      seasonMarket: candidate.seasonMarket,
      vegas: candidate.vegas,
      robustness,
      dossier: {
        stance: "neutral",
        convictionScore: 50,
        summary: "Dossier pending market-versus-model pass.",
        support: [],
        whatHasToGoRight: [],
        failureModes: [],
        usagePlan: "Draftable at a fair price, but not a player the board should bend around.",
      },
      notes,
    };

    return {
      ...candidate,
      projection: {
        ...candidate.projection,
        scoringType: "YAHOO-CUSTOM-CALIBRATED",
        range: calibratedRange,
      },
      signals,
    } satisfies DraftCandidate;
  });

  const modelRankById = new Map<string, number>();
  const marketRankById = new Map<string, number>();

  // Dossier conviction must compare like with like. Raw fantasy points are not
  // comparable across positions, so an overall projection rank systematically
  // labeled RB/WR as fragile and QB as value. Use position-relative ranks here;
  // the acquisition board handles overall value and market price separately.
  for (const position of CALIBRATED_POSITIONS) {
    const positionCandidates = calibratedCandidates.filter(
      (candidate) => primaryPosition(candidate) === position,
    );
    [...positionCandidates]
      .sort((a, b) => b.projection.range.p50 - a.projection.range.p50)
      .forEach((candidate, index) => modelRankById.set(candidate.player.id, index + 1));
    [...positionCandidates]
      .sort((a, b) => a.market.ecr - b.market.ecr)
      .forEach((candidate, index) => marketRankById.set(candidate.player.id, index + 1));
  }

  return calibratedCandidates.map((candidate) => {
    const modelRank = modelRankById.get(candidate.player.id) ?? calibratedCandidates.length;
    const marketRank = marketRankById.get(candidate.player.id) ?? calibratedCandidates.length;
    const dossier = buildCandidateDossier(candidate, modelRank, marketRank);
    const nextNotes = [...candidate.signals!.notes];

    if (dossier.stance === "priority-target") {
      nextNotes.push("Conviction pass tags this as a true target instead of just a rank bump.");
    } else if (dossier.stance === "fragile-bet") {
      nextNotes.push("Conviction pass says this profile needs roster context before you click it.");
    } else if (dossier.stance === "market-trap") {
      nextNotes.push("Conviction pass says the room may be pricing story over scoring base.");
    }

    return {
      ...candidate,
      signals: {
        ...candidate.signals!,
        dossier,
        notes: nextNotes.slice(0, 5),
      },
    } satisfies DraftCandidate;
  });
}
