import { writeFile } from "node:fs/promises";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "./leagueSourceOfTruth.ts";

const YEAR = leagueSourceOfTruth.season;
const TEAM_COUNT = leagueSourceOfTruth.teams;
const DRAFT_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const PERSONAL_KEEPERS = new Set(leagueSourceOfTruth.keepers.myDeclaredPlayers);
const RELEASED_ROSTER_ANCHORS = new Set(leagueSourceOfTruth.departedTeams.releasedRosterAnchors);
const OUTPUT_PATH = new URL("./data/stockPprPool.generated.json", import.meta.url);
const RANKINGS_URL = "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php?export=xls";
const ADP_URL = `https://fantasyfootballcalculator.com/api/v1/adp/ppr?position=all&teams=${TEAM_COUNT}&year=${YEAR}`;

function normalizeName(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonObjectAfterMarker(html, marker) {
  const markerIndex = html.indexOf(marker);
  const startIndex = html.indexOf("{", markerIndex + marker.length);
  if (markerIndex < 0 || startIndex < 0) throw new Error(`Missing ${marker}`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(html.slice(startIndex, index + 1));
  }
  throw new Error(`Unterminated JSON after ${marker}`);
}

async function fetchRequired(url, format) {
  const response = await fetch(url, {
    headers: { "user-agent": "H-Town-Heroes-stock-pool-refresh/1.0" },
  });
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  return format === "json" ? response.json() : response.text();
}

const [rankingsHtml, adpPayload] = await Promise.all([
  fetchRequired(RANKINGS_URL, "text"),
  fetchRequired(ADP_URL, "json"),
]);

const ecrData = extractJsonObjectAfterMarker(rankingsHtml, "var ecrData = ");
const adpRows = Array.isArray(adpPayload.players) ? adpPayload.players : [];
const adpByIdentity = new Map(
  adpRows.map((row) => [`${normalizeName(row.name)}|${String(row.position).toUpperCase()}`, row]),
);

const players = ecrData.players
  .filter((row) => DRAFT_POSITIONS.has(row.player_position_id))
  .map((row) => {
    const position = row.player_position_id;
    const adp = adpByIdentity.get(`${normalizeName(row.player_name)}|${position}`);
    return {
      fantasyProsId: String(row.player_id),
      name: row.player_name,
      team: row.player_team_id,
      position,
      positionRank: row.pos_rank,
      ecr: Number(row.rank_ecr),
      rankMin: Number(row.rank_min),
      rankMax: Number(row.rank_max),
      rankAverage: Number(row.rank_ave),
      expertStdDev: Number(row.rank_std),
      tier: Number(row.tier),
      adp: adp ? Number(adp.adp) : null,
      adpTimesDrafted: adp ? Number(adp.times_drafted) : null,
      adpStdDev: adp ? Number(adp.stdev) : null,
      availability: PERSONAL_KEEPERS.has(row.player_name) ? "my-keeper" : "available",
      releasedRosterAnchor: RELEASED_ROSTER_ANCHORS.has(row.player_name),
    };
  })
  .sort((a, b) => a.ecr - b.ecr);

const payload = {
  capturedAt: new Date().toISOString(),
  leagueConfigVersion: leagueSourceOfTruth.version,
  leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
  format: "full-ppr",
  season: YEAR,
  teamCount: TEAM_COUNT,
  sources: {
    rankings: {
      provider: "FantasyPros",
      url: RANKINGS_URL,
      sourceUpdatedAt: ecrData.last_updated,
      sourceTimestamp: ecrData.last_updated_ts,
      expertCount: Number(ecrData.total_experts),
    },
    adp: {
      provider: "Fantasy Football Calculator",
      url: ADP_URL,
      totalDrafts: Number(adpPayload.meta?.total_drafts ?? 0),
      startDate: adpPayload.meta?.start_date ?? null,
      endDate: adpPayload.meta?.end_date ?? null,
    },
  },
  coverage: {
    rankedPlayers: players.length,
    directAdpPlayers: players.filter((player) => player.adp !== null).length,
    availablePlayers: players.filter((player) => player.availability === "available").length,
    keeperPlayers: players.filter((player) => player.availability === "my-keeper").length,
  },
  players,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload.coverage));
