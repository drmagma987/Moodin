import { activeNflSeasonForDate } from "@/lib/fantasy/seasonEvidence";
import {
  ingestFantasyNewsItems,
  type RawFantasyNewsItem,
} from "@/lib/fantasy/newsIngestion";
import type {
  DraftCandidate,
  FantasyNewsIngestionIssue,
  RefreshSignal,
} from "@/lib/fantasy/types";

const API_BASE = "https://api.fantasypros.com/public/v2/json/nfl";

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

function rowsFrom(payload: unknown, key: "items" | "injuries") {
  const root = asRecord(payload);
  return Array.isArray(root?.[key]) ? root[key] as unknown[] : [];
}

function isoDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

export function normalizeFantasyProsNewsPayload(payload: unknown, now: string): RawFantasyNewsItem[] {
  return rowsFrom(payload, "items").flatMap((row) => {
    const record = asRecord(row);
    const player = asRecord(record?.player);
    const headline = readString(record?.title, record?.headline);
    if (!record || !headline) return [];
    return [{
      externalId: readString(record.id, record.news_id),
      headline,
      summary: readString(record.impact, record.desc, record.description, record.summary) ?? headline,
      publishedAt: isoDate(readString(record.created, record.updated, record.published_at), now),
      sourceUrl: readString(record.link, record.url),
      fantasyProsId: readString(record.player_id, record.fpid, player?.id, player?.player_id),
      playerName: readString(record.player_name, record.name, player?.name, player?.player_name),
      team: readString(record.team_id, record.team, player?.team_id, player?.team),
    }];
  });
}

export function normalizeFantasyProsInjuryPayload(payload: unknown, now: string): RawFantasyNewsItem[] {
  return rowsFrom(payload, "injuries").flatMap((row) => {
    const record = asRecord(row);
    if (!record) return [];
    const name = readString(record.name, record.player_name);
    const status = readString(record.status, record.status_short);
    if (!name || !status) return [];
    const injuryType = readString(record.practice_report_injury_type, record.injury_type);
    const headline = `${name}: ${status}${injuryType ? ` (${injuryType})` : ""}`;
    return [{
      externalId: `injury:${readString(record.player_id, record.id) ?? name}:${readString(record.injury_update_date) ?? status}`,
      headline,
      summary: readString(record.comment) ?? headline,
      publishedAt: isoDate(readString(record.injury_update_date, record.updated_at), now),
      fantasyProsId: readString(record.player_id, record.id),
      yahooId: readString(record.yahoo_id),
      playerName: name,
      team: readString(record.team_id, record.team),
      injuryStatus: status,
    }];
  });
}

async function fetchFantasyPros(path: string, apiKey: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    next: { revalidate: 120 },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`FantasyPros ${path.split("?")[0]} returned ${response.status}.`);
  return response.json() as Promise<unknown>;
}

export async function fetchFantasyProsNewsSignals(input: {
  candidates: DraftCandidate[];
  now?: string;
  apiKey?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const enabled = input.apiKey !== undefined || process.env.FANTASYPROS_NEWS_ENABLED === "true";
  if (!enabled) return { enabled: false, signals: [] as RefreshSignal[], issues: [] as FantasyNewsIngestionIssue[], fetchedItemCount: 0 };
  const apiKey = input.apiKey ?? process.env.FANTASYPROS_API_KEY?.trim();
  if (!apiKey) return { enabled: false, signals: [] as RefreshSignal[], issues: [] as FantasyNewsIngestionIssue[], fetchedItemCount: 0 };
  const year = activeNflSeasonForDate(new Date(now));
  const requests = await Promise.allSettled([
    fetchFantasyPros("/news?limit=100&order_by=created", apiKey),
    fetchFantasyPros(`/injuries?year=${year}&include_probabilities=true`, apiKey),
  ]);
  const signals: RefreshSignal[] = [];
  const issues: FantasyNewsIngestionIssue[] = [];
  let fetchedItemCount = 0;
  const newsPayload = requests[0];
  if (newsPayload.status === "fulfilled") {
    const items = normalizeFantasyProsNewsPayload(newsPayload.value, now);
    fetchedItemCount += items.length;
    const ingested = ingestFantasyNewsItems({
      candidates: input.candidates,
      feed: { id: "fantasypros-news", label: "FantasyPros News", url: `${API_BASE}/news`, format: "json", sourceKind: "fantasy-news", trust: "aggregator" },
      items,
      now,
    });
    signals.push(...ingested.signals);
    issues.push(...ingested.issues);
  } else {
    issues.push({ sourceId: "fantasypros-news", reason: "fetch-failed", detail: newsPayload.reason instanceof Error ? newsPayload.reason.message : "FantasyPros news failed." });
  }
  const injuryPayload = requests[1];
  if (injuryPayload.status === "fulfilled") {
    const items = normalizeFantasyProsInjuryPayload(injuryPayload.value, now);
    fetchedItemCount += items.length;
    const ingested = ingestFantasyNewsItems({
      candidates: input.candidates,
      feed: { id: "fantasypros-injuries", label: "FantasyPros Injuries", url: `${API_BASE}/injuries`, format: "json", sourceKind: "official-injury", trust: "primary" },
      items,
      now,
    });
    signals.push(...ingested.signals);
    issues.push(...ingested.issues);
  } else {
    issues.push({ sourceId: "fantasypros-injuries", reason: "fetch-failed", detail: injuryPayload.reason instanceof Error ? injuryPayload.reason.message : "FantasyPros injuries failed." });
  }
  return { enabled: true, signals, issues, fetchedItemCount };
}
