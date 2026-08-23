import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { CandidateAdvancedUsageSnapshot, PlayerPosition } from "@/lib/fantasy/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function weightedOpportunityRating(stats: NflversePlayerSeasonStats | undefined) {
  if (!stats || !["WR", "TE"].includes(stats.position)) return null;
  return Number((1.5 * stats.targetShare + 0.7 * stats.airYardsShare).toFixed(4));
}

export function populationMoments(values: number[]) {
  if (values.length === 0) return { mean: 0, standardDeviation: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

export function positionalZScore(value: number, mean: number, standardDeviation: number) {
  if (standardDeviation <= 0) return 0;
  return Number(((value - mean) / standardDeviation).toFixed(3));
}

export function ageFragilityPoints(position: PlayerPosition, age: number | undefined) {
  if (age === undefined || !Number.isFinite(age)) return 0;
  if (position === "RB") {
    if (age < 25) return 0;
    if (age < 26) return 1;
    if (age < 27) return 2;
    if (age < 28) return 4;
    if (age < 29) return 6;
    return 8;
  }
  if (position === "WR") {
    if (age < 29) return 0;
    if (age < 30) return 1.5;
    if (age < 31) return 3;
    if (age < 32) return 5;
    return 7;
  }
  return 0;
}

export function buildAdvancedUsageSnapshot(input: {
  position: PlayerPosition;
  stats?: NflversePlayerSeasonStats;
  opportunityZScore: number | null;
  age?: number;
}) {
  const wopr = weightedOpportunityRating(input.stats);
  const ageRisk = ageFragilityPoints(input.position, input.age);
  const evidence: string[] = [];
  if (wopr !== null) {
    evidence.push(`WOPR ${(wopr * 100).toFixed(1)} combines target share and air-yards share.`);
  }
  if (input.opportunityZScore !== null) {
    evidence.push(`Stable-opportunity Z-score ${input.opportunityZScore >= 0 ? "+" : ""}${input.opportunityZScore.toFixed(2)} versus the same position.`);
  }
  if (ageRisk > 0) {
    evidence.push(`Age ${input.age} adds ${ageRisk.toFixed(1)} bounded fragility points without reducing the median twice.`);
  }
  return {
    wopr,
    opportunityZScore: input.opportunityZScore,
    ageFragilityPoints: ageRisk,
    routeMetricsStatus: "unavailable" as const,
    highValueTouchStatus: "covered-by-expected-points" as const,
    summary: evidence.length > 0
      ? evidence.join(" ")
      : "Advanced usage evidence is incomplete; no proxy values were manufactured.",
    evidence,
  } satisfies CandidateAdvancedUsageSnapshot;
}

export function opportunityScoreFromZ(zScore: number) {
  return clamp(50 + zScore * 15, 5, 95);
}
