import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { DraftCandidate, StatProjection } from "@/lib/fantasy/types";

function projectedCount(projectedYards: number, priorYards: number, priorCount: number, threshold: number) {
  if (projectedYards <= 0 || priorYards <= 0 || priorCount <= 0) return 0;
  const volumeAdjusted = priorCount * (projectedYards / priorYards);
  return Number(Math.min(17, projectedYards / threshold, volumeAdjusted).toFixed(2));
}

export function applyMilestoneGameProjection(
  candidate: DraftCandidate,
  prior: NflversePlayerSeasonStats | undefined,
) {
  if (!prior) return candidate;
  const stats: StatProjection = { ...candidate.projection.stats };
  stats.passing300Games = projectedCount(stats.passingYards ?? 0, prior.passingYards, prior.passing300Games ?? 0, 300);
  stats.rushing100Games = projectedCount(stats.rushingYards ?? 0, prior.rushingYards, prior.rushing100Games ?? 0, 100);
  stats.receiving100Games = projectedCount(stats.receivingYards ?? 0, prior.receivingYards, prior.receiving100Games ?? 0, 100);
  return { ...candidate, projection: { ...candidate.projection, stats } } satisfies DraftCandidate;
}
