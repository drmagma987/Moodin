import { yahooLeagueConfig } from "@/lib/fantasy/scoring";
import { getTank01ProviderStatus } from "@/lib/fantasy/tank01";
import type {
  FaabRangeSnapshot,
  InSeasonCommandCenterDataset,
  InSeasonPlayerSnapshot,
  InSeasonTeamSnapshot,
  OpportunityTrendSnapshot,
  PlayerPosition,
  ProposedTransaction,
  TransactionQueueEntry,
  TradeAnalysisSnapshot,
  TradeIdeaSnapshot,
  TradeOfferTierSnapshot,
  WaiverRecommendationSnapshot,
} from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { buildPdfRosterInSeasonSnapshot, inSeasonRosterSnapshotMeta } from "@/lib/fantasy/inSeasonRosterSnapshot";
import {
  applyCompletedGameEvidence,
  completedGameEvidenceMeta,
  completedGameReviews,
  completedGameTeamEnvironments,
} from "@/lib/fantasy/completedGameEvidence";
import { buildAdvancedMetricSignals } from "@/lib/fantasy/inSeasonAdvancedMetrics";
import { getWeeklyWaiverExpertSignal } from "@/lib/fantasy/weeklyWaiverContext";
import { assessDecisionReadiness, buildPlayerCoverageReport, coverageForDecision, createDecisionGate } from "@/lib/fantasy/playerCoverage";
import { applyCurrentSeasonProjectionUpdates } from "@/lib/fantasy/currentSeasonProjections";

const protectedFoundationNames = new Set<string>(
  leagueSourceOfTruth.keepers.myDeclaredPlayers,
);

