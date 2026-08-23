import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { FfOpportunitySeasonStats } from "@/lib/fantasy/ffOpportunity";
import {
  actualSeasonFantasyPoints,
  expectedOpportunityPoints,
} from "@/lib/fantasy/opportunityMath";
import type {
  CandidateRegressionSnapshot,
  DraftCandidate,
  FantasyScoringRules,
  PlayerPosition,
} from "@/lib/fantasy/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function buildRegressionDrivers(
  position: PlayerPosition,
  stats: NflversePlayerSeasonStats,
  pointsGap: number,
  ffOpportunityStats?: FfOpportunitySeasonStats,
) {
  const drivers: string[] = [];
  let bias = 0;

  if (position === "RB") {
    const yardsPerCarry = stats.carries > 0 ? stats.rushingYards / stats.carries : 0;
    const tdPerTouch =
      stats.carries + stats.targets > 0
        ? (stats.rushingTouchdowns + stats.receivingTouchdowns) /
          (stats.carries + stats.targets)
        : 0;

    if (tdPerTouch >= 0.055) {
      drivers.push("Touchdown conversion ran hot relative to workload.");
      bias -= 2.1;
    } else if (tdPerTouch <= 0.028 && stats.carries + stats.targets >= 180) {
      drivers.push("Workload beat the scoring finish, pointing to touchdown underperformance.");
      bias += 2.1;
    }

    if (yardsPerCarry >= 5.15) {
      drivers.push("Rushing efficiency likely sits above the repeatable baseline.");
      bias -= 1.2;
    } else if (yardsPerCarry <= 4 && stats.carries >= 165) {
      drivers.push("Rushing efficiency lagged a volume profile that still looked draftable.");
      bias += 1.1;
    }
  }

  if (position === "WR" || position === "TE") {
    const yardsPerTarget = stats.targets > 0 ? stats.receivingYards / stats.targets : 0;
    const touchdownRate = stats.targets > 0 ? stats.receivingTouchdowns / stats.targets : 0;

    if (touchdownRate >= (position === "WR" ? 0.09 : 0.11)) {
      drivers.push("Touchdown rate outran the underlying target profile.");
      bias -= 2;
    } else if (
      touchdownRate <= (position === "WR" ? 0.045 : 0.055) &&
      stats.targets >= (position === "WR" ? 105 : 80)
    ) {
      drivers.push("Target volume was better than the scoring finish suggests.");
      bias += 2;
    }

    if (yardsPerTarget >= (position === "WR" ? 10.9 : 9.7)) {
      drivers.push("Yards per target sat above a likely repeatable range.");
      bias -= 1.1;
    } else if (
      yardsPerTarget <= (position === "WR" ? 7.5 : 6.9) &&
      stats.targets >= (position === "WR" ? 100 : 75)
    ) {
      drivers.push("Receiving efficiency lagged a role that still created fantasy opportunity.");
      bias += 1.1;
    }
  }

  if (pointsGap >= 10) {
    drivers.unshift("Prior-year scoring trailed the underlying opportunity profile.");
  } else if (pointsGap <= -10) {
    drivers.unshift("Prior-year scoring outran the underlying opportunity profile.");
  }

  if (ffOpportunityStats) {
    const touchdownGap =
      ffOpportunityStats.expectedTouchdowns - ffOpportunityStats.actualTouchdowns;
    const yardsGap = ffOpportunityStats.expectedYards - ffOpportunityStats.actualYards;

    if (touchdownGap >= 1.75) {
      drivers.push("Play-level opportunity expected materially more touchdowns.");
      bias += 1.5;
    } else if (touchdownGap <= -1.75) {
      drivers.push("Touchdown production ran above the play-level expectation.");
      bias -= 1.5;
    }
    if (yardsGap >= 180) {
      drivers.push("Actual yardage undershot the play-level expected total.");
      bias += 0.9;
    } else if (yardsGap <= -180) {
      drivers.push("Actual yardage materially beat the play-level expected total.");
      bias -= 0.9;
    }
  }

  return {
    bias,
    drivers: drivers.slice(0, 3),
  };
}

