"use client";

import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, BadgeDollarSign, BellRing, CheckCircle2,
  ClipboardPaste, ExternalLink, RefreshCw, Search, ShieldAlert,
  Sparkles, Target, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InSeasonCommandCenterDataset, InSeasonPlayerSnapshot, OpportunityTrendSnapshot } from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { applyYahooLeagueInventory } from "@/lib/fantasy/yahooInventory";
import type { YahooLeagueInventorySnapshot } from "@/lib/fantasy/yahooBridge";
import { buildOpportunityTrendSnapshots, buildTradeIdeaSnapshots, buildTransactionQueue, buildWaiverRecommendationSnapshots } from "@/lib/fantasy/inSeason";
import { cn } from "@/lib/utils";

type View = "today" | "trades" | "market" | "sync";
type YahooStatus = {
  state: "idle" | "checking" | "connected" | "empty" | "error" | "manual";
  message: string;
  receivedAt?: string;
  playerCount?: number;
  availableCount?: number;
};

const MANUAL_ROSTER_KEY = "fantasy-in-season-manual-rosters-v1";

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
  if (classification === "early-edge") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (classification === "market-awakening") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (classification === "hype-without-usage") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (classification === "role-collapse") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
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

export function InSeasonCommandCenter({ dataset: initialDataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [dataset, setDataset] = useState(initialDataset);
  const [view, setView] = useState<View>("today");
  const [yahoo, setYahoo] = useState<YahooStatus>({ state: "idle", message: "Ready to read the latest league inventory from the Yahoo Chrome bridge." });
  const [manualRosterText, setManualRosterText] = useState("");
  const [newsText, setNewsText] = useState("");
  const [newsResult, setNewsResult] = useState<string | null>(null);
  const [newsSubmitting, setNewsSubmitting] = useState(false);
  const myRoster = useMemo(
    () => dataset.players.filter((player) => player.availability === "my-roster" && player.injuryStatus !== "IR" && playerPosition(player) !== "K"),
    [dataset.players],
  );
  const tradeTargets = useMemo(
    () => dataset.players.filter(
      (player) =>
        (player.availability === "trade-target" || player.availability === "league-rostered") &&
        playerPosition(player) !== "K" &&
        player.injuryStatus !== "IR",
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
  const customTrade = useMemo(() => {
    const send = [sendId, send2Id].filter(Boolean).map((id) => dataset.players.find((player) => player.player.id === id));
    const receive = [receiveId, receive2Id].filter(Boolean).map((id) => dataset.players.find((player) => player.player.id === id));
    if (packageIncomplete || send.some((player) => !player) || receive.some((player) => !player)) return null;
    const sentPlayers = send.filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
    const receivedPlayers = receive.filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
    if (!sentPlayers.length || sentPlayers.length !== receivedPlayers.length || new Set(receivedPlayers.map((player) => player.rosterTeamId)).size !== 1) return null;
    const rosDelta = receivedPlayers.reduce((sum, player) => sum + player.rosProjection.p50, 0) - sentPlayers.reduce((sum, player) => sum + player.rosProjection.p50, 0);
    const weeklyDelta = receivedPlayers.reduce((sum, player) => sum + player.weeklyProjection.p50, 0) - sentPlayers.reduce((sum, player) => sum + player.weeklyProjection.p50, 0);
    const ceilingDelta = receivedPlayers.reduce((sum, player) => sum + player.rosProjection.p90, 0) - sentPlayers.reduce((sum, player) => sum + player.rosProjection.p90, 0);
    const verdict = rosDelta >= 12 || (rosDelta >= 0 && weeklyDelta >= 1.5)
      ? "Accept / pursue"
      : rosDelta >= -8 && ceilingDelta > 0 ? "Fair, price-sensitive" : "Decline / counter";
    return { rosDelta, weeklyDelta, ceilingDelta, verdict };
  }, [dataset.players, packageIncomplete, receive2Id, receiveId, send2Id, sendId]);

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
      const applied = applyYahooLeagueInventory(initialDataset.players, body.inventorySnapshot);
      const myTeam = {
        teamId: body.inventorySnapshot.myTeamId,
        name: "My Team",
        playerIds: applied.players.filter((player) => player.availability === "my-roster").map((player) => player.player.id),
      };
      const leagueTeamIds = Array.from(new Set(applied.players.map((player) => player.rosterTeamId).filter((teamId): teamId is string => Boolean(teamId))));
      const leagueTeams = leagueTeamIds.map((teamId) => ({
        teamId,
        name: teamId === body.inventorySnapshot!.myTeamId ? "My Team" : `Yahoo Team ${teamId}`,
        playerIds: applied.players.filter((player) => player.rosterTeamId === teamId).map((player) => player.player.id),
      }));
      const opportunityTrends = buildOpportunityTrendSnapshots(applied.players);
      const tradeIdeas = buildTradeIdeaSnapshots(applied.players, myTeam, leagueTeams);
      const waiverRecommendations = buildWaiverRecommendationSnapshots(applied.players, myTeam);
      setDataset({
        ...initialDataset,
        players: applied.players,
        myTeam,
        leagueTeams,
        opportunityTrends,
        tradeIdeas,
        waiverRecommendations,
        actionQueue: buildTransactionQueue(waiverRecommendations, tradeIdeas),
      });
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
    ["today", "Agent Brief", Sparkles], ["trades", "Trade Lab", BadgeDollarSign],
    ["market", "Buy Low / Sell High", TrendingUp], ["sync", "League Sync", RefreshCw],
  ];

  return (
    <main className="min-h-screen bg-[#06101d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(16,185,129,0.14),transparent_33%),radial-gradient(circle_at_92%_4%,rgba(34,211,238,0.11),transparent_27%)]" />
      <div className="relative mx-auto w-full max-w-[1440px] px-3 pb-24 pt-4 sm:px-6 sm:pt-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0a1727]/92 shadow-2xl shadow-black/25">
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-emerald-300"><Activity className="h-4 w-4" /> Mid-season agent</div>
              <h1 className="mt-2 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Find the move your league is leaving open.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Roster weaknesses, usage before headlines, correction candidates, and exact trades that improve your starting lineup.</p>
            </div>
            <button onClick={() => { setView("sync"); void refreshYahoo(); }} className="group rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4 text-left transition hover:bg-emerald-300/[0.12]">
              <span className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Yahoo league state <RefreshCw className="h-4 w-4 transition group-hover:rotate-45" /></span>
              <span className="mt-2 block text-sm font-bold text-white">{yahoo.state === "connected" ? "Inventory connected" : "Refresh rosters + free agents"}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">Chrome bridge first; manual paste always available.</span>
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/10 bg-black/20 p-1.5" aria-label="Mid-season tools">
            {nav.map(([id, label, Icon]) => <button key={id} onClick={() => setView(id)} className={cn("flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition", view === id ? "bg-emerald-400 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white")}><Icon className="h-4 w-4" /> {label}</button>)}
          </nav>
        </section>

        {view === "today" ? <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Recommended actions</p><h2 className="mt-1 text-2xl font-black">This week&apos;s edge queue</h2></div><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-400">Yahoo rosters · Sep 8, 9:42 AM</span></div>
            <div className="mt-4 space-y-3">{dataset.actionQueue.map((action, index) => <article key={action.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400 font-black text-slate-950">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black">{actionTitle(action)}</p><span className={cn("rounded-full px-2 py-1 text-[11px] font-black uppercase", action.priority === "immediate" ? "bg-rose-300/15 text-rose-200" : action.priority === "this-week" ? "bg-amber-300/15 text-amber-100" : "bg-white/[0.06] text-slate-400")}>{action.priority.replace("-", " ")}</span></div><p className="mt-1 text-sm leading-6 text-slate-400">{action.summary}</p>{action.faabRange ? <p className="mt-2 text-xs font-black text-cyan-200">Suggested bid: {action.faabRange.label}</p> : null}</div><ArrowRight className="mt-2 h-4 w-4 shrink-0 text-slate-600" /></div></article>)}</div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-[28px] border border-cyan-300/15 bg-cyan-300/[0.06] p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200"><Target className="h-4 w-4" /> Best surplus-value angle</div>{dataset.tradeIdeas[0] ? <><p className="mt-3 text-xl font-black">Get {playerNames(dataset.tradeIdeas[0].targetPlayerIds, dataset.players)}</p><p className="mt-1 text-sm text-slate-300">Offer {playerNames(dataset.tradeIdeas[0].givePlayerIds, dataset.players)} to {dataset.tradeIdeas[0].counterpartyTeamName}.</p><p className="mt-2 text-xs leading-5 text-cyan-100/75">{dataset.tradeIdeas[0].constructionSummary}</p><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-black/20 p-3"><p className="text-xl font-black text-emerald-200">{signed(dataset.tradeIdeas[0].starterDelta)}</p><p className="text-[11px] font-bold uppercase text-slate-500">starter value</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-xl font-black text-cyan-200">{signed(dataset.tradeIdeas[0].playoffUpsideDelta)}</p><p className="text-[11px] font-bold uppercase text-slate-500">upside</p></div></div><Button className="mt-4 w-full" onClick={() => setView("trades")}>Open trade lab</Button></> : <p className="mt-3 text-sm text-slate-400">No mutually useful trade clears the current threshold.</p>}</section>
            <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-200"><BellRing className="h-4 w-4" /> News to recommendation</div><Textarea value={newsText} onChange={(event) => setNewsText(event.target.value)} placeholder="Paste an injury alert, beat report, or Sleeper notification…" className="mt-3 min-h-24 bg-black/25" /><Button className="mt-2 w-full" variant="secondary" disabled={!newsText.trim() || newsSubmitting} onClick={() => void submitNews()}>{newsSubmitting ? "Matching…" : "Ingest update"}</Button>{newsResult ? <p className="mt-3 text-xs leading-5 text-slate-300">{newsResult}</p> : null}</section>
          </aside>
        </div> : null}

        {view === "trades" ? <div className="mt-4 grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
          <section className="rounded-[28px] border border-emerald-300/15 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Custom analyzer</p><h2 className="mt-1 text-2xl font-black">Build a trade package</h2><p className="mt-2 text-sm leading-6 text-slate-400">Start with a one-for-one, then add a second player on both sides to test a 2-for-2.</p><label className="mt-5 block text-xs font-black uppercase tracking-wide text-slate-400">You send</label><Select value={sendId} onChange={(event) => setSendId(event.target.value)} className="mt-2 h-12 bg-black/25">{myRoster.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}</option>)}</Select><Select value={send2Id} onChange={(event) => setSend2Id(event.target.value)} className="mt-2 h-12 bg-black/25"><option value="">No second player</option>{myRoster.filter((player) => player.player.id !== sendId).map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}</option>)}</Select><label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-400">You receive</label><Select value={receiveId} onChange={(event) => { setReceiveId(event.target.value); setReceive2Id(""); }} className="mt-2 h-12 bg-black/25">{tradeTargets.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}</option>)}</Select><Select value={receive2Id} onChange={(event) => setReceive2Id(event.target.value)} className="mt-2 h-12 bg-black/25"><option value="">No second player</option>{receive2Candidates.map((player) => <option key={player.player.id} value={player.player.id}>{player.player.fullName} · {playerPosition(player)}</option>)}</Select>{packageIncomplete ? <p className="mt-3 text-xs font-bold text-amber-200">Add or remove the second player on the other side so the package is balanced.</p> : null}{customTrade ? <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-lg font-black text-white">{customTrade.verdict}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="font-black text-emerald-200">{signed(customTrade.rosDelta)}</p><p className="text-[10px] uppercase text-slate-500">ROS</p></div><div><p className="font-black text-cyan-200">{signed(customTrade.weeklyDelta)}</p><p className="text-[10px] uppercase text-slate-500">weekly</p></div><div><p className="font-black text-violet-200">{signed(customTrade.ceilingDelta)}</p><p className="text-[10px] uppercase text-slate-500">ceiling</p></div></div><p className="mt-3 text-xs leading-5 text-slate-400">This package read compares total player value. The league-generated ideas go further by testing whether the pieces improve both teams&apos; actual starting lineups.</p></div> : null}</section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200"><Users className="h-4 w-4" /> Weakness-matched offers</div><h2 className="mt-1 text-2xl font-black">Trades the other manager can say yes to</h2><p className="mt-2 text-sm text-slate-400">Packages are prioritized. Same-position one-for-ones only appear for a meaningful risk or correlation benefit.</p><div className="mt-4 space-y-3">{dataset.tradeIdeas.map((idea) => <article key={`${idea.givePlayerIds.join("-")}-${idea.targetPlayerIds.join("-")}`} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">Send {playerNames(idea.givePlayerIds, dataset.players)} <ArrowRight className="mx-1 inline h-4 w-4" /> get {playerNames(idea.targetPlayerIds, dataset.players)}</p><div className="flex gap-2"><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-black uppercase text-cyan-200">{idea.format.replaceAll("-", " ")}</span><span className={cn("rounded-full px-2.5 py-1 text-xs font-black uppercase", idea.verdict === "pursue" ? "bg-emerald-300/15 text-emerald-200" : "bg-amber-300/15 text-amber-100")}>{idea.verdict}</span></div></div><p className="mt-1 text-sm text-slate-400">{idea.counterpartyTeamName} · {idea.summary}</p><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-lg bg-emerald-300/10 px-2 py-1 text-emerald-200">Starter {signed(idea.starterDelta)}</span><span className="rounded-lg bg-cyan-300/10 px-2 py-1 text-cyan-200">Playoff ceiling {signed(idea.playoffUpsideDelta)}</span><span className="rounded-lg bg-white/[0.05] px-2 py-1 text-slate-400">Their starters {signed(idea.counterpartyStarterDelta)}</span></div></article>)}</div></section>
        </div> : null}

        {view === "market" ? <section className="mt-4 rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Role versus reputation</p><h2 className="mt-1 text-2xl font-black">Correction watch</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Usage tells us who may change next; market activity tells us whether the rest of the league has noticed.</p>{dataset.opportunityTrends.every((trend) => trend.classification === "steady") ? <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-5"><p className="font-black text-cyan-100">Week 1 baseline is set</p><p className="mt-2 text-sm leading-6 text-slate-300">There are no regular-season snaps yet, so the agent is correctly withholding buy-low and sell-high claims. This board will activate when routes, carries, targets, and market movement provide evidence.</p></div> : <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dataset.opportunityTrends.map((trend) => { const player = dataset.players.find((entry) => entry.player.id === trend.playerId); const rising = trend.opportunityScore >= 0; return <article key={trend.playerId} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{player?.player.fullName ?? trend.playerId}</p><p className="text-xs text-slate-500">{player ? `${playerPosition(player)} · ${player.player.team}` : ""}</p></div><span className={cn("rounded-full border px-2 py-1 text-[10px] font-black uppercase", trendTone(trend.classification))}>{trend.classification.replaceAll("-", " ")}</span></div><div className="mt-4 flex items-center gap-2">{rising ? <TrendingUp className="h-5 w-5 text-emerald-300" /> : <TrendingDown className="h-5 w-5 text-rose-300" />}<span className="text-2xl font-black">{signed(trend.opportunityScore)}</span><span className="text-xs text-slate-500">opportunity</span></div><p className="mt-3 text-sm leading-6 text-slate-300">{trend.summary}</p><p className="mt-3 text-xs font-black uppercase text-cyan-200">Agent call: {trend.recommendation.replace("-", " ")}</p></article>; })}</div>}</section> : null}

        {view === "sync" ? <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[28px] border border-emerald-300/15 bg-[#0a1727]/92 p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300"><RefreshCw className="h-4 w-4" /> Yahoo Chrome bridge</div><h2 className="mt-1 text-2xl font-black">Read the league you already have open</h2><p className="mt-2 text-sm leading-6 text-slate-400">The read-only bridge captures your roster, every other roster, and available players without moving Yahoo credentials out of Chrome.</p><Button className="mt-5 w-full" onClick={() => void refreshYahoo()} disabled={yahoo.state === "checking"}>{yahoo.state === "checking" ? "Checking…" : "Refresh Yahoo inventory"}</Button><div className={cn("mt-3 rounded-2xl border p-4 text-sm", yahoo.state === "connected" || yahoo.state === "manual" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50" : yahoo.state === "error" ? "border-rose-300/25 bg-rose-300/10 text-rose-50" : "border-white/10 bg-black/20 text-slate-300")}><div className="flex gap-2">{yahoo.state === "connected" || yahoo.state === "manual" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}<p className="leading-6">{yahoo.message}</p></div>{yahoo.receivedAt ? <p className="mt-2 text-xs opacity-70">Last scan {new Date(yahoo.receivedAt).toLocaleString()}</p> : null}</div><a href={`https://football.fantasysports.yahoo.com/f1/${leagueSourceOfTruth.leagueId.replace("yahoo-", "")}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-cyan-100">Open {leagueSourceOfTruth.leagueName} in Yahoo <ExternalLink className="h-4 w-4" /></a></section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-200"><ClipboardPaste className="h-4 w-4" /> Manual fallback</div><h2 className="mt-1 text-2xl font-black">Drop in rosters when Chrome drops</h2><p className="mt-2 text-sm leading-6 text-slate-400">Paste copied Yahoo roster text, a CSV-style list, or team headings followed by player names. It stays on this device.</p><Textarea value={manualRosterText} onChange={(event) => setManualRosterText(event.target.value)} placeholder={"My Team\nJahmyr Gibbs, RB, DET\nAmon-Ra St. Brown, WR, DET\n\nOpponent Team\n…"} className="mt-4 min-h-44 bg-black/25" /><Button className="mt-3 w-full" variant="secondary" onClick={importManualRosters} disabled={!manualRosterText.trim()}><ClipboardPaste className="mr-2 h-4 w-4" /> Import roster snapshot</Button></section>
        </div> : null}

        <section className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-slate-500"><Search className="mr-2 inline h-3.5 w-3.5" /> Recommendations are advisory and read-only. The agent can prepare an add/drop or trade, but Yahoo remains the final confirmation step.</section>
      </div>
    </main>
  );
}
