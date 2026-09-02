"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Pencil, Play, RefreshCw, Search, ShieldAlert, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { buildPositionMarketSnapshots, buildPositionRunSnapshots, buildRedraftBoard, buildWrapSimulationSnapshot, rankDraftCandidates, type RedraftBoardEntry } from "@/lib/fantasy/draft";
import { buildDraftTurnContext, getSnakePickInfo } from "@/lib/fantasy/draftState";
import { buildDraftBoardSignal } from "@/lib/fantasy/draftSignals";
import { explainWarRoomRecommendation } from "@/lib/fantasy/warRoomPresentation";
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
import type { DraftCandidate, DraftState, PlayerPosition } from "@/lib/fantasy/types";
import { cn } from "@/lib/utils";

type DraftRehearsalModeProps = {
  candidates: DraftCandidate[];
  initialDraftState: DraftState;
  favoriteIds?: string[];
  personalBoardOrder?: string[];
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
const REHEARSAL_TIER_KEY = "fantasy-draft-rehearsal-tier-overrides-v1";
const DEFAULT_SEED = "vaughn-slot-9-rehearsal";
const BOARD_POSITIONS: Array<"ALL" | PlayerPosition> = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];
const MARKET_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

type TierOverrides = Record<string, number>;

type RehearsalBoardSort = "recommended" | "model" | "yahoo-xrank" | "yahoo-adp" | "aggregate" | "personal";

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

function buildOurTierMap(candidates: DraftCandidate[], board: RedraftBoardEntry[]) {
  const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate] as const));
  const result: TierOverrides = {};
  const gapThreshold: Record<string, number> = { QB: 18, RB: 15, WR: 15, TE: 14 };
  const maxTierSize: Record<string, number> = { QB: 4, RB: 5, WR: 5, TE: 4 };

  for (const position of MARKET_POSITIONS) {
    const entries = board
      .filter((entry) => {
        const candidate = candidateById.get(entry.playerId);
        return candidate ? primaryPosition(candidate) === position : false;
      })
      .sort((a, b) => a.positionRank - b.positionRank);
    let tier = 1;
    let tierSize = 0;
    let previous: DraftCandidate | null = null;
    for (const entry of entries) {
      const candidate = candidateById.get(entry.playerId);
      if (!candidate) continue;
      const projectionGap = previous
        ? previous.projection.range.p50 - candidate.projection.range.p50
        : 0;
      if (previous && (projectionGap >= (gapThreshold[position] ?? 15) || tierSize >= (maxTierSize[position] ?? 5))) {
        tier += 1;
        tierSize = 0;
      }
      result[candidate.player.id] = tier;
      tierSize += 1;
      previous = candidate;
    }
  }
  return result;
}

function marketRead(survival: number) {
  if (survival <= 0.34) return { label: "Likely tier loss", className: "border-rose-300/35 bg-rose-300/[0.08] text-rose-100" };
  if (survival <= 0.58) return { label: "Watch closely", className: "border-amber-300/35 bg-amber-300/[0.08] text-amber-100" };
  return { label: "Safe to wait", className: "border-emerald-300/30 bg-emerald-300/[0.07] text-emerald-100" };
}

function starterRequirement(state: DraftState, position: PlayerPosition) {
  return state.league.rosterSlots.filter((slot) => slot === position).length;
}

function teamShoppingList(team: DraftState["teams"][number]) {
  const openCounts = team.openSlots.reduce<Record<string, number>>((counts, slot) => {
    counts[slot] = (counts[slot] ?? 0) + 1;
    return counts;
  }, {});
  const labels = MARKET_POSITIONS.flatMap((position) => {
    const count = openCounts[position] ?? 0;
    return count > 0 ? [`${position} starter${count > 1 ? ` ×${count}` : ""}`] : [];
  });
  const flexCount = openCounts["W/R/T"] ?? 0;
  if (flexCount > 0) labels.push(`FLEX${flexCount > 1 ? ` ×${flexCount}` : ""}`);
  return labels.length > 0 ? labels : ["Bench / value"];
}

