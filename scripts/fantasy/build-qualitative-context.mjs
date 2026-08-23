import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "tmp/fantasy-context/rotowire-players");
const OUTPUT = path.join(ROOT, "lib/fantasy/data/qualitative-context-2026-08-12.json");
const CAPTURED_AT = "2026-08-12T20:30:00.000Z";
const FANTASYPROS_URL = "https://www.fantasypros.com/nfl/notes/draft-overall.php?type=PPR";
const ROTOWIRE_BASE = "https://www.rotowire.com";
const NFL_URLS = {
  QB: "https://www.nfl.com/news/fantasy-football-qb-rankings-for-2026-nfl-season-draft-tiers-and-analysis",
  RB: "https://www.nfl.com/news/fantasy-football-rb-rankings-for-2026-nfl-season-draft-tiers-and-analysis",
  WR: "https://www.nfl.com/news/fantasy-football-wr-rankings-for-2026-nfl-season-draft-tiers-and-analysis",
  TE: "https://www.nfl.com/news/fantasy-football-te-rankings-for-2026-nfl-season-draft-tiers-and-analysis",
};
const REDDIT_URL = "https://www.reddit.com/r/fantasyfootball/comments/1vlj6yp/my_2026_top144_full_player_ranking_tier_list_with/";

const REDDIT_TARGETS = new Set([
  "Chase Brown", "James Cook", "Ashton Jeanty", "Omarion Hampton", "Kenneth Walker III",
  "David Montgomery", "Kenneth Gainwell", "Jonathon Brooks", "Blake Corum",
  "Chris Rodriguez Jr.", "Tank Bigsby", "Zay Flowers", "Emeka Egbuka", "Ladd McConkey",
  "Luther Burden III", "Christian Watson", "Parker Washington", "Josh Downs",
  "Quentin Johnston", "Romeo Doubs", "Jayden Reed", "KC Concepcion", "Jalen Coker",
  "Jayden Higgins", "Dontayvion Wicks", "Tucker Kraft", "Sam LaPorta", "Dallas Goedert",
  "Dalton Kincaid", "Isaiah Likely", "Jaxson Dart", "Kyler Murray", "Malik Willis",
  "Justin Herbert", "Trevor Lawrence", "Brock Purdy",
]);

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function classifyText(text, injuryStatus = null) {
  const lower = text.toLowerCase();
  const signals = new Set();
  const add = (signal, pattern) => {
    if (pattern.test(lower)) signals.add(signal);
  };

  add("role-secure", /clear (lead|no\.? 1)|workhorse|featured role|alpha|go-to|engine of|huge snap|locked[- ]in (role|starter|lead)|little target competition|no target competition/);
  add("role-competition", /role is up in the air|committee|timeshare|meaningful (role|target) competition|improved target competition|more competition for targets|backfield competition|backfield .*messy/);
  add("role-expansion", /taking over|expanded role|full-time role|new lead|set to see a similar workload|usage .*increase/);
  add("team-change", /arrives in|lands with|new team|signed with|traded to|joins the/);
  add("environment-strong", /one of the (nfl's|league's) best offenses|elite offense|top[- ]five offense|best offenses|excellent offensive line/);
  add("environment-weak", /putrid offens|bad offens|questionable receiving|quarterback .*question|offensive line .*transition|offensive environment .*concern/);
  add("established-production", /over the last (two|three|four|five|six)|each of his (two|three|four|five)|one season removed|career-best|proven|established/);
  add("limited-sample", /small sample|limited sample|only \d+ (career )?starts|only started \d+|four full games|brief flash|unproven/);
  add("upside", /overall upside|massive upside|league[- ]winner|top[- ]five upside|ceiling|breakout/);
  add("efficiency-concern", /regression|not sustainable|efficiency .*fell|inefficient|decline in efficiency|come back down/);
  add("volume-support", /target share|opportunity share|weighted opportunities|touches|snap share|first-read share|volume/);

  if (injuryStatus) {
    const normalized = injuryStatus.toLowerCase();
    if (/out|injured reserve|pup|suspended/.test(normalized)) signals.add("health-active-concern");
    else if (!/healthy|active/.test(normalized)) signals.add("health-recovering");
  }

  return [...signals];
}

