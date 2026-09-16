"use client";

import { useMemo, useState } from "react";
import type { InSeasonPlayerSnapshot } from "@/lib/fantasy/types";
import { assessDecisionReadiness, buildPlayerCoverageReport } from "@/lib/fantasy/playerCoverage";

export function PlayerCoverageReport({ players, report }: { players: InSeasonPlayerSnapshot[]; report: ReturnType<typeof buildPlayerCoverageReport> }) {
  const readiness = useMemo(() => new Map(players.filter((player) => report.entries.some((entry) => entry.playerId === player.player.id && entry.scope !== "monitor")).map((player) => [player.player.id, {
    valuation: assessDecisionReadiness(player, "valuation"),
    usage: assessDecisionReadiness(player, "usage"),
    efficiency: assessDecisionReadiness(player, player.player.positions[0] === "RB" ? "rushing-efficiency" : player.player.positions[0] === "QB" ? "passing-efficiency" : "receiving-efficiency"),
  }])), [players, report]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("relevant");
  const entries = report.entries.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase())
    && (scope === "all" || scope === "rostered" && entry.rostered || scope === "relevant" && entry.relevant || scope === "complete" && entry.actionable));
  return <section className="rounded-[28px] border border-amber-300/20 bg-[#0a1727]/95 p-5 sm:p-6 lg:col-span-2">
    <h2 className="text-2xl font-black">Player coverage gate</h2>
    <p className="mt-2 text-lg font-bold text-amber-100">{report.priorityComplete} / {report.priorityTotal} priority-player profiles complete</p>
    <p className="mt-2 text-sm leading-6 text-slate-300">Full profiles focus on the top 250 market ranks and rostered non-kickers, plus waiver/trade candidates, verified injury successors and meaningful observed opportunity increases. Each recommendation still checks its own evidence.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['observed', 'Current observations'], ['baseline', 'Prior-based evaluation'], ['inactive', 'No playing sample expected'], ['lightweight', 'Kicker essentials']] as const).map(([kind, label]) => <div key={kind} className="rounded-xl bg-white/5 p-3"><p className="text-2xl font-black">{report.entries.filter((entry) => entry.evaluation === kind).length}</p><p className="text-sm text-slate-300">{label}</p></div>)}</div>
    <p className="mt-3 text-sm text-amber-100">{report.total} players retained · {report.monitored} monitored reserves · {report.kickers} lightweight kickers · {report.counts.blocked} integrity flags</p>
    <p className="mt-2 text-sm text-slate-400">Monitored reserves and kickers do not count as unfinished full profiles. Broad data ingestion continues so emerging opportunities can enter the priority pool. Missing metrics are not fabricated, and preseason projections remain provisional.</p>
    <details className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-slate-300"><summary className="cursor-pointer font-bold">What is preventing full coverage?</summary><p className="mt-2 text-xs text-slate-400">Counts overlap: one player may have several gaps. A current injury designation does not establish historical game participation.</p><ul className="mt-2 space-y-1">{report.priorityGaps.map(({ gap, count }) => <li key={gap}>{count} players · {gap}</li>)}</ul></details>
    <div className="mt-4 flex flex-wrap gap-3"><input aria-label="Search player coverage" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a player" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 p-3 text-base" /><select aria-label="Coverage scope" value={scope} onChange={(event) => setScope(event.target.value)} className="rounded-xl border border-white/15 bg-[#0a1727] p-3 text-sm"><option value="relevant">Relevant players</option><option value="rostered">Rostered players</option><option value="all">All players</option><option value="complete">Complete players</option></select></div>
    <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">{entries.map((entry, index) => <details key={`${entry.playerId}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-sm"><span className="font-bold">{entry.name}</span> · {entry.position} · {entry.evaluation}</summary><div className="mt-3 space-y-1 text-sm text-slate-300">
      <p>{entry.scopeReasons.join(" · ") || "Outside full-profile priority pool"}</p>
      {entry.scope !== "monitor" ? <p>Baseline comparison: {readiness.get(entry.playerId)?.valuation.actionable ? "available" : "blocked"}</p> : null}
      {entry.scope === "priority" ? <p>Workload claim: {readiness.get(entry.playerId)?.usage.actionable ? "supported" : "needs evidence"} · Efficiency claim: {readiness.get(entry.playerId)?.efficiency.actionable ? "supported" : "needs evidence"}</p> : null}
      {[...entry.invalid, ...entry.notes].map((reason) => <p key={reason}>{reason}</p>)}
      {entry.missing.length ? <details className="pt-2"><summary className="cursor-pointer">Remaining profile gaps ({entry.missing.length})</summary>{entry.missing.map((reason) => <p key={reason}>{reason}</p>)}</details> : null}
    </div></details>)}{!entries.length ? <p className="text-sm text-slate-400">No players match this filter.</p> : null}</div>
  </section>;
}
