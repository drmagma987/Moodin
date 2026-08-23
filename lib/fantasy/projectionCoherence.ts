import type { PlayerPosition, StatProjection } from "@/lib/fantasy/types";

export type ProjectionCoherenceIssue = {
  code: "negative-stat" | "receiving-yards-per-reception";
  message: string;
};

const RECEIVING_YPR_BOUNDS: Partial<Record<PlayerPosition, { min: number; max: number }>> = {
  RB: { min: 5, max: 14 },
  WR: { min: 8, max: 20 },
  TE: { min: 7, max: 17 },
};

export function assessProjectionCoherence(
  position: PlayerPosition,
  stats: StatProjection,
): ProjectionCoherenceIssue[] {
  const issues: ProjectionCoherenceIssue[] = [];
  for (const [stat, value] of Object.entries(stats)) {
    // A player can record a small negative yardage total; event/count fields
    // cannot be negative. Keep those two concepts distinct in the invariant.
    if (typeof value === "number" && value < 0 && !stat.endsWith("Yards") && stat !== "pointsAllowed") {
      issues.push({ code: "negative-stat", message: `${stat} cannot be negative (${value}).` });
    }
  }

  const receptions = stats.receptions;
  const receivingYards = stats.receivingYards;
  const bounds = RECEIVING_YPR_BOUNDS[position];
  if (
    bounds &&
    typeof receptions === "number" &&
    receptions >= 8 &&
    typeof receivingYards === "number"
  ) {
    const yardsPerReception = receivingYards / receptions;
    if (yardsPerReception < bounds.min || yardsPerReception > bounds.max) {
      issues.push({
        code: "receiving-yards-per-reception",
        message: `${yardsPerReception.toFixed(2)} projected yards per reception is outside the ${bounds.min}-${bounds.max} ${position} range.`,
      });
    }
  }

  return issues;
}
