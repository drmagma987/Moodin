import { yahooLeagueConfig } from "@/lib/fantasy/scoring";
import { inSeasonFixtureLeagueTeams, inSeasonFixtureMyTeam, inSeasonFixturePlayers } from "@/lib/fantasy/inSeasonFixtures";
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
  TradeIdeaSnapshot,
  WaiverRecommendationSnapshot,
} from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

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
  return players
    .map((player) => {
      const opportunityScore = opportunityDelta(player);
      const market = marketScore(player);
      const opportunityRising = opportunityScore >= 9;
      const opportunityFalling = opportunityScore <= -8;
      const marketHot = market >= 8;
      const marketCold = market <= -5;

      const classification =
        opportunityRising && !marketHot
          ? "early-edge"
          : opportunityRising && marketHot
            ? "market-awakening"
            : !opportunityRising && marketHot
              ? "hype-without-usage"
              : opportunityFalling || marketCold
                ? "role-collapse"
                : "steady";

      const recommendation =
        classification === "early-edge"
          ? player.availability === "free-agent"
            ? "add"
            : player.availability === "my-roster"
              ? "hold"
              : "trade-for"
          : classification === "market-awakening"
            ? player.availability === "free-agent"
              ? "add"
              : player.availability === "my-roster"
                ? "hold"
                : "trade-for"
            : classification === "hype-without-usage"
              ? "avoid"
              : classification === "role-collapse"
                ? player.availability === "my-roster"
                  ? "hold"
                  : "avoid"
                : "watch";

      const signals: string[] = [];
      if (player.recentUsage.snapShare > player.baselineUsage.snapShare) {
        signals.push(
          `Snap share ${Math.round(player.baselineUsage.snapShare * 100)}% -> ${Math.round(player.recentUsage.snapShare * 100)}%.`,
        );
      }
      if (player.recentUsage.targetsPerGame > player.baselineUsage.targetsPerGame) {
        signals.push(
          `Targets/game ${player.baselineUsage.targetsPerGame.toFixed(1)} -> ${player.recentUsage.targetsPerGame.toFixed(1)}.`,
        );
      }
      if (player.recentUsage.carriesPerGame > player.baselineUsage.carriesPerGame) {
        signals.push(
          `Carries/game ${player.baselineUsage.carriesPerGame.toFixed(1)} -> ${player.recentUsage.carriesPerGame.toFixed(1)}.`,
        );
      }
      if (player.marketTrend !== "steady") {
        signals.push(
          `Sleeper market ${player.marketTrend} (${player.marketTrendCount} signals).`,
        );
      }
      if (player.liveStats?.gameStatus === "live") {
        signals.push("Tank01-ready live game hook is available for this player profile.");
      }

      const summary =
        classification === "early-edge"
          ? `${player.player.fullName} is gaining real opportunity before the market has fully reacted.`
          : classification === "market-awakening"
            ? `${player.player.fullName} has both usage momentum and market attention, so the edge is getting louder.`
            : classification === "hype-without-usage"
              ? `${player.player.fullName} is getting attention without enough usage evidence yet.`
              : classification === "role-collapse"
                ? `${player.player.fullName} is losing enough role support that the floor is getting shakier.`
                : `${player.player.fullName} looks stable enough that there is no urgent in-season action.`;

      return {
        playerId: player.player.id,
        classification,
        opportunityScore,
        marketScore: market,
        recommendation,
        summary,
        signals: signals.slice(0, 4),
      } satisfies OpportunityTrendSnapshot;
    })
    .sort((a, b) => Math.abs(b.opportunityScore) + Math.abs(b.marketScore) - (Math.abs(a.opportunityScore) + Math.abs(a.marketScore)))
    .slice(0, 6);
}