function OpponentRosterCard({ team, state, beforeNextTurn }: {
  team: DraftState["teams"][number];
  state: DraftState;
  beforeNextTurn: boolean;
}) {
  const shopping = teamShoppingList(team);
  return (
    <article className={cn("rounded-2xl border p-3", beforeNextTurn ? "border-amber-300/30 bg-amber-300/[0.07]" : "border-white/10 bg-black/20")}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-black">{team.teamId}</p><p className="mt-0.5 text-[10px] text-slate-500">{team.starters.length + team.bench.length} players drafted</p></div>
        <span className={cn("rounded-lg border px-2 py-1 text-[9px] font-black uppercase", beforeNextTurn ? "border-amber-300/30 text-amber-100" : "border-white/10 text-slate-500")}>{beforeNextTurn ? "Before you" : "Later"}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {MARKET_POSITIONS.map((position) => {
          const count = team.positionCounts[position] ?? 0;
          const required = starterRequirement(state, position);
          const filled = count >= required;
          return <div key={position} className={cn("rounded-lg border px-1.5 py-2 text-center", filled ? "border-emerald-300/15 bg-emerald-300/[0.04]" : "border-rose-300/20 bg-rose-300/[0.06]")}><span className="block text-[9px] font-black uppercase text-slate-500">{position}</span><span className={cn("mt-0.5 block text-sm font-black", filled ? "text-slate-200" : "text-rose-100")}>{count}<span className="text-[9px] text-slate-600">/{required}</span></span></div>;
        })}
      </div>
      <div className="mt-3"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">Still shopping for</p><div className="mt-1.5 flex flex-wrap gap-1.5">{shopping.map((label) => <span key={label} className={cn("rounded-lg border px-2 py-1 text-[10px] font-bold", label === "Bench / value" ? "border-white/10 text-slate-400" : "border-violet-300/20 bg-violet-300/[0.06] text-violet-100")}>{label}</span>)}</div></div>
    </article>
  );
}

