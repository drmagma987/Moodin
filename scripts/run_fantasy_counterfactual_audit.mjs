import snapshot from "../lib/fantasy/data/warRoomDataset.generated.json" with { type: "json" };
import {
  buildConditionalDraftPathBoard,
  buildRedraftBoard,
  buildWrapSimulationSnapshot,
  DRAFT_POLICY_CERTIFICATION_VERSION,
  PRODUCTION_WRAP_SIMULATIONS,
  rankDraftCandidates,
} from "../lib/fantasy/draft.ts";
import {
  assertDraftStateMatchesSourceOfTruth,
  getSnakePickInfo,
  seedDraftStateWithKnownPicks,
} from "../lib/fantasy/draftState.ts";

assertDraftStateMatchesSourceOfTruth(snapshot.draftState);

const candidates = snapshot.candidates;
const league = snapshot.draftState.league;
const managerTeamId = snapshot.draftState.myTeamId;
const board = buildRedraftBoard(candidates, league);
const boardById = new Map(board.map((entry) => [entry.playerId, entry]));
const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
const keeperPickNumbers = new Set(snapshot.draftState.drafted.map((pick) => pick.overallPick));
const keeperPlayerIds = new Set(snapshot.draftState.drafted.map((pick) => pick.playerId));

const positionOf = (candidate) => candidate?.player.positions[0] ?? "WR";
const byBoard = [...candidates].sort(
  (a, b) => (boardById.get(a.player.id)?.boardRank ?? 999) - (boardById.get(b.player.id)?.boardRank ?? 999),
);
const byMarket = [...candidates].sort(
  (a, b) => (boardById.get(a.player.id)?.marketRank ?? 999) - (boardById.get(b.player.id)?.marketRank ?? 999),
);

function candidateNamed(name) {
  const candidate = candidates.find((entry) => entry.player.fullName === name);
  if (!candidate) throw new Error(`Golden scenario requires ${name} in the verified pool.`);
  return candidate;
}

function bestAtPosition(position, excluded = new Set()) {
  const candidate = byBoard.find(
    (entry) => positionOf(entry) === position &&
      !keeperPlayerIds.has(entry.player.id) &&
      !excluded.has(entry.player.id),
  );
  if (!candidate) throw new Error(`Golden scenario could not reserve a ${position}.`);
  return candidate;
}

function managerPickNumbersBefore(currentPick) {
  const picks = [];
  for (let overallPick = 1; overallPick < currentPick; overallPick += 1) {
    if (keeperPickNumbers.has(overallPick)) continue;
    if (getSnakePickInfo(overallPick, league.teams).teamId === managerTeamId) picks.push(overallPick);
  }
  return picks;
}

function buildScenarioState({ currentPick, managerPlayers, reservedPlayers = [] }) {
  const managerPickNumbers = managerPickNumbersBefore(currentPick);
  if (managerPlayers.length !== managerPickNumbers.length) {
    throw new Error(
      `Scenario at Pick ${currentPick} supplied ${managerPlayers.length} manager picks for ${managerPickNumbers.length} live turns.`,
    );
  }
  const reservedIds = new Set([
    ...keeperPlayerIds,
    ...managerPlayers.map((candidate) => candidate.player.id),
    ...reservedPlayers.map((candidate) => candidate.player.id),
  ]);
  const managerPickByOverall = new Map(
    managerPickNumbers.map((overallPick, index) => [overallPick, managerPlayers[index]]),
  );
  const marketPool = byMarket.filter((candidate) => !reservedIds.has(candidate.player.id));
  let marketIndex = 0;
  const knownPicks = [];
  for (let overallPick = 1; overallPick < currentPick; overallPick += 1) {
    if (keeperPickNumbers.has(overallPick)) continue;
    const managerCandidate = managerPickByOverall.get(overallPick);
    const candidate = managerCandidate ?? marketPool[marketIndex++];
    if (!candidate) throw new Error(`Scenario at Pick ${currentPick} ran out of market players.`);
    knownPicks.push({
      overallPick,
      playerId: candidate.player.id,
      teamId: getSnakePickInfo(overallPick, league.teams).teamId,
      eventType: "live",
    });
  }
  return seedDraftStateWithKnownPicks(
    snapshot.draftState,
    candidates,
    knownPicks,
    { currentPick },
  );
}

