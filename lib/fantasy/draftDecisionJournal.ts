import type { CandidateRecommendation, DraftCandidate, DraftState } from "@/lib/fantasy/types";

export type RecommendationStability = "robust" | "conditional" | "knife-edge";

export type DraftDecisionJournalEntry = {
  id: string;
  recordedAt: string;
  overallPick: number;
  selectedPlayerId: string;
  availablePlayerCount: number;
  rosterPlayerIds: string[];
  recommendations: Array<{
    playerId: string;
    rank: number;
    score: number;
    makeItBackProbability: number;
    tierSurvivalProbability: number;
    fragilityScore: number;
    stability: RecommendationStability;
    summary: string;
  }>;
};

export function classifyRecommendationStability(recommendation: CandidateRecommendation): RecommendationStability {
  const fragility = recommendation.explanation.fragilityScore;
  const survival = recommendation.explanation.tierSurvivalProbability;
  const stabilityLift = recommendation.explanation.stabilityBonus - recommendation.explanation.robustnessPenalty;
  if (fragility <= 28 && survival >= 0.55 && stabilityLift >= -0.5) return "robust";
  if (fragility >= 58 || survival < 0.28 || stabilityLift < -2) return "knife-edge";
  return "conditional";
}

export function recordDraftDecision(input: {
  state: DraftState;
  selectedPlayerId: string;
  recommendations: CandidateRecommendation[];
  candidates: DraftCandidate[];
  now?: string;
}): DraftDecisionJournalEntry {
  const now = input.now ?? new Date().toISOString();
  const myTeam = input.state.teams.find((team) => team.teamId === input.state.myTeamId);
  const byId = new Map(input.candidates.map((candidate) => [candidate.player.id, candidate] as const));
  return {
    id: `decision-${input.state.currentPick}-${input.selectedPlayerId}-${now}`,
    recordedAt: now,
    overallPick: input.state.currentPick,
    selectedPlayerId: input.selectedPlayerId,
    availablePlayerCount: input.state.availablePlayerIds.length,
    rosterPlayerIds: [...(myTeam?.starters ?? []), ...(myTeam?.bench ?? [])],
    recommendations: input.recommendations.slice(0, 3).map((recommendation, index) => ({
      playerId: recommendation.playerId,
      rank: index + 1,
      score: recommendation.score,
      makeItBackProbability: recommendation.explanation.makeItBackProbability,
      tierSurvivalProbability: recommendation.explanation.tierSurvivalProbability,
      fragilityScore: recommendation.explanation.fragilityScore,
      stability: classifyRecommendationStability(recommendation),
      summary: `${byId.get(recommendation.playerId)?.player.fullName ?? recommendation.playerId}: ${recommendation.explanation.valueCase}`,
    })),
  };
}
