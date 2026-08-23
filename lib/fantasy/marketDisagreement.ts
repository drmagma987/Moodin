import { buildRedraftBoard } from "@/lib/fantasy/draft";
import type {
  DraftCandidate,
  LeagueConfig,
  MarketDisagreementBoard,
  MarketDisagreementClassification,
  MarketDisagreementEntry,
} from "@/lib/fantasy/types";

function independentTargetSupport(candidate: DraftCandidate, seasonDelta: number | null) {
  const signals = candidate.signals;
  return (
    (seasonDelta !== null && seasonDelta >= 0.75) ||
    signals?.dossier.stance === "priority-target" ||
    signals?.dossier.stance === "pocket-value" ||
    (signals?.expectedOpportunity.label === "strong" && signals.roleSecurity.label !== "fragile") ||
    signals?.scoringProfile.label === "volume-backed"
  ) && signals?.situation.certainty !== "low";
}

function independentAvoidSupport(candidate: DraftCandidate, seasonDelta: number | null) {
  const signals = candidate.signals;
  return (
    (seasonDelta !== null && seasonDelta <= -0.75) ||
    signals?.dossier.stance === "market-trap" ||
    (signals?.expectedOpportunity.label === "thin" && signals.roleSecurity.label === "fragile") ||
    signals?.scoringProfile.label === "touchdown-fragile" ||
    signals?.regression.direction === "negative"
  );
}

function classifyDisagreement(
  candidate: DraftCandidate,
  rankEdge: number,
  seasonDelta: number | null,
): MarketDisagreementClassification | null {
  if (
    candidate.signals?.situation.certainty === "low" &&
    Math.abs(rankEdge) >= 3
  ) {
    return "contested";
  }
  const modelDirection = rankEdge >= 3 ? 1 : rankEdge <= -3 ? -1 : 0;
  const seasonDirection =
    seasonDelta === null ? 0 : seasonDelta >= 2 ? 1 : seasonDelta <= -2 ? -1 : 0;

  if (
    (modelDirection !== 0 && seasonDirection !== 0 && modelDirection !== seasonDirection) ||
    (Math.abs(rankEdge) < 3 && seasonDirection !== 0 && Math.abs(seasonDelta ?? 0) >= 5)
  ) {
    return "contested";
  }
  if (rankEdge >= 3 && independentTargetSupport(candidate, seasonDelta)) {
    return "target";
  }
  if (rankEdge <= -3 && independentAvoidSupport(candidate, seasonDelta)) {
    return "avoid";
  }
  return null;
}

function buildAcquisitionWindow(
  classification: MarketDisagreementClassification,
  consensusRank: number,
  modelRank: number,
  teams: number,
) {
  const marketRound = Math.max(1, Math.ceil(consensusRank / teams));
  const modelRound = Math.max(1, Math.ceil(modelRank / teams));
  if (classification === "target") {
    const earliestRound = Math.max(1, Math.min(marketRound, Math.max(modelRound, marketRound - 1)));
    return earliestRound < marketRound
      ? `Target from Round ${earliestRound}; normal market cost is about Round ${marketRound}.`
      : `Take at normal Round ${marketRound} cost; do not wait for an unnecessary discount.`;
  }
  if (classification === "avoid") {
    const discountRound = Math.max(marketRound + 1, Math.min(modelRound, marketRound + 2));
    return `Pass near Round ${marketRound}; reconsider only around Round ${discountRound} or later.`;
  }
  return `Do not reach ahead of Round ${marketRound}; inspect the conflict if he reaches normal cost.`;
}

function buildEvidence(
  candidate: DraftCandidate,
  rankEdge: number,
  seasonDelta: number | null,
) {
  const signals = candidate.signals;
  const evidence = [
    `Our redraft board is ${Math.abs(rankEdge)} spot${Math.abs(rankEdge) === 1 ? "" : "s"} ${rankEdge >= 0 ? "ahead of" : "behind"} consensus.`,
  ];

  if (seasonDelta !== null) {
    evidence.push(
      `The season-market blend moved the Yahoo projection ${seasonDelta >= 0 ? "+" : ""}${seasonDelta.toFixed(1)} points.`,
    );
  }
  if (signals?.expectedOpportunity.label && signals.expectedOpportunity.label !== "none") {
    evidence.push(`Expected opportunity is ${signals.expectedOpportunity.label}.`);
  }
  if (signals?.roleSecurity.label && signals.roleSecurity.label !== "unknown") {
    evidence.push(`Role security is ${signals.roleSecurity.label}.`);
  }
  if (signals?.scoringProfile.label && signals.scoringProfile.label !== "balanced") {
    evidence.push(`Scoring profile is ${signals.scoringProfile.label}.`);
  }
  if (signals?.regression.direction === "positive" || signals?.regression.direction === "negative") {
    evidence.push(`Regression signal is ${signals.regression.direction}.`);
  }

  return evidence.slice(0, 4);
}

