import { NextResponse } from "next/server";
import { warRoomArtifact } from "@/lib/fantasy/warRoomArtifact";
import {
  ROTOWIRE_NFL_NEWS_FEED,
  consolidateFantasyNewsSignals,
  fetchConfiguredFantasyNews,
  ingestManualSleeperNotification,
} from "@/lib/fantasy/newsIngestion";
import type { FantasyNewsIngestionReport } from "@/lib/fantasy/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

const PASSIVE_CACHE_MS = 10 * 60_000;
const ROTOWIRE_FEED_JSON = JSON.stringify([ROTOWIRE_NFL_NEWS_FEED]);

type NewsCache = {
  expiresAt: number;
  report: FantasyNewsIngestionReport | null;
  pending: Promise<FantasyNewsIngestionReport> | null;
};

const newsGlobal = globalThis as typeof globalThis & {
  __moodinPassiveNewsCache?: NewsCache;
};

function snapshotCandidates() {
  return warRoomArtifact.candidates;
}

function cacheState() {
  newsGlobal.__moodinPassiveNewsCache ??= { expiresAt: 0, report: null, pending: null };
  return newsGlobal.__moodinPassiveNewsCache;
}

async function buildPassiveReport() {
  const candidates = snapshotCandidates();
  const [rotowire, configured] = await Promise.all([
    fetchConfiguredFantasyNews({ candidates, envValue: ROTOWIRE_FEED_JSON }),
    fetchConfiguredFantasyNews({ candidates }),
  ]);
  const signals = consolidateFantasyNewsSignals([...rotowire.signals, ...configured.signals]);
  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    feedCount: rotowire.feedCount + configured.feedCount,
    fetchedItemCount: rotowire.fetchedItemCount + configured.fetchedItemCount,
    appliedSignalCount: signals.length,
    signals,
    issues: [...rotowire.issues, ...configured.issues].slice(0, 100),
  } satisfies FantasyNewsIngestionReport;
}

export async function GET() {
  const cache = cacheState();
  const now = Date.now();
  try {
    if (cache.report && cache.expiresAt > now) {
      return NextResponse.json(cache.report, { headers: { "Cache-Control": "no-store" } });
    }
    cache.pending ??= buildPassiveReport();
    const report = await cache.pending;
    cache.report = report;
    cache.expiresAt = now + PASSIVE_CACHE_MS;
    cache.pending = null;
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    cache.pending = null;
    return NextResponse.json({
      enabled: false,
      generatedAt: new Date().toISOString(),
      feedCount: 0,
      fetchedItemCount: 0,
      appliedSignalCount: 0,
      signals: [],
      issues: [{ sourceId: "rotowire-nfl-rss", reason: "fetch-failed", detail: error instanceof Error ? error.message : "Passive RotoWire refresh failed." }],
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const text = body && typeof body === "object" && "text" in body
    ? (body as { text?: unknown }).text
    : null;
  if (typeof text !== "string" || !text.trim() || text.length > 4_000) {
    return NextResponse.json({ ok: false, error: "Paste a Sleeper notification up to 4,000 characters." }, { status: 400 });
  }
  const result = ingestManualSleeperNotification({ candidates: snapshotCandidates(), text });
  const signal = result.signals[0] ?? null;
  if (!signal) {
    return NextResponse.json({
      ok: false,
      error: result.issues[0]?.detail ?? "The notification could not be matched to an actionable player update.",
      issues: result.issues,
    }, { status: 422 });
  }
  const candidate = snapshotCandidates().find((entry) => entry.player.id === signal.playerId);
  return NextResponse.json({
    ok: true,
    signal,
    player: candidate ? {
      id: candidate.player.id,
      fullName: candidate.player.fullName,
      team: candidate.player.team,
      positions: candidate.player.positions,
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
