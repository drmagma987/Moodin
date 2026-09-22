import { NextResponse } from "next/server";
import { fetchWeeklyEvidenceBundle, applyWeeklyEvidenceBundle } from "@/lib/fantasy/weeklyEvidenceRefresh";
import { getInSeasonCommandCenterDataset } from "@/lib/fantasy/inSeason";
import { activeWeeklySlate } from "@/lib/fantasy/activeWeeklySlate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
let cached: { expiresAt: number; promise: Promise<Awaited<ReturnType<typeof fetchWeeklyEvidenceBundle>>> } | undefined;

export async function GET() {
  try {
    if (!cached || cached.expiresAt < Date.now()) cached = { expiresAt: Date.now() + 5 * 60_000, promise: fetchWeeklyEvidenceBundle() };
    const bundle = await cached.promise;
    const result = applyWeeklyEvidenceBundle(getInSeasonCommandCenterDataset().players, bundle);
    return NextResponse.json({ ...result, sources: bundle.sources, capturedAt: bundle.capturedAt,
      week: bundle.week, season: bundle.season, slate: activeWeeklySlate });
  } catch {
    return NextResponse.json({ error: "Evidence refresh could not be validated. Existing data is unchanged." }, { status: 502 });
  }
}
