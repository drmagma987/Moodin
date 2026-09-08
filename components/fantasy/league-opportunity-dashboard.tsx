"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, HeartPulse, SlidersHorizontal, Sparkles, Target, Users } from "lucide-react";
import type { InSeasonCommandCenterDataset, InSeasonPlayerSnapshot } from "@/lib/fantasy/types";
import {
  buildLeagueOpportunityDashboard,
  defaultOpportunityPreferences,
  type OpportunityGroup,
  type OpportunityPreferences,
  type OpportunityProposal,
  type PlayerIntent,
  type PlayerOutlook,
  type TeamStrategy,
} from "@/lib/fantasy/leagueOpportunity";
import { cn } from "@/lib/utils";

const PREFERENCE_KEY = "fantasy-league-opportunity-preferences-v1";
const GROUPS: OpportunityGroup[] = ["QB", "RB", "WR", "TE", "FLEX", "Bench"];
const INTENTS: Array<[PlayerIntent, string]> = [
  ["neutral", "No roster tag"], ["untouchable", "Untouchable"], ["prefer-keep", "Prefer to keep"],
  ["actively-shop", "Actively shop"], ["buy-low", "Buy-low target"], ["willing-stash", "Willing to stash"],
];
const OUTLOOKS: Array<[PlayerOutlook, string]> = [["bullish", "Bullish"], ["neutral", "Neutral"], ["bearish", "Bearish"]];

