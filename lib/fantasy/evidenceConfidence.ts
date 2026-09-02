import type {
  CandidateEvidenceConfidenceSnapshot,
  CandidateExpectedOpportunitySnapshot,
  CandidateRoleSecuritySnapshot,
  CandidateSituationAssessment,
  DraftCandidate,
  EvidenceConfidenceDimension,
  EvidenceConfidenceLevel,
  ProjectionRobustnessSnapshot,
} from "@/lib/fantasy/types";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function level(score: number): EvidenceConfidenceLevel {
  return score >= 78 ? "high" : score >= 58 ? "medium" : "low";
}

function dimension(score: number, summary: string, drivers: string[]): EvidenceConfidenceDimension {
  const rounded = Math.round(clamp(score));
  return { score: rounded, level: level(rounded), summary, drivers: drivers.slice(0, 4) };
}

function expectedProjectionStatCount(candidate: DraftCandidate) {
  switch (candidate.player.positions[0]) {
    case "QB":
      return 5;
    case "RB":
    case "WR":
      return 5;
    case "TE":
      return 3;
    default:
      return 1;
  }
}

function projectionConfidence(candidate: DraftCandidate, blockers: string[]) {
  let score = 48;
  const drivers: string[] = [];
  const populatedStats = Object.values(candidate.projection.stats).filter(
    (value) => typeof value === "number",
  ).length;
  const completeness = Math.min(1, populatedStats / expectedProjectionStatCount(candidate));
  score += completeness * 10;
  drivers.push(`${Math.round(completeness * 100)}% of the expected scoreable stat profile is populated.`);

  const seasonMarket = candidate.seasonMarket;
  if (!seasonMarket) {
    score -= 10;
    blockers.push("No independent season-market projection match.");
  } else {
    const coverage = Math.min(18, seasonMarket.adjustments.length * 3.5);
    score += coverage;
    drivers.push(`${seasonMarket.adjustments.length} season-market stat categories provide an independent projection check.`);

    const relativeDifferences = seasonMarket.adjustments.map((adjustment) =>
      Math.abs(adjustment.sourceProjection - adjustment.previousProjection) /
      Math.max(1, Math.abs(adjustment.sourceProjection), Math.abs(adjustment.previousProjection)),
    );
    const disagreement =
      relativeDifferences.reduce((sum, value) => sum + value, 0) /
      Math.max(1, relativeDifferences.length);
    if (disagreement <= 0.12) {
      score += 18;
      drivers.push("FantasyPros and season-market stat expectations are closely aligned.");
    } else if (disagreement <= 0.25) {
      score += 10;
      drivers.push("Projection sources are directionally aligned with manageable differences.");
    } else if (disagreement <= 0.45) {
      score += 3;
      drivers.push("Projection sources have material but not extreme differences.");
    } else {
      score -= 8;
      blockers.push("Baseline and season-market projections materially disagree.");
    }

    const reviewedStableContext =
      candidate.context?.source !== "inferred-default" &&
      candidate.context?.currentRole === "locked-starter" &&
      candidate.context?.healthStatus === "healthy" &&
      candidate.context?.trackRecord === "established" &&
      candidate.context?.roleContinuity === "stable";
    if (
      seasonMarket.context === "expanded-role-or-health-rebound" &&
      !reviewedStableContext
    ) {
      score = Math.min(score, 62);
      blockers.push("Full-season volume implies an unresolved role expansion or health rebound.");
    } else if (seasonMarket.context === "expanded-role-or-health-rebound") {
      drivers.push("Reviewed current context resolves the apparent volume or health discontinuity.");
    }
  }

  return dimension(
    score,
    score >= 78
      ? "Independent statistical sources support a stable projection base."
      : score >= 58
        ? "The statistical projection is usable, but at least one meaningful assumption remains."
        : "The statistical projection needs another independent confirmation before becoming a conviction input.",
    drivers,
  );
}

function roleConfidence(
  candidate: DraftCandidate,
  expectedOpportunity: CandidateExpectedOpportunitySnapshot,
  roleSecurity: CandidateRoleSecuritySnapshot,
  situation: CandidateSituationAssessment,
  blockers: string[],
) {
  let score = situation.reviewed
    ? situation.certainty === "high"
      ? 85
      : situation.certainty === "medium"
        ? 65
        : 38
    : 42;
  const drivers: string[] = [];

  if (situation.reviewed) {
    drivers.push(`Manager-reviewed situation certainty is ${situation.certainty}.`);
    drivers.push(...situation.strengths.slice(0, 2));
  }

  if (expectedOpportunity.label === "strong") {
    score += 22;
  } else if (expectedOpportunity.label === "usable") {
    score += 12;
  } else if (expectedOpportunity.label === "thin") {
    score -= 12;
  }
  if (expectedOpportunity.label !== "none") {
    drivers.push(`Expected-opportunity evidence is ${expectedOpportunity.label}.`);
  }

  if (roleSecurity.label === "secure") {
    score += 22;
  } else if (roleSecurity.label === "balanced") {
    score += 10;
  } else if (roleSecurity.label === "fragile") {
    score -= 14;
  }
  if (roleSecurity.label !== "unknown") {
    drivers.push(`Role-security evidence is ${roleSecurity.label}.`);
  }

  if (
    candidate.seasonMarket?.context === "expanded-role-or-health-rebound" &&
    !situation.reviewed
  ) {
    score += 10;
    score = Math.min(score, 57);
    drivers.push("Full-season market volume supplies a starter-workload signal.");
    blockers.push("Starting-role versus injury-return context is not explicitly resolved.");
  } else if (candidate.seasonMarket && expectedOpportunity.label === "none" && !situation.reviewed) {
    score += 8;
    drivers.push("Season-market volume supplies a current full-season role expectation.");
  }

  if (expectedOpportunity.label === "none" && roleSecurity.label === "unknown" && !candidate.seasonMarket) {
    score = Math.min(score, 45);
    blockers.push("No mapped historical or current role evidence.");
  }
  if (situation.certainty === "low") {
    score = Math.min(score, 49);
    blockers.push(...situation.questions);
  }
  if (candidate.player.rookie) {
    score -= 5;
    drivers.push("Rookie role translation remains inherently less certain.");
  }

  return dimension(
    score,
    score >= 78
      ? "Workload and competition evidence strongly support the projected role."
      : score >= 58
        ? "The projected role is plausible but not fully secured by the available evidence."
        : "Role or availability is the main unresolved part of this projection.",
    drivers,
  );
}

