"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Play, RefreshCw, Search, ShieldAlert, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { rankDraftCandidates } from "@/lib/fantasy/draft";
import { getSnakePickInfo } from "@/lib/fantasy/draftState";
import {
  appendDraftSessionPick,
  replayDraftSession,
  type DraftSession,
} from "@/lib/fantasy/draftSession";
import {
  buildDraftRehearsalQueue,
  createDraftRehearsalMetrics,
  createDraftRehearsalScenario,
  draftRehearsalScenarios,
  selectRehearsalOpponentPick,
  summarizeDraftRehearsal,
  type DraftRehearsalInputMode,
  type DraftRehearsalMetrics,
  type DraftRehearsalScenarioId,
} from "@/lib/fantasy/draftRehearsal";
import type { DraftCandidate, DraftState } from "@/lib/fantasy/types";
import { cn } from "@/lib/utils";

type DraftRehearsalModeProps = {
  candidates: DraftCandidate[];
  initialDraftState: DraftState;
  favoriteIds?: string[];
};

type StoredRehearsal = {
  version: 1;
  scenario: DraftRehearsalScenarioId;
  inputMode: DraftRehearsalInputMode;
  seed: string;
  session: DraftSession;
  metrics: DraftRehearsalMetrics;
};

const REHEARSAL_KEY = "fantasy-draft-rehearsal-v1";
const DEFAULT_SEED = "vaughn-slot-9-rehearsal";

function primaryPosition(candidate: DraftCandidate) {
  return candidate.player.positions[0] ?? "WR";
}

function measureNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function DraftRehearsalMode({ candidates, initialDraftState, favoriteIds = [] }: DraftRehearsalModeProps) {
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const initial = useMemo(
    () => createDraftRehearsalScenario({ initialState: initialDraftState, candidates, scenario: "normal-room", seed: DEFAULT_SEED }),
    [candidates, initialDraftState],
  );
  const [scenario, setScenario] = useState<DraftRehearsalScenarioId>("normal-room");
  const [inputMode, setInputMode] = useState<DraftRehearsalInputMode>("manual");
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [session, setSession] = useState(initial.session);
  const [draftState, setDraftState] = useState(initial.state);
  const [metrics, setMetrics] = useState(() => createDraftRehearsalMetrics());
  const [query, setQuery] = useState("");
  const [expectedPlayerId, setExpectedPlayerId] = useState<string | null>(null);
  const [entryStartedAt, setEntryStartedAt] = useState<number | null>(null);
  const [recoveryBatch, setRecoveryBatch] = useState<ReturnType<typeof buildDraftRehearsalQueue> | null>(null);
  const [messages, setMessages] = useState<string[]>(["Practice is isolated from the real draft room."]);
  const [hydrated, setHydrated] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [paceMs, setPaceMs] = useState(900);

  useEffect(() => {
    let cancelled = false;
    let stored: StoredRehearsal | null = null;
    let restored: DraftState | null = null;
    try {
      const raw = window.localStorage.getItem(REHEARSAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredRehearsal;
        if (parsed.version === 1 && draftRehearsalScenarios.some((item) => item.id === parsed.scenario)) {
          stored = parsed;
          restored = replayDraftSession(parsed.session, candidates, initialDraftState);
        }
      }
    } catch {
      window.localStorage.removeItem(REHEARSAL_KEY);
    }
    queueMicrotask(() => {
      if (cancelled) return;
      if (stored && restored) {
        setScenario(stored.scenario);
        setInputMode(stored.inputMode);
        setSeed(stored.seed);
        setSession(stored.session);
        setDraftState(restored);
        setMetrics(stored.metrics);
        setMessages([`Resumed isolated practice at Pick ${restored.currentPick}.`]);
      }
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [candidates, initialDraftState]);

  useEffect(() => {
    if (!hydrated) return;
    const stored: StoredRehearsal = { version: 1, scenario, inputMode, seed, session, metrics };
    window.localStorage.setItem(REHEARSAL_KEY, JSON.stringify(stored));
  }, [hydrated, inputMode, metrics, scenario, seed, session]);

  const pickInfo = getSnakePickInfo(draftState.currentPick, draftState.league.teams);
  const isMyTurn = pickInfo.teamId === draftState.myTeamId;
  const availableIds = useMemo(() => new Set(draftState.availablePlayerIds), [draftState.availablePlayerIds]);
  const candidateById = useMemo(() => new Map(candidates.map((candidate) => [candidate.player.id, candidate] as const)), [candidates]);
  const recommendations = useMemo(
    () => rankDraftCandidates(draftState, candidates).slice(0, 3),
    [candidates, draftState],
  );
  const searchResults = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return candidates
      .filter((candidate) => availableIds.has(candidate.player.id))
      .filter((candidate) => !lowered || `${candidate.player.fullName} ${candidate.player.team} ${candidate.player.positions.join(" ")}`.toLowerCase().includes(lowered))
      .sort((a, b) => (a.market.adp ?? 999) - (b.market.adp ?? 999))
      .slice(0, 10);
  }, [availableIds, candidates, query]);
  const expectedCandidate = expectedPlayerId ? candidateById.get(expectedPlayerId) ?? null : null;
  const summary = summarizeDraftRehearsal(metrics);
  const livePicks = draftState.drafted.filter((pick) => pick.eventType !== "keeper").length;
  const keeperCount = draftState.drafted.length - livePicks;
  const totalPicks = draftState.league.rosterSlots.filter((slot) => slot !== "IR").length * draftState.league.teams;
  const complete = draftState.currentPick > totalPicks;

  function recordRecommendationLatency(state: DraftState) {
    const started = measureNow();
    rankDraftCandidates(state, candidates).slice(0, 3);
    const elapsed = measureNow() - started;
    setMetrics((current) => ({ ...current, recommendationLatencyMs: [...current.recommendationLatencyMs, elapsed] }));
  }

  function resetRehearsal(nextScenario = scenario, nextSeed = seed) {
    const next = createDraftRehearsalScenario({ initialState: initialDraftState, candidates, scenario: nextScenario, seed: nextSeed });
    setScenario(nextScenario);
    setSession(next.session);
    setDraftState(next.state);
    setMetrics(createDraftRehearsalMetrics());
    setExpectedPlayerId(null);
    setRecoveryBatch(null);
    setQuery("");
    setAutoRunning(false);
    setMessages([
      `${draftRehearsalScenarios.find((item) => item.id === nextScenario)?.title ?? "Practice"} reset.`,
      next.receipts.length > 0 ? `${next.receipts.length} synthetic keeper events loaded.` : "Canonical personal keepers retained; no synthetic opponent keepers added.",
    ]);
  }

  function appendPracticePick(playerId: string, source: "manual" | "yahoo-browser", note: string) {
    const result = appendDraftSessionPick(session, candidates, draftState, { playerId, source, note });
    setSession(result.session);
    setDraftState(result.state);
    recordRecommendationLatency(result.state);
    return result;
  }

  function revealManualPick() {
    if (isMyTurn) return;
    const candidate = selectRehearsalOpponentPick({ state: draftState, candidates, scenario, seed });
    if (!candidate) return;
    setExpectedPlayerId(candidate.player.id);
    setEntryStartedAt(measureNow());
    setQuery("");
    setMessages([`Yahoo feed: Pick ${draftState.currentPick} · ${candidate.player.fullName} · enter it manually.`]);
  }

  function submitManualCandidate(candidate: DraftCandidate) {
    if (!expectedPlayerId) return;
    if (candidate.player.id !== expectedPlayerId) {
      setMetrics((current) => ({ ...current, mismatches: current.mismatches + 1 }));
      setMessages([`${candidate.player.fullName} does not match the simulated Yahoo pick. Nothing changed.`]);
      return;
    }
    const latency = entryStartedAt === null ? 0 : measureNow() - entryStartedAt;
    const result = appendPracticePick(candidate.player.id, "manual", "Hands-on rehearsal entry");
    setMetrics((current) => ({
      ...current,
      manualEntries: current.manualEntries + 1,
      entryLatencyMs: [...current.entryLatencyMs, latency],
    }));
    setExpectedPlayerId(null);
    setEntryStartedAt(null);
    setQuery("");
    setMessages([`Recorded ${result.receipts[0]} in ${(latency / 1000).toFixed(1)}s.`]);
  }

  function makeManagerPick(candidate: DraftCandidate, recommendationRank: number) {
    const result = appendPracticePick(candidate.player.id, "manual", "Manager rehearsal decision");
    setMetrics((current) => ({
      ...current,
      userPicks: current.userPicks + 1,
      recommendationDeviations: current.recommendationDeviations + (recommendationRank === 0 ? 0 : 1),
    }));
    setMessages([`Vaughn selected ${candidate.player.fullName}${recommendationRank === 0 ? " (top call)" : ` (recommendation #${recommendationRank + 1})`}.`, result.receipts[0]]);
  }

  function applyNextAutoPick() {
    if (isMyTurn) {
      setMessages(["Auto-sync paused because Vaughn is on the clock."]);
      return;
    }
    const candidate = selectRehearsalOpponentPick({ state: draftState, candidates, scenario, seed });
    if (!candidate) return;
    const result = appendPracticePick(candidate.player.id, "yahoo-browser", "Simulated extension event");
    setMetrics((current) => ({ ...current, autoEntries: current.autoEntries + 1 }));
    setMessages([`Extension applied ${result.receipts[0]}.`]);
  }

  useEffect(() => {
    if (!autoRunning || inputMode !== "auto-sync" || isMyTurn || complete) return;
    const timeout = window.setTimeout(() => {
      const candidate = selectRehearsalOpponentPick({ state: draftState, candidates, scenario, seed });
      if (!candidate) return;
      const result = appendDraftSessionPick(session, candidates, draftState, {
        playerId: candidate.player.id,
        source: "yahoo-browser",
        note: "Timed simulated extension event",
      });
      const started = measureNow();
      rankDraftCandidates(result.state, candidates).slice(0, 3);
      const elapsed = measureNow() - started;
      setSession(result.session);
      setDraftState(result.state);
      setMetrics((current) => ({
        ...current,
        autoEntries: current.autoEntries + 1,
        recommendationLatencyMs: [...current.recommendationLatencyMs, elapsed],
      }));
      setMessages([`Timed extension event applied at Pick ${draftState.currentPick}.`]);
    }, paceMs);
    return () => window.clearTimeout(timeout);
  }, [autoRunning, candidates, complete, draftState, inputMode, isMyTurn, paceMs, scenario, seed, session]);

  function stageRecovery() {
    const batch = buildDraftRehearsalQueue({
      session,
      state: draftState,
      candidates,
      scenario,
      seed: `${seed}:recovery:${draftState.currentPick}`,
      count: 4,
      stopAtManagerTurn: true,
    });
    setRecoveryBatch(batch);
    setMessages([batch.queue.length > 0 ? `Withheld ${batch.queue.length} extension events. Review the recovery receipt before applying.` : "Recovery drill stopped because Vaughn is on the clock."]);
  }

  function applyRecovery() {
    if (!recoveryBatch || recoveryBatch.queue.length === 0) return;
    const started = measureNow();
    replayDraftSession(recoveryBatch.resultingSession, candidates, initialDraftState);
    const latency = measureNow() - started;
    setSession(recoveryBatch.resultingSession);
    setDraftState(recoveryBatch.resultingState);
    recordRecommendationLatency(recoveryBatch.resultingState);
    setMetrics((current) => ({
      ...current,
      recoveredEntries: current.recoveredEntries + recoveryBatch.queue.length,
      recoveryDrills: current.recoveryDrills + 1,
      entryLatencyMs: [...current.entryLatencyMs, latency],
    }));
    setMessages([`Reconciled ${recoveryBatch.queue.length} missed picks atomically in ${latency.toFixed(0)}ms.`]);
    setRecoveryBatch(null);
  }

  function injectDuplicate() {
    const latest = session.events.filter((event) => event.status === "active" && event.eventType !== "keeper").at(-1);
    if (!latest) {
      setMessages(["Record at least one live practice pick before injecting a duplicate."]);
      return;
    }
    try {
      appendDraftSessionPick(session, candidates, draftState, { playerId: latest.playerId, note: "Injected duplicate" });
      setMessages(["Unexpected: duplicate event was accepted."]);
    } catch (error) {
      setMetrics((current) => ({ ...current, rejectedEvents: current.rejectedEvents + 1 }));
      setMessages([`Duplicate correctly rejected: ${error instanceof Error ? error.message : "validation error"}`]);
    }
  }

  function injectOutOfOrder() {
    const batch = buildDraftRehearsalQueue({
      session,
      state: draftState,
      candidates,
      scenario,
      seed: `${seed}:out-of-order:${draftState.currentPick}`,
      count: 3,
      stopAtManagerTurn: true,
    });
    if (batch.queue.length < 2) {
      setMessages(["The next manager turn is too close for a multi-event out-of-order drill."]);
      return;
    }
    let nextSession = session;
    let nextState = draftState;
    for (const queued of [...batch.queue].reverse()) {
      const result = appendDraftSessionPick(nextSession, candidates, nextState, {
        overallPick: queued.overallPick,
        playerId: queued.playerId,
        source: "yahoo-browser",
        note: "Injected out-of-order event",
      });
      nextSession = result.session;
      nextState = result.state;
    }
    setSession(nextSession);
    setDraftState(nextState);
    setMetrics((current) => ({ ...current, recoveredEntries: current.recoveredEntries + batch.queue.length, recoveryDrills: current.recoveryDrills + 1 }));
    recordRecommendationLatency(nextState);
    setMessages([`${batch.queue.length} out-of-order events replayed into the correct canonical state.`]);
  }

  function simulateReload() {
    try {
      const restored = JSON.parse(JSON.stringify(session)) as DraftSession;
      const state = replayDraftSession(restored, candidates, initialDraftState);
      setSession(restored);
      setDraftState(state);
      setMetrics((current) => ({ ...current, reloadRecoveries: current.reloadRecoveries + 1 }));
      setMessages([`Reload recovery passed. Session resumed at Pick ${state.currentPick}.`]);
    } catch (error) {
      setMessages([`Reload recovery failed: ${error instanceof Error ? error.message : "unknown error"}`]);
    }
  }

  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-[28px] border-2 border-amber-300/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.15),#0a1727_55%)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Practice sandbox · never the real room</p><h2 className="mt-2 text-2xl font-black">Draft Rehearsal Mode</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Practice the operating workflow against deterministic rooms, including extension loss, manual entry, recovery, and reloads. This session uses separate storage and cannot unlock or modify the live draft.</p></div>
          <div className="rounded-2xl border border-amber-300/25 bg-black/20 px-4 py-3 text-center"><p className="text-2xl font-black text-amber-200">{summary.integrityScore}</p><p className="text-[10px] font-black uppercase text-slate-500">integrity</p></div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <label><span className="text-xs font-black text-slate-400">Scenario</span><Select className="mt-1" value={scenario} onChange={(event) => resetRehearsal(event.target.value as DraftRehearsalScenarioId, seed)}>{draftRehearsalScenarios.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></label>
          <label><span className="text-xs font-black text-slate-400">Input drill</span><Select className="mt-1" value={inputMode} onChange={(event) => { setInputMode(event.target.value as DraftRehearsalInputMode); setAutoRunning(false); setExpectedPlayerId(null); setRecoveryBatch(null); }}><option value="manual">Hands-on manual</option><option value="auto-sync">Extension auto-sync</option><option value="recovery">Missed-pick recovery</option></Select></label>
          <label><span className="text-xs font-black text-slate-400">Repeatable seed</span><Input className="mt-1" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
          <Button className="self-end" variant="outline" onClick={() => resetRehearsal()}><RefreshCw className="mr-2 h-4 w-4" /> Reset</Button>
        </div>
        <p className="mt-3 text-xs text-slate-400">{draftRehearsalScenarios.find((item) => item.id === scenario)?.summary} · {keeperCount} keeper events loaded.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="rounded-[28px] border border-cyan-300/25 bg-[#0a1727]/92 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><span className="text-[10px] font-black uppercase">Pick</span><span className="text-2xl font-black">{draftState.currentPick}</span></div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{isMyTurn ? "Vaughn is on the clock" : `${pickInfo.teamId} is on the clock`}</p><h3 className="mt-1 text-xl font-black">Round {pickInfo.round}, pick {pickInfo.pickInRound}</h3><p className="mt-1 text-xs text-slate-500">{livePicks} live practice picks recorded · {draftState.picksUntilNextTurn} until your turn</p></div></div><span className={cn("rounded-xl border px-3 py-2 text-xs font-black", complete ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/20 text-slate-300")}>{complete ? "Rehearsal complete" : inputMode.replace("-", " ")}</span></div>
          </section>

          {isMyTurn ? <section className="rounded-[28px] border border-emerald-300/25 bg-emerald-300/[0.06] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Make the decision</p><h3 className="mt-1 text-xl font-black">Choose from the live recommendations</h3><div className="mt-4 grid gap-2 sm:grid-cols-3">{recommendations.map((recommendation, index) => { const candidate = candidateById.get(recommendation.playerId); if (!candidate) return null; const isFavorite = favoriteIdSet.has(candidate.player.id); return <button key={candidate.player.id} onClick={() => makeManagerPick(candidate, index)} className={cn("relative overflow-hidden rounded-2xl border p-4 text-left", index === 0 ? "border-emerald-300/35 bg-emerald-300/10" : "border-white/10 bg-black/20")}><p className="text-[10px] font-black uppercase text-slate-500">Recommendation #{index + 1}</p><p className="mt-2 font-black">{candidate.player.fullName}</p><p className="mt-1 text-xs text-slate-400">{primaryPosition(candidate)} · ADP {candidate.market.adp}</p><p className="mt-2 text-xs text-slate-300">{Math.round(recommendation.explanation.makeItBackProbability * 100)}% chance available at your next pick · {recommendation.explanation.runRisk === "high" ? "position likely to move" : recommendation.explanation.runRisk === "medium" ? "position could move" : "position likely to hold"}</p>{isFavorite ? <span className="absolute bottom-0 right-0 flex h-12 w-12 items-end justify-end bg-amber-300 pb-1 pr-1 text-[10px] font-black text-slate-950 [clip-path:polygon(100%_0,100%_100%,0_100%)]" title="Vaughn personal target" aria-label="Vaughn personal target">VJ</span> : null}</button>; })}</div></section> : null}

          {!isMyTurn && inputMode === "manual" ? <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Hands-on entry</p><h3 className="mt-1 text-xl font-black">Read the feed, then enter the pick</h3></div><Button onClick={revealManualPick} disabled={Boolean(expectedPlayerId)}><Clock3 className="mr-2 h-4 w-4" /> Reveal next Yahoo pick</Button></div>{expectedCandidate ? <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4"><p className="text-xs font-black uppercase text-amber-200">Simulated Yahoo feed</p><p className="mt-2 text-lg font-black">Pick {draftState.currentPick} · {expectedCandidate.player.fullName}</p><p className="text-xs text-slate-400">{primaryPosition(expectedCandidate)} · {expectedCandidate.player.team}</p></div> : null}<label className="relative mt-4 block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type the player from the simulated feed…" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2">{searchResults.map((candidate) => <button key={candidate.player.id} disabled={!expectedPlayerId} onClick={() => submitManualCandidate(candidate)} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left disabled:opacity-40"><span className="font-black">{candidate.player.fullName}</span><span className="ml-2 text-xs text-slate-500">{primaryPosition(candidate)} · {candidate.player.team}</span></button>)}</div></section> : null}

          {!isMyTurn && inputMode === "auto-sync" ? <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Extension drill</p><h3 className="mt-1 text-xl font-black">Simulate Yahoo event delivery</h3></div><Bot className="h-6 w-6 text-violet-300" /></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button onClick={applyNextAutoPick}><SkipForward className="mr-2 h-4 w-4" /> Next event</Button><Button variant="outline" onClick={() => setAutoRunning((running) => !running)}>{autoRunning ? "Pause stream" : <><Play className="mr-2 h-4 w-4" /> Run stream</>}</Button><Select value={String(paceMs)} onChange={(event) => setPaceMs(Number(event.target.value))}><option value="350">Fast · 0.35s</option><option value="900">Normal · 0.9s</option><option value="1800">Slow · 1.8s</option></Select></div></section> : null}

          {!isMyTurn && inputMode === "recovery" ? <section className="rounded-[28px] border border-rose-300/20 bg-[#0a1727]/92 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Recovery drill</p><h3 className="mt-1 text-xl font-black">Withhold picks, then reconcile atomically</h3></div><Button onClick={stageRecovery} disabled={Boolean(recoveryBatch)}><ShieldAlert className="mr-2 h-4 w-4" /> Simulate missed picks</Button></div>{recoveryBatch ? <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase text-slate-500">Screenshot/JSON recovery receipt</p>{recoveryBatch.queue.map((entry) => <p key={entry.overallPick} className="mt-2 text-sm"><span className="font-black">Pick {entry.overallPick}</span> · {entry.playerName} · {entry.teamId}</p>)}<Button className="mt-4" onClick={applyRecovery}>Validate and recover batch</Button></div> : null}</section> : null}

          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Failure lab</p><h3 className="mt-1 text-xl font-black">Break the feed without breaking the room</h3><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button variant="outline" onClick={injectDuplicate}><AlertTriangle className="mr-2 h-4 w-4" /> Duplicate</Button><Button variant="outline" onClick={injectOutOfOrder}><Activity className="mr-2 h-4 w-4" /> Out of order</Button><Button variant="outline" onClick={simulateReload}><RefreshCw className="mr-2 h-4 w-4" /> Reload recovery</Button></div></section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-emerald-300/20 bg-[#0a1727]/92 p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Readiness scorecard</p><p className="mt-1 text-sm text-slate-400">Operator performance</p></div>{summary.ready ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <Clock3 className="h-6 w-6 text-amber-300" />}</div><p className="mt-4 text-sm font-bold">{summary.summary}</p><div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Manual</p><p className="mt-1 text-lg font-black">{metrics.manualEntries}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Mismatches</p><p className="mt-1 text-lg font-black">{metrics.mismatches}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Recovered</p><p className="mt-1 text-lg font-black">{metrics.recoveredEntries}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Reloads</p><p className="mt-1 text-lg font-black">{metrics.reloadRecoveries}</p></div></div><p className="mt-3 text-xs text-slate-500">Ready gate: 2 manual entries · 1 recovered pick · 1 reload · 1 rejected duplicate · advice under 1s.</p><p className="mt-2 text-xs text-slate-500">Recommendation deviations: {metrics.recommendationDeviations}/{metrics.userPicks} Vaughn picks · rejected bad events: {metrics.rejectedEvents}</p></section>
          <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Latest drill result</p><div className="mt-3 space-y-2">{messages.map((message) => <p key={message} className="rounded-xl bg-black/20 p-3 text-xs leading-5 text-slate-300">{message}</p>)}</div></section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Recent practice events</p><div className="mt-3 space-y-2">{draftState.drafted.filter((pick) => pick.eventType !== "keeper").slice(0, 10).map((pick) => <div key={`${pick.overallPick}-${pick.playerId}`} className="flex gap-3 rounded-xl bg-black/20 p-2.5 text-xs"><span className="w-8 font-black text-slate-500">{pick.overallPick}</span><span><span className="block font-bold">{candidateById.get(pick.playerId)?.player.fullName ?? pick.playerId}</span><span className="text-slate-500">{pick.teamId} · {pick.source}</span></span></div>)}</div></section>
        </aside>
      </div>
    </section>
  );
}