function describeSignals(source, signals) {
  const phrases = [];
  if (signals.includes("role-secure")) phrases.push("a secure featured role");
  if (signals.includes("role-expansion")) phrases.push("an expanding workload");
  if (signals.includes("role-competition")) phrases.push("meaningful role competition");
  if (signals.includes("health-active-concern")) phrases.push("an active availability concern");
  else if (signals.includes("health-recovering")) phrases.push("a current recovery item");
  if (signals.includes("team-change")) phrases.push("a team change");
  if (signals.includes("environment-strong")) phrases.push("a favorable offensive environment");
  if (signals.includes("environment-weak")) phrases.push("supporting-cast or offense risk");
  if (signals.includes("established-production")) phrases.push("an established production baseline");
  if (signals.includes("limited-sample")) phrases.push("a limited NFL sample");
  if (signals.includes("efficiency-concern")) phrases.push("efficiency or regression risk");
  if (signals.includes("upside")) phrases.push("material ceiling");
  if (signals.includes("volume-support")) phrases.push("volume-based support");
  return phrases.length
    ? `${source} highlights ${phrases.slice(0, 3).join(", ")}.`
    : `${source} supplies a 2026 player outlook without a safely classifiable situation claim.`;
}

function evidenceRecord(source, url, text, extra = {}) {
  const signals = classifyText(text, extra.injuryStatus);
  return {
    source,
    sourceUrl: url,
    publishedAt: extra.publishedAt ?? null,
    capturedAt: CAPTURED_AT,
    kind: extra.kind ?? "player-outlook",
    signals,
    summary: describeSignals(source, signals),
    sourceTextHash: hashText(text),
    ...(extra.rank ? { rank: extra.rank } : {}),
    ...(extra.injuryStatus ? { injuryStatus: extra.injuryStatus } : {}),
    ...(extra.injuryDetail ? { injuryDetail: extra.injuryDetail } : {}),
    ...(extra.estimatedReturn ? { estimatedReturn: extra.estimatedReturn } : {}),
  };
}

function parseFantasyPros(html) {
  const records = new Map();
  const pattern = /<caption[^>]*>([\s\S]*?) Note<\/caption>[\s\S]*?<div class="player-note">([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(pattern)) {
    const playerName = decodeHtml(match[1]);
    const text = decodeHtml(match[2]);
    if (!playerName || !text) continue;
    records.set(normalizeName(playerName), {
      playerName,
      evidence: [evidenceRecord("FantasyPros", FANTASYPROS_URL, text, { publishedAt: "2026-08-12" })],
    });
  }
  return records;
}

function parseRotowireIndex(html, limit = 180) {
  const urls = [];
  const seen = new Set();
  for (const match of html.matchAll(/href="(\/football\/player\/[^"]+)"/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    urls.push(match[1]);
    if (urls.length >= limit) break;
  }
  return urls;
}

