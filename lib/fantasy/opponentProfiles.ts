import type { DraftCandidate, OpponentDraftProfile } from "@/lib/fantasy/types";

export type HistoricalDraftPick = { teamId: string; overallPick: number; playerName: string };

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildOpponentDraftProfiles(
  picks: HistoricalDraftPick[],
  candidates: DraftCandidate[],
) {
  const byName = new Map(candidates.map((candidate) => [normalize(candidate.player.fullName), candidate]));
  const tallies = new Map<string, { value: number; market: number; need: number; matched: number }>();
  for (const pick of picks) {
    const candidate = byName.get(normalize(pick.playerName));
    if (!candidate || pick.overallPick < 1) continue;
    const marketPick = candidate.market.adpSource === "direct" ? candidate.market.adp : candidate.market.ecr;
    const gap = pick.overallPick - marketPick;
    const tally = tallies.get(pick.teamId) ?? { value: 0, market: 0, need: 0, matched: 0 };
    if (gap >= 8) tally.value += 1;
    else if (gap <= -8) tally.need += 1;
    else tally.market += 1;
    tally.matched += 1;
    tallies.set(pick.teamId, tally);
  }
  return Object.fromEntries([...tallies].map(([teamId, tally]) => {
    const denominator = tally.matched + 6;
    return [teamId, {
      sampleSize: tally.matched,
      valueProbability: Number(((tally.value + 2.4) / denominator).toFixed(3)),
      marketProbability: Number(((tally.market + 1.8) / denominator).toFixed(3)),
      needProbability: Number(((tally.need + 1.8) / denominator).toFixed(3)),
      source: tally.matched >= 8 ? "history" : "neutral-fallback",
    } satisfies OpponentDraftProfile];
  }));
}

export function chooseOpponentBehavior(
  profile: OpponentDraftProfile | undefined,
  roll: number,
) {
  const safe = profile?.source === "history" ? profile : {
    valueProbability: 0.4,
    marketProbability: 0.3,
    needProbability: 0.3,
  };
  if (roll < safe.valueProbability) return "value" as const;
  if (roll < safe.valueProbability + safe.marketProbability) return "market" as const;
  return "need" as const;
}
