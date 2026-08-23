import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import { scoreStatProjection } from "@/lib/fantasy/scoring";
import type {
  CandidateScoringProfileSnapshot,
  DraftCandidate,
  FantasyScoringRules,
  PlayerPosition,
  StatProjection,
} from "@/lib/fantasy/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function projectionFromNflverseStats(stats: NflversePlayerSeasonStats): StatProjection {
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

function touchdownOnlyProjection(stats: StatProjection): StatProjection {
  return {
    passingTouchdowns: stats.passingTouchdowns ?? 0,
    rushingTouchdowns: stats.rushingTouchdowns ?? 0,
    receivingTouchdowns: stats.receivingTouchdowns ?? 0,
    returnTouchdowns: stats.returnTouchdowns ?? 0,
    offensiveFumbleReturnTouchdowns: stats.offensiveFumbleReturnTouchdowns ?? 0,
  };
}

function touchdownShare(stats: StatProjection, rules: FantasyScoringRules) {
  const totalPoints = scoreStatProjection(stats, rules);
  if (totalPoints <= 0) {
    return null;
  }

  const touchdownPoints = scoreStatProjection(touchdownOnlyProjection(stats), rules);
  return Number((touchdownPoints / totalPoints).toFixed(3));
}

function volumeFoundationScore(
  position: PlayerPosition,
  stats: NflversePlayerSeasonStats | undefined,
) {
  if (!stats || stats.games <= 0) {
    return null;
  }

  const games = Math.max(1, stats.games);

  switch (position) {
    case "RB":
      return clamp(
        stats.carries / games * 2.9 + stats.targets / games * 7.2 + stats.targetShare * 95,
        0,
        100,
      );
    case "WR":
      return clamp(
        stats.targets / games * 7.4 + stats.targetShare * 132 + stats.airYardsShare * 68,
        0,
        100,
      );
    case "TE":
      return clamp(
        stats.targets / games * 7 + stats.targetShare * 126 + stats.airYardsShare * 42,
        0,
        100,
      );
    case "QB":
      return clamp(
        stats.attempts / games * 1.7 + stats.carries / games * 4.5 + stats.rushingYards / games * 0.16,
        0,
        100,
      );
    default:
      return null;
  }
}

function buildDrivers(input: {
  position: PlayerPosition;
  projectedTouchdownShare: number;
  priorTouchdownShare: number | null;
  volumeFoundation: number | null;
}) {
  const drivers: string[] = [];
  const projectedPercent = Math.round(input.projectedTouchdownShare * 100);

  if (input.projectedTouchdownShare >= 0.36) {
    drivers.push(`Projected scoring leans heavily on touchdowns (${projectedPercent}% of fantasy points).`);
  } else if (input.projectedTouchdownShare <= 0.22) {
    drivers.push(`Projected scoring is being carried more by volume than touchdowns (${projectedPercent}% TD share).`);
  }

  if (input.priorTouchdownShare !== null && input.priorTouchdownShare >= 0.38) {
    drivers.push("Prior-year fantasy output also leaned TD-heavy, which can be less sticky.");
  } else if (input.priorTouchdownShare !== null && input.priorTouchdownShare <= 0.24) {
    drivers.push("Prior-year scoring profile was volume-driven enough to travel week to week.");
  }

  if (input.volumeFoundation !== null && input.volumeFoundation >= 68) {
    drivers.push(
      input.position === "RB"
        ? "Touch and target volume give the projection a stronger floor than a splash-play profile."
        : input.position === "QB"
          ? "Passing workload plus rushing involvement create a broad scoring base."
          : "Target-driven volume gives the projection a cleaner PPR floor.",
    );
  } else if (input.volumeFoundation !== null && input.volumeFoundation <= 42) {
    drivers.push("The underlying volume foundation is lighter than the projected finish suggests.");
  }

  return drivers.slice(0, 3);
}

export function buildScoringProfileSignal(input: {
  candidate: DraftCandidate;
  rules: FantasyScoringRules;
  nflverseStats?: NflversePlayerSeasonStats;
}) {
  const { candidate, rules, nflverseStats } = input;
  const position = primaryPosition(candidate);
  const projectedTouchdownShare = touchdownShare(candidate.projection.stats, rules) ?? 0;
  const priorTouchdownShare = nflverseStats
    ? touchdownShare(projectionFromNflverseStats(nflverseStats), rules)
    : null;
  const volumeFoundation = volumeFoundationScore(position, nflverseStats);
  const lowReceivingSpineForRb =
    position === "RB" &&
    nflverseStats !== undefined &&
    nflverseStats.games > 0 &&
    nflverseStats.targets / nflverseStats.games < 3.2;
  const dependencyScore = Math.round(
    clamp(
      projectedTouchdownShare * 100 * 1.18 +
        (priorTouchdownShare ?? projectedTouchdownShare) * 100 * 0.42 -
        (volumeFoundation ?? 50) * 0.66 +
        (candidate.player.rookie ? 4 : 0),
      6,
      94,
    ),
  );

  let label: CandidateScoringProfileSnapshot["label"] = "balanced";

  if (
    dependencyScore >= 56 ||
    (projectedTouchdownShare >= 0.36 &&
      ((volumeFoundation ?? 50) <= 62 || lowReceivingSpineForRb)) ||
    (priorTouchdownShare !== null &&
      priorTouchdownShare >= 0.38 &&
      (volumeFoundation ?? 50) <= 66)
  ) {
    label = "touchdown-fragile";
  } else if (
    dependencyScore <= 28 &&
    projectedTouchdownShare <= 0.28 &&
    (volumeFoundation ?? 0) >= 60
  ) {
    label = "volume-backed";
  }

  const adjustedMedianDelta =
    label === "touchdown-fragile"
      ? Number((-clamp((dependencyScore - 52) * 0.18, 0.8, 5.2)).toFixed(2))
      : label === "volume-backed"
        ? Number(clamp(((volumeFoundation ?? 60) - dependencyScore) * 0.06, 0.7, 3.4).toFixed(2))
        : 0;
  const stabilityImpact =
    label === "touchdown-fragile"
      ? Number((-clamp((dependencyScore - 48) * 0.14, 0.7, 5.5)).toFixed(2))
      : label === "volume-backed"
        ? Number(clamp(((volumeFoundation ?? 58) - dependencyScore) * 0.07, 0.6, 4.2).toFixed(2))
        : 0;
  const drivers = buildDrivers({
    position,
    projectedTouchdownShare,
    priorTouchdownShare,
    volumeFoundation,
  });
  const summary =
    label === "touchdown-fragile"
      ? `${candidate.player.fullName} looks more touchdown-dependent than the median finish suggests, so the draft price should carry a small fragility tax.`
      : label === "volume-backed"
        ? `${candidate.player.fullName} is being supported by a healthier volume base than a touchdown-chasing profile, which makes the median easier to trust.`
        : `${candidate.player.fullName} has a fairly balanced scoring mix right now.`;

  return {
    label,
    dependencyScore,
    adjustedMedianDelta,
    stabilityImpact,
    projectedTouchdownShare: Number(projectedTouchdownShare.toFixed(3)),
    priorTouchdownShare:
      priorTouchdownShare === null ? null : Number(priorTouchdownShare.toFixed(3)),
    summary,
    drivers,
  } satisfies CandidateScoringProfileSnapshot;
}
