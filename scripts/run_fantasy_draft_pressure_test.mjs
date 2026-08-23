import snapshot from "../lib/fantasy/data/warRoomDataset.generated.json" with { type: "json" };
import { buildRedraftBoard } from "../lib/fantasy/draft.ts";
import {
  assertDraftStateMatchesSourceOfTruth,
  createSimulationDraftState,
} from "../lib/fantasy/draftState.ts";
import { buildDraftQuickScoreBoard } from "../lib/fantasy/draftSignals.ts";
import { buildDraftStressTestBoard } from "../lib/fantasy/draftStressTest.ts";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "../lib/fantasy/leagueSourceOfTruth.ts";

if (
  snapshot.leagueConfigVersion !== leagueSourceOfTruth.version ||
  snapshot.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint ||
  !snapshot.warRoomReady ||
  snapshot.warRoomBlockers.length > 0
) {
  throw new Error("Pressure test refused a stale or blocked war-room artifact.");
}
assertDraftStateMatchesSourceOfTruth(snapshot.draftState);

const board = buildRedraftBoard(snapshot.candidates, snapshot.draftState.league);
const quickScores = buildDraftQuickScoreBoard(snapshot.candidates, board);
const slotResults = [];

for (let slot = 1; slot <= snapshot.draftState.league.teams; slot += 1) {
  const state = createSimulationDraftState(snapshot.candidates, {
    league: snapshot.draftState.league,
    myTeamId: `team-${slot}`,
    currentPick: slot,
  });
  const result = buildDraftStressTestBoard(snapshot.candidates, state, {
    simulations: 120,
    trackedPlayerLimit: 180,
    generatedAt: "pressure-test",
  });
  slotResults.push({
    slot,
    validStarterRate: Math.min(...result.strategyOutcomes.map((outcome) => outcome.validStarterRate)),
    bestStrategy: result.strategyOutcomes[0]?.label ?? "unknown",
    strategyGap: Number(
      ((result.strategyOutcomes[0]?.compositeScore ?? 0) - (result.strategyOutcomes[1]?.compositeScore ?? 0)).toFixed(1),
    ),
  });
}

const keeperResult = buildDraftStressTestBoard(snapshot.candidates, snapshot.draftState, {
  simulations: 1_000,
  trackedPlayerLimit: 220,
  generatedAt: "keeper-pressure-test",
});
const directAdpPool = snapshot.candidates.filter(
  (candidate) => Number.isFinite(candidate.market.adp) && candidate.market.adp <= 180,
);
const actionDistribution = {};
for (const candidate of directAdpPool) {
  const position = candidate.player.positions[0] ?? "unknown";
  const action = quickScores.get(candidate.player.id)?.action ?? "missing";
  actionDistribution[position] ??= {};
  actionDistribution[position][action] = (actionDistribution[position][action] ?? 0) + 1;
}

const eliteVorViolations = [...quickScores.values()].filter(
  (score) => score.vorStars >= 4 && score.valueOverReplacement < 25,
);
const allStrategiesValid =
  slotResults.every((result) => result.validStarterRate === 1) &&
  keeperResult.strategyOutcomes.every((outcome) => outcome.validStarterRate === 1);
const missingCalls = directAdpPool.filter(
  (candidate) => !quickScores.has(candidate.player.id),
).length;

const report = {
  generatedAt: new Date().toISOString(),
  snapshotCapturedAt: snapshot.capturedAt,
  simulations: {
    allSlots: slotResults.length * 120,
    keeperRoom: keeperResult.simulations,
    total: slotResults.length * 120 + keeperResult.simulations,
  },
  allStrategiesValid,
  missingCalls,
  eliteVorViolations: eliteVorViolations.length,
  actionDistribution,
  slotResults,
  keeperOutcomes: keeperResult.strategyOutcomes.map((outcome) => ({
    strategy: outcome.label,
    validStarterRate: outcome.validStarterRate,
    medianStarterPoints: outcome.medianStarterPoints,
    compositeScore: outcome.compositeScore,
    recommended: outcome.recommended,
  })),
};

console.log(JSON.stringify(report, null, 2));
if (!allStrategiesValid || missingCalls > 0 || eliteVorViolations.length > 0) {
  throw new Error("Fantasy draft pressure test failed its release guardrails.");
}
