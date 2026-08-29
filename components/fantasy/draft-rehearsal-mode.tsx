"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Play, RefreshCw, Search, ShieldAlert, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { buildPositionRunSnapshots, buildRedraftBoard, buildWrapSimulationSnapshot, rankDraftCandidates } from "@/lib/fantasy/draft";
import { buildDraftTurnContext, getSnakePickInfo } from "@/lib/fantasy/draftState";
import { buildDraftBoardSignal, buildDraftQuickScoreBoard, buildLiveDraftCall } from "@/lib/fantasy/draftSignals";
import {
  appendDraftSessionPick,
  replayDraftSession,
  type DraftSession,
} from "@/lib/fantasy/draftSession";
import {
  buildDraftRehearsalQueue,
  createDraftRehearsalMetrics,
  createDraftRehearsalScenario,
  draftRehearsalKeeperLoads,
  draftRehearsalScenarios,
  selectRehearsalOpponentPick,
  summarizeDraftRehearsal,
  type DraftRehearsalInputMode,
  type DraftRehearsalKeeperLoad,
  type DraftRehearsalMetrics,
  type DraftRehearsalScenarioId,
} from "@/lib/fantasy/draftRehearsal";
import { explainWarRoomRecommendation, warRoomDraftCall, type WarRoomDraftCall } from "@/lib/fantasy/warRoomPresentation";
import type { DraftCandidate, DraftState, PlayerPosition } from "@/lib/fantasy/types";
import { cn } from "@/lib/utils";

type DraftRehearsalModeProps = {
  candidates: DraftCandidate[];
  initialDraftState: DraftState;
  favoriteIds?: string[];
};

type StoredRehearsal = {
  version: 1 | 2;
  scenario: DraftRehearsalScenarioId;
  inputMode: DraftRehearsalInputMode;
  seed: string;
  session: DraftSession;
  metrics: DraftRehearsalMetrics;
  keeperLoad?: DraftRehearsalKeeperLoad;
  simulationStarted?: boolean;
};

const REHEARSAL_KEY = "fantasy-draft-rehearsal-v1";
const DEFAULT_SEED = "vaughn-slot-9-rehearsal";
const BOARD_POSITIONS: Array<"ALL" | PlayerPosition> = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

type RehearsalBoardSort = "recommended" | "adp" | "model";

const warRoomCallClasses: Record<WarRoomDraftCall, string> = {
  "Smash Now": "border-emerald-300/50 bg-emerald-300/18 text-emerald-50",
  "Good Value": "border-cyan-300/35 bg-cyan-300/12 text-cyan-100",
  "Fair Value": "border-white/10 bg-white/[0.05] text-slate-300",
  "Too Early": "border-amber-300/35 bg-amber-300/12 text-amber-100",
  Pass: "border-rose-300/35 bg-rose-300/12 text-rose-100",
};

function VjEarmark({ compact = false }: { compact?: boolean }) {
  return <span aria-label="Vaughn personal target" title="Vaughn personal target" className={cn("pointer-events-none absolute bottom-0 right-0 flex items-end justify-end bg-amber-300 font-black text-slate-950 [clip-path:polygon(100%_0,100%_100%,0_100%)]", compact ? "h-9 w-9 p-1 text-[9px]" : "h-14 w-14 p-1.5 text-xs")}>VJ</span>;
}

function primaryPosition(candidate: DraftCandidate) {
  return candidate.player.positions[0] ?? "WR";
}

function measureNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function buildRehearsalWrap(state: DraftState, wrapPool: DraftCandidate[]) {
  return buildWrapSimulationSnapshot(state, wrapPool);
}

