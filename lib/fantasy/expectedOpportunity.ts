import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { FfOpportunitySeasonStats } from "@/lib/fantasy/ffOpportunity";
import { actualSeasonFantasyPoints, expectedOpportunityPoints } from "@/lib/fantasy/opportunityMath";
import type {
  CandidateExpectedOpportunitySnapshot,
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

function labelForPerGame(position: PlayerPosition, pointsPerGame: number) {
  if (position === "QB") {
    return pointsPerGame >= 19.5 ? "strong" : pointsPerGame >= 15.5 ? "usable" : "thin";
  }
  if (position === "RB") {
    return pointsPerGame >= 14.5 ? "strong" : pointsPerGame >= 10.25 ? "usable" : "thin";
  }
  if (position === "WR") {
    return pointsPerGame >= 13.5 ? "strong" : pointsPerGame >= 9.4 ? "usable" : "thin";
  }
  if (position === "TE") {
    return pointsPerGame >= 10.2 ? "strong" : pointsPerGame >= 7.2 ? "usable" : "thin";
  }
  return "none";
}

function buildDrivers(input: {
  position: PlayerPosition;
  label: CandidateExpectedOpportunitySnapshot["label"];
  expectedPointsPerGame: number;
  gapVsProjectionMedian: number;
  gapVsActual: number;
  evidenceSource: CandidateExpectedOpportunitySnapshot["evidenceSource"];
  weeklyConsistencyScore: number | null;
}) {
  const drivers: string[] = [];

  if (input.label === "strong") {
    drivers.push(
      input.position === "QB"
        ? "Workload profile already looks like a weekly starter foundation."
        : "Opportunity volume already looks like a weekly starter foundation.",
    );
  } else if (input.label === "thin") {
    drivers.push("Underlying opportunity is lighter than the headline projection suggests.");
  }

  if (input.gapVsProjectionMedian >= 14) {
    drivers.push("Expected opportunity is supporting a stronger finish than the current median implies.");
  } else if (input.gapVsProjectionMedian <= -14) {
    drivers.push("Projected finish is running well ahead of the current expected-opportunity base.");
  }

  if (input.gapVsActual >= 10) {
    drivers.push("Last season's fantasy finish undersold the opportunity base.");
  } else if (input.gapVsActual <= -10) {
    drivers.push("Last season's fantasy finish needed more efficiency than the opportunity base.");
  }

  if (input.evidenceSource === "ffopportunity") {
    drivers.push("Play-level expected fantasy points replace the coarse volume estimate.");
  }
  if ((input.weeklyConsistencyScore ?? 50) >= 68) {
    drivers.push("Expected workload stayed relatively consistent from week to week.");
  } else if ((input.weeklyConsistencyScore ?? 50) <= 38) {
    drivers.push("Expected workload was volatile enough to widen the weekly floor.");
  }

  return drivers.slice(0, 3);
}

export function buildExpectedOpportunitySignal(input: {
  candidate: DraftCandidate;
  rules: FantasyScoringRules;
  nflverseStats?: NflversePlayerSeasonStats;
  ffOpportunityStats?: FfOpportunitySeasonStats;
}) {
  const { candidate, rules, nflverseStats, ffOpportunityStats } = input;
  const position = primaryPosition(candidate);
  const canUseFfOpportunity =
    Boolean(ffOpportunityStats) && ["RB", "WR", "TE"].includes(position);

  if (
    (!canUseFfOpportunity && (!nflverseStats || nflverseStats.games <= 0)) ||
    !["QB", "RB", "WR", "TE"].includes(position)
  ) {
    return {
      label: "none",
      evidenceSource: "none",
      expectedPoints: null,
      expectedPointsPerGame: null,
      gapVsActual: null,
      gapVsProjectionMedian: null,
      weeklyConsistencyScore: null,
      weeklyVolatility: null,
      evidenceSeasons: [],
      currentSeasonWeeks: 0,
      currentSeasonWeight: 0,
      adjustedMedianDelta: 0,
      stabilityImpact: 0,
      summary: "Expected-opportunity layer is not active for this profile yet.",
      drivers: [],
    } satisfies CandidateExpectedOpportunitySnapshot;
  }

  const expectedPointsRaw = canUseFfOpportunity
    ? ffOpportunityStats!.expectedFantasyPoints
    : expectedOpportunityPoints(position, nflverseStats!, rules);
  if (expectedPointsRaw === null) {
    return {
      label: "none",
      evidenceSource: "none",
      expectedPoints: null,
      expectedPointsPerGame: null,
      gapVsActual: null,
      gapVsProjectionMedian: null,
      weeklyConsistencyScore: null,
      weeklyVolatility: null,
      evidenceSeasons: [],
      currentSeasonWeeks: 0,
      currentSeasonWeight: 0,
      adjustedMedianDelta: 0,
      stabilityImpact: 0,
      summary: "Expected-opportunity layer is not active for this profile yet.",
      drivers: [],
    } satisfies CandidateExpectedOpportunitySnapshot;
  }

  const expectedPoints = Number(expectedPointsRaw.toFixed(2));
  const games = canUseFfOpportunity ? ffOpportunityStats!.weeks : nflverseStats!.games;
  const expectedPointsPerGame = Number((expectedPoints / Math.max(1, games)).toFixed(2));
  const actualPoints = canUseFfOpportunity
    ? ffOpportunityStats!.actualFantasyPoints
    : actualSeasonFantasyPoints(nflverseStats!, rules);
  const gapVsActual = Number((expectedPoints - actualPoints).toFixed(2));
  const gapVsProjectionMedian = Number((expectedPoints - candidate.projection.range.p50).toFixed(2));
  const label = labelForPerGame(position, expectedPointsPerGame);
  const evidenceSource = canUseFfOpportunity ? "ffopportunity" : "nflverse-heuristic";
  const weeklyConsistencyScore = canUseFfOpportunity
    ? ffOpportunityStats!.weeklyConsistencyScore
    : null;
  const weeklyVolatility = canUseFfOpportunity
    ? ffOpportunityStats!.weeklyExpectedVolatility
    : null;
  const evidenceSeasons = canUseFfOpportunity
    ? ffOpportunityStats!.evidenceSeasons
    : nflverseStats
      ? [candidate.projection.season - 1]
      : [];
  const currentSeasonWeeks = canUseFfOpportunity
    ? ffOpportunityStats!.currentSeasonWeeks
    : 0;
  const currentSeasonWeight = canUseFfOpportunity
    ? ffOpportunityStats!.currentSeasonWeight
    : 0;
  const adjustedMedianDelta =
    label === "none"
      ? 0
      : Number(clamp(gapVsProjectionMedian * 0.14, -5.5, 5.5).toFixed(2));
  const baseStabilityImpact =
    label === "strong"
      ? Number(clamp(expectedPointsPerGame * 0.18 + Math.max(0, gapVsActual) * 0.06, 0.8, 5.4).toFixed(2))
      : label === "thin"
        ? Number((-clamp(Math.abs(gapVsProjectionMedian) * 0.16 + Math.max(0, -gapVsActual) * 0.06, 0.8, 5.8)).toFixed(2))
        : 0;
  const consistencyImpact =
    weeklyConsistencyScore === null
      ? 0
      : clamp((weeklyConsistencyScore - 50) * 0.045, -1.8, 1.8);
  const stabilityImpact = Number(
    clamp(baseStabilityImpact + consistencyImpact, -6.5, 6.2).toFixed(2),
  );
  const drivers = buildDrivers({
    position,
    label,
    expectedPointsPerGame,
    gapVsProjectionMedian,
    gapVsActual,
    evidenceSource,
    weeklyConsistencyScore,
  });
  const summary =
    label === "strong"
      ? `${candidate.player.fullName} carries a strong ${canUseFfOpportunity ? "play-level " : ""}expected-opportunity base, so the projection does not need thin efficiency assumptions.`
      : label === "thin"
        ? `${candidate.player.fullName} has a thinner expected-opportunity base than the median finish suggests, so the draft price needs caution.`
        : label === "usable"
          ? `${candidate.player.fullName} has a usable expected-opportunity base, but not one that should erase other fragility signals.`
          : `${candidate.player.fullName} does not have an active expected-opportunity read yet.`;

  return {
    label,
    evidenceSource,
    expectedPoints,
    expectedPointsPerGame,
    gapVsActual,
    gapVsProjectionMedian,
    weeklyConsistencyScore,
    weeklyVolatility,
    evidenceSeasons,
    currentSeasonWeeks,
    currentSeasonWeight,
    adjustedMedianDelta,
    stabilityImpact,
    summary,
    drivers,
  } satisfies CandidateExpectedOpportunitySnapshot;
}
