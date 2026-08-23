import type {
  DraftCandidate,
  FantasyNewsFeedConfig,
  FantasyNewsIngestionIssue,
  FantasyNewsIngestionReport,
  FantasyNewsSourceKind,
  FantasyNewsSourceTrust,
  RefreshSignal,
  RefreshSignalCategory,
} from "@/lib/fantasy/types";

export type RawFantasyNewsItem = {
  externalId?: string;
  headline: string;
  summary: string;
  publishedAt: string;
  sourceUrl?: string;
  playerId?: string;
  fantasyProsId?: string;
  yahooId?: string;
  sleeperId?: string;
  playerName?: string;
  team?: string;
  category?: RefreshSignalCategory;
  injuryStatus?: string;
};

export const ROTOWIRE_NFL_NEWS_FEED: FantasyNewsFeedConfig = {
  id: "rotowire-nfl-rss",
  label: "RotoWire NFL News",
  url: "https://www.rotowire.com/rss/news.php?sport=NFL",
  format: "rss",
  sourceKind: "fantasy-news",
  trust: "aggregator",
};

const VALID_CATEGORIES = new Set<RefreshSignalCategory>([
  "injury-up", "injury-down", "role-up", "role-down", "camp-buzz-up",
  "camp-buzz-down", "adp-steam", "adp-slide", "depth-chart-up",
  "depth-chart-down", "holdout-risk", "offense-up", "offense-down",
]);

const DEFAULT_MAX_AGE_HOURS: Record<FantasyNewsSourceKind, number> = {
  "official-injury": 14 * 24,
  "team-report": 10 * 24,
  "beat-writer": 7 * 24,
  "fantasy-news": 7 * 24,
};

const TRUST_CONFIDENCE: Record<FantasyNewsSourceTrust, RefreshSignal["confidence"]> = {
  primary: "high",
  verified: "medium",
  aggregator: "medium",
  unknown: "low",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlValue(block: string, tags: string[]) {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (match?.[1]) return decodeXml(match[1]);
  }
  return undefined;
}

export function parseFantasyNewsRss(xml: string): RawFantasyNewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.flatMap((block) => {
    const headline = xmlValue(block, ["title"]);
    const publishedAt = xmlValue(block, ["pubDate", "published", "updated", "dc:date"]);
    if (!headline || !publishedAt || !Number.isFinite(new Date(publishedAt).getTime())) return [];
    const atomHref = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
    return [{
      externalId: xmlValue(block, ["guid", "id"]),
      headline,
      summary: xmlValue(block, ["description", "summary", "content", "content:encoded"]) ?? headline,
      publishedAt: new Date(publishedAt).toISOString(),
      sourceUrl: atomHref ?? xmlValue(block, ["link"]),
      playerName: xmlValue(block, ["player", "playerName", "player_name"]),
      team: xmlValue(block, ["team"]),
      injuryStatus: xmlValue(block, ["injuryStatus", "status"]),
    }];
  });
}

function findJsonRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  for (const key of ["items", "news", "injuries", "articles", "players", "data", "results"]) {
    if (Array.isArray(root?.[key])) return root[key] as unknown[];
  }
  return [];
}

export function parseFantasyNewsJson(payload: unknown): RawFantasyNewsItem[] {
  return findJsonRows(payload).flatMap((row) => {
    const record = asRecord(row);
    if (!record) return [];
    const headline = readString(record.headline, record.title, record.news_title);
    const rawDate = readString(record.publishedAt, record.published_at, record.updated_at, record.date, record.created_at);
    if (!headline || !rawDate || !Number.isFinite(new Date(rawDate).getTime())) return [];
    const explicitCategory = readString(record.category, record.signalCategory);
    return [{
      externalId: readString(record.externalId, record.id, record.guid, record.news_id),
      headline,
      summary: readString(record.summary, record.description, record.news, record.body, record.analysis) ?? headline,
      publishedAt: new Date(rawDate).toISOString(),
      sourceUrl: readString(record.sourceUrl, record.url, record.link),
      playerId: readString(record.playerId, record.player_id),
      fantasyProsId: readString(record.fantasyProsId, record.fpid),
      yahooId: readString(record.yahooId, record.yahoo_id),
      sleeperId: readString(record.sleeperId, record.sleeper_id),
      playerName: readString(record.playerName, record.player_name, record.fullName, record.name),
      team: readString(record.team, record.team_id, record.player_team_id),
      category: explicitCategory && VALID_CATEGORIES.has(explicitCategory as RefreshSignalCategory)
        ? explicitCategory as RefreshSignalCategory
        : undefined,
      injuryStatus: readString(record.injuryStatus, record.injury_status, record.status, record.game_status),
    }];
  });
}

