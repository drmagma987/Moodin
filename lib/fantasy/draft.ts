import type {
  BoardOutlierSnapshot,
  CandidateRecommendation,
  ConditionalDraftPathBoard,
  ConditionalDraftPathOutcome,
  ConditionalDraftPathPick,
  DraftDecisionSnapshot,
  DraftCounterfactualEvaluationMode,
  DraftRecommendationPolicyMode,
  DraftCandidate,
  DraftState,
  LeagueConfig,
  OpponentPickPredictionSnapshot,
  PickWindowSnapshot,
  PositionMarketSnapshot,
  PositionRunSnapshot,
  PlayerPosition,
  ReachToleranceSnapshot,
  SimulatedPlayerLossSnapshot,
  TeamRosterState,
  TierWipeScenarioSnapshot,
  UndervaluedPlaySnapshot,
  TierPivotSnapshot,
  WrapSimulationPositionProbability,
  WrapSimulationPositionSnapshot,
  WrapSimulationSnapshot,
} from "@/lib/fantasy/types";
import {
  applyDraftPick,
  buildDraftTurnContext,
  getLivePicksBeforeNextTurn,
  getSnakePickInfo,
} from "@/lib/fantasy/draftState";
import { assertLeagueMatchesSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

const FLEX_ELIGIBLE: PlayerPosition[] = ["RB", "WR", "TE"];
const BOARD_POSITIONS: PlayerPosition[] = ["RB", "WR", "TE", "QB", "K"];
export const PRODUCTION_WRAP_SIMULATIONS = 16;
export const DRAFT_POLICY_CERTIFICATION_VERSION = "2026-08-28-v5";

export type RedraftBoardEntry = {
  playerId: string;
  boardScore: number;
  boardRank: number;
  structuralRank: number;
  acquisitionRankScore: number;
  marketRank: number;
  boardEdge: number;
  positionRank: number;
  replacementBaseline: number;
  valueOverReplacement: number;
  positionUtilityMultiplier: number;
  onesiePenalty: number;
  positionalLeverage: PositionalLeverage;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function countRequiredSlots(
  league: LeagueConfig,
): Partial<Record<PlayerPosition, number>> {
  const counts: Partial<Record<PlayerPosition, number>> = {};

  for (const slot of league.rosterSlots) {
    if (slot === "BN" || slot === "IR" || slot === "W/R/T") {
      continue;
    }

    const position = slot as PlayerPosition;
    counts[position] = (counts[position] ?? 0) + 1;
  }

  return counts;
}

function flexSlotCount(league: LeagueConfig) {
  return league.rosterSlots.filter((slot) => slot === "W/R/T").length;
}

function starterDemandByPosition(
  pool: DraftCandidate[],
  league: LeagueConfig,
) {
  const requiredCounts = countRequiredSlots(league);
  const demand: Partial<Record<PlayerPosition, number>> = {};

  for (const position of BOARD_POSITIONS) {
    demand[position] = league.teams * (requiredCounts[position] ?? 0);
  }

  const flexCandidates = FLEX_ELIGIBLE.flatMap((position) => {
    const requiredStarters = demand[position] ?? 0;
    return pool
      .filter((candidate) => primaryPosition(candidate) === position)
      .sort((a, b) => expectedMarketPick(a) - expectedMarketPick(b))
      .slice(requiredStarters);
  })
    .sort((a, b) => expectedMarketPick(a) - expectedMarketPick(b))
    .slice(0, league.teams * flexSlotCount(league));

  for (const candidate of flexCandidates) {
    const position = primaryPosition(candidate);
    demand[position] = (demand[position] ?? 0) + 1;
  }

  return demand;
}

function replacementIndex(
  position: PlayerPosition,
  pool: DraftCandidate[],
  league: LeagueConfig,
) {
  return starterDemandByPosition(pool, league)[position] ?? 0;
}

function replacementBaselinesByPosition(
  pool: DraftCandidate[],
  league: LeagueConfig,
) {
  const demand = starterDemandByPosition(pool, league);
  const baselines = new Map<PlayerPosition, number>();
  for (const position of BOARD_POSITIONS) {
    const samePosition = pool
      .filter((candidate) => primaryPosition(candidate) === position)
      .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
    const replacement = samePosition[demand[position] ?? 0];
    baselines.set(position, replacement?.projection.range.p50 ?? samePosition.at(-1)?.projection.range.p50 ?? 0);
  }
  return baselines;
}

function scarcityMultiplier(position: PlayerPosition, league: LeagueConfig) {
  void league;
  return position === "K" || position === "DST" ? 0.25 : 1;
}

function scarcityBonus(position: PlayerPosition, marketTier: number, league: LeagueConfig) {
  const baseByPosition: Record<PlayerPosition, number> = {
    QB: 1,
    RB: 1,
    WR: 1,
    TE: 1,
    K: 0.05,
    DST: 0.05,
  };

  const tierImpact = 1 / Math.max(marketTier, 1);
  return Number(
    (baseByPosition[position] * scarcityMultiplier(position, league) * tierImpact).toFixed(2),
  );
}

function positionUtilityMultiplier(position: PlayerPosition, league: LeagueConfig) {
  if (!FLEX_ELIGIBLE.includes(position)) return 1;

  // Replacement demand already allocates the flex pool by market cost. Keep this
  // adjustment deliberately small: it represents the extra ways an RB/WR/TE can
  // enter a legal lineup, not a second replacement-value calculation.
  const required = countRequiredSlots(league)[position] ?? 0;
  const lineupPaths = required + flexSlotCount(league);
  return Number((1 + Math.min(0.12, Math.max(0, lineupPaths - 1) * 0.025)).toFixed(3));
}

function onesieDepthPenalty(
  position: PlayerPosition,
  positionRank: number,
  league: LeagueConfig,
) {
  if (position !== "QB" && position !== "TE") return 0;

  const requiredStarters = league.teams * (countRequiredSlots(league)[position] ?? 0);
  if (positionRank <= requiredStarters) return 0;

  // Once every team can plausibly fill a mandatory onesie slot, additional
  // players at that position have less access to starting lineups than RB/WR.
  return Number((Math.min(8, positionRank - requiredStarters) * 0.7).toFixed(2));
}

export type PositionalLeverage = {
  score: number;
  medianTierEdge: number;
  floorTierEdge: number;
  ceilingTierEdge: number;
  comparisonPlayerId: string | null;
};

function positionalLeverage(
  candidate: DraftCandidate,
  pool: DraftCandidate[],
  league: LeagueConfig,
  demand: Partial<Record<PlayerPosition, number>>,
): PositionalLeverage {
  const empty = {
    score: 0,
    medianTierEdge: 0,
    floorTierEdge: 0,
    ceilingTierEdge: 0,
    comparisonPlayerId: null,
  };
  const position = primaryPosition(candidate);
  if (position === "K" || position === "DST") return empty;

  const positionPool = pool
    .filter((item) => primaryPosition(item) === position)
    .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
  const positionIndex = positionPool.findIndex((item) => item.player.id === candidate.player.id);
  if (positionIndex < 0) return empty;

  const totalStarterDemand = BOARD_POSITIONS.reduce(
    (sum, item) => sum + (demand[item] ?? 0),
    0,
  );
  const expectedPositionPicksOverRound = Math.max(
    1,
    Math.round(((demand[position] ?? 0) / Math.max(1, totalStarterDemand)) * league.teams),
  );
  const comparison = positionPool[
    Math.min(positionPool.length - 1, positionIndex + expectedPositionPicksOverRound)
  ];
  if (!comparison || comparison.player.id === candidate.player.id) return empty;

  const medianTierEdge = Math.max(0, candidate.projection.range.p50 - comparison.projection.range.p50);
  const floorTierEdge = Math.max(0, candidate.projection.range.p10 - comparison.projection.range.p10);
  const ceilingTierEdge = Math.max(0, candidate.projection.range.p90 - comparison.projection.range.p90);

  // Reward measured separation from the next positional group likely to be
  // consumed over one league round. This lets elite-TE value emerge from this
  // league's projections without a hard-coded TE bonus.
  const score = medianTierEdge * 0.32 + floorTierEdge * 0.18 + ceilingTierEdge * 0.08;
  return {
    score: Number(score.toFixed(2)),
    medianTierEdge: Number(medianTierEdge.toFixed(2)),
    floorTierEdge: Number(floorTierEdge.toFixed(2)),
    ceilingTierEdge: Number(ceilingTierEdge.toFixed(2)),
    comparisonPlayerId: comparison.player.id,
  };
}

function starterDemandForPosition(
  position: PlayerPosition,
  pool: DraftCandidate[],
  league: LeagueConfig,
) {
  return starterDemandByPosition(pool, league)[position] ?? 0;
}

function positionNeedWeight(
  team: TeamRosterState,
  position: PlayerPosition,
  league: LeagueConfig,
) {
  const currentCount = team.positionCounts[position] ?? 0;
  const requiredByPosition = countRequiredSlots(league);
  const exactNeed = Math.max(0, (requiredByPosition[position] ?? 0) - currentCount);
  const flexNeed =
    FLEX_ELIGIBLE.includes(position) && team.openSlots.includes("W/R/T")
      ? 0.7
      : 0;

  if (exactNeed > 0) {
    // Each additional unfilled exact starter matters independently. Paired
    // construction-ablation continuations showed that the old 0.32 slope
    // underpriced WR2/WR3 demand in a three-WR, two-flex league.
    return 1 + exactNeed * 0.62 + flexNeed;
  }

  if (flexNeed > 0) {
    return 0.72 + flexNeed;
  }

  return position === "WR" ? 0.48 : position === "RB" ? 0.44 : 0.28;
}

function rosterConstructionPenalty(
  team: TeamRosterState | null,
  position: PlayerPosition,
  state: DraftState,
) {
  if (!team) return 0;
  const currentCount = team.positionCounts[position] ?? 0;
  const round = getSnakePickInfo(state.currentPick, state.league.teams).round;

  if (position === "QB" && currentCount >= 1) {
    if (currentCount >= 2) return 120;
    if (team.openSlots.some((slot) => ["RB", "WR", "TE", "W/R/T"].includes(slot))) return 72;
    return 0;
  }

  if (position === "TE" && currentCount >= 1) {
    const coreFlexOpen = team.openSlots.some((slot) => ["RB", "WR", "W/R/T"].includes(slot));
    if (coreFlexOpen) return currentCount >= 2 ? 110 : 64;
    const lineupCapacity = (countRequiredSlots(state.league).TE ?? 0) + flexSlotCount(state.league);
    if (currentCount >= lineupCapacity) return 110;
    return 0;
  }

  if (position === "K" && currentCount === 0 && round < 14) {
    // A required kicker slot is not a reason to spend a mid-round pick while
    // the roster still has bench capacity. Preserve those picks for injury and
    // breakout optionality, then let the explicit Round-14 completion ramp act.
    return 45 + (14 - round) * 8;
  }

  if (FLEX_ELIGIBLE.includes(position)) {
    const required = countRequiredSlots(state.league);
    const lineupCapacity = (required[position] ?? 0) + flexSlotCount(state.league);
    const anotherExactFlexStarterIsOpen = FLEX_ELIGIBLE.some(
      (otherPosition) => otherPosition !== position && team.openSlots.includes(otherPosition),
    );
    if (
      anotherExactFlexStarterIsOpen &&
      !team.openSlots.includes(position) &&
      !team.openSlots.includes("W/R/T") &&
      currentCount >= lineupCapacity
    ) {
      // Once this position has consumed every exact and flex path, another
      // player is bench-only while a different required starter is empty.
      // Paired construction-ablation evidence at Pick 69 measured an 81-point
      // median-regret loss when this marginal-lineup cost was omitted.
      return 42 + Math.max(0, round - 6) * 4 + Math.max(0, currentCount - lineupCapacity) * 10;
    }
  }

  if (position === "K" && currentCount >= 1) return 220;
  if (position === "DST") return 70;
  return 0;
}

function rosterCompletionBonus(
  team: TeamRosterState | null,
  position: PlayerPosition,
  state: DraftState,
) {
  if (!team || !team.openSlots.includes(position)) return 0;
  const round = getSnakePickInfo(state.currentPick, state.league.teams).round;
  if (position === "QB" && round >= 7) {
    // A hard Round-10 cliff waited too long when a starting QB at market cost
    // could be paired with a high-survival WR at the short turn. Exact paired
    // continuations support a smooth urgency ramp beginning in Round 7.
    return 38 + (round - 7) * 15;
  }
  if (position === "TE" && round >= 10) return 34 + (round - 10) * 6;
  if ((position === "RB" || position === "WR") && round >= 13) return 60 + (round - 13) * 30;
  if (position === "K" && round >= 14) return 55 + (round - 14) * 20;
  return 0;
}

function cloneTeamState(team: TeamRosterState): TeamRosterState {
  return {
    ...team,
    starters: [...team.starters],
    bench: [...team.bench],
    positionCounts: { ...team.positionCounts },
    openSlots: [...team.openSlots],
  };
}

function fillSimulatedSlot(team: TeamRosterState, position: PlayerPosition) {
  const exactIndex = team.openSlots.findIndex((slot) => slot === position);
  if (exactIndex >= 0) {
    team.openSlots.splice(exactIndex, 1);
    return;
  }

  if (FLEX_ELIGIBLE.includes(position)) {
    const flexIndex = team.openSlots.findIndex((slot) => slot === "W/R/T");
    if (flexIndex >= 0) {
      team.openSlots.splice(flexIndex, 1);
    }
  }
}

function updateTeamStateWithSimulatedPick(
  team: TeamRosterState,
  candidate: DraftCandidate,
): TeamRosterState {
  const nextTeam = cloneTeamState(team);
  const position = primaryPosition(candidate);
  fillSimulatedSlot(nextTeam, position);
  nextTeam.positionCounts[position] = (nextTeam.positionCounts[position] ?? 0) + 1;
  return nextTeam;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreSimulatedPick(
  team: TeamRosterState,
  candidate: DraftCandidate,
  availablePool: DraftCandidate[],
  league: LeagueConfig,
  replacementBaselines: Map<PlayerPosition, number>,
) {
  const position = primaryPosition(candidate);
  const replacement = valueOverReplacement(candidate, availablePool, league, replacementBaselines);
  const expectedPick = expectedMarketPick(candidate);
  const marketPull = (220 - Math.min(expectedPick, 220)) / 220;
  const need = positionNeedWeight(team, position, league);
  const scarcity = scarcityBonus(position, candidate.market.tier, league);
  const robustness = candidate.signals?.robustness;
  const refresh = candidate.signals?.refresh;
  const directNeedBoost = team.openSlots.includes(position)
    ? 1.5
    : FLEX_ELIGIBLE.includes(position) && team.openSlots.includes("W/R/T")
      ? 0.75
      : 0;
  const refreshBoost =
    (refresh?.netImpact ?? 0) * 0.16 +
    (refresh?.status === "rising"
      ? 0.35
      : refresh?.status === "falling"
        ? -0.55
        : 0);
  const fragilityPenalty = (robustness?.fragilityScore ?? 42) * 0.018;

  return Number(
    (
      replacement.valueOverReplacement * 1.18 +
      candidate.projection.range.p50 * 0.05 +
      need * 8.6 +
      directNeedBoost * 3.2 +
      scarcity * 2.7 +
      marketPull * 7.4 +
      refreshBoost -
      fragilityPenalty
    ).toFixed(4),
  );
}

function selectSimulatedPick(
  team: TeamRosterState,
  availablePool: DraftCandidate[],
  league: LeagueConfig,
  random: () => number,
) {
  const replacementBaselines = replacementBaselinesByPosition(availablePool, league);
  const scored = availablePool
    .map((candidate) => ({
      candidate,
      score: scoreSimulatedPick(team, candidate, availablePool, league, replacementBaselines),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (scored.length === 0) {
    return null;
  }

  const floor = scored.at(-1)?.score ?? 0;
  const weights = scored.map((entry, index) =>
    Math.max(0.15, entry.score - floor + 0.35) * (1 - index * 0.035),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = random() * totalWeight;

  for (let index = 0; index < scored.length; index += 1) {
    remaining -= weights[index] ?? 0;
    if (remaining <= 0) {
      return scored[index]?.candidate ?? scored[0].candidate;
    }
  }

  return scored[0].candidate;
}

function getWrapSimulationPositionSnapshot(
  wrapSimulation: WrapSimulationSnapshot | undefined,
  position: PlayerPosition,
) {
  return wrapSimulation?.positionSnapshots.find((snapshot) => snapshot.position === position);
}

function getThreatenedPlayerSnapshot(
  wrapSimulation: WrapSimulationSnapshot | undefined,
  playerId: string,
) {
  return wrapSimulation?.threatenedPlayers.find((snapshot) => snapshot.playerId === playerId);
}

function estimateMakeItBackProbability(
  candidate: DraftCandidate,
  state: DraftState,
  wrapSimulation?: WrapSimulationSnapshot,
) {
  const threatenedPlayer = getThreatenedPlayerSnapshot(wrapSimulation, candidate.player.id);
  if (threatenedPlayer) {
    return widenProbability(candidate, 1 - threatenedPlayer.lossProbability);
  }

  const position = primaryPosition(candidate);
  const needPressure = upcomingTeamsBeforeNextTurn(state)
    .reduce((sum, team) => sum + positionNeedWeight(team, position, state.league), 0);

  const marketPressure =
    ((220 - Math.min(yahooRoomVisibilityRank(candidate), 220)) / 220) * 1.6 +
    ((220 - Math.min(candidate.market.ecr, 220)) / 220) * 0.4;

  const scarcity = scarcityBonus(position, candidate.market.tier, state.league);
  const raw =
    0.95 -
    needPressure * 0.065 -
    marketPressure * 0.24 -
    scarcity * 0.09 -
    Math.max(0, state.league.teams - 10) * 0.01;
  return widenProbability(candidate, raw);
}

function valueOverReplacement(
  candidate: DraftCandidate,
  pool: DraftCandidate[],
  league: LeagueConfig,
  cachedBaselines?: Map<PlayerPosition, number>,
) {
  const position = primaryPosition(candidate);
  const replacementValue = cachedBaselines?.get(position) ?? (() => {
    const samePosition = pool
      .filter((item) => primaryPosition(item) === position)
      .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
    return samePosition[replacementIndex(position, pool, league)]?.projection.range.p50 ??
      candidate.projection.range.p50;
  })();
  return {
    valueOverReplacement: Number((candidate.projection.range.p50 - replacementValue).toFixed(2)),
    replacementBaseline: Number(replacementValue.toFixed(2)),
  };
}

function expectedPositionValueAtNextPick(
  position: PlayerPosition,
  availableCandidates: DraftCandidate[],
  state: DraftState,
  wrapSimulation: WrapSimulationSnapshot | undefined,
  replacementBaselines: Map<PlayerPosition, number>,
) {
  const options = availableCandidates
    .filter((candidate) => primaryPosition(candidate) === position)
    .map((candidate) => ({
      candidate,
      value: valueOverReplacement(
        candidate,
        availableCandidates,
        state.league,
        replacementBaselines,
      ).valueOverReplacement,
    }))
    .sort((a, b) => b.value - a.value);

  // Estimate the expected best surviving option, not merely the chance that
  // one named player survives. Treating a player's loss as zero positional
  // value badly overstates VONA when a close substitute is likely to reach the
  // next pick. The sequential form approximates the maximum of the surviving
  // same-position values while keeping the live wrap model authoritative.
  let probabilityAllBetterOptionsAreGone = 1;
  let expectedValue = 0;
  for (const option of options) {
    const survival = estimateMakeItBackProbability(option.candidate, state, wrapSimulation);
    expectedValue += probabilityAllBetterOptionsAreGone * survival * option.value;
    probabilityAllBetterOptionsAreGone *= 1 - survival;
    if (probabilityAllBetterOptionsAreGone < 0.001) break;
  }
  return Number(expectedValue.toFixed(2));
}

export function buildRedraftBoard(
  candidates: DraftCandidate[],
  league: LeagueConfig,
): RedraftBoardEntry[] {
  const starterDemand = starterDemandByPosition(candidates, league);
  const replacementBaselines = replacementBaselinesByPosition(candidates, league);
  const expectedMarketCost = (candidate: DraftCandidate) => {
    const ecr = Number.isFinite(candidate.market.ecr) && candidate.market.ecr > 0
      ? candidate.market.ecr
      : candidate.market.adp;
    const adp = Number.isFinite(candidate.market.adp) && candidate.market.adp > 0
      ? candidate.market.adp
      : ecr;
    return candidate.market.adpSource === "direct"
      ? adp * 0.62 + ecr * 0.38
      : ecr;
  };
  const marketRankById = new Map(
    [...candidates]
      .sort((a, b) => expectedMarketCost(a) - expectedMarketCost(b))
      .map((candidate, index) => [candidate.player.id, index + 1] as const),
  );
  const samePositionRankById = new Map<string, number>();

  for (const position of BOARD_POSITIONS) {
    const samePosition = candidates
      .filter((candidate) => primaryPosition(candidate) === position)
      .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);

    samePosition.forEach((candidate, index) => {
      samePositionRankById.set(candidate.player.id, index + 1);
    });
  }

  const baseEntries = candidates.map((candidate) => {
    const position = primaryPosition(candidate);
    const replacement = valueOverReplacement(candidate, candidates, league, replacementBaselines);
    const robustness = candidate.signals?.robustness;
    const refresh = candidate.signals?.refresh;
    const expectedOpportunity = candidate.signals?.expectedOpportunity;
    const roleSecurity = candidate.signals?.roleSecurity;
    const scoringProfile = candidate.signals?.scoringProfile;
    const positionRank = samePositionRankById.get(candidate.player.id) ?? 999;
    const utilityMultiplier = positionUtilityMultiplier(position, league);
    const leverage = positionalLeverage(candidate, candidates, league, starterDemand);
    const stabilityBonus = Number(
      (
        ((robustness ? 100 - robustness.fragilityScore : 58) / 100) * 5.8 +
        ((robustness?.medianStickiness ?? 55) - 50) / 13
      ).toFixed(2),
    );
    const fragilityPenalty = Number(
      (((robustness?.fragilityScore ?? 42) / 100) * 3.8).toFixed(2),
    );
    const convictionBonus = 0;
    const refreshBonus = Number(
      (
        (refresh?.netImpact ?? 0) * 0.28 +
        (refresh?.status === "rising"
          ? 0.45
          : refresh?.status === "falling"
            ? -0.7
            : refresh?.status === "volatile"
              ? -0.3
              : 0)
      ).toFixed(2),
    );
    const scoringProfileBonus = Number(
      (
        (scoringProfile?.stabilityImpact ?? 0) * 0.8 +
        (scoringProfile?.label === "volume-backed"
          ? 0.9
          : scoringProfile?.label === "touchdown-fragile"
            ? -1.25
            : 0)
      ).toFixed(2),
    );
    const opportunitySecurityBonus = Number(
      (
        (expectedOpportunity?.stabilityImpact ?? 0) * 0.72 +
        (roleSecurity?.stabilityImpact ?? 0) * 0.86 +
        (expectedOpportunity?.label === "strong"
          ? 1.05
          : expectedOpportunity?.label === "thin"
            ? -1.1
            : 0) +
        (roleSecurity?.label === "secure"
          ? 1.25
          : roleSecurity?.label === "fragile"
            ? -1.35
            : 0)
      ).toFixed(2),
    );
    const onesiePenalty = onesieDepthPenalty(position, positionRank, league);
    const score = Number(
      (
        replacement.valueOverReplacement * utilityMultiplier +
        leverage.score +
        stabilityBonus +
        convictionBonus +
        refreshBonus +
        opportunitySecurityBonus +
        scoringProfileBonus -
        onesiePenalty -
        fragilityPenalty
      ).toFixed(2),
    );

    return {
      playerId: candidate.player.id,
      boardScore: score,
      marketRank: marketRankById.get(candidate.player.id) ?? 999,
      positionRank,
      replacementBaseline: replacement.replacementBaseline,
      valueOverReplacement: replacement.valueOverReplacement,
      positionUtilityMultiplier: Number(utilityMultiplier.toFixed(2)),
      onesiePenalty,
      positionalLeverage: leverage,
    };
  });

  const structuralEntries = baseEntries
    .sort((a, b) => b.boardScore - a.boardScore)
    .map((entry, index) => {
      const candidate = candidates.find((item) => item.player.id === entry.playerId);
      const structuralRank = index + 1;
      const marketWeight = candidate?.market.adpSource === "direct" ? 0.55 : 0.45;
      return {
        ...entry,
        structuralRank,
        acquisitionRankScore: Number(
          (structuralRank * (1 - marketWeight) + entry.marketRank * marketWeight).toFixed(2),
        ),
      };
    });

  return structuralEntries
    .sort(
      (a, b) =>
        a.acquisitionRankScore - b.acquisitionRankScore ||
        b.boardScore - a.boardScore,
    )
    .map((entry, index) => ({
      ...entry,
      boardRank: index + 1,
      boardEdge: entry.marketRank - (index + 1),
    }));
}

function getAvailableCandidates(state: DraftState, pool: DraftCandidate[]) {
  return pool.filter((candidate) => state.availablePlayerIds.includes(candidate.player.id));
}

function candidateByRecommendation(
  recommendation: CandidateRecommendation | null,
  pool: DraftCandidate[],
) {
  if (!recommendation) {
    return null;
  }

  return pool.find((candidate) => candidate.player.id === recommendation.playerId) ?? null;
}

function candidateById(playerId: string, pool: DraftCandidate[]) {
  return pool.find((candidate) => candidate.player.id === playerId) ?? null;
}

function marketValueGap(candidate: DraftCandidate) {
  const expectedRank = (candidate.market.adp + candidate.market.ecr) / 2;
  const actualRank = candidate.market.tier * 12;
  return Number((Math.max(0, expectedRank - actualRank) / 12).toFixed(2));
}

function yahooRoomVisibilityRank(candidate: DraftCandidate) {
  const yahooXRank = candidate.market.yahooXRank ?? candidate.market.yahooRank;
  if (typeof yahooXRank === "number" && yahooXRank > 0) return yahooXRank;
  if (typeof candidate.market.yahooAdp === "number" && candidate.market.yahooAdp > 0) {
    return candidate.market.yahooAdp;
  }
  return (candidate.market.adp + candidate.market.ecr) / 2;
}

function expectedMarketPick(candidate: DraftCandidate) {
  return yahooRoomVisibilityRank(candidate);
}

function probabilityUncertainty(candidate: DraftCandidate) {
  return Math.min(0.22, Math.max(0, (candidate.market.rankSpread ?? 0) / 400));
}

function widenProbability(candidate: DraftCandidate, probability: number) {
  const uncertainty = probabilityUncertainty(candidate);
  const midpointAdjusted = probability * (1 - uncertainty) + 0.5 * uncertainty;
  return Number(Math.max(0.03, Math.min(0.97, midpointAdjusted)).toFixed(2));
}

function probabilityBand(candidate: DraftCandidate, probability: number) {
  const uncertainty = probabilityUncertainty(candidate);
  return {
    low: Number(Math.max(0.01, probability - uncertainty).toFixed(2)),
    high: Number(Math.min(0.99, probability + uncertainty).toFixed(2)),
  };
}

function upcomingTeamsBeforeNextTurn(state: DraftState) {
  const byId = new Map(state.teams.map((team) => [team.teamId, team]));
  return getLivePicksBeforeNextTurn(state).overallPicks.map((overallPick) => {
    const pickInfo = getSnakePickInfo(overallPick, state.league.teams);
    return byId.get(pickInfo.teamId) ?? null;
  }).filter((team): team is TeamRosterState => team !== null);
}

function positionRunDemandScore(
  team: TeamRosterState,
  position: PlayerPosition,
  state: DraftState,
  pool: DraftCandidate[],
) {
  const available = getAvailableCandidates(state, pool)
    .filter((candidate) => primaryPosition(candidate) === position)
    .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
  const topCandidate = available[0];
  if (!topCandidate) {
    return 0;
  }

  const replacement = valueOverReplacement(topCandidate, pool, state.league);
  const need = positionNeedWeight(team, position, state.league);
  const valueSignal = 1 + replacement.valueOverReplacement / 28;
  return need * valueSignal * scarcityMultiplier(position, state.league);
}

export function buildWrapSimulationSnapshot(
  state: DraftState,
  pool: DraftCandidate[],
  options?: {
    simulations?: number;
  },
): WrapSimulationSnapshot {
  const available = getAvailableCandidates(state, pool);
  const upcomingPicks = getLivePicksBeforeNextTurn(state).overallPicks;
  const picksSimulated = upcomingPicks.length;
  const simulations = options?.simulations ?? PRODUCTION_WRAP_SIMULATIONS;

  if (available.length === 0 || picksSimulated <= 0) {
    return {
      simulations,
      picksSimulated,
      positionSnapshots: [],
      pickPredictions: [],
      threatenedPlayers: [],
      summary: "No upcoming wrap picks are available to simulate from the current board state.",
    };
  }

  const seed = hashString(
    [
      state.currentPick,
      upcomingPicks.join("|"),
      state.myTeamId,
      state.availablePlayerIds.slice(0, 24).join("|"),
      state.teams
        .map((team) => `${team.teamId}:${team.openSlots.join(",")}:${JSON.stringify(team.positionCounts)}`)
        .join("|"),
    ].join("::"),
  );
  const random = createSeededRandom(seed);
  const positions = BOARD_POSITIONS.filter((position) =>
    available.some((candidate) => primaryPosition(candidate) === position),
  );
  const pickPositionTallies = Array.from({ length: picksSimulated }, () => new Map<PlayerPosition, number>());
  const pickPlayerTallies = Array.from({ length: picksSimulated }, () => new Map<string, number>());
  const positionDistributionCounts = new Map<PlayerPosition, Map<number, number>>();
  const positionExpectedCounts = new Map<PlayerPosition, number>();
  const playerLossCounts = new Map<string, number>();
  const playerPickTotals = new Map<string, number>();
  const playerTeamTallies = new Map<string, Map<string, number>>();

  for (const position of positions) {
    positionDistributionCounts.set(position, new Map<number, number>());
    positionExpectedCounts.set(position, 0);
  }

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const availablePool = [...available];
    const teamsById = new Map(state.teams.map((team) => [team.teamId, cloneTeamState(team)] as const));
    const perSimulationPositionCounts = new Map<PlayerPosition, number>();

    for (let pickIndex = 0; pickIndex < picksSimulated; pickIndex += 1) {
      const overallPick = upcomingPicks[pickIndex];
      if (overallPick === undefined) continue;
      const pickInfo = getSnakePickInfo(overallPick, state.league.teams);
      const team = teamsById.get(pickInfo.teamId);
      if (!team) {
        continue;
      }

      const selected = selectSimulatedPick(team, availablePool, state.league, random);
      if (!selected) {
        continue;
      }

      const position = primaryPosition(selected);
      const availableIndex = availablePool.findIndex(
        (candidate) => candidate.player.id === selected.player.id,
      );
      if (availableIndex >= 0) {
        availablePool.splice(availableIndex, 1);
      }

      teamsById.set(team.teamId, updateTeamStateWithSimulatedPick(team, selected));
      perSimulationPositionCounts.set(position, (perSimulationPositionCounts.get(position) ?? 0) + 1);
      positionExpectedCounts.set(position, (positionExpectedCounts.get(position) ?? 0) + 1);
      pickPositionTallies[pickIndex]?.set(position, (pickPositionTallies[pickIndex]?.get(position) ?? 0) + 1);
      pickPlayerTallies[pickIndex]?.set(
        selected.player.id,
        (pickPlayerTallies[pickIndex]?.get(selected.player.id) ?? 0) + 1,
      );
      playerLossCounts.set(selected.player.id, (playerLossCounts.get(selected.player.id) ?? 0) + 1);
      playerPickTotals.set(selected.player.id, (playerPickTotals.get(selected.player.id) ?? 0) + overallPick);

      const teamTallies = playerTeamTallies.get(selected.player.id) ?? new Map<string, number>();
      teamTallies.set(team.teamId, (teamTallies.get(team.teamId) ?? 0) + 1);
      playerTeamTallies.set(selected.player.id, teamTallies);
    }

    for (const position of positions) {
      const count = perSimulationPositionCounts.get(position) ?? 0;
      const distribution = positionDistributionCounts.get(position);
      distribution?.set(count, (distribution.get(count) ?? 0) + 1);
    }
  }

  const positionSnapshots: WrapSimulationPositionSnapshot[] = positions.map((position) => ({
    position,
    expectedSelections: Number(
      ((positionExpectedCounts.get(position) ?? 0) / simulations).toFixed(2),
    ),
    distribution: Array.from(positionDistributionCounts.get(position)?.entries() ?? [])
      .sort((a, b) => a[0] - b[0])
      .map(([count, occurrenceCount]) => ({
        count,
        probability: Number((occurrenceCount / simulations).toFixed(2)),
      })),
  }));

  const pickPredictions: OpponentPickPredictionSnapshot[] = Array.from(
    { length: picksSimulated },
    (_, pickIndex) => {
      const overallPick = upcomingPicks[pickIndex] ?? state.currentPick + pickIndex + 1;
      const pickInfo = getSnakePickInfo(overallPick, state.league.teams);
      const positionProbabilities: WrapSimulationPositionProbability[] = Array.from(
        pickPositionTallies[pickIndex]?.entries() ?? [],
      )
        .map(([position, count]) => ({
          position,
          probability: Number((count / simulations).toFixed(2)),
        }))
        .sort((a, b) => b.probability - a.probability);
      const likelyPosition = positionProbabilities[0]?.position ?? "WR";
      const likelyPlayer = Array.from(pickPlayerTallies[pickIndex]?.entries() ?? [])
        .sort((a, b) => b[1] - a[1])[0];
      const playerConfidence = likelyPlayer ? likelyPlayer[1] / simulations : 0;

      return {
        overallPick,
        teamId: pickInfo.teamId,
        likelyPlayerId: playerConfidence >= 0.16 ? likelyPlayer?.[0] ?? null : null,
        likelyPosition,
        confidence: Number((positionProbabilities[0]?.probability ?? 0).toFixed(2)),
        positionProbabilities: positionProbabilities.slice(0, 3),
        summary: `${pickInfo.teamId} most often attacks ${likelyPosition} here, with ${Math.round((positionProbabilities[0]?.probability ?? 0) * 100)}% of sims leaning that way.`,
      } satisfies OpponentPickPredictionSnapshot;
    },
  );

  const threatenedPlayers: SimulatedPlayerLossSnapshot[] = Array.from(playerLossCounts.entries())
    .map(([playerId, count]) => {
      const lossProbability = Number((count / simulations).toFixed(2));
      const expectedPick = count > 0
        ? Number(((playerPickTotals.get(playerId) ?? 0) / count).toFixed(1))
        : null;
      const likelyTeamIds = Array.from(playerTeamTallies.get(playerId)?.entries() ?? [])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([teamId]) => teamId);

      return {
        playerId,
        lossProbability,
        expectedPick,
        likelyTeamIds,
        summary: `${Math.round(lossProbability * 100)}% of wraps remove this player before your next turn.`,
      } satisfies SimulatedPlayerLossSnapshot;
    })
    .filter((snapshot) => snapshot.lossProbability > 0)
    .sort((a, b) => b.lossProbability - a.lossProbability)
    .slice(0, 12);

  return {
    simulations,
    picksSimulated,
    positionSnapshots,
    pickPredictions,
    threatenedPlayers,
    summary: `${simulations} deterministic wrap simulations across the next ${picksSimulated} picks drive the current make-it-back and run-pressure estimates.`,
  };
}

export function buildPositionRunSnapshots(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): PositionRunSnapshot[] {
  const available = getAvailableCandidates(state, pool);

  return BOARD_POSITIONS
    .map((position) => {
      const samePosition = available
        .filter((candidate) => primaryPosition(candidate) === position)
        .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);

      if (samePosition.length === 0) {
        return null;
      }

      const topTier = samePosition[0].market.tier;
      const tierPlayers = samePosition.filter((candidate) => candidate.market.tier === topTier);
      const tierTail = tierPlayers.at(-1) ?? samePosition[0];
      const nextTierPlayer =
        samePosition.find((candidate) => candidate.market.tier > topTier) ??
        samePosition[Math.min(samePosition.length - 1, tierPlayers.length)] ??
        tierTail;
      const cliffDrop = Number(
        Math.max(0, tierTail.projection.range.p50 - nextTierPlayer.projection.range.p50).toFixed(1),
      );
      const simulationPosition = getWrapSimulationPositionSnapshot(wrapSimulation, position);
      const upcomingTeams = upcomingTeamsBeforeNextTurn(state);
      const urgentTeamIds = Array.from(
        new Set(
          upcomingTeams
            .filter((team) => team.openSlots.includes(position))
            .map((team) => team.teamId),
        ),
      );
      const teamsWithFlexNeed = Array.from(
        new Set(
          upcomingTeams
            .filter(
              (team) =>
                FLEX_ELIGIBLE.includes(position) &&
                !team.openSlots.includes(position) &&
                team.openSlots.includes("W/R/T"),
            )
            .map((team) => team.teamId),
        ),
      ).length;
      const expectedSelectionsBeforeNextTurn = Number(
        (
          simulationPosition?.expectedSelections ??
          upcomingTeamsBeforeNextTurn(state).reduce((sum, team) => {
            const positionScores = BOARD_POSITIONS.map((candidatePosition) =>
              positionRunDemandScore(team, candidatePosition, state, pool),
            );
            const total = positionScores.reduce((scoreSum, score) => scoreSum + score, 0);
            const currentPositionScore = positionRunDemandScore(team, position, state, pool);
            if (total <= 0) {
              return sum;
            }

            return sum + currentPositionScore / total;
          }, 0)
        ).toFixed(2),
      );
      const rawTierSurvivalProbability = Number(
        clamp(
          simulationPosition
            ? simulationPosition.distribution
                .filter((outcome) => outcome.count < tierPlayers.length)
                .reduce((sum, outcome) => sum + outcome.probability, 0)
            : Math.exp(
                -expectedSelectionsBeforeNextTurn / Math.max(0.85, tierPlayers.length * 0.9),
              ),
          simulationPosition ? 0 : 0.05,
          simulationPosition ? 1 : 0.97,
        ).toFixed(2),
      );
      const averageRankSpread = tierPlayers.reduce(
        (sum, candidate) => sum + (candidate.market.rankSpread ?? 0),
        0,
      ) / Math.max(1, tierPlayers.length);
      const tierUncertainty = Math.min(0.2, averageRankSpread / 400);
      const tierSurvivalProbability = Number(
        (rawTierSurvivalProbability * (1 - tierUncertainty) + 0.5 * tierUncertainty).toFixed(2),
      );
      const tierSurvivalProbabilityLow = Number(
        Math.max(0.01, tierSurvivalProbability - tierUncertainty).toFixed(2),
      );
      const tierSurvivalProbabilityHigh = Number(
        Math.min(0.99, tierSurvivalProbability + tierUncertainty).toFixed(2),
      );
      const runRisk =
        tierSurvivalProbability <= 0.34 ||
        expectedSelectionsBeforeNextTurn >= tierPlayers.length * 0.95 ||
        (cliffDrop >= 18 && tierSurvivalProbability <= 0.6)
          ? "high"
          : tierSurvivalProbability <= 0.58 ||
              expectedSelectionsBeforeNextTurn >= tierPlayers.length * 0.6 ||
              (cliffDrop >= 10 && expectedSelectionsBeforeNextTurn >= 0.5)
            ? "medium"
            : "low";
      const headline =
        runRisk === "high"
          ? `${position} run risk is live before your next turn`
          : runRisk === "medium"
            ? `${position} could soften quickly on the wrap`
            : `${position} has a decent chance to hold together`;
      const summary =
        runRisk === "high"
          ? `The current ${position} tier is under real stress: about ${expectedSelectionsBeforeNextTurn.toFixed(1)} selections are expected before your next turn, and the next cliff is ${cliffDrop.toFixed(1)} points.`
          : runRisk === "medium"
            ? `${position} is not fully collapsing yet, but ${expectedSelectionsBeforeNextTurn.toFixed(1)} likely selections before your next turn could push you off the cleanest tier.`
            : cliffDrop >= 10
              ? `${position} has a real ${cliffDrop.toFixed(1)}-point tier cliff, but current roster demand projects only ${expectedSelectionsBeforeNextTurn.toFixed(1)} selections before your next turn, so the cliff is not yet an imminent run.`
              : `${position} still has enough live supply that you can pass once if stronger value shows up elsewhere.`;

      return {
        position,
        runRisk,
        upcomingPickCount: state.picksUntilNextTurn,
        teamsWithStarterNeed: urgentTeamIds.length,
        teamsWithFlexNeed,
        urgentTeamIds,
        expectedSelectionsBeforeNextTurn,
        tierPlayerCount: tierPlayers.length,
        tierSurvivalProbability,
        tierSurvivalProbabilityLow,
        tierSurvivalProbabilityHigh,
        marketUncertainty: averageRankSpread >= 50 ? "wide" : "normal",
        cliffDrop,
        headline,
        summary,
      } satisfies PositionRunSnapshot;
    })
    .filter((snapshot): snapshot is PositionRunSnapshot => snapshot !== null)
    .sort(
      (a, b) =>
        (b.runRisk === "high" ? 2 : b.runRisk === "medium" ? 1 : 0) -
          (a.runRisk === "high" ? 2 : a.runRisk === "medium" ? 1 : 0) ||
        b.cliffDrop - a.cliffDrop,
    );
}

export function buildPositionMarketSnapshots(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): PositionMarketSnapshot[] {
  const available = getAvailableCandidates(state, pool);
  const runSnapshots = buildPositionRunSnapshots(state, pool, wrapSimulation);
  const runSnapshotByPosition = new Map(
    runSnapshots.map((snapshot) => [snapshot.position, snapshot] as const),
  );

  return BOARD_POSITIONS
    .map((position) => {
      const samePosition = available
        .filter((candidate) => primaryPosition(candidate) === position)
        .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);

      if (samePosition.length === 0) {
        return null;
      }

      const topCandidate = samePosition[0];
      const replacement = valueOverReplacement(topCandidate, available, state.league);
      const tierPeers = samePosition.filter(
        (candidate) => candidate.market.tier === topCandidate.market.tier,
      );
      const tierAnchor = tierPeers.at(-1) ?? topCandidate;
      const nextTierCandidate =
        samePosition.find((candidate) => candidate.market.tier > topCandidate.market.tier) ??
        samePosition[Math.min(samePosition.length - 1, 4)] ??
        topCandidate;
      const tierDrop = Number(
        Math.max(
          0,
          topCandidate.projection.range.p50 - nextTierCandidate.projection.range.p50,
        ).toFixed(2),
      );
      const demand = starterDemandForPosition(position, available, state.league);
      const scarcityIndex = Number(
        (
          (demand / Math.max(samePosition.length, 1)) *
          scarcityMultiplier(position, state.league)
        ).toFixed(2),
      );
      const marketState =
        scarcityIndex >= 1.45 || tierDrop >= 20
          ? "drying-up"
          : scarcityIndex >= 0.95 || tierDrop >= 11
            ? "thinning"
            : "stable";
      const runSnapshot = runSnapshotByPosition.get(position);
      const label =
        marketState === "drying-up"
          ? "Drying Up"
          : marketState === "thinning"
            ? "Thinning"
            : "Stable";

      return {
        position,
        label,
        availableCount: samePosition.length,
        starterDemand: demand,
        replacementBaseline: replacement.replacementBaseline,
        topAvailableName: topCandidate.player.fullName,
        topAvailableMedian: Number(topCandidate.projection.range.p50.toFixed(1)),
        topTier: topCandidate.market.tier,
        tierDrop: Number(
          Math.max(
            tierDrop,
            topCandidate.projection.range.p50 - tierAnchor.projection.range.p50,
          ).toFixed(1),
        ),
        scarcityIndex,
        marketState,
        runRisk: runSnapshot?.runRisk ?? "low",
        tierSurvivalProbability: runSnapshot?.tierSurvivalProbability ?? 0.8,
        expectedSelectionsBeforeNextTurn:
          runSnapshot?.expectedSelectionsBeforeNextTurn ?? 0,
        summary: `${position} demand is ${demand} starter-caliber slots across ${state.league.teams} teams, with ${samePosition.length} live options and ${topCandidate.player.fullName} leading the current tier. Around ${
          runSnapshot?.expectedSelectionsBeforeNextTurn.toFixed(1) ?? "0.0"
        } ${position} selections are projected before your next turn.`,
      } satisfies PositionMarketSnapshot;
    })
    .filter((snapshot): snapshot is PositionMarketSnapshot => snapshot !== null)
    .sort((a, b) => b.scarcityIndex - a.scarcityIndex);
}

export function rankDraftCandidates(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
  options?: {
    policyMode?: DraftRecommendationPolicyMode;
    baseBoard?: RedraftBoardEntry[];
  },
): CandidateRecommendation[] {
  assertLeagueMatchesSourceOfTruth(state.league);
  const availableCandidates = getAvailableCandidates(state, pool);
  const availableReplacementBaselines = replacementBaselinesByPosition(
    availableCandidates,
    state.league,
  );
  const turnContext = buildDraftTurnContext(state);
  const turnUrgencyMultiplier =
    turnContext.mode === "long-gap" ? 1.18 : turnContext.mode === "pair-building" ? 0.82 : 1;
  const myTeam = state.teams.find((team) => team.teamId === state.myTeamId) ?? null;
  const runSnapshotByPosition = new Map(
    buildPositionRunSnapshots(state, pool, wrapSimulation).map((snapshot) => [snapshot.position, snapshot] as const),
  );
  const baseBoardById = new Map(
    (options?.baseBoard ?? buildRedraftBoard(pool, state.league)).map((entry) => [
      entry.playerId,
      entry,
    ] as const),
  );
  const expectedPositionValueLater = new Map(
    BOARD_POSITIONS.map((position) => [
      position,
      expectedPositionValueAtNextPick(
        position,
        availableCandidates,
        state,
        wrapSimulation,
        availableReplacementBaselines,
      ),
    ] as const),
  );

  return availableCandidates
    .map((candidate) => {
      const boardEntry = baseBoardById.get(candidate.player.id);
      if (!boardEntry) {
        return null;
      }

      const position = primaryPosition(candidate);
      const runSnapshot = runSnapshotByPosition.get(position);
      const makeItBack = estimateMakeItBackProbability(candidate, state, wrapSimulation);
      const makeItBackBand = probabilityBand(candidate, makeItBack);
      const replacement = valueOverReplacement(
        candidate,
        availableCandidates,
        state.league,
        availableReplacementBaselines,
      );
      const valueNow = replacement.valueOverReplacement;
      const valueLater = Math.min(valueNow, expectedPositionValueLater.get(position) ?? 0);
      const upsideDelta = Number(
        (candidate.projection.range.p90 - candidate.projection.range.p50).toFixed(2),
      );
      const scarcity = scarcityBonus(position, candidate.market.tier, state.league);
      const hasOpenStarterPath = myTeam
        ? myTeam.openSlots.includes(position) ||
          (FLEX_ELIGIBLE.includes(position) && myTeam.openSlots.includes("W/R/T"))
        : true;
      const vonaMultiplier = hasOpenStarterPath
        ? 1
        : 1 / Math.max(1, state.league.benchSlots);
      const vona = Number(((valueNow - valueLater) * vonaMultiplier).toFixed(2));
      const valueGapVsMarket = marketValueGap(candidate);
      const pprLift =
        position === "WR"
          ? state.league.scoring.receptionPoints * 0.55
          : position === "RB"
            ? state.league.scoring.receptionPoints * 0.32
            : position === "TE"
              ? state.league.scoring.receptionPoints * 0.4
              : 0;
      const bonusLift =
        position === "WR"
          ? (candidate.projection.stats.receiving100Games ?? 0) * (state.league.scoring.yardageBonuses?.receiving100 ?? 0)
          : position === "RB"
            ? (candidate.projection.stats.rushing100Games ?? 0) * (state.league.scoring.yardageBonuses?.rushing100 ?? 0)
            : position === "QB"
              ? (candidate.projection.stats.passing300Games ?? 0) * (state.league.scoring.yardageBonuses?.passing300 ?? 0)
              : 0;
      const robustness = candidate.signals?.robustness;
      const dossier = candidate.signals?.dossier;
      const refresh = candidate.signals?.refresh;
      const expectedOpportunity = candidate.signals?.expectedOpportunity;
      const roleSecurity = candidate.signals?.roleSecurity;
      const rosterNeed = myTeam ? positionNeedWeight(myTeam, position, state.league) : 0.45;
      const rosterNeedBonus = Number(((rosterNeed - 0.4) * 6.6).toFixed(2));
      const remainingExactStarters = myTeam
        ? Math.max(0, (countRequiredSlots(state.league)[position] ?? 0) - (myTeam.positionCounts[position] ?? 0))
        : 0;
      const currentRound = getSnakePickInfo(state.currentPick, state.league.teams).round;
      const multiStarterDemandBonus = options?.policyMode === "construction-ablation"
        ? 0
        : currentRound >= 4 && FLEX_ELIGIBLE.includes(position) && remainingExactStarters > 0
          ? Number(
              (
                (22 + Math.max(0, remainingExactStarters - 1) * 44) *
                (1 - makeItBack)
              ).toFixed(2),
            )
          : 0;
      const constructionPenalty = options?.policyMode === "construction-ablation"
        ? 0
        : rosterConstructionPenalty(myTeam, position, state);
      const completionBonus = rosterCompletionBonus(myTeam, position, state);
      const stabilityBonus = Number(
        (
          ((robustness ? 100 - robustness.fragilityScore : 58) / 100) * 2.8 +
          ((robustness?.medianStickiness ?? 55) - 50) / 18
        ).toFixed(2),
      );
      const robustnessPenalty = Number(
        (((robustness?.fragilityScore ?? 42) / 100) * 2.6).toFixed(2),
      );
      const tierPressureBonus = Number(
        (
          (runSnapshot ? (1 - runSnapshot.tierSurvivalProbability) * 4.8 : 0) +
          (runSnapshot ? runSnapshot.cliffDrop * 0.08 : 0)
        ).toFixed(2),
      );
      const convictionBonus = 0;
      const refreshBonus = Number(
        (
          (refresh?.netImpact ?? 0) * 0.42 +
          (refresh?.status === "rising"
            ? 0.7
            : refresh?.status === "falling"
              ? -0.95
              : refresh?.status === "volatile"
                ? -0.45
                : 0)
        ).toFixed(2),
      );
      const opportunitySecurityBonus = Number(
        (
          (expectedOpportunity?.stabilityImpact ?? 0) * 0.58 +
          (roleSecurity?.stabilityImpact ?? 0) * 0.72 +
          (expectedOpportunity?.label === "strong"
            ? 0.95
            : expectedOpportunity?.label === "thin"
              ? -1.05
              : 0) +
          (roleSecurity?.label === "secure"
            ? 1.05
            : roleSecurity?.label === "fragile"
              ? -1.2
              : 0)
        ).toFixed(2),
      );
      const focusBonus =
        state.focus === "upside"
          ? upsideDelta * 0.18 +
            convictionBonus * 0.5 +
            opportunitySecurityBonus * 0.35 +
            refreshBonus * 0.45 -
            robustnessPenalty * 0.35
          : state.focus === "structural"
            ? rosterNeedBonus +
              scarcity * 0.55 +
              tierPressureBonus +
              opportunitySecurityBonus * 0.65 +
              stabilityBonus +
              refreshBonus * 0.55 -
              robustnessPenalty * 0.45
            : rosterNeedBonus * 0.55 +
                scarcity * 0.35 +
                pprLift * 0.55 +
                bonusLift * 0.1 +
                tierPressureBonus * 0.55 +
                opportunitySecurityBonus * 0.55 +
                stabilityBonus +
                convictionBonus -
                refreshBonus * (refresh?.status === "falling" ? 0.4 : -0.4) -
                robustnessPenalty * 0.45;
      const structuralScore = Number(
        (
          boardEntry.boardScore +
          vona * 1.22 * turnUrgencyMultiplier +
          focusBonus +
          (makeItBack <= 0.35 ? 1.8 : makeItBack <= 0.55 ? 0.8 : 0) * turnUrgencyMultiplier +
          tierPressureBonus * 0.35 * turnUrgencyMultiplier -
          refreshBonus * (refresh?.status === "falling" ? 0.15 : -0.45) -
          robustnessPenalty -
          constructionPenalty +
          completionBonus +
          multiStarterDemandBonus
        ).toFixed(2),
      );
      const marketLeverageScore = Number(
        (
          Math.max(0, boardEntry.boardEdge) * 2.5 +
          boardEntry.boardScore * 0.42 +
          valueNow * 0.28 +
          stabilityBonus * 0.45 +
          convictionBonus -
          refreshBonus * (refresh?.status === "falling" ? 0.2 : -0.35) -
          robustnessPenalty * 0.25
        ).toFixed(2),
      );
      const score = structuralScore;

      return {
        playerId: candidate.player.id,
        score,
        explanation: {
          summary: [
            `${candidate.player.fullName} sits at our board rank ${boardEntry.boardRank} versus market rank ${boardEntry.marketRank}, a ${boardEntry.boardEdge >= 0 ? "+" : ""}${boardEntry.boardEdge}-slot gap.`,
            `${position} value is measured against the first projected non-starter after this league's required lineup and flex spots are allocated.`,
            `The next-round positional pocket adds ${boardEntry.positionalLeverage.score.toFixed(1)} points of leverage (${boardEntry.positionalLeverage.medianTierEdge.toFixed(1)} median-point tier edge).`,
            `${Math.round(makeItBack * 100)}% chance this player makes it back; the best expected ${position} option at the next pick is worth ${valueLater.toFixed(1)}, leaving ${vona.toFixed(1)} points of take-now value.`,
            turnContext.summary,
            constructionPenalty > 0
              ? `${position} is already filled on Vaughn's roster, so this option carries a ${constructionPenalty.toFixed(0)}-point roster-construction penalty.`
              : completionBonus > 0
                ? `${position} remains unfilled late in the draft, adding ${completionBonus.toFixed(0)} points of empirically tested roster-completion urgency.`
                : multiStarterDemandBonus > 0
                  ? `${remainingExactStarters} exact ${position} starters remain open, adding ${multiStarterDemandBonus.toFixed(0)} points of multi-slot demand supported by paired construction-ablation results.`
                  : "This position remains compatible with the current roster build.",
          ],
          ourBoardRank: boardEntry.boardRank,
          marketRank: boardEntry.marketRank,
          boardEdge: boardEntry.boardEdge,
          ourBoardScore: boardEntry.boardScore,
          marketLeverageScore,
          positionRank: boardEntry.positionRank,
          positionUtilityMultiplier: boardEntry.positionUtilityMultiplier,
          onesiePenalty: boardEntry.onesiePenalty,
          positionalLeverageScore: boardEntry.positionalLeverage.score,
          medianTierEdge: boardEntry.positionalLeverage.medianTierEdge,
          floorTierEdge: boardEntry.positionalLeverage.floorTierEdge,
          ceilingTierEdge: boardEntry.positionalLeverage.ceilingTierEdge,
          positionalComparisonPlayerId: boardEntry.positionalLeverage.comparisonPlayerId,
          makeItBackProbability: makeItBack,
          makeItBackProbabilityLow: makeItBackBand.low,
          makeItBackProbabilityHigh: makeItBackBand.high,
          valueNow,
          valueLater,
          vona,
          upsideDelta,
          scarcityBonus: scarcity,
          replacementBaseline: replacement.replacementBaseline,
          pprLift: Number(pprLift.toFixed(2)),
          bonusLift: Number(bonusLift.toFixed(2)),
          focusBonus: Number(focusBonus.toFixed(2)),
          stabilityBonus,
          robustnessPenalty,
          tierPressureBonus,
          convictionBonus,
          refreshBonus,
          rawValueScore: marketLeverageScore,
          structuralScore,
          valueGapVsMarket,
          tierSurvivalProbability: runSnapshot?.tierSurvivalProbability ?? 0.8,
          tierSurvivalProbabilityLow: runSnapshot?.tierSurvivalProbabilityLow,
          tierSurvivalProbabilityHigh: runSnapshot?.tierSurvivalProbabilityHigh,
          expectedPositionSelections: runSnapshot?.expectedSelectionsBeforeNextTurn ?? 0,
          runRisk: runSnapshot?.runRisk ?? "low",
          fragilityScore: robustness?.fragilityScore ?? 42,
          convictionScore: dossier?.convictionScore ?? 50,
          freshnessScore: refresh?.freshnessScore ?? 18,
          valueCase: `${candidate.player.fullName} is a market-value target because our board has him ${Math.abs(boardEntry.boardEdge)} slot${Math.abs(boardEntry.boardEdge) === 1 ? "" : "s"} ${boardEntry.boardEdge >= 0 ? "ahead of" : "behind"} market cost while still keeping ${valueNow.toFixed(1)} points of replacement edge.`,
          structuralCase: `${candidate.player.fullName} matches current roster pressure through lineup-derived replacement value, a ${Math.round(makeItBack * 100)}% chance he makes it back, ${vona.toFixed(1)} points of take-now value after accounting for expected ${position} substitutes, and a ${Math.round(
            (runSnapshot?.tierSurvivalProbability ?? 0.8) * 100,
          )}% chance this tier survives the wrap.`,
        },
      };
    })
    .filter((entry): entry is CandidateRecommendation => entry !== null)
    .sort((a, b) => b.score - a.score);
}

export function buildDraftDecisionSnapshot(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): DraftDecisionSnapshot {
  const recommendations = rankDraftCandidates(state, pool, wrapSimulation);
  const structuralBest = recommendations[0] ?? null;
  const topScore = structuralBest?.score ?? 0;
  const marketValuePool = recommendations.filter(
    (recommendation) =>
      recommendation.explanation.boardEdge > 0 &&
      (recommendation.explanation.ourBoardRank <= 36 || recommendation.score >= topScore - 8),
  );
  const valueBest =
    [...(marketValuePool.length > 0 ? marketValuePool : recommendations)].sort(
      (a, b) => b.explanation.marketLeverageScore - a.explanation.marketLeverageScore,
    )[0] ?? null;
  const samePlayer =
    structuralBest !== null &&
    valueBest !== null &&
    structuralBest.playerId === valueBest.playerId;

  if (!structuralBest || !valueBest) {
    return {
      structuralBest,
      valueBest,
      samePlayer: false,
      headline: "No live recommendation",
      summary: "The board needs available players before the draft lenses can compare structure and pure value.",
    };
  }

  if (samePlayer) {
    return {
      structuralBest,
      valueBest,
      samePlayer: true,
      headline: "Our board and market value agree",
      summary:
        "One player leads both the live pick recommendation and the market-value lens right now, so there is no need to manufacture a split.",
    };
  }

  return {
    structuralBest,
    valueBest,
    samePlayer: false,
    headline: "Our board and market value are split",
    summary: `Your live pick recommendation and your best board-discount target are not the same player. This is the main tradeoff to manage before the wrap.`,
  };
}

function conditionalPercentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[
    Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * quantile)))
  ] ?? 0;
}

