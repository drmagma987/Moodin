import type { CandidateRefreshSnapshot, DraftCandidate } from "@/lib/fantasy/types";

export type ApprovedRankingRefreshEntry = {
  playerName: string;
  annotation: string;
  medianPointDelta: number;
  adjustment: "bounded-residual" | "annotation-only";
  rationale: string;
};

export const approvedRankingRefreshMeta = {
  id: "fantasy-top-220-refresh-2026-09-01",
  approvedAt: "2026-09-01T23:59:00-04:00",
  reviewDocument: "docs/FANTASY_TOP_220_REFRESH_REVIEW_2026-09-01.md",
  expectedAnnotations: 26,
  expectedNumericalAdjustments: 14,
  expectedAnnotationOnly: 12,
  expectedTop220Entry: "Kaelon Black",
  expectedTop220Exit: "James Conner",
} as const;

export const approvedRankingRefresh: ApprovedRankingRefreshEntry[] = [
  { playerName: "James Conner", annotation: "Confirmed IR; expected absence was not fully reflected in the fresh median.", medianPointDelta: -4.34, adjustment: "bounded-residual", rationale: "Confirmed IR residual only." },
  { playerName: "Jordyn Tyson", annotation: "Confirmed IR with an expected multi-week absence.", medianPointDelta: -4.71, adjustment: "bounded-residual", rationale: "Fresh projection reflected only part of the absence." },
  { playerName: "TreVeyon Henderson", annotation: "Not cleared for full activity; recent recovery reports conflict.", medianPointDelta: -1.81, adjustment: "bounded-residual", rationale: "Modest health residual because reports conflict." },
  { playerName: "Zach Charbonnet", annotation: "PUP guarantees at least four missed games.", medianPointDelta: -3.97, adjustment: "bounded-residual", rationale: "Confirmed missed-time residual." },
  { playerName: "Jeremiyah Love", annotation: "High-ankle concern; Week 1 status remains uncertain.", medianPointDelta: -3.92, adjustment: "bounded-residual", rationale: "Near-term floor drag, not a season-long injury assumption." },
  { playerName: "Mike Evans", annotation: "Multiple current injuries create near-term availability risk.", medianPointDelta: -2.02, adjustment: "bounded-residual", rationale: "Bounded availability residual." },
  { playerName: "Khalil Shakir", annotation: "Still sidelined without a clear diagnosis or timetable.", medianPointDelta: -1.01, adjustment: "bounded-residual", rationale: "Small uncertainty residual." },
  { playerName: "Carnell Tate", annotation: "Unexplained stiffness adds a small availability concern.", medianPointDelta: -0.51, adjustment: "bounded-residual", rationale: "No guessed timetable." },
  { playerName: "Kyle Monangai", annotation: "Week-to-week knee issue; fresh projections already moved down.", medianPointDelta: -1.55, adjustment: "bounded-residual", rationale: "Only the remaining unreflected risk is applied." },
  { playerName: "Jonathon Brooks", annotation: "Soreness and a projected complementary role temper the fresh rise.", medianPointDelta: -1.53, adjustment: "bounded-residual", rationale: "Small role/health residual." },
  { playerName: "Javonte Williams", annotation: "Clearer lead-back status restores a small portion of the fresh-source decline.", medianPointDelta: 1.28, adjustment: "bounded-residual", rationale: "Bounded role restoration." },
  { playerName: "D'Andre Swift", annotation: "Receives a small role bump while Kyle Monangai is week-to-week.", medianPointDelta: 0.95, adjustment: "bounded-residual", rationale: "Coach optimism is not treated as a full new projection." },
  { playerName: "Brian Robinson Jr.", annotation: "Goal-line opportunity improved, but overall workload remains uncertain.", medianPointDelta: 0.69, adjustment: "bounded-residual", rationale: "Small contingent-role bump." },
  { playerName: "Emmett Johnson", annotation: "Updated depth chart supports a modest contingent RB2 role.", medianPointDelta: 1.28, adjustment: "bounded-residual", rationale: "Bounded depth-chart gain." },
  { playerName: "Josh Jacobs", annotation: "Commissioner's Exempt List; cannot practice or play while listed.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already removed 140.8 median points; do not double count." },
  { playerName: "MarShawn Lloyd", annotation: "Likely Green Bay backfield leader during Josh Jacobs' absence.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already added 54.0 median points; do not double count." },
  { playerName: "Isiah Pacheco", annotation: "Placed on IR with a back injury.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already reflected the IR move; retain the note without another penalty." },
  { playerName: "Jadarian Price", annotation: "Expected early Seattle lead-back role.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already incorporated the role gain." },
  { playerName: "Kyren Williams", annotation: "Expected backfield timeshare with Blake Corum.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already incorporated the timeshare." },
  { playerName: "Malik Nabers", annotation: "Practiced, but Week 1 readiness remains unresolved.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Latest direction is mixed after a fresh projection increase." },
  { playerName: "Christian McCaffrey", annotation: "Participated in practice drills.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Reassuring, but insufficient to raise an elite baseline." },
  { playerName: "Luther Burden III", annotation: "Returned to practice.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already incorporated the improvement." },
  { playerName: "Tee Higgins", annotation: "Heel contusion described as not a major concern.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Visibility matters; a downgrade is not supported." },
  { playerName: "Ja'Marr Chase", annotation: "Expected to be limited with a knee issue; coach remains positive.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "No season-long numerical move is supported." },
  { playerName: "Tyrone Tracy Jr.", annotation: "Practicing in a non-contact jersey.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Direction is positive but incomplete after a fresh decline." },
  { playerName: "De'Zhaun Stribling", annotation: "Expanded opportunity after San Francisco receiver injuries.", medianPointDelta: 0, adjustment: "annotation-only", rationale: "Fresh projections already incorporated the opportunity gain." },
];

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function mergedRefreshSnapshot(
  current: CandidateRefreshSnapshot | undefined,
  entry: ApprovedRankingRefreshEntry,
  appliedDelta: number,
): CandidateRefreshSnapshot {
  const netImpact = Number(((current?.netImpact ?? 0) + appliedDelta).toFixed(2));
  const status = netImpact >= 2.5 ? "rising" : netImpact <= -2.5 ? "falling" : current?.status ?? "steady";
  return {
    status,
    freshnessScore: Math.max(current?.freshnessScore ?? 18, 82),
    netImpact,
    confidencePenalty: current?.confidencePenalty ?? 0,
    lastUpdatedAt: approvedRankingRefreshMeta.approvedAt,
    adjustments: [
      ...(current?.adjustments ?? []),
      ...(appliedDelta === 0 ? [] : [{ label: "Approved residual", delta: appliedDelta, reason: entry.rationale }]),
    ].slice(-4),
    headlines: [entry.annotation, ...(current?.headlines ?? [])].slice(0, 3),
    summary: appliedDelta === 0
      ? `${entry.annotation} Annotation only; the fresh projection already carries the numerical effect.`
      : `${entry.annotation} Completeness-scaled approved residual: ${appliedDelta > 0 ? "+" : ""}${appliedDelta.toFixed(2)} median points.`,
  };
}

export function applyApprovedRankingRefresh(candidates: DraftCandidate[]) {
  const entriesByName = new Map(approvedRankingRefresh.map((entry) => [normalizeName(entry.playerName), entry]));
  const matches = new Map<string, number>();
  const updated = candidates.map((candidate) => {
    const key = normalizeName(candidate.player.fullName);
    const entry = entriesByName.get(key);
    if (!entry) return candidate;
    matches.set(key, (matches.get(key) ?? 0) + 1);
    const adjustmentScale = candidate.signals?.profileCompleteness?.adjustmentScale ?? 1;
    const delta = Number((entry.medianPointDelta * adjustmentScale).toFixed(2));
    return {
      ...candidate,
      projection: delta === 0 ? candidate.projection : {
        ...candidate.projection,
        range: {
          p10: Number(Math.max(0, candidate.projection.range.p10 + delta).toFixed(2)),
          p50: Number(Math.max(0, candidate.projection.range.p50 + delta).toFixed(2)),
          p90: Number(Math.max(0, candidate.projection.range.p90 + delta).toFixed(2)),
        },
      },
      signals: candidate.signals ? {
        ...candidate.signals,
        refresh: mergedRefreshSnapshot(candidate.signals.refresh, entry, delta),
        notes: [
          ...candidate.signals.notes,
          `[Approved refresh] ${entry.annotation} ${entry.rationale}`,
        ],
      } : candidate.signals,
    };
  });
  const unmatched = approvedRankingRefresh.filter((entry) => !matches.has(normalizeName(entry.playerName)));
  const ambiguous = approvedRankingRefresh.filter((entry) => (matches.get(normalizeName(entry.playerName)) ?? 0) > 1);
  if (unmatched.length > 0 || ambiguous.length > 0) {
    throw new Error(`Approved refresh identity failure: ${unmatched.length} unmatched, ${ambiguous.length} ambiguous.`);
  }
  return {
    candidates: updated,
    annotationsApplied: approvedRankingRefresh.length,
    numericalAdjustmentsApplied: approvedRankingRefresh.filter((entry) => entry.medianPointDelta !== 0).length,
  };
}
