import { NextResponse } from "next/server";
import { warRoomArtifact } from "@/lib/fantasy/warRoomArtifact";
import {
  ROTOWIRE_NFL_NEWS_FEED,
  consolidateFantasyNewsSignals,
  fetchConfiguredFantasyNews,
} from "@/lib/fantasy/newsIngestion";
import type { RefreshSignalCategory } from "@/lib/fantasy/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

const ACTIONABLE = new Set<RefreshSignalCategory>([
  "injury-up",
  "role-down",
  "depth-chart-down",
  "holdout-risk",
]);
const ROTOWIRE_FEED = JSON.stringify([ROTOWIRE_NFL_NEWS_FEED]);

type BreakingNewsCache = {
  expiresAt: number;
  value: Awaited<ReturnType<typeof buildBreakingNewsFeed>> | null;
  pending: Promise<Awaited<ReturnType<typeof buildBreakingNewsFeed>>> | null;
};

const breakingGlobal = globalThis as typeof globalThis & {
  __moodinBreakingNewsCache?: BreakingNewsCache;
};

function cacheState() {
  breakingGlobal.__moodinBreakingNewsCache ??= { expiresAt: 0, value: null, pending: null };
  return breakingGlobal.__moodinBreakingNewsCache;
}

async function buildBreakingNewsFeed() {
  const [rotowire, configured] = await Promise.all([
    fetchConfiguredFantasyNews({ candidates: warRoomArtifact.candidates, envValue: ROTOWIRE_FEED }),
    fetchConfiguredFantasyNews({ candidates: warRoomArtifact.candidates }),
  ]);
  const signals = consolidateFantasyNewsSignals([...rotowire.signals, ...configured.signals])
    .filter((signal) => ACTIONABLE.has(signal.category))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 30);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceCount: rotowire.feedCount + configured.feedCount,
    alerts: signals.map((signal) => ({
      id: signal.externalId ?? signal.fingerprint ?? `${signal.playerId}:${signal.publishedAt}`,
      playerId: signal.playerId,
      category: signal.category,
      headline: signal.headline,
      summary: signal.summary,
      sourceLabel: signal.sourceLabel ?? signal.source,
      sourceUrl: signal.sourceUrl ?? null,
      publishedAt: signal.publishedAt,
      confidence: signal.confidence,
      impact: signal.impact,
      requiresYahooScan: true,
    })),
    issues: [...rotowire.issues, ...configured.issues].filter((issue) => issue.reason === "fetch-failed").slice(0, 10),
  };
}

export async function GET() {
  const cache = cacheState();
  const now = Date.now();
  try {
    if (cache.value && cache.expiresAt > now) {
      return NextResponse.json(cache.value, { headers: { "Cache-Control": "no-store" } });
    }
    cache.pending ??= buildBreakingNewsFeed();
    const value = await cache.pending;
    cache.value = value;
    cache.expiresAt = now + 10 * 60_000;
    cache.pending = null;
    return NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    cache.pending = null;
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      sourceCount: 0,
      alerts: [],
      issues: [{ sourceId: "breaking-news", reason: "fetch-failed", detail: error instanceof Error ? error.message : "Breaking-news refresh failed." }],
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
