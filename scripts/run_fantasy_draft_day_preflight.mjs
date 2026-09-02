import fs from "node:fs";
import snapshot from "../lib/fantasy/data/warRoomDataset.generated.json" with { type: "json" };
import certification from "../lib/fantasy/data/draftPolicyCertification.generated.json" with { type: "json" };
import readiness from "../lib/fantasy/data/draftDayReadiness.generated.json" with { type: "json" };
import systematic from "../lib/fantasy/data/systematicDraftAudit.generated.json" with { type: "json" };
import {
  buildRedraftBoard,
  buildWrapSimulationSnapshot,
  DRAFT_POLICY_CERTIFICATION_VERSION,
  PRODUCTION_WRAP_SIMULATIONS,
  rankDraftCandidates,
} from "../lib/fantasy/draft.ts";
import {
  evaluateArtifactFreshness,
  evaluateDraftDayLatency,
} from "../lib/fantasy/draftDayPreflight.ts";
import {
  assertDraftStateMatchesSourceOfTruth,
  getSnakePickInfo,
} from "../lib/fantasy/draftState.ts";
import {
  appendDraftSessionPick,
  createDraftSession,
  replayDraftSession,
} from "../lib/fantasy/draftSession.ts";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "../lib/fantasy/leagueSourceOfTruth.ts";

const requireSameDay = process.env.FANTASY_REQUIRE_SAME_DAY === "1";
const checks = [];
const addCheck = (id, passed, detail) => checks.push({ id, passed, detail });
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));

let canonicalStateAccepted = false;
try {
  assertDraftStateMatchesSourceOfTruth(snapshot.draftState);
  canonicalStateAccepted = true;
} catch {
  canonicalStateAccepted = false;
}
addCheck(
  "canonical-identity",
  canonicalStateAccepted && snapshot.leagueConfigFingerprint === leagueSourceOfTruthFingerprint,
  `${snapshot.leagueConfigVersion} · ${snapshot.leagueConfigFingerprint}`,
);

addCheck(
  "board-publication",
  snapshot.warRoomReady === true && snapshot.warRoomBlockers.length === 0,
  `${snapshot.candidates.length} candidates · ${snapshot.warRoomBlockers.length} blockers`,
);

const requiredPositions = Object.entries(leagueSourceOfTruth.lineup)
  .filter(([position, count]) => ["QB", "RB", "WR", "TE", "K"].includes(position) && Number(count) > 0)
  .map(([position]) => position);
const candidatePositionCounts = Object.fromEntries(
  requiredPositions.map((position) => [
    position,
    snapshot.candidates.filter((candidate) => candidate.player.positions.includes(position)).length,
  ]),
);
addCheck(
  "required-position-coverage",
  requiredPositions.every((position) => candidatePositionCounts[position] > 0),
  Object.entries(candidatePositionCounts).map(([position, count]) => `${position} ${count}`).join(" · "),
);

const managerTeamId = `team-${leagueSourceOfTruth.draft.mySlot}`;
const keeperNames = snapshot.draftState.drafted
  .filter((pick) => pick.eventType === "keeper" && pick.teamId === managerTeamId)
  .map((pick) => snapshot.candidates.find((candidate) => candidate.player.id === pick.playerId)?.player.fullName)
  .filter(Boolean);
addCheck(
  "canonical-manager-keepers",
  JSON.stringify(sorted(keeperNames)) === JSON.stringify(sorted(leagueSourceOfTruth.keepers.myDeclaredPlayers)),
  keeperNames.length > 0 ? keeperNames.join(" · ") : "No manager keepers resolved",
);

addCheck(
  "v5-policy-certification",
  certification.policyCertificationVersion === DRAFT_POLICY_CERTIFICATION_VERSION &&
    certification.productionWrapSimulations === PRODUCTION_WRAP_SIMULATIONS &&
    certification.completedDrafts === 26 &&
    certification.failedDrafts.length === 0 &&
    certification.suspiciousStateCount === 0 &&
    certification.parityMismatches === 0,
  `${certification.completedDrafts}/26 drafts · ${certification.managerDecisions} decisions · ${certification.parityMismatches} parity mismatches`,
);

addCheck(
  "v5-systematic-matrix",
  systematic.policyCertificationVersion === DRAFT_POLICY_CERTIFICATION_VERSION &&
    systematic.productionWrapSimulations === PRODUCTION_WRAP_SIMULATIONS &&
    systematic.complete === true &&
    systematic.stateCount === 32 &&
    systematic.suspiciousCount === 0 &&
    systematic.pendingCloseEscalations === 0 &&
    systematic.allPassed === true,
  `${systematic.stateCount}/32 states · ${systematic.suspiciousCount} suspicious · ${systematic.pendingCloseEscalations} pending`,
);

addCheck(
  "candidate-readiness-receipt",
  readiness.allAutomatedChecksPassed === true &&
    readiness.status === "candidate-freeze-requires-human-confirmation" &&
    readiness.leagueConfigFingerprint === leagueSourceOfTruthFingerprint,
  `${readiness.automatedTimedRehearsals.filter((rehearsal) => rehearsal.passed).length}/${readiness.automatedTimedRehearsals.length} rehearsals passed`,
);

