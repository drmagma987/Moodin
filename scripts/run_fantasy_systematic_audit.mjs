import fs from "node:fs";
import snapshot from "../lib/fantasy/data/warRoomDataset.generated.json" with { type: "json" };
import {
  buildConditionalDraftPathBoard,
  DRAFT_POLICY_CERTIFICATION_VERSION,
  PRODUCTION_WRAP_SIMULATIONS,
  buildRedraftBoard,
  buildWrapSimulationSnapshot,
  rankDraftCandidates,
} from "../lib/fantasy/draft.ts";
import {
  applyDraftPick,
  assertDraftStateMatchesSourceOfTruth,
  getSnakePickInfo,
} from "../lib/fantasy/draftState.ts";
import { leagueSourceOfTruthFingerprint } from "../lib/fantasy/leagueSourceOfTruth.ts";

const OUTPUT = new URL(
  process.env.FANTASY_SYSTEMATIC_OUTPUT ?? "../lib/fantasy/data/systematicDraftAudit.generated.json",
  import.meta.url,
);
const ROOM_TYPES = [
  "adp", "early-qb", "late-qb", "early-te", "rb-heavy", "wr-heavy", "runs",
  "model", "home-reach", "chaotic", "mixed", "need-aware", "need-late",
];
const PHASES = [
  { id: "early", targetRound: 3 },
  { id: "middle", targetRound: 7 },
  { id: "late", targetRound: 11 },
  { id: "endgame", targetRound: 15 },
];
const STATE_COUNT_PER_PHASE = 8;
const SCREEN_SAMPLES = Number(process.env.FANTASY_SYSTEMATIC_SCREEN_SAMPLES ?? 8);
const CLOSE_SAMPLES = Number(process.env.FANTASY_SYSTEMATIC_CLOSE_SAMPLES ?? 32);
const FORCED_CANDIDATE_LIMIT = Number(process.env.FANTASY_SYSTEMATIC_CANDIDATE_LIMIT ?? 5);
const CONTINUATION_POLICY_MODE = process.env.FANTASY_SYSTEMATIC_POLICY_MODE === "construction-ablation"
  ? "construction-ablation"
  : "production";
const candidates = snapshot.candidates;
const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
const board = buildRedraftBoard(candidates, snapshot.draftState.league);
const boardById = new Map(board.map((entry) => [entry.playerId, entry]));
const byBoard = [...candidates].sort((a, b) => (boardById.get(a.player.id)?.boardRank ?? 999) - (boardById.get(b.player.id)?.boardRank ?? 999));
const byMarket = [...candidates].sort((a, b) => (boardById.get(a.player.id)?.marketRank ?? 999) - (boardById.get(b.player.id)?.marketRank ?? 999));
const required = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1 };