function classifyItem(item: RawFantasyNewsItem) {
  if (item.category) return { category: item.category, impact: 3 };
  const status = normalizeText(item.injuryStatus ?? "");
  const text = normalizeText(`${item.headline} ${item.summary}`);

  if (/\b(out|ir|injured reserve|pup|nfi|doubtful|did not practice|dnp)\b/.test(status)) return { category: "injury-up" as const, impact: 4.8 };
  if (/\b(questionable|limited|day to day)\b/.test(status)) return { category: "injury-up" as const, impact: 3.2 };
  if (/\b(full|healthy|cleared|activated)\b/.test(status)) return { category: "injury-down" as const, impact: 2.8 };
  if (/\b(placed on injured reserve|lands on ir|lands on injured reserve|ruled out|will miss|suffered|underwent surgery|torn acl|torn achilles|week to week|did not practice|left practice|leaves practice|exits practice|exited(?: [a-z]+){0,3} practice|carted off|went to the locker room)\b/.test(text)) return { category: "injury-up" as const, impact: 4.4 };
  if (/\b(cleared to play|returns? to practice|full participant|activated from|removed from injury report|ready for week)\b/.test(text)) return { category: "injury-down" as const, impact: 2.8 };
  if (/\b(holding out|holdout|contract dispute|requests? a trade)\b/.test(text)) return { category: "holdout-risk" as const, impact: 3.8 };
  if (/\b(named the starter|first team reps|lead back|featured role|workhorse|earning more snaps|role expanding)\b/.test(text)) return { category: "role-up" as const, impact: 3.1 };
  if (/\b(benched|demoted|backup role|losing snaps|committee backfield|role reduced|splitting first team reps)\b/.test(text)) return { category: "role-down" as const, impact: 3.1 };
  if (/\b(moved up the depth chart|promoted to|listed as the starter)\b/.test(text)) return { category: "depth-chart-up" as const, impact: 2.8 };
  if (/\b(moved down the depth chart|listed as a backup|third string)\b/.test(text)) return { category: "depth-chart-down" as const, impact: 2.8 };
  if (/\b(star of camp|standout at camp|turning heads|breakout camp)\b/.test(text)) return { category: "camp-buzz-up" as const, impact: 1.5 };
  if (/\b(struggling in camp|rough camp|poor camp)\b/.test(text)) return { category: "camp-buzz-down" as const, impact: 1.5 };
  return null;
}

function buildCandidateIndexes(candidates: DraftCandidate[]) {
  const ids = new Map<string, string>();
  const names = new Map<string, string[]>();
  for (const candidate of candidates) {
    ids.set(`canonical:${candidate.player.id}`, candidate.player.id);
    for (const [provider, id] of Object.entries(candidate.player.externalIds)) {
      if (id) ids.set(`${provider}:${id}`, candidate.player.id);
    }
    const name = normalizeText(candidate.player.fullName);
    names.set(name, [...(names.get(name) ?? []), candidate.player.id]);
  }
  return { ids, names };
}

function resolvePlayer(item: RawFantasyNewsItem, candidates: DraftCandidate[], indexes: ReturnType<typeof buildCandidateIndexes>) {
  const directKeys = [
    item.playerId && `canonical:${item.playerId}`,
    item.fantasyProsId && `fantasyPros:${item.fantasyProsId}`,
    item.yahooId && `yahoo:${item.yahooId}`,
    item.sleeperId && `sleeper:${item.sleeperId}`,
  ].filter((value): value is string => Boolean(value));
  for (const key of directKeys) {
    const match = indexes.ids.get(key);
    if (match) return { playerId: match };
  }

  const explicitName = item.playerName ? normalizeText(item.playerName) : "";
  if (explicitName) {
    const matches = (indexes.names.get(explicitName) ?? []).filter((playerId) => {
      if (!item.team) return true;
      return candidates.find((candidate) => candidate.player.id === playerId)?.player.team.toUpperCase() === item.team.toUpperCase();
    });
    if (matches.length === 1) return { playerId: matches[0] };
    if (matches.length > 1) return { ambiguous: true };
  }

  const haystack = ` ${normalizeText(`${item.headline} ${item.summary}`)} `;
  const mentioned = [...indexes.names.entries()]
    .filter(([name]) => name.length >= 5 && haystack.includes(` ${name} `))
    .flatMap(([, playerIds]) => playerIds);
  const unique = [...new Set(mentioned)];
  if (unique.length === 1) return { playerId: unique[0] };
  if (unique.length > 1) return { ambiguous: true };
  return {};
}

