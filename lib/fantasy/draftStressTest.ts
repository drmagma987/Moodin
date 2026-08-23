import { buildRedraftBoard } from "@/lib/fantasy/draft";
import { assertLeagueMatchesSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { getSnakePickInfo } from "@/lib/fantasy/draftState";
import type {
  DraftCandidate,
  DraftState,
  DraftStressPickWindow,
  DraftStressStrategyId,
  DraftStressStrategyOutcome,
  DraftStressTestBoard,
  ManagerDraftBoard,
  ManagerDraftBoardEntry,
  ManagerDraftClassification,
  PlayerPosition,
} from "@/lib/fantasy/types";

const SKILL_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];
const FLEX_POSITIONS: PlayerPosition[] = ["RB", "WR", "TE"];

type StrategyProfile = {
  id: DraftStressStrategyId;
  label: string;
  simulations: number;
};

type SimulationTeam = {
  counts: Partial<Record<PlayerPosition, number>>;
  playerIds: string[];
};

type SimulationResult = {
  starterMedian: number;
  starterFloor: number;
  starterCeiling: number;
  validStarters: boolean;
  counts: Partial<Record<PlayerPosition, number>>;
};

type BalancedTallies = {
  availabilityByPick: Array<Map<string, number>>;
  selectionByPick: Array<Map<string, number>>;
  positionByPick: Array<Map<PlayerPosition, number>>;
  selectedCount: Map<string, number>;
  selectedPickTotal: Map<string, number>;
  selectedPicks: Map<string, number[]>;
};

type StressTestOptions = {
  simulations?: number;
  generatedAt?: string;
  trackedPlayerLimit?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
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

function percentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * quantile)));
  return ordered[index] ?? 0;
}

function requiredCounts(state: DraftState) {
  const counts: Partial<Record<PlayerPosition, number>> = {};
  for (const slot of state.league.rosterSlots) {
    if (slot === "BN" || slot === "IR" || slot === "W/R/T") continue;
    const position = slot as PlayerPosition;
    counts[position] = (counts[position] ?? 0) + 1;
  }
  return counts;
}

function positionNeed(
  team: SimulationTeam,
  position: PlayerPosition,
  state: DraftState,
  round: number,
) {
  const required = requiredCounts(state);
  const count = team.counts[position] ?? 0;
  const exactGap = Math.max(0, (required[position] ?? 0) - count);
  if (exactGap > 0) return 1.25 + exactGap * 0.35;
  if (position === "QB") return count === 0 ? 1 : round >= 13 && count < 2 ? 0.08 : -2.4;
  if (position === "TE") return count === 0 ? 1 : round >= 14 && count < 2 ? 0.05 : -2.1;
  if (FLEX_POSITIONS.includes(position)) return count < (position === "WR" ? 5 : 4) ? 0.52 : 0.12;
  return -2;
}

function strategyAdjustment(
  strategy: DraftStressStrategyId,
  position: PlayerPosition,
  round: number,
) {
  if (strategy === "wr-heavy") {
    if (position === "WR" && round <= 9) return 9;
    if (position === "RB" && round <= 5) return -2;
  }
  if (strategy === "rb-pressure") {
    if (position === "RB" && round <= 7) return 9;
    if (position === "WR" && round <= 4) return -1.5;
  }
  if (strategy === "wait-onesie") {
    if ((position === "QB" || position === "TE") && round <= 7) return -13;
    if (position === "RB" || position === "WR") return 2;
  }
  return 0;
}

function updateTeam(team: SimulationTeam, candidate: DraftCandidate) {
  const position = primaryPosition(candidate);
  team.counts[position] = (team.counts[position] ?? 0) + 1;
  team.playerIds.push(candidate.player.id);
}

