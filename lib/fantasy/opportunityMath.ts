import { scoreStatProjection } from "@/lib/fantasy/scoring";
import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { FantasyScoringRules, PlayerPosition, StatProjection } from "@/lib/fantasy/types";

export function projectionFromNflverseStats(stats: NflversePlayerSeasonStats): StatProjection {
  return {
    passingYards: stats.passingYards,
    passingTouchdowns: stats.passingTouchdowns,
    rushingYards: stats.rushingYards,
    rushingTouchdowns: stats.rushingTouchdowns,
    receptions: stats.receptions,
    receivingYards: stats.receivingYards,
    receivingTouchdowns: stats.receivingTouchdowns,
  };
}

export function actualSeasonFantasyPoints(
  stats: NflversePlayerSeasonStats,
  rules: FantasyScoringRules,
) {
  return scoreStatProjection(projectionFromNflverseStats(stats), rules);
}

export function expectedOpportunityPoints(
  position: PlayerPosition,
  stats: NflversePlayerSeasonStats,
  rules: FantasyScoringRules,
) {
  if (position === "QB") {
    const expectedPassingTouchdowns = stats.attempts / 25;
    const expectedRushingTouchdowns = stats.carries / 42;
    return (
      stats.attempts * 0.5 +
      stats.passingYards * 0.05 +
      stats.carries * 0.52 +
      stats.rushingYards * 0.1 +
      expectedPassingTouchdowns * rules.passingTouchdownPoints +
      expectedRushingTouchdowns * rules.rushingTouchdownPoints
    );
  }

  if (position === "RB") {
    const expectedTouchdowns = stats.carries / 42 + stats.targets / 24;
    return (
      stats.carries * 0.63 +
      stats.targets * (0.72 + rules.receptionPoints * 0.52) +
      stats.targetShare * 34 +
      expectedTouchdowns * rules.rushingTouchdownPoints
    );
  }

  if (position === "WR") {
    const expectedTouchdowns = stats.targets / 22 + stats.airYardsShare * 4.5;
    return (
      stats.targets * (1.02 + rules.receptionPoints * 0.66) +
      stats.targetShare * 46 +
      stats.airYardsShare * 26 +
      expectedTouchdowns * rules.receivingTouchdownPoints
    );
  }

  if (position === "TE") {
    const expectedTouchdowns = stats.targets / 20 + stats.airYardsShare * 3.2;
    return (
      stats.targets * (0.96 + rules.receptionPoints * 0.7) +
      stats.targetShare * 42 +
      stats.airYardsShare * 18 +
      expectedTouchdowns * rules.receivingTouchdownPoints
    );
  }

  return null;
}
