"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BadgeDollarSign, BellRing, CheckCircle2,
  ClipboardPaste, ExternalLink, FileUp, LoaderCircle, RefreshCw, Search, ShieldAlert,
  Sparkles, Target, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InSeasonCommandCenterDataset, InSeasonPlayerSnapshot, OpportunityTrendSnapshot, TradeIdeaSnapshot } from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { applyYahooLeagueInventory } from "@/lib/fantasy/yahooInventory";
import type { YahooLeagueInventorySnapshot } from "@/lib/fantasy/yahooBridge";
import { analyzeTradeProposal, buildOpportunityTrendSnapshots, buildTradeIdeaSnapshots, buildTransactionQueue, buildWaiverRecommendationSnapshots } from "@/lib/fantasy/inSeason";
import { cn } from "@/lib/utils";
import { LeagueOpportunityDashboard } from "@/components/fantasy/league-opportunity-dashboard";
import { weeklyWaiverContext, weeklyWaiverContextStatus } from "@/lib/fantasy/weeklyWaiverContext";
import { PlayerCoverageReport } from "@/components/fantasy/player-coverage-report";
import { buildPlayerCoverageReport } from "@/lib/fantasy/playerCoverage";
import { buildAdvancedMetricSignals } from "@/lib/fantasy/inSeasonAdvancedMetrics";
import { applyCurrentSeasonProjectionUpdates } from "@/lib/fantasy/currentSeasonProjections";
import {
  buildYahooInventoryFromPdfPreview,
  extractYahooRosterPdfLines,
  parseYahooRosterPdfLines,
  type YahooRosterPdfPreview,
} from "@/lib/fantasy/yahooRosterPdf";

type View = "opportunity" | "today" | "waivers" | "trades" | "sync";
type AnalyzerMode = "outgoing" | "incoming";
type YahooStatus = {
  state: "idle" | "checking" | "connected" | "empty" | "error" | "manual";
  message: string;
  receivedAt?: string;
  playerCount?: number;
  availableCount?: number;
};

const MANUAL_ROSTER_KEY = "fantasy-in-season-manual-rosters-v1";
const PDF_ROSTER_KEY = "fantasy-in-season-yahoo-pdf-inventory-v1";

function rebuildDatasetFromInventory(
  base: InSeasonCommandCenterDataset,
  inventory: YahooLeagueInventorySnapshot,
  maxAgeMinutes: number,
) {
  const applied = applyYahooLeagueInventory(base.players, inventory, { maxAgeMinutes });
  const baseTeams = new Map(base.leagueTeams.map((team) => [team.teamId, team] as const));
  const teamNames = new Map(base.leagueTeams.map((team) => [team.teamId, team.name] as const));
  const baseMyTeam = baseTeams.get(inventory.myTeamId);
  const myTeam = {
    ...baseMyTeam,
    teamId: inventory.myTeamId,
    name: teamNames.get(inventory.myTeamId) ?? "My Team",
    playerIds: applied.players.filter((player) => player.availability === "my-roster").map((player) => player.player.id),
  };
  const leagueTeamIds = Array.from(new Set(applied.players.map((player) => player.rosterTeamId).filter((teamId): teamId is string => Boolean(teamId))));
  const leagueTeams = leagueTeamIds.map((teamId) => ({
    ...baseTeams.get(teamId),
    teamId,
    name: teamNames.get(teamId) ?? (teamId === inventory.myTeamId ? "My Team" : `Yahoo Team ${teamId}`),
    playerIds: applied.players.filter((player) => player.rosterTeamId === teamId).map((player) => player.player.id),
  }));
  const opportunityTrends = buildOpportunityTrendSnapshots(applied.players);
  const tradeIdeas = buildTradeIdeaSnapshots(applied.players, myTeam, leagueTeams);
  const waiverRecommendations = buildWaiverRecommendationSnapshots(applied.players, myTeam);
  return {
    applied,
    dataset: {
      ...base,
      players: applied.players,
      myTeam,
      leagueTeams,
      advancedMetricSignals: buildAdvancedMetricSignals(applied.players, teamNames),
      opportunityTrends,
      tradeIdeas,
      waiverRecommendations,
      actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
      rosterSnapshot: {
        source: inventory.source === "yahoo-roster-pdf" ? "Yahoo Starting Rosters PDF" : "Yahoo league inventory",
        capturedAt: inventory.completedAt,
        persistence: "device-local",
      },
    } satisfies InSeasonCommandCenterDataset,
  };
}

function playerName(playerId: string | null, players: InSeasonPlayerSnapshot[]) {
  if (!playerId) return "Open roster spot";
  return players.find((entry) => entry.player.id === playerId)?.player.fullName ?? playerId;
}

function playerNames(playerIds: string[], players: InSeasonPlayerSnapshot[]) {
  return playerIds.map((playerId) => playerName(playerId, players)).join(" + ");
}

function playerPosition(player: InSeasonPlayerSnapshot) {
  return player.player.positions[0] ?? "WR";
}

function trendTone(classification: OpportunityTrendSnapshot["classification"]) {
  if (classification === "buy-low" || classification === "waiver-rise") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (classification === "sell-high") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (classification === "role-confirmation") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (classification === "role-warning") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function snapshotTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "unknown time";
}

function actionTitle(action: InSeasonCommandCenterDataset["actionQueue"][number]) {
  const transaction = action.proposedTransaction;
  if (transaction.kind === "add-drop") {
    const add = transaction.add.map((player) => player.fullName).join(" + ");
    const drop = transaction.drop.map((player) => player.fullName).join(" + ");
    return drop ? `Add ${add}, drop ${drop}` : `Add ${add}`;
  }
  return `Offer ${transaction.send.map((player) => player.fullName).join(" + ")} for ${transaction.receive.map((player) => player.fullName).join(" + ")}`;
}

