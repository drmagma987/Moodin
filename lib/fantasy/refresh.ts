import type {
  CandidateRefreshAdjustment,
  CandidateRefreshSnapshot,
  DraftCandidate,
  RefreshDigest,
  RefreshSignal,
  RefreshSignalCategory,
  RefreshSourceType,
  RefreshWatchlistEntry,
} from "@/lib/fantasy/types";

type RefreshContext = {
  now?: string;
};

const SOURCE_WEIGHT: Record<RefreshSourceType, number> = {
  "fantasypros-news": 0.88,
  "fantasypros-injury": 0.96,
  "official-injury": 1,
  "team-report": 0.9,
  "fantasy-news": 0.76,
  "sleeper-market": 0.62,
  "beat-report": 0.7,
  manual: 0.75,
};

const CATEGORY_CONFIG: Record<
  RefreshSignalCategory,
  {
    medianMultiplier: number;
    floorMultiplier: number;
    confidencePenaltyMultiplier: number;
    label: string;
  }
> = {
  "injury-up": {
    medianMultiplier: -1.7,
    floorMultiplier: -2.3,
    confidencePenaltyMultiplier: 1.35,
    label: "Injury concern",
  },
  "injury-down": {
    medianMultiplier: 1.15,
    floorMultiplier: 1.35,
    confidencePenaltyMultiplier: -0.7,
    label: "Injury relief",
  },
  "role-up": {
    medianMultiplier: 1.45,
    floorMultiplier: 1.1,
    confidencePenaltyMultiplier: -0.15,
    label: "Role rising",
  },
  "role-down": {
    medianMultiplier: -1.45,
    floorMultiplier: -1.7,
    confidencePenaltyMultiplier: 0.55,
    label: "Role softening",
  },
  "camp-buzz-up": {
    medianMultiplier: 0.7,
    floorMultiplier: 0.3,
    confidencePenaltyMultiplier: 0.05,
    label: "Camp buzz",
  },
  "camp-buzz-down": {
    medianMultiplier: -0.7,
    floorMultiplier: -0.45,
    confidencePenaltyMultiplier: 0.2,
    label: "Camp concern",
  },
  "adp-steam": {
    medianMultiplier: 0.5,
    floorMultiplier: 0.1,
    confidencePenaltyMultiplier: 0.1,
    label: "ADP steam",
  },
  "adp-slide": {
    medianMultiplier: -0.5,
    floorMultiplier: -0.15,
    confidencePenaltyMultiplier: 0.15,
    label: "ADP slide",
  },
  "depth-chart-up": {
    medianMultiplier: 1.05,
    floorMultiplier: 0.9,
    confidencePenaltyMultiplier: -0.05,
    label: "Depth chart gain",
  },
  "depth-chart-down": {
    medianMultiplier: -1.15,
    floorMultiplier: -1.25,
    confidencePenaltyMultiplier: 0.4,
    label: "Depth chart loss",
  },
  "holdout-risk": {
    medianMultiplier: -1.6,
    floorMultiplier: -2,
    confidencePenaltyMultiplier: 1.1,
    label: "Holdout risk",
  },
  "offense-up": {
    medianMultiplier: 0.8,
    floorMultiplier: 0.45,
    confidencePenaltyMultiplier: -0.1,
    label: "Offense rising",
  },
  "offense-down": {
    medianMultiplier: -0.85,
    floorMultiplier: -0.55,
    confidencePenaltyMultiplier: 0.15,
    label: "Offense concern",
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hoursSince(publishedAt: string, now: Date) {
  const diff = now.getTime() - new Date(publishedAt).getTime();
  return Math.max(0, diff / (1000 * 60 * 60));
}

function confidenceWeight(confidence: RefreshSignal["confidence"]) {
  switch (confidence) {
    case "high":
      return 1;
    case "medium":
      return 0.78;
    case "low":
    default:
      return 0.56;
  }
}

function recencyWeight(hours: number) {
  if (hours <= 12) {
    return 1;
  }
  if (hours <= 36) {
    return 0.9;
  }
  if (hours <= 72) {
    return 0.76;
  }
  if (hours <= 120) {
    return 0.6;
  }
  return 0.42;
}

function impactWeight(signal: RefreshSignal, now: Date) {
  return (
    signal.impact *
    SOURCE_WEIGHT[signal.source] *
    confidenceWeight(signal.confidence) *
    recencyWeight(hoursSince(signal.publishedAt, now))
  );
}

function activeUniqueSignals(signals: RefreshSignal[], now: Date) {
  const unique = new Map<string, RefreshSignal>();
  for (const signal of signals) {
    if (signal.expiresAt && new Date(signal.expiresAt).getTime() <= now.getTime()) continue;
    const key = signal.fingerprint ?? `${signal.playerId}|${signal.category}|${signal.source}|${signal.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    const existing = unique.get(key);
    if (!existing || new Date(signal.publishedAt).getTime() > new Date(existing.publishedAt).getTime()) unique.set(key, signal);
  }
  return [...unique.values()];
}

function summarizeRefresh(status: CandidateRefreshSnapshot["status"], netImpact: number) {
  if (status === "rising") {
    return `Recent signals are pushing this player up by about ${netImpact.toFixed(1)} points in the refresh layer.`;
  }
  if (status === "falling") {
    return `Recent signals are dragging this player down by about ${Math.abs(netImpact).toFixed(1)} points in the refresh layer.`;
  }
  if (status === "volatile") {
    return "Recent signals are mixed enough that the player is harder to price confidently right now.";
  }
  return "No meaningful late-cycle refresh pressure is pushing this player off the established board.";
}

function buildRefreshSnapshot(
  candidate: DraftCandidate,
  signals: RefreshSignal[],
  now: Date,
) {
  if (signals.length === 0) {
    return {
      status: "steady",
      freshnessScore: 18,
      netImpact: 0,
      confidencePenalty: 0,
      lastUpdatedAt: null,
      adjustments: [],
      headlines: [],
      summary: "No meaningful late-cycle refresh pressure is pushing this player off the established board.",
    } satisfies CandidateRefreshSnapshot;
  }

  const adjustments: CandidateRefreshAdjustment[] = [];
  const adjustmentScale = candidate.signals?.profileCompleteness?.adjustmentScale ?? 1;
  let netImpact = 0;
  let rawNetImpact = 0;
  let confidencePenalty = 0;
  let weightedMagnitude = 0;
  const sortedSignals = [...signals].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  for (const signal of sortedSignals) {
    const config = CATEGORY_CONFIG[signal.category];
    const weight = impactWeight(signal, now);
    const rawDelta = config.medianMultiplier * weight;
    const delta = Number((config.medianMultiplier * weight * adjustmentScale).toFixed(2));
    const floorDelta = Number((config.floorMultiplier * weight * adjustmentScale).toFixed(2));
    netImpact += delta;
    rawNetImpact += rawDelta;
    weightedMagnitude += Math.abs(rawDelta);
    confidencePenalty += config.confidencePenaltyMultiplier * weight * adjustmentScale;
    adjustments.push({
      label: config.label,
      delta,
      reason: `${signal.headline} (${signal.sourceLabel ?? signal.source})`,
    });
    if (floorDelta !== 0) {
      adjustments.push({
        label: `${config.label} floor`,
        delta: floorDelta,
        reason: `Floor impact from ${signal.category}.`,
      });
    }
  }

  const positiveSignals = adjustments.filter((adjustment) => adjustment.delta > 0).length;
  const negativeSignals = adjustments.filter((adjustment) => adjustment.delta < 0).length;
  const status =
    positiveSignals > 0 && negativeSignals > 0 && Math.abs(rawNetImpact) <= 2.8
      ? "volatile"
      : rawNetImpact >= 2.5
        ? "rising"
        : rawNetImpact <= -2.5
          ? "falling"
          : "steady";
  const freshnessScore = Math.round(
    clamp(
      20 +
        weightedMagnitude * 5.5 +
        sortedSignals.length * 6 +
        (status === "volatile" ? 8 : status === "rising" || status === "falling" ? 5 : 0),
      18,
      96,
    ),
  );

  return {
    status,
    freshnessScore,
    netImpact: Number(netImpact.toFixed(2)),
    confidencePenalty: Number(confidencePenalty.toFixed(2)),
    lastUpdatedAt: sortedSignals[0]?.publishedAt ?? null,
    adjustments: adjustments.slice(0, 4),
    headlines: sortedSignals.map((signal) => signal.headline).slice(0, 3),
    summary: summarizeRefresh(status, Number(netImpact.toFixed(2))),
  } satisfies CandidateRefreshSnapshot;
}

function buildWatchlistEntry(candidate: DraftCandidate): RefreshWatchlistEntry | null {
  const refresh = candidate.signals?.refresh;
  if (!refresh || refresh.status === "steady") {
    return null;
  }

  return {
    playerId: candidate.player.id,
    status: refresh.status,
    freshnessScore: refresh.freshnessScore,
    netImpact: refresh.netImpact,
    headline:
      refresh.status === "rising"
        ? `${candidate.player.fullName} is gaining late-cycle support`
        : refresh.status === "falling"
          ? `${candidate.player.fullName} is losing late-cycle support`
          : `${candidate.player.fullName} has conflicting late-cycle signals`,
    summary: refresh.summary,
  };
}

export function applyRefreshSignals(
  candidates: DraftCandidate[],
  signals: RefreshSignal[],
  context?: RefreshContext,
) {
  const now = new Date(context?.now ?? new Date().toISOString());
  const activeSignals = activeUniqueSignals(signals, now);
  const signalsByPlayerId = new Map<string, RefreshSignal[]>();

  for (const signal of activeSignals) {
    const list = signalsByPlayerId.get(signal.playerId) ?? [];
    list.push(signal);
    signalsByPlayerId.set(signal.playerId, list);
  }

  const refreshedCandidates = candidates.map((candidate) => {
    const candidateSignals = signalsByPlayerId.get(candidate.player.id) ?? [];
    const refresh = buildRefreshSnapshot(candidate, candidateSignals, now);
    const nextP50 = Number(
      Math.max(0, candidate.projection.range.p50 + refresh.netImpact).toFixed(2),
    );
    const nextP10 = Number(
      Math.max(
        0,
        candidate.projection.range.p10 +
          refresh.adjustments
            .filter((adjustment) => adjustment.label.endsWith("floor"))
            .reduce((sum, adjustment) => sum + adjustment.delta, 0),
      ).toFixed(2),
    );
    const nextP90 = Number(
      Math.max(0, candidate.projection.range.p90 + refresh.netImpact * 0.75).toFixed(2),
    );
    const notes = [...(candidate.signals?.notes ?? [])];

    if (refresh.status !== "steady") {
      notes.unshift(refresh.summary);
    }

    return {
      ...candidate,
      projection: {
        ...candidate.projection,
        range: {
          p10: nextP10,
          p50: nextP50,
          p90: nextP90,
        },
      },
      signals: candidate.signals
        ? {
            ...candidate.signals,
            refresh,
            notes: notes.slice(0, 6),
          }
        : candidate.signals,
    } satisfies DraftCandidate;
  });

  const watchlist = refreshedCandidates
    .map((candidate) => buildWatchlistEntry(candidate))
    .filter((entry): entry is RefreshWatchlistEntry => entry !== null)
    .sort((a, b) => b.freshnessScore - a.freshnessScore)
    .slice(0, 6);

  const digest: RefreshDigest = {
    generatedAt: now.toISOString(),
    sourceCount: new Set(activeSignals.map((signal) => signal.sourceId ?? signal.source)).size,
    appliedSignalCount: activeSignals.length,
    summary:
      activeSignals.length === 0
        ? "No refresh signals were applied, so the board remains anchored to the existing projection stack."
        : `Applied ${activeSignals.length} refresh signals across ${new Set(activeSignals.map((signal) => signal.playerId)).size} players to catch meaningful late-cycle movement without rebuilding the whole board on noise.`,
    watchlist,
  };

  return {
    candidates: refreshedCandidates,
    digest,
  };
}