export function DraftRehearsalMode({ candidates, initialDraftState, favoriteIds = [] }: DraftRehearsalModeProps) {
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const initial = useMemo(
    () => createDraftRehearsalScenario({ initialState: initialDraftState, candidates, scenario: "normal-room", seed: DEFAULT_SEED }),
    [candidates, initialDraftState],
  );
  const [scenario, setScenario] = useState<DraftRehearsalScenarioId>("normal-room");
  const [inputMode, setInputMode] = useState<DraftRehearsalInputMode>("manual");
  const [keeperLoad, setKeeperLoad] = useState<DraftRehearsalKeeperLoad>("typical");
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [session, setSession] = useState(initial.session);
  const [draftState, setDraftState] = useState(initial.state);
  const [metrics, setMetrics] = useState(() => createDraftRehearsalMetrics());
  const [query, setQuery] = useState("");
  const [boardQuery, setBoardQuery] = useState("");
  const [boardSort, setBoardSort] = useState<RehearsalBoardSort>("recommended");
  const [boardPosition, setBoardPosition] = useState<"ALL" | PlayerPosition>("ALL");
  const [boardVjOnly, setBoardVjOnly] = useState(false);
  const [boardShowCount, setBoardShowCount] = useState(40);
  const [expectedPlayerId, setExpectedPlayerId] = useState<string | null>(null);
  const [entryStartedAt, setEntryStartedAt] = useState<number | null>(null);
  const [recoveryBatch, setRecoveryBatch] = useState<ReturnType<typeof buildDraftRehearsalQueue> | null>(null);
  const [messages, setMessages] = useState<string[]>(["Practice is isolated from the real draft room."]);
  const [hydrated, setHydrated] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [paceMs, setPaceMs] = useState(900);
  const [simulationStarted, setSimulationStarted] = useState(false);
  const [managerSecondsLeft, setManagerSecondsLeft] = useState(60);

  useEffect(() => {
    let cancelled = false;
    let stored: StoredRehearsal | null = null;
    let restored: DraftState | null = null;
    try {
      const raw = window.localStorage.getItem(REHEARSAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredRehearsal;
        if ((parsed.version === 1 || parsed.version === 2) && draftRehearsalScenarios.some((item) => item.id === parsed.scenario)) {
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
        setKeeperLoad(stored.keeperLoad ?? "typical");
        setSeed(stored.seed);
        setSession(stored.session);
        setDraftState(restored);
        setMetrics(stored.metrics);
        setSimulationStarted(Boolean(stored.simulationStarted && stored.inputMode === "timed-simulation"));
        setMessages([`Resumed isolated practice at Pick ${restored.currentPick}.`]);
      }
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [candidates, initialDraftState]);

  useEffect(() => {
    if (!hydrated) return;
    const stored: StoredRehearsal = { version: 2, scenario, inputMode, seed, session, metrics, keeperLoad, simulationStarted };
    window.localStorage.setItem(REHEARSAL_KEY, JSON.stringify(stored));
  }, [hydrated, inputMode, keeperLoad, metrics, scenario, seed, session, simulationStarted]);

  const pickInfo = getSnakePickInfo(draftState.currentPick, draftState.league.teams);
  const isMyTurn = pickInfo.teamId === draftState.myTeamId;
  const availableIds = useMemo(() => new Set(draftState.availablePlayerIds), [draftState.availablePlayerIds]);
  const candidateById = useMemo(() => new Map(candidates.map((candidate) => [candidate.player.id, candidate] as const)), [candidates]);
  const wrapPool = useMemo(
    () => [...candidates].sort((a, b) => (a.market.adp ?? 999) - (b.market.adp ?? 999)).slice(0, 80),
    [candidates],
  );
  const rehearsalWrap = useMemo(() => buildRehearsalWrap(draftState, wrapPool), [draftState, wrapPool]);
  const rehearsalBoard = useMemo(() => buildRedraftBoard(candidates, draftState.league), [candidates, draftState.league]);
  const rankedRecommendations = useMemo(
    () => rankDraftCandidates(draftState, candidates, rehearsalWrap, { baseBoard: rehearsalBoard }),
    [candidates, draftState, rehearsalBoard, rehearsalWrap],
  );
  const recommendations = useMemo(() => rankedRecommendations.slice(0, 4), [rankedRecommendations]);
  const boardById = useMemo(() => new Map(rehearsalBoard.map((entry) => [entry.playerId, entry] as const)), [rehearsalBoard]);
  const boardSignalById = useMemo(
    () => new Map(candidates.flatMap((candidate) => {
      const board = boardById.get(candidate.player.id);
      return board ? [[candidate.player.id, buildDraftBoardSignal(candidate, board, favoriteIdSet.has(candidate.player.id))] as const] : [];
    })),
    [boardById, candidates, favoriteIdSet],
  );
  const quickScoreById = useMemo(() => buildDraftQuickScoreBoard(candidates, rehearsalBoard), [candidates, rehearsalBoard]);
  const runSnapshots = useMemo(
    () => buildPositionRunSnapshots(draftState, candidates, rehearsalWrap),
    [candidates, draftState, rehearsalWrap],
  );
  const runSnapshotByPosition = useMemo(
    () => new Map(runSnapshots.map((snapshot) => [snapshot.position, snapshot] as const)),
    [runSnapshots],
  );
  const myRosterTeam = draftState.teams.find((team) => team.teamId === draftState.myTeamId) ?? null;
  const myRosterPlayers = useMemo(
    () => [...(myRosterTeam?.starters ?? []), ...(myRosterTeam?.bench ?? [])]
      .map((playerId) => candidateById.get(playerId))
      .filter((candidate): candidate is DraftCandidate => Boolean(candidate)),
    [candidateById, myRosterTeam?.bench, myRosterTeam?.starters],
  );
  const myStarterIds = useMemo(() => new Set(myRosterTeam?.starters ?? []), [myRosterTeam?.starters]);
  const myKeeperIds = useMemo(
    () => new Set(draftState.drafted.filter((pick) => pick.teamId === draftState.myTeamId && pick.eventType === "keeper").map((pick) => pick.playerId)),
    [draftState.drafted, draftState.myTeamId],
  );
  const openSlotCounts = useMemo(
    () => (myRosterTeam?.openSlots ?? []).reduce<Record<string, number>>((counts, slot) => ({ ...counts, [slot]: (counts[slot] ?? 0) + 1 }), {}),
    [myRosterTeam?.openSlots],
  );
  const turnContext = useMemo(() => buildDraftTurnContext(draftState), [draftState]);
  const recommendationRankById = useMemo(
    () => new Map(rankedRecommendations.map((recommendation, index) => [recommendation.playerId, index + 1] as const)),
    [rankedRecommendations],
  );
  const liveCallById = useMemo(
    () => new Map(rankedRecommendations.flatMap((recommendation) => {
      const candidate = candidateById.get(recommendation.playerId);
      const signal = boardSignalById.get(recommendation.playerId);
      const quickScore = quickScoreById.get(recommendation.playerId);
      if (!candidate || !signal || !quickScore) return [];
      const position = primaryPosition(candidate);
      const positionCount = myRosterTeam?.positionCounts[position] ?? 0;
      const rosterFit = position === "QB"
        ? positionCount >= 1 ? "blocked" as const : "need" as const
        : position === "TE"
          ? positionCount >= 2 ? "blocked" as const : positionCount === 0 ? "need" as const : "open" as const
        : positionCount < 2 ? "need" as const : "open" as const;
      return [[candidate.player.id, buildLiveDraftCall({
        candidate,
        quickScore,
        signal,
        currentPick: draftState.currentPick,
        isMyTurn,
        makeItBackProbability: recommendation.explanation.makeItBackProbability,
        tierSurvivalProbability: recommendation.explanation.tierSurvivalProbability,
        rosterFit,
      })] as const];
    })),
    [boardSignalById, candidateById, draftState.currentPick, isMyTurn, myRosterTeam?.positionCounts, quickScoreById, rankedRecommendations],
  );
  const remainingBoard = useMemo(() => {
    const topIds = new Set(recommendations.map((recommendation) => recommendation.playerId));
    const lowered = boardQuery.trim().toLowerCase();
    const rows = rankedRecommendations
      .filter((recommendation) => !topIds.has(recommendation.playerId))
      .map((recommendation) => ({ recommendation, candidate: candidateById.get(recommendation.playerId) }))
      .filter((row): row is typeof row & { candidate: DraftCandidate } => Boolean(row.candidate))
      .filter(({ candidate }) => boardPosition === "ALL" || candidate.player.positions.includes(boardPosition))
      .filter(({ candidate }) => !boardVjOnly || favoriteIdSet.has(candidate.player.id))
      .filter(({ candidate }) => !lowered || `${candidate.player.fullName} ${candidate.player.team} ${candidate.player.positions.join(" ")}`.toLowerCase().includes(lowered));
    return [...rows].sort((a, b) => {
      if (boardSort === "adp") return (a.candidate.market.adp ?? 999) - (b.candidate.market.adp ?? 999);
      if (boardSort === "model") return (boardById.get(a.candidate.player.id)?.boardRank ?? 999) - (boardById.get(b.candidate.player.id)?.boardRank ?? 999);
      return (recommendationRankById.get(a.candidate.player.id) ?? 999) - (recommendationRankById.get(b.candidate.player.id) ?? 999);
    });
  }, [boardById, boardPosition, boardQuery, boardSort, boardVjOnly, candidateById, favoriteIdSet, rankedRecommendations, recommendationRankById, recommendations]);
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
  const heroRecommendation = recommendations[0] ?? null;
  const heroCandidate = heroRecommendation ? candidateById.get(heroRecommendation.playerId) ?? null : null;
  const heroSignal = heroCandidate ? boardSignalById.get(heroCandidate.player.id) ?? null : null;
  const heroLiveCall = heroCandidate ? liveCallById.get(heroCandidate.player.id) ?? null : null;
  const heroComparison = heroRecommendation?.explanation.positionalComparisonPlayerId
    ? candidateById.get(heroRecommendation.explanation.positionalComparisonPlayerId) ?? null
    : null;
  const heroPresentation = heroCandidate && heroRecommendation && heroSignal
    ? explainWarRoomRecommendation({
        candidate: heroCandidate,
        recommendation: heroRecommendation,
        signal: heroSignal,
        runSnapshot: runSnapshotByPosition.get(primaryPosition(heroCandidate)),
        positionalComparison: heroComparison,
        turnContext,
      })
    : null;
  const heroCall = heroSignal && heroLiveCall ? warRoomDraftCall(heroLiveCall.action, heroSignal) : null;

  function recordRecommendationLatency(state: DraftState) {
    const started = measureNow();
    const wrap = buildRehearsalWrap(state, wrapPool);
    rankDraftCandidates(state, candidates, wrap, { baseBoard: rehearsalBoard }).slice(0, 4);
    const elapsed = measureNow() - started;
    setMetrics((current) => ({ ...current, recommendationLatencyMs: [...current.recommendationLatencyMs, elapsed] }));
  }

  function resetRehearsal(nextScenario = scenario, nextSeed = seed, nextKeeperLoad = keeperLoad) {
    const next = createDraftRehearsalScenario({ initialState: initialDraftState, candidates, scenario: nextScenario, seed: nextSeed, keeperLoad: nextKeeperLoad });
    setScenario(nextScenario);
    setKeeperLoad(nextKeeperLoad);
    setSession(next.session);
    setDraftState(next.state);
    setMetrics(createDraftRehearsalMetrics());
    setExpectedPlayerId(null);
    setRecoveryBatch(null);
    setQuery("");
    setBoardQuery("");
    setBoardPosition("ALL");
    setBoardSort("recommended");
    setBoardVjOnly(false);
    setBoardShowCount(40);
    setAutoRunning(false);
    setSimulationStarted(false);
    setManagerSecondsLeft(60);
    setMessages([
      `${draftRehearsalScenarios.find((item) => item.id === nextScenario)?.title ?? "Practice"} reset.`,
      next.receipts.length > 0 ? `${next.receipts.length} synthetic keeper events loaded.` : "Canonical personal keepers retained; no synthetic opponent keepers added.",
    ]);
  }

  function startTimedSimulation() {
    const next = createDraftRehearsalScenario({
      initialState: initialDraftState,
      candidates,
      scenario,
      seed,
      keeperLoad,
    });
    setSession(next.session);
    setDraftState(next.state);
    setMetrics(createDraftRehearsalMetrics());
    setExpectedPlayerId(null);
    setRecoveryBatch(null);
    setQuery("");
    setBoardQuery("");
    setBoardPosition("ALL");
    setBoardSort("recommended");
    setBoardVjOnly(false);
    setBoardShowCount(40);
    setAutoRunning(false);
    setManagerSecondsLeft(60);
    setSimulationStarted(true);
    setMessages([
      `Timed simulation started · opponent picks every 2 seconds · 60 seconds for each Vaughn pick.`,
      `Jahmyr Gibbs and Amon-Ra St. Brown are locked as Vaughn's keepers. ${next.receipts.length} opponent keeper events loaded.`,
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
    setManagerSecondsLeft(60);
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
      const nextWrap = buildRehearsalWrap(result.state, wrapPool);
      rankDraftCandidates(result.state, candidates, nextWrap, { baseBoard: rehearsalBoard }).slice(0, 4);
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
  }, [autoRunning, candidates, complete, draftState, inputMode, isMyTurn, paceMs, rehearsalBoard, scenario, seed, session, wrapPool]);

  useEffect(() => {
    if (!simulationStarted || inputMode !== "timed-simulation" || isMyTurn || complete) return;
    const timeout = window.setTimeout(() => {
      const candidate = selectRehearsalOpponentPick({ state: draftState, candidates, scenario, seed });
      if (!candidate) return;
      const result = appendDraftSessionPick(session, candidates, draftState, {
        playerId: candidate.player.id,
        source: "manual",
        note: "Timed rehearsal opponent pick",
      });
      setSession(result.session);
      setDraftState(result.state);
      if (getSnakePickInfo(result.state.currentPick, result.state.league.teams).teamId === result.state.myTeamId) {
        setManagerSecondsLeft(60);
      }
      setMetrics((current) => ({ ...current, autoEntries: current.autoEntries + 1 }));
      setMessages([`Pick ${draftState.currentPick} · ${candidate.player.fullName} selected by ${pickInfo.teamId}.`]);
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [candidates, complete, draftState, inputMode, isMyTurn, pickInfo.teamId, scenario, seed, session, simulationStarted]);

  useEffect(() => {
    if (!simulationStarted || inputMode !== "timed-simulation" || !isMyTurn || complete) return;
    if (managerSecondsLeft <= 0) {
      const timeout = window.setTimeout(() => {
        const recommendation = recommendations[0];
        const candidate = recommendation ? candidateById.get(recommendation.playerId) : null;
        if (!candidate) return;
        const result = appendDraftSessionPick(session, candidates, draftState, {
          playerId: candidate.player.id,
          source: "manual",
          note: "Timed rehearsal clock expiration · model top recommendation",
        });
        setSession(result.session);
        setDraftState(result.state);
        setMetrics((current) => ({
          ...current,
          userPicks: current.userPicks + 1,
          mismatches: current.mismatches + 1,
        }));
        setManagerSecondsLeft(60);
        setMessages([`Decision clock expired. ${candidate.player.fullName}, the top recommendation, was auto-selected so the rehearsal could continue.`]);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => setManagerSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [candidateById, candidates, complete, draftState, inputMode, isMyTurn, managerSecondsLeft, recommendations, session, simulationStarted]);

  useEffect(() => {
    if (!complete || !simulationStarted) return;
    const timeout = window.setTimeout(() => {
      setSimulationStarted(false);
      setMessages(["Timed simulation complete. Review your scorecard and recent picks."]);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [complete, simulationStarted]);

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
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <label><span className="text-xs font-black text-slate-400">Rehearsal type</span><Select className="mt-1" value={inputMode} disabled={simulationStarted} onChange={(event) => { setInputMode(event.target.value as DraftRehearsalInputMode); setSimulationStarted(false); setAutoRunning(false); setExpectedPlayerId(null); setRecoveryBatch(null); }}><option value="timed-simulation">Timed mock draft</option><option value="manual">Hands-on manual</option><option value="auto-sync">Extension auto-sync</option><option value="recovery">Missed-pick recovery</option></Select></label>
          <label><span className="text-xs font-black text-slate-400">Draft scenario</span><Select className="mt-1" value={scenario === "heavy-keepers" ? "normal-room" : scenario} disabled={simulationStarted} onChange={(event) => { const nextScenario = event.target.value as DraftRehearsalScenarioId; if (inputMode === "timed-simulation") setScenario(nextScenario); else resetRehearsal(nextScenario, seed, keeperLoad); }}>{draftRehearsalScenarios.filter((item) => item.id !== "heavy-keepers").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></label>
          <label><span className="text-xs font-black text-slate-400">Opponent keeper load</span><Select className="mt-1" value={keeperLoad} disabled={simulationStarted} onChange={(event) => { const nextLoad = event.target.value as DraftRehearsalKeeperLoad; if (inputMode === "timed-simulation") setKeeperLoad(nextLoad); else resetRehearsal(scenario, seed, nextLoad); }}>{draftRehearsalKeeperLoads.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Select></label>
          <label><span className="text-xs font-black text-slate-400">Repeatable seed</span><Input className="mt-1" value={seed} disabled={simulationStarted} onChange={(event) => setSeed(event.target.value)} /></label>
          {inputMode === "timed-simulation" ? <Button className="self-end" onClick={simulationStarted ? () => resetRehearsal() : startTimedSimulation}>{simulationStarted ? <><RefreshCw className="mr-2 h-4 w-4" /> Stop & reset</> : <><Play className="mr-2 h-4 w-4" /> Start simulation</>}</Button> : <Button className="self-end" variant="outline" onClick={() => resetRehearsal()}><RefreshCw className="mr-2 h-4 w-4" /> Reset</Button>}
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
          <p>{draftRehearsalScenarios.find((item) => item.id === scenario)?.summary}</p>
          <p>{draftRehearsalKeeperLoads.find((item) => item.id === keeperLoad)?.summary} · {keeperCount} keeper events currently loaded.</p>
        </div>
        {inputMode === "timed-simulation" ? <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-xs leading-5 text-cyan-50"><span className="font-black">Locked for every timed mock:</span> Jahmyr Gibbs and Amon-Ra St. Brown are Vaughn&apos;s keepers. Opponent selections run every 2 seconds. Each Vaughn pick gets 60 seconds; an expired clock auto-selects the top recommendation and records the miss.</div> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="rounded-[28px] border border-cyan-300/25 bg-[#0a1727]/92 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4"><div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><span className="text-[10px] font-black uppercase">Pick</span><span className="text-2xl font-black">{draftState.currentPick}</span></div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{isMyTurn ? "Vaughn is on the clock" : `${pickInfo.teamId} is on the clock`}</p><h3 className="mt-1 text-xl font-black">Round {pickInfo.round}, pick {pickInfo.pickInRound}</h3><p className="mt-1 text-xs text-slate-500">{livePicks} live practice picks recorded · {draftState.picksUntilNextTurn} until your turn</p></div></div>
              {inputMode === "timed-simulation" && simulationStarted ? <div className={cn("min-w-32 rounded-2xl border px-4 py-3 text-center", isMyTurn ? managerSecondsLeft <= 15 ? "border-rose-300/40 bg-rose-300/10" : "border-amber-300/30 bg-amber-300/[0.08]" : "border-cyan-300/25 bg-cyan-300/[0.06]")}><p className="text-2xl font-black">{isMyTurn ? `${managerSecondsLeft}s` : "2.0s"}</p><p className="text-[10px] font-black uppercase text-slate-400">{isMyTurn ? "your decision" : "pick pace"}</p></div> : <span className={cn("rounded-xl border px-3 py-2 text-xs font-black", complete ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/20 text-slate-300")}>{complete ? "Rehearsal complete" : inputMode.replaceAll("-", " ")}</span>}
            </div>
          </section>

          {inputMode === "timed-simulation" ? <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Vaughn&apos;s current team</p><h3 className="mt-1 text-xl font-black">Roster and empty starting positions</h3></div><span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-slate-300">{myRosterTeam?.starters.length ?? 0} starters · {myRosterTeam?.bench.length ?? 0} bench</span></div><div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Drafted roster</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{myRosterPlayers.map((candidate) => <div key={candidate.player.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2"><span className="min-w-0"><span className="block truncate text-sm font-black">{candidate.player.fullName}</span><span className="text-[10px] text-slate-500">{primaryPosition(candidate)} · {myStarterIds.has(candidate.player.id) ? "starter" : "bench"}</span></span>{myKeeperIds.has(candidate.player.id) ? <span className="ml-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] px-2 py-1 text-[9px] font-black text-amber-100">Keeper</span> : null}</div>)}{myRosterPlayers.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-3 text-sm text-slate-500">No players drafted yet.</p> : null}</div></div><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Open starter slots</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(openSlotCounts).map(([slot, count]) => <span key={slot} className="rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-3 py-2 text-xs font-black text-rose-100">{slot === "W/R/T" ? "FLEX" : slot} × {count}</span>)}{Object.keys(openSlotCounts).length === 0 ? <span className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2 text-xs font-black text-emerald-100">Starting lineup filled</span> : null}</div></div></div></section> : null}

          {isMyTurn && (inputMode !== "timed-simulation" || simulationStarted) && heroCandidate && heroRecommendation && heroSignal && heroPresentation && heroCall ? (
            <>
              <section className="rounded-[28px] border border-cyan-300/30 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Draft assistant · top pick</p><h3 className="mt-1 text-xl font-black">Your best decision right now</h3></div><span className={cn("rounded-xl border px-3 py-2 text-lg font-black", managerSecondsLeft <= 15 ? "border-rose-300/40 text-rose-100" : "border-amber-300/30 text-amber-100")}>{inputMode === "timed-simulation" ? `${managerSecondsLeft}s` : "Your pick"}</span></div>
                <div className="relative mt-4 overflow-hidden rounded-[24px] border border-cyan-300/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(8,20,35,0.96)_62%)] p-5 sm:p-6">
                  {favoriteIdSet.has(heroCandidate.player.id) ? <VjEarmark /> : null}
                  <div className="flex flex-wrap items-start justify-between gap-3 pr-8"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">#1 recommendation</p><h4 className="mt-2 text-2xl font-black sm:text-3xl">{heroCandidate.player.fullName}</h4><p className="mt-1 text-sm text-slate-400">{primaryPosition(heroCandidate)} · {heroCandidate.player.team} · {heroPresentation.price}</p></div><span className={cn("rounded-xl border px-3 py-2 text-xs font-black", warRoomCallClasses[heroCall])}>{heroCall}</span></div>
                  <p className="mt-4 text-lg font-black text-white">{heroPresentation.chanceBack}</p>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Why he is #1 · {heroPresentation.driver}</p><p className="mt-2 text-sm leading-6 text-slate-200">{heroPresentation.whyNow}</p>{heroPresentation.comparison ? <p className="mt-2 text-xs leading-5 text-slate-400">{heroPresentation.comparison}</p> : null}</div>
                  <div className={cn("mt-4 rounded-2xl border p-3", turnContext.mode === "long-gap" ? "border-rose-300/25 bg-rose-300/[0.07]" : turnContext.mode === "pair-building" ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-white/10 bg-black/20")}><p className="text-xs font-black uppercase tracking-[0.14em]">{turnContext.label}</p><p className="mt-1 text-xs leading-5 text-slate-300">{turnContext.summary}</p></div>
                  <Button className="mt-4" onClick={() => makeManagerPick(heroCandidate, 0)}>Draft {heroCandidate.player.fullName}</Button>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {recommendations.slice(1, 4).map((recommendation, index) => {
                    const candidate = candidateById.get(recommendation.playerId);
                    const signal = candidate ? boardSignalById.get(candidate.player.id) : null;
                    const liveCall = candidate ? liveCallById.get(candidate.player.id) : null;
                    if (!candidate || !signal || !liveCall) return null;
                    const comparison = recommendation.explanation.positionalComparisonPlayerId ? candidateById.get(recommendation.explanation.positionalComparisonPlayerId) : null;
                    const presentation = explainWarRoomRecommendation({ candidate, recommendation, signal, runSnapshot: runSnapshotByPosition.get(primaryPosition(candidate)), positionalComparison: comparison, turnContext });
                    const call = warRoomDraftCall(liveCall.action, signal);
                    return <div key={candidate.player.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-2 pr-5"><span className="text-[10px] font-black uppercase text-slate-500">#{index + 2} alternative</span><span className={cn("rounded-lg border px-2 py-1 text-[9px] font-black", warRoomCallClasses[call])}>{call}</span></div><p className="mt-3 font-black">{candidate.player.fullName}</p><p className="mt-1 text-xs text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.adp}</p><p className="mt-3 text-xs font-bold text-white">{presentation.chanceBack}</p><p className="mt-2 text-xs leading-5 text-slate-400"><span className="font-bold text-slate-200">{presentation.driver}:</span> {presentation.whyNow}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => makeManagerPick(candidate, index + 1)}>Draft player</Button>{favoriteIdSet.has(candidate.player.id) ? <VjEarmark compact /> : null}</div>;
                  })}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">All remaining players</p><h3 className="mt-1 text-xl font-black">Full live board</h3></div><span className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs font-black text-amber-100">{managerSecondsLeft}s remaining</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{([['recommended', 'Recommended now'], ['adp', 'ADP'], ['model', 'Model board']] as const).map(([id, label]) => <button key={id} onClick={() => { setBoardSort(id); setBoardShowCount(40); }} className={cn("rounded-full border px-3 py-2 text-xs font-black", boardSort === id ? "border-cyan-300 bg-cyan-300/12 text-cyan-100" : "border-white/10 text-slate-400")}>{label}</button>)}<button onClick={() => { setBoardVjOnly((current) => !current); setBoardShowCount(40); }} className={cn("rounded-full border px-3 py-2 text-xs font-black", boardVjOnly ? "border-amber-300 bg-amber-300/12 text-amber-100" : "border-white/10 text-slate-400")}>VJ targets</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input value={boardQuery} onChange={(event) => { setBoardQuery(event.target.value); setBoardShowCount(40); }} placeholder="Search remaining players…" className="pl-10" /></label><div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 p-1">{BOARD_POSITIONS.map((item) => <button key={item} onClick={() => { setBoardPosition(item); setBoardShowCount(40); }} className={cn("min-w-10 rounded-xl px-2 py-2 text-xs font-black", boardPosition === item ? "bg-white text-slate-950" : "text-slate-400")}>{item}</button>)}</div></div>
                {boardSort === "adp" ? <p className="mt-3 text-xs text-slate-500">Market order is active. The recommendation number remains visible as a gut check.</p> : null}
                <div className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10">
                  {remainingBoard.slice(0, boardShowCount).map(({ candidate, recommendation }) => {
                    const signal = boardSignalById.get(candidate.player.id);
                    const liveCall = liveCallById.get(candidate.player.id);
                    if (!signal || !liveCall) return null;
                    const comparison = recommendation.explanation.positionalComparisonPlayerId ? candidateById.get(recommendation.explanation.positionalComparisonPlayerId) : null;
                    const presentation = explainWarRoomRecommendation({ candidate, recommendation, signal, runSnapshot: runSnapshotByPosition.get(primaryPosition(candidate)), positionalComparison: comparison, turnContext });
                    const call = warRoomDraftCall(liveCall.action, signal);
                    const recommendationRank = recommendationRankById.get(candidate.player.id) ?? 999;
                    return <div key={candidate.player.id} className="relative grid gap-3 bg-[#091524] p-3 pr-10 sm:grid-cols-[52px_minmax(180px,1fr)_110px_minmax(180px,1.2fr)_auto] sm:items-center"><span className="text-slate-400"><span className="block text-[9px] font-black uppercase text-slate-600">Now</span><span className="text-lg font-black">#{recommendationRank}</span></span><span className="min-w-0"><span className="block truncate font-black">{candidate.player.fullName}</span><span className="text-xs text-slate-500">{primaryPosition(candidate)} · {candidate.player.team} · ADP {candidate.market.adp}</span></span><span className={cn("w-fit rounded-lg border px-2 py-1 text-[10px] font-black", warRoomCallClasses[call])}>{call}</span><span className="text-xs leading-5 text-slate-400"><span className="font-bold text-slate-200">{presentation.driver}:</span> {presentation.whyNow}</span><Button size="sm" variant="outline" onClick={() => makeManagerPick(candidate, recommendationRank - 1)}>Draft</Button>{favoriteIdSet.has(candidate.player.id) ? <VjEarmark compact /> : null}</div>;
                  })}
                  {remainingBoard.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No remaining players match these filters.</p> : null}
                </div>
                {remainingBoard.length > boardShowCount ? <Button variant="outline" className="mt-3 w-full" onClick={() => setBoardShowCount((count) => count + 40)}>Show more players</Button> : null}
              </section>
            </>
          ) : null}

          {inputMode === "timed-simulation" && !simulationStarted ? <section className="rounded-[28px] border border-dashed border-cyan-300/25 bg-[#0a1727]/70 p-8 text-center"><Clock3 className="mx-auto h-8 w-8 text-cyan-300" /><h3 className="mt-3 text-xl font-black">Choose the room, then start the clock.</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">The board will reset with your two canonical keepers and the selected opponent keeper load. No simulated picks occur until you press Start simulation.</p></section> : null}

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