function MarketCorrectionWatch({
  dataset,
  onOpenTrade,
}: {
  dataset: InSeasonCommandCenterDataset;
  onOpenTrade: (trend: OpportunityTrendSnapshot, idea?: TradeIdeaSnapshot) => void;
}) {
  const buyCalls = dataset.opportunityTrends.filter((trend) => trend.classification === "buy-low" || trend.classification === "waiver-rise");
  const fadeCalls = dataset.opportunityTrends.filter((trend) => trend.classification === "sell-high");
  const monitors = dataset.opportunityTrends.filter((trend) =>
    (trend.classification === "role-warning" || trend.classification === "watch") && trend.priceContext !== "elite" && trend.priceContext !== "deep",
  ).slice(0, 4);
  const pricedCorrectly = dataset.opportunityTrends.filter((trend) => trend.classification === "role-confirmation").slice(0, 4);
  const teamNames = new Map(dataset.leagueTeams.map((team) => [team.teamId, team.name] as const));

  const cards = (trends: OpportunityTrendSnapshot[]) => (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {trends.map((trend) => {
        const player = dataset.players.find((entry) => entry.player.id === trend.playerId);
        if (!player) return null;
        const rising = trend.opportunityScore >= 0;
        const owner = player.availability === "my-roster"
          ? "Your roster"
          : player.availability === "free-agent"
            ? "Free agent"
            : teamNames.get(player.rosterTeamId ?? "") ?? "League roster";
        const tradeIdea = trend.classification === "buy-low"
          ? dataset.tradeIdeas.find((idea) => idea.targetPlayerIds.includes(trend.playerId))
          : trend.classification === "sell-high" && player.availability === "my-roster"
            ? dataset.tradeIdeas.find((idea) => idea.givePlayerIds.includes(trend.playerId))
            : undefined;
        const waiver = trend.classification === "waiver-rise"
          ? dataset.waiverRecommendations.find((idea) => idea.addPlayerId === trend.playerId)
          : undefined;
        const openingTier = tradeIdea?.offerTiers.find((tier) => tier.tier === "lowball") ?? tradeIdea?.offerTiers[0];
        const maxTier = tradeIdea?.offerTiers.find((tier) => tier.tier === "even") ?? tradeIdea?.offerTiers.at(-1);
        const openingOffer = openingTier ? playerNames(openingTier.givePlayerIds, dataset.players) : tradeIdea ? playerNames(tradeIdea.givePlayerIds, dataset.players) : null;
        const maxOffer = maxTier ? playerNames(maxTier.givePlayerIds, dataset.players) : tradeIdea ? playerNames(tradeIdea.givePlayerIds, dataset.players) : null;

        return (
          <article key={trend.playerId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black">{player.player.fullName}</p>
                <p className="text-xs text-slate-500">{playerPosition(player)} · {player.player.team} · {owner}</p>
              </div>
              <span className={cn("rounded-full border px-2 py-1 text-[10px] font-black uppercase", trendTone(trend.classification))}>{trend.classification.replaceAll("-", " ")}</span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {rising ? <TrendingUp className="h-5 w-5 text-emerald-300" /> : <TrendingDown className="h-5 w-5 text-rose-300" />}
              <span className="text-2xl font-black">{signed(trend.opportunityScore)}</span>
              <span className="text-xs text-slate-500">usage signal</span>
            </div>
            <p className="mt-2 text-xs font-bold text-violet-200">Price reference: {trend.marketLabel}</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">{trend.summary}</p>
            {trend.signals.length > 0 ? <div className="mt-3 space-y-1.5">{trend.signals.map((signal) => <p key={signal} className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300">{signal}</p>)}</div> : null}
            <p className="mt-3 text-xs leading-5 text-slate-500">{trend.marketEvidence}</p>

            {tradeIdea ? <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-cyan-200">League-fit offer</p>
              <p className="mt-1 text-sm font-black">{trend.classification === "buy-low" ? `Open with ${openingOffer}` : `Best modeled return: ${playerNames(tradeIdea.targetPlayerIds, dataset.players)}`}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{trend.classification === "buy-low" ? `Ceiling: do not exceed ${maxOffer}. ` : "Only shop him if this return remains available. "}{tradeIdea.counterpartyTeamName} gets {signed(tradeIdea.counterpartyStarterDelta)} immediate lineup value.</p>
              <Button className="mt-3 w-full" size="sm" onClick={() => onOpenTrade(trend, tradeIdea)}>Load this in Trade Lab <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div> : trend.classification === "buy-low" ? <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[0.06] p-3"><p className="text-xs leading-5 text-violet-100">The player signal clears independently, but no prebuilt offer currently improves both modeled lineups. Explore the target without treating that as a reason to remove him from the board.</p><Button className="mt-3 w-full" size="sm" variant="secondary" onClick={() => onOpenTrade(trend)}>Inspect target in Trade Lab <ArrowRight className="ml-2 h-4 w-4" /></Button></div> : null}

            {waiver ? <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3"><p className="text-xs font-black text-emerald-100">Waiver plan: {waiver.faabRange?.label ?? "watch list"}</p><p className="mt-1 text-xs text-slate-400">{waiver.dropPlayerId ? `Preferred cut: ${playerName(waiver.dropPlayerId, dataset.players)}.` : "Use an open roster spot; no forced cut."}</p></div> : null}
            <p className="mt-4 text-xs font-black uppercase text-cyan-200">Agent call: {trend.recommendation.replace("-", " ")}</p>
          </article>
        );
      })}
    </div>
  );

  const section = (eyebrow: string, title: string, description: string, trends: OpportunityTrendSnapshot[], empty: string) => (
    <div className="mt-7 border-t border-white/10 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">{eyebrow}</p><h3 className="mt-1 text-lg font-black">{title}</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p></div><span className="text-xs text-slate-500">{trends.length} found</span></div>
      {trends.length > 0 ? cards(trends) : <p className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-sm text-slate-400">{empty}</p>}
    </div>
  );

  return (
    <section className="mt-4 rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Price versus role</p>
      <h2 className="mt-1 text-2xl font-black">Buy low / sell high</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A trade call only clears when Week {dataset.evidenceStatus.week} usage, fantasy production, roster status, role, and a realistic league-specific price point align.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-white/[0.04] p-3 text-xs leading-5 text-slate-400"><strong className="block text-slate-200">Price</strong>Preseason consensus rank and tier are a reference point—not a live trade-value feed.</div>
        <div className="rounded-xl bg-white/[0.04] p-3 text-xs leading-5 text-slate-400"><strong className="block text-slate-200">League fit</strong>Player signals determine the board. Owner needs only determine whether a suggested offer can be prebuilt.</div>
        <div className="rounded-xl bg-white/[0.04] p-3 text-xs leading-5 text-slate-400"><strong className="block text-slate-200">Usage</strong>Snaps, routes, targets, carries, red-zone work, and scoring are blended conservatively.</div>
      </div>
      {section("Actionable buys", "Acquire below likely future value", "Targets qualify on player value and role evidence alone. Owner fit adds an opening offer when available but never controls whether the player appears.", buyCalls, "No acquisition target currently has both a clear discount and enough role evidence.")}
      {section("Actionable sells and fades", "Shop ours; avoid theirs", "Regression applies across the league: shop our spike, avoid an opponent's asking price, or decline a misleading waiver chase.", fadeCalls, "No player's production or buzz is far enough ahead of role to justify a sell-or-avoid call.")}
      {section("Monitor one more week", "Interesting, not actionable", "Promising or concerning evidence that still needs a larger role, clearer price, or another game before becoming a recommendation.", monitors, "No credible middle-market player needs a one-more-week flag.")}
      {section("Already priced correctly", "Useful confirmation, not an edge", "Elite or established players whose usage supports their existing price. These do not become fake buy-low recommendations.", pricedCorrectly, "No priced-in role confirmation stands out yet.")}
    </section>
  );
}

function WaiverWireBoard({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [filter, setFilter] = useState<"all" | "priority" | "bid" | "watch">("all");
  const recommendations = dataset.waiverRecommendations.filter((recommendation) =>
    filter === "all" ? recommendation.verdict !== "pass" : recommendation.verdict === filter,
  );
  const priority = dataset.waiverRecommendations.filter((recommendation) => recommendation.verdict === "priority").length;
  const bids = dataset.waiverRecommendations.filter((recommendation) => recommendation.verdict === "bid").length;
  const darts = dataset.waiverRecommendations.filter((recommendation) => recommendation.verdict === "watch").length;
  const sourceStatus = weeklyWaiverContextStatus();

  return <div className="mt-4 space-y-4">
    <section className="overflow-hidden rounded-[28px] border border-emerald-300/20 bg-[#0a1727]/95">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Week {weeklyWaiverContext.week} decision board</p><h2 className="mt-2 text-3xl font-black">Spend for a reason, not a box score.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Every candidate is graded on opportunity creation, advanced usage or efficiency, fit against your weakest cut, and outside-market confirmation. External rankings are a gut check—not the answer.</p></div>
        <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-rose-300/[0.08] p-3"><p className="text-2xl font-black text-rose-200">{priority}</p><p className="text-[10px] font-black uppercase text-slate-500">priority</p></div><div className="rounded-2xl bg-cyan-300/[0.08] p-3"><p className="text-2xl font-black text-cyan-200">{bids}</p><p className="text-[10px] font-black uppercase text-slate-500">measured bids</p></div><div className="rounded-2xl bg-violet-300/[0.08] p-3"><p className="text-2xl font-black text-violet-200">{darts}</p><p className="text-[10px] font-black uppercase text-slate-500">dart throws</p></div></div>
      </div>
      <div className={cn("border-t px-4 py-2 text-xs font-bold", sourceStatus.current ? "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100")}>{sourceStatus.message}</div>
      <div className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-2">
        {Object.values(weeklyWaiverContext.sources).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-[#0a1727] px-4 py-3 text-sm font-bold text-cyan-100 hover:bg-[#102238]"><span>{source.label}<span className="ml-2 text-xs font-normal text-slate-500">{"publishedAt" in source ? source.publishedAt : source.updatedAt}</span></span><ExternalLink className="h-4 w-4" /></a>)}
      </div>
    </section>

    <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Claim order</p><h2 className="mt-1 text-2xl font-black">Your league-adjusted waiver queue</h2></div><div className="flex gap-1 rounded-xl bg-black/25 p-1">{[["all", "All"], ["priority", "Priority"], ["bid", "Bid"], ["watch", "Darts"]].map(([value, label]) => <button key={value} onClick={() => setFilter(value as typeof filter)} className={cn("rounded-lg px-3 py-2 text-xs font-black", filter === value ? "bg-emerald-400 text-slate-950" : "text-slate-400")}>{label}</button>)}</div></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{recommendations.map((recommendation, index) => {
        const player = dataset.players.find((entry) => entry.player.id === recommendation.addPlayerId);
        if (!player) return null;
        const advanced = dataset.advancedMetricSignals.filter((signal) => signal.playerId === recommendation.addPlayerId);
        const verdictLabel = recommendation.verdict === "watch" ? "dart throw" : recommendation.verdict;
        return <article key={recommendation.addPlayerId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] font-black text-slate-300">{index + 1}</span><div><p className="text-lg font-black text-white">{player.player.fullName}</p><p className="text-xs text-slate-500">{playerPosition(player)} · {player.player.team} · {recommendation.opportunityType.replaceAll("-", " ")}</p></div></div><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black uppercase", recommendation.verdict === "priority" ? "bg-rose-300/15 text-rose-200" : recommendation.verdict === "bid" ? "bg-cyan-300/15 text-cyan-100" : "bg-violet-300/15 text-violet-100")}>{verdictLabel}</span></div>
          <p className="mt-4 text-sm font-bold leading-6 text-slate-200">{recommendation.opportunityCase}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-emerald-300/[0.07] p-3"><p className="font-black text-emerald-200">Our bid: {recommendation.faabRange?.label ?? "Watch only"}</p><p className="mt-1 text-slate-500">Edge score {recommendation.edgeScore.toFixed(1)} · {recommendation.confidence} confidence</p></div><div className="rounded-xl bg-cyan-300/[0.07] p-3"><p className="font-black text-cyan-100">Market check: {recommendation.expertSupport.sourceCount}/2</p><p className="mt-1 text-slate-500">{recommendation.expertSupport.rotoballerFaab || recommendation.expertSupport.fantasyProsRange ? `FAAB ${recommendation.expertSupport.rotoballerFaab ?? "—"} · rank ${recommendation.expertSupport.fantasyProsRange ?? "—"}` : recommendation.expertSupport.sourceCount ? "PFF / FantasyPros support" : "No fresh outside support"}</p></div></div>
          {advanced.length ? <div className="mt-3 flex flex-wrap gap-1.5">{advanced.flatMap((signal) => signal.metrics.slice(0, 3)).map((metric) => <span key={metric} className="rounded-lg bg-violet-300/10 px-2 py-1 text-[11px] font-bold text-violet-100">{metric}</span>)}</div> : null}
          <div className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.05] p-3"><p className="text-[10px] font-black uppercase text-amber-200">What breaks the case</p><p className="mt-1 text-xs leading-5 text-slate-400">{recommendation.primaryRisk}</p></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><p className="font-bold text-slate-400">{recommendation.coverage?.actionable ? <>Drop: <span className="text-white">{playerName(recommendation.dropPlayerId, dataset.players)}</span></> : "No cut approved · provisional comparison"}</p><p className="font-black text-emerald-200">Starter {signed(recommendation.starterDelta)} · upside {signed(recommendation.playoffUpsideDelta)}</p></div>
        </article>;
      })}</div>
      {recommendations.length === 0 ? <p className="mt-4 rounded-2xl bg-black/20 p-5 text-sm text-slate-400">No players clear this filter. That is a valid answer; keep the budget.</p> : null}
    </section>
  </div>;
}

export function InSeasonCommandCenter({ dataset: initialDataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [dataset, setDataset] = useState(initialDataset);
  const [evidenceRefreshing, setEvidenceRefreshing] = useState(false);
  const [evidenceRefreshMessage, setEvidenceRefreshMessage] = useState<string | null>(null);
  const coverageReport = useMemo(() => buildPlayerCoverageReport(dataset.players, Date.now(), {
    candidatePlayerIds: [
      ...dataset.waiverRecommendations.filter((idea) => idea.verdict !== "pass").flatMap((idea) => [idea.addPlayerId, ...(idea.dropPlayerId ? [idea.dropPlayerId] : [])]),
      ...dataset.tradeIdeas.flatMap((idea) => [...idea.givePlayerIds, ...idea.targetPlayerIds, ...idea.offerTiers.flatMap((tier) => tier.givePlayerIds)]),
    ],
  }), [dataset.players, dataset.waiverRecommendations, dataset.tradeIdeas]);
  const refreshPlayerEvidence = useCallback(async () => {
    setEvidenceRefreshing(true);
    try {
      const response = await fetch("/api/fantasy/evidence", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.players)) throw new Error(body.error ?? "Refresh failed");
      const refreshed = new Map<string, InSeasonPlayerSnapshot>(body.players.filter((player: InSeasonPlayerSnapshot) => body.updatedPlayerIds?.includes(player.player.id)).map((player: InSeasonPlayerSnapshot) => [player.player.id, player]));
      setDataset((current) => {
        const refreshedPlayers = current.players.map((player) => {
          const update = refreshed.get(player.player.id);
          return update ? { ...update, availability: player.availability, rosterTeamId: player.rosterTeamId,
            injuryStatus: player.injuryStatus === "IR" && update.injuryStatus !== "IR" ? "IR" : update.injuryStatus } : player;
        });
        const players = applyCurrentSeasonProjectionUpdates(refreshedPlayers, {
          week: current.evidenceStatus.week,
          capturedAt: body.capturedAt ?? new Date().toISOString(),
          observationWeight: current.evidenceStatus.evidenceWeight,
        });
        const waiverRecommendations = buildWaiverRecommendationSnapshots(players, current.myTeam);
        const tradeIdeas = buildTradeIdeaSnapshots(players, current.myTeam, current.leagueTeams);
        const slate = body.slate as Partial<InSeasonCommandCenterDataset["evidenceStatus"]> | undefined;
        return { ...current, players, waiverRecommendations, tradeIdeas,
          opportunityTrends: buildOpportunityTrendSnapshots(players),
          advancedMetricSignals: buildAdvancedMetricSignals(players, new Map(current.leagueTeams.map((team) => [team.teamId, team.name]))),
          actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
          evidenceStatus: {
            ...current.evidenceStatus,
            ...slate,
            week: body.week ?? current.evidenceStatus.week,
            capturedAt: body.capturedAt ?? current.evidenceStatus.capturedAt,
            matchedPlayers: body.observedPlayers ?? current.evidenceStatus.matchedPlayers,
            sources: Array.isArray(slate?.sources) ? slate.sources : current.evidenceStatus.sources,
          } };
      });
      setEvidenceRefreshMessage(`${body.observedPlayers} players matched weekly observations; ${body.contextPlayers} matched context records. ${(body.sources as Array<{ label: string; status: string; detail: string }>).map((source) => `${source.label}: ${source.status === "loaded" ? "downloaded" : source.detail}`).join(". ")}. Missing rows remain unknown. Refresh applies to this session; roster ownership is preserved.`);
    } catch (error) {
      setEvidenceRefreshMessage(error instanceof Error ? error.message : "Refresh failed; existing data retained.");
    } finally { setEvidenceRefreshing(false); }
  }, []);
  useEffect(() => { void refreshPlayerEvidence(); }, [refreshPlayerEvidence]);
  const [view, setView] = useState<View>("today");
  const [yahoo, setYahoo] = useState<YahooStatus>({ state: "idle", message: "Ready to read the latest league inventory from the Yahoo Chrome bridge." });
  const [manualRosterText, setManualRosterText] = useState("");
  const [pdfPreview, setPdfPreview] = useState<YahooRosterPdfPreview | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [newsText, setNewsText] = useState("");
  const [newsResult, setNewsResult] = useState<string | null>(null);
  const [newsSubmitting, setNewsSubmitting] = useState(false);
  const [analyzerMode, setAnalyzerMode] = useState<AnalyzerMode>("incoming");
  const [tradeLabSource, setTradeLabSource] = useState<string | null>(null);
  const [returnDateOverrides, setReturnDateOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PDF_ROSTER_KEY);
      if (!saved) return;
      const inventory = JSON.parse(saved) as YahooLeagueInventorySnapshot;
      if (inventory.source !== "yahoo-roster-pdf" || inventory.leagueId !== leagueSourceOfTruth.leagueId.replace("yahoo-", "")) return;
      const rebuilt = rebuildDatasetFromInventory(initialDataset, inventory, 7 * 24 * 60);
      if (!rebuilt.applied.transactionReady) return;
      setDataset(rebuilt.dataset);
      setYahoo({
        state: "manual",
        message: `Restored the Yahoo roster PDF captured ${new Date(inventory.completedAt).toLocaleString()}. Upload a new one after roster moves.`,
        receivedAt: inventory.completedAt,
        playerCount: inventory.players.length,
        availableCount: inventory.players.filter((player) => player.availability === "available").length,
      });
    } catch {
      window.localStorage.removeItem(PDF_ROSTER_KEY);
    }
  }, [initialDataset]);
  const myRoster = useMemo(
    () => dataset.players.filter((player) => player.availability === "my-roster" && playerPosition(player) !== "K"),
    [dataset.players],
  );
  const tradeTargets = useMemo(
    () => dataset.players.filter(
      (player) =>
        (player.availability === "trade-target" || player.availability === "league-rostered") &&
        playerPosition(player) !== "K",
    ),
    [dataset.players],
  );
  const [sendId, setSendId] = useState(myRoster[0]?.player.id ?? "");
  const [send2Id, setSend2Id] = useState("");
  const [receiveId, setReceiveId] = useState(tradeTargets[0]?.player.id ?? "");
  const [receive2Id, setReceive2Id] = useState("");
  const receiveTeamId = dataset.players.find((player) => player.player.id === receiveId)?.rosterTeamId;
  const receive2Candidates = tradeTargets.filter(
    (player) => player.player.id !== receiveId && player.rosterTeamId === receiveTeamId,
  );
  const packageIncomplete = Boolean(send2Id) !== Boolean(receive2Id);
  const selectedTradePlayers = [sendId, send2Id, receiveId, receive2Id]
    .filter(Boolean)
    .map((id) => dataset.players.find((player) => player.player.id === id))
    .filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
  const selectedInjuredPlayers = selectedTradePlayers.filter((player) => player.injuryStatus === "IR");
  const customTrade = useMemo(() => {
    if (packageIncomplete) return null;
    return analyzeTradeProposal(
      dataset.players,
      dataset.myTeam,
      dataset.leagueTeams,
      [sendId, send2Id].filter(Boolean),
      [receiveId, receive2Id].filter(Boolean),
      returnDateOverrides,
    );
  }, [dataset.leagueTeams, dataset.myTeam, dataset.players, packageIncomplete, receive2Id, receiveId, returnDateOverrides, send2Id, sendId]);
  const pdfRosterChanges = pdfPreview?.ownershipChanges.length ?? 0;

  function openTradeFromMarket(trend: OpportunityTrendSnapshot, idea?: TradeIdeaSnapshot) {
    if (idea) {
      setSendId(idea.givePlayerIds[0] ?? "");
      setSend2Id(idea.givePlayerIds[1] ?? "");
      setReceiveId(idea.targetPlayerIds[0] ?? trend.playerId);
      setReceive2Id(idea.targetPlayerIds[1] ?? "");
    } else {
      const target = dataset.players.find((player) => player.player.id === trend.playerId);
      const startingPiece = target
        ? [...myRoster]
            .filter((player) => player.injuryStatus !== "IR" && !((player.marketTier ?? 99) <= 2 || (player.marketRank ?? 999) <= 24))
            .sort((a, b) => Math.abs(a.rosProjection.p50 - target.rosProjection.p50) - Math.abs(b.rosProjection.p50 - target.rosProjection.p50))[0]
        : undefined;
      if (startingPiece) setSendId(startingPiece.player.id);
      setSend2Id("");
      setReceiveId(trend.playerId);
      setReceive2Id("");
    }
    setAnalyzerMode("outgoing");
    const owner = idea?.counterpartyTeamName ?? dataset.leagueTeams.find((team) => team.playerIds.includes(trend.playerId))?.name ?? "League roster";
    setTradeLabSource(`${trend.classification.replaceAll("-", " ")} · ${playerName(trend.playerId, dataset.players)} · ${owner}${idea ? " · suggested package loaded" : " · target loaded with a nearest-value starting point"}`);
    setView("trades");
  }

  async function refreshYahoo() {
    setYahoo({ state: "checking", message: "Checking the local Yahoo bridge…" });
    try {
      const response = await fetch("/api/fantasy/yahoo-extension", { cache: "no-store" });
      const body = await response.json() as {
        inventory?: { receivedAt?: string; playerCount?: number; availableCount?: number } | null;
        inventorySnapshot?: YahooLeagueInventorySnapshot | null;
      };
      if (!response.ok || !body.inventory || !body.inventorySnapshot) {
        setYahoo({ state: "empty", message: "No recent league scan found. Open Yahoo in Chrome and run Scan league inventory, or paste rosters below." });
        return;
      }
      const rebuilt = rebuildDatasetFromInventory(dataset, body.inventorySnapshot, 15);
      const applied = rebuilt.applied;
      setDataset(rebuilt.dataset);
      setYahoo({
        state: applied.transactionReady ? "connected" : "empty",
        message: applied.transactionReady
          ? `Yahoo analysis refreshed: ${applied.matchedCount} modeled players matched across rosters and free agency.`
          : `Yahoo scan found, but recommendations are held back: ${applied.blockers.join(" ")}`,
        receivedAt: body.inventory.receivedAt,
        playerCount: body.inventory.playerCount,
        availableCount: body.inventory.availableCount,
      });
    } catch {
      setYahoo({ state: "error", message: "The Yahoo bridge is not reachable. Paste league rosters below and the agent can keep working." });
    }
  }

  async function previewYahooRosterPdf(file: File | undefined) {
    if (!file) return;
    setPdfPreview(null);
    setPdfError(null);
    setPdfFileName(file.name);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Choose the PDF created from Yahoo's Starting Rosters page.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setPdfError("That PDF is larger than 15 MB. Print only the Yahoo roster page and try again.");
      return;
    }
    setPdfLoading(true);
    try {
      const lines = await extractYahooRosterPdfLines(file);
      const preview = parseYahooRosterPdfLines(lines, dataset.players, dataset.leagueTeams);
      setPdfPreview(preview);
      if (!preview.ready) setPdfError("The import is blocked until every listed issue is resolved. No roster data has changed.");
    } catch {
      setPdfError("This PDF could not be read. Make sure it was printed directly from Yahoo and contains selectable text.");
    } finally {
      setPdfLoading(false);
    }
  }

  function applyYahooRosterPdf() {
    if (!pdfPreview?.ready) return;
    try {
      const inventory = buildYahooInventoryFromPdfPreview(pdfPreview, dataset.players, dataset.myTeam.teamId);
      const rebuilt = rebuildDatasetFromInventory(dataset, inventory, 7 * 24 * 60);
      if (!rebuilt.applied.transactionReady) {
        setPdfError(`The roster snapshot did not clear the recommendation gate: ${rebuilt.applied.blockers.join(" ")}`);
        return;
      }
      setDataset(rebuilt.dataset);
      window.localStorage.setItem(PDF_ROSTER_KEY, JSON.stringify(inventory));
      setYahoo({
        state: "manual",
        message: `Yahoo PDF applied: ${pdfPreview.detectedTeams}/${leagueSourceOfTruth.teams} teams and ${pdfPreview.matchedPlayers} rostered players matched.`,
        receivedAt: inventory.completedAt,
        playerCount: inventory.players.length,
        availableCount: inventory.players.filter((player) => player.availability === "available").length,
      });
      setPdfError(null);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "The roster PDF could not be applied.");
    }
  }

  function importManualRosters() {
    const rosterText = manualRosterText.trim();
    if (!rosterText) return;
    const matchedPlayers = dataset.players.filter((entry) => rosterText.toLowerCase().includes(entry.player.fullName.toLowerCase())).length;
    window.localStorage.setItem(MANUAL_ROSTER_KEY, rosterText);
    setYahoo({ state: "manual", message: `Manual roster snapshot saved on this device. ${matchedPlayers} modeled player${matchedPlayers === 1 ? "" : "s"} matched immediately.`, playerCount: matchedPlayers });
  }

  async function submitNews() {
    if (!newsText.trim()) return;
    setNewsSubmitting(true);
    setNewsResult(null);
    try {
      const response = await fetch("/api/fantasy/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: newsText }) });
      const body = await response.json() as { ok?: boolean; error?: string; player?: { fullName?: string }; signal?: { category?: string } };
      if (!response.ok || !body.ok) setNewsResult(body.error ?? "That update could not be matched yet.");
      else {
        setNewsResult(`${body.player?.fullName ?? "Player"} matched · ${body.signal?.category ?? "context updated"}. Re-scan Yahoo before acting if availability may have changed.`);
        setNewsText("");
      }
    } catch {
      setNewsResult("The news intake is unavailable right now. Keep the note and try again when the local app is connected.");
    } finally {
      setNewsSubmitting(false);
    }
  }

  const nav: Array<[View, string, typeof Activity]> = [
    ["today", "Edge Brief", Sparkles], ["waivers", "Waiver Wire", BellRing], ["trades", "Trade Lab", BadgeDollarSign],
    ["opportunity", "League Map", Users], ["sync", "League Sync", RefreshCw],
  ];

  return (
    <main className="min-h-screen bg-[#06101d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(16,185,129,0.14),transparent_33%),radial-gradient(circle_at_92%_4%,rgba(34,211,238,0.11),transparent_27%)]" />
      <div className="relative mx-auto w-full max-w-[1440px] px-3 pb-24 pt-4 sm:px-6 sm:pt-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0a1727]/92 shadow-2xl shadow-black/25">
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-emerald-300"><Activity className="h-4 w-4" /> Week {dataset.evidenceStatus.week} agent · analysis live</div>
              <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Find the move your league is leaving open.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Roster weaknesses, usage before headlines, correction candidates, and exact trades that improve your starting lineup.</p>
            </div>
            <button onClick={() => { setView("sync"); void refreshYahoo(); }} className="group rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-left transition hover:bg-emerald-300/[0.12]">
              <span className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Yahoo league state <RefreshCw className="h-4 w-4 transition group-hover:rotate-45" /></span>
              <span className="mt-2 block text-sm font-bold text-white">{yahoo.receivedAt ? `Roster snapshot · ${snapshotTime(yahoo.receivedAt)}` : "Upload the latest roster PDF"}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">Yahoo Rosters → Print → Save as PDF. Bridge and paste remain fallbacks.</span>
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/10 bg-black/20 p-1.5" aria-label="Mid-season tools">
            {nav.map(([id, label, Icon]) => <button key={id} onClick={() => setView(id)} className={cn("flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition", view === id ? "bg-emerald-400 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white")}><Icon className="h-4 w-4" /> {label}</button>)}
          </nav>
        </section>

        {view === "opportunity" ? <LeagueOpportunityDashboard dataset={dataset} /> : null}

        {view === "waivers" ? <WaiverWireBoard dataset={dataset} /> : null}

        {view === "today" ? <div className="mt-4 space-y-4">
          <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            <p>{coverageReport.priorityComplete} / {coverageReport.priorityTotal} priority-player profiles complete · {coverageReport.monitored} reserves monitored · {coverageReport.kickers} lightweight kickers. Each recommendation checks its own evidence and affected players.</p>
            {evidenceRefreshing ? <p className="mt-2" role="status">Refreshing weekly observations and player context…</p> : null}
            <p className="mt-2">Game reviews below are editorial context. Their original calls are not coverage-approved transactions.</p>
            {!dataset.actionQueue.length ? <p className="mt-2 font-bold">No actions currently clear both the evidence and roster-value checks.</p> : null}
            <button onClick={() => setView("sync")} className="mt-2 underline">Review player coverage and missing inputs</button>
          </section>
          <section className="rounded-[28px] border border-emerald-300/20 bg-[#0a1727]/92 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Latest slate ingested</p><h2 className="mt-1 text-2xl font-black">{dataset.evidenceStatus.latestGame}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{dataset.evidenceStatus.matchedPlayers} modeled players updated from verified game evidence across {dataset.evidenceStatus.completedGames} finalized games. Week {dataset.evidenceStatus.week} observations carry {Math.round(dataset.evidenceStatus.evidenceWeight * 100)}% weight until the sample grows; MNF absences remain unknown rather than zero.</p><div className="mt-2 flex flex-wrap gap-3">{dataset.evidenceStatus.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cyan-200 hover:text-cyan-100">{source.label} <ExternalLink className="ml-1 inline h-3 w-3" /></a>)}</div></div><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-black text-emerald-100">{dataset.evidenceStatus.completedGames}/{dataset.evidenceStatus.scheduledGames} games final</span></div>
            {dataset.evidenceStatus.week === 1 ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dataset.completedGameReviews.map((review) => <article key={review.playerName} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-white">{review.playerName}</p><p className="text-xs text-slate-500">{review.team} · {review.rosterContext}</p></div><span className={cn("rounded-full px-2 py-1 text-[10px] font-black uppercase", review.confidence === "high" ? "bg-emerald-300/15 text-emerald-200" : "bg-amber-300/15 text-amber-100")}>{review.confidence}</span></div><p className="mt-3 text-sm font-black text-cyan-100">{review.action}</p><p className="mt-2 text-xs font-bold text-slate-300">{review.statLine}</p><p className="mt-1 text-xs text-violet-200/80">{review.usageLine}</p><p className="mt-3 text-xs leading-5 text-slate-400">{review.analysis}</p></article>)}</div> : <p className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">Week {dataset.evidenceStatus.week} usage is live in the model. Player-by-player editorial recaps stay paused until Giants–Rams closes the slate.</p>}
          </section>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Recommended actions</p><h2 className="mt-1 text-2xl font-black">This week&apos;s edge queue</h2></div><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">{dataset.rosterSnapshot.source} · {snapshotTime(dataset.rosterSnapshot.capturedAt)}</span></div>
            <div className="mt-4 space-y-3">{dataset.actionQueue.map((action, index) => <article key={action.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 font-black text-slate-950">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{actionTitle(action)}</p><span className={cn("rounded-full px-2 py-1 text-[11px] font-black uppercase", action.priority === "immediate" ? "bg-rose-300/15 text-rose-200" : action.priority === "this-week" ? "bg-amber-300/15 text-amber-100" : "bg-white/[0.06] text-slate-400")}>{action.priority.replace("-", " ")}</span></div><p className="mt-1 text-sm leading-6 text-slate-400">{action.summary}</p>{action.faabRange ? <p className="mt-2 text-xs font-black text-cyan-200">Suggested bid: {action.faabRange.label}</p> : null}</div><ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-600" /></div></article>)}</div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-[28px] border border-cyan-300/15 bg-cyan-300/[0.06] p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200"><Target className="h-4 w-4" /> Best surplus-value angle</div>{dataset.tradeIdeas[0] ? <><p className="mt-3 text-xl font-black">Get {playerNames(dataset.tradeIdeas[0].targetPlayerIds, dataset.players)}</p><p className="mt-1 text-sm text-slate-300">Offer {playerNames(dataset.tradeIdeas[0].givePlayerIds, dataset.players)} to {dataset.tradeIdeas[0].counterpartyTeamName}.</p><p className="mt-2 text-xs leading-5 text-cyan-100/75">{dataset.tradeIdeas[0].constructionSummary}</p><p className="mt-2 text-xs leading-5 text-violet-100/75">Anchor check: {dataset.tradeIdeas[0].qualitySummary}</p><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-black/20 p-3"><p className="text-xl font-black text-emerald-200">{signed(dataset.tradeIdeas[0].starterDelta)}</p><p className="text-[11px] font-bold uppercase text-slate-500">starter value</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xl font-black text-cyan-200">{signed(dataset.tradeIdeas[0].playoffUpsideDelta)}</p><p className="text-[11px] font-bold uppercase text-slate-500">upside</p></div></div><Button className="mt-4 w-full" onClick={() => setView("trades")}>Open trade lab</Button></> : <p className="mt-3 text-sm text-slate-400">No mutually useful trade clears the current threshold.</p>}</section>
            <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-200"><BellRing className="h-4 w-4" /> News to recommendation</div><Textarea value={newsText} onChange={(event) => setNewsText(event.target.value)} placeholder="Paste an injury alert, beat report, or Sleeper notification…" className="mt-3 min-h-24 bg-black/25" /><Button className="mt-2 w-full" variant="secondary" disabled={!newsText.trim() || newsSubmitting} onClick={() => void submitNews()}>{newsSubmitting ? "Matching…" : "Ingest update"}</Button>{newsResult ? <p className="mt-3 text-xs leading-5 text-slate-300">{newsResult}</p> : null}</section>
          </aside>
          </div>
        </div> : null}

        {view === "today" ? <div className="mt-4 space-y-4">
          <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-4 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Efficiency before headlines</p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-black">Advanced opportunity lab</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">TPRR, YPRR, air-yards share, RYOE, CPOE, and PROE are calculated from verified routes, box scores, play-by-play, and Next Gen Stats. Advanced feeds are posted for the first two finals; Sunday carry, target, and scoring evidence is live while route and charting data remains pending.</p></div><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-black text-amber-100">Sunday routes + FMT pending</span></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">{dataset.teamOffenseEnvironments.map((environment) => <article key={environment.team} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black text-white">{environment.team} offensive environment</p><p className="text-xs text-slate-500">{environment.plays} model-eligible pass/run plays</p></div><span className={cn("rounded-full px-2.5 py-1 text-xs font-black", environment.proe >= 0 ? "bg-emerald-300/15 text-emerald-200" : "bg-rose-300/15 text-rose-200")}>{environment.proe >= 0 ? "+" : ""}{environment.proe.toFixed(1)}% PROE</span></div><div className="mt-3 space-y-2">{environment.quarterbacks.map((quarterback) => <div key={quarterback.playerName} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm"><span className="font-bold">{quarterback.playerName} <span className="font-normal text-slate-500">· {quarterback.attempts} att</span></span><span className="font-black text-cyan-200">{quarterback.cpoe >= 0 ? "+" : ""}{quarterback.cpoe.toFixed(1)} CPOE</span></div>)}</div></article>)}</div>
          </section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Model signals</p><h2 className="mt-1 text-2xl font-black">What the box score misses</h2></div><p className="text-xs text-slate-500">Sorted by advanced-signal magnitude, not fantasy points</p></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dataset.advancedMetricSignals.map((signal) => <article key={`${signal.playerId}-${signal.classification}`} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-white">{signal.playerName}</p><p className="text-xs text-slate-500">{signal.position} · {signal.rosterContext}</p></div><span className={cn("rounded-full px-2 py-1 text-[10px] font-black uppercase", signal.confidence === "medium" || signal.confidence === "high" ? "bg-violet-300/15 text-violet-100" : "bg-white/[0.06] text-slate-400")}>{signal.confidence} sample</span></div><p className="mt-3 text-sm font-black text-cyan-100">{signal.headline}</p><div className="mt-2 flex flex-wrap gap-1.5">{signal.metrics.map((metric) => <span key={metric} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] font-bold text-slate-300">{metric}</span>)}</div><p className="mt-3 text-xs leading-5 text-slate-400">{signal.analysis}</p></article>)}</div></section>
          <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/80"><ShieldAlert className="mr-2 inline h-3.5 w-3.5" /> Forced Missed Tackle Rate is implemented as a first-class metric but remains unavailable for these games until a licensed or explicitly published charting source posts the values. It is not inferred from RYOE, yards after contact, or broken tackles.</section>
        </div> : null}

        {view === "trades" ? <div className="mt-4 grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          {tradeLabSource ? <section className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.08] px-4 py-3 xl:col-span-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wide text-violet-200">Loaded from Buy Low / Sell High</p><p className="mt-1 text-sm font-bold text-white">{tradeLabSource}</p></div><button className="text-xs font-black text-slate-400 hover:text-white" onClick={() => setTradeLabSource(null)}>Clear context</button></div></section> : null}
          <section className="rounded-[28px] border border-emerald-300/15 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Trade analyzer</p><div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1"><button onClick={() => setAnalyzerMode("incoming")} className={cn("rounded-lg px-3 py-2 text-sm font-black", analyzerMode === "incoming" ? "bg-emerald-400 text-slate-950" : "text-slate-400")}>Analyze incoming</button><button onClick={() => setAnalyzerMode("outgoing")} className={cn("rounded-lg px-3 py-2 text-sm font-black", analyzerMode === "outgoing" ? "bg-cyan-300 text-slate-950" : "text-slate-400")}>Build an offer</button></div><h2 className="mt-4 text-2xl font-black">{analyzerMode === "incoming" ? "Grade a proposal you received" : "Build a trade package"}</h2><p className="mt-2 text-sm leading-6 text-slate-400">Add one player per side or match the second slots for a 2-for-2. The result includes current lineup impact, return-adjusted value, and the other manager&apos;s incentive.</p><label className="mt-5 block text-xs font-black uppercase tracking-wide text-slate-400">You send</label><Select value={sendId} onChange={(event) => setSendId(event.target.value)} className="mt-2 h-12 bg-black/25">{myRoster.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}{player.injuryStatus === "IR" ? " · IR" : ""}</option>)}</Select><Select value={send2Id} onChange={(event) => setSend2Id(event.target.value)} className="mt-2 h-12 bg-black/25"><option value="">No second player</option>{myRoster.filter((player) => player.player.id !== sendId).map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}{player.injuryStatus === "IR" ? " · IR" : ""}</option>)}</Select><label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-400">You receive</label><Select value={receiveId} onChange={(event) => { setReceiveId(event.target.value); setReceive2Id(""); }} className="mt-2 h-12 bg-black/25">{tradeTargets.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}{player.injuryStatus === "IR" ? " · IR" : ""}</option>)}</Select><Select value={receive2Id} onChange={(event) => setReceive2Id(event.target.value)} className="mt-2 h-12 bg-black/25"><option value="">No second player</option>{receive2Candidates.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}{player.injuryStatus === "IR" ? " · IR" : ""}</option>)}</Select>{selectedInjuredPlayers.map((player) => <label key={player.player.id} className="mt-3 block rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs font-bold text-amber-100"><span className="block">Projected return · {player.player.fullName}</span><input type="date" value={returnDateOverrides[player.player.id] ?? player.projectedReturnDate ?? ""} onChange={(event) => setReturnDateOverrides((current) => ({ ...current, [player.player.id]: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white" /><span className="mt-2 block font-normal text-amber-100/70">Leave blank to use the conservative unknown-return estimate.</span></label>)}{packageIncomplete ? <p className="mt-3 text-xs font-bold text-amber-200">Add or remove the second player on the other side so the package is balanced.</p> : null}{customTrade ? <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-lg font-black capitalize text-white">{customTrade.verdict}</p><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-black uppercase text-slate-300">{customTrade.balance.replaceAll("-", " ")}</span></div>{customTrade.verdict !== "insufficient-data" ? <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div><p className="font-black text-emerald-200">{signed(customTrade.immediateStarterDelta)}</p><p className="text-[10px] uppercase text-slate-500">your lineup now</p></div><div><p className="font-black text-cyan-200">{signed(customTrade.restOfSeasonDelta)}</p><p className="text-[10px] uppercase text-slate-500">return-adjusted ROS</p></div><div><p className="font-black text-violet-200">{signed(customTrade.marketValueDelta)}</p><p className="text-[10px] uppercase text-slate-500">package value</p></div><div><p className="font-black text-amber-200">{signed(customTrade.counterpartyImmediateDelta)}</p><p className="text-[10px] uppercase text-slate-500">their lineup now</p></div></div> : null}{customTrade.qualityWarning ? <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs font-bold leading-5 text-rose-100">Decision checks: {customTrade.qualityWarning}</p> : null}<p className="mt-3 text-sm leading-6 text-slate-300">{customTrade.rosterFitSummary}</p>{customTrade.injuryNotes.map((note) => <p key={note} className="mt-2 text-xs leading-5 text-amber-100/80">{note}</p>)}</div> : null}</section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200"><Users className="h-4 w-4" /> Weakness-matched offers</div><h2 className="mt-1 text-2xl font-black">Trades the other manager can say yes to</h2><p className="mt-2 text-sm text-slate-400">Packages are prioritized. Injured players use projected-return value, same-position one-for-ones require a real risk benefit, and 2-for-2s must preserve anchor quality and upside.</p><div className="mt-4 space-y-3">{dataset.tradeIdeas.map((idea) => <article key={`${idea.givePlayerIds.join("-")}-${idea.targetPlayerIds.join("-")}`} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">Send {playerNames(idea.givePlayerIds, dataset.players)} <ArrowRight className="mx-1 inline h-4 w-4" /> get {playerNames(idea.targetPlayerIds, dataset.players)}</p><div className="flex gap-2"><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-black uppercase text-cyan-200">{idea.format.replaceAll("-", " ")}</span><span className={cn("rounded-full px-2.5 py-1 text-xs font-black uppercase", idea.verdict === "pursue" ? "bg-emerald-300/15 text-emerald-200" : "bg-amber-300/15 text-amber-100")}>{idea.verdict}</span></div></div><p className="mt-1 text-sm text-slate-400">{idea.counterpartyTeamName} · {idea.summary}</p><p className="mt-2 text-xs leading-5 text-violet-100/75">Anchor check: {idea.qualitySummary}</p><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-lg bg-emerald-300/10 px-2 py-1 text-emerald-200">Now {signed(idea.immediateStarterDelta)}</span><span className="rounded-lg bg-cyan-300/10 px-2 py-1 text-cyan-200">Return-adjusted {signed(idea.restOfSeasonDelta)}</span><span className="rounded-lg bg-white/[0.05] px-2 py-1 text-slate-400">Their now {signed(idea.counterpartyStarterDelta)}</span></div>{idea.injuryNotes.map((note) => <p key={note} className="mt-2 text-xs leading-5 text-amber-100/75">{note}</p>)}{idea.offerTiers.length > 1 ? <div className="mt-4 border-t border-white/10 pt-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Offer ladder</p><div className="mt-2 space-y-2">{idea.offerTiers.map((tier) => <div key={`${tier.tier}-${tier.givePlayerIds.join("-")}`} className="rounded-xl bg-white/[0.04] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className={cn("rounded-full px-2 py-1 text-[11px] font-black uppercase", tier.tier === "lowball" ? "bg-rose-300/10 text-rose-200" : tier.tier === "slight-advantage" ? "bg-amber-300/10 text-amber-100" : "bg-emerald-300/10 text-emerald-200")}>{tier.tier.replaceAll("-", " ")}</span><span className="text-xs font-black text-violet-200">Value {signed(tier.marketValueDelta)}</span></div><p className="mt-2 text-sm font-bold">Offer {playerNames(tier.givePlayerIds, dataset.players)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{tier.summary}</p></div>)}</div></div> : null}</article>)}</div></section>
        </div> : null}

        {view === "today" ? <MarketCorrectionWatch dataset={dataset} onOpenTrade={openTradeFromMarket} /> : null}

        {view === "sync" ? <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-cyan-300/20 bg-[#0a1727] p-5 lg:col-span-2">
            <h2 className="text-xl font-bold">Refresh weekly player evidence</h2>
            <p className="mt-2 text-sm text-slate-300">Pull current-slate box scores and snaps from nflverse, plus Sleeper role and injury context. Route charting and other unavailable advanced feeds remain marked missing. Verified changes rebuild current-week and rest-of-season ranges from the original preseason baseline, so repeat refreshes do not compound.</p>
            <Button className="mt-3" disabled={evidenceRefreshing} onClick={() => void refreshPlayerEvidence()}>{evidenceRefreshing ? "Refreshing…" : "Refresh player evidence"}</Button>
            {evidenceRefreshMessage ? <p role="status" className="mt-3 text-sm text-slate-300">{evidenceRefreshMessage}</p> : null}
          </section>
          <PlayerCoverageReport players={dataset.players} report={coverageReport} />
          <section className="order-first rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/95 p-5 sm:p-6 lg:col-span-2">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200"><FileUp className="h-4 w-4" /> Recommended league sync</div><h2 className="mt-1 text-2xl font-black">Upload Yahoo Starting Rosters PDF</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">In Yahoo, open the league-wide Starting Rosters page, press Ctrl+P or Cmd+P, and save as PDF. The file is read on this device; only the validated roster snapshot is saved.</p></div><label className={cn("flex min-h-12 cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-black transition", pdfLoading ? "cursor-wait bg-white/10 text-slate-400" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200")}><input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={pdfLoading} onChange={(event) => void previewYahooRosterPdf(event.target.files?.[0])} />{pdfLoading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Reading roster pages…</> : <><FileUp className="mr-2 h-4 w-4" /> Choose Yahoo PDF</>}</label></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300"><span className="font-black text-white">Current snapshot:</span> {snapshotTime(dataset.rosterSnapshot.capturedAt)} · {dataset.rosterSnapshot.source}</p><p className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100"><span className="font-black">This-browser persistence:</span> applied rosters survive reloads here, but do not sync to another device. The source PDF itself is never uploaded or stored.</p></div>
            {pdfFileName ? <p className="mt-3 text-xs font-bold text-slate-500">Selected: {pdfFileName}</p> : null}
            {pdfPreview ? <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-2xl bg-emerald-300/[0.07] p-3"><p className="text-2xl font-black text-emerald-200">{pdfPreview.detectedTeams}/{leagueSourceOfTruth.teams}</p><p className="text-[10px] font-black uppercase text-slate-500">teams found</p></div><div className="rounded-2xl bg-cyan-300/[0.07] p-3"><p className="text-2xl font-black text-cyan-200">{pdfPreview.matchedPlayers}</p><p className="text-[10px] font-black uppercase text-slate-500">players matched</p></div><div className="rounded-2xl bg-violet-300/[0.07] p-3"><p className="text-2xl font-black text-violet-200">{pdfRosterChanges}</p><p className="text-[10px] font-black uppercase text-slate-500">ownership changes</p></div><div className={cn("rounded-2xl p-3", pdfPreview.ready ? "bg-emerald-300/[0.07]" : "bg-rose-300/[0.08]")}><p className={cn("text-2xl font-black", pdfPreview.ready ? "text-emerald-200" : "text-rose-200")}>{pdfPreview.ready ? "Ready" : "Blocked"}</p><p className="text-[10px] font-black uppercase text-slate-500">integrity gate</p></div></div>
              {pdfPreview.blockers.map((blocker) => <p key={blocker} className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs font-bold text-rose-100"><ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" /> {blocker}</p>)}
              {pdfPreview.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-xs text-amber-100"><ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" /> {warning}</p>)}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{pdfPreview.teams.map((team) => <details key={team.teamId} className={cn("rounded-xl border p-3", team.players.length >= 14 && team.players.length <= 18 ? "border-white/10 bg-black/20" : "border-rose-300/25 bg-rose-300/[0.06]")}><summary className="cursor-pointer list-none"><p className="truncate text-sm font-black text-white">{team.teamName}</p><p className="mt-1 text-xs text-slate-500">{team.players.length} players · {team.rosterRows} rows</p></summary><div className="mt-3 space-y-1 border-t border-white/10 pt-3">{team.players.map((player) => <p key={player.playerId} className="text-xs text-slate-300">{player.playerName}{player.rosterStatusLabel ? <span className="ml-1 text-amber-200">{player.rosterStatusLabel}</span> : null}</p>)}</div></details>)}</div>
              <div className="grid gap-3 lg:grid-cols-2">
                <details open={pdfPreview.ownershipChanges.length > 0} className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] p-3"><summary className="cursor-pointer text-sm font-black text-violet-100">Ownership changes ({pdfPreview.ownershipChanges.length})</summary><div className="mt-3 max-h-56 space-y-1 overflow-y-auto border-t border-white/10 pt-3">{pdfPreview.ownershipChanges.length ? pdfPreview.ownershipChanges.map((change) => <p key={change.playerId} className="text-xs text-slate-300"><span className="font-bold text-white">{change.playerName}</span> · {change.fromTeamName ?? "Free agent"} → {change.toTeamName ?? "Free agent"}</p>) : <p className="text-xs text-slate-500">No ownership changes from the active snapshot.</p>}</div></details>
                <details open={pdfPreview.unmatchedRosterRows > 0} className={cn("rounded-xl border p-3", pdfPreview.unmatchedRosterRows ? "border-rose-300/20 bg-rose-300/[0.06]" : "border-white/10 bg-black/20")}><summary className="cursor-pointer text-sm font-black text-white">Unmatched or ambiguous rows ({pdfPreview.unmatchedRosterRows})</summary><div className="mt-3 max-h-56 space-y-2 overflow-y-auto border-t border-white/10 pt-3">{pdfPreview.unmatchedRows.map((row, index) => <p key={`unmatched-${row.teamId}-${row.page}-${index}`} className="text-xs text-rose-100"><span className="font-bold">{row.teamName} · page {row.page}:</span> {row.text}</p>)}{pdfPreview.ambiguousRows.map((row, index) => <p key={`ambiguous-${row.teamId}-${row.page}-${index}`} className="text-xs text-rose-100"><span className="font-bold">{row.teamName} · page {row.page}:</span> {row.text}<span className="block text-rose-200/70">Could be {row.candidates.join(", ")}</span></p>)}{pdfPreview.unmatchedRosterRows === 0 ? <p className="text-xs text-slate-500">Every roster row matched one modeled player.</p> : null}</div></details>
              </div>
              <Button className="w-full" disabled={!pdfPreview.ready} onClick={applyYahooRosterPdf}>{pdfPreview.ready ? "Apply roster snapshot and recalculate" : "Import blocked - review issues above"}</Button>
            </div> : null}
            {pdfError ? <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{pdfError}</p> : null}
          </section>
          <section className="rounded-[28px] border border-emerald-300/15 bg-[#0a1727]/92 p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300"><RefreshCw className="h-4 w-4" /> Yahoo Chrome bridge</div><h2 className="mt-1 text-2xl font-black">Read the league you already have open</h2><p className="mt-2 text-sm leading-6 text-slate-400">The read-only bridge captures your roster, every other roster, and available players without moving Yahoo credentials out of Chrome.</p><Button className="mt-5 w-full" onClick={() => void refreshYahoo()} disabled={yahoo.state === "checking"}>{yahoo.state === "checking" ? "Checking…" : "Refresh Yahoo inventory"}</Button><div className={cn("mt-3 rounded-2xl border p-4 text-sm", yahoo.state === "connected" || yahoo.state === "manual" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50" : yahoo.state === "error" ? "border-rose-300/25 bg-rose-300/10 text-rose-50" : "border-white/10 bg-black/20 text-slate-300")}><div className="flex gap-2">{yahoo.state === "connected" || yahoo.state === "manual" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}<p className="leading-6">{yahoo.message}</p></div>{yahoo.receivedAt ? <p className="mt-2 text-xs opacity-70">Last scan {new Date(yahoo.receivedAt).toLocaleString()}</p> : null}</div><a href={`https://football.fantasysports.yahoo.com/f1/${leagueSourceOfTruth.leagueId.replace("yahoo-", "")}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-cyan-100">Open {leagueSourceOfTruth.leagueName} in Yahoo <ExternalLink className="h-4 w-4" /></a></section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-200"><ClipboardPaste className="h-4 w-4" /> Manual fallback</div><h2 className="mt-1 text-2xl font-black">Drop in rosters when Chrome drops</h2><p className="mt-2 text-sm leading-6 text-slate-400">Paste copied Yahoo roster text, a CSV-style list, or team headings followed by player names. It stays on this device.</p><Textarea value={manualRosterText} onChange={(event) => setManualRosterText(event.target.value)} placeholder={"My Team\nJahmyr Gibbs, RB, DET\nAmon-Ra St. Brown, WR, DET\n\nOpponent Team\n…"} className="mt-4 min-h-44 bg-black/25" /><Button className="mt-3 w-full" variant="secondary" onClick={importManualRosters} disabled={!manualRosterText.trim()}><ClipboardPaste className="mr-2 h-4 w-4" /> Import roster snapshot</Button></section>
        </div> : null}

        <section className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-slate-500"><Search className="mr-2 inline h-3.5 w-3.5" /> Recommendations are advisory and read-only. The agent can prepare an add/drop or trade, but Yahoo remains the final confirmation step.</section>
      </div>
    </main>
  );
}