function rosterCompatible(candidate, state) {
  const position = positionOf(candidate);
  const team = state.teams.find((entry) => entry.teamId === state.myTeamId);
  const round = getSnakePickInfo(state.currentPick, state.league.teams).round;
  const count = team?.positionCounts[position] ?? 0;
  if (position === "DST") return false;
  if (position === "K") return round >= 14 && count === 0;
  if (position === "QB" && count >= 1 && (team?.openSlots.length ?? 0) > 0) return false;
  if (position === "TE" && count >= 1 && round <= 9 && (team?.openSlots.length ?? 0) > 0) return false;
  return true;
}

function baselineChoice(order, state) {
  return order.find(
    (candidate) => state.availablePlayerIds.includes(candidate.player.id) && rosterCompatible(candidate, state),
  );
}

function topAvailableAtPosition(state, position) {
  return byBoard.find(
    (candidate) => state.availablePlayerIds.includes(candidate.player.id) && positionOf(candidate) === position,
  );
}

const allen = candidateNamed("Josh Allen");
const bowers = candidateNamed("Brock Bowers");
const reservedElite = byBoard.find(
  (candidate) => !keeperPlayerIds.has(candidate.player.id) && positionOf(candidate) === "RB",
);
if (!reservedElite) throw new Error("Golden scenario requires an elite falling RB.");

const latePicks = managerPickNumbersBefore(109);
const latePositions = ["WR", "RB", "WR", "TE", "RB", "WR", "WR", "RB"];
const lateReserved = new Set();
const lateManagerPlayers = latePicks.map((_, index) => {
  const candidate = bestAtPosition(latePositions[index] ?? "WR", lateReserved);
  lateReserved.add(candidate.player.id);
  return candidate;
});

const scenarioSpecs = [
  {
    id: "early-qb2",
    label: "QB1 rostered before the Round 4 turn",
    state: buildScenarioState({ currentPick: 32, managerPlayers: [allen] }),
    dominatedPositions: ["QB", "K"],
    comparisonPositions: [],
    expectedProductionPositions: ["RB", "WR", "TE"],
  },
  {
    id: "early-te2",
    label: "TE1 rostered before the Round 4 turn",
    state: buildScenarioState({ currentPick: 32, managerPlayers: [bowers] }),
    dominatedPositions: ["TE", "K"],
    comparisonPositions: [],
    expectedProductionPositions: ["RB", "WR", "QB"],
  },
  {
    id: "core-before-backup-qb",
    label: "QB and TE filled while WR/RB/FLEX starters remain open",
    state: buildScenarioState({ currentPick: 49, managerPlayers: [allen, bowers] }),
    dominatedPositions: ["QB", "TE", "K"],
    comparisonPositions: [],
    expectedProductionPositions: ["RB", "WR"],
  },
  {
    id: "late-qb-deadline",
    label: "Round 11 roster still needs its starting quarterback",
    state: buildScenarioState({ currentPick: 109, managerPlayers: lateManagerPlayers }),
    dominatedPositions: [],
    comparisonPositions: ["QB"],
    expectedProductionPositions: ["QB"],
  },
  {
    id: "falling-elite-exception",
    label: "Elite flex-eligible value falls far beyond market cost",
    state: buildScenarioState({
      currentPick: 49,
      managerPlayers: [bestAtPosition("WR"), bestAtPosition("WR", new Set([bestAtPosition("WR").player.id]))],
      reservedPlayers: [reservedElite],
    }),
    dominatedPositions: ["K"],
    comparisonPositions: [],
    expectedPlayerId: reservedElite.player.id,
    expectedProductionPositions: ["RB"],
  },
];