export function DraftRehearsalMode({ candidates, initialDraftState, favoriteIds = [], personalBoardOrder = [] }: DraftRehearsalModeProps) {
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
  const [tierOverrides, setTierOverrides] = useState<TierOverrides>({});
  const [tierEditorOpen, setTierEditorOpen] = useState(false);
  const [tierEditorPosition, setTierEditorPosition] = useState<PlayerPosition>("QB");

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

  useEffect(() => {
    if (!hydrated) return;
    let storedOverrides: TierOverrides | null = null;
    try {
      const stored = window.localStorage.getItem(REHEARSAL_TIER_KEY);
      if (stored) storedOverrides = JSON.parse(stored) as TierOverrides;
    } catch {
      window.localStorage.removeItem(REHEARSAL_TIER_KEY);
    }
    if (storedOverrides) queueMicrotask(() => setTierOverrides(storedOverrides));
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(REHEARSAL_TIER_KEY, JSON.stringify(tierOverrides));
  }, [hydrated, tierOverrides]);

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
  const recommendations = useMemo(() => rankedRecommendations.slice(0, 5), [rankedRecommendations]);
  const boardById = useMemo(() => new Map(rehearsalBoard.map((entry) => [entry.playerId, entry] as const)), [rehearsalBoard]);
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
  const baselineTierById = useMemo(
    () => buildOurTierMap(candidates, rehearsalBoard),
    [candidates, rehearsalBoard],
  );
  const effectiveTierById = useMemo(
    () => ({ ...baselineTierById, ...tierOverrides }),
    [baselineTierById, tierOverrides],
  );
  const positionMarkets = useMemo(
    () => buildPositionMarketSnapshots(draftState, candidates, rehearsalWrap),
    [candidates, draftState, rehearsalWrap],
  );
  const positionMarketByPosition = useMemo(
    () => new Map(positionMarkets.map((snapshot) => [snapshot.position, snapshot] as const)),
    [positionMarkets],
  );
  const topRemainingTiers = useMemo(
    () => MARKET_POSITIONS.map((position) => {
      const available = candidates
        .filter((candidate) => availableIds.has(candidate.player.id) && primaryPosition(candidate) === position)
        .sort((a, b) => (boardById.get(a.player.id)?.positionRank ?? 999) - (boardById.get(b.player.id)?.positionRank ?? 999));
      const tier = available.reduce((lowest, candidate) => Math.min(lowest, effectiveTierById[candidate.player.id] ?? 99), 99);
      const players = available.filter((candidate) => (effectiveTierById[candidate.player.id] ?? 99) === tier);
      const simulation = rehearsalWrap.positionSnapshots.find((snapshot) => snapshot.position === position);
      const fallbackExpected = runSnapshotByPosition.get(position)?.expectedSelectionsBeforeNextTurn ?? 0;
      const survivalProbability = simulation
        ? simulation.distribution.filter((outcome) => outcome.count < players.length).reduce((sum, outcome) => sum + outcome.probability, 0)
        : Math.min(0.97, Math.max(0.05, Math.exp(-fallbackExpected / Math.max(0.85, players.length * 0.9))));
      return {
        position,
        tier,
        players,
        survivalProbability,
      };
    }),
    [availableIds, boardById, candidates, effectiveTierById, rehearsalWrap.positionSnapshots, runSnapshotByPosition],
  );
  const recentPositionCounts = useMemo(
    () => draftState.drafted
      .filter((pick) => pick.eventType !== "keeper")
      .slice(-8)
      .reduce<Partial<Record<PlayerPosition, number>>>((counts, pick) => {
        const candidate = candidateById.get(pick.playerId);
        if (!candidate) return counts;
        const position = primaryPosition(candidate);
        counts[position] = (counts[position] ?? 0) + 1;
        return counts;
      }, {}),
    [candidateById, draftState.drafted],
  );
  const teamsBeforeNextTurn = useMemo(
    () => new Set(turnContext.interveningTeamIds),
    [turnContext.interveningTeamIds],
  );
  const opponentTeamsBeforeNextTurn = useMemo(
    () => draftState.teams.filter((team) => team.teamId !== draftState.myTeamId && teamsBeforeNextTurn.has(team.teamId)),
    [draftState.myTeamId, draftState.teams, teamsBeforeNextTurn],
  );
  const remainingOpponentTeams = useMemo(
    () => draftState.teams.filter((team) => team.teamId !== draftState.myTeamId && !teamsBeforeNextTurn.has(team.teamId)),
    [draftState.myTeamId, draftState.teams, teamsBeforeNextTurn],
  );
  const recommendationRankById = useMemo(
    () => new Map(rankedRecommendations.map((recommendation, index) => [recommendation.playerId, index + 1] as const)),
    [rankedRecommendations],
  );
  const personalRankById = useMemo(
    () => new Map(personalBoardOrder.map((playerId, index) => [playerId, index + 1] as const)),
    [personalBoardOrder],
  );
  const remainingBoard = useMemo(() => {
    const lowered = boardQuery.trim().toLowerCase();
    const rows = rankedRecommendations
      .map((recommendation) => ({ recommendation, candidate: candidateById.get(recommendation.playerId) }))
      .filter((row): row is typeof row & { candidate: DraftCandidate } => Boolean(row.candidate))
      .filter(({ candidate }) => boardPosition === "ALL" || candidate.player.positions.includes(boardPosition))
      .filter(({ candidate }) => !boardVjOnly || favoriteIdSet.has(candidate.player.id))
      .filter(({ candidate }) => !lowered || `${candidate.player.fullName} ${candidate.player.team} ${candidate.player.positions.join(" ")}`.toLowerCase().includes(lowered));
    return [...rows].sort((a, b) => {
      if (boardSort === "model") return (boardById.get(a.candidate.player.id)?.boardRank ?? 999) - (boardById.get(b.candidate.player.id)?.boardRank ?? 999);
      if (boardSort === "yahoo-xrank") return (a.candidate.market.yahooXRank ?? a.candidate.market.yahooRank ?? 999) - (b.candidate.market.yahooXRank ?? b.candidate.market.yahooRank ?? 999);
      if (boardSort === "yahoo-adp") return (a.candidate.market.yahooAdp ?? a.candidate.market.adp ?? 999) - (b.candidate.market.yahooAdp ?? b.candidate.market.adp ?? 999);
      if (boardSort === "aggregate") return (a.candidate.market.aggregateRank ?? 999) - (b.candidate.market.aggregateRank ?? 999);
      if (boardSort === "personal") return (personalRankById.get(a.candidate.player.id) ?? 999) - (personalRankById.get(b.candidate.player.id) ?? 999);
      return (recommendationRankById.get(a.candidate.player.id) ?? 999) - (recommendationRankById.get(b.candidate.player.id) ?? 999);
    });
  }, [boardById, boardPosition, boardQuery, boardSort, boardVjOnly, candidateById, favoriteIdSet, personalRankById, rankedRecommendations, recommendationRankById]);
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="rounded-[28px] border border-cyan-300/25 bg-[#0a1727]/92 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4"><div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><span className="text-[10px] font-black uppercase">Pick</span><span className="text-2xl font-black">{draftState.currentPick}</span></div><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{isMyTurn ? "Vaughn is on the clock" : `${pickInfo.teamId} is on the clock`}</p><h3 className="mt-1 text-xl font-black">Round {pickInfo.round}, pick {pickInfo.pickInRound}</h3><p className="mt-1 text-xs text-slate-500">{livePicks} live practice picks recorded · {draftState.picksUntilNextTurn} until your turn</p></div></div>
              {inputMode === "timed-simulation" && simulationStarted ? <div className={cn("min-w-32 rounded-2xl border px-4 py-3 text-center", isMyTurn ? managerSecondsLeft <= 15 ? "border-rose-300/40 bg-rose-300/10" : "border-amber-300/30 bg-amber-300/[0.08]" : "border-cyan-300/25 bg-cyan-300/[0.06]")}><p className="text-2xl font-black">{isMyTurn ? `${managerSecondsLeft}s` : "2.0s"}</p><p className="text-[10px] font-black uppercase text-slate-400">{isMyTurn ? "your decision" : "pick pace"}</p></div> : <span className={cn("rounded-xl border px-3 py-2 text-xs font-black", complete ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/20 text-slate-300")}>{complete ? "Rehearsal complete" : inputMode.replaceAll("-", " ")}</span>}
            </div>
          </section>

          {(inputMode !== "timed-simulation" || simulationStarted) ? (
            <section className="rounded-[28px] border border-cyan-300/35 bg-[linear-gradient(135deg,rgba(34,211,238,0.09),rgba(10,23,39,0.96)_55%)] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">On the clock</p><h3 className="mt-1 text-xl font-black">Five equal-weight options</h3><p className="mt-1 text-xs leading-5 text-slate-400">No forced #1. Compare the main why and the chance each player reaches your next pick.</p></div><span className={cn("rounded-xl border px-3 py-2 text-sm font-black", isMyTurn ? managerSecondsLeft <= 15 ? "border-rose-300/40 text-rose-100" : "border-amber-300/30 text-amber-100" : "border-white/10 bg-black/20 text-slate-300")}>{isMyTurn ? inputMode === "timed-simulation" ? `${managerSecondsLeft}s` : "Your pick" : `Next pick in ${draftState.picksUntilNextTurn}`}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {recommendations.map((recommendation, index) => {
                  const candidate = candidateById.get(recommendation.playerId);
                  if (!candidate) return null;
                  const recommendationRank = recommendationRankById.get(candidate.player.id) ?? index + 1;
                  const chanceBack = Math.round(recommendation.explanation.makeItBackProbability * 100);
                  const boardEntry = boardById.get(candidate.player.id);
                  const signal = boardEntry
                    ? buildDraftBoardSignal(candidate, boardEntry, favoriteIdSet.has(candidate.player.id))
                    : null;
                  const comparison = recommendation.explanation.positionalComparisonPlayerId
                    ? candidateById.get(recommendation.explanation.positionalComparisonPlayerId)
                    : null;
                  const presentation = signal ? explainWarRoomRecommendation({
                    candidate,
                    recommendation,
                    signal,
                    runSnapshot: runSnapshotByPosition.get(primaryPosition(candidate)),
                    positionalComparison: comparison,
                  }) : null;
                  const whyBullets = presentation
                    ? [`${presentation.driver}: ${presentation.whyNow}`, presentation.supportingWhy]
                    : recommendation.explanation.summary.slice(0, 2);
                  return <article key={candidate.player.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-2 pr-5"><span className="text-[10px] font-black uppercase text-slate-500">#{index + 1}</span><span className="text-[11px] text-slate-500">{primaryPosition(candidate)}</span></div><p className="mt-2 truncate font-black">{candidate.player.fullName}</p><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">Why</p><ul className="mt-1 space-y-1 text-xs leading-4 text-slate-300">{whyBullets.map((bullet) => <li key={bullet} className="flex gap-1.5"><span className="text-amber-200">•</span><span>{bullet}</span></li>)}</ul><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">Available next pick</p><p className="mt-1 text-xs font-bold text-white">{chanceBack}% chance</p>{isMyTurn ? <Button className="mt-2" size="sm" variant="outline" onClick={() => makeManagerPick(candidate, Math.max(0, recommendationRank - 1))}>Draft player</Button> : null}{favoriteIdSet.has(candidate.player.id) ? <VjEarmark compact /> : null}</article>;
                })}
              </div>
              <div className={cn("mt-3 rounded-2xl border p-3", turnContext.mode === "long-gap" ? "border-rose-300/25 bg-rose-300/[0.07]" : turnContext.mode === "pair-building" ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-white/10 bg-black/20")}><p className="text-xs font-black uppercase tracking-[0.14em]">{turnContext.label}</p><p className="mt-1 text-xs leading-5 text-slate-300">{turnContext.summary}</p></div>
            </section>
          ) : null}

          <details className="hidden">
            <summary className="cursor-pointer list-none p-4 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Optional tier editor</summary>
          <section className="rounded-[28px] border-t border-cyan-300/30 bg-[#0a1727]/92 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Top remaining tiers</p>
                <h3 className="mt-1 text-xl font-black">Chance each tier makes it back</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Every player still in our top available QB, RB, WR, and TE tier is shown. The percentage estimates whether at least one player from that tier survives to your next pick.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTierEditorOpen((open) => !open)}>
                <Pencil className="mr-2 h-4 w-4" /> {tierEditorOpen ? "Close tier editor" : "Edit my tiers"}
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {topRemainingTiers.map(({ position, tier, players, survivalProbability }) => {
                const run = runSnapshotByPosition.get(position);
                const market = positionMarketByPosition.get(position);
                const read = marketRead(survivalProbability);
                return (
                  <article key={position} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-lg font-black">{position}</p><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Our top remaining tier · T{tier === 99 ? "—" : tier}</p></div>
                      <span className={cn("rounded-xl border px-2.5 py-1.5 text-[10px] font-black", read.className)}>{read.label}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {players.map((candidate) => <span key={candidate.player.id} className="rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-xs font-bold">{candidate.player.fullName}</span>)}
                      {players.length === 0 ? <span className="text-xs text-slate-500">No available players</span> : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2"><span className="block text-[9px] font-black uppercase text-slate-600">Before next turn</span><span className="font-black text-slate-200">{run?.expectedSelectionsBeforeNextTurn.toFixed(1) ?? "0.0"} expected</span></div>
                      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2"><span className="block text-[9px] font-black uppercase text-slate-600">Tier makes it back</span><span className="font-black text-slate-200">{Math.round(survivalProbability * 100)}%</span></div>
                      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2"><span className="block text-[9px] font-black uppercase text-slate-600">Teams with starter need</span><span className="font-black text-slate-200">{run?.teamsWithStarterNeed ?? 0}</span></div>
                      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-2"><span className="block text-[9px] font-black uppercase text-slate-600">Last 8 live picks</span><span className="font-black text-slate-200">{recentPositionCounts[position] ?? 0} {position}</span></div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-400">{market?.tierDrop ? `The next modeled tier drops ${market.tierDrop.toFixed(1)} projected points. ` : ""}{run?.summary}</p>
                  </article>
                );
              })}
            </div>

            {tierEditorOpen ? (
              <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">Manual tier overrides</p><p className="mt-1 text-xs text-slate-400">Changes stay in this browser and survive rehearsal resets.</p></div>
                  <div className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">{MARKET_POSITIONS.map((position) => <button key={position} onClick={() => setTierEditorPosition(position)} className={cn("rounded-lg px-3 py-2 text-xs font-black", tierEditorPosition === position ? "bg-white text-slate-950" : "text-slate-400")}>{position}</button>)}</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {candidates
                    .filter((candidate) => primaryPosition(candidate) === tierEditorPosition)
                    .sort((a, b) => (boardById.get(a.player.id)?.positionRank ?? 999) - (boardById.get(b.player.id)?.positionRank ?? 999))
                    .slice(0, 24)
                    .map((candidate) => <label key={candidate.player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2"><span className="min-w-0"><span className="block truncate text-sm font-black">{candidate.player.fullName}</span><span className="text-[10px] text-slate-500">Our {tierEditorPosition}{boardById.get(candidate.player.id)?.positionRank ?? "—"} · ADP {candidate.market.adp}</span></span><Select className="w-20" value={String(effectiveTierById[candidate.player.id] ?? 1)} onChange={(event) => setTierOverrides((current) => ({ ...current, [candidate.player.id]: Number(event.target.value) }))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((tier) => <option key={tier} value={tier}>T{tier}</option>)}</Select></label>)}
                </div>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => setTierOverrides((current) => Object.fromEntries(Object.entries(current).filter(([playerId]) => {
                  const candidate = candidateById.get(playerId);
                  return !candidate || primaryPosition(candidate) !== tierEditorPosition;
                })))}><RefreshCw className="mr-2 h-4 w-4" /> Reset {tierEditorPosition} tiers</Button>
              </div>
            ) : null}
          </section>
          </details>

          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Opponent roster construction</p><h3 className="mt-1 text-xl font-black">Where the room still has holes</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Each position shows drafted players versus required starters. The shopping list separates true starter holes from remaining flex or bench appetite.</p></div><span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-slate-300">All {draftState.teams.length - 1} opponents</span></div>

            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-100">Pick before your next turn</p><p className="mt-1 text-xs text-slate-400">These teams drive the immediate make-it-back percentages above.</p></div><span className="rounded-lg bg-amber-300/10 px-2 py-1 text-xs font-black text-amber-100">{opponentTeamsBeforeNextTurn.length}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{opponentTeamsBeforeNextTurn.map((team) => <OpponentRosterCard key={team.teamId} team={team} state={draftState} beforeNextTurn />)}{opponentTeamsBeforeNextTurn.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No opponent picks before your next selection.</p> : null}</div>
            </div>

            <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Rest of the room · full visibility</p><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{remainingOpponentTeams.map((team) => <OpponentRosterCard key={team.teamId} team={team} state={draftState} beforeNextTurn={false} />)}</div></div>
          </section>

          {(inputMode !== "timed-simulation" || simulationStarted) ? (
              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">All remaining players</p><h3 className="mt-1 text-xl font-black">Full live board</h3></div><span className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs font-black text-amber-100">{managerSecondsLeft}s remaining</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{([['recommended', 'Recommended'], ['model', 'Model'], ['yahoo-xrank', 'Yahoo XRank'], ['yahoo-adp', 'Yahoo ADP'], ['aggregate', 'Aggregate'], ['personal', 'Personal']] as const).map(([id, label]) => <button key={id} onClick={() => { setBoardSort(id); setBoardShowCount(40); }} className={cn("rounded-full border px-3 py-2 text-xs font-black", boardSort === id ? "border-cyan-300 bg-cyan-300/12 text-cyan-100" : "border-white/10 text-slate-400")}>{label}</button>)}<button onClick={() => { setBoardVjOnly((current) => !current); setBoardShowCount(40); }} className={cn("rounded-full border px-3 py-2 text-xs font-black", boardVjOnly ? "border-amber-300 bg-amber-300/12 text-amber-100" : "border-white/10 text-slate-400")}>VJ targets</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input value={boardQuery} onChange={(event) => { setBoardQuery(event.target.value); setBoardShowCount(40); }} placeholder="Search remaining players…" className="pl-10" /></label><div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 p-1">{BOARD_POSITIONS.map((item) => <button key={item} onClick={() => { setBoardPosition(item); setBoardShowCount(40); }} className={cn("min-w-10 rounded-xl px-2 py-2 text-xs font-black", boardPosition === item ? "bg-white text-slate-950" : "text-slate-400")}>{item}</button>)}</div></div>
                {boardSort !== "recommended" ? <p className="mt-3 text-xs text-slate-500">Comparison order is active. The live recommendation number remains visible and no comparison field overwrites model value.</p> : null}
                <div className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10">
                  {remainingBoard.slice(0, boardShowCount).map(({ candidate, recommendation }) => {
                    const recommendationRank = recommendationRankById.get(candidate.player.id) ?? 999;
                    const position = primaryPosition(candidate);
                    const duplicate = (position === "QB" || position === "TE") && (myRosterTeam?.positionCounts[position] ?? 0) >= 1;
                    const marketFall = draftState.currentPick - candidate.market.adp;
                    const exceptional = marketFall >= 8 && recommendation.explanation.boardEdge >= 6;
                    const chanceBack = Math.round(recommendation.explanation.makeItBackProbability * 100);
                    const factualLabel = exceptional ? "Exceptional value" : duplicate ? "Roster duplicate" : chanceBack >= 70 ? "Can wait" : chanceBack <= 35 ? "Unlikely back" : "Watch window";
                    const factualClass = exceptional ? "border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100" : duplicate ? "border-violet-300/30 bg-violet-300/[0.07] text-violet-100" : chanceBack >= 70 ? "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100" : chanceBack <= 35 ? "border-rose-300/30 bg-rose-300/[0.07] text-rose-100" : "border-amber-300/25 bg-amber-300/[0.06] text-amber-100";
                    const yahooXRank = candidate.market.yahooXRank ?? candidate.market.yahooRank;
                    const low = Math.round((recommendation.explanation.makeItBackProbabilityLow ?? recommendation.explanation.makeItBackProbability) * 100);
                    const high = Math.round((recommendation.explanation.makeItBackProbabilityHigh ?? recommendation.explanation.makeItBackProbability) * 100);
                    return <div key={candidate.player.id} className="relative grid gap-3 bg-[#091524] p-3 pr-10 sm:grid-cols-[52px_minmax(190px,1fr)_130px_minmax(200px,1.2fr)_auto] sm:items-center"><span className="text-slate-400"><span className="block text-[9px] font-black uppercase text-slate-600">Now</span><span className="text-lg font-black">#{recommendationRank}</span></span><span className="min-w-0"><span className="block truncate font-black">{candidate.player.fullName}</span><span className="text-xs text-slate-500">{position} · Model #{recommendation.explanation.ourBoardRank} · Yahoo #{yahooXRank ?? "—"} · Aggregate {candidate.market.aggregateRank?.toFixed(1) ?? "—"}</span></span><span className={cn("w-fit rounded-lg border px-2 py-1 text-[10px] font-black", factualClass)}>{factualLabel}</span><span className="text-xs leading-5 text-slate-400">Model-versus-Yahoo gap {yahooXRank == null ? "—" : `${yahooXRank - recommendation.explanation.ourBoardRank > 0 ? "+" : ""}${yahooXRank - recommendation.explanation.ourBoardRank}`}. Make-it-back {low === high ? `${low}%` : `${low}–${high}%`}; tier survival {Math.round(recommendation.explanation.tierSurvivalProbability * 100)}%.</span><Button size="sm" variant="outline" disabled={!isMyTurn} onClick={() => makeManagerPick(candidate, recommendationRank - 1)}>{isMyTurn ? "Draft" : "Waiting"}</Button>{favoriteIdSet.has(candidate.player.id) ? <VjEarmark compact /> : null}</div>;
                  })}
                  {remainingBoard.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No remaining players match these filters.</p> : null}
                </div>
                {remainingBoard.length > boardShowCount ? <Button variant="outline" className="mt-3 w-full" onClick={() => setBoardShowCount((count) => count + 40)}>Show more players</Button> : null}
              </section>
          ) : null}

          {inputMode === "timed-simulation" && !simulationStarted ? <section className="rounded-[28px] border border-dashed border-cyan-300/25 bg-[#0a1727]/70 p-8 text-center"><Clock3 className="mx-auto h-8 w-8 text-cyan-300" /><h3 className="mt-3 text-xl font-black">Choose the room, then start the clock.</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">The board will reset with your two canonical keepers and the selected opponent keeper load. No simulated picks occur until you press Start simulation.</p></section> : null}

          {!isMyTurn && inputMode === "manual" ? <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Hands-on entry</p><h3 className="mt-1 text-xl font-black">Read the feed, then enter the pick</h3></div><Button onClick={revealManualPick} disabled={Boolean(expectedPlayerId)}><Clock3 className="mr-2 h-4 w-4" /> Reveal next Yahoo pick</Button></div>{expectedCandidate ? <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4"><p className="text-xs font-black uppercase text-amber-200">Simulated Yahoo feed</p><p className="mt-2 text-lg font-black">Pick {draftState.currentPick} · {expectedCandidate.player.fullName}</p><p className="text-xs text-slate-400">{primaryPosition(expectedCandidate)} · {expectedCandidate.player.team}</p></div> : null}<label className="relative mt-4 block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type the player from the simulated feed…" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2">{searchResults.map((candidate) => <button key={candidate.player.id} disabled={!expectedPlayerId} onClick={() => submitManualCandidate(candidate)} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left disabled:opacity-40"><span className="font-black">{candidate.player.fullName}</span><span className="ml-2 text-xs text-slate-500">{primaryPosition(candidate)} · {candidate.player.team}</span></button>)}</div></section> : null}

          {!isMyTurn && inputMode === "auto-sync" ? <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Extension drill</p><h3 className="mt-1 text-xl font-black">Simulate Yahoo event delivery</h3></div><Bot className="h-6 w-6 text-violet-300" /></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button onClick={applyNextAutoPick}><SkipForward className="mr-2 h-4 w-4" /> Next event</Button><Button variant="outline" onClick={() => setAutoRunning((running) => !running)}>{autoRunning ? "Pause stream" : <><Play className="mr-2 h-4 w-4" /> Run stream</>}</Button><Select value={String(paceMs)} onChange={(event) => setPaceMs(Number(event.target.value))}><option value="350">Fast · 0.35s</option><option value="900">Normal · 0.9s</option><option value="1800">Slow · 1.8s</option></Select></div></section> : null}

          {!isMyTurn && inputMode === "recovery" ? <section className="rounded-[28px] border border-rose-300/20 bg-[#0a1727]/92 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Recovery drill</p><h3 className="mt-1 text-xl font-black">Withhold picks, then reconcile atomically</h3></div><Button onClick={stageRecovery} disabled={Boolean(recoveryBatch)}><ShieldAlert className="mr-2 h-4 w-4" /> Simulate missed picks</Button></div>{recoveryBatch ? <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase text-slate-500">Screenshot/JSON recovery receipt</p>{recoveryBatch.queue.map((entry) => <p key={entry.overallPick} className="mt-2 text-sm"><span className="font-black">Pick {entry.overallPick}</span> · {entry.playerName} · {entry.teamId}</p>)}<Button className="mt-4" onClick={applyRecovery}>Validate and recover batch</Button></div> : null}</section> : null}

          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Failure lab</p><h3 className="mt-1 text-xl font-black">Break the feed without breaking the room</h3><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button variant="outline" onClick={injectDuplicate}><AlertTriangle className="mr-2 h-4 w-4" /> Duplicate</Button><Button variant="outline" onClick={injectOutOfOrder}><Activity className="mr-2 h-4 w-4" /> Out of order</Button><Button variant="outline" onClick={simulateReload}><RefreshCw className="mr-2 h-4 w-4" /> Reload recovery</Button></div></section>
        </div>

          <aside className="space-y-4">
            <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/92 p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Your roster now</p><p className="mt-1 text-sm text-slate-400">Recommendation context</p></div><span className="text-xs font-black text-slate-500">{myRosterTeam?.starters.length ?? 0} starters</span></div><div className="mt-3 flex flex-wrap gap-1.5">{(["QB", "RB", "WR", "TE"] as const).map((rosterPosition) => <span key={rosterPosition} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-black text-slate-300">{rosterPosition} {myRosterTeam?.positionCounts[rosterPosition] ?? 0}</span>)}</div><div className="mt-3 space-y-2">{myRosterPlayers.length > 0 ? myRosterPlayers.slice(0, 12).map((candidate) => <div key={candidate.player.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm"><span className="truncate font-bold">{candidate.player.fullName}</span><span className="ml-2 text-xs text-slate-500">{primaryPosition(candidate)} · {myStarterIds.has(candidate.player.id) ? "starter" : "bench"}{myKeeperIds.has(candidate.player.id) ? " · keeper" : ""}</span></div>) : <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-500">No rostered players recorded yet.</p>}</div><div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(openSlotCounts).slice(0, 6).map(([slot, count]) => <span key={slot} className="rounded-lg border border-rose-300/20 bg-rose-300/[0.06] px-2 py-1 text-[10px] font-black text-rose-100">Open {slot === "W/R/T" ? "FLEX" : slot} × {count}</span>)}</div></section>
            <section className="rounded-[28px] border border-emerald-300/20 bg-[#0a1727]/92 p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Readiness scorecard</p><p className="mt-1 text-sm text-slate-400">Operator performance</p></div>{summary.ready ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <Clock3 className="h-6 w-6 text-amber-300" />}</div><p className="mt-4 text-sm font-bold">{summary.summary}</p><div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Manual</p><p className="mt-1 text-lg font-black">{metrics.manualEntries}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Mismatches</p><p className="mt-1 text-lg font-black">{metrics.mismatches}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Recovered</p><p className="mt-1 text-lg font-black">{metrics.recoveredEntries}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-500">Reloads</p><p className="mt-1 text-lg font-black">{metrics.reloadRecoveries}</p></div></div><p className="mt-3 text-xs text-slate-500">Ready gate: 2 manual entries · 1 recovered pick · 1 reload · 1 rejected duplicate · advice under 1s.</p><p className="mt-2 text-xs text-slate-500">Recommendation deviations: {metrics.recommendationDeviations}/{metrics.userPicks} Vaughn picks · rejected bad events: {metrics.rejectedEvents}</p></section>
            <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/92 p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Quick player board</p><p className="mt-1 text-sm text-slate-400">Top available by current model</p></div><span className="text-[10px] font-black uppercase text-slate-500">{remainingBoard.length} available</span></div><div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">{remainingBoard.slice(0, 20).map(({ candidate, recommendation }) => <button key={candidate.player.id} disabled={!isMyTurn} onClick={() => isMyTurn && makeManagerPick(candidate, (recommendationRankById.get(candidate.player.id) ?? 1) - 1)} className="flex w-full items-center gap-2 rounded-xl bg-black/20 px-2.5 py-2 text-left disabled:opacity-60"><span className="w-6 text-center text-xs font-black text-slate-500">#{recommendationRankById.get(candidate.player.id)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{candidate.player.fullName}</span><span className="text-[10px] text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.adp ?? "—"}</span></span><span className="shrink-0 text-[10px] font-black text-cyan-100">{Math.round(recommendation.explanation.makeItBackProbability * 100)}% back</span></button>)}</div></section>
            <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Live position pressure</p><p className="mt-1 text-sm text-slate-400">{rehearsalWrap.simulations} roster-aware wrap simulations</p></div><div className="mt-3 space-y-2">{runSnapshots.slice(0, 5).map((snapshot) => <div key={snapshot.position} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex items-center justify-between"><span className="font-black">{snapshot.position}</span><span className={cn("text-[10px] font-black uppercase", snapshot.runRisk === "high" ? "text-rose-200" : snapshot.runRisk === "medium" ? "text-amber-200" : "text-emerald-200")}>{snapshot.runRisk === "high" ? "Likely to move" : snapshot.runRisk === "medium" ? "Could move" : "Likely to hold"}</span></div><p className="mt-1 text-xs text-slate-400">{snapshot.teamsWithStarterNeed} teams have a starter gap{snapshot.teamsWithFlexNeed ? ` · ${snapshot.teamsWithFlexNeed} flex gaps` : ""}</p><p className="mt-1 text-xs text-slate-500">{snapshot.expectedSelectionsBeforeNextTurn.toFixed(1)} {snapshot.position} selections expected · {Math.round(snapshot.tierSurvivalProbability * 100)}% chance a comparable option remains</p></div>)}</div></section>
          <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Latest drill result</p><div className="mt-3 space-y-2">{messages.map((message) => <p key={message} className="rounded-xl bg-black/20 p-3 text-xs leading-5 text-slate-300">{message}</p>)}</div></section>
          <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Practice pick results</p><span className="text-[10px] font-black uppercase text-slate-500">{draftState.drafted.length} picks</span></div><div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">{[...draftState.drafted].reverse().map((pick) => <div key={`${pick.overallPick}-${pick.playerId}`} className="flex gap-3 rounded-xl bg-black/20 p-2.5 text-xs"><span className="w-8 font-black text-slate-500">{pick.overallPick}</span><span><span className="block font-bold">{candidateById.get(pick.playerId)?.player.fullName ?? pick.playerId}</span><span className="text-slate-500">{pick.teamId} · {pick.source}</span></span></div>)}</div></section>
        </aside>
      </div>
    </section>
  );
}
