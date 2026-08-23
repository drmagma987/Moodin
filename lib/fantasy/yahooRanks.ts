import type { DraftCandidate } from "@/lib/fantasy/types";

export const yahooCurrentPprBaselineMeta = {
  source:
    "Manual Yahoo v0 early-board baseline captured August 12, 2026 for board-comparison testing.",
  referenceTitle: "2026 Fantasy Football Full PPR Rankings: Consensus Top-300 players",
  referenceUrl:
    "https://sports.yahoo.com/fantasy/article/2026-fantasy-football-full-ppr-rankings-consensus-top-300-players-175205585.html",
  implementation:
    "Keeps an explicit top-25 list instead of scraping the Yahoo article body, because the public page does not expose a stable server-rendered top-300 payload.",
  coverage: 25,
} as const;

// Explicit v0 comparison board for the early rounds. Keep this manual until we
// have a clean Yahoo-export path that is stable enough to trust.
const YAHOO_V0_PPR_BASELINE: Array<{ rank: number; name: string }> = [
  { rank: 1, name: "Bijan Robinson" },
  { rank: 2, name: "Ja'Marr Chase" },
  { rank: 3, name: "Jahmyr Gibbs" },
  { rank: 4, name: "Puka Nacua" },
  { rank: 5, name: "Jaxon Smith-Njigba" },
  { rank: 6, name: "Christian McCaffrey" },
  { rank: 7, name: "CeeDee Lamb" },
  { rank: 8, name: "Jonathan Taylor" },
  { rank: 9, name: "Amon-Ra St. Brown" },
  { rank: 10, name: "James Cook III" },
  { rank: 11, name: "Justin Jefferson" },
  { rank: 12, name: "Ashton Jeanty" },
  { rank: 13, name: "De'Von Achane" },
  { rank: 14, name: "Drake London" },
  { rank: 15, name: "Chase Brown" },
  { rank: 16, name: "Saquon Barkley" },
  { rank: 17, name: "Nico Collins" },
  { rank: 18, name: "Brock Bowers" },
  { rank: 19, name: "Omarion Hampton" },
  { rank: 20, name: "Kenneth Walker III" },
  { rank: 21, name: "George Pickens" },
  { rank: 22, name: "Trey McBride" },
  { rank: 23, name: "Josh Allen" },
  { rank: 24, name: "Malik Nabers" },
  { rank: 25, name: "Jeremiyah Love" },
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const yahooRankByNormalizedName = new Map(
  YAHOO_V0_PPR_BASELINE.map((entry) => [normalizeName(entry.name), entry.rank]),
);

export function applyYahooBaselineToDraftCandidates(candidates: DraftCandidate[]) {
  let appliedCount = 0;

  const updated = candidates.map((candidate) => {
    const yahooRank = yahooRankByNormalizedName.get(normalizeName(candidate.player.fullName));
    if (!yahooRank) {
      return candidate;
    }

    appliedCount += 1;
    return {
      ...candidate,
      market: {
        ...candidate.market,
        yahooRank,
      },
      signals: candidate.signals
        ? {
            ...candidate.signals,
            notes: [
              ...candidate.signals.notes,
              `Yahoo v0 baseline rank ${yahooRank} retained as an independent sanity check.`,
            ],
          }
        : candidate.signals,
    };
  });

  return {
    candidates: updated.sort((a, b) => a.market.ecr - b.market.ecr),
    appliedCount,
  };
}
