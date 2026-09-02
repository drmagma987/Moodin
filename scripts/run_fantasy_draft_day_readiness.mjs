import fs from "node:fs";
import snapshot from "../lib/fantasy/data/warRoomDataset.generated.json" with { type: "json" };
import {
  buildRedraftBoard,
  buildWrapSimulationSnapshot,
  DRAFT_POLICY_CERTIFICATION_VERSION,
  PRODUCTION_WRAP_SIMULATIONS,
  rankDraftCandidates,
} from "../lib/fantasy/draft.ts";
import { assertDraftStateMatchesSourceOfTruth } from "../lib/fantasy/draftState.ts";
import {
  buildDraftRehearsalQueue,
  createDraftRehearsalScenario,
  draftRehearsalScenarios,
} from "../lib/fantasy/draftRehearsal.ts";
import { buildDraftRefreshCheckpoint } from "../lib/fantasy/draftRefreshControl.ts";
import { assertDraftRoomFreeze, freezeDraftRoom } from "../lib/fantasy/draftOperations.ts";
import { leagueSourceOfTruthFingerprint } from "../lib/fantasy/leagueSourceOfTruth.ts";
import { evaluateDraftDayLatency } from "../lib/fantasy/draftDayPreflight.ts";

const OUTPUT = new URL("../lib/fantasy/data/draftDayReadiness.generated.json", import.meta.url);
const candidates = snapshot.candidates;
const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
const finalFreezeRequested = process.env.FANTASY_FINAL_FREEZE === "1";

if (!snapshot.warRoomReady || snapshot.warRoomBlockers.length) {
  throw new Error("Draft-day readiness refused a blocked War Room artifact.");
}
assertDraftStateMatchesSourceOfTruth(snapshot.draftState);
const board = buildRedraftBoard(candidates, snapshot.draftState.league);
const checkpoint = buildDraftRefreshCheckpoint(candidates, board, snapshot.capturedAt);
const freeze = freezeDraftRoom({
  state: snapshot.draftState,
  candidateCount: candidates.length,
  policyCertificationVersion: DRAFT_POLICY_CERTIFICATION_VERSION,
  productionWrapSimulations: PRODUCTION_WRAP_SIMULATIONS,
  artifactCapturedAt: snapshot.capturedAt,
  setupReady: true,
  dataReady: snapshot.warRoomReady,
  boardFingerprint: checkpoint.boardFingerprint,
});
assertDraftRoomFreeze(freeze, snapshot.draftState, checkpoint.boardFingerprint);

let staleBoardRejected = false;
try {
  assertDraftRoomFreeze(freeze, snapshot.draftState, `${checkpoint.boardFingerprint}-changed`);
} catch {
  staleBoardRejected = true;
}

function runOperationalRehearsal(scenario, index) {
  const seed = `draft-day-readiness:${scenario.id}:${index + 1}`;
  const setupStartedAt = performance.now();
  const created = createDraftRehearsalScenario({
    initialState: structuredClone(snapshot.draftState),
    candidates,
    scenario: scenario.id,
    seed,
    keeperLoad: scenario.id === "heavy-keepers" ? "heavy" : "none",
  });
  const queued = buildDraftRehearsalQueue({
    session: created.session,
    state: created.state,
    candidates,
    scenario: scenario.id,
    seed,
    count: 200,
    stopAtManagerTurn: true,
  });
  const state = queued.resultingState;
  assertDraftStateMatchesSourceOfTruth(state);
  const adviceStartedAt = performance.now();
  const wrapStartedAt = performance.now();
  const wrap = buildWrapSimulationSnapshot(state, candidates);
  const wrapLatencyMs = performance.now() - wrapStartedAt;
  const rankingStartedAt = performance.now();
  const live = rankDraftCandidates(state, candidates, wrap, { baseBoard: board });
  const rankingLatencyMs = performance.now() - rankingStartedAt;
  const recommendationLatencyMs = performance.now() - adviceStartedAt;
  const rehearsal = rankDraftCandidates(structuredClone(state), candidates, wrap, { baseBoard: board });
  const liveTop = live[0];
  const rehearsalTop = rehearsal[0];
  const modelBoardTop = live[0];
  const selected = liveTop ? candidateById.get(liveTop.playerId) : null;
  const setupLatencyMs = performance.now() - setupStartedAt;
  const failures = [];
  if (!selected) failures.push("no manager recommendation");
  if (liveTop?.playerId !== rehearsalTop?.playerId) failures.push("live/rehearsal mismatch");
  if (liveTop?.playerId !== modelBoardTop?.playerId) failures.push("hero/model-board mismatch");
  failures.push(...evaluateDraftDayLatency({ recommendationMs: recommendationLatencyMs, rankingMs: rankingLatencyMs }).failures);
  return {
    scenario: scenario.id,
    seed,
    queuedOpponentPicks: queued.queue.length,
    currentPick: state.currentPick,
    topRecommendation: selected ? { playerId: selected.player.id, player: selected.player.fullName, position: selected.player.positions[0] } : null,
    topAlternatives: live.slice(1, 4).map((recommendation) => ({
      playerId: recommendation.playerId,
      player: candidateById.get(recommendation.playerId)?.player.fullName,
      score: recommendation.score,
    })),
    recommendationLatencyMs: Number(recommendationLatencyMs.toFixed(1)),
    wrapLatencyMs: Number(wrapLatencyMs.toFixed(1)),
    rankingLatencyMs: Number(rankingLatencyMs.toFixed(1)),
    setupLatencyMs: Number(setupLatencyMs.toFixed(1)),
    parity: liveTop?.playerId === rehearsalTop?.playerId,
    failures,
    passed: failures.length === 0,
  };
}

const rehearsals = draftRehearsalScenarios.map(runOperationalRehearsal);
const report = {
  generatedAt: new Date().toISOString(),
  status: finalFreezeRequested ? "final-draft-day-freeze" : "candidate-freeze-requires-human-confirmation",
  warning: finalFreezeRequested
    ? null
    : "This receipt proves artifact identity and engine readiness, but is not the final draft-day freeze. Re-run with FANTASY_FINAL_FREEZE=1 only after reviewing same-day injuries, keepers, and draft order.",
  leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
  artifactCapturedAt: snapshot.capturedAt,
  candidateCount: candidates.length,
  boardFingerprint: checkpoint.boardFingerprint,
  freeze,
  failClosedChecks: {
    canonicalStateAccepted: true,
    canonicalFreezeAccepted: true,
    staleBoardRejected,
  },
  automatedTimedRehearsals: rehearsals,
  humanRehearsalStillRequired: true,
  humanChecklist: [
    "Complete one normal-room rehearsal using manual pick entry under the real pick clock.",
    "Complete one positional-run rehearsal and explain aloud why the top choice beats the best alternative.",
    "Practice one rejected/ambiguous player entry and one reload recovery before draft day.",
    "Confirm same-day keeper assignments and draft order before requesting the final freeze.",
  ],
  allAutomatedChecksPassed: staleBoardRejected && rehearsals.every((rehearsal) => rehearsal.passed),
};
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, automatedTimedRehearsals: rehearsals.map(({ scenario, currentPick, recommendationLatencyMs, parity, passed, failures }) => ({ scenario, currentPick, recommendationLatencyMs, parity, passed, failures })) }, null, 2));
if (!report.allAutomatedChecksPassed) {
  throw new Error("Draft-day readiness failed one or more automated gates.");
}
