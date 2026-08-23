import type { DraftCandidate, PlayerPosition } from "@/lib/fantasy/types";

export type DraftDataQualityStatus = "ready" | "degraded" | "blocked";

export type DraftDataQualitySnapshot = {
  status: DraftDataQualityStatus;
  candidateCount: number;
  directAdpCount: number;
  positionCounts: Partial<Record<PlayerPosition, number>>;
  issues: string[];
  summary: string;
};

const MINIMUM_POSITION_COUNTS: Partial<Record<PlayerPosition, number>> = {
  QB: 25,
  RB: 60,
  WR: 80,
  TE: 25,
};
const MINIMUM_CANDIDATES = 220;
const MINIMUM_DIRECT_ADP = 120;

export function assessDraftDataQuality(candidates: DraftCandidate[]): DraftDataQualitySnapshot {
  const positionCounts: Partial<Record<PlayerPosition, number>> = {};
  for (const candidate of candidates) {
    const position = candidate.player.positions[0] ?? "WR";
    positionCounts[position] = (positionCounts[position] ?? 0) + 1;
  }

  const issues: string[] = [];
  if (candidates.length < MINIMUM_CANDIDATES) {
    issues.push(`Only ${candidates.length} draft candidates loaded; at least ${MINIMUM_CANDIDATES} are required.`);
  }
  for (const [position, minimum] of Object.entries(MINIMUM_POSITION_COUNTS)) {
    const count = positionCounts[position as PlayerPosition] ?? 0;
    if (count < minimum) {
      issues.push(`${position} coverage is ${count}; at least ${minimum} players are required.`);
    }
  }

  const directAdpCount = candidates.filter(
    (candidate) =>
      candidate.market.adpSource === "direct" &&
      Number.isFinite(candidate.market.adp) &&
      candidate.market.adp > 0,
  ).length;
  const invalidMarketCount = candidates.filter(
    (candidate) =>
      !Number.isFinite(candidate.market.ecr) ||
      candidate.market.ecr <= 0 ||
      !Number.isFinite(candidate.market.adp) ||
      candidate.market.adp <= 0,
  ).length;
  if (invalidMarketCount > 0) {
    issues.push(`${invalidMarketCount} players have invalid overall ECR or ADP values.`);
  }
  if (directAdpCount < MINIMUM_DIRECT_ADP) {
    issues.push(`Only ${directAdpCount} players have verified overall ADP; at least ${MINIMUM_DIRECT_ADP} are required.`);
  }

  const coverageBlocked =
    candidates.length < MINIMUM_CANDIDATES ||
    directAdpCount < MINIMUM_DIRECT_ADP ||
    Object.entries(MINIMUM_POSITION_COUNTS).some(
      ([position, minimum]) => (positionCounts[position as PlayerPosition] ?? 0) < minimum,
    );
  const status: DraftDataQualityStatus = coverageBlocked
    ? "blocked"
    : issues.length > 0
      ? "degraded"
      : "ready";

  return {
    status,
    candidateCount: candidates.length,
    directAdpCount,
    positionCounts,
    issues,
    summary:
      status === "ready"
        ? `${candidates.length} ranked players and ${directAdpCount} verified overall ADPs passed coverage checks.`
        : `${candidates.length} ranked players and ${directAdpCount} verified overall ADPs; ${issues.join(" ")}`,
  };
}