const FLEX_ELIGIBLE: PlayerPosition[] = ["RB", "WR", "TE"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(player: InSeasonPlayerSnapshot): PlayerPosition {
  return player.player.positions[0] ?? "WR";
}

function opportunityDelta(player: InSeasonPlayerSnapshot) {
  const position = primaryPosition(player);
  const baseline = player.baselineUsage;
  const recent = player.recentUsage;
  const shareDelta = (recent.snapShare - baseline.snapShare) * 42;
  const routeDelta = (recent.routeParticipation - baseline.routeParticipation) * 30;
  const targetDelta = (recent.targetsPerGame - baseline.targetsPerGame) * (position === "WR" || position === "TE" ? 1.9 : 1.2);
  const carryDelta = (recent.carriesPerGame - baseline.carriesPerGame) * (position === "RB" || position === "QB" ? 1.4 : 0.4);
  const targetShareDelta = (recent.targetShare - baseline.targetShare) * 100 * (position === "WR" || position === "TE" ? 0.9 : 0.45);
  const redZoneDelta = (recent.redZoneTouchesPerGame - baseline.redZoneTouchesPerGame) * 3.6;

  return Number(
    (
      shareDelta +
      routeDelta +
      targetDelta +
      carryDelta +
      targetShareDelta +
      redZoneDelta
    ).toFixed(2),
  );
}

function marketScore(player: InSeasonPlayerSnapshot) {
  if (player.marketTrend === "steady") {
    return 0;
  }

  const magnitude = Math.log10(Math.max(1, player.marketTrendCount) + 1) * 6.2;
  return Number((player.marketTrend === "add" ? magnitude : -magnitude).toFixed(2));
}

function buildOpportunityTrendMap(players: InSeasonPlayerSnapshot[]) {
  return new Map(
    buildOpportunityTrendSnapshots(players).map((trend) => [trend.playerId, trend] as const),
  );
}

export function buildOpportunityTrendSnapshots(
  players: InSeasonPlayerSnapshot[],
): OpportunityTrendSnapshot[] {
  const coverageById = new Map(buildPlayerCoverageReport(players).entries.map((entry) => [entry.playerId, entry]));
  const contingentPlayerIds = new Set(
    players
      .filter((player) => player.opportunityContext?.stability === "contingent")
      .map((player) => player.player.id),
  );
  return players
    .map((player) => {
      const audit = coverageById.get(player.player.id)!;
      const claim = assessDecisionReadiness(player, "usage");
      const coverage = { actionable: !audit.invalid.length && claim.actionable, invalid: audit.invalid, missing: claim.reasons };
      const rawOpportunityScore = opportunityDelta(player);
      const contingentRole = player.opportunityContext?.stability === "contingent";
      // A one-week workload created by another player's absence describes a
      // replacement ceiling, not a durable role change. Retain a small amount
      // of information without allowing the spike to drive ROS value or a buy.
      const opportunityScore = contingentRole && rawOpportunityScore > 0
        ? Number((rawOpportunityScore * 0.2).toFixed(2))
        : rawOpportunityScore;
      const market = marketScore(player);
      const opportunityRising = opportunityScore >= 9;
      const opportunityFalling = opportunityScore <= -8;
      const marketHot = market >= 8;
      const marketCold = market <= -5;
      const pointsDelta = player.recentUsage.fantasyPointsPerGame - player.baselineUsage.fantasyPointsPerGame;
      const rank = player.marketRank ?? null;
      const tier = player.marketTier ?? null;
      const priceContext = tier !== null && tier <= 2 || rank !== null && rank <= 24
        ? "elite" as const
        : tier !== null && tier <= 5 || rank !== null && rank <= 60
          ? "established" as const
          : tier !== null && tier <= 10 || rank !== null && rank <= 180
            ? "mid-market" as const
            : tier !== null || rank !== null
              ? "deep" as const
              : "unknown" as const;
      const meaningfulVolume = player.recentUsage.carriesPerGame + player.recentUsage.targetsPerGame >= 6
        || player.recentUsage.routeParticipation >= 0.45;
      const trueBuyLow = player.availability === "league-rostered"
        && priceContext !== "elite"
        && opportunityRising
        && !contingentRole
        && !marketHot
        && meaningfulVolume
        && (marketCold || pointsDelta <= -1.5 || priceContext === "mid-market" || priceContext === "deep" || priceContext === "unknown");
      const trueSellHigh = (marketHot || pointsDelta >= 4)
        && opportunityScore < 5;

      const classification = trueSellHigh
        ? "sell-high" as const
        : contingentRole && player.availability !== "free-agent"
          ? "watch" as const
          : trueBuyLow
            ? "buy-low" as const
            : player.availability === "free-agent" && opportunityRising && meaningfulVolume
              ? "waiver-rise" as const
              : opportunityFalling || marketCold
                ? "role-warning" as const
                : opportunityRising || priceContext === "elite" && opportunityScore >= 5
                  ? "role-confirmation" as const
                  : "watch" as const;

      const recommendation = classification === "buy-low"
        ? "trade-for" as const
        : classification === "sell-high"
          ? player.availability === "my-roster" ? "shop" as const : "avoid" as const
          : classification === "waiver-rise"
            ? "add" as const
            : classification === "role-confirmation"
              ? player.availability === "my-roster" ? "hold" as const : "watch" as const
              : classification === "role-warning"
                ? player.availability === "my-roster" ? "hold" as const : "avoid" as const
                : "watch" as const;
      const actionability = classification === "buy-low" || classification === "sell-high" || classification === "waiver-rise"
        ? "actionable" as const
        : classification === "role-confirmation"
          ? "context" as const
          : "watch" as const;
      const marketLabel = [rank !== null ? `Consensus #${Math.round(rank)}` : null, tier !== null ? `Tier ${tier}` : null]
        .filter(Boolean)
        .join(" · ") || "No price rank";
      const hasLiveMovement = player.marketTrend !== "steady" && player.marketTrendCount > 0;
      const marketEvidence = hasLiveMovement
        ? `${marketLabel}; Sleeper ${player.marketTrend} activity (${player.marketTrendCount}).`
        : `${marketLabel}; no live add/drop movement is connected, so this is price context—not proof the market missed anything.`;

      const signals: string[] = [];
      if (Math.abs(player.recentUsage.snapShare - player.baselineUsage.snapShare) >= 0.02) {
        signals.push(
          `Snap share ${Math.round(player.baselineUsage.snapShare * 100)}% -> ${Math.round(player.recentUsage.snapShare * 100)}%.`,
        );
      }
      if (Math.abs(player.recentUsage.targetsPerGame - player.baselineUsage.targetsPerGame) >= 0.5) {
        signals.push(
          `Targets/game ${player.baselineUsage.targetsPerGame.toFixed(1)} -> ${player.recentUsage.targetsPerGame.toFixed(1)}.`,
        );
      }
      if (Math.abs(player.recentUsage.carriesPerGame - player.baselineUsage.carriesPerGame) >= 0.8) {
        signals.push(
          `Carries/game ${player.baselineUsage.carriesPerGame.toFixed(1)} -> ${player.recentUsage.carriesPerGame.toFixed(1)}.`,
        );
      }
      if (Math.abs(pointsDelta) >= 1) {
        signals.push(
          `Fantasy points/game ${player.baselineUsage.fantasyPointsPerGame.toFixed(1)} -> ${player.recentUsage.fantasyPointsPerGame.toFixed(1)}.`,
        );
      }
      if (player.currentRole && player.currentRole !== "unknown") {
        signals.push(`Depth-chart context: ${player.currentRole.replaceAll("-", " ")}.`);
      }
      if (player.opportunityContext) {
        signals.unshift(`Role stability: ${player.opportunityContext.reason}`);
      }
      if (player.marketTrend !== "steady") {
        signals.push(
          `Sleeper market ${player.marketTrend} (${player.marketTrendCount} signals).`,
        );
      }
      if (player.liveStats?.gameStatus === "live") {
        signals.push("Tank01-ready live game hook is available for this player profile.");
      }

      const summary = contingentRole
        ? `${player.player.fullName}'s usage spike was created by a teammate absence, so it is replacement-role evidence rather than a durable buy-low signal.`
        : classification === "buy-low"
        ? `${player.player.fullName} has improving opportunity while production or roster activity still points to a discounted price.`
        : classification === "sell-high" && player.availability === "my-roster"
          ? `${player.player.fullName}'s fantasy result or roster buzz is running ahead of the underlying role. Test the trade market; do not force a deal.`
          : classification === "sell-high" && player.availability === "free-agent"
            ? `${player.player.fullName}'s result or waiver buzz is running ahead of the underlying role. Treat this as a chase to avoid, not a reason to spend.`
            : classification === "sell-high"
              ? `${player.player.fullName}'s result or reputation is running ahead of the underlying role. Avoid paying the other manager's likely asking price.`
          : classification === "waiver-rise"
            ? `${player.player.fullName} has enough real volume to make the usage rise actionable on waivers.`
            : classification === "role-confirmation" && priceContext === "elite"
              ? `${player.player.fullName}'s usage confirms an already elite price. This is validation, not a claim that the player is obtainable below value.`
              : classification === "role-confirmation"
                ? `${player.player.fullName} earned a stronger role, but the current evidence does not establish a discounted trade price.`
                : classification === "role-warning"
                  ? `${player.player.fullName} is losing role support or roster momentum. Treat this as a risk flag, not an automatic drop.`
                  : `${player.player.fullName} has an interesting data point, but price, role, and sample do not yet support a trade call.`;

      return {
        playerId: player.player.id,
        classification,
        opportunityScore,
        marketScore: market,
        recommendation: coverage.actionable ? recommendation : "watch",
        actionability: coverage.actionable ? actionability : "watch",
        priceContext,
        marketLabel,
        marketEvidence,
        summary: coverage.actionable ? summary : `${player.player.fullName}: evidence incomplete; watch only. ${[...coverage.invalid, ...coverage.missing].join("; ")}.${player.opportunityContext ? ` ${player.opportunityContext.reason}` : ""}`,
        signals: signals.slice(0, 4),
      } satisfies OpportunityTrendSnapshot;
    })
    .filter((trend) => {
      const player = players.find((entry) => entry.player.id === trend.playerId);
      const buried = player && (player.currentRole === "backup" || trend.priceContext === "deep")
        && player.recentUsage.carriesPerGame + player.recentUsage.targetsPerGame < 6
        && player.recentUsage.routeParticipation < 0.45;
      if (buried && trend.actionability !== "actionable" && trend.classification !== "sell-high") return false;
      if (player?.opportunityContext?.stability === "contingent") return true;
      return trend.classification !== "watch" || Math.abs(trend.opportunityScore) >= 5 || Math.abs(trend.marketScore) >= 5;
    })
    .sort((a, b) => {
      const priority = { actionable: 3, context: 2, watch: 1 } as const;
      return priority[b.actionability] - priority[a.actionability]
        || Number(contingentPlayerIds.has(b.playerId)) - Number(contingentPlayerIds.has(a.playerId))
        || Math.abs(b.opportunityScore) + Math.abs(b.marketScore) - (Math.abs(a.opportunityScore) + Math.abs(a.marketScore));
    })
    .slice(0, 16);
}

function fillStartingLineup(
  team: InSeasonTeamSnapshot,
  playersById: Map<string, InSeasonPlayerSnapshot>,
  options: { includeInjured?: boolean; returnDateOverrides?: Record<string, string> } = {},
) {
  const pool = team.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot =>
      player !== undefined && (options.includeInjured || player.injuryStatus !== "IR"),
    );
  const starters: InSeasonPlayerSnapshot[] = [];
  const used = new Set<string>();

  for (const slot of yahooLeagueConfig.rosterSlots) {
    if (slot === "BN" || slot === "IR" || slot === "K") {
      continue;
    }

    const best =
      slot === "W/R/T"
        ? pool
            .filter((player) => !used.has(player.player.id) && FLEX_ELIGIBLE.includes(primaryPosition(player)))
            .sort((a, b) => tradeValue(b, options.returnDateOverrides).p50 - tradeValue(a, options.returnDateOverrides).p50)[0]
        : pool
            .filter((player) => !used.has(player.player.id) && primaryPosition(player) === slot)
            .sort((a, b) => tradeValue(b, options.returnDateOverrides).p50 - tradeValue(a, options.returnDateOverrides).p50)[0];

    if (best) {
      starters.push(best);
      used.add(best.player.id);
    }
  }

  const starterTotal = Number(
    starters.reduce((sum, player) => sum + tradeValue(player, options.returnDateOverrides).p50, 0).toFixed(2),
  );
  const upsideTotal = Number(
    starters.reduce((sum, player) => sum + tradeValue(player, options.returnDateOverrides).p90, 0).toFixed(2),
  );
  const riskTotal = Number(
    starters.reduce((sum, player) => {
      const value = tradeValue(player, options.returnDateOverrides);
      return sum + (value.p90 - value.p10);
    }, 0).toFixed(2),
  );

  return {
    starters,
    starterTotal,
    upsideTotal,
    riskTotal,
  };
}

function injuryReturnProfile(
  player: InSeasonPlayerSnapshot,
  returnDateOverrides?: Record<string, string>,
) {
  if (player.injuryStatus !== "IR") {
    return { factor: 1, weeksOut: 0, returnDate: null, note: null };
  }
  const returnDate = returnDateOverrides?.[player.player.id] || player.projectedReturnDate || null;
  if (!returnDate) {
    return {
      factor: 0.68,
      weeksOut: null,
      returnDate: null,
      note: `${player.player.fullName}: return date unknown; valued with a conservative four-to-five-week availability estimate.`,
    };
  }
  const returnAt = Date.parse(`${returnDate}T12:00:00Z`);
  const referenceAt = Date.parse(inSeasonRosterSnapshotMeta.capturedAt);
  if (!Number.isFinite(returnAt) || !Number.isFinite(referenceAt)) {
    return {
      factor: 0.68,
      weeksOut: null,
      returnDate: null,
      note: `${player.player.fullName}: return date could not be parsed; conservative availability estimate applied.`,
    };
  }
  const weeksOut = Math.max(0, Math.ceil((returnAt - referenceAt) / (7 * 86_400_000)));
  const remainingFantasyWeeks = Math.max(1, 18 - inSeasonRosterSnapshotMeta.week);
  const factor = Number(clamp((remainingFantasyWeeks - weeksOut) / remainingFantasyWeeks, 0.15, 0.96).toFixed(3));
  return {
    factor,
    weeksOut,
    returnDate,
    note: `${player.player.fullName}: projected return ${returnDate} (${weeksOut === 0 ? "available imminently" : `about ${weeksOut} week${weeksOut === 1 ? "" : "s"} out`}); remaining-season value is availability-adjusted.`,
  };
}

