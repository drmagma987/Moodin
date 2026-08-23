import { buildWaiverRecommendationSnapshots } from "@/lib/fantasy/inSeason";
import { applyYahooLeagueInventory } from "@/lib/fantasy/yahooInventory";
import type { YahooLeagueInventorySnapshot } from "@/lib/fantasy/yahooBridge";
import type {
  BreakingNewsAlert,
  BreakingNewsResponse,
  InSeasonPlayerSnapshot,
  InSeasonTeamSnapshot,
  PlayerPosition,
  RefreshSignal,
} from "@/lib/fantasy/types";

const ACTIONABLE_CATEGORIES = new Set([
  "injury-up",
  "role-down",
  "depth-chart-down",
  "holdout-risk",
]);

function primaryPosition(player: InSeasonPlayerSnapshot): PlayerPosition {
  return player.player.positions[0] ?? "WR";
}

function actionConfidence(signal: RefreshSignal, headline: string): BreakingNewsAlert["actionConfidence"] {
  if (/\b(ruled out|will miss|injured reserve|placed on ir|torn|surgery)\b/i.test(headline)) return "confirmed";
  if (/\b(left practice|limited|questionable|day.to.day|hamstring|ankle|knee)\b/i.test(headline)) return "provisional";
  return signal.confidence === "high" ? "provisional" : "insufficient";
}

function opportunityTransfer(position: PlayerPosition, confidence: BreakingNewsAlert["actionConfidence"]) {
  const positionShare = position === "RB" ? 0.62 : position === "QB" ? 0.55 : position === "TE" ? 0.48 : 0.42;
  const confidenceShare = confidence === "confirmed" ? 1 : confidence === "provisional" ? 0.58 : 0.25;
  return positionShare * confidenceShare;
}

function buildAlert(signal: RefreshSignal, affected: InSeasonPlayerSnapshot): BreakingNewsAlert {
  const confidence = actionConfidence(signal, `${signal.headline} ${signal.summary}`);
  return {
    id: signal.externalId ?? signal.fingerprint ?? `${affected.player.id}:${signal.publishedAt}`,
    affectedPlayerId: affected.player.id,
    urgency: ACTIONABLE_CATEGORIES.has(signal.category) ? "immediate" : "monitor",
    actionConfidence: confidence,
    headline: signal.headline,
    summary: signal.summary,
    sourceLabel: signal.sourceLabel ?? signal.source,
    sourceUrl: signal.sourceUrl,
    publishedAt: signal.publishedAt,
  };
}

function depthChartBeneficiaries(affected: InSeasonPlayerSnapshot, players: InSeasonPlayerSnapshot[]) {
  if (affected.depthChartOrder === undefined) return [];
  return players
    .filter((player) => player.availability === "free-agent")
    .filter((player) => player.player.team === affected.player.team)
    .filter((player) => primaryPosition(player) === primaryPosition(affected))
    .filter((player) => player.depthChartOrder !== undefined && player.depthChartOrder > affected.depthChartOrder!)
    .sort((a, b) => (a.depthChartOrder ?? 99) - (b.depthChartOrder ?? 99) || b.weeklyProjection.p50 - a.weeklyProjection.p50)
    .slice(0, 2);
}

function applyProvisionalOpportunity(
  player: InSeasonPlayerSnapshot,
  affected: InSeasonPlayerSnapshot,
  confidence: BreakingNewsAlert["actionConfidence"],
) {
  const transfer = opportunityTransfer(primaryPosition(affected), confidence);
  const weeklyBoost = affected.weeklyProjection.p50 * transfer;
  const shortTermWeeks = confidence === "confirmed" ? 4 : confidence === "provisional" ? 2 : 1;
  return {
    ...player,
    weeklyProjection: {
      p10: Number((player.weeklyProjection.p10 + weeklyBoost * 0.45).toFixed(2)),
      p50: Number((player.weeklyProjection.p50 + weeklyBoost).toFixed(2)),
      p90: Number((player.weeklyProjection.p90 + weeklyBoost * 1.25).toFixed(2)),
    },
    rosProjection: {
      p10: player.rosProjection.p10,
      p50: Number((player.rosProjection.p50 + weeklyBoost * shortTermWeeks).toFixed(2)),
      p90: Number((player.rosProjection.p90 + weeklyBoost * shortTermWeeks * 1.35).toFixed(2)),
    },
  } satisfies InSeasonPlayerSnapshot;
}

export function buildBreakingNewsResponse(input: {
  signal: RefreshSignal;
  players: InSeasonPlayerSnapshot[];
  myTeam: InSeasonTeamSnapshot;
}): BreakingNewsResponse {
  const affected = input.players.find((player) => player.player.id === input.signal.playerId);
  if (!affected) return { status: "unmatched", alert: null, beneficiaryPlayerIds: [], recommendations: [], blockers: ["The alert did not resolve to an in-season player."] };
  const alert = buildAlert(input.signal, affected);
  if (!ACTIONABLE_CATEGORIES.has(input.signal.category)) {
    return { status: "monitor", alert, beneficiaryPlayerIds: [], recommendations: [], blockers: ["The story does not imply an immediate loss of opportunity."] };
  }
  if (affected.depthChartOrder === undefined) {
    return { status: "monitor", alert: { ...alert, actionConfidence: "insufficient" }, beneficiaryPlayerIds: [], recommendations: [], blockers: ["A verified depth-chart order is required before naming the next player up."] };
  }
  const beneficiaries = depthChartBeneficiaries(affected, input.players);
  if (beneficiaries.length === 0) {
    return { status: "no-available-beneficiary", alert, beneficiaryPlayerIds: [], recommendations: [], blockers: ["No same-team, same-position depth-chart successor is currently verified as a free agent."] };
  }
  const beneficiaryIds = new Set(beneficiaries.map((player) => player.player.id));
  const adjustedPlayers = input.players.map((player) => beneficiaryIds.has(player.player.id)
    ? applyProvisionalOpportunity(player, affected, alert.actionConfidence)
    : player);
  const recommendations = buildWaiverRecommendationSnapshots(adjustedPlayers, input.myTeam)
    .filter((recommendation) => beneficiaryIds.has(recommendation.addPlayerId))
    .filter((recommendation) => recommendation.verdict !== "pass");
  return {
    status: recommendations.length > 0 ? "actionable" : "no-roster-upgrade",
    alert,
    beneficiaryPlayerIds: [...beneficiaryIds],
    recommendations,
    blockers: recommendations.length > 0 ? [] : ["The verified next player up does not beat the current weakest roster spot yet."],
  };
}

export function buildBreakingNewsResponseWithYahooInventory(input: {
  signal: RefreshSignal;
  players: InSeasonPlayerSnapshot[];
  myTeam: InSeasonTeamSnapshot;
  inventory: YahooLeagueInventorySnapshot;
  now?: string;
}) {
  const applied = applyYahooLeagueInventory(input.players, input.inventory, { now: input.now });
  const response = buildBreakingNewsResponse({
    signal: input.signal,
    players: applied.players,
    myTeam: {
      ...input.myTeam,
      playerIds: applied.players
        .filter((player) => player.availability === "my-roster")
        .map((player) => player.player.id),
    },
  });
  if (applied.transactionReady) return { ...response, inventory: applied };
  return {
    ...response,
    status: response.alert ? "monitor" as const : response.status,
    recommendations: [],
    blockers: [...applied.blockers, ...response.blockers],
    inventory: applied,
  };
}