function parseRotowirePlayer(html, url) {
  const name = decodeHtml(html.match(/<h1 class="p-card__player-name">([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const outlook = decodeHtml(html.match(/<div class="p-card__outlook-text[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
  if (!name || !outlook) return null;
  const injuryBlock = html.match(/<div class="p-card__injury">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? "";
  const injuryStatus = decodeHtml(injuryBlock.match(/<div class="tag">([\s\S]*?)<\/div>/)?.[1] ?? "") || null;
  const injuryDetail = decodeHtml(injuryBlock.match(/Injury\s*<b>([\s\S]*?)<\/b>/)?.[1] ?? "") || null;
  const estimatedReturn = decodeHtml(injuryBlock.match(/Est\. Return\s*<b>([\s\S]*?)<\/b>/)?.[1] ?? "") || null;
  return {
    playerName: name,
    evidence: [evidenceRecord("RotoWire", url, outlook, {
      publishedAt: "2026-08-12",
      injuryStatus,
      injuryDetail,
      estimatedReturn,
    })],
  };
}

function parseNflRanks(html, position, sourceUrl) {
  const records = [];
  const pattern = /aria-label="Rank (\d+)"[\s\S]{0,2200}?aria-label="View details for ([^"]+)"/g;
  const seen = new Set();
  for (const match of html.matchAll(pattern)) {
    const rank = Number(match[1]);
    const playerName = decodeHtml(match[2]);
    const key = `${rank}:${normalizeName(playerName)}`;
    if (!rank || !playerName || seen.has(key)) continue;
    seen.add(key);
    const signals = rank <= 12 ? ["analyst-upper-tier"] : rank <= 30 ? ["analyst-draftable-tier"] : [];
    records.push({
      playerName,
      evidence: [{
        source: "NFL.com",
        sourceUrl,
        publishedAt: "2026-07-15",
        capturedAt: CAPTURED_AT,
        kind: "analyst-ranking",
        signals,
        summary: `NFL.com ranks ${playerName} as ${position}${rank}; this is market sentiment, not a role or health fact.`,
        sourceTextHash: hashText(`${position}:${rank}:${playerName}`),
        rank,
      }],
    });
  }
  return records;
}

function addRecord(target, record) {
  const key = normalizeName(record.playerName);
  const existing = target.get(key);
  if (existing) existing.evidence.push(...record.evidence);
  else target.set(key, { playerName: record.playerName, evidence: [...record.evidence] });
}

async function mapWithConcurrency(values, concurrency, fn) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await fn(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function fetchRotowirePlayer(relativeUrl) {
  const slug = relativeUrl.split("/").at(-1);
  const cachePath = path.join(CACHE_DIR, `${slug}.html`);
  let html;
  try {
    html = await readFile(cachePath, "utf8");
  } catch {
    const response = await fetch(`${ROTOWIRE_BASE}${relativeUrl}`, {
      headers: { "user-agent": "Moodin qualitative research snapshot/1.0" },
    });
    if (!response.ok) throw new Error(`RotoWire ${response.status}: ${relativeUrl}`);
    html = await response.text();
    await writeFile(cachePath, html);
  }
  return parseRotowirePlayer(html, `${ROTOWIRE_BASE}${relativeUrl}`);
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  const records = parseFantasyPros(await readFile(path.join(ROOT, "tmp/fantasy-context/fantasypros-notes.html"), "utf8"));
  const rotowireIndex = await readFile(path.join(ROOT, "tmp/fantasy-context/rotowire-outlooks.html"), "utf8");
  const rotowireRecords = await mapWithConcurrency(parseRotowireIndex(rotowireIndex), 5, fetchRotowirePlayer);
  for (const record of rotowireRecords) if (record) addRecord(records, record);

  for (const [position, sourceUrl] of Object.entries(NFL_URLS)) {
    const html = await readFile(path.join(ROOT, `tmp/fantasy-context/nfl-${position.toLowerCase()}.html`), "utf8");
    for (const record of parseNflRanks(html, position, sourceUrl)) addRecord(records, record);
  }

  for (const playerName of REDDIT_TARGETS) {
    addRecord(records, {
      playerName,
      evidence: [{
        source: "KyonFantasyFootball Reddit guide",
        sourceUrl: REDDIT_URL,
        publishedAt: "2026-08-11",
        capturedAt: CAPTURED_AT,
        kind: "analyst-target",
        signals: ["analyst-target"],
        summary: "The supplied Reddit draft guide identifies this player as a preferred target at expected cost.",
        sourceTextHash: hashText(`reddit-target:${normalizeName(playerName)}`),
      }],
    });
  }

  const players = [...records.values()]
    .map((record) => ({ ...record, sourceCount: new Set(record.evidence.map((item) => item.source)).size }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
  const snapshot = {
    version: 1,
    season: 2026,
    capturedAt: CAPTURED_AT,
    methodology: "Public outlook text was classified into bounded situation claims; raw write-ups are not retained.",
    sources: [FANTASYPROS_URL, "https://www.rotowire.com/football/outlooks.php", ...Object.values(NFL_URLS), REDDIT_URL],
    players,
  };
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote ${players.length} players (${players.filter((player) => player.sourceCount >= 2).length} multi-source) to ${OUTPUT}\n`);
}

await main();
