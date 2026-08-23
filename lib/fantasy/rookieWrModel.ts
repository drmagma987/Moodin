import { buildAdvancedResearchAdjustedStats } from "@/lib/fantasy/advancedResearchShadow";
import { rookieWrValidation } from "@/lib/fantasy/data/rookieWrValidation.generated";
import { scoreStatProjection } from "@/lib/fantasy/scoring";
import type { DraftCandidate, LeagueConfig } from "@/lib/fantasy/types";

export type RookieWrModelMode = "off" | "shadow" | "production";

export type RookieWrIntegrationResult = {
  candidates: DraftCandidate[];
  mode: RookieWrModelMode;
  activationEligible: boolean;
  appliedCount: number;
  blockedReason: string | null;
};

type RookieWrActivationGate = {
  activationEligible: boolean;
  breakoutActivationEligible?: boolean;
  modelVersion?: string;
  blockers: readonly string[];
  selectedAdjustment?: {
    efficiencyWeight: number;
    opportunityWeight: number;
    maxPercent: number;
  };
  productionModel?: {
    lane: string;
    components: Record<string, {
      baseline: { mean: readonly number[]; std: readonly number[]; beta: readonly number[] };
      residual: { mean: readonly number[]; std: readonly number[]; beta: readonly number[] } | null;
    }>;
  };
  segments?: {
    directAdp?: { opportunityMaeImprovement: number; opportunityRankLift: number };
    proxyAdp?: { opportunityMaeImprovement: number; opportunityRankLift: number };
  };
};

function ridgePrediction(
  model: { mean: readonly number[]; std: readonly number[]; beta: readonly number[] },
  features: number[],
) {
  return model.beta[0] + features.reduce(
    (sum, value, index) => sum + ((value - model.mean[index]) / model.std[index]) * model.beta[index + 1],
    0,
  );
}

function componentScore(candidate: DraftCandidate, key: string) {
  return candidate.advancedResearch?.components.find((component) => component.key === key)?.score ?? 50;
}

function draftPick(candidate: DraftCandidate) {
  const summary = candidate.advancedResearch?.components.find((component) => component.key === "draft-capital")?.summary;
  const match = summary?.match(/(?:pick|at pick)\s+(\d+)/i);
  return match ? Number(match[1]) : 258;
}

