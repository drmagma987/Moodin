"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileImage,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Undo2,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildPositionRunSnapshots, buildRedraftBoard, buildWrapSimulationSnapshot, rankDraftCandidates } from "@/lib/fantasy/draft";
import { buildDraftTurnContext, getSnakePickInfo, reconcileSavedDraftState } from "@/lib/fantasy/draftState";
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
import {
  appendDraftSessionPick,
  createDraftSession,
  getDraftSessionHealth,
  replayDraftSession,
  replaceDraftSessionSnapshot,
  revertDraftSessionEvent,
  type DraftSession,
} from "@/lib/fantasy/draftSession";
import { recordDraftDecision, type DraftDecisionJournalEntry } from "@/lib/fantasy/draftDecisionJournal";
import { assertDraftRoomFreeze, buildKeeperFingerprint, freezeDraftRoom, type DraftRoomFreeze } from "@/lib/fantasy/draftOperations";
import { parseScreenshotDraftText, type ScreenshotDraftRecovery } from "@/lib/fantasy/screenshotDraftRecovery";
import { buildPostDraftActionQueue } from "@/lib/fantasy/postDraftActions";
import { leagueSourceOfTruth, leagueSourceOfTruthFingerprint } from "@/lib/fantasy/leagueSourceOfTruth";
import { buildDraftRefreshCheckpoint, compareDraftRefreshCheckpoints, type DraftRefreshCheckpoint } from "@/lib/fantasy/draftRefreshControl";
import { DraftRehearsalMode } from "@/components/fantasy/draft-rehearsal-mode";
import { explainWarRoomRecommendation, warRoomDraftCall, type WarRoomDraftCall } from "@/lib/fantasy/warRoomPresentation";

type Workspace = "predraft" | "draft" | "rehearsal" | "setup";
type BoardView = "all" | "favorites" | "targets" | "values" | "shadow";
type FavoritePriority = "must" | "like" | "late";
type DraftBoardSort = "recommended" | "model" | "yahoo-xrank" | "yahoo-adp" | "aggregate" | "personal";

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
  myTeamName: string;
  myDraftSlot: string;
  draftOrder: string;
  keepers: string;
};

type DraftCommandCenterProps = {
  boardMode: DraftBoardMode;
  boardSummary: string;
  candidates: DraftCandidate[];
  initialDraftState: DraftState;
  sourceMode: string;
  sourceMessage: string;
  dataQuality: DraftDataQualitySnapshot;
  artifactCapturedAt: string;
};

const FAVORITES_KEY = "fantasy-command-center-favorites-v2";
// Bump this whenever persisted draft-event semantics change. Version 3 adds
// keeper/live event types, so older rooms must not make keeper picks undoable.
// Version 4 standardizes opponent simulation state.
const DRAFT_KEY = "fantasy-command-center-live-draft-v4";
const SESSION_KEY = "fantasy-command-center-draft-session-v1";
const JOURNAL_KEY = "fantasy-command-center-decision-journal-v1";
const FREEZE_KEY = "fantasy-command-center-room-freeze-v1";
const REFRESH_CHECKPOINT_KEY = "fantasy-command-center-refresh-checkpoint-v1";
const SETUP_KEY = "fantasy-command-center-league-setup-v3";
const MANUAL_NEWS_KEY = "fantasy-command-center-manual-news-v1";
const PERSONAL_BOARD_KEY = "fantasy-command-center-personal-board-v1";
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

function normalizePersonalBoardOrder(saved: string[], modelOrder: string[]) {
  const validIds = new Set(modelOrder);
  const seen = new Set<string>();
  const retained = saved.filter((playerId) => {
    if (!validIds.has(playerId) || seen.has(playerId)) return false;
    seen.add(playerId);
    return true;
  });
  return [...retained, ...modelOrder.filter((playerId) => !seen.has(playerId))];
}

const actionClasses: Record<DraftActionLabel | LiveDraftActionLabel, string> = {
  Avoid: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  Pass: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  Fair: "border-white/10 bg-white/[0.05] text-slate-300",
  Target: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  Smash: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
  "Smash Now": "border-emerald-300/50 bg-emerald-300/18 text-emerald-50 shadow-sm shadow-emerald-950/30",
};

const warRoomCallClasses: Record<WarRoomDraftCall, string> = {
  "Smash Now": "border-emerald-300/50 bg-emerald-300/18 text-emerald-50",
  "Good Value": "border-cyan-300/35 bg-cyan-300/12 text-cyan-100",
  "Fair Value": "border-white/10 bg-white/[0.05] text-slate-300",
  "Too Early": "border-amber-300/35 bg-amber-300/12 text-amber-100",
  Pass: "border-rose-300/35 bg-rose-300/12 text-rose-100",
};