function fillStartingLineup(
  team: InSeasonTeamSnapshot,
  playersById: Map<string, InSeasonPlayerSnapshot>,
) {
  const pool = team.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined);
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
            .sort((a, b) => b.rosProjection.p50 - a.rosProjection.p50)[0]
        : pool
            .filter((player) => !used.has(player.player.id) && primaryPosition(player) === slot)
            .sort((a, b) => b.rosProjection.p50 - a.rosProjection.p50)[0];

    if (best) {
      starters.push(best);
      used.add(best.player.id);
    }
  }

  const starterTotal = Number(
    starters.reduce((sum, player) => sum + player.rosProjection.p50, 0).toFixed(2),
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

function futureValueScore(
  player: InSeasonPlayerSnapshot,
  trend: OpportunityTrendSnapshot | undefined,
) {
  const opportunity = opportunityDelta(player);
  const market = marketScore(player);
  const volatility = player.rosProjection.p90 - player.rosProjection.p10;
  const classificationBoost =
    trend?.classification === "early-edge"
      ? 10
      : trend?.classification === "market-awakening"
        ? 7
        : trend?.classification === "role-collapse"
          ? -10
          : trend?.classification === "hype-without-usage"
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
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined);
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

function swapPlayers(ids: string[], removeId: string, addId: string) {
  return Array.from(new Set(ids.filter((id) => id !== removeId).concat(addId)));
}

export function buildTradeIdeaSnapshots(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
  leagueTeams: InSeasonTeamSnapshot[],
): TradeIdeaSnapshot[] {
  const playersById = new Map(players.map((player) => [player.player.id, player] as const));
  const myRoster = myTeam.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined);
  const myTradeable = myRoster.filter(
    (player) => !protectedFoundationNames.has(player.player.fullName),
  );
  const targets = players.filter((player) => player.availability === "trade-target");
  const baseline = fillStartingLineup(myTeam, playersById);

  return myTradeable
    .flatMap((givePlayer) =>
      targets.flatMap((targetPlayer) => {
        const targetTeam = leagueTeams.find((team) => team.teamId === targetPlayer.rosterTeamId);
        if (!targetTeam) {
          return [];
        }

        const myAfter = fillStartingLineup(
          {
            ...myTeam,
            playerIds: swapPlayers(myTeam.playerIds, givePlayer.player.id, targetPlayer.player.id),
          },
          playersById,
        );
        const otherBefore = fillStartingLineup(targetTeam, playersById);
        const otherAfter = fillStartingLineup(
          {
            ...targetTeam,
            playerIds: swapPlayers(targetTeam.playerIds, targetPlayer.player.id, givePlayer.player.id),
          },
          playersById,
        );

        const starterDelta = Number((myAfter.starterTotal - baseline.starterTotal).toFixed(2));
        const playoffUpsideDelta = Number((myAfter.upsideTotal - baseline.upsideTotal).toFixed(2));
        const riskDelta = Number((baseline.riskTotal - myAfter.riskTotal).toFixed(2));
        const opponentStarterDelta = Number((otherAfter.starterTotal - otherBefore.starterTotal).toFixed(2));
        const verdict =
          starterDelta >= 4 || (starterDelta >= 1.5 && playoffUpsideDelta >= 8 && opponentStarterDelta <= 3)
            ? "pursue"
            : starterDelta >= 0.5 || playoffUpsideDelta >= 4
              ? "consider"
              : "pass";

        return [{
          targetPlayerId: targetPlayer.player.id,
          givePlayerId: givePlayer.player.id,
          counterpartyTeamId: targetTeam.teamId,
          counterpartyTeamName: targetTeam.name,
          verdict,
          starterDelta,
          playoffUpsideDelta,
          riskDelta,
          summary:
            verdict === "pursue"
              ? `Trading ${givePlayer.player.fullName} for ${targetPlayer.player.fullName} materially improves your usable starter range.`
              : verdict === "consider"
                ? `${targetPlayer.player.fullName} is a plausible buy if the price stays around ${givePlayer.player.fullName}.`
                : `${targetPlayer.player.fullName} does not improve your actual lineup enough for ${givePlayer.player.fullName}.`,
          rationale: [
            `Starter delta: ${starterDelta >= 0 ? "+" : ""}${starterDelta.toFixed(1)} ROS points.`,
            `Playoff upside delta: ${playoffUpsideDelta >= 0 ? "+" : ""}${playoffUpsideDelta.toFixed(1)}.`,
            `Opponent starter delta: ${opponentStarterDelta >= 0 ? "+" : ""}${opponentStarterDelta.toFixed(1)}.`,
          ],
          proposedTransaction: {
            kind: "trade-proposal",
            send: [
              {
                playerId: givePlayer.player.id,
                yahooPlayerId: givePlayer.player.externalIds.yahoo,
                fullName: givePlayer.player.fullName,
                team: givePlayer.player.team,
                positions: givePlayer.player.positions,
              },
            ],
            receive: [
              {
                playerId: targetPlayer.player.id,
                yahooPlayerId: targetPlayer.player.externalIds.yahoo,
                fullName: targetPlayer.player.fullName,
                team: targetPlayer.player.team,
                positions: targetPlayer.player.positions,
              },
            ],
            counterpartyTeamId: targetTeam.teamId,
            counterpartyTeamName: targetTeam.name,
            rationale: `Targeting ${targetPlayer.player.fullName} for ${givePlayer.player.fullName} improves the active lineup by ${starterDelta >= 0 ? "+" : ""}${starterDelta.toFixed(1)} starter points.`,
          } satisfies ProposedTransaction,
        } satisfies TradeIdeaSnapshot];
      }),
    )
    .sort(
      (a, b) =>
        (b.verdict === "pursue" ? 2 : b.verdict === "consider" ? 1 : 0) -
          (a.verdict === "pursue" ? 2 : a.verdict === "consider" ? 1 : 0) ||
        b.starterDelta - a.starterDelta,
    )
    .slice(0, 5);
}