function tradeValue(
  player: InSeasonPlayerSnapshot,
  returnDateOverrides?: Record<string, string>,
) {
  const profile = injuryReturnProfile(player, returnDateOverrides);
  const uncertaintyFactor = player.injuryStatus === "IR" ? 0.94 : 1;
  return {
    p10: player.rosProjection.p10 * profile.factor * uncertaintyFactor,
    p50: player.rosProjection.p50 * profile.factor * uncertaintyFactor,
    p90: player.rosProjection.p90 * profile.factor,
  };
}

function futureValueScore(
  player: InSeasonPlayerSnapshot,
  trend: OpportunityTrendSnapshot | undefined,
) {
  const opportunity = opportunityDelta(player);
  const market = marketScore(player);
  const volatility = player.rosProjection.p90 - player.rosProjection.p10;
  const classificationBoost =
    trend?.classification === "buy-low" || trend?.classification === "waiver-rise"
      ? 10
      : trend?.classification === "role-confirmation"
        ? 5
        : trend?.classification === "role-warning"
          ? -10
          : trend?.classification === "sell-high"
            ? -4
            : 0;

  return Number(
    (
      player.rosProjection.p50 +
      player.weeklyProjection.p50 * 1.8 +
      opportunity * 1.7 +
      market * 0.45 +
      volatility * 0.08 +
      classificationBoost
    ).toFixed(2),
  );
}

function fillFutureValueLineup(
  team: InSeasonTeamSnapshot,
  playersById: Map<string, InSeasonPlayerSnapshot>,
  trendsByPlayerId: Map<string, OpportunityTrendSnapshot>,
) {
  const pool = team.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined && player.injuryStatus !== "IR");
  const starters: InSeasonPlayerSnapshot[] = [];
  const used = new Set<string>();

  for (const slot of yahooLeagueConfig.rosterSlots) {
    if (slot === "BN" || slot === "IR" || slot === "K") {
      continue;
    }

    const best =
      slot === "W/R/T"
        ? pool
            .filter((player) => !used.has(player.player.id) && FLEX_ELIGIBLE.includes(primaryPosition(player)))
            .sort(
              (a, b) =>
                futureValueScore(b, trendsByPlayerId.get(b.player.id)) -
                futureValueScore(a, trendsByPlayerId.get(a.player.id)),
            )[0]
        : pool
            .filter((player) => !used.has(player.player.id) && primaryPosition(player) === slot)
            .sort(
              (a, b) =>
                futureValueScore(b, trendsByPlayerId.get(b.player.id)) -
                futureValueScore(a, trendsByPlayerId.get(a.player.id)),
            )[0];

    if (best) {
      starters.push(best);
      used.add(best.player.id);
    }
  }

  const starterTotal = Number(
    starters
      .reduce(
        (sum, player) => sum + futureValueScore(player, trendsByPlayerId.get(player.player.id)),
        0,
      )
      .toFixed(2),
  );
  const upsideTotal = Number(
    starters.reduce((sum, player) => sum + player.rosProjection.p90, 0).toFixed(2),
  );
  const riskTotal = Number(
    starters.reduce((sum, player) => sum + (player.rosProjection.p90 - player.rosProjection.p10), 0).toFixed(2),
  );

  return {
    starters,
    starterTotal,
    upsideTotal,
    riskTotal,
  };
}

function swapPlayerGroups(ids: string[], removeIds: string[], addIds: string[]) {
  const removed = new Set(removeIds);
  return Array.from(new Set(ids.filter((id) => !removed.has(id)).concat(addIds)));
}

function swapPlayers(ids: string[], removeId: string, addId: string) {
  return swapPlayerGroups(ids, [removeId], [addId]);
}

function pairs<T>(items: T[]) {
  const result: Array<[T, T]> = [];
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      result.push([items[first], items[second]]);
    }
  }
  return result;
}

function positionSignature(group: InSeasonPlayerSnapshot[]) {
  return group.map(primaryPosition).sort().join("+");
}

function packageConstructionSummary(
  send: InSeasonPlayerSnapshot[],
  receive: InSeasonPlayerSnapshot[],
) {
  const positions = Array.from(new Set([...send, ...receive].map(primaryPosition)));
  const deltas = positions.map((position) => ({
    position,
    value:
      receive
        .filter((player) => primaryPosition(player) === position)
        .reduce((sum, player) => sum + player.rosProjection.p50, 0) -
      send
        .filter((player) => primaryPosition(player) === position)
        .reduce((sum, player) => sum + player.rosProjection.p50, 0),
  }));
  const upgrade = [...deltas].sort((a, b) => b.value - a.value)[0];
  const concession = [...deltas].sort((a, b) => a.value - b.value)[0];

  if (upgrade && concession && upgrade.position !== concession.position && upgrade.value > 0 && concession.value < 0) {
    return `Spend ${concession.position} depth to upgrade ${upgrade.position} and rebalance the starting lineup.`;
  }
  return "Repackages depth across positions so both managers solve a different roster need.";
}

function packageQualityGuard(
  send: InSeasonPlayerSnapshot[],
  receive: InSeasonPlayerSnapshot[],
) {
  if (send.length !== 2 || receive.length !== 2 || positionSignature(send) !== positionSignature(receive)) {
    return { passes: true, summary: "No multi-player anchor dilution detected." };
  }
  const rankedPlayers = [...send, ...receive].filter((player) => Number.isFinite(player.marketRank));
  if (rankedPlayers.length !== 4) {
    return { passes: true, summary: "Market-tier coverage is incomplete, so the package is governed by projection and lineup impact only." };
  }

  const legRankDeltas = send.map((sent) => {
    const incoming = receive.find((candidate) => primaryPosition(candidate) === primaryPosition(sent));
    return {
      position: primaryPosition(sent),
      delta: (sent.marketRank ?? 999) - (incoming?.marketRank ?? 999),
    };
  });
  const bestUpgrade = Math.max(0, ...legRankDeltas.map((leg) => leg.delta));
  const largestDowngrade = Math.max(0, ...legRankDeltas.map((leg) => -leg.delta));
  const outgoingAnchor = [...send].sort((a, b) => (a.marketRank ?? 999) - (b.marketRank ?? 999))[0];
  const incomingAnchor = [...receive].sort((a, b) => (a.marketRank ?? 999) - (b.marketRank ?? 999))[0];
  const outgoingEliteTier = outgoingAnchor.marketTier !== null && outgoingAnchor.marketTier !== undefined && outgoingAnchor.marketTier <= 3;
  const equivalentEliteReturns = !outgoingEliteTier || receive.some((player) =>
    player.marketTier !== null && player.marketTier !== undefined && player.marketTier <= (outgoingAnchor.marketTier ?? 3),
  );
  const legBalancePasses = largestDowngrade <= 8 || bestUpgrade >= largestDowngrade * 1.1;
  const packageCeilingDelta =
    receive.reduce((sum, player) => sum + tradeValue(player).p90, 0) -
    send.reduce((sum, player) => sum + tradeValue(player).p90, 0);
  const ceilingPasses = packageCeilingDelta >= -10;
  const passes = equivalentEliteReturns && legBalancePasses && ceilingPasses;
  const summary = !equivalentEliteReturns
    ? `${outgoingAnchor.player.fullName} is an elite-tier anchor, but the return does not include an equally strong market-tier centerpiece.`
    : !legBalancePasses
      ? `The ${legRankDeltas.sort((a, b) => a.delta - b.delta)[0]?.position ?? "primary"} downgrade is larger than the best positional upgrade, so the package relies too heavily on depth aggregation.`
      : !ceilingPasses
        ? "The package gives away too much ceiling even though its median lineup math is competitive."
        : `${incomingAnchor.player.fullName} preserves the package's anchor quality, and the strongest positional upgrade clears the downgrade premium.`;

  return { passes, summary };
}