function depthRank(candidate: DraftCandidate) {
  for (const note of candidate.context?.notes ?? []) {
    const match = note.match(/depth order\s+(\d+)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function opportunityTargetAdjustment(
  candidate: DraftCandidate,
  validation: RookieWrActivationGate,
  league: LeagueConfig,
) {
  const component = validation.productionModel?.components.targetsPerGame;
  if (!component?.residual) return null;
  const depth = depthRank(candidate);
  const marketFeatures = [
    Math.log1p(candidate.market.adp),
    Math.log1p(draftPick(candidate)),
    candidate.market.adpSource === "direct" ? 1 : 0,
  ];
  const opportunityFeatures = [
    depth !== null && depth <= 3 ? 1 : 0,
    depth === null ? 0 : 1 / Math.max(1, depth),
    (componentScore(candidate, "college-opportunity") - 50) / 50,
    (componentScore(candidate, "breakout-age") - 50) / 50,
  ];
  const marketTargetsPerGame = Math.max(0.1, ridgePrediction(component.baseline, marketFeatures));
  const residualTargetsPerGame = ridgePrediction(component.residual, opportunityFeatures);
  const opportunityTargetsPerGame = Math.max(0.1, marketTargetsPerGame + residualTargetsPerGame);
  const cap = validation.selectedAdjustment?.maxPercent ?? 0.08;
  const rawTargetVolumeDeltaPercent = Math.max(
    -cap,
    Math.min(cap, opportunityTargetsPerGame / marketTargetsPerGame - 1),
  );
  const directMarketTrusted = candidate.market.adpSource === "direct" &&
    (validation.segments?.directAdp?.opportunityMaeImprovement ?? -1) < 0;
  const targetVolumeDeltaPercent = directMarketTrusted ? 0 : rawTargetVolumeDeltaPercent;
  const stats = { ...candidate.projection.stats };
  for (const key of ["receptions", "receivingYards", "receivingTouchdowns"] as const) {
    const value = stats[key];
    if (typeof value === "number") stats[key] = Number((value * (1 + targetVolumeDeltaPercent)).toFixed(2));
  }
  const currentPoints = scoreStatProjection(candidate.projection.stats, league.scoring, { explicitMilestoneGamesOnly: true });
  const opportunityPoints = scoreStatProjection(stats, league.scoring, { explicitMilestoneGamesOnly: true });
  return {
    stats,
    marketTargetsPerGame,
    opportunityTargetsPerGame,
    targetVolumeDeltaPercent,
    rawTargetVolumeDeltaPercent,
    directMarketTrusted,
    delta: opportunityPoints - currentPoints,
  };
}

export function readRookieWrModelMode(value = process.env.FANTASY_ROOKIE_WR_MODEL_MODE): RookieWrModelMode {
  return value === "off" || value === "production" ? value : "shadow";
}

export function applyValidatedRookieWrModel(
  candidates: DraftCandidate[],
  league: LeagueConfig,
  options?: {
    mode?: RookieWrModelMode;
    validation?: RookieWrActivationGate;
  },
): RookieWrIntegrationResult {
  const mode = options?.mode ?? readRookieWrModelMode();
  const validation = options?.validation ?? rookieWrValidation;
  const enabled = mode === "production" && validation.activationEligible;
  const blockedReason = mode === "production" && !validation.activationEligible
    ? validation.blockers.join(" ")
    : null;
  let appliedCount = 0;

  const next = candidates.map((candidate) => {
    const research = candidate.advancedResearch;
    if (research?.lane !== "rookie-wr" || research.status !== "backtest-ready") {
      return candidate;
    }
    if (mode === "off") return candidate;
    const modeled = opportunityTargetAdjustment(candidate, validation, league);
    const stats = modeled?.stats ?? buildAdvancedResearchAdjustedStats(candidate, {
      rookieWrAdjustment: validation.selectedAdjustment ?? rookieWrValidation.selectedAdjustment,
    });
    const currentPoints = scoreStatProjection(candidate.projection.stats, league.scoring, {
      explicitMilestoneGamesOnly: true,
    });
    const adjustedPoints = scoreStatProjection(stats, league.scoring, {
      explicitMilestoneGamesOnly: true,
    });
    const delta = adjustedPoints - currentPoints;
    const opportunity = {
      modelVersion: validation.modelVersion ?? "legacy-research-adjustment",
      mode: enabled ? "production" as const : "shadow" as const,
      deploymentScope: enabled
        ? "validated-production" as const
        : modeled?.directMarketTrusted
          ? "market-trusted" as const
          : "proxy-only-shadow" as const,
      marketMedian: candidate.projection.range.p50,
      opportunityMedian: Number((candidate.projection.range.p50 + delta).toFixed(2)),
      medianDelta: Number(delta.toFixed(2)),
      marketTargetsPerGame: Number((modeled?.marketTargetsPerGame ?? 0).toFixed(2)),
      opportunityTargetsPerGame: Number((modeled?.opportunityTargetsPerGame ?? 0).toFixed(2)),
      targetVolumeDeltaPercent: Number((modeled?.targetVolumeDeltaPercent ?? 0).toFixed(4)),
      activationEligible: validation.activationEligible,
      breakoutEligible: validation.breakoutActivationEligible ?? false,
      summary: modeled
        ? modeled.directMarketTrusted
          ? `Direct preseason ADP is trusted here: the opportunity lane regressed direct-market MAE ${(Math.abs(validation.segments?.directAdp?.opportunityMaeImprovement ?? 0) * 100).toFixed(1)}%, so its ${modeled.rawTargetVolumeDeltaPercent >= 0 ? "+" : ""}${(modeled.rawTargetVolumeDeltaPercent * 100).toFixed(1)}% target signal is withheld.`
          : `For proxy-priced rookies, NFL opportunity implies ${modeled.targetVolumeDeltaPercent >= 0 ? "+" : ""}${(modeled.targetVolumeDeltaPercent * 100).toFixed(1)}% target volume; the historical proxy segment improved MAE ${((validation.segments?.proxyAdp?.opportunityMaeImprovement ?? 0) * 100).toFixed(1)}%, but remains shadow-only.`
        : "Legacy research comparison; serialized target-volume model was unavailable.",
    };
    if (!enabled) {
      return { ...candidate, rookieWrOpportunity: opportunity } satisfies DraftCandidate;
    }
    appliedCount += 1;
    return {
      ...candidate,
      projection: {
        ...candidate.projection,
        stats,
        range: {
          p10: Number((candidate.projection.range.p10 + delta * 0.75).toFixed(2)),
          p50: Number((candidate.projection.range.p50 + delta).toFixed(2)),
          p90: Number((candidate.projection.range.p90 + delta * 1.25).toFixed(2)),
        },
      },
      advancedResearch: {
        ...research,
        rankingImpact: "production" as const,
        blockers: research.blockers.filter((blocker) => !/historical backtest/i.test(blocker)),
        summary: `${research.summary} The validated rookie-WR adjustment is active in production.`,
      },
      rookieWrOpportunity: opportunity,
    } satisfies DraftCandidate;
  });

  return {
    candidates: next,
    mode,
    activationEligible: validation.activationEligible,
    appliedCount,
    blockedReason,
  };
}
