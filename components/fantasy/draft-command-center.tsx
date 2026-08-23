"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Search,
  Settings2,
  Star,
  Target,
  Undo2,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildPositionRunSnapshots, buildRedraftBoard, buildWrapSimulationSnapshot, rankDraftCandidates } from "@/lib/fantasy/draft";
import { applyDraftPick, getSnakePickInfo, reconcileSavedDraftState, undoLastDraftPick } from "@/lib/fantasy/draftState";
import { buildDraftBoardSignal, buildDraftQuickScoreBoard, buildLiveDraftCall, preDraftActionLabel, type DraftActionLabel, type DraftBoardSignal, type LiveDraftActionLabel } from "@/lib/fantasy/draftSignals";
import { buildMiddleRoundValuePocket } from "@/lib/fantasy/valuePocket";
import { buildAdvancedResearchShadowBoard } from "@/lib/fantasy/advancedResearchShadow";
import { scoreProjectionSnapshot } from "@/lib/fantasy/scoring";
import { applyRefreshSignals } from "@/lib/fantasy/refresh";
import type { DraftDataQualitySnapshot } from "@/lib/fantasy/draftDataQuality";
import type { DraftBoardMode, DraftCandidate, DraftState, FantasyNewsIngestionReport, PlayerPosition, RefreshSignal, WrapSimulationSnapshot } from "@/lib/fantasy/types";
import { cn } from "@/lib/utils";
import { resolveLeagueSetup } from "@/lib/fantasy/leagueSetup";
import { parseYahooDraftEvents, reconcileYahooDraftSnapshot } from "@/lib/fantasy/yahooDraft";

type Workspace = "predraft" | "draft" | "setup";
type BoardView = "all" | "favorites" | "targets" | "values" | "shadow";
type FavoritePriority = "must" | "like" | "late";

type Favorite = {
  playerId: string;
  priority: FavoritePriority;
  note: string;
};

type ManualNewsSubmission = {
  ok: boolean;
  error?: string;
  signal?: RefreshSignal;
  player?: {
    id: string;
    fullName: string;
    team: string;
    positions: PlayerPosition[];
  } | null;
};

type LeagueIntake = {
  teamNames: string;
  myTeamName: string;
  myDraftSlot: string;
  draftOrder: string;
  keepers: string;
  draftHistory?: string;
};

type DraftCommandCenterProps = {
  boardMode: DraftBoardMode;
  boardSummary: string;
  candidates: DraftCandidate[];
  initialDraftState: DraftState;
  sourceMode: string;
  sourceMessage: string;
  dataQuality: DraftDataQualitySnapshot;
};

const FAVORITES_KEY = "fantasy-command-center-favorites-v2";
// Bump this whenever persisted draft-event semantics change. Version 3 adds
// keeper/live event types, so older rooms must not make keeper picks undoable.
const DRAFT_KEY = "fantasy-command-center-live-draft-v3";
const SETUP_KEY = "fantasy-command-center-league-setup-v2";
const MANUAL_NEWS_KEY = "fantasy-command-center-manual-news-v1";
const POSITIONS: Array<"ALL" | PlayerPosition> = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