function summarizeOutcome(outcome) {
  return {
    player: outcome.initialPlayerName,
    position: outcome.initialPosition,
    winRate: outcome.winRate,
    medianRegret: outcome.medianRegret,
    downsideRegret: outcome.downsideRegret,
  };
}

function evaluateScenario(spec) {
  const wrap = buildWrapSimulationSnapshot(spec.state, candidates, { simulations: 16 });
  const productionRecommendations = rankDraftCandidates(spec.state, candidates, wrap, { baseBoard: board });
  const production = productionRecommendations[0];
  const productionCandidate = production ? candidateById.get(production.playerId) : null;
  const adpBaseline = baselineChoice(byMarket, spec.state);
  const boardBaseline = baselineChoice(byBoard, spec.state);
  if (!productionCandidate || !adpBaseline || !boardBaseline) {
    throw new Error(`${spec.id} could not resolve production and baseline choices.`);
  }
  const dominatedCandidates = spec.dominatedPositions
    .map((position) => topAvailableAtPosition(spec.state, position))
    .filter(Boolean);
  const comparisonCandidates = spec.comparisonPositions
    .map((position) => topAvailableAtPosition(spec.state, position))
    .filter(Boolean);
  const forcedCandidates = [
    productionCandidate,
    adpBaseline,
    boardBaseline,
    ...dominatedCandidates,
    ...comparisonCandidates,
  ]
    .filter((candidate, index, entries) =>
      entries.findIndex((entry) => entry.player.id === candidate.player.id) === index,
    );
  const forcedCandidateIds = forcedCandidates.map((candidate) => candidate.player.id);
  const discovery = buildConditionalDraftPathBoard(spec.state, candidates, wrap, {
    simulations: 2_000,
    candidateLimit: forcedCandidateIds.length,
    horizonPicks: 2,
    policyMode: "construction-ablation",
    evaluationMode: "quick-preview",
    forcedCandidateIds,
  });
  const exactForcedIds = [
    productionCandidate,
    adpBaseline,
    boardBaseline,
    ...dominatedCandidates.slice(0, 1),
    ...comparisonCandidates.slice(0, 1),
  ]
    .filter((candidate, index, entries) =>
      entries.findIndex((entry) => entry.player.id === candidate.player.id) === index,
    )
    .map((candidate) => candidate.player.id);
  const exactScreen = buildConditionalDraftPathBoard(spec.state, candidates, wrap, {
    simulations: 8,
    candidateLimit: exactForcedIds.length,
    horizonPicks: 2,
    policyMode: "production",
    evaluationMode: "exact-production",
    wrapSimulationsPerPick: 4,
    forcedCandidateIds: exactForcedIds,
  });
  const screenById = new Map(exactScreen.outcomes.map((outcome) => [outcome.initialPlayerId, outcome]));
  const screenProduction = screenById.get(productionCandidate.player.id);
  const screenBaselines = [screenById.get(adpBaseline.player.id), screenById.get(boardBaseline.player.id)]
    .filter((outcome) => outcome && outcome.initialPlayerId !== productionCandidate.player.id);
  const closeOrDisputed = exactForcedIds.length > 1 && Boolean(screenProduction) && screenBaselines.some(
    (outcome) => Math.abs(outcome.medianRegret - screenProduction.medianRegret) <= 15,
  );
  const exactSampleSize = closeOrDisputed ? 32 : 8;
  const exactAblation = closeOrDisputed
    ? buildConditionalDraftPathBoard(spec.state, candidates, wrap, {
        simulations: exactSampleSize,
        candidateLimit: exactForcedIds.length,
        horizonPicks: 2,
        policyMode: "production",
        evaluationMode: "exact-production",
        wrapSimulationsPerPick: 4,
        forcedCandidateIds: exactForcedIds,
      })
    : exactScreen;
  const discoveryById = new Map(discovery.outcomes.map((outcome) => [outcome.initialPlayerId, outcome]));
  const exactById = new Map(exactAblation.outcomes.map((outcome) => [outcome.initialPlayerId, outcome]));
  const productionDiscovery = discoveryById.get(productionCandidate.player.id);
  const adpDiscovery = discoveryById.get(adpBaseline.player.id);
  const boardDiscovery = discoveryById.get(boardBaseline.player.id);
  const productionExact = exactById.get(productionCandidate.player.id);
  const adpExact = exactById.get(adpBaseline.player.id);
  const boardExact = exactById.get(boardBaseline.player.id);
  if (!productionDiscovery || !adpDiscovery || !boardDiscovery || !productionExact || !adpExact || !boardExact) {
    throw new Error(`${spec.id} is missing a paired production or baseline outcome.`);
  }
  const dominated = dominatedCandidates.map((candidate) => {
    const outcome = discoveryById.get(candidate.player.id);
    if (!outcome) throw new Error(`${spec.id} is missing ${positionOf(candidate)} discovery evidence.`);
    return { ...summarizeOutcome(outcome), rejected: outcome.medianRegret > 0 };
  });
  const comparisons = comparisonCandidates.map((candidate) => {
    const outcome = discoveryById.get(candidate.player.id);
    if (!outcome) throw new Error(`${spec.id} is missing ${positionOf(candidate)} comparison evidence.`);
    return summarizeOutcome(outcome);
  });
  const positionPass = spec.expectedProductionPositions.includes(positionOf(productionCandidate));
  const playerPass = !spec.expectedPlayerId || spec.expectedPlayerId === productionCandidate.player.id;
  const baselinePass =
    productionDiscovery.medianRegret <= adpDiscovery.medianRegret + 5 &&
    productionDiscovery.medianRegret <= boardDiscovery.medianRegret + 5;
  const dominatedPass = dominated.every((entry) => entry.rejected);
  const exactPass =
    productionExact.medianRegret <= adpExact.medianRegret + 15 &&
    productionExact.medianRegret <= boardExact.medianRegret + 15;
  return {
    id: spec.id,
    label: spec.label,
    currentPick: spec.state.currentPick,
    production: summarizeOutcome(productionDiscovery),
    constrainedAdpBaseline: summarizeOutcome(adpDiscovery),
    constrainedModelBoardBaseline: summarizeOutcome(boardDiscovery),
    dominated,
    comparisons,
    exactPenaltyFreeProduction: summarizeOutcome(productionExact),
    exactConstrainedAdpBaseline: summarizeOutcome(adpExact),
    exactConstrainedModelBoardBaseline: summarizeOutcome(boardExact),
    exactSampleSize,
    uncertainty: closeOrDisputed ? "escalated-close-call" : "screened-separated-or-identical",
    pass: positionPass && playerPass && baselinePass && dominatedPass && exactPass,
    gates: { positionPass, playerPass, baselinePass, dominatedPass, exactPass },
  };
}

const requestedScenario = process.env.FANTASY_AUDIT_SCENARIO;
const selectedScenarioSpecs = requestedScenario
  ? scenarioSpecs.filter((scenario) => scenario.id === requestedScenario)
  : scenarioSpecs;
if (selectedScenarioSpecs.length === 0) throw new Error(`Unknown FANTASY_AUDIT_SCENARIO=${requestedScenario}.`);
const startedAt = Date.now();
const scenarios = selectedScenarioSpecs.map(evaluateScenario);
const report = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  totalDiscoveryRooms: selectedScenarioSpecs.length * 2_000,
  exactPolicyRoomsPerForcedChoice: { screen: 8, closeOrDisputed: 32 },
  policyCertificationVersion: DRAFT_POLICY_CERTIFICATION_VERSION,
  productionWrapSimulations: PRODUCTION_WRAP_SIMULATIONS,
  scenarios,
  allPassed: scenarios.every((scenario) => scenario.pass),
};

console.log(JSON.stringify(report, null, 2));
if (!report.allPassed) {
  const failures = scenarios.filter((scenario) => !scenario.pass).map((scenario) => scenario.id);
  throw new Error(`Counterfactual decision gate failed: ${failures.join(", ")}.`);
}