assertDraftStateMatchesSourceOfTruth(snapshot.draftState);
if (!snapshot.warRoomReady || snapshot.warRoomBlockers.length) {
  throw new Error("Systematic audit refused a blocked War Room artifact.");
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function randomFor(seed) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const positionOf = (candidate) => candidate?.player.positions[0] ?? "WR";

function chooseOpponent(state, roomType, seed) {
  const random = randomFor(`${seed}:${state.currentPick}`);
  const pick = getSnakePickInfo(state.currentPick, state.league.teams);
  const team = state.teams.find((entry) => entry.teamId === pick.teamId);
  const round = pick.round;
  const runPosition = ["RB", "WR", "QB", "TE"][Math.floor((state.currentPick - 1) / 8) % 4];
  return candidates
    .filter((candidate) => state.availablePlayerIds.includes(candidate.player.id))
    .map((candidate) => {
      const position = positionOf(candidate);
      const count = team?.positionCounts[position] ?? 0;
      const gap = Math.max(0, (required[position] ?? 0) - count);
      const market = candidate.market.adp ?? 400;
      const model = boardById.get(candidate.player.id)?.boardRank ?? 400;
      let score = -market * 1.15 - model * 0.35 + random() * 18;
      if (roomType === "model") score = -model * 1.4 - market * 0.15 + random() * 12;
      if (roomType === "chaotic") score = -market * 0.45 - model * 0.25 + random() * 95;
      if (roomType === "home-reach") score += random() * 48 + (market > state.currentPick + 20 ? 18 : 0);
      if (roomType === "mixed") score += ((pick.teamId.charCodeAt(5) + round) % 3) * random() * 32;
      if (roomType === "early-qb" && position === "QB" && round <= 7) score += 70;
      if (roomType === "late-qb" && position === "QB" && round <= 9) score -= 100;
      if (roomType === "early-te" && position === "TE" && round <= 8) score += 65;
      if (roomType === "rb-heavy" && position === "RB" && round <= 9) score += 58;
      if (roomType === "wr-heavy" && position === "WR" && round <= 9) score += 58;
      if (roomType === "runs" && position === runPosition) score += 68;
      if (roomType !== "need-late" || round >= 10) score += gap * 38;
      if ((position === "K" || position === "DST") && round < 13) score -= 240;
      if ((position === "QB" || position === "TE") && count >= 1 && round < 11) score -= 42;
      if (round >= 13 && gap > 0) score += 180;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || a.candidate.player.id.localeCompare(b.candidate.player.id))[0]?.candidate;
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
  return order.find((candidate) => state.availablePlayerIds.includes(candidate.player.id) && rosterCompatible(candidate, state));
}

function rosterSnapshot(state) {
  const team = state.teams.find((entry) => entry.teamId === state.myTeamId);
  return {
    counts: team?.positionCounts ?? {},
    openRequiredSlots: (team?.openSlots ?? []).filter((slot) => slot !== "BN" && slot !== "IR"),
    starters: team?.starters ?? [],
    bench: team?.bench ?? [],
  };
}

function buildRoomStates(roomType, run) {
  const seed = `systematic:${roomType}:${run}`;
  let state = structuredClone(snapshot.draftState);
  const managerStates = [];
  const maxPick = state.league.teams * state.league.rosterSlots.filter((slot) => slot !== "IR").length;
  while (state.currentPick <= maxPick) {
    const pick = getSnakePickInfo(state.currentPick, state.league.teams);
    let selected;
    if (pick.teamId === state.myTeamId) {
      const wrap = buildWrapSimulationSnapshot(state, candidates, { simulations: 2 });
      const recommendations = rankDraftCandidates(state, candidates, wrap, { baseBoard: board });
      selected = candidateById.get(recommendations[0]?.playerId);
      managerStates.push({ state: structuredClone(state), recommendations });
    } else {
      selected = chooseOpponent(state, roomType, seed);
    }
    if (!selected) throw new Error(`${seed} has no legal selection at Pick ${state.currentPick}.`);
    state = applyDraftPick(state, selected, pick.teamId, { source: "manual", pickedAt: `seed:${seed}:${state.currentPick}` });
  }
  return { seed, managerStates };
}

function summarizeOutcome(outcome) {
  return {
    playerId: outcome.initialPlayerId,
    player: outcome.initialPlayerName,
    position: outcome.initialPosition,
    winRate: outcome.winRate,
    expectedStarterValue: outcome.medianLineupPoints,
    floorStarterValue: outcome.floorLineupPoints,
    ceilingStarterValue: outcome.ceilingLineupPoints,
    medianRegret: outcome.medianRegret,
    downsideRegret: outcome.downsideRegret,
    commonContinuation: outcome.commonSequences[0] ?? null,
  };
}

function evaluateState(spec) {
  const { state } = spec.source;
  assertDraftStateMatchesSourceOfTruth(state);
  // Room construction uses a two-simulation wrap only to reach deterministic
  // states cheaply. Certification must rebuild the production board from its
  // own stable wrap; otherwise a discovery-preview recommendation can be
  // mislabeled as the production choice evaluated below.
  const wrap = buildWrapSimulationSnapshot(state, candidates, {
    simulations: PRODUCTION_WRAP_SIMULATIONS,
  });
  const recommendations = rankDraftCandidates(state, candidates, wrap, { baseBoard: board });
  const production = candidateById.get(recommendations[0]?.playerId);
  const adp = baselineChoice(byMarket, state);
  const model = baselineChoice(byBoard, state);
  if (!production || !adp || !model) throw new Error(`${spec.id} cannot resolve production and baselines.`);
  const seriousAlternatives = recommendations.slice(1, 4).map((entry) => candidateById.get(entry.playerId)).filter(Boolean);
  const forcedIds = [production, adp, model, ...seriousAlternatives]
    .filter((candidate, index, entries) => entries.findIndex((entry) => entry.player.id === candidate.player.id) === index)
    .slice(0, Math.max(2, FORCED_CANDIDATE_LIMIT))
    .map((candidate) => candidate.player.id);
  const runExact = (simulations) => buildConditionalDraftPathBoard(state, candidates, wrap, {
    simulations,
    candidateLimit: forcedIds.length,
    horizonPicks: 2,
    policyMode: CONTINUATION_POLICY_MODE,
    evaluationMode: "exact-production",
    wrapSimulationsPerPick: 4,
    forcedCandidateIds: forcedIds,
  });
  const screen = runExact(SCREEN_SAMPLES);
  const screenById = new Map(screen.outcomes.map((outcome) => [outcome.initialPlayerId, outcome]));
  const screenProduction = screenById.get(production.player.id);
  const bestScreenAlternative = screen.outcomes
    .filter((outcome) => outcome.initialPlayerId !== production.player.id)
    .sort((a, b) => a.medianRegret - b.medianRegret || a.downsideRegret - b.downsideRegret)[0];
  const closeOrDisputed = Boolean(screenProduction && bestScreenAlternative) &&
    (screenProduction.medianRegret > bestScreenAlternative.medianRegret ||
      Math.abs(screenProduction.medianRegret - bestScreenAlternative.medianRegret) <= 15);
  const evidence = closeOrDisputed && CLOSE_SAMPLES > SCREEN_SAMPLES ? runExact(CLOSE_SAMPLES) : screen;
  const byId = new Map(evidence.outcomes.map((outcome) => [outcome.initialPlayerId, outcome]));
  const productionOutcome = byId.get(production.player.id);
  const adpOutcome = byId.get(adp.player.id);
  const modelOutcome = byId.get(model.player.id);
  if (!productionOutcome || !adpOutcome || !modelOutcome) throw new Error(`${spec.id} is missing exact evidence.`);
  const bestAlternative = evidence.outcomes
    .filter((outcome) => outcome.initialPlayerId !== production.player.id)
    .sort((a, b) => a.medianRegret - b.medianRegret || a.downsideRegret - b.downsideRegret)[0];
  const regretGap = Number((productionOutcome.medianRegret - (bestAlternative?.medianRegret ?? productionOutcome.medianRegret)).toFixed(1));
  const effectivelyTied = Boolean(bestAlternative) && Math.abs(regretGap) <= 15;
  const pass = productionOutcome.medianRegret <= adpOutcome.medianRegret + 15 &&
    productionOutcome.medianRegret <= modelOutcome.medianRegret + 15 &&
    regretGap <= 15;
  return {
    id: spec.id,
    seed: spec.seed,
    roomType: spec.roomType,
    phase: spec.phase,
    pick: state.currentPick,
    round: getSnakePickInfo(state.currentPick, state.league.teams).round,
    rosterBefore: rosterSnapshot(state),
    production: summarizeOutcome(productionOutcome),
    constrainedAdpBaseline: summarizeOutcome(adpOutcome),
    constrainedModelBoardBaseline: summarizeOutcome(modelOutcome),
    seriousAlternatives: evidence.outcomes.filter((outcome) => ![production.player.id, adp.player.id, model.player.id].includes(outcome.initialPlayerId)).map(summarizeOutcome),
    exactSampleSize: evidence.simulations,
    needsEscalation: closeOrDisputed && evidence.simulations < 32,
    uncertainty: effectivelyTied ? "effectively-tied" : "separated-at-current-sample",
    classification: pass ? (effectivelyTied ? "defensible/close" : "strongly-supported") : "suspicious",
    regretGapVsBestAlternative: regretGap,
    pass,
    serializedState: pass ? undefined : state,
  };
}

const startedAt = Date.now();
const roomCache = new Map();
function room(roomType, run) {
  const key = `${roomType}:${run}`;
  if (!roomCache.has(key)) roomCache.set(key, buildRoomStates(roomType, run));
  return roomCache.get(key);
}

const specDescriptors = PHASES.flatMap((phase, phaseIndex) => Array.from({ length: STATE_COUNT_PER_PHASE }, (_, index) => {
  const roomType = ROOM_TYPES[(phaseIndex * STATE_COUNT_PER_PHASE + index) % ROOM_TYPES.length];
  const run = 1 + ((phaseIndex + index) % 2);
  return { id: `${phase.id}:${roomType}:${run}`, phase: phase.id, targetRound: phase.targetRound, roomType, run };
}));

const replayReportPath = process.env.FANTASY_SYSTEMATIC_REPLAY_REPORT;
let selectedSpecs;
if (replayReportPath) {
  const replayReport = JSON.parse(fs.readFileSync(replayReportPath, "utf8"));
  const replayStateId = process.env.FANTASY_SYSTEMATIC_REPLAY_STATE_ID;
  const systematicReplay = replayStateId
    ? replayReport.states?.find((state) => state.id === replayStateId)
    : replayReport.states?.find((state) => state.serializedState) ?? replayReport.states?.[0];
  const policyReplay = replayReport.drafts
    ?.flatMap((draft) => draft.suspicious?.map((decision) => ({
      id: `${draft.id}:${decision.pick}`,
      seed: draft.seed,
      roomType: draft.roomType,
      phase: decision.round <= 4 ? "early" : decision.round <= 8 ? "middle" : decision.round <= 12 ? "late" : "endgame",
      serializedState: decision.serializedState,
    })) ?? [])
    .find((state) => replayStateId ? state.id === replayStateId : state.serializedState);
  const replayed = systematicReplay ?? policyReplay;
  if (!replayed?.serializedState) throw new Error(`${replayReportPath} does not contain a serialized suspicious state.`);
  const state = replayed.serializedState;
  const wrap = buildWrapSimulationSnapshot(state, candidates, { simulations: 2 });
  selectedSpecs = [{
    id: `replay:${replayed.id}`,
    phase: replayed.phase,
    roomType: replayed.roomType,
    seed: replayed.seed,
    source: { state, recommendations: rankDraftCandidates(state, candidates, wrap, { baseBoard: board }) },
  }];
} else {
  const requestedOffset = Number(process.env.FANTASY_SYSTEMATIC_OFFSET ?? 0);
  const requestedLimit = Number(process.env.FANTASY_SYSTEMATIC_LIMIT ?? specDescriptors.length);
  const requestedIndices = process.env.FANTASY_SYSTEMATIC_INDICES
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < specDescriptors.length);
  const descriptors = requestedIndices?.length
    ? requestedIndices.map((index) => specDescriptors[index])
    : specDescriptors.slice(requestedOffset, requestedOffset + Math.max(1, Math.min(specDescriptors.length, requestedLimit)));
  selectedSpecs = descriptors
    .map((descriptor) => {
      const sourceRoom = room(descriptor.roomType, descriptor.run);
      const source = [...sourceRoom.managerStates]
        .sort((a, b) => Math.abs(getSnakePickInfo(a.state.currentPick, a.state.league.teams).round - descriptor.targetRound) -
          Math.abs(getSnakePickInfo(b.state.currentPick, b.state.league.teams).round - descriptor.targetRound))[0];
      return { ...descriptor, seed: sourceRoom.seed, source };
    });
}
const evidenceMatches = (report) =>
  report?.leagueConfigFingerprint === leagueSourceOfTruthFingerprint &&
  report?.evaluationMode === "exact-production" &&
  report?.continuationPolicyMode === CONTINUATION_POLICY_MODE &&
  report?.policyCertificationVersion === DRAFT_POLICY_CERTIFICATION_VERSION &&
  report?.productionWrapSimulations === PRODUCTION_WRAP_SIMULATIONS &&
  report?.screenSamples === SCREEN_SAMPLES &&
  report?.closeOrDisputedSamples === CLOSE_SAMPLES &&
  report?.forcedCandidateLimit === FORCED_CANDIDATE_LIMIT;
let priorReport = null;
try {
  priorReport = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
} catch {
  priorReport = null;
}
const resumableById = new Map(
  evidenceMatches(priorReport)
    ? (priorReport.states ?? []).map((state) => [state.id, state])
    : [],
);
const states = [];
function buildReport() {
  const suspicious = states.filter((state) => !state.pass);
  const complete = states.length === selectedSpecs.length;
  return {
    generatedAt: new Date().toISOString(),
    leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
    evaluationMode: "exact-production",
    continuationPolicyMode: CONTINUATION_POLICY_MODE,
    policyCertificationVersion: DRAFT_POLICY_CERTIFICATION_VERSION,
    productionWrapSimulations: PRODUCTION_WRAP_SIMULATIONS,
    pairedSeedPolicy: "identical state/pick/simulation seed across every forced choice",
    screenSamples: SCREEN_SAMPLES,
    closeOrDisputedSamples: CLOSE_SAMPLES,
    forcedCandidateLimit: FORCED_CANDIDATE_LIMIT,
    stateCount: states.length,
    expectedStateCount: selectedSpecs.length,
    complete,
    phaseCounts: Object.fromEntries(PHASES.map((phase) => [phase.id, states.filter((state) => state.phase === phase.id).length])),
    opponentBehaviors: [...new Set(states.map((state) => state.roomType))],
    escalatedCloseOrDisputed: states.filter((state) => state.exactSampleSize === CLOSE_SAMPLES).length,
    pendingCloseEscalations: states.filter((state) => state.needsEscalation).length,
    effectivelyTied: states.filter((state) => state.uncertainty === "effectively-tied").length,
    suspiciousCount: suspicious.length,
    elapsedMs: (evidenceMatches(priorReport) ? priorReport.elapsedMs ?? 0 : 0) + (Date.now() - startedAt),
    allPassed: complete && suspicious.length === 0,
    states,
  };
}
for (const [index, spec] of selectedSpecs.entries()) {
  const resumed = resumableById.get(spec.id);
  if (resumed) {
    console.error(`[systematic ${index + 1}/${selectedSpecs.length}] resume ${spec.id}`);
    states.push(resumed);
    continue;
  }
  console.error(`[systematic ${index + 1}/${selectedSpecs.length}] ${spec.id} Pick ${spec.source.state.currentPick}`);
  states.push(evaluateState(spec));
  fs.writeFileSync(OUTPUT, `${JSON.stringify(buildReport(), null, 2)}\n`);
}
const report = buildReport();
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, states: undefined }, null, 2));
if (!report.allPassed) {
  const suspiciousStates = report.states.filter((state) => !state.pass);
  throw new Error(`Systematic exact audit found ${suspiciousStates.length} suspicious state(s): ${suspiciousStates.map((state) => state.id).join(", ")}.`);
}