function buildOfferTiers(
  idea: TradeIdeaSnapshot,
  candidates: TradeIdeaSnapshot[],
): TradeOfferTierSnapshot[] {
  const receiveKey = idea.targetPlayerIds.slice().sort().join("|");
  const uniqueCandidates = Array.from(
    new Map(
      candidates
        .filter((candidate) =>
          candidate.counterpartyTeamId === idea.counterpartyTeamId &&
          candidate.format === idea.format &&
          candidate.targetPlayerIds.slice().sort().join("|") === receiveKey &&
          Math.max(candidate.counterpartyStarterDelta, candidate.counterpartyRestOfSeasonDelta) >= -5 &&
          candidate.restOfSeasonDelta >= -8,
        )
        .map((candidate) => [candidate.givePlayerIds.slice().sort().join("|"), candidate] as const),
    ).values(),
  );
  if (!uniqueCandidates.length) return [];

  const take = (tier: TradeOfferTierSnapshot["tier"], candidate: TradeIdeaSnapshot | undefined) => {
    if (!candidate) return null;
    const summary = tier === "lowball"
      ? "Best opening ask for you; expect the highest rejection or counter risk."
      : tier === "slight-advantage"
        ? "Leaves you a modest value edge while giving the other manager a credible lineup reason."
        : "Closest modeled value match and the cleanest acceptance path.";
    return {
      tier,
      givePlayerIds: candidate.givePlayerIds,
      targetPlayerIds: candidate.targetPlayerIds,
      marketValueDelta: candidate.marketValueDelta,
      immediateStarterDelta: candidate.immediateStarterDelta,
      restOfSeasonDelta: candidate.restOfSeasonDelta,
      counterpartyImmediateDelta: candidate.counterpartyStarterDelta,
      summary,
    } satisfies TradeOfferTierSnapshot;
  };

  const lowball = [...uniqueCandidates]
    .filter((candidate) => candidate.marketValueDelta >= 30 && candidate.marketValueDelta <= 65)
    .sort((a, b) => Math.abs(a.marketValueDelta - 42) - Math.abs(b.marketValueDelta - 42))[0];
  const slight = [...uniqueCandidates]
    .filter((candidate) => candidate.marketValueDelta >= 10 && candidate.marketValueDelta < 30)
    .sort((a, b) => Math.abs(a.marketValueDelta - 18) - Math.abs(b.marketValueDelta - 18))[0];
  const even = [...uniqueCandidates]
    .filter((candidate) => Math.abs(candidate.marketValueDelta) < 10)
    .sort((a, b) => Math.abs(a.marketValueDelta) - Math.abs(b.marketValueDelta))[0];

  return [take("lowball", lowball), take("slight-advantage", slight), take("even", even)]
    .filter((tier): tier is TradeOfferTierSnapshot => Boolean(tier));
}

function evaluateTradeImpact(
  playersById: Map<string, InSeasonPlayerSnapshot>,
  myTeam: InSeasonTeamSnapshot,
  targetTeam: InSeasonTeamSnapshot,
  send: InSeasonPlayerSnapshot[],
  receive: InSeasonPlayerSnapshot[],
  returnDateOverrides?: Record<string, string>,
) {
  const myIdsAfter = swapPlayerGroups(
    myTeam.playerIds,
    send.map((player) => player.player.id),
    receive.map((player) => player.player.id),
  );
  const theirIdsAfter = swapPlayerGroups(
    targetTeam.playerIds,
    receive.map((player) => player.player.id),
    send.map((player) => player.player.id),
  );
  const myNowBefore = fillStartingLineup(myTeam, playersById);
  const myNowAfter = fillStartingLineup({ ...myTeam, playerIds: myIdsAfter }, playersById);
  const theirNowBefore = fillStartingLineup(targetTeam, playersById);
  const theirNowAfter = fillStartingLineup({ ...targetTeam, playerIds: theirIdsAfter }, playersById);
  const futureOptions = { includeInjured: true, returnDateOverrides };
  const myFutureBefore = fillStartingLineup(myTeam, playersById, futureOptions);
  const myFutureAfter = fillStartingLineup({ ...myTeam, playerIds: myIdsAfter }, playersById, futureOptions);
  const theirFutureBefore = fillStartingLineup(targetTeam, playersById, futureOptions);
  const theirFutureAfter = fillStartingLineup({ ...targetTeam, playerIds: theirIdsAfter }, playersById, futureOptions);

  const immediateStarterDelta = Number((myNowAfter.starterTotal - myNowBefore.starterTotal).toFixed(2));
  const restOfSeasonDelta = Number((myFutureAfter.starterTotal - myFutureBefore.starterTotal).toFixed(2));
  const counterpartyImmediateDelta = Number((theirNowAfter.starterTotal - theirNowBefore.starterTotal).toFixed(2));
  const counterpartyRestOfSeasonDelta = Number((theirFutureAfter.starterTotal - theirFutureBefore.starterTotal).toFixed(2));
  const playoffUpsideDelta = Number((myFutureAfter.upsideTotal - myFutureBefore.upsideTotal).toFixed(2));
  const riskDelta = Number((myFutureBefore.riskTotal - myFutureAfter.riskTotal).toFixed(2));
  const marketValueDelta = Number((
    receive.reduce((sum, player) => sum + tradeValue(player, returnDateOverrides).p50, 0) -
    send.reduce((sum, player) => sum + tradeValue(player, returnDateOverrides).p50, 0)
  ).toFixed(2));
  const injuryNotes = [...send, ...receive]
    .map((player) => injuryReturnProfile(player, returnDateOverrides).note)
    .filter((note): note is string => Boolean(note));

  return {
    comparisonPlayerIds: [...new Set([
      ...changedStarterIds(myNowBefore.starters, myNowAfter.starters),
      ...changedStarterIds(theirNowBefore.starters, theirNowAfter.starters),
      ...changedStarterIds(myFutureBefore.starters, myFutureAfter.starters),
      ...changedStarterIds(theirFutureBefore.starters, theirFutureAfter.starters),
    ])],
    immediateStarterDelta,
    restOfSeasonDelta,
    counterpartyImmediateDelta,
    counterpartyRestOfSeasonDelta,
    playoffUpsideDelta,
    riskDelta,
    marketValueDelta,
    injuryNotes,
  };
}

function changedStarterIds(before: InSeasonPlayerSnapshot[], after: InSeasonPlayerSnapshot[]) {
  const beforeIds = new Set(before.map((player) => player.player.id));
  const afterIds = new Set(after.map((player) => player.player.id));
  return [...beforeIds].filter((id) => !afterIds.has(id)).concat([...afterIds].filter((id) => !beforeIds.has(id)));
}