function VjEarmark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Vaughn personal target"
      title="Vaughn personal target"
      className={cn(
        "pointer-events-none absolute bottom-0 right-0 flex items-end justify-end bg-amber-300 font-black text-slate-950 [clip-path:polygon(100%_0,100%_100%,0_100%)]",
        compact ? "h-9 w-9 p-1 text-[9px]" : "h-14 w-14 p-1.5 text-xs",
      )}
    >
      VJ
    </span>
  );
}

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
  artifactCapturedAt,
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
  const [workspace, setWorkspace] = useState<Workspace>("draft");
  const [boardView, setBoardView] = useState<BoardView>("all");
  const [position, setPosition] = useState<"ALL" | PlayerPosition>("ALL");
  const [query, setQuery] = useState("");
  const [showCount, setShowCount] = useState(40);
  const [selectedPlayerId, setSelectedPlayerId] = useState(candidates[0]?.player.id ?? "");
  const [favorites, setFavorites] = useState<Favorite[]>(seededFavorites);
  const [draftState, setDraftState] = useState(initialDraftState);
  const [draftSession, setDraftSession] = useState<DraftSession>(() => createDraftSession(initialDraftState));
  const [decisionJournal, setDecisionJournal] = useState<DraftDecisionJournalEntry[]>([]);
  const [roomFreeze, setRoomFreeze] = useState<DraftRoomFreeze | null>(null);
  const [acceptedRefresh, setAcceptedRefresh] = useState<DraftRefreshCheckpoint | null>(null);
  const [screenshotText, setScreenshotText] = useState("");
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotRecovery, setScreenshotRecovery] = useState<ScreenshotDraftRecovery | null>(null);
  const [backupText, setBackupText] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [draftBoardSort, setDraftBoardSort] = useState<DraftBoardSort>("recommended");
  const [draftBoardPosition, setDraftBoardPosition] = useState<"ALL" | PlayerPosition>("ALL");
  const [draftBoardVjOnly, setDraftBoardVjOnly] = useState(false);
  const [draftBoardShowCount, setDraftBoardShowCount] = useState(40);
  const [personalBoardOrder, setPersonalBoardOrder] = useState<string[]>([]);
  const [personalBoardQuery, setPersonalBoardQuery] = useState("");
  const [personalBoardPosition, setPersonalBoardPosition] = useState<"ALL" | PlayerPosition>("ALL");
  const [personalBoardShowCount, setPersonalBoardShowCount] = useState(40);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [quickPickQuery, setQuickPickQuery] = useState("");
  const [setup, setSetup] = useState<LeagueIntake>({
    myTeamName: "",
    myDraftSlot: String(leagueSourceOfTruth.draft.mySlot),
    draftOrder: "",
    keepers: "",
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
    const savedSession = readJson<DraftSession | null>(SESSION_KEY, null);
    const savedDraft = readJson<DraftState | null>(DRAFT_KEY, null);
    if (savedSession) {
      try {
        const replayed = replayDraftSession(savedSession, candidates, initialDraftState);
        setDraftSession(savedSession);
        setDraftState(replayed);
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
        setDraftState(initialDraftState);
        setDraftSession(createDraftSession(initialDraftState));
      }
    } else if (savedDraft?.league?.id === initialDraftState.league.id && Array.isArray(savedDraft.availablePlayerIds)) {
      try {
        const reconciled = reconcileSavedDraftState(savedDraft, candidates, initialDraftState).state;
        setDraftState(reconciled);
        setDraftSession(createDraftSession(reconciled));
      } catch {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    }
    setDecisionJournal(readJson<DraftDecisionJournalEntry[]>(JOURNAL_KEY, []));
    setRoomFreeze(readJson<DraftRoomFreeze | null>(FREEZE_KEY, null));
    setAcceptedRefresh(readJson<DraftRefreshCheckpoint | null>(REFRESH_CHECKPOINT_KEY, null));
    setSetup({
      ...readJson(SETUP_KEY, setup),
      myDraftSlot: String(leagueSourceOfTruth.draft.mySlot),
    });
    const initialModelOrder = buildRedraftBoard(candidates, initialDraftState.league)
      .sort((a, b) => a.boardRank - b.boardRank)
      .map((entry) => entry.playerId);
    setPersonalBoardOrder(normalizePersonalBoardOrder(
      readJson<string[]>(PERSONAL_BOARD_KEY, []),
      initialModelOrder,
    ));
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
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(draftSession));
  }, [draftSession, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(decisionJournal));
  }, [decisionJournal, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (roomFreeze) window.localStorage.setItem(FREEZE_KEY, JSON.stringify(roomFreeze));
    else window.localStorage.removeItem(FREEZE_KEY);
  }, [hydrated, roomFreeze]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(MANUAL_NEWS_KEY, JSON.stringify(manualNewsSignals));
  }, [hydrated, manualNewsSignals]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  }, [setup, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(PERSONAL_BOARD_KEY, JSON.stringify(personalBoardOrder));
  }, [hydrated, personalBoardOrder]);

  const board = useMemo(() => buildRedraftBoard(candidates, draftState.league), [candidates, draftState.league]);
  const currentRefresh = useMemo(
    () => buildDraftRefreshCheckpoint(candidates, board, artifactCapturedAt),
    [artifactCapturedAt, board, candidates],
  );
  const refreshDiff = useMemo(
    () => {
      try {
        return compareDraftRefreshCheckpoints(acceptedRefresh, currentRefresh);
      } catch {
        return { added: currentRefresh.candidates, removed: [], movers: [], changed: true };
      }
    },
    [acceptedRefresh, currentRefresh],
  );
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
  const teamNames = useMemo(() => parseTeamNames(setup.draftOrder), [setup.draftOrder]);
  const setupResolution = useMemo(
    () => resolveLeagueSetup(setup, candidates, draftState.league),
    [candidates, draftState.league, setup],
  );

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => (boardById.get(a.player.id)?.boardRank ?? 999) - (boardById.get(b.player.id)?.boardRank ?? 999)),
    [boardById, candidates],
  );

  const modelPlayerOrder = useMemo(
    () => sortedCandidates.map((candidate) => candidate.player.id),
    [sortedCandidates],
  );
  const effectivePersonalBoardOrder = useMemo(
    () => normalizePersonalBoardOrder(personalBoardOrder, modelPlayerOrder),
    [modelPlayerOrder, personalBoardOrder],
  );
  const personalRankById = useMemo(
    () => new Map(effectivePersonalBoardOrder.map((playerId, index) => [playerId, index + 1] as const)),
    [effectivePersonalBoardOrder],
  );
  const personalBoardRows = useMemo(() => {
    const lowered = personalBoardQuery.trim().toLowerCase();
    return effectivePersonalBoardOrder
      .map((playerId) => candidateById.get(playerId))
      .filter((candidate): candidate is DraftCandidate => Boolean(candidate))
      .filter((candidate) => personalBoardPosition === "ALL" || candidate.player.positions.includes(personalBoardPosition))
      .filter((candidate) => !lowered || [candidate.player.fullName, candidate.player.team, ...candidate.player.positions]
        .some((value) => value.toLowerCase().includes(lowered)));
  }, [candidateById, effectivePersonalBoardOrder, personalBoardPosition, personalBoardQuery]);
  const yahooRankCoverage = useMemo(
    () => candidates.filter((candidate) => candidate.market.yahooRank != null).length,
    [candidates],
  );
  const quickPickResults = useMemo(() => {
    const lowered = quickPickQuery.trim().toLowerCase();
    if (!lowered) return [];
    return candidates
      .filter((candidate) => availableIds.has(candidate.player.id))
      .filter((candidate) => [candidate.player.fullName, candidate.player.team, ...candidate.player.positions]
        .some((value) => value.toLowerCase().includes(lowered)))
      .sort((a, b) => {
        const aName = a.player.fullName.toLowerCase();
        const bName = b.player.fullName.toLowerCase();
        const aStarts = aName.startsWith(lowered) ? 0 : 1;
        const bStarts = bName.startsWith(lowered) ? 0 : 1;
        return aStarts - bStarts || (personalRankById.get(a.player.id) ?? 999) - (personalRankById.get(b.player.id) ?? 999);
      })
      .slice(0, 6);
  }, [availableIds, candidates, personalRankById, quickPickQuery]);

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
  const isMyTurn = pickInfo.teamId === draftState.myTeamId;
  const turnContext = useMemo(() => buildDraftTurnContext(draftState), [draftState]);
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
    return buildWrapSimulationSnapshot(draftState, candidates);
  }, [candidates, draftState, hydrated]);
  const runSnapshots = useMemo(
    () => buildPositionRunSnapshots(draftState, candidates, wrap),
    [candidates, draftState, wrap],
  );
  const runSnapshotByPosition = useMemo(
    () => new Map(runSnapshots.map((snapshot) => [snapshot.position, snapshot] as const)),
    [runSnapshots],
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
  const rankedRecommendations = useMemo(
    () => rankDraftCandidates(draftState, candidates, wrap, { baseBoard: board }),
    [board, candidates, draftState, wrap],
  );
  const liveRecommendations = rankedRecommendations.slice(0, 5);
  const teamsBeforeNextTurn = useMemo(() => new Set(turnContext.interveningTeamIds), [turnContext.interveningTeamIds]);
  const orderedOpponentTeams = useMemo(() => [...draftState.teams]
    .filter((team) => team.teamId !== draftState.myTeamId)
    .sort((a, b) => Number(teamsBeforeNextTurn.has(b.teamId)) - Number(teamsBeforeNextTurn.has(a.teamId))), [draftState.myTeamId, draftState.teams, teamsBeforeNextTurn]);
  const recommendationRankById = useMemo(
    () => new Map(rankedRecommendations.map((recommendation, index) => [recommendation.playerId, index + 1] as const)),
    [rankedRecommendations],
  );
  const liveCallById = useMemo(() => new Map(
    rankedRecommendations.flatMap((recommendation) => {
      const candidate = candidateById.get(recommendation.playerId);
      const signal = boardSignalById.get(recommendation.playerId);
      const quickScore = quickScoreById.get(recommendation.playerId);
      if (!candidate || !signal || !quickScore) return [];
      const positionCount = myRosterTeam?.positionCounts[primaryPosition(candidate)] ?? 0;
      const rosterFit = primaryPosition(candidate) === "QB"
        ? positionCount >= 1 ? "blocked" as const : "need" as const
        : primaryPosition(candidate) === "TE"
          ? positionCount >= 2 ? "blocked" as const : positionCount === 0 ? "need" as const : "open" as const
        : positionCount < 2 ? "need" as const : "open" as const;
      const action = valuePocketById.get(candidate.player.id)?.liveCall ?? buildLiveDraftCall({
        candidate,
        quickScore,
        signal,
        currentPick: draftState.currentPick,
        isMyTurn,
        makeItBackProbability: recommendation.explanation.makeItBackProbability,
        tierSurvivalProbability: recommendation.explanation.tierSurvivalProbability,
        rosterFit,
      });
      return [[candidate.player.id, action] as const];
    }),
  ), [boardSignalById, candidateById, draftState.currentPick, isMyTurn, myRosterTeam?.positionCounts, quickScoreById, rankedRecommendations, valuePocketById]);
  const sessionHealth = useMemo(() => getDraftSessionHealth(draftSession, draftState), [draftSession, draftState]);
  const postDraftActions = useMemo(
    () => buildPostDraftActionQueue(draftState, candidates),
    [candidates, draftState],
  );
  const remainingDraftBoard = useMemo(() => {
    const lowered = draftQuery.trim().toLowerCase();
    const rows = rankedRecommendations
      .map((recommendation) => ({ recommendation, candidate: candidateById.get(recommendation.playerId) }))
      .filter((row): row is typeof row & { candidate: DraftCandidate } => Boolean(row.candidate))
      .filter(({ candidate }) => draftBoardPosition === "ALL" || candidate.player.positions.includes(draftBoardPosition))
      .filter(({ candidate }) => !draftBoardVjOnly || favoriteById.has(candidate.player.id))
      .filter(({ candidate }) => !lowered || [candidate.player.fullName, candidate.player.team, ...candidate.player.positions]
        .some((value) => value.toLowerCase().includes(lowered)));
    return [...rows].sort((a, b) => {
      if (draftBoardSort === "model") return (boardById.get(a.candidate.player.id)?.boardRank ?? 999) - (boardById.get(b.candidate.player.id)?.boardRank ?? 999);
      if (draftBoardSort === "yahoo-xrank") return (a.candidate.market.yahooXRank ?? a.candidate.market.yahooRank ?? 999) - (b.candidate.market.yahooXRank ?? b.candidate.market.yahooRank ?? 999);
      if (draftBoardSort === "yahoo-adp") return (a.candidate.market.yahooAdp ?? 999) - (b.candidate.market.yahooAdp ?? 999);
      if (draftBoardSort === "aggregate") return (a.candidate.market.aggregateRank ?? 999) - (b.candidate.market.aggregateRank ?? 999);
      if (draftBoardSort === "personal") return (personalRankById.get(a.candidate.player.id) ?? 999) - (personalRankById.get(b.candidate.player.id) ?? 999);
      return (recommendationRankById.get(a.candidate.player.id) ?? 999) - (recommendationRankById.get(b.candidate.player.id) ?? 999);
    });
  }, [boardById, candidateById, draftBoardPosition, draftBoardSort, draftBoardVjOnly, draftQuery, favoriteById, personalRankById, rankedRecommendations, recommendationRankById]);

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
    try {
      assertDraftRoomFreeze(roomFreeze, draftState, currentRefresh.boardFingerprint);
      if (pickInfo.teamId === draftState.myTeamId) {
        setDecisionJournal((current) => [recordDraftDecision({
          state: draftState,
          selectedPlayerId: candidate.player.id,
          recommendations: liveRecommendations,
          candidates,
        }), ...current]);
      }
      const result = appendDraftSessionPick(draftSession, candidates, draftState, {
        playerId: candidate.player.id,
        source: "manual",
      });
      setDraftSession(result.session);
      setDraftState(result.state);
      setSyncMessages(result.receipts);
      setDraftQuery("");
      setQuickPickQuery("");
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "The pick was refused."]);
    }
  }

  function movePersonalBoardPlayer(playerId: string, offset: number) {
    setPersonalBoardOrder(() => {
      const next = [...effectivePersonalBoardOrder];
      const currentIndex = next.indexOf(playerId);
      if (currentIndex < 0) return next;
      const targetIndex = Math.max(0, Math.min(next.length - 1, currentIndex + offset));
      if (targetIndex === currentIndex) return next;
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, playerId);
      return next;
    });
  }

  function movePersonalBoardPlayerBefore(playerId: string, targetPlayerId: string) {
    if (playerId === targetPlayerId) return;
    setPersonalBoardOrder(() => {
      const next = [...effectivePersonalBoardOrder];
      const sourceIndex = next.indexOf(playerId);
      const targetIndex = next.indexOf(targetPlayerId);
      if (sourceIndex < 0 || targetIndex < 0) return next;
      next.splice(sourceIndex, 1);
      next.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, playerId);
      return next;
    });
  }

  function resetPersonalBoard() {
    setPersonalBoardOrder(modelPlayerOrder);
    setPersonalBoardShowCount(40);
  }

  function applyResolvedSetup() {
    if (!setupResolution.state) return;
    setDraftState(setupResolution.state);
    setDraftSession(createDraftSession(setupResolution.state));
    setRoomFreeze(null);
    setDraftQuery("");
  }

  function recoverFromSnapshot() {
    try {
      assertDraftRoomFreeze(roomFreeze, draftState, currentRefresh.boardFingerprint);
      const events = parseYahooDraftEvents(syncText);
      const result = reconcileYahooDraftSnapshot(draftState, candidates, events);
      setSyncMessages(result.applied
        ? [`Recovered ${result.receipts.length} live picks. Board resumes at Pick ${result.state.currentPick}.`, ...result.receipts.slice(-5)]
        : result.errors);
      if (result.applied) {
        const replacement = replaceDraftSessionSnapshot(
          draftSession,
          candidates,
          draftState,
          result.state.drafted.filter((pick) => pick.eventType !== "keeper").map((pick) => ({
            overallPick: pick.overallPick,
            playerId: pick.playerId,
            pickedAt: pick.pickedAt,
            source: pick.source,
          })),
        );
        setDraftState(replacement.state);
        setDraftSession(replacement.session);
      }
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "Could not parse the draft snapshot."]);
    }
  }

  function undoDraftPick() {
    try {
      const result = revertDraftSessionEvent(draftSession, candidates, draftState);
      setDraftSession(result.session);
      setDraftState(result.state);
      setSyncMessages(result.receipts);
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "The pick could not be undone."]);
    }
  }

  function freezeReviewedRoom() {
    try {
      const next = freezeDraftRoom({
        state: draftState,
        candidateCount: candidates.length,
        artifactCapturedAt,
        setupReady: setupResolution.ready,
        dataReady: dataQuality.status === "ready",
        expectedKeeperFingerprint: setupResolution.state ? buildKeeperFingerprint(setupResolution.state.drafted) : undefined,
        boardFingerprint: currentRefresh.boardFingerprint,
      });
      setRoomFreeze(next);
      setAcceptedRefresh(currentRefresh);
      window.localStorage.setItem(REFRESH_CHECKPOINT_KEY, JSON.stringify(currentRefresh));
      setSyncMessages([`Room frozen with ${next.keeperCount} keepers · ${next.keeperFingerprint}.`]);
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "The room could not be frozen."]);
    }
  }

  function stageScreenshotRecovery() {
    setScreenshotRecovery(parseScreenshotDraftText(screenshotText, candidates, draftState));
  }

  function applyScreenshotRecovery() {
    if (!screenshotRecovery || screenshotRecovery.proposals.length === 0) return;
    try {
      assertDraftRoomFreeze(roomFreeze, draftState, currentRefresh.boardFingerprint);
      let session = draftSession;
      let state = draftState;
      const receipts: string[] = [];
      for (const proposal of screenshotRecovery.proposals) {
        const result = appendDraftSessionPick(session, candidates, state, {
          overallPick: proposal.overallPick,
          playerId: proposal.playerId,
          source: "manual",
          note: `Reviewed screenshot row: ${proposal.sourceLine}`,
        });
        session = result.session;
        state = result.state;
        receipts.push(...result.receipts);
      }
      setDraftSession(session);
      setDraftState(state);
      setSyncMessages([`Applied ${receipts.length} reviewed screenshot picks.`, ...receipts.slice(-5)]);
      setScreenshotRecovery(null);
      setScreenshotText("");
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "Screenshot recovery could not be applied."]);
    }
  }

  function downloadDraftBackup() {
    const payload = JSON.stringify({
      version: 2,
      exportedAt: new Date().toISOString(),
      session: draftSession,
      roomFreeze,
      acceptedRefresh,
      decisionJournal,
      favorites,
      personalBoardOrder: effectivePersonalBoardOrder,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `moodin-draft-backup-pick-${draftState.currentPick}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadRankingsExport() {
    const boardByPlayerId = new Map(board.map((entry) => [entry.playerId, entry] as const));
    const rankings = effectivePersonalBoardOrder.map((playerId, index) => {
      const candidate = candidateById.get(playerId);
      const boardEntry = boardByPlayerId.get(playerId);
      return {
        rank: index + 1,
        playerId,
        fullName: candidate?.player.fullName ?? playerId,
        team: candidate?.player.team ?? null,
        position: candidate ? primaryPosition(candidate) : null,
        modelRank: boardEntry?.boardRank ?? null,
        yahooXRank: candidate?.market.yahooXRank ?? candidate?.market.yahooRank ?? null,
      };
    });
    const payload = {
      format: "moodin-fantasy-personal-rankings",
      version: 1,
      exportedAt: new Date().toISOString(),
      leagueConfigVersion: leagueSourceOfTruth.version,
      leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
      boardFingerprint: currentRefresh.boardFingerprint,
      playerCount: rankings.length,
      rankings,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `moodin-fantasy-rankings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function restoreDraftBackup() {
    try {
      const parsed = JSON.parse(backupText) as {
        version?: number;
        session?: DraftSession;
        roomFreeze?: DraftRoomFreeze | null;
        acceptedRefresh?: DraftRefreshCheckpoint | null;
        decisionJournal?: DraftDecisionJournalEntry[];
        favorites?: Favorite[];
        personalBoardOrder?: string[];
      };
      if (![1, 2].includes(parsed.version ?? 0) || !parsed.session) throw new Error("Backup schema is missing or unsupported.");
      const state = replayDraftSession(parsed.session, candidates, initialDraftState);
      if (parsed.roomFreeze) assertDraftRoomFreeze(parsed.roomFreeze, state, currentRefresh.boardFingerprint);
      const restoredFavorites = Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((favorite) => (
            candidateById.has(favorite.playerId)
            && ["must", "like", "late"].includes(favorite.priority)
            && typeof favorite.note === "string"
          ))
        : null;
      setDraftSession(parsed.session);
      setDraftState(state);
      setRoomFreeze(parsed.roomFreeze ?? null);
      setAcceptedRefresh(parsed.acceptedRefresh ?? null);
      setDecisionJournal(Array.isArray(parsed.decisionJournal) ? parsed.decisionJournal : []);
      if (restoredFavorites) setFavorites(restoredFavorites);
      if (Array.isArray(parsed.personalBoardOrder)) {
        setPersonalBoardOrder(normalizePersonalBoardOrder(parsed.personalBoardOrder, modelPlayerOrder));
      }
      setBackupText("");
      setSyncMessages([`Restored audited session at Pick ${state.currentPick}${restoredFavorites ? ` with ${restoredFavorites.length} VJ targets` : ""}.`]);
    } catch (error) {
      setSyncMessages([error instanceof Error ? error.message : "The backup could not be restored."]);
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

  const setupCompleteCount = [teamNames.length >= draftState.league.teams, Boolean(setup.keepers.trim()), Boolean(setup.myTeamName.trim() || setup.myDraftSlot.trim())].filter(Boolean).length;
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
              ["draft", "War Room", Clock3],
              ["rehearsal", "Rehearse", Zap],
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

        {workspace === "predraft" ? <section className="mt-3 rounded-[24px] border border-violet-300/20 bg-violet-300/[0.06] p-4">
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
        </section> : null}

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
                    <div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">{isDraftPreview ? "Draft engine preview" : `${teamLabel(pickInfo.teamId)} on the clock`}</p><h2 className="mt-1 text-2xl font-black">{isDraftPreview ? "Working first-pick scenario" : `Round ${pickInfo.round}, pick ${pickInfo.pickInRound}`}</h2><p className="mt-1 text-sm text-slate-400">{isDraftPreview ? "Confirm keepers and freeze the room before recording live picks." : draftState.picksUntilNextTurn === 0 ? "You are up now" : `${draftState.picksUntilNextTurn} picks until your turn`}</p></div>
                  </div>
                  <Button variant="outline" size="sm" disabled={livePickCount === 0} onClick={undoDraftPick}><Undo2 className="mr-2 h-4 w-4" /> Undo</Button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className={cn("rounded-xl border px-3 py-2 text-xs font-bold", sessionHealth.ok ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100" : "border-rose-300/30 bg-rose-300/10 text-rose-100")}>{sessionHealth.message}</div>
                  <div className={cn("rounded-xl border px-3 py-2 text-xs font-bold", roomFreeze ? "border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100" : "border-amber-300/25 bg-amber-300/[0.08] text-amber-100")}>{roomFreeze ? `Room frozen ${new Date(roomFreeze.frozenAt).toLocaleString()} · ${roomFreeze.keeperCount} keepers` : "Live entry locked until setup is reviewed and frozen."}</div>
                </div>
              </section>

              <section className="rounded-[28px] border border-emerald-300/25 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Quick pick entry</p>
                    <h3 className="mt-1 text-xl font-black">Type the player. The team is automatic.</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Snake position and the official draft order determine the pick owner; you never need to select a team manually.</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">Pick {draftState.currentPick} records for</p>
                    <p className="mt-1 font-black text-white">{teamLabel(pickInfo.teamId)}</p>
                  </div>
                </div>
                <label className="relative mt-4 block">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <Input
                    value={quickPickQuery}
                    onChange={(event) => setQuickPickQuery(event.target.value)}
                    placeholder="Type the drafted player's name…"
                    className="pl-10"
                    autoComplete="off"
                  />
                </label>
                {quickPickQuery.trim() ? (
                  <div className="mt-2 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                    {quickPickResults.map((candidate) => (
                      <div key={candidate.player.id} className="flex items-center gap-3 p-3">
                        <span className="w-10 shrink-0 text-center text-sm font-black text-slate-500">#{personalRankById.get(candidate.player.id) ?? "—"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-black">{candidate.player.fullName}</span>
                          <span className="text-xs text-slate-500">{primaryPosition(candidate)} · {candidate.player.team} · Model #{boardById.get(candidate.player.id)?.boardRank ?? "—"}</span>
                        </span>
                        <Button size="sm" disabled={!roomFreeze} onClick={() => recordPick(candidate)}>
                          {roomFreeze ? `Record for ${teamLabel(pickInfo.teamId)}` : "Freeze room first"}
                        </Button>
                      </div>
                    ))}
                    {quickPickResults.length === 0 ? <p className="p-4 text-sm text-slate-500">No available player matches that name.</p> : null}
                  </div>
                ) : null}
              </section>

              <section className="rounded-[28px] border border-cyan-300/25 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">On the clock</p><h3 className="mt-1 text-xl font-black">{isMyTurn ? "Best pick, with the next few exits" : "Best options for your next pick"}</h3></div>
                  <p className="text-xs text-slate-500">One compact recommendation view · updates after every pick</p>
                </div>

                {isMyTurn ? <div className={cn("mt-3 rounded-2xl border px-3 py-2", turnContext.mode === "long-gap" ? "border-rose-300/25 bg-rose-300/[0.07]" : turnContext.mode === "pair-building" ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-white/10 bg-black/20")}><p className={cn("text-[10px] font-black uppercase tracking-[0.16em]", turnContext.mode === "long-gap" ? "text-rose-200" : turnContext.mode === "pair-building" ? "text-emerald-200" : "text-slate-300")}>{turnContext.label}</p><p className="mt-1 text-xs leading-5 text-slate-300">{turnContext.summary}</p></div> : null}

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {liveRecommendations.map((recommendation, index) => {
                    const candidate = candidateById.get(recommendation.playerId);
                    const signal = candidate ? boardSignalById.get(candidate.player.id) : null;
                    const liveCall = candidate ? liveCallById.get(candidate.player.id) : null;
                    if (!candidate || !signal || !liveCall) return null;
                    const comparison = recommendation.explanation.positionalComparisonPlayerId ? candidateById.get(recommendation.explanation.positionalComparisonPlayerId) : null;
                    const presentation = explainWarRoomRecommendation({ candidate, recommendation, signal, runSnapshot: runSnapshotByPosition.get(primaryPosition(candidate)), positionalComparison: comparison });
                    const call = warRoomDraftCall(liveCall.action, signal);
                    const whyBullets = `${presentation.driver}: ${presentation.whyNow}`.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2);
                    return <div key={candidate.player.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-2 pr-5"><span className="text-[10px] font-black uppercase text-slate-500">#{index + 1}</span><span className={cn("rounded-lg border px-2 py-1 text-[9px] font-black", warRoomCallClasses[call])}>{call}</span></div><div className="mt-2 flex items-baseline gap-2"><p className="truncate font-black">{candidate.player.fullName}</p><span className="shrink-0 text-[11px] text-slate-500">{primaryPosition(candidate)}</span></div><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">Why</p><ul className="mt-1 space-y-1 text-xs leading-4 text-slate-300">{whyBullets.map((bullet) => <li key={bullet} className="flex gap-1.5"><span className="text-amber-200">•</span><span>{bullet}</span></li>)}</ul><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">Available next pick</p><p className="mt-1 text-xs font-bold text-white">{presentation.chanceBack}</p>{isMyTurn ? <Button className="mt-2" size="sm" variant="outline" disabled={!roomFreeze} onClick={() => recordPick(candidate)}>Drafted by Vaughn</Button> : null}{favoriteById.has(candidate.player.id) ? <VjEarmark compact /> : null}</div>;
                  })}
                </div>
              </section>

              <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-4 sm:p-5">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Full-room roster construction</p><h3 className="mt-1 text-xl font-black">Immediate opponents first, with players and real gaps</h3><p className="mt-2 text-xs text-slate-400">Teams highlighted in amber pick before Vaughn&apos;s next selection.</p></div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {orderedOpponentTeams.map((team) => {
                    const before = teamsBeforeNextTurn.has(team.teamId);
                    const rosterIds = [...team.starters, ...team.bench];
                    const starterNeeds = (["QB", "RB", "WR", "TE"] as PlayerPosition[]).filter((pos) => team.openSlots.includes(pos));
                    const flexNeeds = team.openSlots.filter((slot) => slot === "W/R/T").length;
                    return <article key={team.teamId} className={cn("rounded-2xl border p-3", before ? "border-amber-300/30 bg-amber-300/[0.07]" : "border-white/10 bg-black/20")}><div className="flex items-start justify-between gap-2"><div><p className="font-black">{teamLabel(team.teamId)}</p><p className="text-[10px] text-slate-500">{rosterIds.length} drafted</p></div>{before ? <span className="rounded-lg border border-amber-300/25 px-2 py-1 text-[9px] font-black text-amber-100">PICKS BEFORE YOU</span> : null}</div><div className="mt-3 flex flex-wrap gap-1.5">{rosterIds.length > 0 ? rosterIds.map((playerId) => { const player = candidateById.get(playerId); return <span key={playerId} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold">{player?.player.fullName ?? playerId} · {player ? primaryPosition(player) : "?"}</span>; }) : <span className="text-xs text-slate-500">No players recorded.</span>}</div><p className="mt-3 text-xs text-slate-300"><span className="font-black text-violet-100">Needs:</span> {starterNeeds.length > 0 ? starterNeeds.join(", ") + " starters" : "required starters filled"}{flexNeeds > 0 ? ` · ${flexNeeds} FLEX` : ""}</p></article>;
                  })}
                </div>
              </section>

              <section className="rounded-[28px] border border-amber-300/25 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Your draft order</p>
                    <h3 className="mt-1 text-xl font-black">Reorder the board around your preferences.</h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">Drag rows on desktop or use the arrow controls on mobile. Export this ordered file from Vercel when you are done so it can be applied to your localhost draft board.</p>
                  </div>
                  <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={downloadRankingsExport}>Export rankings</Button><Button variant="outline" size="sm" onClick={resetPersonalBoard}>Reset to model order</Button></div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="relative">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                    <Input value={personalBoardQuery} onChange={(event) => { setPersonalBoardQuery(event.target.value); setPersonalBoardShowCount(40); }} placeholder="Find a player to move…" className="pl-10" />
                  </label>
                  <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 p-1">
                    {POSITIONS.map((item) => <button key={item} onClick={() => { setPersonalBoardPosition(item); setPersonalBoardShowCount(40); }} className={cn("min-w-10 rounded-xl px-2 py-2 text-xs font-black", personalBoardPosition === item ? "bg-white text-slate-950" : "text-slate-400")}>{item}</button>)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-5 text-slate-500">
                  <p><span className="font-black text-slate-300">Difference = Yahoo XRank − model rank.</span> Positive means Yahoo lets the player go later; negative means Yahoo ranks him earlier.</p>
                  <p>{yahooRankCoverage} of {candidates.length} players currently have a Yahoo XRank; missing values stay visible as —.</p>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                  <div className="hidden grid-cols-[64px_minmax(180px,1fr)_60px_64px_72px_72px_86px_150px] gap-2 bg-black/30 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 lg:grid">
                    <span>Your rank</span><span>Player</span><span>Model</span><span>Yahoo</span><span>Y−M</span><span>Aggregate</span><span>Disagreement</span><span className="text-right">Move</span>
                  </div>
                  <div className="divide-y divide-white/[0.07]">
                    {personalBoardRows.slice(0, personalBoardShowCount).map((candidate) => {
                      const preferredRank = personalRankById.get(candidate.player.id) ?? 999;
                      const modelRank = boardById.get(candidate.player.id)?.boardRank ?? null;
                      const yahooRank = candidate.market.yahooXRank ?? candidate.market.yahooRank ?? null;
                      const difference = modelRank != null && yahooRank != null ? yahooRank - modelRank : null;
                      const drafted = !availableIds.has(candidate.player.id);
                      return (
                        <div
                          key={candidate.player.id}
                          draggable
                          onDragStart={() => setDraggedPlayerId(candidate.player.id)}
                          onDragEnd={() => setDraggedPlayerId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggedPlayerId) movePersonalBoardPlayerBefore(draggedPlayerId, candidate.player.id);
                            setDraggedPlayerId(null);
                          }}
                          className={cn("grid gap-2 bg-[#091524] p-3 transition lg:grid-cols-[64px_minmax(180px,1fr)_60px_64px_72px_72px_86px_150px] lg:items-center", draggedPlayerId === candidate.player.id && "opacity-45", drafted && "bg-slate-950/70 text-slate-500")}
                        >
                          <span className="text-lg font-black text-amber-100"><span className="mr-2 text-[9px] uppercase text-slate-600 sm:hidden">Your rank</span>#{preferredRank}</span>
                          <span className="min-w-0"><span className="block truncate font-black">{candidate.player.fullName}{drafted ? " · Drafted" : ""}</span><span className="text-xs text-slate-500">{primaryPosition(candidate)} · {candidate.player.team} · Yahoo ADP {candidate.market.yahooAdp ?? "—"}</span></span>
                          <span className="text-sm font-black text-slate-300"><span className="mr-2 text-[9px] uppercase text-slate-600 sm:hidden">Model</span>{modelRank ? `#${modelRank}` : "—"}</span>
                          <span className="text-sm font-black text-slate-300"><span className="mr-2 text-[9px] uppercase text-slate-600 sm:hidden">Yahoo</span>{yahooRank ? `#${yahooRank}` : "—"}</span>
                          <span className={cn("text-xs font-black", difference == null ? "text-slate-600" : difference > 0 ? "text-cyan-200" : difference < 0 ? "text-amber-200" : "text-slate-300")}>
                            <span className="mr-2 text-[9px] uppercase text-slate-600 sm:hidden">Difference</span>{difference == null ? "—" : `${difference > 0 ? "+" : ""}${difference}`}
                          </span>
                          <span className="text-xs font-black text-slate-300"><span className="mr-2 text-[9px] uppercase text-slate-600 lg:hidden">Aggregate</span>{candidate.market.aggregateRank != null ? `#${candidate.market.aggregateRank.toFixed(1)}` : "—"}</span>
                          <span className={cn("text-[10px] font-black", (candidate.market.rankSpread ?? 0) >= 50 ? "text-rose-200" : (candidate.market.rankSpread ?? 0) >= 30 ? "text-amber-200" : "text-slate-400")}><span className="mr-2 text-[9px] uppercase text-slate-600 lg:hidden">Disagreement</span>{candidate.market.rankSpread == null ? "—" : candidate.market.rankSpread >= 50 ? `Wide · ${candidate.market.rankSpread}` : `Spread ${candidate.market.rankSpread}`}</span>
                          <span className="flex justify-end gap-1">
                            <button aria-label={`Move ${candidate.player.fullName} up ten spots`} title="Up 10" onClick={() => movePersonalBoardPlayer(candidate.player.id, -10)} className="rounded-lg border border-white/10 px-2 py-2 text-[10px] font-black text-slate-400 hover:text-white">10</button>
                            <button aria-label={`Move ${candidate.player.fullName} up one spot`} title="Up 1" onClick={() => movePersonalBoardPlayer(candidate.player.id, -1)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button aria-label={`Move ${candidate.player.fullName} down one spot`} title="Down 1" onClick={() => movePersonalBoardPlayer(candidate.player.id, 1)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white"><ArrowDown className="h-3.5 w-3.5" /></button>
                            <button aria-label={`Move ${candidate.player.fullName} down ten spots`} title="Down 10" onClick={() => movePersonalBoardPlayer(candidate.player.id, 10)} className="rounded-lg border border-white/10 px-2 py-2 text-[10px] font-black text-slate-400 hover:text-white">10</button>
                          </span>
                        </div>
                      );
                    })}
                    {personalBoardRows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No players match these filters.</p> : null}
                  </div>
                </div>
                {personalBoardRows.length > personalBoardShowCount ? <Button variant="outline" className="mt-3 w-full" onClick={() => setPersonalBoardShowCount((count) => count + 40)}>Show more players</Button> : null}
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">All remaining players</p><h3 className="mt-1 text-xl font-black">Ranked for the current room</h3></div><span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-slate-300">Recording for {teamLabel(pickInfo.teamId)}</span></div>
                <div className="mt-4 flex flex-wrap gap-2">{([['recommended', 'Recommended'], ['model', 'Model'], ['yahoo-xrank', 'Yahoo XRank'], ['yahoo-adp', 'Yahoo ADP'], ['aggregate', 'Aggregate'], ['personal', 'Personal']] as const).map(([id, label]) => <button key={id} onClick={() => { setDraftBoardSort(id); setDraftBoardShowCount(40); }} className={cn("rounded-full border px-3 py-2 text-xs font-black", draftBoardSort === id ? "border-cyan-300 bg-cyan-300/12 text-cyan-100" : "border-white/10 text-slate-400")}>{label}</button>)}<button onClick={() => { setDraftBoardVjOnly((current) => !current); setDraftBoardShowCount(40); }} className={cn("rounded-full border px-3 py-2 text-xs font-black", draftBoardVjOnly ? "border-amber-300 bg-amber-300/12 text-amber-100" : "border-white/10 text-slate-400")}>VJ targets</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><Input value={draftQuery} onChange={(event) => { setDraftQuery(event.target.value); setDraftBoardShowCount(40); }} placeholder="Search remaining players…" className="pl-10" /></label><div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 p-1">{POSITIONS.map((item) => <button key={item} onClick={() => { setDraftBoardPosition(item); setDraftBoardShowCount(40); }} className={cn("min-w-10 rounded-xl px-2 py-2 text-xs font-black", draftBoardPosition === item ? "bg-white text-slate-950" : "text-slate-400")}>{item}</button>)}</div></div>
                {draftBoardSort !== "recommended" ? <p className="mt-3 text-xs text-slate-500">Comparison order is active. The live recommendation number remains visible and no comparison field overwrites model value.</p> : null}
                <div className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-white/10">
                  {remainingDraftBoard.slice(0, draftBoardShowCount).map(({ candidate, recommendation }) => {
                    const signal = boardSignalById.get(candidate.player.id);
                    const liveCall = liveCallById.get(candidate.player.id);
                    if (!signal || !liveCall) return null;
                    const yahooXRank = candidate.market.yahooXRank ?? candidate.market.yahooRank;
                    const marketFall = yahooXRank == null ? 0 : draftState.currentPick - yahooXRank;
                    const exceptional = marketFall >= 8 && recommendation.explanation.boardEdge >= 6;
                    const uncertainty = (candidate.market.rankSpread ?? 0) >= 50;
                    const label = exceptional ? "Exceptional value" : uncertainty ? "Wide market range" : recommendation.explanation.makeItBackProbability <= 0.35 ? "Take-now pressure" : "Track availability";
                    const labelClass = exceptional ? "border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100" : uncertainty ? "border-rose-300/30 bg-rose-300/[0.07] text-rose-100" : "border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100";
                    const low = Math.round((recommendation.explanation.makeItBackProbabilityLow ?? recommendation.explanation.makeItBackProbability) * 100);
                    const high = Math.round((recommendation.explanation.makeItBackProbabilityHigh ?? recommendation.explanation.makeItBackProbability) * 100);
                    return <div key={candidate.player.id} className={cn("relative grid gap-3 bg-[#091524] p-3 pr-10 sm:grid-cols-[52px_minmax(190px,1fr)_130px_minmax(200px,1.2fr)_auto] sm:items-center", exceptional && "bg-emerald-300/[0.04]")}><span className="text-slate-400"><span className="block text-[9px] font-black uppercase text-slate-600">Now</span><span className="text-lg font-black">#{recommendationRankById.get(candidate.player.id)}</span></span><span className="min-w-0"><span className="block truncate font-black">{candidate.player.fullName}</span><span className="text-xs text-slate-500">{primaryPosition(candidate)} · Model #{recommendation.explanation.ourBoardRank} · Yahoo #{yahooXRank ?? "—"} · Aggregate {candidate.market.aggregateRank?.toFixed(1) ?? "—"}</span></span><span className={cn("w-fit rounded-lg border px-2 py-1 text-[10px] font-black", labelClass)}>{label}</span><span className="text-xs leading-5 text-slate-400">Model-versus-Yahoo gap {yahooXRank == null ? "—" : `${yahooXRank - recommendation.explanation.ourBoardRank > 0 ? "+" : ""}${yahooXRank - recommendation.explanation.ourBoardRank}`}. Make-it-back {low === high ? `${low}%` : `${low}–${high}%`}; tier survival {Math.round(recommendation.explanation.tierSurvivalProbability * 100)}%.{uncertainty ? ` Rank Spread ${candidate.market.rankSpread} widens the range.` : ""}</span><Button size="sm" variant="outline" disabled={!roomFreeze} onClick={() => recordPick(candidate)}>{roomFreeze ? `Record for ${isMyTurn ? "Vaughn" : teamLabel(pickInfo.teamId)}` : "Room locked"}</Button>{favoriteById.has(candidate.player.id) ? <VjEarmark compact /> : null}</div>;
                  })}
                  {remainingDraftBoard.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No remaining players match these filters.</p> : null}
                </div>
                {remainingDraftBoard.length > draftBoardShowCount ? <Button variant="outline" className="mt-3 w-full" onClick={() => setDraftBoardShowCount((count) => count + 40)}>Show more players</Button> : null}
              </section>
              <details className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-black text-slate-300">Sync or recover missed picks</summary>
                <p className="mt-2 text-xs leading-5 text-slate-500">Paste a full Yahoo-style event array containing overallPick and playerName. The snapshot is validated as a whole, keepers are preserved, gaps resume at the first missing pick, and conflicts change nothing.</p>
                <Textarea className="mt-3 min-h-32" value={syncText} onChange={(event) => setSyncText(event.target.value)} placeholder={'[{"overallPick":1,"playerName":"Player Name"}]'} />
                <div className="mt-3 flex items-center gap-3"><Button variant="outline" onClick={recoverFromSnapshot} disabled={!syncText.trim()}>Validate & recover</Button><span className="text-xs text-slate-500">Atomic—no partial application</span></div>
                {syncMessages.length > 0 ? <div className="mt-3 space-y-1 text-xs text-slate-400">{syncMessages.map((message) => <p key={message}>• {message}</p>)}</div> : null}
                <div className="mt-5 border-t border-white/10 pt-5">
                  <p className="text-sm font-black">Portable audited backup</p>
                  <p className="mt-1 text-xs text-slate-500">Download before the draft and after major corrections. Restore validates league, keeper, board, and event-log identity before changing anything.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={downloadDraftBackup}>Download backup</Button><Button variant="outline" onClick={restoreDraftBackup} disabled={!backupText.trim()}>Validate & restore</Button></div>
                  <Textarea className="mt-3 min-h-24" value={backupText} onChange={(event) => setBackupText(event.target.value)} placeholder="Paste a Moodin draft backup JSON here to restore it." />
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="flex items-center gap-2"><FileImage className="h-4 w-4 text-cyan-300" /><p className="text-sm font-black">Screenshot-assisted recovery</p></div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Attach the Yahoo screenshot for side-by-side review, then paste its Live Text/OCR rows below. Moodin stages matches but never silently applies them.</p>
                  <input type="file" accept="image/*" className="mt-3 block w-full text-xs text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-300/10 file:px-3 file:py-2 file:font-black file:text-cyan-100" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setScreenshotPreview(typeof reader.result === "string" ? reader.result : null); reader.readAsDataURL(file); }} />
                  {screenshotPreview ? <Image src={screenshotPreview} alt="Draft screenshot under review" width={1200} height={800} unoptimized className="mt-3 max-h-64 w-full rounded-xl border border-white/10 object-contain" /> : null}
                  <Textarea className="mt-3 min-h-28" value={screenshotText} onChange={(event) => setScreenshotText(event.target.value)} placeholder={"Pick 41 Player Name\n42 Another Player"} />
                  <Button className="mt-3" variant="outline" onClick={stageScreenshotRecovery} disabled={!screenshotText.trim()}>Stage screenshot rows</Button>
                  {screenshotRecovery ? <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs"><p className="font-black text-cyan-100">Review {screenshotRecovery.proposals.length} proposed picks</p>{screenshotRecovery.proposals.map((proposal) => <p key={`${proposal.overallPick}-${proposal.playerId}`} className="mt-1 text-slate-300">Pick {proposal.overallPick} · {proposal.playerName} · {proposal.confidence}</p>)}{screenshotRecovery.warnings.map((warning) => <p key={warning} className="mt-1 text-amber-200">• {warning}</p>)}{screenshotRecovery.unresolvedLines.map((line) => <p key={line} className="mt-1 text-rose-200">Unresolved: {line}</p>)}<Button className="mt-3" onClick={applyScreenshotRecovery} disabled={screenshotRecovery.proposals.length === 0 || screenshotRecovery.unresolvedLines.length > 0}>Confirm & apply reviewed rows</Button></div> : null}
                </div>
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
              <section className="rounded-[28px] border border-cyan-300/20 bg-[#0a1727]/92 p-4">
                <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Quick player board</p><p className="mt-1 text-sm text-slate-400">Top available by current model</p></div><span className="text-[10px] font-black uppercase text-slate-500">{remainingDraftBoard.length} available</span></div>
                <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">{remainingDraftBoard.slice(0, 20).map(({ candidate, recommendation }) => <button key={candidate.player.id} onClick={() => setSelectedPlayerId(candidate.player.id)} className="flex w-full items-center gap-2 rounded-xl bg-black/20 px-2.5 py-2 text-left hover:bg-white/[0.06]"><span className="w-6 text-center text-xs font-black text-slate-500">#{recommendationRankById.get(candidate.player.id)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{candidate.player.fullName}</span><span className="text-[10px] text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.yahooAdp ?? candidate.market.adp ?? "—"}</span></span><span className="shrink-0 text-[10px] font-black text-cyan-100">{Math.round(recommendation.explanation.makeItBackProbability * 100)}% back</span></button>)}{remainingDraftBoard.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-500">No available players match the current filters.</p> : null}</div>
              </section>
              <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-4">
                <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Live position pressure</p><p className="mt-1 text-sm text-slate-400">{wrap.simulations} roster-aware wrap simulations</p></div><Zap className="h-5 w-5 text-violet-300" /></div>
                <div className="mt-3 space-y-2">
                  {runSnapshots.slice(0, 5).map((snapshot) => <div key={snapshot.position} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex items-center justify-between"><span className="font-black">{snapshot.position}</span><span className={cn("text-[10px] font-black uppercase", snapshot.runRisk === "high" ? "text-rose-200" : snapshot.runRisk === "medium" ? "text-amber-200" : "text-emerald-200")}>{snapshot.runRisk === "high" ? "Likely to move" : snapshot.runRisk === "medium" ? "Could move" : "Likely to hold"}</span></div><p className="mt-1 text-xs text-slate-400">{snapshot.teamsWithStarterNeed} teams have a starter gap{snapshot.teamsWithFlexNeed ? ` · ${snapshot.teamsWithFlexNeed} flex gaps` : ""}</p><p className="mt-1 text-xs text-slate-500">{snapshot.expectedSelectionsBeforeNextTurn.toFixed(1)} {snapshot.position} selections expected · {Math.round(snapshot.tierSurvivalProbability * 100)}% chance a comparable option remains</p></div>)}
                </div>
              </section>
              <section className="rounded-[28px] border border-amber-300/20 bg-[#0a1727]/92 p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Favorites still available</p><p className="mt-1 text-sm text-slate-400">Your conviction, in draft order</p></div><Star className="h-5 w-5 fill-amber-300 text-amber-300" /></div><div className="mt-3 space-y-2">{favoriteCards.filter(({ candidate }) => availableIds.has(candidate.player.id)).slice(0, 10).map(({ favorite, candidate, board: entry }) => <button key={candidate.player.id} onClick={() => recordPick(candidate)} className="flex w-full items-center gap-3 rounded-xl bg-black/20 p-3 text-left"><span className="text-sm font-black text-slate-500">#{entry?.boardRank}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{candidate.player.fullName}</span><span className="text-[11px] text-slate-500">{primaryPosition(candidate)} · ADP {candidate.market.adp}</span></span><span className={cn("rounded-lg border px-2 py-1 text-[10px] font-black", priorityMeta[favorite.priority].color)}>{priorityMeta[favorite.priority].short}</span></button>)}</div></section>
              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-4"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Draft pick results</p><span className="text-[10px] font-black uppercase text-slate-500">{draftState.drafted.length} picks</span></div><div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">{[...draftState.drafted].reverse().map((pick) => { const candidate = candidateById.get(pick.playerId); return <div key={`${pick.overallPick}-${pick.playerId}`} className="flex gap-3 rounded-xl bg-black/20 p-2.5 text-sm"><span className="w-8 font-black text-slate-500">{pick.overallPick}</span><span className="min-w-0"><span className="block truncate font-bold">{candidate?.player.fullName ?? pick.playerId}</span><span className="text-xs text-slate-500">{teamLabel(pick.teamId)} · {pick.eventType === "keeper" ? "Keeper" : pick.source}</span></span></div>; })}{draftState.drafted.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No live picks recorded yet. Your progress will save automatically on this device.</p> : null}</div></section>
              {decisionJournal.length > 0 ? <section className="rounded-[28px] border border-emerald-300/20 bg-[#0a1727]/92 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Decision journal</p><p className="mt-1 text-sm text-slate-400">What the board knew at your picks</p><div className="mt-3 space-y-2">{decisionJournal.slice(0, 4).map((entry) => <div key={entry.id} className="rounded-xl bg-black/20 p-3 text-xs"><p className="font-black">Pick {entry.overallPick} · {candidateById.get(entry.selectedPlayerId)?.player.fullName ?? entry.selectedPlayerId}</p><p className="mt-1 text-slate-500">Top recommendation: {entry.recommendations[0] ? candidateById.get(entry.recommendations[0].playerId)?.player.fullName : "—"}</p></div>)}</div></section> : null}
              {myRosterPlayers.length >= draftState.league.rosterSlots.filter((slot) => slot !== "IR").length ? <section className="rounded-[28px] border border-amber-300/20 bg-[#0a1727]/92 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Roster action queue</p><p className="mt-1 text-sm text-slate-400">Triggers and actions—not a roster grade</p><div className="mt-3 space-y-2">{postDraftActions.map((action) => <div key={action.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><p className="text-sm font-black">{action.title}</p><p className="mt-1 text-xs text-amber-100">Trigger: {action.trigger}</p><p className="mt-1 text-xs text-slate-300">{action.action}</p><p className="mt-1 text-[11px] text-slate-500">{action.rationale}</p></div>)}</div></section> : null}
            </aside>
          </div>
        ) : null}

        {workspace === "rehearsal" ? (
          <DraftRehearsalMode candidates={candidates} initialDraftState={initialDraftState} favoriteIds={favorites.map((favorite) => favorite.playerId)} />
        ) : null}

        {workspace === "setup" ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">League intake</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Bring the room into focus.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Paste the official ordered team list once, identify Vaughn by team name or slot, and enter league-wide keepers. The order becomes both the team-name list and the team-ID map.</p></div><div className="shrink-0 rounded-2xl bg-black/25 px-4 py-3 text-center"><p className="text-2xl font-black text-cyan-300">{setupCompleteCount}/3</p><p className="text-[10px] uppercase text-slate-500">ready</p></div></div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-black">Vaughn&apos;s team name</span><span className="mt-1 block text-xs text-slate-500">Optional when the canonical draft slot is already correct.</span><Input className="mt-2" value={setup.myTeamName} onChange={(event) => setSetup((current) => ({ ...current, myTeamName: event.target.value }))} placeholder="My team" /></label>
                <label className="block"><span className="text-sm font-black">Vaughn&apos;s draft slot</span><span className="mt-1 block text-xs text-slate-500">Canonical slot {leagueSourceOfTruth.draft.mySlot}; team name and slot must agree when both are entered.</span><Input className="mt-2" inputMode="numeric" value={setup.myDraftSlot} onChange={(event) => setSetup((current) => ({ ...current, myDraftSlot: event.target.value }))} placeholder={String(leagueSourceOfTruth.draft.mySlot)} /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-black">Official draft order</span><span className="mt-1 block text-xs text-slate-500">Paste the ordered list exactly as provided by the league.</span><Textarea className="mt-2 min-h-36" value={setup.draftOrder} onChange={(event) => setSetup((current) => ({ ...current, draftOrder: event.target.value }))} placeholder={"1. Team name\n2. Team name\n3. Team name\n…"} /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-black">All keepers</span><span className="mt-1 block text-xs text-slate-500">One line per keeper; include team and round cost when known.</span><Textarea className="mt-2 min-h-44" value={setup.keepers} onChange={(event) => setSetup((current) => ({ ...current, keepers: event.target.value }))} placeholder={"Team name — Player — Round 4\nTeam name — Player — Round 7"} /></label>
              </div>
              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-3 text-sm text-emerald-100"><Check className="mt-0.5 h-5 w-5 shrink-0" /><span><span className="font-black">Everything saves automatically on this device.</span><span className="mt-1 block text-xs leading-5 text-emerald-100/70">The final list will receive a reviewable team/player matching receipt before it changes draft state; ambiguous keeper names will not be guessed silently.</span></span></div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-sm font-black">Canonical setup receipt</p><p className="mt-1 text-xs text-slate-500">Review every match before replacing the saved draft room.</p></div>
                  <div className="flex gap-2"><Button disabled={!setupResolution.ready} onClick={applyResolvedSetup}>Apply reviewed setup</Button><Button variant="outline" disabled={!setupResolution.ready || dataQuality.status !== "ready"} onClick={freezeReviewedRoom}><ShieldCheck className="mr-2 h-4 w-4" /> Freeze room</Button></div>
                </div>
                {setupResolution.errors.length > 0 ? <div className="mt-3 space-y-1 text-xs text-rose-200">{setupResolution.errors.map((error) => <p key={error}>• {error}</p>)}</div> : null}
                {setupResolution.receipts.length > 0 ? <div className="mt-3 space-y-1 text-xs text-emerald-100">{setupResolution.receipts.map((receipt) => <p key={receipt}>✓ {receipt}</p>)}</div> : null}
                {setupResolution.ready ? <p className="mt-3 text-xs text-cyan-200">Ready: {setupResolution.teamNames.length} teams · you are {setupResolution.myTeamId} · {setupResolution.keeperCount} keepers resolved. Applying starts live tracking at the first unoccupied pick.</p> : null}
                {roomFreeze ? <p className="mt-2 text-xs font-bold text-emerald-200">Frozen {new Date(roomFreeze.frozenAt).toLocaleString()} · artifact {roomFreeze.artifactCapturedAt} · {roomFreeze.keeperFingerprint}</p> : null}
              </div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Draft-day checklist</p><div className="mt-4 space-y-3">{[[teamNames.length >= draftState.league.teams, "Official ordered team list"], [Boolean(setup.keepers.trim()), "League-wide keepers"], [Boolean(setup.myTeamName.trim() || setup.myDraftSlot.trim()), "Vaughn identified"]].map(([done, label]) => <div key={String(label)} className="flex items-center gap-3 text-sm"><span className={cn("flex h-6 w-6 items-center justify-center rounded-full border", done ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-white/10 text-slate-600")}>{done ? <Check className="h-3.5 w-3.5" /> : null}</span><span className={done ? "text-slate-200" : "text-slate-500"}>{label}</span></div>)}</div></section>
              <section className="rounded-[28px] border border-cyan-300/20 bg-cyan-300/[0.07] p-5"><Users className="h-5 w-5 text-cyan-300" /><h3 className="mt-3 font-black">What this unlocks</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300"><li>Exact pick-owner windows</li><li>Keeper-adjusted availability</li><li>Real names on the clock</li><li>Your exact roster and turn timing</li></ul></section>
              <section className="rounded-[28px] border border-violet-300/20 bg-[#0a1727]/92 p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-200">Refresh control</p><h3 className="mt-2 font-black">Review before freeze</h3><p className="mt-2 text-xs leading-5 text-slate-400">Current board {currentRefresh.boardFingerprint} · captured {currentRefresh.capturedAt}</p>{acceptedRefresh ? <><p className={cn("mt-2 text-xs font-bold", refreshDiff.changed ? "text-amber-200" : "text-emerald-200")}>{refreshDiff.changed ? `${refreshDiff.added.length} added · ${refreshDiff.removed.length} removed · ${refreshDiff.movers.length} meaningful movers` : "Matches the last accepted board."}</p>{refreshDiff.movers.slice(0, 5).map((mover) => <p key={mover.playerId} className="mt-1 text-xs text-slate-400">{mover.fullName}: #{mover.previousRank} → #{mover.boardRank}</p>)}</> : <p className="mt-2 text-xs text-amber-200">No previously accepted refresh exists on this device. The first freeze establishes the rollback reference.</p>}</section>
              <details className="rounded-[28px] border border-white/10 bg-[#0a1727]/92 p-5"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black"><span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Current data status</span><ChevronDown className="h-4 w-4" /></summary><p className="mt-3 text-xs leading-5 text-slate-400">{sourceMessage}</p><p className="mt-2 text-xs leading-5 text-slate-500">{boardSummary}</p></details>
            </aside>
          </div>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#071321]/95 p-2 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-1">{([["draft", "War Room", Clock3], ["rehearsal", "Practice", Zap], ["setup", "Setup", Settings2]] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setWorkspace(id)} className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black", workspace === id ? "bg-cyan-400 text-slate-950" : "text-slate-500")}><Icon className="h-4 w-4" />{label}</button>)}</div>
      </div>
    </main>
  );
}