function robustnessConfidence(robustness: ProjectionRobustnessSnapshot) {
  const score =
    (100 - robustness.fragilityScore) * 0.55 + robustness.medianStickiness * 0.45;
  return dimension(
    score,
    robustness.fragility === "stable"
      ? "The median has a relatively resilient floor and limited dependency risk."
      : robustness.fragility === "balanced"
        ? "The projection has a normal range of failure paths for its draft tier."
        : "The projection can miss through multiple plausible volume or efficiency paths.",
    [
      `Fragility score ${robustness.fragilityScore}.`,
      `Median stickiness ${robustness.medianStickiness}.`,
      `Downside-to-base gap ${robustness.floorGap.toFixed(1)} points.`,
    ],
  );
}

function priceConfidence(candidate: DraftCandidate, blockers: string[]) {
  let score = 60;
  const drivers: string[] = [];
  if (candidate.market.adpSource === "direct") {
    score += 15;
    drivers.push("ADP is directly observed rather than inferred from rank.");
  } else if (candidate.market.adpSource === "rank-proxy") {
    score -= 15;
    blockers.push("Expected draft cost uses a rank-based ADP proxy.");
  } else {
    score -= 6;
    blockers.push("ADP provenance is not explicitly identified.");
  }

  const deviation = candidate.market.expertStdDev;
  if (typeof deviation === "number") {
    if (deviation <= 4) score += 15;
    else if (deviation <= 8) score += 8;
    else if (deviation > 12) score -= 10;
    drivers.push(`Expert rank deviation is ${deviation.toFixed(1)}.`);
  } else {
    score -= 8;
    blockers.push("No expert-rank dispersion is available for price reliability.");
  }

  const adpEcrGap = Math.abs(candidate.market.adp - candidate.market.ecr);
  if (adpEcrGap <= 5) score += 10;
  else if (adpEcrGap <= 12) score += 5;
  else if (adpEcrGap > 25) score -= 8;
  drivers.push(`ADP and ECR differ by ${adpEcrGap.toFixed(1)} slots.`);

  if (typeof (candidate.market.yahooXRank ?? candidate.market.yahooRank) === "number") {
    score += 10;
    drivers.push("Yahoo XRank independently informs expected room visibility.");
  }

  if (typeof candidate.market.rankSpread === "number") {
    const spread = candidate.market.rankSpread;
    const penalty = spread >= 80 ? 22 : spread >= 50 ? 14 : spread >= 30 ? 7 : 0;
    score -= penalty;
    drivers.push(`Captured expert Rank Spread is ${spread.toFixed(0)}.`);
    if (penalty >= 14) blockers.push("Expert disagreement is wide; availability should be expressed as a range.");
  }

  return dimension(
    score,
    score >= 78
      ? "Expected acquisition cost is supported by direct and relatively aligned market evidence."
      : score >= 58
        ? "Expected cost is usable, but should be treated as a draft-room range."
        : "Expected acquisition cost is mostly inferred and should not drive precise reach decisions.",
    drivers,
  );
}

function identityStatus(candidate: DraftCandidate) {
  const ids = Object.values(candidate.player.externalIds).filter(Boolean).length;
  if (ids >= 2) return "verified" as const;
  if (ids === 1) return "partial" as const;
  return "unresolved" as const;
}

export function buildEvidenceConfidence(input: {
  candidate: DraftCandidate;
  expectedOpportunity: CandidateExpectedOpportunitySnapshot;
  roleSecurity: CandidateRoleSecuritySnapshot;
  robustness: ProjectionRobustnessSnapshot;
  situation: CandidateSituationAssessment;
}): CandidateEvidenceConfidenceSnapshot {
  const blockers: string[] = [];
  const identity = identityStatus(input.candidate);
  if (identity === "partial" && input.candidate.seasonMarket) {
    blockers.push("Season-market identity is matched by normalized name and position, not a stable provider ID.");
  } else if (identity === "unresolved") {
    blockers.push("Player identity is unresolved; cross-provider evidence should not be trusted.");
  }

  const projection = projectionConfidence(input.candidate, blockers);
  const role = roleConfidence(
    input.candidate,
    input.expectedOpportunity,
    input.roleSecurity,
    input.situation,
    blockers,
  );
  const robustness = robustnessConfidence(input.robustness);
  const price = priceConfidence(input.candidate, blockers);
  return {
    projection,
    role,
    robustness,
    price,
    identity,
    blockers: [...new Set(blockers)].slice(0, 5),
  };
}