const freshness = evaluateArtifactFreshness({ capturedAt: snapshot.capturedAt });
addCheck(
  "artifact-timestamp",
  freshness.validTimestamp && (!requireSameDay || freshness.sameCalendarDay),
  `${freshness.ageHours}h old · ${freshness.sameCalendarDay ? "same-day" : "refresh required before final freeze"}`,
);

const board = buildRedraftBoard(snapshot.candidates, snapshot.draftState.league);
const measureRecommendation = () => {
  const startedAt = performance.now();
  const wrap = buildWrapSimulationSnapshot(snapshot.draftState, snapshot.candidates);
  const rankingStartedAt = performance.now();
  const recommendations = rankDraftCandidates(snapshot.draftState, snapshot.candidates, wrap, {
    baseBoard: board,
  });
  return {
    recommendations,
    recommendationMs: performance.now() - startedAt,
    rankingMs: performance.now() - rankingStartedAt,
  };
};
measureRecommendation();
const latencySamples = [measureRecommendation(), measureRecommendation(), measureRecommendation()];
const median = (values) => [...values].sort((a, b) => a - b).at(Math.floor(values.length / 2));
const recommendationMs = median(latencySamples.map((sample) => sample.recommendationMs));
const rankingMs = median(latencySamples.map((sample) => sample.rankingMs));
const latency = evaluateDraftDayLatency({ recommendationMs, rankingMs });
addCheck(
  "recommendation-latency",
  latency.passed,
  `${recommendationMs.toFixed(1)}ms total · ${rankingMs.toFixed(1)}ms ranking`,
);

let sessionRecovery = { passed: false, detail: "Recovery probe did not run" };
try {
  const topRecommendation = latencySamples[0].recommendations[0];
  if (!topRecommendation) throw new Error("No recommendation was available for the session probe.");
  const session = createDraftSession(snapshot.draftState, "preflight-session");
  const appended = appendDraftSessionPick(session, snapshot.candidates, snapshot.draftState, {
    playerId: topRecommendation.playerId,
    source: "manual",
    pickedAt: "preflight-manual-entry",
    note: "Non-persisted draft-day preflight probe",
  });
  const restored = JSON.parse(JSON.stringify(appended.session));
  const replayed = replayDraftSession(restored, snapshot.candidates, snapshot.draftState);
  let duplicateRejected = false;
  try {
    appendDraftSessionPick(restored, snapshot.candidates, replayed, {
      playerId: topRecommendation.playerId,
      overallPick: replayed.currentPick,
    });
  } catch {
    duplicateRejected = true;
  }
  let staleIdentityRejected = false;
  try {
    replayDraftSession(
      { ...restored, leagueConfigFingerprint: "stale-preflight-probe" },
      snapshot.candidates,
      snapshot.draftState,
    );
  } catch {
    staleIdentityRejected = true;
  }
  const expectedNextPick = getSnakePickInfo(replayed.currentPick, replayed.league.teams);
  sessionRecovery = {
    passed:
      replayed.drafted.length === snapshot.draftState.drafted.length + 1 &&
      duplicateRejected &&
      staleIdentityRejected,
    detail: `manual entry restored · duplicate ${duplicateRejected ? "rejected" : "accepted"} · stale identity ${staleIdentityRejected ? "rejected" : "accepted"} · next ${expectedNextPick.teamId} Pick ${replayed.currentPick}`,
  };
} catch (error) {
  sessionRecovery = {
    passed: false,
    detail: error instanceof Error ? error.message : "Unknown session recovery failure",
  };
}
addCheck("manual-entry-reload-recovery", sessionRecovery.passed, sessionRecovery.detail);

const yahooFiles = [
  "tools/yahoo-draft-extension/manifest.json",
  "tools/yahoo-draft-extension/service-worker.js",
  "tools/yahoo-draft-extension/content-script.js",
  "app/api/fantasy/yahoo-extension/route.ts",
];
addCheck(
  "yahoo-bridge-static-contract",
  yahooFiles.every((file) => fs.existsSync(file)),
  `${yahooFiles.filter((file) => fs.existsSync(file)).length}/${yahooFiles.length} bridge files present · live signed-in connection still requires human confirmation`,
);

const blockers = checks.filter((check) => !check.passed);
const humanChecklist = [
  "Review same-day injuries, depth charts, ADP movement, and material role news.",
  "Confirm every keeper assignment and the official Yahoo draft order/slot.",
  "Open the signed-in Yahoo room and verify one fresh read-only bridge snapshot.",
  "Complete manual clock, positional-run explanation, ambiguous-entry, and reload-recovery rehearsals.",
  "Run this command with FANTASY_REQUIRE_SAME_DAY=1 before requesting the final freeze.",
];
const report = {
  generatedAt: new Date().toISOString(),
  mode: "non-freezing-preflight",
  finalFreezeRequested: false,
  status: blockers.length === 0 ? "automated-ready-human-review-required" : "blocked",
  policyCertificationVersion: DRAFT_POLICY_CERTIFICATION_VERSION,
  productionWrapSimulations: PRODUCTION_WRAP_SIMULATIONS,
  artifactCapturedAt: snapshot.capturedAt,
  freshness,
  checks,
  blockers,
  humanChecklist,
};

console.log(JSON.stringify(report, null, 2));
if (blockers.length > 0) {
  throw new Error(`Draft-day preflight found ${blockers.length} blocker(s): ${blockers.map((blocker) => blocker.id).join(", ")}.`);
}