function chooseWeighted<T extends { score: number }>(entries: T[], random: () => number) {
  if (entries.length === 0) return null;
  const floor = entries.at(-1)?.score ?? 0;
  const weights = entries.map((entry, index) =>
    Math.max(0.2, entry.score - floor + 0.6) * Math.max(0.55, 1 - index * 0.035),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = random() * total;
  for (let index = 0; index < entries.length; index += 1) {
    remaining -= weights[index] ?? 0;
    if (remaining <= 0) return entries[index] ?? entries[0];
  }
  return entries[0];
}

function firstAvailable(
  candidates: DraftCandidate[],
  available: Set<string>,
  limit: number,
) {
  const result: DraftCandidate[] = [];
  for (const candidate of candidates) {
    if (!available.has(candidate.player.id)) continue;
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

function firstAvailableAtPosition(
  candidates: DraftCandidate[],
  available: Set<string>,
  position: PlayerPosition,
  limit: number,
) {
  const result: DraftCandidate[] = [];
  for (const candidate of candidates) {
    if (primaryPosition(candidate) !== position || !available.has(candidate.player.id)) continue;
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

function selectOpponentPick(input: {
  available: Set<string>;
  candidatesByMarket: DraftCandidate[];
  boardById: Map<string, { boardEdge: number }>;
  team: SimulationTeam;
  state: DraftState;
  overallPick: number;
  random: () => number;
}) {
  const round = getSnakePickInfo(input.overallPick, input.state.league.teams).round;
  const shortlist = firstAvailable(input.candidatesByMarket, input.available, 34)
    .map((candidate) => {
      const position = primaryPosition(candidate);
      const expectedPick = (candidate.market.adp + candidate.market.ecr) / 2;
      const fallenValue = clamp(input.overallPick - expectedPick, -24, 30);
      const need = positionNeed(input.team, position, input.state, round);
      return {
        candidate,
        score:
          -expectedPick * 0.42 +
          fallenValue * 0.68 +
          need * 10.5 +
          (input.boardById.get(candidate.player.id)?.boardEdge ?? 0) * 0.05 +
          input.random() * 11,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  return chooseWeighted(shortlist, input.random)?.candidate ?? null;
}

function selectMyPick(input: {
  available: Set<string>;
  candidatesByBoard: DraftCandidate[];
  boardById: Map<string, { boardRank: number; boardEdge: number; positionRank: number }>;
  team: SimulationTeam;
  state: DraftState;
  strategy: DraftStressStrategyId;
  overallPick: number;
  random: () => number;
}) {
  const round = getSnakePickInfo(input.overallPick, input.state.league.teams).round;
  const availableByBoard = firstAvailable(input.candidatesByBoard, input.available, 80);
  const pool = new Map(
    [
      ...availableByBoard.slice(0, 42),
      ...SKILL_POSITIONS.flatMap((position) =>
        firstAvailableAtPosition(input.candidatesByBoard, input.available, position, 8),
      ),
    ].map((candidate) => [candidate.player.id, candidate] as const),
  );
  const shortlist = Array.from(pool.values())
    .map((candidate) => {
      const position = primaryPosition(candidate);
      const board = input.boardById.get(candidate.player.id);
      const expectedPick = (candidate.market.adp + candidate.market.ecr) / 2;
      const need = positionNeed(input.team, position, input.state, round);
      const fallenValue = clamp(input.overallPick - expectedPick, -30, 36);
      const eliteOnesie =
        (position === "QB" && (board?.positionRank ?? 99) <= 4) ||
        (position === "TE" && (board?.positionRank ?? 99) <= 3);
      const patiencePenalty =
        !eliteOnesie && round <= 6 && (position === "QB" || position === "TE") ? -8 : 0;
      const completionPressure =
        position === "QB" && (input.team.counts.QB ?? 0) === 0 && round >= 10
          ? 60 + (round - 10) * 8
          : position === "TE" && (input.team.counts.TE ?? 0) === 0 && round >= 9
            ? 48 + (round - 9) * 7
            : 0;
      const redundancyPenalty =
        position === "QB" && (input.team.counts.QB ?? 0) >= 1 && round < 14
          ? -42
          : position === "TE" && (input.team.counts.TE ?? 0) >= 1 && round < 14
            ? -34
            : (position === "QB" || position === "TE") && (input.team.counts[position] ?? 0) >= 2
              ? -100
              : 0;
      const dossier = candidate.signals?.dossier.stance;
      const conviction =
        dossier === "priority-target" ? 4 : dossier === "pocket-value" ? 2 : dossier === "market-trap" ? -4 : 0;
      return {
        candidate,
        score:
          -(board?.boardRank ?? 300) * 0.48 +
          (board?.boardEdge ?? 0) * 0.38 +
          need * 13 +
          fallenValue * 0.38 +
          strategyAdjustment(input.strategy, position, round) +
          patiencePenalty +
          completionPressure +
          redundancyPenalty +
          conviction +
          input.random() * 5.5,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return chooseWeighted(shortlist, input.random)?.candidate ?? null;
}

function scoreRoster(playerIds: string[], candidateById: Map<string, DraftCandidate>): SimulationResult {
  const byPosition = new Map<PlayerPosition, DraftCandidate[]>();
  for (const playerId of playerIds) {
    const candidate = candidateById.get(playerId);
    if (!candidate) continue;
    const position = primaryPosition(candidate);
    const values = byPosition.get(position) ?? [];
    values.push(candidate);
    byPosition.set(position, values);
  }
  for (const values of byPosition.values()) {
    values.sort((a, b) => b.projection.range.p50 - a.projection.range.p50);
  }
  const originalCounts: Partial<Record<PlayerPosition, number>> = {};
  for (const position of SKILL_POSITIONS) {
    originalCounts[position] = byPosition.get(position)?.length ?? 0;
  }

  const starters: DraftCandidate[] = [];
  const take = (position: PlayerPosition, count: number) => {
    const values = byPosition.get(position) ?? [];
    starters.push(...values.splice(0, count));
  };
  take("QB", 1);
  take("RB", 2);
  take("WR", 3);
  take("TE", 1);
  const flex = [
    ...(byPosition.get("RB") ?? []),
    ...(byPosition.get("WR") ?? []),
    ...(byPosition.get("TE") ?? []),
  ]
    .sort((a, b) => b.projection.range.p50 - a.projection.range.p50)
    .slice(0, 2);
  starters.push(...flex);

  const validStarters =
    (originalCounts.QB ?? 0) >= 1 &&
    (originalCounts.RB ?? 0) >= 2 &&
    (originalCounts.WR ?? 0) >= 3 &&
    (originalCounts.TE ?? 0) >= 1 &&
    starters.length >= 9;

  const sum = (key: "p10" | "p50" | "p90") =>
    Number(starters.reduce((total, candidate) => total + candidate.projection.range[key], 0).toFixed(1));
  const counts: Partial<Record<PlayerPosition, number>> = {};
  for (const playerId of playerIds) {
    const candidate = candidateById.get(playerId);
    if (!candidate) continue;
    const position = primaryPosition(candidate);
    counts[position] = (counts[position] ?? 0) + 1;
  }
  return {
    starterMedian: sum("p50"),
    starterFloor: sum("p10"),
    starterCeiling: sum("p90"),
    validStarters,
    counts,
  };
}

function classificationFor(
  candidate: DraftCandidate,
  board: { boardRank: number; marketRank: number; boardEdge: number },
): ManagerDraftClassification {
  if (candidate.signals?.situation.certainty === "low") return "situation-watch";
  if (candidate.signals?.dossier.stance === "market-trap" && board.boardEdge <= -10) return "pass";
  if (board.boardEdge >= 4) return "priority-target";
  if (board.boardEdge <= -4) return "discount-only";
  return "take-at-cost";
}

function managerInstruction(input: {
  classification: ManagerDraftClassification;
  recommendedPick: number | null;
  nextPick: number | null;
  availabilityNext: number;
}) {
  const pick = input.recommendedPick ? `Pick ${input.recommendedPick}` : "the late board";
  if (input.classification === "priority-target") {
    return `${pick} is the acquisition point; waiting until ${input.nextPick ? `Pick ${input.nextPick}` : "another turn"} leaves only ${Math.round(input.availabilityNext * 100)}% simulated survival.`;
  }
  if (input.classification === "discount-only") {
    return `Do not pay consensus cost. Reconsider at ${pick} only if the roster still needs this profile.`;
  }
  if (input.classification === "situation-watch") {
    return `Do not reach. ${pick} is the earliest acceptable price while the role question remains unresolved.`;
  }
  if (input.classification === "pass") {
    return "The market price and model profile remain too far apart; use the adjacent tier instead.";
  }
  return `Take at ${pick} if the player fits the live roster; the simulation does not justify an earlier reach.`;
}

function buildManagerEntry(input: {
  candidate: DraftCandidate;
  board: { boardRank: number; marketRank: number; boardEdge: number };
  livePicks: number[];
  availability: number[];
  selectedCount: number;
  selectedPicks: number[];
  simulations: number;
  teamCount: number;
}): ManagerDraftBoardEntry {
  const classification = classificationFor(input.candidate, input.board);
  const costAnchor =
    classification === "discount-only" || classification === "pass"
      ? Math.max(input.board.boardRank, input.board.marketRank)
      : input.board.marketRank;
  let recommendedIndex = input.livePicks.findIndex(
    (pick, index) => pick >= costAnchor - 3 && (input.availability[index] ?? 0) >= 0.08,
  );
  if (recommendedIndex > 0) {
    const priorIndex = recommendedIndex - 1;
    if (
      (input.availability[recommendedIndex] ?? 0) < 0.15 &&
      (input.availability[priorIndex] ?? 0) >= 0.4 &&
      classification !== "discount-only" &&
      classification !== "pass"
    ) {
      recommendedIndex = priorIndex;
    }
  }
  if (recommendedIndex < 0 && classification !== "discount-only" && classification !== "pass") {
    for (let index = 0; index < input.livePicks.length; index += 1) {
      if ((input.livePicks[index] ?? 0) < costAnchor && (input.availability[index] ?? 0) >= 0.08) {
        recommendedIndex = index;
      }
    }
  }
  while (
    recommendedIndex >= 0 &&
    recommendedIndex + 1 < input.livePicks.length &&
    (input.livePicks[recommendedIndex + 1] ?? 999) <= costAnchor + 6 &&
    (input.availability[recommendedIndex + 1] ?? 0) >= 0.5
  ) {
    recommendedIndex += 1;
  }
  const recommendedPick = recommendedIndex >= 0 ? input.livePicks[recommendedIndex] ?? null : null;
  const nextPick = recommendedIndex >= 0 ? input.livePicks[recommendedIndex + 1] ?? null : null;
  const availabilityAtRecommendedPick = recommendedIndex >= 0 ? input.availability[recommendedIndex] ?? 0 : 0;
  const availabilityAtNextPick = recommendedIndex >= 0 ? input.availability[recommendedIndex + 1] ?? 0 : 0;
  const position = primaryPosition(input.candidate);
  const reasons = [
    `Our board ${input.board.boardRank}; market ${input.board.marketRank} (${input.board.boardEdge >= 0 ? "+" : ""}${input.board.boardEdge}).`,
    input.candidate.signals?.situation.summary,
    input.candidate.signals?.dossier.summary,
  ].filter((reason): reason is string => Boolean(reason)).slice(0, 3);
  return {
    playerId: input.candidate.player.id,
    playerName: input.candidate.player.fullName,
    position,
    classification,
    boardRank: input.board.boardRank,
    marketRank: input.board.marketRank,
    boardEdge: input.board.boardEdge,
    marketCostQuality:
      input.candidate.market.adpSource === "direct"
        ? "direct"
        : input.candidate.market.adpSource === "rank-proxy"
          ? "proxy"
          : "unknown",
    recommendedPick,
    recommendedRound: recommendedPick ? getSnakePickInfo(recommendedPick, input.teamCount).round : null,
    nextPick,
    availabilityAtRecommendedPick: Number(availabilityAtRecommendedPick.toFixed(2)),
    availabilityAtNextPick: Number(availabilityAtNextPick.toFixed(2)),
    draftedByUsRate: Number((input.selectedCount / input.simulations).toFixed(2)),
    medianAcquisitionPick:
      input.selectedPicks.length > 0 ? Number(percentile(input.selectedPicks, 0.5).toFixed(1)) : null,
    instruction: managerInstruction({
      classification,
      recommendedPick,
      nextPick,
      availabilityNext: availabilityAtNextPick,
    }),
    reasons,
  };
}

export function buildDraftStressTestBoard(
  candidates: DraftCandidate[],
  state: DraftState,
  options?: StressTestOptions,
): DraftStressTestBoard {
  assertLeagueMatchesSourceOfTruth(state.league);
  const simulations = Math.max(40, options?.simulations ?? 300);
  const balancedSimulations = Math.max(20, Math.round(simulations * 0.4));
  const remaining = simulations - balancedSimulations;
  const strategyProfiles: StrategyProfile[] = [
    { id: "balanced", label: "Model-balanced", simulations: balancedSimulations },
    { id: "wr-heavy", label: "WR-heavy opening", simulations: Math.floor(remaining / 3) },
    { id: "rb-pressure", label: "RB-pressure opening", simulations: Math.floor(remaining / 3) },
    { id: "wait-onesie", label: "Wait on QB/TE", simulations: remaining - Math.floor(remaining / 3) * 2 },
  ];
  const board = buildRedraftBoard(candidates, state.league);
  const boardById = new Map(board.map((entry) => [entry.playerId, entry] as const));
  const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate] as const));
  const eligibleCandidates = candidates.filter((candidate) => SKILL_POSITIONS.includes(primaryPosition(candidate)));
  const candidatesByBoard = [...eligibleCandidates].sort(
    (a, b) => (boardById.get(a.player.id)?.boardRank ?? 999) - (boardById.get(b.player.id)?.boardRank ?? 999),
  );
  const candidatesByMarket = [...eligibleCandidates].sort(
    (a, b) => (boardById.get(a.player.id)?.marketRank ?? 999) - (boardById.get(b.player.id)?.marketRank ?? 999),
  );
  const knownPicks = new Map(state.drafted.map((pick) => [pick.overallPick, pick] as const));
  const keeperPlayerIds = state.drafted.map((pick) => pick.playerId);
  const keeperSet = new Set(keeperPlayerIds);
  const myTeamIndex = state.teams.findIndex((team) => team.teamId === state.myTeamId);
  const draftSlot = myTeamIndex >= 0 ? myTeamIndex + 1 : 1;
  const totalRounds = state.league.rosterSlots.filter((slot) => slot !== "IR").length;
  const maxPick = totalRounds * state.league.teams;
  const livePickNumbers = Array.from({ length: maxPick }, (_, index) => index + 1).filter((overallPick) => {
    const pick = getSnakePickInfo(overallPick, state.league.teams);
    return pick.teamId === state.myTeamId && !knownPicks.has(overallPick);
  });
  const skillLivePicks = livePickNumbers.filter(
    (pick) => getSnakePickInfo(pick, state.league.teams).round < totalRounds,
  );
  const tracked = candidatesByBoard
    .filter((candidate) => !keeperSet.has(candidate.player.id))
    .filter((candidate) => {
      const entry = boardById.get(candidate.player.id);
      return (entry?.boardRank ?? 999) <= 200 || (entry?.marketRank ?? 999) <= 200;
    })
    .slice(0, options?.trackedPlayerLimit ?? 180);
  const trackedIds = new Set(tracked.map((candidate) => candidate.player.id));
  const tallies: BalancedTallies = {
    availabilityByPick: skillLivePicks.map(() => new Map()),
    selectionByPick: skillLivePicks.map(() => new Map()),
    positionByPick: skillLivePicks.map(() => new Map()),
    selectedCount: new Map(),
    selectedPickTotal: new Map(),
    selectedPicks: new Map(),
  };
  const strategyResults = new Map<DraftStressStrategyId, SimulationResult[]>();

  for (const profile of strategyProfiles) {
    const results: SimulationResult[] = [];
    for (let simulationIndex = 0; simulationIndex < profile.simulations; simulationIndex += 1) {
      const random = createSeededRandom(hashString(`${state.league.id}:${profile.id}:${simulationIndex}:${candidates.length}`));
      const available = new Set(eligibleCandidates.map((candidate) => candidate.player.id));
      for (const keeperId of keeperSet) available.delete(keeperId);
      const teams = new Map<string, SimulationTeam>(
        state.teams.map((team) => [team.teamId, { counts: {}, playerIds: [] }]),
      );
      for (const pick of state.drafted) {
        const team = teams.get(pick.teamId);
        const candidate = candidateById.get(pick.playerId);
        if (team && candidate) updateTeam(team, candidate);
      }
      let mySkillPickIndex = 0;

      for (let overallPick = 1; overallPick <= maxPick; overallPick += 1) {
        if (knownPicks.has(overallPick)) continue;
        const pickInfo = getSnakePickInfo(overallPick, state.league.teams);
        const team = teams.get(pickInfo.teamId);
        if (!team) continue;
        if (pickInfo.round === totalRounds) {
          team.counts.K = 1;
          continue;
        }

        if (pickInfo.teamId === state.myTeamId) {
          if (profile.id === "balanced") {
            for (const playerId of trackedIds) {
              if (available.has(playerId)) {
                const map = tallies.availabilityByPick[mySkillPickIndex];
                map?.set(playerId, (map.get(playerId) ?? 0) + 1);
              }
            }
          }
          const selected = selectMyPick({
            available,
            candidatesByBoard,
            boardById,
            team,
            state,
            strategy: profile.id,
            overallPick,
            random,
          });
          if (selected) {
            available.delete(selected.player.id);
            updateTeam(team, selected);
            if (profile.id === "balanced") {
              const selectionMap = tallies.selectionByPick[mySkillPickIndex];
              selectionMap?.set(selected.player.id, (selectionMap.get(selected.player.id) ?? 0) + 1);
              const position = primaryPosition(selected);
              const positionMap = tallies.positionByPick[mySkillPickIndex];
              positionMap?.set(position, (positionMap.get(position) ?? 0) + 1);
              tallies.selectedCount.set(selected.player.id, (tallies.selectedCount.get(selected.player.id) ?? 0) + 1);
              tallies.selectedPickTotal.set(
                selected.player.id,
                (tallies.selectedPickTotal.get(selected.player.id) ?? 0) + overallPick,
              );
              const picks = tallies.selectedPicks.get(selected.player.id) ?? [];
              picks.push(overallPick);
              tallies.selectedPicks.set(selected.player.id, picks);
            }
          }
          mySkillPickIndex += 1;
        } else {
          const selected = selectOpponentPick({
            available,
            candidatesByMarket,
            boardById,
            team,
            state,
            overallPick,
            random,
          });
          if (selected) {
            available.delete(selected.player.id);
            updateTeam(team, selected);
          }
        }
      }
      results.push(scoreRoster(teams.get(state.myTeamId)?.playerIds ?? [], candidateById));
    }
    strategyResults.set(profile.id, results);
  }

  const outcomes: DraftStressStrategyOutcome[] = strategyProfiles.map((profile) => {
    const results = strategyResults.get(profile.id) ?? [];
    const medianStarterPoints = Number(percentile(results.map((result) => result.starterMedian), 0.5).toFixed(1));
    const medianStarterFloor = Number(percentile(results.map((result) => result.starterFloor), 0.5).toFixed(1));
    const medianStarterCeiling = Number(percentile(results.map((result) => result.starterCeiling), 0.5).toFixed(1));
    const averagePositionCounts: Partial<Record<PlayerPosition, number>> = {};
    for (const position of SKILL_POSITIONS) {
      averagePositionCounts[position] = Number(
        (results.reduce((sum, result) => sum + (result.counts[position] ?? 0), 0) / Math.max(1, results.length)).toFixed(1),
      );
    }
    const validStarterRate = Number(
      (results.filter((result) => result.validStarters).length / Math.max(1, results.length)).toFixed(2),
    );
    const compositeScore = Number(
      (medianStarterPoints + medianStarterFloor * 0.25 + medianStarterCeiling * 0.12 + validStarterRate * 20).toFixed(1),
    );
    return {
      id: profile.id,
      label: profile.label,
      simulations: profile.simulations,
      medianStarterPoints,
      medianStarterFloor,
      medianStarterCeiling,
      validStarterRate,
      averagePositionCounts,
      compositeScore,
      recommended: false,
      summary: `${profile.label} produced a ${medianStarterPoints.toFixed(1)}-point median starting lineup with ${Math.round(validStarterRate * 100)}% valid starter completion.`,
    };
  });
  const bestOutcome = [...outcomes].sort((a, b) => b.compositeScore - a.compositeScore)[0];
  for (const outcome of outcomes) outcome.recommended = outcome.id === bestOutcome?.id;

  const pickWindows: DraftStressPickWindow[] = skillLivePicks.map((overallPick, pickIndex) => {
    const pickInfo = getSnakePickInfo(overallPick, state.league.teams);
    const positionMix = Object.fromEntries(
      Array.from(tallies.positionByPick[pickIndex]?.entries() ?? []).map(([position, count]) => [
        position,
        Number((count / balancedSimulations).toFixed(2)),
      ]),
    ) as Partial<Record<PlayerPosition, number>>;
    const topTargets = Array.from(tallies.selectionByPick[pickIndex]?.entries() ?? [])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .flatMap(([playerId, count]) => {
        const candidate = candidateById.get(playerId);
        if (!candidate) return [];
        return [{
          playerId,
          playerName: candidate.player.fullName,
          position: primaryPosition(candidate),
          selectionRate: Number((count / balancedSimulations).toFixed(2)),
          availabilityRate: Number(
            ((tallies.availabilityByPick[pickIndex]?.get(playerId) ?? 0) / balancedSimulations).toFixed(2),
          ),
        }];
      });
    return { overallPick, round: pickInfo.round, pickInRound: pickInfo.pickInRound, positionMix, topTargets };
  });

  const managerEntries = tracked.map((candidate) => {
    const entry = boardById.get(candidate.player.id);
    if (!entry) return null;
    const availability = tallies.availabilityByPick.map(
      (map) => (map.get(candidate.player.id) ?? 0) / balancedSimulations,
    );
    return buildManagerEntry({
      candidate,
      board: entry,
      livePicks: skillLivePicks,
      availability,
      selectedCount: tallies.selectedCount.get(candidate.player.id) ?? 0,
      selectedPicks: tallies.selectedPicks.get(candidate.player.id) ?? [],
      simulations: balancedSimulations,
      teamCount: state.league.teams,
    });
  }).filter((entry): entry is ManagerDraftBoardEntry => entry !== null);

  const takeDiverse = (entries: ManagerDraftBoardEntry[], limit = 8, perPosition = 2) => {
    const counts: Partial<Record<PlayerPosition, number>> = {};
    return entries.filter((entry) => {
      if ((counts[entry.position] ?? 0) >= perPosition) return false;
      counts[entry.position] = (counts[entry.position] ?? 0) + 1;
      return true;
    }).slice(0, limit);
  };

  const managerBoard = {
    "priority-target": takeDiverse(managerEntries
      .filter((entry) => entry.classification === "priority-target" && entry.availabilityAtRecommendedPick >= 0.08)
      .sort((a, b) => (a.recommendedPick ?? 999) - (b.recommendedPick ?? 999) || b.boardEdge - a.boardEdge)),
    "take-at-cost": takeDiverse(managerEntries
      .filter((entry) => entry.classification === "take-at-cost" && entry.availabilityAtRecommendedPick >= 0.12)
      .sort((a, b) => b.draftedByUsRate - a.draftedByUsRate || a.boardRank - b.boardRank)),
    "discount-only": takeDiverse(managerEntries
      .filter((entry) => entry.classification === "discount-only")
      .sort((a, b) => b.draftedByUsRate - a.draftedByUsRate || a.boardEdge - b.boardEdge), 8, 3),
    "situation-watch": takeDiverse(managerEntries
      .filter((entry) => entry.classification === "situation-watch" && entry.availabilityAtRecommendedPick >= 0.08)
      .sort((a, b) => a.recommendedPick === null ? 1 : b.recommendedPick === null ? -1 : a.recommendedPick - b.recommendedPick)),
    pass: takeDiverse(managerEntries
      .filter((entry) => entry.classification === "pass")
      .sort((a, b) => a.boardEdge - b.boardEdge), 8, 3),
  } satisfies ManagerDraftBoard;

  return {
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    simulations,
    draftSlot,
    firstLivePick: livePickNumbers[0] ?? state.currentPick,
    keeperPlayerIds,
    livePickNumbers,
    summary: `${simulations} deterministic keeper-aware mock drafts compared four roster constructions from slot ${draftSlot}. ${bestOutcome?.label ?? "The balanced path"} has the best current composite, but the top three builds are close enough to let live value decide rather than forcing an opening script.`,
    assumptions: [
      `${keeperPlayerIds.length} known keeper${keeperPlayerIds.length === 1 ? " is" : "s are"} removed before live selections and occup${keeperPlayerIds.length === 1 ? "ies" : "y"} Picks ${state.drafted.map((pick) => pick.overallPick).sort((a, b) => a - b).join(" and ")}.`,
      `Opponent keeper identities are still unknown. Every unseeded keeper slot is therefore treated as a live market/need pick; this is a conservative availability bound because it removes the room's preferred player instead of inventing a roster-owned keeper.`,
      "Managers may keep 0-3 players. An unused keeper slot remains a live selection, so the total number of players removed before your turn is fixed by draft position; keeper count changes which players leave, not how many.",
      "K is reserved for the final round; no D/ST slot is simulated because this league does not roster one.",
      "Availability is deterministic for the same board snapshot, while proxy ADP remains an approximate room-cost signal.",
    ],
    strategyOutcomes: outcomes.sort((a, b) => b.compositeScore - a.compositeScore),
    pickWindows,
    managerBoard,
  };
}