export function analyzeTradeProposal(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
  leagueTeams: InSeasonTeamSnapshot[],
  sendPlayerIds: string[],
  receivePlayerIds: string[],
  returnDateOverrides: Record<string, string> = {},
): TradeAnalysisSnapshot | null {
  if (!sendPlayerIds.length || sendPlayerIds.length !== receivePlayerIds.length) return null;
  const playersById = new Map(players.map((player) => [player.player.id, player] as const));
  const send = sendPlayerIds.map((id) => playersById.get(id)).filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
  const receive = receivePlayerIds.map((id) => playersById.get(id)).filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
  if (send.length !== sendPlayerIds.length || receive.length !== receivePlayerIds.length) return null;
  const counterpartyIds = new Set(receive.map((player) => player.rosterTeamId).filter(Boolean));
  if (counterpartyIds.size !== 1) return null;
  const counterpartyTeamId = [...counterpartyIds][0];
  const targetTeam = leagueTeams.find((team) => team.teamId === counterpartyTeamId);
  if (!targetTeam) return null;

  const impact = evaluateTradeImpact(playersById, myTeam, targetTeam, send, receive, returnDateOverrides);
  const tradedCoverage = coverageForDecision(players, [...sendPlayerIds, ...receivePlayerIds], "trade");
  const replacementCoverage = coverageForDecision(players, impact.comparisonPlayerIds);
  const coverage = { actionable: tradedCoverage.actionable && replacementCoverage.actionable, reasons: [...tradedCoverage.reasons, ...replacementCoverage.reasons] };
  const valuationWarnings = [...new Set([...send, ...receive].flatMap((player) => assessDecisionReadiness(player, "trade").warnings))];
  const quality = packageQualityGuard(send, receive);
  const balance = impact.marketValueDelta >= 10
    ? "advantage-you"
    : impact.marketValueDelta <= -10
      ? "advantage-them"
      : "even";
  const hasIncomingIr = receive.some((player) => player.injuryStatus === "IR");
  const verdict = !quality.passes
    ? "counter"
    : impact.restOfSeasonDelta >= 3 && impact.marketValueDelta >= -8 && impact.immediateStarterDelta >= (hasIncomingIr ? -35 : 0)
      ? "accept"
      : impact.restOfSeasonDelta >= 0 && impact.marketValueDelta >= -16
        ? "consider"
        : impact.counterpartyImmediateDelta > 0 && impact.restOfSeasonDelta > -8
          ? "counter"
          : "decline";
  const rosterFitSummary = !quality.passes
    ? quality.summary
    : hasIncomingIr
    ? impact.restOfSeasonDelta > 0
      ? "This is a patience trade: you give the other manager usable points now and bank the stronger post-return lineup."
      : "The injured-player discount is not large enough to compensate for the points you surrender now."
    : impact.immediateStarterDelta > 0 && impact.counterpartyImmediateDelta > 0
      ? "The proposal addresses different roster weaknesses and improves both active lineups."
      : impact.immediateStarterDelta > 0
        ? "It improves your lineup, but the other manager may need a different piece to justify accepting."
        : "The package does not improve your usable lineup enough at the current price.";

  return {
    verdict: coverage.actionable ? verdict === "accept" && valuationWarnings.length ? "consider" : verdict : "insufficient-data",
    balance,
    immediateStarterDelta: impact.immediateStarterDelta,
    restOfSeasonDelta: impact.restOfSeasonDelta,
    playoffUpsideDelta: impact.playoffUpsideDelta,
    counterpartyImmediateDelta: impact.counterpartyImmediateDelta,
    counterpartyRestOfSeasonDelta: impact.counterpartyRestOfSeasonDelta,
    marketValueDelta: impact.marketValueDelta,
    rosterFitSummary: coverage.actionable ? `${valuationWarnings.length ? `Provisional valuation: ${valuationWarnings.join("; ")}. ` : ""}${rosterFitSummary}` : "Required decision evidence is incomplete. No trade recommendation is approved.",
    qualityWarning: !coverage.actionable ? coverage.reasons.join(" | ") : quality.passes ? null : quality.summary,
    injuryNotes: impact.injuryNotes,
  };
}