function gradeTone(grade: number) {
  if (grade >= 80) return "border-emerald-300/30 bg-emerald-300/15 text-emerald-100";
  if (grade >= 60) return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (grade >= 40) return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatLabel(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function proposalNames(ids: string[], byId: Map<string, InSeasonPlayerSnapshot>) {
  return ids.map((id) => byId.get(id)?.player.fullName ?? id).join(" + ");
}

function PlayerPreferenceControls({
  player,
  preferences,
  onChange,
}: {
  player: InSeasonPlayerSnapshot;
  preferences: OpportunityPreferences;
  onChange: (next: OpportunityPreferences) => void;
}) {
  const current = preferences.players[player.player.id] ?? { intent: "neutral", outlook: "neutral" };
  const update = (patch: Partial<typeof current>) => onChange({
    ...preferences,
    players: { ...preferences.players, [player.player.id]: { ...current, ...patch } },
  });
  return <div className="grid grid-cols-[minmax(0,1fr)_130px_100px] items-center gap-2 border-t border-white/5 py-2 first:border-0">
    <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{player.player.fullName}</p><p className="text-[11px] text-slate-500">{player.player.positions[0]} · {player.injuryStatus === "IR" ? "IR · future value retained" : player.player.team}</p></div>
    <select aria-label={`${player.player.fullName} roster preference`} value={current.intent} onChange={(event) => update({ intent: event.target.value as PlayerIntent })} className="h-9 min-w-0 rounded-lg border border-white/10 bg-[#071321] px-2 text-xs text-slate-200">
      {INTENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <select aria-label={`${player.player.fullName} outlook`} value={current.outlook} onChange={(event) => update({ outlook: event.target.value as PlayerOutlook })} className="h-9 min-w-0 rounded-lg border border-white/10 bg-[#071321] px-2 text-xs text-slate-200">
      {OUTLOOKS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </div>;
}

function ProposalCard({ proposal, byId }: { proposal: OpportunityProposal; byId: Map<string, InSeasonPlayerSnapshot> }) {
  return <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs font-black uppercase tracking-wide text-cyan-200">{formatLabel(proposal.format)} · {formatLabel(proposal.tier)}</p><p className="mt-1 font-black">Send {proposalNames(proposal.sendPlayerIds, byId)}</p><p className="text-sm font-bold text-emerald-200">Get {proposalNames(proposal.receivePlayerIds, byId)}</p></div>
      <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-black">Fit {proposal.score.toFixed(0)}</span>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-xl bg-emerald-300/[0.07] p-2"><p className="font-black text-emerald-200">{signed(proposal.myEffect.immediateDelta)}</p><p className="text-[9px] uppercase text-slate-500">your lineup now</p></div>
      <div className="rounded-xl bg-cyan-300/[0.07] p-2"><p className="font-black text-cyan-200">{signed(proposal.myEffect.futureDelta)}</p><p className="text-[9px] uppercase text-slate-500">your future</p></div>
      <div className="rounded-xl bg-amber-300/[0.07] p-2"><p className="font-black text-amber-100">{signed(proposal.theirEffect.immediateDelta)}</p><p className="text-[9px] uppercase text-slate-500">their lineup now</p></div>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-300">{proposal.whyAccept}</p>
    <details className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-300">Exact marginal lineup effect</summary>
      <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
        {proposal.myEffect.replacements.length ? proposal.myEffect.replacements.map((replacement) => <p key={`${replacement.incomingPlayerId}-${replacement.slot}`}><span className="font-bold text-white">{proposalNames([replacement.incomingPlayerId], byId)}</span> enters {replacement.slot}, replacing {replacement.replacedPlayerId ? proposalNames([replacement.replacedPlayerId], byId) : "an open starter slot"}.</p>) : <p>No incoming player enters your current starting lineup.</p>}
        <p>Outgoing starters: {proposal.myEffect.outgoingStarters.length ? proposalNames(proposal.myEffect.outgoingStarters, byId) : "none"}. Outgoing bench: {proposal.myEffect.outgoingBench.length ? proposalNames(proposal.myEffect.outgoingBench, byId) : "none"}.</p>
        <p>Incoming bench: {proposal.myEffect.incomingBench.length ? proposalNames(proposal.myEffect.incomingBench, byId) : "none"}. Unused incoming value: {proposal.myEffect.unusedIncomingValue.toFixed(1)}.</p>
        <p>{proposal.futureSummary}</p>
        <p>Their outgoing starters: {proposal.theirEffect.outgoingStarters.length ? proposalNames(proposal.theirEffect.outgoingStarters, byId) : "none"}; their incoming starters: {proposal.theirEffect.incomingStarters.length ? proposalNames(proposal.theirEffect.incomingStarters, byId) : "none"}.</p>
      </div>
    </details>
    {proposal.preferenceReasons.map((reason) => <p key={reason} className="mt-2 rounded-lg bg-violet-300/10 px-3 py-2 text-xs font-bold text-violet-100"><Sparkles className="mr-1 inline h-3 w-3" /> Preference-adjusted: {reason}</p>)}
    {proposal.warnings.map((warning) => <p key={warning} className="mt-2 rounded-lg bg-amber-300/10 px-3 py-2 text-xs text-amber-100"><CircleAlert className="mr-1 inline h-3 w-3" /> {warning}</p>)}
  </article>;
}

export function LeagueOpportunityDashboard({ dataset }: { dataset: InSeasonCommandCenterDataset }) {
  const [preferences, setPreferences] = useState<OpportunityPreferences>(defaultOpportunityPreferences);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [proposalTab, setProposalTab] = useState<"one-for-one" | "packages" | "consolidation">("one-for-one");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const byId = useMemo(() => new Map(dataset.players.map((player) => [player.player.id, player] as const)), [dataset.players]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(PREFERENCE_KEY);
        if (saved) setPreferences({ ...defaultOpportunityPreferences, ...JSON.parse(saved) as OpportunityPreferences });
      } catch { /* Ignore malformed device-local settings. */ }
      setPreferencesReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (preferencesReady) window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
  }, [preferences, preferencesReady]);

  const dashboard = useMemo(
    () => buildLeagueOpportunityDashboard(dataset.players, dataset.myTeam, dataset.leagueTeams, preferences),
    [dataset.leagueTeams, dataset.myTeam, dataset.players, preferences],
  );
  const selectedPartner = dashboard.partners.find((partner) => partner.teamId === selectedTeamId) ?? null;
  const selectedProfile = dashboard.teams.find((team) => team.teamId === selectedTeamId) ?? null;
  const selectedRoster = selectedTeamId ? dataset.players.filter((player) => player.rosterTeamId === selectedTeamId && player.player.positions[0] !== "K") : [];
  const myRoster = dataset.players.filter((player) => player.rosterTeamId === dataset.myTeam.teamId && player.player.positions[0] !== "K");
  const proposalFilter = (proposal: OpportunityProposal) => proposalTab === "one-for-one" ? proposal.format === "one-for-one" : proposalTab === "packages" ? proposal.format === "two-for-two" : proposal.format === "two-for-one" || proposal.format === "one-for-two";
  const proposals = selectedPartner?.proposals.filter(proposalFilter).slice(0, 4) ?? [];

  return <div className="mt-4 space-y-4">
    <section className="overflow-hidden rounded-[28px] border border-emerald-300/20 bg-[#0a1727]/95">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">FC Netanyah00 diagnosis</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">{dashboard.diagnosis.recommendedAction}</h2><p className="mt-3 text-sm leading-6 text-slate-400">The model sees <span className="font-bold text-emerald-200">{dashboard.diagnosis.strongestGroup}</span> as your strongest group and <span className="font-bold text-rose-200">{dashboard.diagnosis.weakestGroup}</span> as the clearest weakness. Grades use this league&apos;s three-WR, two-FLEX starting requirements.</p></div>
        <div className="grid grid-cols-2 gap-2">
          {[["Strongest", dashboard.diagnosis.strongestGroup], ["Weakest", dashboard.diagnosis.weakestGroup], ["Upgrade first", dashboard.diagnosis.bestUpgradeGroup], ["Weakest starter", dashboard.diagnosis.weakestStarterId ? proposalNames([dashboard.diagnosis.weakestStarterId], byId) : "Open slot"]].map(([label, answer]) => <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 font-black text-white">{answer}</p></div>)}
        </div>
      </div>
      <div className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3">
        <div className="bg-[#0a1727] p-4"><p className="text-xs font-black uppercase text-cyan-200">Expendable depth</p><p className="mt-1 text-sm text-slate-300">{dashboard.diagnosis.expendablePlayerIds.length ? proposalNames(dashboard.diagnosis.expendablePlayerIds, byId) : "No safe surplus identified"}</p></div>
        <div className="bg-[#0a1727] p-4"><p className="text-xs font-black uppercase text-violet-200">Value stranded on bench</p><p className="mt-1 text-sm text-slate-300">{dashboard.diagnosis.strandedBenchPlayerIds.length ? proposalNames(dashboard.diagnosis.strandedBenchPlayerIds, byId) : "No unusual bench blockage"}</p></div>
        <div className="bg-[#0a1727] p-4"><p className="text-xs font-black uppercase text-amber-200">Injured, not expendable</p><p className="mt-1 text-sm text-slate-300">{dashboard.diagnosis.injuredKeepPlayerIds.length ? proposalNames(dashboard.diagnosis.injuredKeepPlayerIds, byId) : "No protected IR value on this roster"}</p></div>
      </div>
    </section>

    <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Weekly opportunity board</p><h2 className="mt-1 text-2xl font-black">Nine questions, ranked answers</h2></div><span className="text-xs font-bold text-slate-500">No fabricated usage signals</span></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{dashboard.weeklyBoard.map((item, index) => <article key={item.label} className={cn("rounded-2xl border p-4", item.available ? "border-white/10 bg-black/20" : "border-white/5 bg-black/10 opacity-70")}><div className="flex gap-3"><span className="text-xl font-black text-slate-600">{index + 1}</span><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{item.label}</p><p className="mt-1 font-black text-white">{item.value}</p><p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p></div></div></article>)}</div>
    </section>

    <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">League position-group heatmap</p><h2 className="mt-1 text-2xl font-black">Strength, depth and health—relative to your league</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">FLEX is allocated only after QB/RB/WR/TE starters, so the same player never receives credit twice. Tap any grade for its numerical inputs.</p></div>
      <div className="mt-4 overflow-x-auto pb-2"><div className="min-w-[850px]">
        <div className="grid grid-cols-[190px_repeat(6,minmax(95px,1fr))] gap-2 px-2 text-[10px] font-black uppercase tracking-wide text-slate-500"><span>Team</span>{GROUPS.map((group) => <span key={group} className="text-center">{group}</span>)}</div>
        <div className="mt-2 space-y-2">{dashboard.teams.map((team) => <div key={team.teamId} className={cn("grid grid-cols-[190px_repeat(6,minmax(95px,1fr))] gap-2 rounded-2xl p-2", team.teamId === dataset.myTeam.teamId ? "bg-emerald-300/[0.07] ring-1 ring-emerald-300/20" : "bg-black/15")}><button onClick={() => team.teamId !== dataset.myTeam.teamId && setSelectedTeamId(team.teamId)} className="text-left"><span className="block truncate text-sm font-black text-white">{team.teamName}</span><span className="text-[10px] text-slate-500">{team.teamId === dataset.myTeam.teamId ? "Your roster" : "Open partner view"}</span></button>{GROUPS.map((group) => { const grade = team.groups[group]; return <details key={group} className={cn("rounded-xl border text-center", gradeTone(grade.grade))}><summary className="cursor-pointer list-none p-2"><span className="block text-lg font-black">{grade.grade}</span><span className="text-[9px] font-bold uppercase">{grade.label}</span></summary><div className="relative z-10 min-w-44 border-t border-current/10 p-2 text-left text-[10px] leading-4"><p>Starter {grade.measurements.startingStrength} · P{grade.percentiles.startingStrength}</p><p>Depth {grade.measurements.depth} · P{grade.percentiles.depth}</p><p>Ceiling {grade.measurements.ceiling} · P{grade.percentiles.ceiling}</p><p>Health {grade.measurements.health}% · P{grade.percentiles.health}</p><p>Surplus P{grade.percentiles.surplus}</p></div></details>; })}</div>)}</div>
      </div></div>
    </section>

    <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-6">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300"><Users className="h-4 w-4" /> Trade-partner map</div><h2 className="mt-1 text-2xl font-black">Not every roster is a match</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dashboard.partners.map((partner, index) => <button key={partner.teamId} onClick={() => setSelectedTeamId(partner.teamId)} className={cn("rounded-2xl border p-4 text-left transition hover:-translate-y-0.5", partner.viable ? "border-emerald-300/20 bg-emerald-300/[0.06]" : "border-white/10 bg-black/20")}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase text-slate-500">#{index + 1} partner</p><p className="font-black text-white">{partner.teamName}</p></div><span className={cn("rounded-full px-2.5 py-1 text-xs font-black", partner.viable ? "bg-emerald-300 text-slate-950" : "bg-white/[0.06] text-slate-400")}>{partner.score}/100</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="font-black text-rose-200">What they need</p><p className="mt-1 text-slate-400">{partner.whatTheyNeed.join(", ") || "No acute need"}</p></div><div><p className="font-black text-cyan-200">What they can move</p><p className="mt-1 text-slate-400">{partner.whatTheyCanMove.join(", ") || "No clear surplus"}</p></div></div><p className="mt-3 text-xs leading-5 text-slate-400">{partner.whyWeMatch}</p></button>)}</div>
    </section>

    {selectedPartner && selectedProfile ? <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/95 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Opponent drill-down</p><h2 className="mt-1 text-3xl font-black">{selectedPartner.teamName}</h2><p className="mt-2 text-sm text-slate-400">Weakest: {selectedProfile.weakestGroup} · strongest: {selectedProfile.strongestGroup} · compatibility {selectedPartner.score}/100</p></div><button onClick={() => setSelectedTeamId(null)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400">Close</button></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase text-rose-200">Clearest weaknesses</p><p className="mt-2 font-bold">{selectedPartner.whatTheyNeed.join(", ") || "No position grades below need threshold"}</p><div className="mt-3 flex flex-wrap gap-2">{GROUPS.map((group) => <span key={group} className={cn("rounded-lg border px-2 py-1 text-xs font-black", gradeTone(selectedProfile.groups[group].grade))}>{group} {selectedProfile.groups[group].grade}</span>)}</div></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase text-cyan-200">Most movable assets</p><p className="mt-2 text-sm leading-6 text-slate-300">{selectedPartner.movablePlayerIds.length ? proposalNames(selectedPartner.movablePlayerIds, byId) : "Their usable depth is too thin to identify a clean movable piece."}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase text-amber-200">Unlikely to move</p><p className="mt-2 text-sm leading-6 text-slate-300">{selectedPartner.protectedPlayerIds.length ? proposalNames(selectedPartner.protectedPlayerIds, byId) : "No explicit anchor warning beyond normal market value."}</p></div>
      </div>
      <details className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4"><summary className="flex cursor-pointer list-none items-center justify-between font-black">Starters and meaningful depth <ChevronDown className="h-4 w-4" /></summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{selectedRoster.sort((a, b) => b.rosProjection.p50 - a.rosProjection.p50).map((player) => { const starter = selectedProfile.currentLineup.find((slot) => slot.playerId === player.player.id); return <div key={player.player.id} className="rounded-xl bg-white/[0.035] p-3"><div className="flex justify-between gap-2"><p className="font-bold">{player.player.fullName}</p><span className="text-xs font-black text-slate-500">{starter?.slot ?? "Bench"}</span></div><p className="text-xs text-slate-500">{player.player.positions[0]} · ROS {player.rosProjection.p50.toFixed(1)}{player.injuryStatus === "IR" ? " · IR" : ""}</p></div>; })}</div></details>
      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">{[["one-for-one", "1-for-1"], ["packages", "2-for-2"], ["consolidation", "Consolidation"]].map(([value, label]) => <button key={value} onClick={() => setProposalTab(value as typeof proposalTab)} className={cn("rounded-lg px-2 py-2.5 text-xs font-black sm:text-sm", proposalTab === value ? "bg-cyan-300 text-slate-950" : "text-slate-400")}>{label}</button>)}</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{proposals.length ? proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} byId={byId} />) : <div className="rounded-2xl border border-white/10 bg-black/20 p-5 lg:col-span-2"><p className="font-black">No worthwhile {proposalTab === "one-for-one" ? "1-for-1" : proposalTab === "packages" ? "2-for-2 package" : "consolidation trade"} exists.</p><p className="mt-2 text-sm leading-6 text-slate-400">The available combinations fail mutual lineup improvement, market balance, anchor quality, ceiling protection, or depth-to-spare checks. The tool will not manufacture one.</p></div>}</div>
      <details className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] p-4"><summary className="flex cursor-pointer list-none items-center justify-between font-black text-violet-100"><span><SlidersHorizontal className="mr-2 inline h-4 w-4" /> Preference controls for this matchup</span><ChevronDown className="h-4 w-4" /></summary><div className="mt-3"><p className="text-xs font-black uppercase text-slate-500">Your players</p>{myRoster.map((player) => <PlayerPreferenceControls key={player.player.id} player={player} preferences={preferences} onChange={setPreferences} />)}<p className="mt-4 text-xs font-black uppercase text-slate-500">Their players</p>{selectedRoster.map((player) => <PlayerPreferenceControls key={player.player.id} player={player} preferences={preferences} onChange={setPreferences} />)}</div></details>
    </section> : null}

    <section className="rounded-[28px] border border-violet-300/15 bg-[#0a1727]/92 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-violet-200"><Target className="h-4 w-4" /> Manager strategy</div><h2 className="mt-1 text-xl font-black">Rank for your actual risk posture</h2></div><select aria-label="Team strategy" value={preferences.strategy} onChange={(event) => setPreferences((current) => ({ ...current, strategy: event.target.value as TeamStrategy }))} className="h-11 rounded-xl border border-white/10 bg-[#071321] px-3 text-sm font-black text-white"><option value="win-now">Win now</option><option value="balanced">Balanced</option><option value="patient">Patient / upside</option></select></div>
      <p className="mt-2 text-sm leading-6 text-slate-400"><HeartPulse className="mr-1 inline h-4 w-4" /> Saved only on this device. Strategy and player tags change proposal order and warnings; the source projections, injuries and market data remain untouched.</p>
    </section>
  </div>;
}
