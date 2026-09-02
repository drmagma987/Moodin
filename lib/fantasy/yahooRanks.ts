import type { DraftCandidate } from "@/lib/fantasy/types";
import workbookMarketReference from "@/lib/fantasy/data/workbookMarketReference.generated.json" with { type: "json" };

export const yahooCurrentPprBaselineMeta = {
  source: `${workbookMarketReference.sourceFile} · ${workbookMarketReference.sourceSheet}`,
  referenceTitle: "Workbook market-reference capture",
  referenceUrl: null,
  implementation:
    "Imports Yahoo XRank, Yahoo ADP, aggregate rank, individual expert ranks, disagreement spread, and source count as separate fields. Workbook target and personal-order columns are intentionally excluded.",
  coverage: workbookMarketReference.records.filter((record) => record.yahooXRank != null).length,
} as const;

function normalizeName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

const marketByNormalizedName = new Map(
  workbookMarketReference.records.map((entry) => [normalizeName(entry.playerName), entry]),
);

export function applyYahooBaselineToDraftCandidates(candidates: DraftCandidate[]) {
  let appliedCount = 0;

  const updated = candidates.map((candidate) => {
    const reference = marketByNormalizedName.get(normalizeName(candidate.player.fullName));
    if (!reference) {
      return candidate;
    }

    appliedCount += 1;
    return {
      ...candidate,
      market: {
        ...candidate.market,
        yahooRank: reference.yahooXRank ?? undefined,
        yahooXRank: reference.yahooXRank ?? undefined,
        yahooAdp: reference.yahooAdp ?? undefined,
        aggregateRank: reference.aggregateRank ?? undefined,
        sourceRanks: Object.fromEntries(
          Object.entries(reference.sourceRanks).filter(([, rank]) => rank != null),
        ),
        rankSpread: reference.rankSpread ?? undefined,
        marketSourceCount: reference.sourceCount ?? undefined,
        yahooXRankMinusAggregate: reference.yahooXRankMinusAggregate ?? undefined,
      },
    };
  });

  return {
    candidates: updated.sort((a, b) => a.market.ecr - b.market.ecr),
    appliedCount,
  };
}
