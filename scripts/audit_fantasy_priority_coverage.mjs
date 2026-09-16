// Read-only audit. Add --live to fetch public feeds; no snapshots or ownership are written.
import { getInSeasonCommandCenterDataset } from "../lib/fantasy/inSeason.ts";
import { buildPlayerCoverageReport } from "../lib/fantasy/playerCoverage.ts";
import { applyWeeklyEvidenceBundle, fetchWeeklyEvidenceBundle } from "../lib/fantasy/weeklyEvidenceRefresh.ts";

const dataset = getInSeasonCommandCenterDataset();
const bundle = process.argv.includes("--live") ? await fetchWeeklyEvidenceBundle() : undefined;
const refresh = bundle ? applyWeeklyEvidenceBundle(dataset.players, bundle) : undefined;
const players = refresh?.players ?? dataset.players;
const report = buildPlayerCoverageReport(players);
const byId = new Map(players.map(player => [player.player.id, player]));
const matches = new Map(refresh?.matchAudit.map(entry => [entry.playerId, entry]));
console.log(JSON.stringify({
  capturedAt: new Date().toISOString(), mode: bundle ? "live" : "stored",
  scope: "Top-250 market ranks, rostered non-kickers and evidence-triggered opportunities; excludes UI candidate promotions",
  sources: bundle?.sources ?? [],
  total: report.total, priority: report.priorityTotal, complete: report.priorityComplete,
  monitored: report.monitored, kickers: report.kickers, gaps: report.priorityGaps,
  incomplete: report.entries.filter(entry => entry.scope === "priority" && entry.grade !== "complete").map(entry => ({
    name: entry.name, playerId: entry.playerId, grade: entry.grade, evaluation: entry.evaluation,
    reasons: entry.scopeReasons, health: byId.get(entry.playerId).injuryStatus,
    projectionBasis: byId.get(entry.playerId).projectionBasis, matches: matches.get(entry.playerId),
    missing: entry.missing, invalid: entry.invalid, notes: entry.notes,
  })),
}, null, 2));
if (bundle?.sources.some(source => source.status !== "loaded")) process.exitCode = 2;