export function buildTradeIdeaSnapshots(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
  leagueTeams: InSeasonTeamSnapshot[],
): TradeIdeaSnapshot[] {
  const decisionGate = createDecisionGate(players);
  const playersById = new Map(players.map((player) => [player.player.id, player] as const));
  const myRoster = myTeam.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined);
  const myTradeable = myRoster.filter(
    (player) =>
      !protectedFoundationNames.has(player.player.fullName) &&
      primaryPosition(player) !== "K",
  );
  const myNflTeamCounts = myRoster.reduce((counts, player) => {
    counts.set(player.player.team, (counts.get(player.player.team) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const ideas: TradeIdeaSnapshot[] = [];
  const structuredCandidates: TradeIdeaSnapshot[] = [];

  function evaluate(
    send: InSeasonPlayerSnapshot[],
    receive: InSeasonPlayerSnapshot[],
    targetTeam: InSeasonTeamSnapshot,
  ) {
    if (!decisionGate([...send, ...receive].map((player) => player.player.id), "trade").actionable) return;
    const format = send.length === 2 ? "two-for-two" : "one-for-one";
    const impact = evaluateTradeImpact(playersById, myTeam, targetTeam, send, receive);
    if (!decisionGate(impact.comparisonPlayerIds).actionable) return;
    const quality = packageQualityGuard(send, receive);
    const starterDelta = impact.restOfSeasonDelta;
    const playoffUpsideDelta = impact.playoffUpsideDelta;
    const riskDelta = impact.riskDelta;
    const opponentStarterDelta = impact.counterpartyImmediateDelta;
    const opponentBenefit = Math.max(impact.counterpartyImmediateDelta, impact.counterpartyRestOfSeasonDelta);
    const marketValueGap = impact.marketValueDelta;
    const samePositionOneForOne = format === "one-for-one" && primaryPosition(send[0]) === primaryPosition(receive[0]);
    const correlationRelief = samePositionOneForOne &&
      (myNflTeamCounts.get(send[0].player.team) ?? 0) >= 2 &&
      send[0].player.team !== receive[0].player.team && riskDelta >= 0;
    const meaningfulRiskUpgrade = samePositionOneForOne && riskDelta >= 12 && impact.restOfSeasonDelta >= 1;
    if (samePositionOneForOne && !correlationRelief && !meaningfulRiskUpgrade) return;

    const incomingIr = receive.some((player) => player.injuryStatus === "IR");
    const pursue = quality.passes && (format === "two-for-two"
      ? starterDelta >= 3 && opponentBenefit >= 1 && Math.abs(marketValueGap) <= 30 && impact.immediateStarterDelta >= (incomingIr ? -35 : 0)
      : starterDelta >= 2 && opponentBenefit >= 1 && Math.abs(marketValueGap) <= 18 && impact.immediateStarterDelta >= (incomingIr ? -30 : 0));
    const consider = quality.passes && (format === "two-for-two"
      ? starterDelta >= 1.5 && opponentBenefit >= -0.5 && Math.abs(marketValueGap) <= 22 && impact.immediateStarterDelta >= (incomingIr ? -45 : -2)
      : starterDelta >= 1 && opponentBenefit >= -0.5 && Math.abs(marketValueGap) <= 14 && impact.immediateStarterDelta >= (incomingIr ? -40 : -2));
    const valuationWarnings = [...new Set([...send, ...receive].flatMap((player) => assessDecisionReadiness(player, "trade").warnings))];
    const verdict = pursue ? valuationWarnings.length ? "consider" : "pursue" : consider ? "consider" : "pass";

    const sendNames = send.map((player) => player.player.fullName).join(" + ");
    const receiveNames = receive.map((player) => player.player.fullName).join(" + ");
    const constructionSummary = incomingIr
      ? "Send playable depth to a win-now manager and stash an injured player whose post-return value can strengthen your stretch run."
      : format === "two-for-two"
        ? packageConstructionSummary(send, receive)
      : samePositionOneForOne
        ? correlationRelief
          ? "A rare same-position exception that reduces correlated NFL-team exposure."
          : "A rare same-position exception that materially improves the roster's risk profile."
        : `Moves value from ${primaryPosition(send[0])} into ${primaryPosition(receive[0])} to improve the starting lineup.`;
    const toTransactionPlayer = (player: InSeasonPlayerSnapshot) => ({
      playerId: player.player.id,
      yahooPlayerId: player.player.externalIds.yahoo,
      fullName: player.player.fullName,
      team: player.player.team,
      positions: player.player.positions,
    });

    const candidate = {
      coverage: { actionable: true, reasons: [] },
      targetPlayerId: receive[0].player.id,
      givePlayerId: send[0].player.id,
      targetPlayerIds: receive.map((player) => player.player.id),
      givePlayerIds: send.map((player) => player.player.id),
      format,
      constructionSummary,
      qualitySummary: `${quality.summary}${valuationWarnings.length ? ` Provisional: ${valuationWarnings.join("; ")}.` : ""}`,
      counterpartyTeamId: targetTeam.teamId,
      counterpartyTeamName: targetTeam.name,
      verdict,
      starterDelta,
      playoffUpsideDelta,
      riskDelta,
      counterpartyStarterDelta: opponentStarterDelta,
      immediateStarterDelta: impact.immediateStarterDelta,
      restOfSeasonDelta: impact.restOfSeasonDelta,
      counterpartyRestOfSeasonDelta: impact.counterpartyRestOfSeasonDelta,
      marketValueDelta: impact.marketValueDelta,
      injuryNotes: impact.injuryNotes,
      offerTiers: [],
      summary: verdict === "pursue"
        ? `${constructionSummary} The modeled starter gain is strong enough to actively shop this offer.`
        : `${constructionSummary} Keep the price to this exact structure or use it as a counteroffer.`,
      rationale: [
        `Immediate starter delta: ${impact.immediateStarterDelta >= 0 ? "+" : ""}${impact.immediateStarterDelta.toFixed(1)} points.`,
        `Return-adjusted ROS delta: ${starterDelta >= 0 ? "+" : ""}${starterDelta.toFixed(1)} points.`,
        `Playoff upside delta: ${playoffUpsideDelta >= 0 ? "+" : ""}${playoffUpsideDelta.toFixed(1)}.`,
        `Opponent now/future delta: ${impact.counterpartyImmediateDelta >= 0 ? "+" : ""}${impact.counterpartyImmediateDelta.toFixed(1)} / ${impact.counterpartyRestOfSeasonDelta >= 0 ? "+" : ""}${impact.counterpartyRestOfSeasonDelta.toFixed(1)}.`,
        `Package value gap: ${marketValueGap >= 0 ? "+" : ""}${marketValueGap.toFixed(1)} ROS points.`,
        quality.summary,
      ],
      proposedTransaction: {
        kind: "trade-proposal",
        send: send.map(toTransactionPlayer),
        receive: receive.map(toTransactionPlayer),
        counterpartyTeamId: targetTeam.teamId,
        counterpartyTeamName: targetTeam.name,
        rationale: `Offering ${sendNames} for ${receiveNames} changes your active-lineup value by ${starterDelta >= 0 ? "+" : ""}${starterDelta.toFixed(1)} and theirs by ${opponentStarterDelta >= 0 ? "+" : ""}${opponentStarterDelta.toFixed(1)}.`,
      } satisfies ProposedTransaction,
    } satisfies TradeIdeaSnapshot;
    if (quality.passes) structuredCandidates.push(candidate);
    if (verdict !== "pass") ideas.push(candidate);
  }

  for (const targetTeam of leagueTeams.filter((team) => team.teamId !== myTeam.teamId)) {
    const rankedTargetRoster = targetTeam.playerIds
      .map((playerId) => playersById.get(playerId))
      .filter((player): player is InSeasonPlayerSnapshot => player !== undefined && primaryPosition(player) !== "K")
      .sort((a, b) => tradeValue(b).p50 - tradeValue(a).p50);
    const targetRoster = Array.from(new Map([
      ...rankedTargetRoster.slice(0, 14),
      ...rankedTargetRoster.filter((player) => player.injuryStatus === "IR"),
    ].map((player) => [player.player.id, player] as const)).values());
    const rankedSendPool = [...myTradeable].sort((a, b) => tradeValue(b).p50 - tradeValue(a).p50);
    const sendPool = Array.from(new Map([
      ...rankedSendPool.slice(0, 14),
      ...rankedSendPool.filter((player) => player.injuryStatus === "IR"),
    ].map((player) => [player.player.id, player] as const)).values());

    for (const givePlayer of sendPool) {
      for (const targetPlayer of targetRoster) evaluate([givePlayer], [targetPlayer], targetTeam);
    }
    for (const sendPair of pairs(sendPool)) {
      if (primaryPosition(sendPair[0]) === primaryPosition(sendPair[1])) continue;
      for (const receivePair of pairs(targetRoster)) {
        if (positionSignature(sendPair) !== positionSignature(receivePair)) continue;
        const positionDeltas = sendPair.map((sent) => {
          const received = receivePair.find((candidate) => primaryPosition(candidate) === primaryPosition(sent));
          return (received?.rosProjection.p50 ?? 0) - sent.rosProjection.p50;
        });
        if (!positionDeltas.some((delta) => delta > 0) || !positionDeltas.some((delta) => delta < 0)) continue;
        evaluate(sendPair, receivePair, targetTeam);
      }
    }
  }

  const rankedIdeas = ideas.sort(
      (a, b) =>
        (b.verdict === "pursue" ? 2 : b.verdict === "consider" ? 1 : 0) -
          (a.verdict === "pursue" ? 2 : a.verdict === "consider" ? 1 : 0) ||
        (b.format === "two-for-two" ? 1 : 0) - (a.format === "two-for-two" ? 1 : 0) ||
        b.counterpartyStarterDelta - a.counterpartyStarterDelta ||
        b.starterDelta - a.starterDelta,
    );
  const selected: TradeIdeaSnapshot[] = [];
  const ideasPerTeam = new Map<string, number>();
  const seenReceivePackages = new Set<string>();
  for (const idea of rankedIdeas) {
    if ((ideasPerTeam.get(idea.counterpartyTeamId) ?? 0) >= 2) continue;
    const receiveKey = idea.targetPlayerIds.slice().sort().join("|");
    if (seenReceivePackages.has(receiveKey)) continue;
    selected.push(idea);
    seenReceivePackages.add(receiveKey);
    ideasPerTeam.set(idea.counterpartyTeamId, (ideasPerTeam.get(idea.counterpartyTeamId) ?? 0) + 1);
    if (selected.length === 8) break;
  }
  return selected.map((idea) => ({
    ...idea,
    offerTiers: buildOfferTiers(idea, structuredCandidates),
  }));
}

function buildFaabRange(
  player: InSeasonPlayerSnapshot,
  trend: OpportunityTrendSnapshot | undefined,
  starterDelta: number,
  verifiedRoleBreakout = false,
): FaabRangeSnapshot | null {
  const position = primaryPosition(player);
  const basePercent =
    position === "RB" ? 6 : position === "WR" ? 5 : position === "TE" ? 4 : position === "QB" ? 3 : 1;
  const classificationBoost =
    trend?.classification === "waiver-rise"
      ? 5
      : trend?.classification === "role-confirmation"
        ? 2
          : 0;
  const deltaBoost = clamp(starterDelta / 3, 0, 8);
  const percentLow = Math.round(clamp(basePercent + classificationBoost + deltaBoost + (verifiedRoleBreakout ? 8 : 0), 1, 35));
  const percentHigh = Math.round(clamp(percentLow + (classificationBoost >= 5 ? 6 : 4), percentLow, 45));
  const faabBudget = yahooLeagueConfig.faabBudget;

  return {
    percentLow,
    percentHigh,
    bidLow: faabBudget === null ? null : Math.max(1, Math.round((faabBudget * percentLow) / 100)),
    bidHigh: faabBudget === null ? null : Math.max(1, Math.round((faabBudget * percentHigh) / 100)),
    label: faabBudget === null ? `${percentLow}-${percentHigh}% of budget` : `$${Math.max(1, Math.round((faabBudget * percentLow) / 100))}-$${Math.max(1, Math.round((faabBudget * percentHigh) / 100))}`,
  };
}

export function buildWaiverRecommendationSnapshots(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
): WaiverRecommendationSnapshot[] {
  const playersById = new Map(players.map((player) => [player.player.id, player] as const));
  const trendsByPlayerId = buildOpportunityTrendMap(players);
  const freeAgents = players.filter((player) => player.availability === "free-agent" && primaryPosition(player) !== "K");
  const dropCandidates = myTeam.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
    .filter((player) => !protectedFoundationNames.has(player.player.fullName) && player.injuryStatus !== "IR" && primaryPosition(player) !== "K");
  const baseline = fillFutureValueLineup(myTeam, playersById, trendsByPlayerId);

  return freeAgents
    .map((addPlayer) => {
      const addTrend = trendsByPlayerId.get(addPlayer.player.id);
      const expertSignal = getWeeklyWaiverExpertSignal(addPlayer.player.fullName);
      const expertSourceCount = Number(Boolean(expertSignal?.rotoballer)) + Number(Boolean(expertSignal?.fantasyPros));
      const observedCarries = addPlayer.recentUsage.games > 0
        ? (addPlayer.recentUsage.carriesPerGame - addPlayer.baselineUsage.carriesPerGame * (1 - completedGameEvidenceMeta.evidenceWeight)) /
          completedGameEvidenceMeta.evidenceWeight
        : 0;
      const observedSnapShare = addPlayer.recentUsage.games > 0
        ? (addPlayer.recentUsage.snapShare - addPlayer.baselineUsage.snapShare * (1 - completedGameEvidenceMeta.evidenceWeight)) /
          completedGameEvidenceMeta.evidenceWeight
        : 0;
      const verifiedRoleBreakout = primaryPosition(addPlayer) === "RB" &&
        addPlayer.advancedUsage?.statuses.routes === "verified" &&
        observedCarries >= 12 &&
        observedSnapShare >= 0.35;
      const bestSwap = dropCandidates
        .map((dropPlayer) => {
          const after = fillFutureValueLineup(
            {
              ...myTeam,
              playerIds: swapPlayers(myTeam.playerIds, dropPlayer.player.id, addPlayer.player.id),
            },
            playersById,
            trendsByPlayerId,
          );
          const starterDelta = Number((after.starterTotal - baseline.starterTotal).toFixed(2));
          const weeklyDelta = Number(
            (addPlayer.weeklyProjection.p50 - dropPlayer.weeklyProjection.p50).toFixed(2),
          );
          const playoffUpsideDelta = Number(
            (after.upsideTotal - baseline.upsideTotal).toFixed(2),
          );
          const riskDelta = Number((baseline.riskTotal - after.riskTotal).toFixed(2));
          const score = Number(
            (
              starterDelta * 1.25 +
              weeklyDelta * 0.9 +
              playoffUpsideDelta * 0.12 +
              riskDelta * 0.08 +
              (addTrend?.classification === "waiver-rise"
                ? 4
                : addTrend?.classification === "role-confirmation"
                  ? 2
                  : 0) +
              (verifiedRoleBreakout ? 10 : 0)
            ).toFixed(2),
          );

          return {
            comparisonPlayerIds: changedStarterIds(baseline.starters, after.starters),
            dropPlayer,
            starterDelta,
            weeklyDelta,
            playoffUpsideDelta,
            riskDelta,
            score,
          };
        })
        .sort((a, b) => b.score - a.score)[0];

      const starterDelta = bestSwap?.starterDelta ?? 0;
      const weeklyDelta = bestSwap?.weeklyDelta ?? 0;
      const playoffUpsideDelta = bestSwap?.playoffUpsideDelta ?? 0;
      const riskDelta = bestSwap?.riskDelta ?? 0;
      const advanced = addPlayer.advancedUsage;
      const efficiencySignal = Boolean(
        advanced && (
          (assessDecisionReadiness(addPlayer, "receiving-efficiency").actionable && advanced.routes !== null && advanced.routes >= 12 && ((advanced.targetsPerRouteRun ?? 0) >= 0.2 || (advanced.yardsPerRouteRun ?? 0) >= 2)) ||
          (assessDecisionReadiness(addPlayer, "rushing-efficiency").actionable && (advanced.rushingYardsOverExpectedPerAttempt ?? -99) >= 0.4)
        ),
      );
      const externalBoost = expertSourceCount * 4 + (expertSignal?.fantasyPros?.rank === 1 ? 3 : 0);
      const edgeScore = Number((bestSwap?.score ?? 0) + externalBoost + (efficiencySignal ? 4 : 0));
      const rawVerdict =
        verifiedRoleBreakout || starterDelta >= 8 || (starterDelta >= 4 && addTrend?.classification === "waiver-rise")
          ? "priority"
          : starterDelta >= 2 || expertSourceCount >= 2 ||
              playoffUpsideDelta >= 8 ||
              addTrend?.recommendation === "add"
            ? "bid"
            : expertSourceCount >= 1 || efficiencySignal || addTrend && addTrend.classification !== "watch"
              ? "watch"
              : "pass";
      const injuryCase = !verifiedRoleBreakout && addTrend?.classification !== "waiver-rise" && (addPlayer.opportunityContext?.stability === "contingent" || /injury|\bis out\b|return/i.test(`${expertSignal?.opportunity ?? ""} ${expertSignal?.primaryRisk ?? ""}`));
      const purpose = addPlayer.injuryOpportunity || injuryCase ? "injury-opportunity" : "usage";
      const claim = assessDecisionReadiness(addPlayer, purpose);
      const rosterCoverage = coverageForDecision(players, [addPlayer.player.id, ...(bestSwap ? [bestSwap.dropPlayer.player.id, ...bestSwap.comparisonPlayerIds] : [])]);
      const coverage = { actionable: rosterCoverage.actionable && claim.actionable,
        reasons: [...rosterCoverage.reasons, ...claim.reasons] };
      const verdict = coverage.actionable ? rawVerdict === "priority" && addPlayer.projectionBasis === "preseason-prior" ? "bid" : rawVerdict : rawVerdict === "pass" ? "pass" : "watch";
      const faabRange = !coverage.actionable || verdict === "pass" ? null : buildFaabRange(addPlayer, addTrend, starterDelta, verifiedRoleBreakout);
      const dropPlayer = bestSwap?.dropPlayer ?? null;
      const opportunityType = verifiedRoleBreakout || addTrend?.classification === "waiver-rise"
        ? "usage-breakout" as const
        : purpose === "injury-opportunity"
          ? "injury-created" as const
          : efficiencySignal
            ? "efficiency-signal" as const
            : starterDelta >= 2
              ? "roster-upgrade" as const
              : "speculative" as const;
      const confidence = (expertSourceCount >= 2 && (verifiedRoleBreakout || starterDelta >= 2))
        ? "high" as const
        : expertSourceCount >= 2 || verifiedRoleBreakout || (expertSourceCount >= 1 && efficiencySignal)
          ? "medium" as const
          : "low" as const;
      const opportunityCase = expertSignal?.opportunity
        ?? (verifiedRoleBreakout
          ? `${Math.round(observedCarries)} carries on ${Math.round(observedSnapShare * 100)}% of snaps is a verified role change worth acting on.`
          : addTrend?.summary ?? `${addPlayer.player.fullName} only clears as a roster-value bet against your current bench.`);
      const primaryRisk = expertSignal?.primaryRisk
        ?? (addPlayer.opportunityContext?.reason
          ? addPlayer.opportunityContext.reason
          : efficiencySignal
            ? "The efficiency signal is useful, but the one-week route and touch sample can still reverse quickly."
            : "The model does not yet have a strong independent usage or efficiency confirmation.");

      return {
        coverage,
        addPlayerId: addPlayer.player.id,
        dropPlayerId: coverage.actionable ? dropPlayer?.player.id ?? null : null,
        verdict,
        starterDelta,
        weeklyDelta,
        playoffUpsideDelta,
        riskDelta,
        faabRange,
        edgeScore,
        confidence: coverage.actionable && !claim.warnings.length && addPlayer.projectionBasis !== "preseason-prior" ? confidence : "low",
        opportunityType,
        expertSupport: {
          sourceCount: expertSourceCount,
          rotoballerFaab: expertSignal?.rotoballer?.standard ?? null,
          fantasyProsRank: expertSignal?.fantasyPros?.rank ?? null,
          fantasyProsRange: expertSignal?.fantasyPros ? `#${expertSignal.fantasyPros.rank} (${expertSignal.fantasyPros.rankLow}-${expertSignal.fantasyPros.rankHigh})` : null,
        },
        opportunityCase: coverage.actionable ? opportunityCase : `Research candidate only. ${opportunityCase}`,
        primaryRisk: coverage.actionable ? `${primaryRisk}${claim.warnings.length ? ` Valuation caveats: ${claim.warnings.join("; ")}.` : ""}` : `Decision gate: ${coverage.reasons.slice(0, 3).join("; ")}. Review Player coverage in League Sync before acting.`,
        summary:
          !coverage.actionable ? `${addPlayer.player.fullName}: watch only; required player evidence is incomplete. No bid or cut is approved.` : verdict === "priority"
            ? verifiedRoleBreakout
              ? `${addPlayer.player.fullName} is the cleanest immediate add after earning ${Math.round(observedCarries)} carries on ${Math.round(observedSnapShare * 100)}% of snaps; cut ${dropPlayer?.player.fullName ?? "a fringe roster spot"}.`
              : `${addPlayer.player.fullName} is the cleanest immediate add if you can cut ${dropPlayer?.player.fullName ?? "a fringe roster spot"}.`
            : verdict === "bid"
              ? `${addPlayer.player.fullName} is worth a measured waiver bid if the roster churn point is ${dropPlayer?.player.fullName ?? "your weakest bench slot"}.`
              : verdict === "watch"
                ? `${addPlayer.player.fullName} is not a mandatory click yet, but the usage trend is strong enough to keep live.`
                : `${addPlayer.player.fullName} does not beat your current bench math enough to force a move right now.`,
        rationale: [
          ...claim.warnings,
          ...(expertSignal?.rotoballer ? [`RotoBaller baseline: ${expertSignal.rotoballer.standard} standard; ${expertSignal.rotoballer.aggressive} aggressive.`] : []),
          ...(expertSignal?.fantasyPros ? [`FantasyPros Week 2 PPR consensus: #${expertSignal.fantasyPros.rank} (expert range ${expertSignal.fantasyPros.rankLow}-${expertSignal.fantasyPros.rankHigh}).`] : []),
          ...(verifiedRoleBreakout ? [`Verified role breakout: ${Math.round(observedCarries)} carries on ${Math.round(observedSnapShare * 100)}% of offensive snaps.`] : []),
          `Trend-adjusted starter delta: ${starterDelta >= 0 ? "+" : ""}${starterDelta.toFixed(1)}.`,
          `Weekly median delta versus ${dropPlayer?.player.fullName ?? "best drop"}: ${weeklyDelta >= 0 ? "+" : ""}${weeklyDelta.toFixed(1)}.`,
          `Playoff upside delta: ${playoffUpsideDelta >= 0 ? "+" : ""}${playoffUpsideDelta.toFixed(1)}.`,
        ],
        proposedTransaction: {
          kind: "add-drop",
          add: coverage.actionable ? [
            {
              playerId: addPlayer.player.id,
              yahooPlayerId: addPlayer.player.externalIds.yahoo,
              fullName: addPlayer.player.fullName,
              team: addPlayer.player.team,
              positions: addPlayer.player.positions,
            },
          ] : [],
          drop:
            !coverage.actionable || dropPlayer === null
              ? []
              : [
                  {
                    playerId: dropPlayer.player.id,
                    yahooPlayerId: dropPlayer.player.externalIds.yahoo,
                    fullName: dropPlayer.player.fullName,
                    team: dropPlayer.player.team,
                    positions: dropPlayer.player.positions,
                  },
                ],
          rationale: `${addPlayer.player.fullName} over ${dropPlayer?.player.fullName ?? "a fringe bench slot"} is the current provider-neutral add/drop recommendation.`,
        } satisfies ProposedTransaction,
      } satisfies WaiverRecommendationSnapshot;
    })
    .sort(
      (a, b) =>
        (b.verdict === "priority" ? 3 : b.verdict === "bid" ? 2 : b.verdict === "watch" ? 1 : 0) -
          (a.verdict === "priority" ? 3 : a.verdict === "bid" ? 2 : a.verdict === "watch" ? 1 : 0) ||
        b.starterDelta - a.starterDelta ||
        b.edgeScore - a.edgeScore,
    )
    .slice(0, 16);
}

export function buildTransactionQueue(
  waiverRecommendations: WaiverRecommendationSnapshot[],
  tradeIdeas: TradeIdeaSnapshot[],
): TransactionQueueEntry[] {
  const waiverEntries = waiverRecommendations
    .filter((idea) => (idea.verdict === "priority" || idea.verdict === "bid") && idea.coverage?.actionable === true)
    .map((idea) => ({
      id: `waiver-${idea.addPlayerId}-${idea.dropPlayerId ?? "none"}`,
      kind: "waiver",
      priority:
        idea.verdict === "priority"
          ? "immediate"
          : idea.verdict === "bid"
            ? "this-week"
            : "monitor",
      title:
        idea.dropPlayerId === null
          ? `Add ${idea.addPlayerId}`
          : `Add ${idea.addPlayerId}, drop ${idea.dropPlayerId}`,
      summary: idea.summary,
      proposedTransaction: idea.proposedTransaction,
      faabRange: idea.faabRange,
    } satisfies TransactionQueueEntry));
  const tradeEntries = tradeIdeas
    .filter((idea) => idea.verdict !== "pass" && idea.coverage?.actionable === true)
    .map((idea) => ({
      id: `trade-${idea.givePlayerIds.join("-")}-${idea.targetPlayerIds.join("-")}`,
      kind: "trade",
      priority: idea.verdict === "pursue" ? "this-week" : "monitor",
      title: `Offer ${idea.givePlayerIds.join(" + ")} for ${idea.targetPlayerIds.join(" + ")}`,
      summary: idea.summary,
      proposedTransaction: idea.proposedTransaction,
      faabRange: null,
    } satisfies TransactionQueueEntry));

  return [...waiverEntries, ...tradeEntries]
    .sort(
      (a, b) =>
        (b.priority === "immediate" ? 3 : b.priority === "this-week" ? 2 : 1) -
          (a.priority === "immediate" ? 3 : a.priority === "this-week" ? 2 : 1) ||
        a.kind.localeCompare(b.kind),
    )
    .slice(0, 5);
}

export function getInSeasonCommandCenterDataset(): InSeasonCommandCenterDataset {
  const rosterSnapshot = buildPdfRosterInSeasonSnapshot();
  const completedEvidence = applyCompletedGameEvidence(rosterSnapshot.players);
  const players = applyCurrentSeasonProjectionUpdates(completedEvidence.players, {
    week: completedGameEvidenceMeta.week,
    capturedAt: completedGameEvidenceMeta.capturedAt,
    observationWeight: completedGameEvidenceMeta.evidenceWeight,
  });
  const opportunityTrends = buildOpportunityTrendSnapshots(players);
  const tradeIdeas = buildTradeIdeaSnapshots(
    players,
    rosterSnapshot.myTeam,
    rosterSnapshot.teams,
  );
  const waiverRecommendations = buildWaiverRecommendationSnapshots(
    players,
    rosterSnapshot.myTeam,
  );
  const teamNamesById = new Map(rosterSnapshot.teams.map((team) => [team.teamId, team.name] as const));
  const advancedMetricSignals = buildAdvancedMetricSignals(players, teamNamesById);

  return {
    players,
    myTeam: rosterSnapshot.myTeam,
    leagueTeams: rosterSnapshot.teams,
    opportunityTrends,
    tradeIdeas,
    waiverRecommendations,
    actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
    tank01Status: getTank01ProviderStatus(),
    evidenceStatus: {
      week: completedGameEvidenceMeta.week,
      completedGames: completedGameEvidenceMeta.completedGames,
      scheduledGames: completedGameEvidenceMeta.scheduledGames,
      capturedAt: completedGameEvidenceMeta.capturedAt,
      latestGame: completedGameEvidenceMeta.latestGame,
      evidenceWeight: completedGameEvidenceMeta.evidenceWeight,
      matchedPlayers: completedEvidence.matchedPlayers,
      sources: completedGameEvidenceMeta.sources.map((source) => ({ ...source })),
    },
    completedGameReviews,
    advancedMetricSignals,
    teamOffenseEnvironments: completedGameTeamEnvironments.map((environment) => ({
      ...environment,
      quarterbacks: environment.quarterbacks.map((quarterback) => ({ ...quarterback })),
    })),
    rosterSnapshot: {
      source: inSeasonRosterSnapshotMeta.source,
      capturedAt: inSeasonRosterSnapshotMeta.capturedAt,
      persistence: "device-local",
    },
    scenarioNotes: [
      `League ownership comes from the ${inSeasonRosterSnapshotMeta.source} captured ${inSeasonRosterSnapshotMeta.capturedAt}.`,
      `${rosterSnapshot.unmatchedRosterPlayers.length} roster entries could not be matched to the current modeled player board.`,
      `Week 1 analysis is active after ${completedGameEvidenceMeta.latestGame}; ${completedEvidence.matchedPlayers} modeled players received verified game evidence. Box scores update carries, targets, target share, and scoring while snap and route feeds remain pending.`,
      `Early Week 1 evidence is blended at ${Math.round(completedGameEvidenceMeta.evidenceWeight * 100)}% so role signals can surface without treating one-week observations as stable season-long rates.`,
      "Tank01 is treated as an experimental live-state provider seam, not a core dependency, until live value is proven.",
      "Trade ideas are evaluated by starter-range and playoff-upside impact, not generic name value.",
      "Waiver recommendations lean on trend-adjusted future value so quiet usage breakouts can outrank stale median projections before the market fully catches up.",
    ],
  };
}