function buildEntry(
  candidate: DraftCandidate,
  classification: MarketDisagreementClassification,
  modelRank: number,
  consensusRank: number,
  teams: number,
): MarketDisagreementEntry {
  const rankEdge = consensusRank - modelRank;
  const seasonDelta = candidate.seasonMarket?.projectionDelta ?? null;
  const projectionEvidence = candidate.signals?.evidenceConfidence.projection.level ?? "low";
  const situationCertainty = candidate.signals?.situation.certainty ?? "low";
  const fragility = candidate.signals?.robustness.fragilityScore ?? 50;
  const independentMagnitude = Math.abs(seasonDelta ?? 0);
  const evidenceBonus =
    (projectionEvidence === "high" ? 6 : projectionEvidence === "medium" ? 3 : 0) +
    (situationCertainty === "high" ? 4 : situationCertainty === "medium" ? 2 : 0);
  const classificationBonus =
    classification === "target"
      ? Math.max(0, 60 - fragility) * 0.18
      : classification === "avoid"
        ? Math.max(0, fragility - 45) * 0.24
        : 10;
  const disagreementScore = Number(
    (Math.min(Math.abs(rankEdge), 60) * 2 + independentMagnitude * 0.9 + evidenceBonus + classificationBonus).toFixed(1),
  );
  const name = candidate.player.fullName;
  const headline =
    classification === "target"
      ? `${name} is cheaper than our evidence stack says he should be`
      : classification === "avoid"
        ? `${name} is carrying a consensus price our model does not support`
        : `${name} has a real model-versus-season-market conflict`;
  const summary =
    classification === "target"
      ? `This is an actionable value only because the redraft rank edge has independent statistical or role support.`
      : classification === "avoid"
        ? `The normal draft cost is too aggressive relative to the format-aware projection and risk profile.`
        : `Do not force a target or fade: the disagreement identifies an assumption that needs draft-week review.`;
  const caution =
    classification === "target"
      ? candidate.signals?.dossier.failureModes[0] ?? "The edge disappears if the role or health assumption changes."
      : classification === "avoid"
        ? candidate.signals?.dossier.whatHasToGoRight[0] ?? "A meaningful discount can turn an avoid into a fair bet."
        : candidate.seasonMarket?.summary ?? "The projection sources are not telling the same story.";

  return {
    playerId: candidate.player.id,
    classification,
    disagreementScore,
    modelRank,
    consensusRank,
    rankEdge,
    projectedYahooPoints: Number(candidate.projection.range.p50.toFixed(1)),
    seasonMarketDelta: seasonDelta,
    seasonMarketRank: candidate.seasonMarket?.sourceRank ?? null,
    projectionEvidence,
    situationCertainty,
    likelyRound: Math.max(1, Math.ceil(consensusRank / teams)),
    acquisitionWindow: buildAcquisitionWindow(classification, consensusRank, modelRank, teams),
    headline,
    summary,
    evidence: buildEvidence(candidate, rankEdge, seasonDelta),
    caution,
  };
}

export function buildMarketDisagreementBoard(
  candidates: DraftCandidate[],
  league: LeagueConfig,
  options?: { limitPerBucket?: number; generatedAt?: string },
): MarketDisagreementBoard {
  const redraftBoard = buildRedraftBoard(candidates, league);
  const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
  const skillRosterRounds = Math.max(
    1,
    league.rosterSlots.filter((slot) => !["IR", "K", "DST", "DEF"].includes(slot)).length,
  );
  const realisticDraftPool = league.teams * skillRosterRounds;
  const entries = redraftBoard.flatMap((boardEntry) => {
    const candidate = candidateById.get(boardEntry.playerId);
    if (
      !candidate ||
      boardEntry.marketRank > realisticDraftPool ||
      (boardEntry.boardRank > realisticDraftPool && boardEntry.boardEdge > 0) ||
      (candidate.player.positions[0] === "QB" && boardEntry.positionRank > league.teams * 2)
    ) {
      return [];
    }
    const classification = classifyDisagreement(
      candidate,
      boardEntry.boardEdge,
      candidate.seasonMarket?.projectionDelta ?? null,
    );
    return classification
      ? [
          buildEntry(
            candidate,
            classification,
            boardEntry.boardRank,
            boardEntry.marketRank,
            league.teams,
          ),
        ]
      : [];
  });
  const limit = Math.max(1, options?.limitPerBucket ?? 6);
  const bucket = (classification: MarketDisagreementClassification) => {
    const positionCounts = new Map<string, number>();
    return entries
      .filter((entry) => entry.classification === classification)
      .sort((a, b) => b.disagreementScore - a.disagreementScore)
      .filter((entry) => {
        const position = candidateById.get(entry.playerId)?.player.positions[0] ?? "unknown";
        const count = positionCounts.get(position) ?? 0;
        if (count >= 2) {
          return false;
        }
        positionCounts.set(position, count + 1);
        return true;
      })
      .slice(0, limit);
  };
  const targets = bucket("target");
  const avoids = bucket("avoid");
  const contested = bucket("contested");

  return {
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    summary: `${targets.length} supported target${targets.length === 1 ? "" : "s"}, ${avoids.length} price-sensitive avoid${avoids.length === 1 ? "" : "s"}, and ${contested.length} projection conflict${contested.length === 1 ? "" : "s"} cleared the actionable disagreement thresholds.`,
    targets,
    avoids,
    contested,
  };
}