const priorityMeta: Record<FavoritePriority, { label: string; short: string; color: string }> = {
  must: { label: "Must draft", short: "Must", color: "border-amber-300/40 bg-amber-300/12 text-amber-100" },
  like: { label: "Would love", short: "Like", color: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" },
  late: { label: "Late value", short: "Late", color: "border-violet-300/35 bg-violet-300/10 text-violet-100" },
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function primaryPosition(candidate: DraftCandidate) {
  return candidate.player.positions[0] ?? "WR";
}

const actionClasses: Record<DraftActionLabel | LiveDraftActionLabel, string> = {
  Avoid: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  Pass: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  Fair: "border-white/10 bg-white/[0.05] text-slate-300",
  Target: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  Smash: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
  "Smash Now": "border-emerald-300/50 bg-emerald-300/18 text-emerald-50 shadow-sm shadow-emerald-950/30",
};

function parseTeamNames(value: string) {
  return value
    .split(/\n|,/)
    .map((name) => name.replace(/^\s*\d+[.)-]?\s*/, "").trim())
    .filter(Boolean);
}

function valueSignalClass(signal: DraftBoardSignal) {
  if (signal.valueLabel === "Strong value") return "text-emerald-200";
  if (signal.valueLabel === "Value") return "text-cyan-200";
  if (signal.valueLabel === "Early vs ADP") return "text-amber-200";
  return "text-slate-400";
}

function targetLabel(signal: DraftBoardSignal) {
  if (signal.targetAttribution === "both") return "Both";
  if (signal.targetAttribution === "user") return "Yours";
  if (signal.targetAttribution === "model") return "Model";
  return "—";
}

function newsCategoryLabel(category: RefreshSignal["category"]) {
  const labels: Record<RefreshSignal["category"], string> = {
    "injury-up": "Injury concern",
    "injury-down": "Health improving",
    "role-up": "Role improving",
    "role-down": "Role concern",
    "camp-buzz-up": "Positive camp signal",
    "camp-buzz-down": "Negative camp signal",
    "adp-steam": "Market rising",
    "adp-slide": "Market falling",
    "depth-chart-up": "Depth-chart gain",
    "depth-chart-down": "Depth-chart loss",
    "holdout-risk": "Holdout risk",
    "offense-up": "Offense improving",
    "offense-down": "Offense concern",
  };
  return labels[category];
}

export function DraftCommandCenter({
  boardMode,
  boardSummary,
  candidates: initialCandidates,
  initialDraftState,
  sourceMode,
  sourceMessage,
  dataQuality,
}: DraftCommandCenterProps) {
  const [newsSignals, setNewsSignals] = useState<RefreshSignal[]>([]);
  const [manualNewsSignals, setManualNewsSignals] = useState<RefreshSignal[]>([]);
  const [manualNewsText, setManualNewsText] = useState("");
  const [manualNewsStatus, setManualNewsStatus] = useState<"idle" | "submitting">("idle");
  const [manualNewsResult, setManualNewsResult] = useState<ManualNewsSubmission | null>(null);
  const [newsStatus, setNewsStatus] = useState<"checking" | "live" | "off" | "error">("checking");
  const [newsCheckedAt, setNewsCheckedAt] = useState<string | null>(null);
  const activeNewsSignals = useMemo(
    () => [...new Map([...manualNewsSignals, ...newsSignals].map((signal) => [
      signal.fingerprint ?? `${signal.playerId}|${signal.category}|${signal.headline}`,
      signal,
    ])).values()],
    [manualNewsSignals, newsSignals],
  );
  const candidates = useMemo(
    () => activeNewsSignals.length > 0
      ? applyRefreshSignals(initialCandidates, activeNewsSignals).candidates
      : initialCandidates,
    [activeNewsSignals, initialCandidates],
  );
  const seededFavorites = useMemo<Favorite[]>(
    () =>
      candidates
        .filter((candidate) => ["approved", "both"].includes(candidate.signals?.preferredTarget?.source ?? ""))
        .map((candidate) => ({ playerId: candidate.player.id, priority: "like", note: "" })),
    [candidates],
  );
  const [workspace, setWorkspace] = useState<Workspace>("predraft");
  const [boardView, setBoardView] = useState<BoardView>("all");
  const [position, setPosition] = useState<"ALL" | PlayerPosition>("ALL");
  const [query, setQuery] = useState("");
  const [showCount, setShowCount] = useState(40);
  const [selectedPlayerId, setSelectedPlayerId] = useState(candidates[0]?.player.id ?? "");
  const [favorites, setFavorites] = useState<Favorite[]>(seededFavorites);
  const [draftState, setDraftState] = useState(initialDraftState);
  const [draftQuery, setDraftQuery] = useState("");
  const [teamOverride, setTeamOverride] = useState("");
  const [setup, setSetup] = useState<LeagueIntake>({
    teamNames: "",
    myTeamName: "",
    myDraftSlot: "11",
    draftOrder: "",
    keepers: "",
    draftHistory: "",
  });
  const [hydrated, setHydrated] = useState(false);
  const [intelOpen, setIntelOpen] = useState(false);
  const [syncText, setSyncText] = useState("");
  const [syncMessages, setSyncMessages] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    async function refreshNews() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/fantasy/news", { cache: "no-store", signal: controller.signal });
        const report = await response.json() as FantasyNewsIngestionReport;
        if (cancelled) return;
        if (!response.ok) {
          setNewsStatus("error");
          return;
        }
        setNewsSignals(report.signals);
        setNewsCheckedAt(report.generatedAt);
        const allEnabledFeedsFailed = report.enabled
          && report.fetchedItemCount === 0
          && report.issues.some((issue) => issue.reason === "fetch-failed");
        setNewsStatus(allEnabledFeedsFailed ? "error" : report.enabled ? "live" : "off");
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) setNewsStatus("error");
      }
    }
    void refreshNews();
    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    setFavorites(readJson(FAVORITES_KEY, seededFavorites));
    const now = Date.now();
    setManualNewsSignals(readJson<RefreshSignal[]>(MANUAL_NEWS_KEY, []).filter((signal) => (
      !signal.expiresAt || new Date(signal.expiresAt).getTime() > now
    )));
    const savedDraft = readJson<DraftState | null>(DRAFT_KEY, null);
    if (savedDraft?.league?.id === initialDraftState.league.id && Array.isArray(savedDraft.availablePlayerIds)) {
      try {
        setDraftState(reconcileSavedDraftState(savedDraft, candidates, initialDraftState).state);
      } catch {
        window.localStorage.removeItem(DRAFT_KEY);
        setDraftState(initialDraftState);
      }
    }
    setSetup(readJson(SETUP_KEY, setup));
    setHydrated(true);
    // Loading browser-only working state once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftState));
  }, [draftState, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MANUAL_NEWS_KEY, JSON.stringify(manualNewsSignals));
  }, [hydrated, manualNewsSignals]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  }, [setup, hydrated]);

  const board = useMemo(() => buildRedraftBoard(candidates, draftState.league), [candidates, draftState.league]);
  const shadowBoard = useMemo(() => buildAdvancedResearchShadowBoard(candidates, draftState.league), [candidates, draftState.league]);
  const shadowById = useMemo(() => new Map(shadowBoard.map((entry) => [entry.playerId, entry])), [shadowBoard]);
  const boardById = useMemo(() => new Map(board.map((entry) => [entry.playerId, entry])), [board]);
  const quickScoreById = useMemo(() => buildDraftQuickScoreBoard(candidates, board), [board, candidates]);
  const candidateById = useMemo(() => new Map(candidates.map((candidate) => [candidate.player.id, candidate])), [candidates]);
  const favoriteById = useMemo(() => new Map(favorites.map((favorite) => [favorite.playerId, favorite])), [favorites]);
  const boardSignalById = useMemo(
    () => new Map(
      candidates.flatMap((candidate) => {
        const entry = boardById.get(candidate.player.id);
        return entry
          ? [[candidate.player.id, buildDraftBoardSignal(candidate, entry, favoriteById.has(candidate.player.id))] as const]
          : [];
      }),
    ),
    [boardById, candidates, favoriteById],
  );
  const availableIds = useMemo(() => new Set(draftState.availablePlayerIds), [draftState.availablePlayerIds]);
  const teamNames = useMemo(() => parseTeamNames(setup.draftOrder || setup.teamNames), [setup.draftOrder, setup.teamNames]);
  const setupResolution = useMemo(
    () => resolveLeagueSetup(setup, candidates, draftState.league),
    [candidates, draftState.league, setup],
  );

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => (boardById.get(a.player.id)?.boardRank ?? 999) - (boardById.get(b.player.id)?.boardRank ?? 999)),
    [boardById, candidates],
  );

  const filteredCandidates = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return sortedCandidates.filter((candidate) => {
      const favorite = favoriteById.has(candidate.player.id);
      const signal = boardSignalById.get(candidate.player.id);
      if (position !== "ALL" && !candidate.player.positions.includes(position)) return false;
      if (boardView === "favorites" && !favorite) return false;
      if (boardView === "targets" && !signal?.modelTarget) return false;
      if (boardView === "values" && signal?.valueLabel !== "Strong value" && signal?.valueLabel !== "Value") return false;
      if (boardView === "shadow" && !candidate.advancedResearch) return false;
      if (!lowered) return true;
      return [candidate.player.fullName, candidate.player.team, ...candidate.player.positions]
        .some((value) => value.toLowerCase().includes(lowered));
    });
  }, [boardSignalById, boardView, favoriteById, position, query, sortedCandidates]);

  const favoriteCards = useMemo(
    () =>
      favorites
        .map((favorite) => ({ favorite, candidate: candidateById.get(favorite.playerId), board: boardById.get(favorite.playerId) }))
        .filter((item): item is typeof item & { candidate: DraftCandidate } => Boolean(item.candidate))
        .sort((a, b) => {
          const order = { must: 0, like: 1, late: 2 };
          return order[a.favorite.priority] - order[b.favorite.priority] || (a.board?.boardRank ?? 999) - (b.board?.boardRank ?? 999);
        }),
    [boardById, candidateById, favorites],
  );

  const selectedCandidate = candidateById.get(selectedPlayerId) ?? sortedCandidates[0] ?? null;
  const selectedFavorite = selectedCandidate ? favoriteById.get(selectedCandidate.player.id) : undefined;
  const selectedBoard = selectedCandidate ? boardById.get(selectedCandidate.player.id) : undefined;
  const selectedSignal = selectedCandidate ? boardSignalById.get(selectedCandidate.player.id) : undefined;
  const selectedQuickScore = selectedCandidate ? quickScoreById.get(selectedCandidate.player.id) : undefined;
  const selectedShadow = selectedCandidate ? shadowById.get(selectedCandidate.player.id) : undefined;
  const selectedPoints = selectedCandidate
    ? scoreProjectionSnapshot(selectedCandidate.projection, draftState.league.scoring).exact
    : 0;

  const pickInfo = getSnakePickInfo(draftState.currentPick, draftState.league.teams);
  const wrap = useMemo<WrapSimulationSnapshot>(() => {
    // The Monte Carlo layer is useful after hydration, but running it during
    // server rendering delays the first byte and can make the room look hung.
    if (!hydrated) {
      return {
        simulations: 0,
        picksSimulated: draftState.picksUntilNextTurn,
        positionSnapshots: [],
        pickPredictions: [],
        threatenedPlayers: [],
        summary: "Live wrap simulation initializes when the command center opens.",
      };
    }
    // Only players plausibly available in the near draft window belong in the
    // wrap model. Including all 438 kickers/deep reserves adds seconds of work
    // without changing the next-turn probabilities.
    return buildWrapSimulationSnapshot(draftState, sortedCandidates.slice(0, 120), {
      simulations: 48,
    });
  }, [draftState, hydrated, sortedCandidates]);
  const runSnapshots = useMemo(
    () => buildPositionRunSnapshots(draftState, candidates, wrap),
    [candidates, draftState, wrap],
  );
  const valuePocket = useMemo(
    () => buildMiddleRoundValuePocket({
      candidates,
      state: draftState,
      board,
      signals: boardSignalById,
      quickScores: quickScoreById,
      wrap,
    }),
    [board, boardSignalById, candidates, draftState, quickScoreById, wrap],
  );
  const valuePocketById = useMemo(
    () => new Map(valuePocket.map((entry) => [entry.playerId, entry] as const)),
    [valuePocket],
  );
  const myRosterTeam = draftState.teams.find((team) => team.teamId === draftState.myTeamId) ?? null;
  const myRosterPlayers = useMemo(
    () => [...(myRosterTeam?.starters ?? []), ...(myRosterTeam?.bench ?? [])]
      .map((playerId) => candidateById.get(playerId))
      .filter((candidate): candidate is DraftCandidate => Boolean(candidate)),
    [candidateById, myRosterTeam?.bench, myRosterTeam?.starters],
  );
  const liveRecommendations = useMemo(
    () => rankDraftCandidates(draftState, candidates, wrap).slice(0, 5),
    [candidates, draftState, wrap],
  );
  const draftSearchResults = useMemo(() => {
    const lowered = draftQuery.trim().toLowerCase();
    return sortedCandidates
      .filter((candidate) => availableIds.has(candidate.player.id))
      .filter((candidate) => !lowered || [candidate.player.fullName, candidate.player.team, ...candidate.player.positions]
        .some((value) => value.toLowerCase().includes(lowered)))
      .slice(0, 12);
  }, [availableIds, draftQuery, sortedCandidates]);

  function setFavorite(candidate: DraftCandidate, priority: FavoritePriority) {
    setFavorites((current) => {
      const existing = current.find((favorite) => favorite.playerId === candidate.player.id);
      if (existing) {
        return current.map((favorite) => favorite.playerId === candidate.player.id ? { ...favorite, priority } : favorite);
      }
      return [...current, { playerId: candidate.player.id, priority, note: "" }];
    });
  }

  function removeFavorite(playerId: string) {
    setFavorites((current) => current.filter((favorite) => favorite.playerId !== playerId));
  }

  function updateFavoriteNote(playerId: string, note: string) {
    setFavorites((current) => current.map((favorite) => favorite.playerId === playerId ? { ...favorite, note } : favorite));
  }

  function recordPick(candidate: DraftCandidate) {
    setDraftState((current) => applyDraftPick(current, candidate, teamOverride || undefined));
    setDraftQuery("");
    setTeamOverride("");
  }

  function applyResolvedSetup() {
    if (!setupResolution.state) return;
    setDraftState(setupResolution.state);
    setTeamOverride("");
    setDraftQuery("");
  }

  function recoverFromSnapshot() {
    try {
      const events = parseYahooDraftEvents(syncText);
      const result = reconcileYahooDraftSnapshot(draftState, candidates, events);
      setSyncMessages(result.applied
        ? [`Recovered ${result.receipts.length} live picks. Board resumes at Pick ${result.state.currentPick}.`, ...result.receipts.slice(-5)]
        : result.errors);
      if (result.applied) setDraftState(result.state);
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "Could not parse the draft snapshot."]);
    }
  }

  async function submitManualNews(textOverride?: string) {
    const text = (textOverride ?? manualNewsText).trim();
    if (!text) {
      setManualNewsResult({ ok: false, error: "Paste the Sleeper notification first." });
      return;
    }
    setManualNewsStatus("submitting");
    setManualNewsResult(null);
    try {
      const response = await fetch("/api/fantasy/news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result = await response.json() as ManualNewsSubmission;
      if (!response.ok || !result.ok || !result.signal) {
        setManualNewsResult({ ok: false, error: result.error ?? "Moodin could not interpret that notification." });
        return;
      }
      setManualNewsSignals((current) => [
        result.signal!,
        ...current.filter((signal) => signal.fingerprint !== result.signal!.fingerprint),
      ].slice(0, 30));
      setManualNewsText("");
      setManualNewsResult(result);
      if (result.player?.id) setSelectedPlayerId(result.player.id);
      window.postMessage({
        type: "MOODIN_MANUAL_NEWS_SUBMITTED",
        alert: {
          id: result.signal.externalId ?? result.signal.fingerprint,
          playerId: result.signal.playerId,
          headline: result.signal.headline,
          sourceLabel: result.signal.sourceLabel ?? "Sleeper notification (pasted)",
          requiresYahooScan: true,
        },
      }, window.location.origin);
    } catch (error) {
      setManualNewsResult({ ok: false, error: error instanceof Error ? error.message : "The notification could not be submitted." });
    } finally {
      setManualNewsStatus("idle");
    }
  }

  async function pasteAndSubmitManualNews() {
    try {
      const text = await navigator.clipboard.readText();
      setManualNewsText(text);
      await submitManualNews(text);
    } catch {
      setManualNewsResult({ ok: false, error: "Clipboard access was blocked. Paste into the box, then choose Apply now." });
    }
  }

  function teamLabel(teamId: string) {
    const index = Number(teamId.replace("team-", "")) - 1;
    return teamNames[index] ? `${teamNames[index]} · ${teamId}` : teamId;
  }

  const setupCompleteCount = [teamNames.length >= draftState.league.teams, Boolean(setup.draftOrder.trim()), Boolean(setup.keepers.trim()), Boolean(setup.myTeamName.trim())].filter(Boolean).length;
  const livePickCount = draftState.drafted.filter((pick) => pick.eventType !== "keeper").length;
  const isDraftPreview = livePickCount === 0;

  return (
    <main className="min-h-screen bg-[#06101d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.13),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(245,158,11,0.10),transparent_26%)]" />
      <div className="relative mx-auto w-full max-w-[1440px] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-10">
        <header className="rounded-[28px] border border-white/10 bg-[#0a1727]/90 p-4 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
                <Zap className="h-4 w-4" /> Fantasy draft HQ
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Build your board. Win the room.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                One focused workspace for choosing your guys now and making the next pick quickly on draft night.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/fantasy-football/backtest" className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-xs font-black text-cyan-100 hover:bg-cyan-300/10">
                Model backtest
              </Link>
              <div className={cn(
                "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold",
                dataQuality.status === "ready"
                  ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                  : dataQuality.status === "degraded"
                    ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    : "border-rose-300/35 bg-rose-300/10 text-rose-100",
              )}>
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  dataQuality.status === "ready"
                    ? "bg-emerald-400"
                    : dataQuality.status === "degraded"
                      ? "bg-amber-300"
                      : "bg-rose-400",
                )} />
                {dataQuality.status === "ready"
                  ? "Verified full board"
                  : dataQuality.status === "degraded"
                    ? "Data warning"
                    : "Rankings blocked"}
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold",
                  newsStatus === "live"
                    ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                    : newsStatus === "error"
                      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
                      : "border-white/10 bg-white/[0.04] text-slate-400",
                )}
                title={newsCheckedAt ? `Last checked ${new Date(newsCheckedAt).toLocaleTimeString()}` : undefined}
              >
                <span className={cn("h-2 w-2 rounded-full", newsStatus === "live" ? "bg-cyan-300" : newsStatus === "error" ? "bg-rose-400" : "bg-slate-500")} />
                {newsStatus === "live"
                  ? `${newsSignals.length} passive signal${newsSignals.length === 1 ? "" : "s"}`
                  : newsStatus === "checking"
                    ? "Refreshing RotoWire"
                    : newsStatus === "error"
                      ? "News feed error"
                      : "News feeds off"}
              </div>
            </div>
          </div>

          <nav className="mt-5 hidden grid-cols-3 gap-1 rounded-2xl bg-black/25 p-1 lg:grid" aria-label="Fantasy workspace">
            {([
              ["predraft", "Pre-draft", Target],
              ["draft", "Draft room", Clock3],
              ["setup", "League setup", Settings2],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setWorkspace(id)}
                className={cn(
                  "flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-xs font-black transition sm:text-sm",
                  workspace === id ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-950/30" : "text-slate-400 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
        </header>

        <section className={cn(
          "mt-3 rounded-2xl border px-4 py-3 text-sm",
          dataQuality.status === "ready"
            ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-50"
            : dataQuality.status === "degraded"
              ? "border-amber-300/30 bg-amber-300/10 text-amber-50"
              : "border-rose-300/35 bg-rose-300/10 text-rose-50",
        )}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-black">
              {dataQuality.candidateCount} current PPR ranks · {dataQuality.directAdpCount} verified overall ADPs
            </p>
            <p className="text-xs opacity-75">{sourceMode === "live" ? "Live sources" : "Fallback data"}</p>
          </div>
          <p className="mt-1 text-xs leading-5 opacity-80">{sourceMessage}</p>
          {dataQuality.issues.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold">
              {dataQuality.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : null}
          {dataQuality.status === "blocked" ? (
            <p className="mt-2 text-xs font-black uppercase tracking-wide">
              Recommendations are not trustworthy until full-board coverage returns.
            </p>
          ) : null}
        </section>

        <section className="mt-3 rounded-[24px] border border-violet-300/20 bg-violet-300/[0.06] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Sleeper quick intake</p>
              <h2 className="mt-1 text-lg font-black">Paste the notification. Moodin applies it now.</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">This is the immediate lane. RotoWire refreshes quietly in the background about every 10 minutes.</p>
            </div>
            {manualNewsSignals.length > 0 ? (
              <button
                onClick={() => { setManualNewsSignals([]); setManualNewsResult(null); }}
                className="text-xs font-bold text-slate-500 hover:text-white"
              >
                Clear pasted alerts
              </button>
            ) : null}
          </div>
          <Textarea
            value={manualNewsText}
            onChange={(event) => setManualNewsText(event.target.value)}
            placeholder="Example: Jordan Tyson left practice early because of his hamstring."
            className="mt-3 min-h-20 bg-black/25"
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Button onClick={() => void pasteAndSubmitManualNews()} disabled={manualNewsStatus === "submitting"} variant="secondary">
              <ClipboardList className="mr-2 h-4 w-4" /> Paste clipboard & apply
            </Button>
            <Button onClick={() => void submitManualNews()} disabled={manualNewsStatus === "submitting" || !manualNewsText.trim()}>
              <Zap className="mr-2 h-4 w-4" /> {manualNewsStatus === "submitting" ? "Applying…" : "Apply now"}
            </Button>
          </div>
          {manualNewsResult ? (
            <div className={cn(
              "mt-3 rounded-2xl border p-3 text-sm",
              manualNewsResult.ok
                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-50"
                : "border-rose-300/25 bg-rose-300/10 text-rose-50",
            )}>
              {manualNewsResult.ok && manualNewsResult.signal && manualNewsResult.player ? (
                <>
                  <p className="font-black">{manualNewsResult.player.fullName} · {newsCategoryLabel(manualNewsResult.signal.category)}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">Board context updated immediately. If the Yahoo extension is loaded, it was also asked to refresh league availability.</p>
                </>
              ) : <p className="font-bold">{manualNewsResult.error}</p>}
            </div>
          ) : null}
        </section>

        {workspace === "predraft" ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-3 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Your pre-draft board</p>
                  <h2 className="mt-1 text-2xl font-black">Find players. Tap the star. Set your conviction.</h2>
                </div>
                <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
                  {(["working", "draft-week", "final"] as const).map((mode) => (
                    <Link
                      key={mode}
                      href={`/fantasy-football?board=${mode}`}
                      className={cn("rounded-lg px-2.5 py-2 font-bold capitalize", boardMode === mode ? "bg-white/10 text-white" : "text-slate-500")}
                    >
                      {mode.replace("-", " ")}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {([
                  ["all", "All players"],
                  ["favorites", `My favorites ${favorites.length}`],
                  ["targets", "Model targets"],
                  ["values", "Values"],
                  ["shadow", `Shadow ${shadowBoard.length}`],
                ] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setBoardView(id)} className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-black", boardView === id ? "border-cyan-300 bg-cyan-300/12 text-cyan-100" : "border-white/10 text-slate-400")}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="relative">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <Input value={query} onChange={(event) => { setQuery(event.target.value); setShowCount(40); }} placeholder="Search any player, team, or position" className="pl-10" />
                </label>
                <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 p-1">
                  {POSITIONS.map((item) => (
                    <button key={item} onClick={() => setPosition(item)} className={cn("min-w-10 rounded-xl px-2 py-2 text-xs font-black", position === item ? "bg-white text-slate-950" : "text-slate-400")}>{item}</button>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <div className="hidden grid-cols-[54px_minmax(210px,1fr)_70px_150px_72px_54px] gap-2 border-b border-white/10 bg-black/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 sm:grid">
                  <span>Our #</span><span>Player</span><span>ADP</span><span>Draft call</span><span>Tagged</span><span className="text-right">Star</span>
                </div>
                <div className="divide-y divide-white/[0.07]">
                  {filteredCandidates.slice(0, showCount).map((candidate) => {
                    const entry = boardById.get(candidate.player.id);
                    const favorite = favoriteById.get(candidate.player.id);
                    const signal = boardSignalById.get(candidate.player.id);
                    const quickScore = quickScoreById.get(candidate.player.id);
                    return (
                      <div key={candidate.player.id} className={cn("grid grid-cols-[42px_minmax(0,1fr)_44px] items-center gap-2 px-3 py-3 transition sm:grid-cols-[54px_minmax(210px,1fr)_70px_150px_72px_54px]", selectedCandidate?.player.id === candidate.player.id ? "bg-cyan-300/[0.07]" : "bg-[#091524] hover:bg-white/[0.04]")}>
                        <button onClick={() => setSelectedPlayerId(candidate.player.id)} className="text-left text-lg font-black text-slate-300">
                          {boardView === "shadow" && shadowById.get(candidate.player.id)
                            ? <span className="text-sm">{entry?.boardRank ?? "–"}<span className="text-violet-300">→{shadowById.get(candidate.player.id)?.shadowRank}</span></span>
                            : entry?.boardRank ?? "–"}
                        </button>
                        <button onClick={() => setSelectedPlayerId(candidate.player.id)} className="min-w-0 text-left">
                          <span className="block truncate font-black text-white">{candidate.player.fullName}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{candidate.player.positions.join("/")} · {candidate.player.team} · Pos {entry?.positionRank ?? "–"}</span>
                          {boardView === "shadow" && shadowById.get(candidate.player.id) ? <span className="mt-0.5 block text-[11px] text-violet-300">Shadow median {shadowById.get(candidate.player.id)?.medianDelta && shadowById.get(candidate.player.id)!.medianDelta > 0 ? "+" : ""}{shadowById.get(candidate.player.id)?.medianDelta.toFixed(1)} · research only</span> : null}
                          <span className="mt-1 flex flex-wrap gap-2 text-[11px] sm:hidden">
                            <span>ADP {candidate.market.adp}</span>
                            {quickScore ? <span className={cn("rounded-md border px-1.5", actionClasses[preDraftActionLabel(quickScore.action)])}>Call: {preDraftActionLabel(quickScore.action)}</span> : null}
                            {quickScore ? <span>VOR {quickScore.vorStars}★ · Cliff {quickScore.cliffStars}★</span> : null}
                            {signal && signal.targetAttribution !== "none" ? <span className="text-amber-200">{targetLabel(signal)} target</span> : null}
                          </span>
                        </button>
                        <span className="hidden text-sm text-slate-400 sm:block">{candidate.market.adp}</span>
                        <span className="hidden sm:block">{quickScore ? <><span className={cn("inline-flex rounded-lg border px-2 py-1 text-[10px] font-black", actionClasses[preDraftActionLabel(quickScore.action)])}>{preDraftActionLabel(quickScore.action)}</span><span className="mt-1 block text-[10px] font-bold text-slate-500">VOR {quickScore.vorStars}★ · Cliff {quickScore.cliffStars}★</span></> : "—"}</span>
                        <span className={cn("hidden text-xs font-black sm:block", signal?.targetAttribution === "none" ? "text-slate-600" : "text-amber-200")}>{signal ? targetLabel(signal) : "—"}</span>
                        <button
                          aria-label={favorite ? `Remove ${candidate.player.fullName} from favorites` : `Favorite ${candidate.player.fullName}`}
                          onClick={() => favorite ? removeFavorite(candidate.player.id) : setFavorite(candidate, "like")}
                          className={cn("ml-auto flex h-10 w-10 items-center justify-center rounded-xl border", favorite ? "border-amber-300/40 bg-amber-300/15 text-amber-200" : "border-white/10 text-slate-500 hover:text-amber-200")}
                        >
                          <Star className={cn("h-5 w-5", favorite && "fill-current")} />
                        </button>
                      </div>
                    );
                  })}
                  {filteredCandidates.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No players match these filters.</p> : null}
                </div>
              </div>
              {filteredCandidates.length > showCount ? (
                <Button variant="outline" className="mt-3 w-full" onClick={() => setShowCount((count) => count + 40)}>Show more players</Button>
              ) : null}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              {selectedCandidate ? (
                <section className="rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(145deg,#102338,#091522)] p-5 shadow-xl shadow-black/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Player card</p>
                      <h3 className="mt-2 text-2xl font-black">{selectedCandidate.player.fullName}</h3>
                      <p className="mt-1 text-sm text-slate-400">{selectedCandidate.player.positions.join("/")} · {selectedCandidate.player.team} · Board #{selectedBoard?.boardRank}</p>
                    </div>
                    {selectedFavorite ? <Star className="h-6 w-6 fill-amber-300 text-amber-300" /> : null}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-black/25 p-2"><p className="text-[10px] uppercase text-slate-500">Proj</p><p className="font-black">{selectedPoints.toFixed(0)}</p></div>
                    <div className="rounded-xl bg-black/25 p-2"><p className="text-[10px] uppercase text-slate-500">ADP</p><p className="font-black">{selectedCandidate.market.adp}</p></div>
                    <div className="rounded-xl bg-black/25 p-2"><p className="text-[10px] uppercase text-slate-500">vs ADP</p><p className={cn("font-black", (selectedSignal?.valueDeltaVsAdp ?? 0) > 0 ? "text-emerald-300" : (selectedSignal?.valueDeltaVsAdp ?? 0) < -4 ? "text-amber-200" : "text-slate-300")}>{(selectedSignal?.valueDeltaVsAdp ?? 0) > 0 ? "+" : ""}{selectedSignal?.valueDeltaVsAdp ?? 0}</p></div>
                  </div>
                  {selectedQuickScore ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-2"><p className="text-[10px] uppercase text-slate-500">VOR</p><p className="font-black text-amber-200">{selectedQuickScore.vorStars}★</p><p className="text-[10px] text-slate-500">{selectedQuickScore.valueOverReplacement.toFixed(0)} pts</p></div>
                      <div className="rounded-xl border border-white/10 bg-black/20 p-2"><p className="text-[10px] uppercase text-slate-500">Cliff</p><p className="font-black text-amber-200">{selectedQuickScore.cliffStars}★</p><p className="text-[10px] text-slate-500">{selectedQuickScore.cliffDrop.toFixed(0)} pts</p></div>
                      <div className={cn("rounded-xl border p-2", actionClasses[preDraftActionLabel(selectedQuickScore.action)])}><p className="text-[10px] uppercase opacity-70">Draft call</p><p className="font-black">{preDraftActionLabel(selectedQuickScore.action)}</p><p className="text-[10px] opacity-70">at this ADP</p></div>
                    </div>
                  ) : null}
                  {selectedSignal ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black">
                      <span className={cn("rounded-full border border-white/10 px-2.5 py-1", valueSignalClass(selectedSignal))}>{selectedSignal.valueLabel}</span>
                      {selectedSignal.targetAttribution !== "none" ? <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-100">{targetLabel(selectedSignal)} target</span> : null}
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-300">{selectedSignal.evidenceLabel} evidence · {selectedSignal.evidenceScore}</span>
                      {selectedSignal.alert !== "none" ? <span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2.5 py-1 text-violet-100">{selectedSignal.alert}</span> : null}
                    </div>
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-slate-300">Our board prices {selectedCandidate.player.fullName} at #{selectedBoard?.boardRank ?? "–"} versus ADP {selectedCandidate.market.adp}. Evidence quality is shown separately from price so uncertainty does not automatically become a fade.</p>

                  <div className="mt-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Your conviction</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(Object.keys(priorityMeta) as FavoritePriority[]).map((priority) => (
                        <button key={priority} onClick={() => setFavorite(selectedCandidate, priority)} className={cn("rounded-xl border px-2 py-2 text-[11px] font-black", selectedFavorite?.priority === priority ? priorityMeta[priority].color : "border-white/10 text-slate-500")}>{priorityMeta[priority].short}</button>
                      ))}
                    </div>
                    {selectedFavorite ? (
                      <>
                        <Textarea value={selectedFavorite.note} onChange={(event) => updateFavoriteNote(selectedFavorite.playerId, event.target.value)} placeholder="Why do you want him? Add a draft-day reminder." className="mt-2 min-h-20" />
                        <button onClick={() => removeFavorite(selectedFavorite.playerId)} className="mt-2 text-xs font-bold text-slate-500 hover:text-rose-300">Remove from my board</button>
                      </>
                    ) : null}
                  </div>

                  <button onClick={() => setIntelOpen((open) => !open)} className="mt-4 flex w-full items-center justify-between border-t border-white/10 pt-4 text-sm font-bold text-slate-300">
                    Research details <ChevronDown className={cn("h-4 w-4 transition", intelOpen && "rotate-180")} />
                  </button>
                  {intelOpen ? (
                    <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                      <p><span className="font-bold text-slate-200">Range:</span> {selectedCandidate.projection.range.p10.toFixed(0)} floor · {selectedCandidate.projection.range.p50.toFixed(0)} median · {selectedCandidate.projection.range.p90.toFixed(0)} ceiling</p>
                      <p><span className="font-bold text-slate-200">Plan:</span> {selectedCandidate.signals?.dossier?.usagePlan ?? "Use board rank and ADP together to define the acceptable pick window."}</p>
                      {(selectedCandidate.signals?.dossier?.failureModes ?? []).slice(0, 2).map((reason) => <p key={reason}>• {reason}</p>)}
                      {selectedCandidate.signals?.advancedUsage ? (
                        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3">
                          <p className="font-black uppercase tracking-[0.14em] text-cyan-200">Stable usage audit</p>
                          <p className="mt-1">{selectedCandidate.signals.advancedUsage.summary}</p>
                          {selectedCandidate.signals.advancedUsage.routeMetricsStatus === "unavailable" ? <p className="mt-1 text-slate-500">TPRR and route participation are withheld until a complete route feed is available. High-value opportunity is represented by play-level expected points/TDs, not a fabricated inside-the-10 proxy.</p> : null}
                        </div>
                      ) : null}
                      {selectedCandidate.advancedResearch ? (
                        <div className="mt-3 rounded-2xl border border-violet-300/15 bg-violet-300/5 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black uppercase tracking-[0.14em] text-violet-200">Research-only profile</p>
                            <span className="rounded-full border border-violet-300/20 px-2 py-0.5 text-[10px] font-black text-violet-200">0 rank impact</span>
                          </div>
                          <p className="mt-1">{selectedCandidate.advancedResearch.summary}</p>
                          {selectedCandidate.rookieWrOpportunity ? (
                            <div className="mt-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-2.5 text-cyan-50">
                              <p className="font-black uppercase tracking-[0.12em]">Market vs opportunity</p>
                              <p className="mt-1 text-sm font-bold">
                                {selectedCandidate.rookieWrOpportunity.marketMedian.toFixed(1)} → {selectedCandidate.rookieWrOpportunity.opportunityMedian.toFixed(1)} median points
                                {selectedCandidate.rookieWrOpportunity.medianDelta >= 0 ? " (+" : " ("}{selectedCandidate.rookieWrOpportunity.medianDelta.toFixed(1)})
                              </p>
                              <p className="mt-1">{selectedCandidate.rookieWrOpportunity.summary}</p>
                              <p className="mt-1 text-slate-400">Median/rank gate: {selectedCandidate.rookieWrOpportunity.activationEligible ? "eligible" : "shadow"} · breakout gate: {selectedCandidate.rookieWrOpportunity.breakoutEligible ? "eligible" : "not cleared"}</p>
                            </div>
                          ) : null}
                          {selectedShadow ? <p className="mt-1 font-bold text-violet-100">Current #{selectedShadow.currentRank} → shadow #{selectedShadow.shadowRank} · median {selectedShadow.medianDelta > 0 ? "+" : ""}{selectedShadow.medianDelta.toFixed(1)} points. {selectedShadow.explanation}</p> : null}
                          <div className="mt-2 space-y-1.5">
                            {selectedCandidate.advancedResearch.components.map((component) => (
                              <p key={component.key}>
                                <span className="font-bold text-slate-200">{component.label} ({Math.round(component.weight * 100)}%):</span>{" "}
                                {component.score === null ? "Missing" : `${component.score.toFixed(0)}/100`} · {component.summary}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">My board</p><p className="mt-1 text-sm text-slate-400">{favorites.length} saved locally</p></div>
                  <button onClick={() => setBoardView("favorites")} className="text-xs font-black text-cyan-300">View all</button>
                </div>
                <div className="mt-3 space-y-2">
                  {favoriteCards.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Star players as you browse. Your shortlist will live here and follow you into the draft room.</p> : favoriteCards.slice(0, 8).map(({ favorite, candidate, board: entry }) => (
                    <button key={candidate.player.id} onClick={() => setSelectedPlayerId(candidate.player.id)} className="flex w-full items-center gap-3 rounded-xl bg-black/20 p-2.5 text-left">
                      <span className="w-7 text-center text-sm font-black text-slate-500">{entry?.boardRank}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{candidate.player.fullName}</span><span className="text-[11px] text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.adp}</span></span>
                      <span className={cn("rounded-lg border px-2 py-1 text-[10px] font-black", priorityMeta[favorite.priority].color)}>{priorityMeta[favorite.priority].short}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        ) : null}

        {workspace === "draft" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <section className="rounded-[28px] border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),#0a1727_55%)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-cyan-400 text-slate-950"><span className="text-[10px] font-black uppercase">Pick</span><span className="text-2xl font-black">{draftState.currentPick}</span></div>
                    <div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{isDraftPreview ? "Draft engine preview" : `${teamLabel(teamOverride || pickInfo.teamId)} on the clock`}</p><h2 className="mt-1 text-2xl font-black">{isDraftPreview ? "Working first-pick scenario" : `Round ${pickInfo.round}, pick ${pickInfo.pickInRound}`}</h2><p className="mt-1 text-sm text-slate-400">{isDraftPreview ? "This becomes authoritative after final keepers are resolved and live picks begin." : draftState.picksUntilNextTurn === 0 ? "You are up now" : `${draftState.picksUntilNextTurn} picks until your turn`}</p></div>
                  </div>
                  <Button variant="outline" size="sm" disabled={!draftState.drafted.length} onClick={() => setDraftState((current) => undoLastDraftPick(current, candidates))}><Undo2 className="mr-2 h-4 w-4" /> Undo</Button>
                </div>
              </section>

              <section className="rounded-[28px] border border-amber-300/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.09),#0a1727_52%)] p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Rounds 4–10 value pocket</p><h3 className="mt-1 text-xl font-black">Where the model earns more authority</h3></div>
                  <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black text-slate-400">Context only · ranks unchanged</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">Supported model-versus-market gaps, ordered by value, cliff, evidence, and live survival. Smash Now only activates after a target falls far enough and is unlikely to return.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {valuePocket.slice(0, 6).map((entry) => {
                    const candidate = candidateById.get(entry.playerId);
                    if (!candidate) return null;
                    return (
                      <button key={entry.playerId} onClick={() => recordPick(candidate)} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left hover:border-amber-300/35">
                        <div className="flex items-center justify-between gap-2"><span className="truncate font-black">{candidate.player.fullName}</span><span className={cn("shrink-0 rounded-lg border px-2 py-1 text-[10px] font-black", actionClasses[entry.liveCall.action])}>{entry.liveCall.action}</span></div>
                        <p className="mt-1 text-xs text-slate-500">{primaryPosition(candidate)} · ADP {entry.adp} · Our #{boardById.get(entry.playerId)?.boardRank}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-300">{entry.summary}</p>
                      </button>
                    );
                  })}
                  {valuePocket.length === 0 ? <p className="sm:col-span-2 rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No supported middle-round value clears the current evidence and VOR gates.</p> : null}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">{isDraftPreview ? "Scenario recommendations" : "Best options right now"}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {liveRecommendations.slice(0, 3).map((recommendation, index) => {
                    const candidate = candidateById.get(recommendation.playerId);
                    if (!candidate) return null;
                    const favorite = favoriteById.get(candidate.player.id);
                    const signal = boardSignalById.get(candidate.player.id);
                    const quickScore = quickScoreById.get(candidate.player.id);
                    const pocketEntry = valuePocketById.get(candidate.player.id);
                    const positionCount = myRosterTeam?.positionCounts[primaryPosition(candidate)] ?? 0;
                    const rosterFit = primaryPosition(candidate) === "QB" || primaryPosition(candidate) === "TE"
                      ? positionCount >= 2 ? "blocked" as const : positionCount === 0 ? "need" as const : "open" as const
                      : positionCount < 2 ? "need" as const : "open" as const;
                    const liveCall = pocketEntry?.liveCall ?? (signal && quickScore
                      ? buildLiveDraftCall({
                          candidate,
                          quickScore,
                          signal,
                          currentPick: draftState.currentPick,
                          isMyTurn: draftState.picksUntilNextTurn === 0,
                          makeItBackProbability: recommendation.explanation.makeItBackProbability,
                          tierSurvivalProbability: recommendation.explanation.tierSurvivalProbability,
                          rosterFit,
                        })
                      : null);
                    return (
                      <button key={candidate.player.id} onClick={() => recordPick(candidate)} className={cn("rounded-2xl border p-4 text-left transition hover:-translate-y-0.5", index === 0 ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-black/20")}>
                        <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-500">#{index + 1} recommendation</span><span className="flex items-center gap-1">{liveCall ? <span className={cn("rounded-lg border px-2 py-1 text-[10px] font-black", actionClasses[liveCall.action])}>{liveCall.action}</span> : null}{favorite ? <Star className="h-4 w-4 fill-amber-300 text-amber-300" /> : null}</span></div>
                        <p className="mt-3 font-black">{candidate.player.fullName}</p><p className="mt-1 text-xs text-slate-400">{primaryPosition(candidate)} · {candidate.player.team} · ADP {candidate.market.adp}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black">
                          {signal ? <span className={cn("rounded-lg bg-white/[0.06] px-2 py-1", valueSignalClass(signal))}>Our #{recommendation.explanation.ourBoardRank} · {signal.modelEdge > 0 ? "+" : ""}{signal.modelEdge} model edge</span> : null}
                          {signal && signal.targetAttribution !== "none" ? <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-amber-100">{targetLabel(signal)} target</span> : null}
                          <span className="rounded-lg bg-violet-300/10 px-2 py-1 text-violet-100">{Math.round(recommendation.explanation.makeItBackProbability * 100)}% back</span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-300">{recommendation.explanation.expectedPositionSelections.toFixed(1)} {primaryPosition(candidate)} picks projected before your next turn · {Math.round(recommendation.explanation.tierSurvivalProbability * 100)}% tier survival.</p>
                        <span className="mt-3 inline-flex rounded-lg bg-white/10 px-2 py-1 text-[10px] font-black">Tap to record pick</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Record any pick</p><h3 className="mt-1 text-xl font-black">Fast player search</h3></div><Select value={teamOverride} onChange={(event) => setTeamOverride(event.target.value)} className="max-w-60"><option value="">On clock: {teamLabel(pickInfo.teamId)}</option>{draftState.teams.map((team) => <option key={team.teamId} value={team.teamId}>{teamLabel(team.teamId)}</option>)}</Select></div>
                <label className="relative mt-4 block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input autoFocus value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Type a player name…" className="pl-10" /></label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {draftSearchResults.map((candidate) => {
                    const favorite = favoriteById.get(candidate.player.id);
                    const signal = boardSignalById.get(candidate.player.id);
                    return <button key={candidate.player.id} onClick={() => recordPick(candidate)} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-cyan-300/35"><span className="w-8 text-center font-black text-slate-500">{boardById.get(candidate.player.id)?.boardRank}</span><span className="min-w-0 flex-1"><span className="block truncate font-black">{candidate.player.fullName}</span><span className="text-xs text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.adp}{signal ? ` · ${signal.valueDeltaVsAdp > 0 ? "+" : ""}${signal.valueDeltaVsAdp}` : ""}</span></span><span className="flex shrink-0 items-center gap-1">{signal?.modelTarget ? <Target className="h-4 w-4 text-cyan-300" /> : null}{favorite ? <Star className="h-4 w-4 fill-amber-300 text-amber-300" /> : <Check className="h-4 w-4 text-slate-600" />}</span></button>;
                  })}
                </div>
              </section>
              <details className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-black text-slate-300">Sync or recover missed picks</summary>
                <p className="mt-2 text-xs leading-5 text-slate-500">Paste a full Yahoo-style event array containing overallPick and playerName. The snapshot is validated as a whole, keepers are preserved, gaps resume at the first missing pick, and conflicts change nothing.</p>
                <Textarea className="mt-3 min-h-32" value={syncText} onChange={(event) => setSyncText(event.target.value)} placeholder={'[{"overallPick":1,"playerName":"Player Name"}]'} />
                <div className="mt-3 flex items-center gap-3"><Button variant="outline" onClick={recoverFromSnapshot} disabled={!syncText.trim()}>Validate & recover</Button><span className="text-xs text-slate-500">Atomic—no partial application</span></div>
                {syncMessages.length > 0 ? <div className="mt-3 space-y-1 text-xs text-slate-400">{syncMessages.map((message) => <p key={message}>• {message}</p>)}</div> : null}
              </details>
            </div>

            <aside className="space-y-4">
              <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/92 p-4">
                <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Your roster now</p><p className="mt-1 text-sm text-slate-400">Recommendation context</p></div><Users className="h-5 w-5 text-cyan-300" /></div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(["QB", "RB", "WR", "TE"] as const).map((rosterPosition) => <span key={rosterPosition} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-black text-slate-300">{rosterPosition} {myRosterTeam?.positionCounts[rosterPosition] ?? 0}</span>)}
                </div>
                <div className="mt-3 space-y-2">
                  {myRosterPlayers.length > 0 ? myRosterPlayers.slice(0, 12).map((candidate) => <div key={candidate.player.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm"><span className="truncate font-bold">{candidate.player.fullName}</span><span className="ml-2 text-xs text-slate-500">{primaryPosition(candidate)}</span></div>) : <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-500">No rostered players recorded yet.</p>}
                </div>
              </section>
              <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-4">
                <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Live position pressure</p><p className="mt-1 text-sm text-slate-400">{wrap.simulations} roster-aware wrap simulations</p></div><Zap className="h-5 w-5 text-violet-300" /></div>
                <div className="mt-3 space-y-2">
                  {runSnapshots.slice(0, 5).map((snapshot) => <div key={snapshot.position} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex items-center justify-between"><span className="font-black">{snapshot.position}</span><span className={cn("text-[10px] font-black uppercase", snapshot.runRisk === "high" ? "text-rose-200" : snapshot.runRisk === "medium" ? "text-amber-200" : "text-emerald-200")}>{snapshot.runRisk} pressure</span></div><p className="mt-1 text-xs text-slate-400">{snapshot.teamsWithStarterNeed} teams have a starter gap{snapshot.teamsWithFlexNeed ? ` · ${snapshot.teamsWithFlexNeed} flex gaps` : ""}</p><p className="mt-1 text-xs text-slate-500">{snapshot.expectedSelectionsBeforeNextTurn.toFixed(1)} expected picks · {Math.round(snapshot.tierSurvivalProbability * 100)}% tier survival</p></div>)}
                </div>
              </section>
              <section className="rounded-[28px] border border-amber-300/20 bg-[#0a1727]/92 p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Favorites still available</p><p className="mt-1 text-sm text-slate-400">Your conviction, in draft order</p></div><Star className="h-5 w-5 fill-amber-300 text-amber-300" /></div><div className="mt-3 space-y-2">{favoriteCards.filter(({ candidate }) => availableIds.has(candidate.player.id)).slice(0, 10).map(({ favorite, candidate, board: entry }) => <button key={candidate.player.id} onClick={() => recordPick(candidate)} className="flex w-full items-center gap-3 rounded-xl bg-black/20 p-3 text-left"><span className="text-sm font-black text-slate-500">#{entry?.boardRank}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{candidate.player.fullName}</span><span className="text-[11px] text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.adp}</span></span><span className={cn("rounded-lg border px-2 py-1 text-[10px] font-black", priorityMeta[favorite.priority].color)}>{priorityMeta[favorite.priority].short}</span></button>)}</div></section>
              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Recent picks</p><div className="mt-3 space-y-2">{draftState.drafted.slice(0, 10).map((pick) => { const candidate = candidateById.get(pick.playerId); return <div key={`${pick.overallPick}-${pick.playerId}`} className="flex gap-3 rounded-xl bg-black/20 p-2.5 text-sm"><span className="w-8 font-black text-slate-500">{pick.overallPick}</span><span className="min-w-0"><span className="block truncate font-bold">{candidate?.player.fullName ?? pick.playerId}</span><span className="text-xs text-slate-500">{teamLabel(pick.teamId)}</span></span></div>; })}{draftState.drafted.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No live picks recorded yet. Your progress will save automatically on this device.</p> : null}</div></section>
            </aside>
          </div>
        ) : null}

        {workspace === "setup" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">League intake</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Bring the room into focus.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A day or two before the draft, add the official team names, order, and keepers here. The board can then account for who picks around you and which players are already gone.</p></div><div className="shrink-0 rounded-2xl bg-black/25 px-4 py-3 text-center"><p className="text-2xl font-black text-cyan-300">{setupCompleteCount}/4</p><p className="text-[10px] uppercase text-slate-500">ready</p></div></div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-black">Your team name</span><span className="mt-1 block text-xs text-slate-500">Used to identify your roster in the draft room.</span><Input className="mt-2" value={setup.myTeamName} onChange={(event) => setSetup((current) => ({ ...current, myTeamName: event.target.value }))} placeholder="My team" /></label>
                <label className="block"><span className="text-sm font-black">Your draft slot</span><span className="mt-1 block text-xs text-slate-500">Current working assumption is pick 11.</span><Input className="mt-2" inputMode="numeric" value={setup.myDraftSlot} onChange={(event) => setSetup((current) => ({ ...current, myDraftSlot: event.target.value }))} placeholder="11" /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-black">Team names</span><span className="mt-1 block text-xs text-slate-500">One per line. These labels replace generic team IDs in the draft room.</span><Textarea className="mt-2 min-h-36" value={setup.teamNames} onChange={(event) => setSetup((current) => ({ ...current, teamNames: event.target.value }))} placeholder={"Team 1\nTeam 2\nTeam 3\n…"} /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-black">Official draft order</span><span className="mt-1 block text-xs text-slate-500">Paste the ordered list exactly as provided by the league.</span><Textarea className="mt-2 min-h-36" value={setup.draftOrder} onChange={(event) => setSetup((current) => ({ ...current, draftOrder: event.target.value }))} placeholder={"1. Team name\n2. Team name\n3. Team name\n…"} /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-black">All keepers</span><span className="mt-1 block text-xs text-slate-500">One line per keeper; include team and round cost when known.</span><Textarea className="mt-2 min-h-44" value={setup.keepers} onChange={(event) => setSetup((current) => ({ ...current, keepers: event.target.value }))} placeholder={"Team name — Player — Round 4\nTeam name — Player — Round 7"} /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-black">Past draft history (optional)</span><span className="mt-1 block text-xs text-slate-500">JSON array with teamName or teamId, overallPick, and playerName. Teams with fewer than eight matched picks stay on the neutral fallback.</span><Textarea className="mt-2 min-h-32" value={setup.draftHistory ?? ""} onChange={(event) => setSetup((current) => ({ ...current, draftHistory: event.target.value }))} placeholder={'[{"teamName":"Team 1","overallPick":1,"playerName":"Player Name"}]'} /></label>
              </div>
              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-3 text-sm text-emerald-100"><Check className="mt-0.5 h-5 w-5 shrink-0" /><span><span className="font-black">Everything saves automatically on this device.</span><span className="mt-1 block text-xs leading-5 text-emerald-100/70">The final list will receive a reviewable team/player matching receipt before it changes draft state; ambiguous keeper names will not be guessed silently.</span></span></div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-sm font-black">Canonical setup receipt</p><p className="mt-1 text-xs text-slate-500">Review every match before replacing the saved draft room.</p></div>
                  <Button disabled={!setupResolution.ready} onClick={applyResolvedSetup}>Apply to draft room</Button>
                </div>
                {setupResolution.errors.length > 0 ? <div className="mt-3 space-y-1 text-xs text-rose-200">{setupResolution.errors.map((error) => <p key={error}>• {error}</p>)}</div> : null}
                {setupResolution.receipts.length > 0 ? <div className="mt-3 space-y-1 text-xs text-emerald-100">{setupResolution.receipts.map((receipt) => <p key={receipt}>✓ {receipt}</p>)}</div> : null}
                {setupResolution.ready ? <p className="mt-3 text-xs text-cyan-200">Ready: {setupResolution.teamNames.length} teams · you are {setupResolution.myTeamId} · {setupResolution.keeperCount} keepers resolved. Applying starts live tracking at the first unoccupied pick.</p> : null}
              </div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Draft-day checklist</p><div className="mt-4 space-y-3">{[[teamNames.length >= draftState.league.teams, "All team names"], [Boolean(setup.draftOrder.trim()), "Official draft order"], [Boolean(setup.keepers.trim()), "League-wide keepers"], [Boolean(setup.myTeamName.trim()), "Your team identified"]].map(([done, label]) => <div key={String(label)} className="flex items-center gap-3 text-sm"><span className={cn("flex h-6 w-6 items-center justify-center rounded-full border", done ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/10 text-slate-600")}>{done ? <Check className="h-3.5 w-3.5" /> : null}</span><span className={done ? "text-slate-200" : "text-slate-500"}>{label}</span></div>)}</div></section>
              <section className="rounded-[28px] border border-cyan-300/20 bg-cyan-300/[0.07] p-5"><Users className="h-5 w-5 text-cyan-300" /><h3 className="mt-3 font-black">What this unlocks</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300"><li>Opponent-aware pick windows</li><li>Keeper-adjusted availability</li><li>Real names on the clock</li><li>Your exact roster and turn timing</li></ul></section>
              <details className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black"><span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Current data status</span><ChevronDown className="h-4 w-4" /></summary><p className="mt-3 text-xs leading-5 text-slate-400">{sourceMessage}</p><p className="mt-2 text-xs leading-5 text-slate-500">{boardSummary}</p></details>
            </aside>
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#071321]/95 p-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-1">{([["predraft", "Board", Target], ["draft", "Draft", Clock3], ["setup", "Setup", Settings2]] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setWorkspace(id)} className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black", workspace === id ? "bg-cyan-400 text-slate-950" : "text-slate-500")}><Icon className="h-4 w-4" />{label}</button>)}</div>
      </div>
    </main>
  );
}