function buildFaabRange(
  player: InSeasonPlayerSnapshot,
  trend: OpportunityTrendSnapshot | undefined,
  starterDelta: number,
): FaabRangeSnapshot | null {
  const position = primaryPosition(player);
  const basePercent =
    position === "RB" ? 6 : position === "WR" ? 5 : position === "TE" ? 4 : position === "QB" ? 3 : 1;
  const classificationBoost =
    trend?.classification === "early-edge"
      ? 5
      : trend?.classification === "market-awakening"
        ? 7
        : trend?.classification === "hype-without-usage"
          ? 1
          : 0;
  const deltaBoost = clamp(starterDelta / 3, 0, 8);
  const percentLow = Math.round(clamp(basePercent + classificationBoost + deltaBoost, 1, 35));
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
  const freeAgents = players.filter((player) => player.availability === "free-agent");
  const dropCandidates = myTeam.playerIds
    .map((playerId) => playersById.get(playerId))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
    .filter((player) => !protectedFoundationNames.has(player.player.fullName));
  const baseline = fillFutureValueLineup(myTeam, playersById, trendsByPlayerId);

  return freeAgents
    .map((addPlayer) => {
      const addTrend = trendsByPlayerId.get(addPlayer.player.id);
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
              (addTrend?.classification === "early-edge"
                ? 4
                : addTrend?.classification === "market-awakening"
                  ? 3
                  : 0)
            ).toFixed(2),
          );

          return {
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
      const verdict =
        starterDelta >= 8 || (starterDelta >= 4 && addTrend?.classification === "early-edge")
          ? "priority"
          : starterDelta >= 2 ||
              playoffUpsideDelta >= 8 ||
              addTrend?.recommendation === "add"
            ? "bid"
            : addTrend && addTrend.classification !== "steady"
              ? "watch"
              : "pass";
      const faabRange = verdict === "pass" ? null : buildFaabRange(addPlayer, addTrend, starterDelta);
      const dropPlayer = bestSwap?.dropPlayer ?? null;

      return {
        addPlayerId: addPlayer.player.id,
        dropPlayerId: dropPlayer?.player.id ?? null,
        verdict,
        starterDelta,
        weeklyDelta,
        playoffUpsideDelta,
        riskDelta,
        faabRange,
        summary:
          verdict === "priority"
            ? `${addPlayer.player.fullName} is the cleanest immediate add if you can cut ${dropPlayer?.player.fullName ?? "a fringe roster spot"}.`
            : verdict === "bid"
              ? `${addPlayer.player.fullName} is worth a measured waiver bid if the roster churn point is ${dropPlayer?.player.fullName ?? "your weakest bench slot"}.`
              : verdict === "watch"
                ? `${addPlayer.player.fullName} is not a mandatory click yet, but the usage trend is strong enough to keep live.`
                : `${addPlayer.player.fullName} does not beat your current bench math enough to force a move right now.`,
        rationale: [
          `Trend-adjusted starter delta: ${starterDelta >= 0 ? "+" : ""}${starterDelta.toFixed(1)}.`,
          `Weekly median delta versus ${dropPlayer?.player.fullName ?? "best drop"}: ${weeklyDelta >= 0 ? "+" : ""}${weeklyDelta.toFixed(1)}.`,
          `Playoff upside delta: ${playoffUpsideDelta >= 0 ? "+" : ""}${playoffUpsideDelta.toFixed(1)}.`,
        ],
        proposedTransaction: {
          kind: "add-drop",
          add: [
            {
              playerId: addPlayer.player.id,
              yahooPlayerId: addPlayer.player.externalIds.yahoo,
              fullName: addPlayer.player.fullName,
              team: addPlayer.player.team,
              positions: addPlayer.player.positions,
            },
          ],
          drop:
            dropPlayer === null
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
        b.starterDelta - a.starterDelta,
    )
    .slice(0, 4);
}

export function buildTransactionQueue(
  waiverRecommendations: WaiverRecommendationSnapshot[],
  tradeIdeas: TradeIdeaSnapshot[],
): TransactionQueueEntry[] {
  const waiverEntries = waiverRecommendations
    .filter((idea) => idea.verdict !== "pass")
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
    .filter((idea) => idea.verdict !== "pass")
    .map((idea) => ({
      id: `trade-${idea.givePlayerId}-${idea.targetPlayerId}`,
      kind: "trade",
      priority: idea.verdict === "pursue" ? "this-week" : "monitor",
      title: `Offer ${idea.givePlayerId} for ${idea.targetPlayerId}`,
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
  const opportunityTrends = buildOpportunityTrendSnapshots(inSeasonFixturePlayers);
  const tradeIdeas = buildTradeIdeaSnapshots(
    inSeasonFixturePlayers,
    inSeasonFixtureMyTeam,
    inSeasonFixtureLeagueTeams,
  );
  const waiverRecommendations = buildWaiverRecommendationSnapshots(
    inSeasonFixturePlayers,
    inSeasonFixtureMyTeam,
  );

  return {
    players: inSeasonFixturePlayers,
    myTeam: inSeasonFixtureMyTeam,
    leagueTeams: inSeasonFixtureLeagueTeams,
    opportunityTrends,
    tradeIdeas,
    waiverRecommendations,
    actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
    tank01Status: getTank01ProviderStatus(),
    scenarioNotes: [
      "This first in-season slice is provider-neutral and fixture-backed so the opportunity and trade logic can be tested before live league sync is required.",
      "Tank01 is treated as an experimental live-state provider seam, not a core dependency, until live value is proven.",
      "Trade ideas are evaluated by starter-range and playoff-upside impact, not generic name value.",
      "Waiver recommendations lean on trend-adjusted future value so quiet usage breakouts can outrank stale median projections before the market fully catches up.",
    ],
  };
}