function personalPickSequence(state: DraftState, count: number) {
  const picks: number[] = [];
  const occupied = new Set(state.drafted.map((pick) => pick.overallPick));
  const maxPick = state.currentPick + state.league.teams * Math.max(2, count + 1);
  for (let overallPick = state.currentPick; overallPick <= maxPick; overallPick += 1) {
    if (occupied.has(overallPick)) continue;
    if (getSnakePickInfo(overallPick, state.league.teams).teamId !== state.myTeamId) continue;
    picks.push(overallPick);
    if (picks.length >= count) break;
  }
  return picks;
}

function conditionalLineupScore(
  playerIds: string[],
  candidateById: Map<string, DraftCandidate>,
  pool: DraftCandidate[],
  league: LeagueConfig,
  key: "p10" | "p50" | "p90",
  replacementBaselines?: Map<PlayerPosition, number>,
  sampledOutcomeIndex?: number,
  pairedOutcomePlayerIds?: Set<string>,
) {
  const projectedValue = (candidate: DraftCandidate) => {
    if (sampledOutcomeIndex === undefined) return candidate.projection.range[key];
    // Paired counterfactuals need common random numbers for the forced choices.
    // Seeding those players by identity makes Choice A and Choice B receive
    // different luck, inflating regret variance instead of isolating the pick.
    const outcomeKey = pairedOutcomePlayerIds?.has(candidate.player.id)
      ? "forced-choice"
      : candidate.player.id;
    const outcome = createSeededRandom(
      hashString(`conditional-outcome:${sampledOutcomeIndex}:${outcomeKey}`),
    )();
    return outcome < 0.5
      ? candidate.projection.range.p10 +
          (candidate.projection.range.p50 - candidate.projection.range.p10) * outcome * 2
      : candidate.projection.range.p50 +
          (candidate.projection.range.p90 - candidate.projection.range.p50) * (outcome - 0.5) * 2;
  };
  const byPosition = new Map<PlayerPosition, DraftCandidate[]>();
  for (const playerId of new Set(playerIds)) {
    const candidate = candidateById.get(playerId);
    if (!candidate || !["QB", "RB", "WR", "TE"].includes(primaryPosition(candidate))) continue;
    const position = primaryPosition(candidate);
    const values = byPosition.get(position) ?? [];
    values.push(candidate);
    byPosition.set(position, values);
  }
  for (const values of byPosition.values()) {
    values.sort((a, b) => projectedValue(b) - projectedValue(a));
  }

  const baseline = (position: PlayerPosition) => {
    const cached = replacementBaselines?.get(position);
    if (cached !== undefined) return cached;
    const samePosition = pool
      .filter((candidate) => primaryPosition(candidate) === position)
      .sort((a, b) => b.projection.range[key] - a.projection.range[key]);
    return samePosition[replacementIndex(position, pool, league)]?.projection.range[key] ?? 0;
  };
  let score = 0;
  const leftovers: DraftCandidate[] = [];
  const required = countRequiredSlots(league);
  for (const position of ["QB", "RB", "WR", "TE"] as PlayerPosition[]) {
    const values = [...(byPosition.get(position) ?? [])];
    const requiredCount = required[position] ?? 0;
    for (let index = 0; index < requiredCount; index += 1) {
      const selected = values.shift();
      score += selected ? projectedValue(selected) : baseline(position);
    }
    leftovers.push(...values);
  }

  const flexOptions = [
    ...leftovers
      .filter((candidate) => FLEX_ELIGIBLE.includes(primaryPosition(candidate)))
      .map((candidate) => projectedValue(candidate)),
    ...FLEX_ELIGIBLE.flatMap((position) =>
      Array.from({ length: flexSlotCount(league) }, () => baseline(position)),
    ),
  ].sort((a, b) => b - a);
  score += flexOptions.slice(0, flexSlotCount(league)).reduce((sum, value) => sum + value, 0);
  return score;
}