export function buildRegressionSignal(input: {
  candidate: DraftCandidate;
  rules: FantasyScoringRules;
  nflverseStats?: NflversePlayerSeasonStats;
  ffOpportunityStats?: FfOpportunitySeasonStats;
}) {
  const { candidate, rules, nflverseStats, ffOpportunityStats } = input;
  const position = primaryPosition(candidate);

  if ((!nflverseStats && !ffOpportunityStats) || candidate.player.rookie || !["RB", "WR", "TE"].includes(position)) {
    return {
      direction: "none",
      regressionScore: 0,
      adjustedMedianDelta: 0,
      stabilityImpact: 0,
      actualSeasonScore: null,
      expectedOpportunityPoints: null,
      summary: "Regression layer is not active for this profile yet.",
      luckDrivers: [],
    } satisfies CandidateRegressionSnapshot;
  }

  const heuristicActual = nflverseStats
    ? actualSeasonFantasyPoints(nflverseStats, rules)
    : null;
  const heuristicExpected = nflverseStats
    ? expectedOpportunityPoints(position, nflverseStats, rules)
    : null;
  const actualSeasonScore = ffOpportunityStats?.actualFantasyPoints ?? heuristicActual;
  const expectedPoints = ffOpportunityStats?.expectedFantasyPoints ?? heuristicExpected;

  if (expectedPoints === null || actualSeasonScore === null) {
    return {
      direction: "none",
      regressionScore: 0,
      adjustedMedianDelta: 0,
      stabilityImpact: 0,
      actualSeasonScore: null,
      expectedOpportunityPoints: null,
      summary: "Regression layer is not active for this profile yet.",
      luckDrivers: [],
    } satisfies CandidateRegressionSnapshot;
  }

  const externalGap =
    ffOpportunityStats && actualSeasonScore !== null
      ? ffOpportunityStats.expectedFantasyPoints - ffOpportunityStats.actualFantasyPoints
      : null;
  const heuristicGap =
    heuristicActual !== null && heuristicExpected !== null
      ? heuristicExpected - heuristicActual
      : null;
  const pointsGap = Number(
    (externalGap !== null && heuristicGap !== null
      ? externalGap * 0.72 + heuristicGap * 0.28
      : externalGap ?? heuristicGap ?? 0
    ).toFixed(2),
  );
  const { bias, drivers } = nflverseStats
    ? buildRegressionDrivers(position, nflverseStats, pointsGap, ffOpportunityStats)
    : {
        bias: 0,
        drivers: [
          pointsGap >= 10
            ? "Play-level expected scoring exceeded the actual fantasy finish."
            : "Actual fantasy scoring exceeded the play-level expectation.",
        ],
      };
  const adjustedMedianDelta = Number(clamp(pointsGap * 0.28 + bias, -12, 12).toFixed(2));
  const regressionScore = Math.round(
    clamp(Math.abs(pointsGap) * 3.8 + Math.abs(bias) * 11, 0, 96),
  );

  let direction: CandidateRegressionSnapshot["direction"] = "neutral";
  if (adjustedMedianDelta >= 2.25) {
    direction = "positive";
  } else if (adjustedMedianDelta <= -2.25) {
    direction = "negative";
  }

  const directionStability =
    direction === "positive"
      ? Number(clamp(regressionScore * 0.08, 0, 7.5).toFixed(2))
      : direction === "negative"
        ? Number((-clamp(regressionScore * 0.1, 0, 10)).toFixed(2))
        : 0;
  const consistencyImpact = ffOpportunityStats
    ? clamp((ffOpportunityStats.weeklyConsistencyScore - 50) * 0.035, -1.4, 1.4)
    : 0;
  const stabilityImpact = Number(
    clamp(directionStability + consistencyImpact, -10, 8).toFixed(2),
  );

  const summary =
    direction === "positive"
      ? `${candidate.player.fullName} looks like a positive veteran regression candidate: prior-year scoring lagged the underlying role enough to justify a small median bump.`
      : direction === "negative"
        ? `${candidate.player.fullName} looks like a negative veteran regression candidate: prior-year scoring outran the underlying role enough to justify a small median trim.`
        : `${candidate.player.fullName} does not show a strong veteran regression signal right now.`;

  return {
    direction,
    regressionScore,
    adjustedMedianDelta: direction === "neutral" ? 0 : adjustedMedianDelta,
    stabilityImpact,
    actualSeasonScore: Number(actualSeasonScore.toFixed(2)),
    expectedOpportunityPoints: Number(expectedPoints.toFixed(2)),
    summary,
    luckDrivers: drivers,
  } satisfies CandidateRegressionSnapshot;
}
