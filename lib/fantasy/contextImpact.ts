import { buildRedraftBoard } from "@/lib/fantasy/draft";
import type {
  ContextImpactBoard,
  ContextImpactDecision,
  ContextImpactEntry,
  DraftCandidate,
  LeagueConfig,
} from "@/lib/fantasy/types";

function marketRankMap(candidates: DraftCandidate[]) {
  return new Map(
    [...candidates]
      .sort((a, b) => a.market.ecr - b.market.ecr)
      .map((candidate, index) => [candidate.player.id, index + 1] as const),
  );
}

function decisionFor(input: {
  marketEdge: number;
  pointsDelta: number;
  certainty: ContextImpactEntry["situationAfter"];
  directChange: boolean;
}): ContextImpactDecision {
  if (!input.directChange) return "hold";
  if (input.certainty === "low") return "contested";
  if (input.marketEdge >= 3 && input.pointsDelta >= 1) return "target";
  if (input.marketEdge <= -5 && input.pointsDelta <= -3) return "avoid";
  if (input.marketEdge <= -2 && input.pointsDelta <= -0.5) return "discount";
  return "hold";
}

function acquisitionGuidance(decision: ContextImpactDecision, marketRank: number, teams: number) {
  const marketRound = Math.max(1, Math.ceil(marketRank / teams));
  switch (decision) {
    case "target":
      return `Target around normal Round ${marketRound} cost; one-round aggression is justified only if the broader model edge remains intact.`;
    case "avoid":
      return `Pass near Round ${marketRound}; reconsider no earlier than Round ${marketRound + 2}.`;
    case "discount":
      return `Do not pay the Round ${marketRound} sticker price; reconsider in Round ${marketRound + 1} or later.`;
    case "contested":
      return `Do not reach ahead of Round ${marketRound}; resolve the named situation question first.`;
    case "hold":
    default:
      return `The qualitative pass does not justify changing normal Round ${marketRound} discipline.`;
  }
}

export function buildContextImpactBoard(
  beforeCandidates: DraftCandidate[],
  afterCandidates: DraftCandidate[],
  league: LeagueConfig,
  options?: { limit?: number; generatedAt?: string; excludePlayerNames?: string[] },
): ContextImpactBoard {
  const excludedNames = new Set(
    (options?.excludePlayerNames ?? []).map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  const beforeBoard = new Map(
    buildRedraftBoard(beforeCandidates, league).map((entry) => [entry.playerId, entry]),
  );
  const afterBoard = new Map(
    buildRedraftBoard(afterCandidates, league).map((entry) => [entry.playerId, entry]),
  );
  const beforeById = new Map(beforeCandidates.map((candidate) => [candidate.player.id, candidate]));
  const marketRanks = marketRankMap(afterCandidates);
  const entries = afterCandidates.flatMap((candidate): ContextImpactEntry[] => {
    if (excludedNames.has(candidate.player.fullName.toLowerCase().replace(/[^a-z0-9]/g, ""))) return [];
    const before = beforeById.get(candidate.player.id);
    const beforeRank = beforeBoard.get(candidate.player.id)?.boardRank;
    const afterRank = afterBoard.get(candidate.player.id)?.boardRank;
    if (!before || !beforeRank || !afterRank || !candidate.signals || !before.signals) return [];
    const rankChange = beforeRank - afterRank;
    const beforePoints = before.projection.range.p50;
    const afterPoints = candidate.projection.range.p50;
    const pointsDelta = Number((afterPoints - beforePoints).toFixed(2));
    const marketRank = marketRanks.get(candidate.player.id) ?? Math.round(candidate.market.ecr);
    const marketEdge = marketRank - afterRank;
    const directChange =
      Math.abs(pointsDelta) > 0.05 ||
      before.signals.situation.certainty !== candidate.signals.situation.certainty;
    const decision = decisionFor({
      marketEdge,
      pointsDelta,
      certainty: candidate.signals.situation.certainty,
      directChange,
    });
    const qualitative = candidate.context?.qualitative;
    const reasons = [
      ...candidate.signals.qualitativeAdjustment.drivers,
      ...(before.signals.situation.certainty !== candidate.signals.situation.certainty
        ? [`Situation certainty changed from ${before.signals.situation.certainty} to ${candidate.signals.situation.certainty}.`]
        : []),
      ...(qualitative?.agreements ?? []),
      ...(qualitative?.conflicts ?? []),
    ].slice(0, 4);
    const headline =
      decision === "target"
        ? "Source-backed context supports buying at normal cost."
        : decision === "avoid"
          ? "The situation correction makes normal market cost too aggressive."
          : decision === "discount"
            ? "The player remains draftable, but only after a price concession."
            : decision === "contested"
              ? "The context is not resolved enough for a target or fade."
              : rankChange > 0
                ? "The context pass improves the profile without changing draft discipline."
                : rankChange < 0
                  ? "The context pass lowers the profile without creating a hard fade."
                  : "The context pass does not materially change the board position.";
    return [{
      playerId: candidate.player.id,
      playerName: candidate.player.fullName,
      position: candidate.player.positions[0] ?? "WR",
      beforeRank,
      afterRank,
      rankChange,
      beforePoints: Number(beforePoints.toFixed(1)),
      afterPoints: Number(afterPoints.toFixed(1)),
      pointsDelta,
      marketRank,
      marketEdge,
      decision,
      situationBefore: before.signals.situation.certainty,
      situationAfter: candidate.signals.situation.certainty,
      sourceCount: qualitative?.sourceCount ?? 0,
      headline,
      reasons,
      acquisitionGuidance: acquisitionGuidance(decision, marketRank, league.teams),
    }];
  });
  const realisticDraftPoolMax = league.teams * 20;
  const directlyChanged = entries.filter((entry) =>
    entry.sourceCount > 0 &&
    entry.marketRank <= realisticDraftPoolMax &&
    entry.afterRank <= realisticDraftPoolMax &&
    (Math.abs(entry.pointsDelta) > 0.05 || entry.situationBefore !== entry.situationAfter),
  );
  const material = directlyChanged.filter((entry) =>
    Math.abs(entry.rankChange) >= 2 ||
    Math.abs(entry.pointsDelta) >= 2 ||
    entry.situationBefore !== entry.situationAfter ||
    entry.decision !== "hold",
  );
  const importance = (entry: ContextImpactEntry) =>
    Math.abs(entry.rankChange) * 3 + Math.abs(entry.pointsDelta) + Math.abs(entry.marketEdge) * 0.25;
  const limit = options?.limit ?? 12;
  const risers = directlyChanged
    .filter((entry) => entry.rankChange > 0 || entry.pointsDelta > 0.5)
    .sort((a, b) => b.rankChange - a.rankChange || b.pointsDelta - a.pointsDelta)
    .slice(0, limit);
  const fallers = directlyChanged
    .filter((entry) => entry.rankChange < 0 || entry.pointsDelta < -0.5)
    .sort((a, b) => a.rankChange - b.rankChange || a.pointsDelta - b.pointsDelta)
    .slice(0, limit);
  const decisions = directlyChanged
    .filter((entry) => entry.decision !== "hold")
    .sort((a, b) => importance(b) - importance(a))
    .slice(0, limit);

  return {
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    summary: `Compared the same statistical board with and without the one-time qualitative snapshot. ${material.length} players changed materially or produced an actionable price decision; projection corrections remain capped between -5% and +3%.`,
    materiallyChangedCount: material.length,
    risers,
    fallers,
    decisions,
  };
}