function chooseConditionalWeighted<T extends { score: number }>(
  entries: T[],
  random: () => number,
) {
  if (entries.length === 0) return null;
  const floor = entries.at(-1)?.score ?? 0;
  const weights = entries.map((entry, index) =>
    Math.max(0.15, entry.score - floor + 0.4) * Math.max(0.65, 1 - index * 0.06),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = random() * total;
  for (let index = 0; index < entries.length; index += 1) {
    remaining -= weights[index] ?? 0;
    if (remaining <= 0) return entries[index] ?? entries[0];
  }
  return entries[0];
}

function conditionalOpponentPick(input: {
  available: Set<string>;
  marketOrder: DraftCandidate[];
  boardById: Map<string, RedraftBoardEntry>;
  team: TeamRosterState;
  state: DraftState;
  overallPick: number;
  random: () => number;
}) {
  const round = getSnakePickInfo(input.overallPick, input.state.league.teams).round;
  const fallenElite = input.marketOrder.find((candidate) => {
    if (!input.available.has(candidate.player.id)) return false;
    const marketRank = input.boardById.get(candidate.player.id)?.marketRank ?? 999;
    return marketRank <= 24 && input.overallPick - marketRank >= 8;
  });
  if (fallenElite && input.random() < 0.86) return fallenElite;
  const shortlist = input.marketOrder
    .filter((candidate) => input.available.has(candidate.player.id))
    .slice(0, 36)
    .map((candidate) => {
      const position = primaryPosition(candidate);
      const board = input.boardById.get(candidate.player.id);
      const marketRank = board?.marketRank ?? 300;
      const boardRank = board?.boardRank ?? 300;
      const rank = marketRank * 0.6 + boardRank * 0.4;
      const fallenValue = clamp(input.overallPick - marketRank, -24, 36);
      const duplicatePenalty =
        (position === "QB" || position === "TE") && (input.team.positionCounts[position] ?? 0) >= 1
          ? round <= 10 ? -34 : -10
          : 0;
      return {
        candidate,
        score:
          -rank * 0.58 +
          fallenValue * 0.62 +
          positionNeedWeight(input.team, position, input.state.league) * 9 +
          duplicatePenalty +
          input.random() * 8,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
  return chooseConditionalWeighted(shortlist, input.random)?.candidate ?? null;
}

function conditionalManagerPick(input: {
  pool: DraftCandidate[];
  state: DraftState;
  policyMode: DraftRecommendationPolicyMode;
  wrapSimulations: number;
  baseBoard: RedraftBoardEntry[];
}) {
  const wrap = buildWrapSimulationSnapshot(input.state, input.pool, {
    simulations: input.wrapSimulations,
  });
  const recommendation = rankDraftCandidates(input.state, input.pool, wrap, {
    policyMode: input.policyMode,
    baseBoard: input.baseBoard,
  })[0];
  return recommendation ? candidateByRecommendation(recommendation, input.pool) : null;
}

function conditionalLineupManagerPick(input: {
  available: Set<string>;
  boardOrder: DraftCandidate[];
  boardById: Map<string, RedraftBoardEntry>;
  rosterIds: string[];
  candidateById: Map<string, DraftCandidate>;
  pool: DraftCandidate[];
  state: DraftState;
  random: () => number;
  medianBaselines: Map<PlayerPosition, number>;
  floorBaselines: Map<PlayerPosition, number>;
}) {
  const shortlist = input.boardOrder
    .filter((candidate) => input.available.has(candidate.player.id))
    .slice(0, 48)
    .map((candidate) => {
      const median = conditionalLineupScore(
        [...input.rosterIds, candidate.player.id], input.candidateById, input.pool,
        input.state.league, "p50", input.medianBaselines,
      );
      const floor = conditionalLineupScore(
        [...input.rosterIds, candidate.player.id], input.candidateById, input.pool,
        input.state.league, "p10", input.floorBaselines,
      );
      const board = input.boardById.get(candidate.player.id);
      return {
        candidate,
        score: median + floor * 0.12 + (board?.boardEdge ?? 0) * 0.18 + input.random() * 1.8,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return chooseConditionalWeighted(shortlist, input.random)?.candidate ?? null;
}

export function buildConditionalDraftPathBoard(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
  options?: {
    simulations?: number;
    candidateLimit?: number;
    horizonPicks?: number;
    policyMode?: DraftRecommendationPolicyMode;
    wrapSimulationsPerPick?: number;
    evaluationMode?: DraftCounterfactualEvaluationMode;
    forcedCandidateIds?: string[];
  },
): ConditionalDraftPathBoard {
  const simulations = Math.max(1, options?.simulations ?? 60);
  const horizonPicks = Math.max(2, options?.horizonPicks ?? 3);
  const policyMode = options?.policyMode ?? "production";
  const evaluationMode = options?.evaluationMode ?? "quick-preview";
  const wrapSimulationsPerPick = evaluationMode === "exact-production"
    ? PRODUCTION_WRAP_SIMULATIONS
    : Math.max(4, options?.wrapSimulationsPerPick ?? 8);
  const futurePicks = personalPickSequence(state, horizonPicks);
  const onClock = getSnakePickInfo(state.currentPick, state.league.teams).teamId;
  if (onClock !== state.myTeamId || futurePicks[0] !== state.currentPick) {
    return {
      generatedAt: new Date().toISOString(),
      simulations,
      currentPick: state.currentPick,
      futurePicks,
      policyMode,
      evaluationMode,
      outcomes: [],
      summary: "Conditional paths activate when your team is on the clock.",
    };
  }

  const available = getAvailableCandidates(state, pool);
  const board = buildRedraftBoard(pool, state.league);
  const boardById = new Map(board.map((entry) => [entry.playerId, entry]));
  const candidateById = new Map(pool.map((candidate) => [candidate.player.id, candidate]));
  const starterDemand = starterDemandByPosition(available, state.league);
  const replacementBaselines = new Map<"p10" | "p50" | "p90", Map<PlayerPosition, number>>();
  for (const key of ["p10", "p50", "p90"] as const) {
    const byPosition = new Map<PlayerPosition, number>();
    for (const position of ["QB", "RB", "WR", "TE"] as PlayerPosition[]) {
      const samePosition = available
        .filter((candidate) => primaryPosition(candidate) === position)
        .sort((a, b) => b.projection.range[key] - a.projection.range[key]);
      byPosition.set(
        position,
        samePosition[starterDemand[position] ?? 0]?.projection.range[key] ?? 0,
      );
    }
    replacementBaselines.set(key, byPosition);
  }
  const marketOrder = [...available].sort(
    (a, b) => (boardById.get(a.player.id)?.marketRank ?? 999) - (boardById.get(b.player.id)?.marketRank ?? 999),
  );
  const boardOrder = [...available].sort(
    (a, b) => (boardById.get(a.player.id)?.boardRank ?? 999) - (boardById.get(b.player.id)?.boardRank ?? 999),
  );
  const candidateLimit = options?.candidateLimit ?? 6;
  const rankedRecommendations = rankDraftCandidates(state, pool, wrapSimulation);
  const recommendationIds = (options?.forcedCandidateIds?.length
    ? options.forcedCandidateIds.filter((playerId) => state.availablePlayerIds.includes(playerId))
    : [
        ...rankedRecommendations.slice(0, Math.max(2, candidateLimit - 4)).map((recommendation) => recommendation.playerId),
        ...(["RB", "WR", "TE", "QB"] as PlayerPosition[]).flatMap((position) => {
          const recommendation = rankedRecommendations.find((entry) => {
            const candidate = candidateById.get(entry.playerId);
            return candidate ? primaryPosition(candidate) === position : false;
          });
          return recommendation ? [recommendation.playerId] : [];
        }),
        ...rankedRecommendations.map((recommendation) => recommendation.playerId),
      ])
    .filter((playerId, index, ids) => ids.indexOf(playerId) === index)
    .slice(0, candidateLimit);
  const initialCandidates = recommendationIds
    .map((playerId) => candidateById.get(playerId))
    .filter((candidate): candidate is DraftCandidate => Boolean(candidate));
  const pairedOutcomePlayerIds = new Set(initialCandidates.map((candidate) => candidate.player.id));
  const myTeam = state.teams.find((team) => team.teamId === state.myTeamId);
  const initialRosterIds = [...new Set([...(myTeam?.starters ?? []), ...(myTeam?.bench ?? [])])];
  const scoresByPlayer = new Map<string, Array<{ floor: number; median: number; ceiling: number }>>();
  const sequencesByPlayer = new Map<string, Map<string, { count: number; picks: ConditionalDraftPathPick[] }>>();
  const winCounts = new Map<string, number>();
  const edgeSamples = new Map<string, number[]>();

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const trialScores = new Map<string, number>();
    for (const initialCandidate of initialCandidates) {
      const random = createSeededRandom(hashString(`${state.currentPick}:conditional:${simulationIndex}`));
      const liveAvailable = new Set(state.availablePlayerIds);
      let simulatedState = applyDraftPick(state, initialCandidate, state.myTeamId, {
        source: "manual",
      });
      let myRosterIds = [...initialRosterIds, initialCandidate.player.id];
      const pathPicks: ConditionalDraftPathPick[] = [{
        overallPick: state.currentPick,
        playerId: initialCandidate.player.id,
        playerName: initialCandidate.player.fullName,
        position: primaryPosition(initialCandidate),
      }];
      liveAvailable.delete(initialCandidate.player.id);
      const lastPick = futurePicks.at(-1) ?? state.currentPick;
      const occupied = new Set(state.drafted.map((pick) => pick.overallPick));
      for (let overallPick = state.currentPick + 1; overallPick <= lastPick; overallPick += 1) {
        if (occupied.has(overallPick)) continue;
        const pick = getSnakePickInfo(overallPick, state.league.teams);
        const team = simulatedState.teams.find((entry) => entry.teamId === pick.teamId);
        if (!team) continue;
        const selected = pick.teamId === state.myTeamId
          ? evaluationMode === "exact-production"
            ? conditionalManagerPick({
                pool,
                state: simulatedState,
                policyMode,
                wrapSimulations: wrapSimulationsPerPick,
                baseBoard: board,
              })
            : conditionalLineupManagerPick({
                available: liveAvailable,
                boardOrder,
                boardById,
                rosterIds: myRosterIds,
                candidateById,
                pool,
                state: simulatedState,
                random,
                medianBaselines: replacementBaselines.get("p50")!,
                floorBaselines: replacementBaselines.get("p10")!,
              })
          : conditionalOpponentPick({
              available: liveAvailable,
              marketOrder,
              boardById,
              team,
              state: simulatedState,
              overallPick,
              random,
            });
        if (!selected) continue;
        liveAvailable.delete(selected.player.id);
        simulatedState = applyDraftPick(simulatedState, selected, pick.teamId, {
          source: "manual",
        });
        if (pick.teamId === state.myTeamId) {
          myRosterIds = [...myRosterIds, selected.player.id];
          pathPicks.push({
            overallPick,
            playerId: selected.player.id,
            playerName: selected.player.fullName,
            position: primaryPosition(selected),
          });
        }
      }

      const score = {
        floor: conditionalLineupScore(myRosterIds, candidateById, pool, state.league, "p10", replacementBaselines.get("p10")),
        median: conditionalLineupScore(myRosterIds, candidateById, pool, state.league, "p50", replacementBaselines.get("p50")),
        ceiling: conditionalLineupScore(myRosterIds, candidateById, pool, state.league, "p90", replacementBaselines.get("p90")),
      };
      const scores = scoresByPlayer.get(initialCandidate.player.id) ?? [];
      scores.push(score);
      scoresByPlayer.set(initialCandidate.player.id, scores);
      trialScores.set(
        initialCandidate.player.id,
        conditionalLineupScore(
          myRosterIds,
          candidateById,
          pool,
          state.league,
          "p50",
          replacementBaselines.get("p50"),
          simulationIndex,
          pairedOutcomePlayerIds,
        ),
      );
      const sequenceKey = pathPicks.map((pick) => pick.playerId).join("|");
      const sequences = sequencesByPlayer.get(initialCandidate.player.id) ?? new Map();
      const existing = sequences.get(sequenceKey);
      sequences.set(sequenceKey, { count: (existing?.count ?? 0) + 1, picks: pathPicks });
      sequencesByPlayer.set(initialCandidate.player.id, sequences);
    }

    const bestScore = Math.max(...trialScores.values());
    const winners = Array.from(trialScores.entries()).filter(([, score]) => Math.abs(score - bestScore) < 0.05);
    for (const [playerId, score] of trialScores) {
      const alternatives = Array.from(trialScores.entries())
        .filter(([otherId]) => otherId !== playerId)
        .map(([, alternativeScore]) => alternativeScore);
      const edges = edgeSamples.get(playerId) ?? [];
      edges.push(score - (alternatives.length > 0 ? Math.max(...alternatives) : score));
      edgeSamples.set(playerId, edges);
    }
    for (const [playerId] of winners) {
      winCounts.set(playerId, (winCounts.get(playerId) ?? 0) + 1 / winners.length);
    }
  }

  const outcomes: ConditionalDraftPathOutcome[] = initialCandidates.map((candidate) => {
    const scores = scoresByPlayer.get(candidate.player.id) ?? [];
    const sequences = Array.from(sequencesByPlayer.get(candidate.player.id)?.values() ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((sequence) => ({
        picks: sequence.picks,
        probability: Number((sequence.count / simulations).toFixed(2)),
      }));
    return {
      initialPlayerId: candidate.player.id,
      initialPlayerName: candidate.player.fullName,
      initialPosition: primaryPosition(candidate),
      simulations,
      winRate: Number(((winCounts.get(candidate.player.id) ?? 0) / simulations).toFixed(2)),
      medianLineupPoints: Number(conditionalPercentile(scores.map((score) => score.median), 0.5).toFixed(1)),
      floorLineupPoints: Number(conditionalPercentile(scores.map((score) => score.floor), 0.5).toFixed(1)),
      ceilingLineupPoints: Number(conditionalPercentile(scores.map((score) => score.ceiling), 0.5).toFixed(1)),
      medianEdgeVsBestAlternative: Number(
        conditionalPercentile(edgeSamples.get(candidate.player.id) ?? [], 0.5).toFixed(1),
      ),
      medianRegret: Number(
        Math.max(0, -conditionalPercentile(edgeSamples.get(candidate.player.id) ?? [], 0.5)).toFixed(1),
      ),
      downsideRegret: Number(
        Math.max(0, -conditionalPercentile(edgeSamples.get(candidate.player.id) ?? [], 0.1)).toFixed(1),
      ),
      recommended: false,
      commonSequences: sequences,
      summary: "",
    };
  }).sort((a, b) => b.winRate - a.winRate || b.medianLineupPoints - a.medianLineupPoints);
  if (outcomes[0]) outcomes[0].recommended = true;
  for (const outcome of outcomes) {
    const sequence = outcome.commonSequences[0]?.picks.slice(1).map((pick) => pick.playerName).join(" then ");
    outcome.summary = `${outcome.initialPlayerName} wins ${Math.round(outcome.winRate * 100)}% of paired room-and-player-outcome simulations across Picks ${futurePicks.join("/")}${sequence ? `; the most common continuation is ${sequence}` : ""}.`;
  }

  return {
    generatedAt: new Date().toISOString(),
    simulations,
    currentPick: state.currentPick,
    futurePicks,
    policyMode,
    evaluationMode,
    outcomes,
    summary: outcomes[0]
      ? `${outcomes[0].initialPlayerName} creates the strongest current three-pick portfolio across ${simulations} paired room simulations.`
      : "No conditional paths are available from the current board.",
  };
}

export function buildPickWindowSnapshot(
  recommendation: CandidateRecommendation | null,
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): PickWindowSnapshot | null {
  const candidate = candidateByRecommendation(recommendation, pool);
  if (!recommendation || !candidate) {
    return null;
  }

  const position = primaryPosition(candidate);
  const availableSamePosition = getAvailableCandidates(state, pool)
    .filter((item) => primaryPosition(item) === position)
    .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
  const currentIndex = availableSamePosition.findIndex(
    (item) => item.player.id === candidate.player.id,
  );
  const runSnapshotByPosition = new Map(
    buildPositionRunSnapshots(state, pool, wrapSimulation).map((snapshot) => [snapshot.position, snapshot] as const),
  );
  const runSnapshot = runSnapshotByPosition.get(position);
  const nextFallback =
    availableSamePosition[Math.min(availableSamePosition.length - 1, currentIndex + 1)] ??
    candidate;
  const slotPressure = runSnapshot
    ? Math.max(0, runSnapshot.expectedSelectionsBeforeNextTurn - currentIndex) * 0.08
    : 0;
  const survivalProbability = Number(
    clamp(
      recommendation.explanation.makeItBackProbability -
        (runSnapshot ? (1 - runSnapshot.tierSurvivalProbability) * 0.24 : 0) -
        slotPressure,
      0.03,
      0.95,
    ).toFixed(2),
  );
  const dropoffIfPassed = Number(
    Math.max(0, candidate.projection.range.p50 - nextFallback.projection.range.p50).toFixed(1),
  );
  const urgency =
    survivalProbability <= 0.33 ||
    dropoffIfPassed >= 16 ||
    runSnapshot?.runRisk === "high"
      ? "now"
      : survivalProbability <= 0.58 ||
          dropoffIfPassed >= 8 ||
          runSnapshot?.runRisk === "medium"
        ? "soon"
        : "can-wait";
  const label =
    urgency === "now" ? "Take now" : urgency === "soon" ? "Preferred this turn" : "Can wait";
  const summary =
    urgency === "now"
      ? `${candidate.player.fullName} is unlikely to survive ${state.picksUntilNextTurn} picks, and the next ${position} fallback drops about ${dropoffIfPassed.toFixed(1)} projected points. The current ${position} tier only has about ${Math.round(
          (runSnapshot?.tierSurvivalProbability ?? 0.8) * 100,
        )}% survival odds.`
      : urgency === "soon"
        ? `${candidate.player.fullName} has a live chance to make it back, but the position starts softening if you pass once and about ${
            runSnapshot?.expectedSelectionsBeforeNextTurn.toFixed(1) ?? "0.0"
          } ${position} picks are expected before your next turn.`
        : `${candidate.player.fullName} has a reasonable chance to survive the wrap, so you can take a stronger board-value swing first if needed.`;

  return {
    playerId: candidate.player.id,
    urgency,
    survivalProbability,
    dropoffIfPassed,
    tierSurvivalProbability: runSnapshot?.tierSurvivalProbability ?? 0.8,
    expectedPositionSelections: runSnapshot?.expectedSelectionsBeforeNextTurn ?? 0,
    runRisk: runSnapshot?.runRisk ?? "low",
    label,
    summary,
  };
}

export function buildReachToleranceSnapshot(
  recommendation: CandidateRecommendation | null,
  state: DraftState,
  pool: DraftCandidate[],
): ReachToleranceSnapshot | null {
  const candidate = candidateByRecommendation(recommendation, pool);
  if (!recommendation || !candidate) {
    return null;
  }

  const marketPick = expectedMarketPick(candidate);
  const marketCost = Number(Math.max(0, marketPick - state.currentPick).toFixed(1));
  const runRisk = recommendation.explanation.runRisk;
  const valueBuffer = Number(
    (
      recommendation.explanation.valueNow +
      recommendation.explanation.tierPressureBonus +
      recommendation.explanation.convictionBonus +
      recommendation.explanation.refreshBonus -
      recommendation.explanation.robustnessPenalty
    ).toFixed(2),
  );
  const rawTolerance =
    valueBuffer * 0.85 +
    (runRisk === "high" ? 6 : runRisk === "medium" ? 3 : 1) +
    (candidate.signals?.preferredTarget?.source === "both"
      ? 2
      : candidate.signals?.preferredTarget
        ? 1
        : 0) +
    (candidate.signals?.refresh?.status === "rising" ? 1.5 : 0) -
    (recommendation.explanation.fragilityScore - 50) * 0.08;
  const maxReachPicks = Math.round(clamp(rawTolerance, 0, 18));
  const label =
    maxReachPicks <= 2
      ? "Do not reach"
      : maxReachPicks <= 7
        ? "Small reach ok"
        : "Aggressive reach ok";
  const summary =
    marketCost <= 1
      ? `${candidate.player.fullName} is already close enough to cost that this is not really a reach.`
      : marketCost <= maxReachPicks
        ? `${candidate.player.fullName} can be taken about ${maxReachPicks} picks ahead of market because the board pressure is real and the value buffer still supports it.`
        : `${candidate.player.fullName} is about ${marketCost.toFixed(1)} picks ahead of market here, which is beyond the current tolerance unless the room is clearly about to wipe the tier.`;

  return {
    playerId: candidate.player.id,
    label,
    maxReachPicks,
    marketCost,
    runRisk,
    valueBuffer,
    summary,
  };
}

export function buildBoardOutlierSnapshots(
  state: DraftState,
  pool: DraftCandidate[],
): BoardOutlierSnapshot[] {
  return getAvailableCandidates(state, pool)
    .filter((candidate) => candidate.signals && candidate.signals.outlierTag !== "aligned")
    .map((candidate) => {
      const signals = candidate.signals!;
      const severity = signals.outlierScore >= 12 ? "strong" : "watch";
      const headline =
        signals.outlierTag === "projection-over-market"
          ? "Projection loves this name more than the market does"
          : signals.outlierTag === "market-over-projection"
            ? "Market is still pricing this player above the projection base"
            : "Role evidence is thinner than the draft price suggests";
      const summary =
        signals.outlierTag === "projection-over-market"
          ? `${candidate.player.fullName} is scoring better in the calibrated projection stack than the market neighborhood implies, so this is an aggressive upside-value click.`
          : signals.outlierTag === "market-over-projection"
            ? `${candidate.player.fullName} is carrying stronger market respect than the projection stack is comfortable with, so you should price in extra fragility.`
            : `${candidate.player.fullName} still has market support, but the role and opportunity evidence are light enough that this can break badly if you overpay.`;

      return {
        playerId: candidate.player.id,
        tag: signals.outlierTag,
        severity,
        score: signals.outlierScore,
        headline,
        summary,
      } satisfies BoardOutlierSnapshot;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export function buildUndervaluedPlaySnapshots(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): UndervaluedPlaySnapshot[] {
  const recommendations = rankDraftCandidates(state, pool, wrapSimulation);
  const realisticPool = recommendations.filter(
    (recommendation) =>
      recommendation.explanation.boardEdge >= 3 &&
      recommendation.explanation.ourBoardRank <= 96 &&
      recommendation.explanation.marketRank <= 144,
  );
  const valuePool = realisticPool.length > 0
    ? realisticPool
    : recommendations.filter((recommendation) => recommendation.explanation.boardEdge > 0);

  return [...valuePool]
    .sort(
      (a, b) =>
        b.explanation.marketLeverageScore - a.explanation.marketLeverageScore ||
        b.explanation.boardEdge - a.explanation.boardEdge,
    )
    .slice(0, 8)
    .map((recommendation) => {
      const { boardEdge, ourBoardRank, marketRank, marketLeverageScore } = recommendation.explanation;
      const label =
        boardEdge >= 12 ? "Major Discount" : boardEdge >= 7 ? "Strong Value" : "Model Value";
      return {
        playerId: recommendation.playerId,
        label,
        ourBoardRank,
        marketRank,
        boardEdge,
        marketLeverageScore,
        summary: `Our board ranks this player ${boardEdge} spot${boardEdge === 1 ? "" : "s"} earlier than the market while preserving live roster value.`,
      } satisfies UndervaluedPlaySnapshot;
    });
}

export function buildTierPivotSnapshots(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): TierPivotSnapshot[] {
  const recommendations = rankDraftCandidates(state, pool, wrapSimulation);
  const candidateRecommendations = recommendations
    .map((recommendation) => ({
      recommendation,
      candidate: candidateByRecommendation(recommendation, pool),
    }))
    .filter(
      (
        entry,
      ): entry is { recommendation: CandidateRecommendation; candidate: DraftCandidate } =>
        entry.candidate !== null,
    );
  const windowsByPlayerId = new Map<string, PickWindowSnapshot>();
  for (const { recommendation } of candidateRecommendations.slice(0, 12)) {
    const window = buildPickWindowSnapshot(recommendation, state, pool, wrapSimulation);
    if (window) {
      windowsByPlayerId.set(window.playerId, window);
    }
  }

  const seenPositions = new Set<PlayerPosition>();
  const plans: TierPivotSnapshot[] = [];

  for (const { candidate } of candidateRecommendations) {
    const position = primaryPosition(candidate);
    if (seenPositions.has(position)) {
      continue;
    }

    const triggerWindow = windowsByPlayerId.get(candidate.player.id);
    if (!triggerWindow || triggerWindow.urgency === "can-wait") {
      continue;
    }

    const samePosition = getAvailableCandidates(state, pool)
      .filter((item) => primaryPosition(item) === position)
      .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
    const fallbackPlayerIds = samePosition
      .filter((item) => item.player.id !== candidate.player.id)
      .slice(0, 2)
      .map((item) => item.player.id);
    const alternative = candidateRecommendations.find((entry) => {
      const otherPosition = primaryPosition(entry.candidate);
      if (otherPosition === position) {
        return false;
      }

      const otherWindow = windowsByPlayerId.get(entry.candidate.player.id);
      return otherWindow?.urgency !== "now";
    });
    const alternativePlayerId = alternative?.candidate.player.id ?? null;
    const fallbackNames = fallbackPlayerIds
      .map((playerId) => candidateById(playerId, pool)?.player.fullName)
      .filter(Boolean);
    const alternativeName = alternativePlayerId
      ? candidateById(alternativePlayerId, pool)?.player.fullName
      : null;
    const fallbackSummary =
      fallbackNames.length > 0
        ? `fall back to ${fallbackNames.join(" or ")}`
        : "stay flexible on the remaining board";

    plans.push({
      position,
      triggerPlayerId: candidate.player.id,
      fallbackPlayerIds,
      alternativePlayerId,
      urgency: triggerWindow.urgency,
      summary: `${candidate.player.fullName} is your current ${position} hinge. If that tier breaks, ${fallbackSummary}${alternativeName ? `, or pivot across the board to ${alternativeName} if value is cleaner there.` : "."}`,
    });

    seenPositions.add(position);
    if (plans.length >= 2) {
      break;
    }
  }

  return plans;
}

export function buildTierWipeScenarioSnapshots(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): TierWipeScenarioSnapshot[] {
  const runSnapshots = buildPositionRunSnapshots(state, pool, wrapSimulation).filter(
    (snapshot) => snapshot.runRisk !== "low",
  );
  const ranked = rankDraftCandidates(state, pool, wrapSimulation);

  return runSnapshots
    .map((snapshot) => {
      const samePosition = getAvailableCandidates(state, pool)
        .filter((candidate) => primaryPosition(candidate) === snapshot.position)
        .sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
      if (samePosition.length === 0) {
        return null;
      }

      const likelyLostCount = Math.max(
        1,
        Math.min(samePosition.length, Math.ceil(snapshot.expectedSelectionsBeforeNextTurn)),
      );
      const threatened = samePosition.slice(0, likelyLostCount);
      const pivotCandidate = ranked
        .map((recommendation) => candidateByRecommendation(recommendation, pool))
        .find(
          (candidate) =>
            candidate !== null &&
            primaryPosition(candidate) !== snapshot.position &&
            !threatened.some((item) => item.player.id === candidate.player.id),
        );
      const fallbackPlayers = samePosition
        .slice(likelyLostCount, likelyLostCount + 2)
        .map((candidate) => candidate.player.id);
      const lastThreatened = threatened.at(-1) ?? samePosition[0];
      const postWipe = samePosition[likelyLostCount] ?? samePosition.at(-1) ?? lastThreatened;
      const dropoffAfterWipe = Number(
        Math.max(0, lastThreatened.projection.range.p50 - postWipe.projection.range.p50).toFixed(1),
      );

      return {
        position: snapshot.position,
        threatenedPlayerIds: threatened.map((candidate) => candidate.player.id),
        likelyLostCount,
        dropoffAfterWipe,
        pivotPlayerId: pivotCandidate?.player.id ?? null,
        fallbackPlayerIds: fallbackPlayers,
        summary:
          threatened.length > 0
            ? `If the next ${likelyLostCount} ${snapshot.position} names disappear before your wrap, expect roughly a ${dropoffAfterWipe.toFixed(1)} point drop at the position${pivotCandidate ? ` and be ready to pivot across the board to ${pivotCandidate.player.fullName}.` : "."}`
            : `No meaningful ${snapshot.position} wipe scenario is active right now.`,
      } satisfies TierWipeScenarioSnapshot;
    })
    .filter((snapshot): snapshot is TierWipeScenarioSnapshot => snapshot !== null)
    .slice(0, 2);
}
