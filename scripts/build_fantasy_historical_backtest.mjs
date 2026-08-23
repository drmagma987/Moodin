import fs from "node:fs/promises";
import path from "node:path";
import { buildFantasyProsPublicDraftCandidatesFromHtml } from "../lib/fantasy/fantasyprosPublic.ts";
import {
  aggregateNflverseWeeklyStats,
  buildHistoricalBacktestReport,
  parseFfcHistoricalAdp,
  runHistoricalSeasonBacktest,
} from "../lib/fantasy/historicalBacktest.ts";
import { leagueSourceOfTruth } from "../lib/fantasy/leagueSourceOfTruth.ts";

const seasons = [2023, 2024, 2025];
const outputPath = path.resolve("lib/fantasy/data/historicalBacktestReport.generated.json");

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "MoodinFantasyResearch/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

const reports = [];
for (const season of seasons) {
  const [rankingsHtml, adpJson, priorWeeklyCsv, outcomeWeeklyCsv] = await Promise.all([
    fetchText(`https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php?year=${season}&export=xls`),
    fetchText(`https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=${leagueSourceOfTruth.teams}&year=${season}`),
    fetchText(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season - 1}.csv`),
    fetchText(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`),
  ]);
  const preseasonCutoff = `${season}-09-01T12:00:00.000Z`;
  const candidates = buildFantasyProsPublicDraftCandidatesFromHtml(rankingsHtml).candidates;
  reports.push(runHistoricalSeasonBacktest({
    season,
    preseasonCutoff,
    candidates,
    ffcAdp: parseFfcHistoricalAdp(adpJson),
    priorStats: aggregateNflverseWeeklyStats(priorWeeklyCsv),
    outcomeStats: aggregateNflverseWeeklyStats(outcomeWeeklyCsv),
  }));
}

const report = buildHistoricalBacktestReport(reports);
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  generatedAt: report.generatedAt,
  aggregate: report.aggregate,
  seasons: report.seasons.map((season) => ({
    season: season.season,
    players: season.matchedOutcomeCount,
    realized: season.metrics.realized,
    adjusted: season.metrics.availabilityAdjusted,
  })),
}, null, 2));

if (report.seasons.some((season) => season.matchedOutcomeCount < 130)) {
  throw new Error("Historical backtest failed coverage guardrail: fewer than 130 matched players.");
}
