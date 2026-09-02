import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const workbookPath = process.argv[2];
if (!workbookPath) {
  throw new Error("Usage: node scripts/import_fantasy_market_workbook.mjs <ranking-workbook.xlsx>");
}

const artifactToolModule = process.env.ARTIFACT_TOOL_MODULE ?? "@oai/artifact-tool";
const { SpreadsheetFile } = await import(artifactToolModule);
const workbook = await SpreadsheetFile.importXlsx(await readFile(resolve(workbookPath)));
const sourceSheet = workbook.worksheets.getItem("Source Data");
const values = sourceSheet.getUsedRange().values;
const [headers, ...rows] = values;
const headerIndex = new Map(headers.map((header, index) => [String(header ?? "").trim(), index]));

const requiredHeaders = [
  "Player", "Position", "Team", "Aggregate Mean", "Field Yates", "Mike Clay",
  "Ryan Weisse", "Rank Spread", "Source Count", "Yahoo XRank", "Yahoo ADP",
  "vs. Yahoo XRank",
];
for (const header of requiredHeaders) {
  if (!headerIndex.has(header)) throw new Error(`Source Data is missing required column “${header}”.`);
}

const datasetPath = resolve("lib/fantasy/data/warRoomDataset.generated.json");
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const candidates = dataset.candidates;
const normalizeName = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const normalizeTeam = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const normalizePosition = (value) => String(value ?? "").toUpperCase().trim();
const readNumeric = (row, header) => {
  const value = row[headerIndex.get(header)];
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const readRank = (row, header) => {
  const value = readNumeric(row, header);
  return value !== null && value > 0 ? value : null;
};

const byName = new Map();
for (const candidate of candidates) {
  const key = normalizeName(candidate.player.fullName);
  byName.set(key, [...(byName.get(key) ?? []), candidate]);
}

const records = [];
const matchedPlayers = [];
const unmatchedWorkbookPlayers = [];
const ambiguousMatches = [];
const matchedApplicationIds = new Set();
const invalidRanks = [];
const rankValues = new Map(requiredHeaders.slice(3).map((header) => [header, new Map()]));

for (const [rowOffset, row] of rows.entries()) {
  const rowNumber = rowOffset + 2;
  const playerName = String(row[headerIndex.get("Player")] ?? "").trim();
  if (!playerName) continue;
  const position = normalizePosition(row[headerIndex.get("Position")]);
  const team = normalizeTeam(row[headerIndex.get("Team")]);
  const sourceRanks = {
    fieldYates: readRank(row, "Field Yates"),
    mikeClay: readRank(row, "Mike Clay"),
    ryanWeisse: readRank(row, "Ryan Weisse"),
  };
  const record = {
    playerName,
    normalizedName: normalizeName(playerName),
    position,
    team,
    aggregateRank: readRank(row, "Aggregate Mean"),
    sourceRanks,
    yahooXRank: readRank(row, "Yahoo XRank"),
    yahooAdp: readRank(row, "Yahoo ADP"),
    rankSpread: readNumeric(row, "Rank Spread"),
    sourceCount: readRank(row, "Source Count"),
    yahooXRankMinusAggregate: readNumeric(row, "vs. Yahoo XRank"),
  };
  records.push(record);

  for (const header of requiredHeaders.slice(3)) {
    const raw = row[headerIndex.get(header)];
    const permitsNonPositiveValue = header === "vs. Yahoo XRank" || header === "Rank Spread";
    const parsed = permitsNonPositiveValue ? readNumeric(row, header) : readRank(row, header);
    if (raw !== null && raw !== undefined && raw !== "" && parsed === null) {
      invalidRanks.push({ row: rowNumber, playerName, field: header, value: raw });
    }
    const value = parsed;
    if (value !== null) {
      const fieldValues = rankValues.get(header);
      fieldValues.set(String(value), [...(fieldValues.get(String(value)) ?? []), playerName]);
    }
  }

  const exact = byName.get(record.normalizedName) ?? [];
  const constrained = exact.filter((candidate) => (
    candidate.player.positions.includes(position) && normalizeTeam(candidate.player.team) === team
  ));
  const matches = constrained.length > 0 ? constrained : exact;
  if (matches.length === 1) {
    matchedApplicationIds.add(matches[0].player.id);
    matchedPlayers.push({
      workbookPlayer: playerName,
      applicationPlayerId: matches[0].player.id,
      applicationPlayer: matches[0].player.fullName,
      match: constrained.length === 1 ? "normalized-name+position+team" : "normalized-name",
    });
  } else if (matches.length === 0) {
    unmatchedWorkbookPlayers.push({ playerName, position, team, row: rowNumber });
  } else {
    ambiguousMatches.push({
      playerName,
      position,
      team,
      row: rowNumber,
      applicationCandidates: matches.map((candidate) => ({
        id: candidate.player.id,
        name: candidate.player.fullName,
        position: candidate.player.positions[0],
        team: candidate.player.team,
      })),
    });
  }
}

const duplicateRanks = [];
for (const [field, valuesByRank] of rankValues) {
  for (const [rank, players] of valuesByRank) {
    if (players.length > 1) duplicateRanks.push({ field, rank: Number(rank), players });
  }
}
const unmatchedApplicationPlayers = candidates
  .filter((candidate) => !matchedApplicationIds.has(candidate.player.id))
  .map((candidate) => ({
    applicationPlayerId: candidate.player.id,
    playerName: candidate.player.fullName,
    position: candidate.player.positions[0],
    team: candidate.player.team,
  }));

const generatedAt = new Date().toISOString();
const source = {
  generatedAt,
  sourceFile: basename(workbookPath),
  sourceSheet: "Source Data",
  workbookRows: records.length,
  fields: {
    yahooXRank: "Yahoo displayed player order; availability input only, never model value.",
    yahooAdp: "Yahoo average draft position; retained separately from XRank.",
    aggregateRank: "Mean of captured expert ranks; comparison evidence only.",
    sourceRanks: "Captured individual expert-source ranks; comparison evidence only.",
    rankSpread: "Expert disagreement; widens uncertainty without directional movement.",
    sourceCount: "Number of expert ranks represented in Aggregate Rank.",
    yahooXRankMinusAggregate: "Yahoo XRank minus Aggregate Rank.",
  },
  records,
};
const receipt = {
  generatedAt,
  sourceFile: basename(workbookPath),
  sourceSheet: "Source Data",
  applicationArtifactCapturedAt: dataset.capturedAt,
  coverage: {
    workbookPlayers: records.length,
    applicationPlayers: candidates.length,
    matchedPlayers: matchedPlayers.length,
    yahooXRank: records.filter((record) => record.yahooXRank !== null).length,
    yahooAdp: records.filter((record) => record.yahooAdp !== null).length,
    aggregateRank: records.filter((record) => record.aggregateRank !== null).length,
    rankSpread: records.filter((record) => record.rankSpread !== null).length,
  },
  matchedPlayers,
  unmatchedWorkbookPlayers,
  unmatchedApplicationPlayers,
  ambiguousMatches,
  duplicateRanks,
  invalidRanks,
  accepted: ambiguousMatches.length === 0 && invalidRanks.length === 0,
};

await writeFile(resolve("lib/fantasy/data/workbookMarketReference.generated.json"), `${JSON.stringify(source, null, 2)}\n`);
await writeFile(resolve("lib/fantasy/data/workbookMarketReferenceReceipt.generated.json"), `${JSON.stringify(receipt, null, 2)}\n`);
if (!receipt.accepted) {
  throw new Error(`Workbook import failed closed: ${ambiguousMatches.length} ambiguous matches, ${invalidRanks.length} invalid ranks.`);
}
console.log(JSON.stringify(receipt.coverage));
console.log(`Matched ${matchedPlayers.length}; unmatched workbook ${unmatchedWorkbookPlayers.length}; unmatched application ${unmatchedApplicationPlayers.length}; ambiguous ${ambiguousMatches.length}.`);