function sourceType(feed: FantasyNewsFeedConfig): RefreshSignal["source"] {
  if (feed.id === "manual-sleeper-notification") return "manual";
  if (feed.id === "fantasypros-news") return "fantasypros-news";
  if (feed.id === "fantasypros-injuries") return "fantasypros-injury";
  if (feed.sourceKind === "official-injury") return "official-injury";
  if (feed.sourceKind === "team-report") return "team-report";
  if (feed.sourceKind === "beat-writer") return "beat-report";
  return "fantasy-news";
}

export function ingestManualSleeperNotification(input: {
  candidates: DraftCandidate[];
  text: string;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const headline = input.text
    .replace(/^\s*sleeper(?:\s+sports)?\s*[:\-–—]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
  if (!headline) {
    return {
      signals: [] as RefreshSignal[],
      issues: [{
        sourceId: "manual-sleeper-notification",
        reason: "invalid" as const,
        detail: "Paste the Sleeper notification text first.",
      }],
    };
  }
  return ingestFantasyNewsItems({
    candidates: input.candidates,
    feed: {
      id: "manual-sleeper-notification",
      label: "Sleeper notification (pasted)",
      url: "https://sleeper.com/",
      format: "json",
      sourceKind: "fantasy-news",
      trust: "verified",
    },
    items: [{
      externalId: `manual-${stableHash(`${now}|${headline}`)}`,
      headline,
      summary: "Pasted directly from a Sleeper notification for immediate evaluation.",
      publishedAt: now,
    }],
    now,
  });
}

export function ingestFantasyNewsItems(input: {
  candidates: DraftCandidate[];
  feed: FantasyNewsFeedConfig;
  items: RawFantasyNewsItem[];
  now?: string;
}) {
  const now = new Date(input.now ?? new Date().toISOString());
  const indexes = buildCandidateIndexes(input.candidates);
  const signals: RefreshSignal[] = [];
  const issues: FantasyNewsIngestionIssue[] = [];
  const fingerprints = new Set<string>();

  for (const item of input.items) {
    const ageHours = (now.getTime() - new Date(item.publishedAt).getTime()) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours < -1 || ageHours > DEFAULT_MAX_AGE_HOURS[input.feed.sourceKind]) {
      issues.push({ sourceId: input.feed.id, headline: item.headline, reason: "stale", detail: "Item is outside this source type's active news window." });
      continue;
    }
    const classification = classifyItem(item);
    if (!classification) {
      issues.push({ sourceId: input.feed.id, headline: item.headline, reason: "unclassified", detail: "No explicit actionable injury, role, depth-chart, holdout, or camp signal was found." });
      continue;
    }
    const resolved = resolvePlayer(item, input.candidates, indexes);
    if (resolved.ambiguous) {
      issues.push({ sourceId: input.feed.id, headline: item.headline, reason: "ambiguous-player", detail: "More than one board player was mentioned; no automatic ranking change was made." });
      continue;
    }
    if (!resolved.playerId) {
      issues.push({ sourceId: input.feed.id, headline: item.headline, reason: "unmatched-player", detail: "The story could not be joined to a canonical board player." });
      continue;
    }
    const fingerprint = stableHash(`${resolved.playerId}|${classification.category}|${normalizeText(item.headline)}`);
    if (fingerprints.has(fingerprint)) {
      issues.push({ sourceId: input.feed.id, headline: item.headline, reason: "duplicate", detail: "Duplicate item was suppressed within this ingestion run." });
      continue;
    }
    fingerprints.add(fingerprint);
    const expiresAt = new Date(new Date(item.publishedAt).getTime() + DEFAULT_MAX_AGE_HOURS[input.feed.sourceKind] * 3_600_000).toISOString();
    signals.push({
      playerId: resolved.playerId,
      category: classification.category,
      headline: item.headline,
      summary: item.summary,
      source: sourceType(input.feed),
      publishedAt: item.publishedAt,
      confidence: TRUST_CONFIDENCE[input.feed.trust],
      impact: classification.impact,
      externalId: item.externalId,
      fingerprint,
      sourceId: input.feed.id,
      sourceLabel: input.feed.label,
      sourceUrl: item.sourceUrl,
      expiresAt,
      ingestedAt: now.toISOString(),
    });
  }
  return { signals, issues };
}

export function parseFantasyNewsFeedConfig(raw = process.env.FANTASY_NEWS_FEEDS_JSON) {
  if (!raw?.trim()) return [] as FantasyNewsFeedConfig[];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("FANTASY_NEWS_FEEDS_JSON must be a JSON array.");
  return parsed.map((value, index) => {
    const record = asRecord(value);
    const id = readString(record?.id);
    const label = readString(record?.label);
    const urlValue = readString(record?.url);
    const format = readString(record?.format);
    const sourceKind = readString(record?.sourceKind);
    const trust = readString(record?.trust);
    if (!id || !label || !urlValue || !["rss", "json"].includes(format ?? "") || !["official-injury", "team-report", "beat-writer", "fantasy-news"].includes(sourceKind ?? "") || !["primary", "verified", "aggregator", "unknown"].includes(trust ?? "")) {
      throw new Error(`Fantasy news feed ${index + 1} has an invalid or missing field.`);
    }
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error(`Fantasy news feed ${id} must use a credential-free HTTPS URL.`);
    return { id, label, url: url.toString(), format, sourceKind, trust } as FantasyNewsFeedConfig;
  }).slice(0, 12);
}

async function fetchFeed(feed: FantasyNewsFeedConfig) {
  const response = await fetch(feed.url, {
    cache: "no-store",
    headers: { accept: feed.format === "rss" ? "application/rss+xml, application/atom+xml, text/xml" : "application/json" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("response exceeded 2 MB");
  return feed.format === "rss" ? parseFantasyNewsRss(body) : parseFantasyNewsJson(JSON.parse(body));
}

export async function fetchConfiguredFantasyNews(input: {
  candidates: DraftCandidate[];
  envValue?: string;
  now?: string;
}): Promise<FantasyNewsIngestionReport> {
  const now = input.now ?? new Date().toISOString();
  const feeds = parseFantasyNewsFeedConfig(input.envValue);
  if (feeds.length === 0) return { enabled: false, generatedAt: now, feedCount: 0, fetchedItemCount: 0, appliedSignalCount: 0, signals: [], issues: [] };
  const results = await Promise.all(feeds.map(async (feed) => {
    try {
      const items = await fetchFeed(feed);
      return { feed, items };
    } catch (error) {
      return { feed, items: [] as RawFantasyNewsItem[], error: error instanceof Error ? error.message : "unknown fetch error" };
    }
  }));
  const signals: RefreshSignal[] = [];
  const issues: FantasyNewsIngestionIssue[] = [];
  let fetchedItemCount = 0;
  for (const result of results) {
    fetchedItemCount += result.items.length;
    if (result.error) {
      issues.push({ sourceId: result.feed.id, reason: "fetch-failed", detail: result.error });
      continue;
    }
    const ingested = ingestFantasyNewsItems({ candidates: input.candidates, feed: result.feed, items: result.items, now });
    signals.push(...ingested.signals);
    issues.push(...ingested.issues);
  }
  const uniqueSignals = [...new Map(signals.map((signal) => [signal.fingerprint ?? `${signal.playerId}|${signal.category}|${signal.headline}`, signal])).values()];
  return { enabled: true, generatedAt: now, feedCount: feeds.length, fetchedItemCount, appliedSignalCount: uniqueSignals.length, signals: uniqueSignals, issues: issues.slice(0, 100) };
}

function headlineTokens(value: string) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 3));
}

function headlineSimilarity(left: string, right: string) {
  const a = headlineTokens(left);
  const b = headlineTokens(right);
  const overlap = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : overlap / union;
}

export function consolidateFantasyNewsSignals(signals: RefreshSignal[]) {
  const sorted = [...signals].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const retained: RefreshSignal[] = [];
  for (const signal of sorted) {
    const duplicate = retained.find((existing) => {
      if (existing.playerId !== signal.playerId || existing.category !== signal.category) return false;
      const hours = Math.abs(new Date(existing.publishedAt).getTime() - new Date(signal.publishedAt).getTime()) / 3_600_000;
      if (hours > 18) return false;
      const injuryPair = signal.category === "injury-up" || signal.category === "injury-down";
      return injuryPair || headlineSimilarity(existing.headline, signal.headline) >= 0.45;
    });
    if (!duplicate) {
      retained.push(signal);
      continue;
    }
    const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
    if (confidenceRank[signal.confidence] > confidenceRank[duplicate.confidence] || signal.impact > duplicate.impact) {
      const index = retained.indexOf(duplicate);
      retained[index] = signal;
    }
  }
  return retained;
}
