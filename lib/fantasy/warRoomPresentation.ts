import type { DraftBoardSignal, LiveDraftActionLabel } from "@/lib/fantasy/draftSignals";
import type {
  CandidateRecommendation,
  DraftCandidate,
  DraftTurnContext,
  PositionRunSnapshot,
} from "@/lib/fantasy/types";

export type WarRoomDraftCall =
  | "Smash Now"
  | "Good Value"
  | "Fair Value"
  | "Too Early"
  | "Pass";

export type WarRoomRecommendationExplanation = {
  driver: "Unpassable value" | "Position demand" | "Alternatives thinning" | "Good market price" | "Reliable workload" | "Best available fit";
  whyNow: string;
  supportingWhy: string;
  chanceBack: string;
  price: string;
  comparison: string | null;
  turnLabel: string | null;
  turnSummary: string | null;
};

export function warRoomDraftCall(
  action: LiveDraftActionLabel,
  signal: DraftBoardSignal,
): WarRoomDraftCall {
  if (action === "Smash Now") return "Smash Now";
  if (action === "Target") return "Good Value";
  if (action === "Fair") return "Fair Value";
  if (action === "Avoid") return "Pass";
  return signal.valueLabel === "Early vs ADP" ? "Too Early" : "Pass";
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function explainWarRoomRecommendation(input: {
  candidate: DraftCandidate;
  recommendation: CandidateRecommendation;
  signal: DraftBoardSignal;
  runSnapshot?: PositionRunSnapshot;
  positionalComparison?: DraftCandidate | null;
  turnContext?: DraftTurnContext;
}): WarRoomRecommendationExplanation {
  const { candidate, recommendation, signal, runSnapshot, positionalComparison, turnContext } = input;
  const position = candidate.player.positions[0] ?? "WR";
  const chanceBack = Math.round(recommendation.explanation.makeItBackProbability * 100);
  const teamsWithNeed = (runSnapshot?.teamsWithStarterNeed ?? 0) + (runSnapshot?.teamsWithFlexNeed ?? 0);
  const expectedSelections = runSnapshot?.expectedSelectionsBeforeNextTurn ?? recommendation.explanation.expectedPositionSelections;
  const priceGap = Math.round(candidate.market.adp - recommendation.explanation.ourBoardRank);
  const comparison = positionalComparison
    ? `The next comparable ${position} is ${positionalComparison.player.fullName}.`
    : null;
  const comparisonPointGap = positionalComparison
    ? Math.max(0, candidate.projection.range.p50 - positionalComparison.projection.range.p50)
    : 0;

  let driver: WarRoomRecommendationExplanation["driver"] = "Best available fit";
  let whyNow = `${candidate.player.fullName} offers the strongest combination of projected production, roster fit, and current price.`;

  if (signal.valueLabel === "Strong value" && priceGap >= 6) {
    driver = "Unpassable value";
    whyNow = `Our overall model board ranks him ${priceGap} picks ahead of his current ADP, and simulations give him only a ${chanceBack}% chance to reach your next pick.`;
  } else if (chanceBack <= 35 && teamsWithNeed > 0) {
    driver = "Position demand";
    whyNow = `${plural(teamsWithNeed, "team")} selecting before your next turn can still use a ${position}; the model expects ${expectedSelections.toFixed(1)} ${position} selections before then.`;
  } else if (runSnapshot && runSnapshot.tierSurvivalProbability <= 0.5 && positionalComparison) {
    driver = "Alternatives thinning";
    whyNow = `${candidate.player.fullName} has only a ${chanceBack}% chance to return, and ${positionalComparison.player.fullName} is the next comparable ${position} currently available.`;
  } else if (signal.valueLabel === "Value" || signal.valueLabel === "Strong value") {
    driver = "Good market price";
    whyNow = `Our overall model board ranks him #${recommendation.explanation.ourBoardRank} versus ADP ${candidate.market.adp}, a ${Math.max(0, priceGap)}-pick discount at the current market price.`;
  } else if (candidate.signals?.roleSecurity.label === "secure") {
    driver = "Reliable workload";
    whyNow = `His expected role is one of the more dependable options still available, while the model gives him a ${chanceBack}% chance to reach your next pick.`;
  } else if (teamsWithNeed > 0) {
    driver = "Position demand";
    whyNow = `${plural(teamsWithNeed, "team")} before your next selection can still use a ${position}, with ${expectedSelections.toFixed(1)} selections at the position expected before then.`;
  }

  return {
    driver,
    whyNow,
    supportingWhy: positionalComparison
      ? comparisonPointGap >= 1
        ? `The next comparable ${position}, ${positionalComparison.player.fullName}, projects ${comparisonPointGap.toFixed(0)} fewer median points.`
        : `${positionalComparison.player.fullName} is the next comparable ${position}, so this is the relevant alternative if you wait.`
      : candidate.market.yahooXRank != null || candidate.market.yahooRank != null
        ? `Model rank #${recommendation.explanation.ourBoardRank} versus Yahoo #${candidate.market.yahooXRank ?? candidate.market.yahooRank} shows the room-price gap.`
        : `His projected range runs from ${candidate.projection.range.p10.toFixed(0)} to ${candidate.projection.range.p90.toFixed(0)} points.`,
    chanceBack: `${chanceBack}% chance available at your next pick`,
    price: `Overall model board #${recommendation.explanation.ourBoardRank} · ADP ${candidate.market.adp}`,
    comparison,
    turnLabel: turnContext?.label ?? null,
    turnSummary: turnContext?.summary ?? null,
  };
}
