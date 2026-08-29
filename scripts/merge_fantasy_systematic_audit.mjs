import fs from "node:fs";

const INPUTS = [0, 1, 2, 3].map((index) => new URL(
  `../lib/fantasy/data/systematicDraftAudit.shard-${index}.generated.json`,
  import.meta.url,
));
const OUTPUT = new URL("../lib/fantasy/data/systematicDraftAudit.generated.json", import.meta.url);
const reports = INPUTS.map((input) => JSON.parse(fs.readFileSync(input, "utf8")));
const expectedEvidence = {
  evaluationMode: "exact-production",
  continuationPolicyMode: "production",
  policyCertificationVersion: "2026-08-28-v5",
  productionWrapSimulations: 16,
  screenSamples: 8,
  closeOrDisputedSamples: 32,
};
for (const [index, report] of reports.entries()) {
  for (const [key, expected] of Object.entries(expectedEvidence)) {
    if (report[key] !== expected) {
      throw new Error(
        `Shard ${index} has stale or mismatched ${key}=${report[key]}; expected ${expected}.`,
      );
    }
  }
  if (report.stateCount !== 8) throw new Error(`Shard ${index} must contain exactly 8 states.`);
}
const states = reports.flatMap((report) => report.states);
if (new Set(states.map((state) => state.id)).size !== states.length) {
  throw new Error("Systematic shards contain duplicate state IDs.");
}
const suspicious = states.filter((state) => !state.pass);
const pending = states.filter((state) => state.needsEscalation);
const report = {
  generatedAt: new Date().toISOString(),
  leagueConfigFingerprint: reports[0]?.leagueConfigFingerprint,
  evaluationMode: "exact-production",
  continuationPolicyMode: reports[0]?.continuationPolicyMode,
  policyCertificationVersion: reports[0]?.policyCertificationVersion,
  productionWrapSimulations: reports[0]?.productionWrapSimulations,
  pairedSeedPolicy: reports[0]?.pairedSeedPolicy,
  screenSamples: reports[0]?.screenSamples,
  closeOrDisputedSamples: reports[0]?.closeOrDisputedSamples,
  forcedCandidateLimit: reports[0]?.forcedCandidateLimit,
  stateCount: states.length,
  phaseCounts: Object.fromEntries(["early", "middle", "late", "endgame"].map((phase) => [phase, states.filter((state) => state.phase === phase).length])),
  opponentBehaviors: [...new Set(states.map((state) => state.roomType))],
  escalatedCloseOrDisputed: states.filter((state) => state.exactSampleSize >= 32).length,
  pendingCloseEscalations: pending.length,
  effectivelyTied: states.filter((state) => state.uncertainty === "effectively-tied").length,
  suspiciousCount: suspicious.length,
  elapsedMs: reports.reduce((sum, report) => sum + report.elapsedMs, 0),
  allPassed: states.length === 32 && suspicious.length === 0 && pending.length === 0,
  sourceArtifacts: INPUTS.map((input) => input.pathname.split("/").at(-1)),
  states,
};
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, states: undefined }, null, 2));
if (states.length !== 32) throw new Error(`Expected 32 systematic states, received ${states.length}.`);
if (suspicious.length) throw new Error(`Merged audit contains ${suspicious.length} suspicious states.`);
if (pending.length) throw new Error(`Merged audit contains ${pending.length} close state(s) without 32-run escalation.`);
