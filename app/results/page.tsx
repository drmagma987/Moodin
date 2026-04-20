"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RoomSyncNotice } from "@/components/room-sync-notice";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { getSeriesPressureMessage } from "@/lib/series";
import {
  acceptRematch,
  beginBetweenGamePhase,
  getRoomStatusHref,
  subscribeToRoom,
  RoomData,
} from "@/lib/room";
import { PlayerGameStats, type QuarterHighlight, SimResult } from "@/lib/sim";

const FIRST_REVEAL_DELAY_MS = 900;
const NORMAL_REVEAL_STEP_MS = 1650;
const SCORE_REVEAL_STEP_MS = 4300;
const CLOSE_REVEAL_STEP_MS = 2300;
const SCORE_CALLOUT_MS = 2400;
const TURNOVER_CALLOUT_MS = 2200;
const HALFTIME_HOLD_MS = 3600;
const FINAL_SCOREBOARD_HOLD_MS = 3600;

type RevealStep =
  | { kind: "play"; quarter: number; highlight: QuarterHighlight; revealAt: number }
  | { kind: "halftime"; quarter: 2; revealAt: number; scoreA: number; scoreB: number }
  | { kind: "final"; quarter: 4; revealAt: number; scoreA: number; scoreB: number };

function statSummary(statLine: PlayerGameStats) {
  const chunks: string[] = [];

  if (statLine.passingYards > 0) chunks.push(`${statLine.passingYards} pass yds`);
  if (statLine.passingTD > 0) chunks.push(`${statLine.passingTD} pass TD`);
  if (statLine.interceptions > 0) chunks.push(`${statLine.interceptions} INT`);
  if (statLine.fumblesLost > 0) chunks.push(`${statLine.fumblesLost} fumble lost`);
  if (statLine.tackles > 0) chunks.push(`${statLine.tackles} tackles`);
  if (statLine.sacks > 0) chunks.push(`${statLine.sacks} sacks`);
  if (statLine.forcedFumbles > 0) chunks.push(`${statLine.forcedFumbles} FF`);
  if (statLine.fumbleRecoveries > 0) chunks.push(`${statLine.fumbleRecoveries} FR`);
  if (statLine.carries > 0) chunks.push(`${statLine.carries} car`);
  if (statLine.rushYards > 0) chunks.push(`${statLine.rushYards} rush yds`);
  if (statLine.rushTD > 0) chunks.push(`${statLine.rushTD} rush TD`);
  if (statLine.receptions > 0) chunks.push(`${statLine.receptions} rec`);
  if (statLine.receivingYards > 0) chunks.push(`${statLine.receivingYards} rec yds`);
  if (statLine.receivingTD > 0) chunks.push(`${statLine.receivingTD} rec TD`);

  return chunks.length > 0 ? chunks.join(" • ") : "Quiet game.";
}

function TeamBoxScore({
  title,
  stats,
}: {
  title: string;
  stats: PlayerGameStats[];
}) {
  return (
    <div className="rounded-2xl border p-4 sm:p-5">
      <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3">
        {stats.map((statLine) => (
          <div key={statLine.playerId} className="rounded-xl border p-3">
            <div className="font-medium">
              {statLine.position} — {statLine.name}
            </div>
            <p className="mt-1 text-sm opacity-80">{statSummary(statLine)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function eventTypeLabel(eventType: QuarterHighlight["eventType"]) {
  switch (eventType) {
    case "explosive":
      return "Big play";
    case "touchdown":
      return "Touchdown";
    case "fieldGoal":
      return "Field goal";
    case "turnover":
      return "Turnover";
    case "stop":
      return "Play";
  }
}

function eventTypeClass(eventType: QuarterHighlight["eventType"]) {
  switch (eventType) {
    case "touchdown":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "fieldGoal":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "turnover":
      return "border-red-200 bg-red-50 text-red-800";
    case "explosive":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "stop":
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function scoreCalloutLabel(highlight: QuarterHighlight, teamAName: string, teamBName: string) {
  const teamName = highlight.possession === "A" ? teamAName : teamBName;
  const scoreType = highlight.eventType === "fieldGoal" ? "FG" : "TD";

  return `${scoreType} ${teamName}!`;
}

function eventCalloutLabel(highlight: QuarterHighlight, teamAName: string, teamBName: string) {
  if (highlight.isScore) return scoreCalloutLabel(highlight, teamAName, teamBName);

  if (highlight.eventType === "turnover") {
    const defenseName = highlight.possession === "A" ? teamBName : teamAName;
    if (highlight.eventDetail === "interception") return `PICK ${defenseName}!`;
    if (highlight.eventDetail === "stripSack") return `STRIP SACK ${defenseName}!`;
    return `FUMBLE ${defenseName}!`;
  }

  return "";
}

function EventCallout({
  highlight,
  teamAName,
  teamBName,
}: {
  highlight: QuarterHighlight | null;
  teamAName: string;
  teamBName: string;
}) {
  if (!highlight || (!highlight.isScore && highlight.eventType !== "turnover")) return null;
  const tone =
    highlight.eventType === "turnover"
      ? "border-red-100 bg-red-950 text-white"
      : "border-white bg-slate-950 text-white";

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-[1px]">
      <div
        key={highlight.id}
        className={`animate-bounce rounded-[2rem] border-4 px-8 py-6 text-center shadow-2xl sm:px-12 sm:py-8 ${tone}`}
      >
        <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">
          {highlight.eventType === "turnover" ? "Turnover" : "Score Update"}
        </p>
        <p className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-6xl">
          {eventCalloutLabel(highlight, teamAName, teamBName)}
        </p>
      </div>
    </div>
  );
}

function impactScore(statLine: PlayerGameStats) {
  return (
    statLine.passingTD * 14 +
    statLine.receivingTD * 10 +
    statLine.rushTD * 10 +
    statLine.interceptions * (statLine.position === "QB" ? -6 : 12) +
    statLine.fumblesLost * -7 +
    statLine.sacks * 9 +
    statLine.forcedFumbles * 9 +
    statLine.fumbleRecoveries * 8 +
    statLine.tackles * 0.8 +
    statLine.passingYards * 0.08 +
    statLine.receivingYards * 0.11 +
    statLine.rushYards * 0.11
  );
}

function getGameMvp(result: SimResult, teamAName: string, teamBName: string) {
  const winnerSide = result.finalA >= result.finalB ? "A" : "B";
  const winnerStats = winnerSide === "A" ? result.teamAStats : result.teamBStats;
  const teamName = winnerSide === "A" ? teamAName : teamBName;
  const player = [...winnerStats].sort((a, b) => impactScore(b) - impactScore(a))[0];

  return player ? { player, teamName } : null;
}

function estimateWinProbabilityA(
  scoreA: number,
  scoreB: number,
  currentQuarter: number,
  progressRatio: number,
  possession: "A" | "B" | null
) {
  const scoreDiff = scoreA - scoreB;
  const leverage = 2.6 + currentQuarter * 1.2 + progressRatio * 4;
  const possessionBump = possession === "A" ? 2 : possession === "B" ? -2 : 0;

  return clamp(Math.round(50 + scoreDiff * leverage + possessionBump), 4, 96);
}

function FieldDriveView({
  highlight,
  teamAName,
  teamBName,
  scoreA,
  scoreB,
  quarter,
  clock,
  winProbabilityA,
  phase,
  winnerName,
}: {
  highlight: QuarterHighlight | null;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  quarter: number;
  clock: string;
  winProbabilityA: number;
  phase: "live" | "halftime" | "final";
  winnerName: string | null;
}) {
  const possessionName =
    phase === "halftime"
      ? "Halftime"
      : phase === "final"
        ? "Final"
        : highlight?.possession === "A"
          ? teamAName
          : highlight?.possession === "B"
            ? teamBName
            : "Awaiting kickoff";
  const start = highlight
    ? highlight.possession === "A"
      ? highlight.startYardLine
      : 100 - highlight.startYardLine
    : 25;
  const end = highlight
    ? highlight.possession === "A"
      ? highlight.endYardLine
      : 100 - highlight.endYardLine
    : 25;
  const arrowLeft = Math.min(start, end);
  const arrowWidth = Math.max(Math.abs(end - start), 3);
  const movingRight = end >= start;

  return (
    <div className="rounded-2xl border bg-emerald-950 p-4 text-white shadow-sm sm:p-5">
      <div className="rounded-2xl border border-white/15 bg-white/10 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
              {phase === "final" ? "Final" : phase === "halftime" ? "Halftime" : `Q${quarter} • ${clock}`}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white/85">
              {possessionName}
              {phase === "live" ? " possession" : ""}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-950/60 px-4 py-3 text-center shadow-inner">
            <div className="min-w-0">
              <p className="max-w-[7rem] truncate text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                {teamAName}
              </p>
              <p className="text-3xl font-black leading-none sm:text-4xl">{scoreA}</p>
            </div>
            <span className="text-2xl font-black text-amber-300">-</span>
            <div className="min-w-0">
              <p className="max-w-[7rem] truncate text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                {teamBName}
              </p>
              <p className="text-3xl font-black leading-none sm:text-4xl">{scoreB}</p>
            </div>
          </div>

          <div className="flex justify-start sm:justify-end">
            {highlight && phase === "live" ? (
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${eventTypeClass(highlight.eventType)}`}>
                {eventTypeLabel(highlight.eventType)}
              </span>
            ) : (
              <span className="w-fit rounded-full border border-amber-200 bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">
                {phase === "final" ? "Game Complete" : "Intermission"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Field View
          </p>
          <h2 className="mt-1 text-lg font-semibold sm:text-xl">
            {phase === "final"
              ? winnerName
                ? `${winnerName} Wins!`
                : "Final Whistle"
              : phase === "halftime"
                ? "Halftime Reset"
                : `${possessionName} possession`}
          </h2>
        </div>
        <div className="text-sm font-semibold">
          {teamAName} {winProbabilityA}% / {teamBName} {100 - winProbabilityA}% WP
        </div>
        {highlight?.closeMoment && (
          <span className="w-fit rounded-full border border-amber-200 bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-950">
            One-score finish
          </span>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-amber-300 transition-all duration-700"
          style={{ width: `${winProbabilityA}%` }}
        />
      </div>

      <div className="relative mt-4 h-28 overflow-hidden rounded-2xl border border-white/20 bg-[linear-gradient(90deg,rgba(6,78,59,0.95),rgba(5,150,105,0.75),rgba(6,78,59,0.95))]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/35" />
        {[10, 20, 30, 40, 60, 70, 80, 90].map((yard) => (
          <div
            key={yard}
            className="absolute inset-y-0 w-px bg-white/20"
            style={{ left: `${yard}%` }}
          />
        ))}
        {[20, 40, 50, 40, 20].map((yard, index) => (
          <span
            key={`${yard}-${index}`}
            className="absolute top-2 -translate-x-1/2 text-[10px] font-bold text-white/45"
            style={{ left: `${[20, 40, 50, 60, 80][index]}%` }}
          >
            {yard}
          </span>
        ))}
        <div className="absolute inset-x-0 bottom-0 top-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_13px,rgba(255,255,255,0.06)_14px)]" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.85)] transition-all duration-500"
          style={{ left: `${arrowLeft}%`, width: `${arrowWidth}%` }}
        />
        {highlight && (
          <span
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg text-amber-200 transition-all duration-500 ${
              movingRight ? "" : "rotate-180"
            }`}
            style={{ left: `${clamp(end, 2, 95)}%` }}
          >
            ▶
          </span>
        )}
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-300 shadow-[0_0_20px_rgba(125,211,252,0.9)] transition-all duration-500"
          style={{ left: `${clamp(end, 3, 97)}%` }}
        />
        <div className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
          {highlight?.possession === "B" ? "Goal" : "Own"}
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
          {highlight?.possession === "B" ? "Own" : "Goal"}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1 text-sm text-emerald-50 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p>
            {phase === "final"
              ? "The clock hits zero and the scoreboard is official."
              : phase === "halftime"
                ? "Both teams head into the locker room. Adjustments are coming."
                : highlight
                  ? highlight.text
                  : "The first possession is loading..."}
          </p>
          {highlight && phase === "live" && (
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
              {highlight.driveSummary}
            </p>
          )}
        </div>
        {highlight && phase === "live" && (
          <p className="shrink-0 font-semibold">
            {highlight.yards >= 0 ? "+" : ""}
            {highlight.yards} yards
          </p>
        )}
      </div>
    </div>
  );
}

function ResultsTimeline({
  result,
  teamAName,
  teamBName,
  onRevealComplete,
}: {
  result: SimResult;
  teamAName: string;
  teamBName: string;
  onRevealComplete: () => void;
}) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const syncNow = () => {
      setNow(Date.now());
    };

    const interval = window.setInterval(syncNow, 250);
    window.addEventListener("focus", syncNow);
    document.addEventListener("visibilitychange", syncNow);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncNow);
      document.removeEventListener("visibilitychange", syncNow);
    };
  }, []);

  const revealSchedule = useMemo<RevealStep[]>(() => {
    const steps: RevealStep[] = [];
    let nextRevealAt = FIRST_REVEAL_DELAY_MS;

    result.quarters.forEach((quarter) => {
      quarter.highlights.forEach((highlight) => {
        const revealAt = nextRevealAt;
        steps.push({ kind: "play", quarter: quarter.quarter, highlight, revealAt });
        nextRevealAt += highlight.isScore
          ? SCORE_REVEAL_STEP_MS
          : highlight.closeMoment
            ? CLOSE_REVEAL_STEP_MS
            : NORMAL_REVEAL_STEP_MS;
      });

      if (quarter.quarter === 2) {
        steps.push({
          kind: "halftime",
          quarter: 2,
          revealAt: nextRevealAt,
          scoreA: quarter.scoreA,
          scoreB: quarter.scoreB,
        });
        nextRevealAt += HALFTIME_HOLD_MS;
      }
    });

    steps.push({
      kind: "final",
      quarter: 4,
      revealAt: nextRevealAt,
      scoreA: result.finalA,
      scoreB: result.finalB,
    });

    return steps;
  }, [result]);

  const elapsed = now - startedAt;
  const revealedSteps = revealSchedule.filter((step) => elapsed >= step.revealAt).length;
  const visibleSteps = revealSchedule.slice(0, revealedSteps);
  const visibleHighlights = visibleSteps.filter(
    (step): step is Extract<RevealStep, { kind: "play" }> => step.kind === "play"
  );
  const visibleScore =
    visibleSteps.length > 0
      ? (() => {
          const current = visibleSteps[visibleSteps.length - 1];
          if (current.kind === "play") return current.highlight;
          return { scoreA: current.scoreA, scoreB: current.scoreB };
        })()
      : { scoreA: 0, scoreB: 0 };
  const currentRevealStep = visibleSteps[visibleSteps.length - 1] ?? null;
  const lastPlayStep = visibleHighlights[visibleHighlights.length - 1] ?? null;
  const currentHighlight =
    currentRevealStep?.kind === "play" ? currentRevealStep.highlight : lastPlayStep?.highlight ?? null;
  const currentQuarter = currentRevealStep?.quarter ?? 1;
  const currentClock =
    currentRevealStep?.kind === "play"
      ? currentRevealStep.highlight.clock
      : currentRevealStep?.kind === "halftime"
        ? "0:00"
        : currentRevealStep?.kind === "final"
          ? "0:00"
          : "15:00";
  const currentPhase =
    currentRevealStep?.kind === "halftime"
      ? "halftime"
      : currentRevealStep?.kind === "final"
        ? "final"
        : "live";
  const progressRatio = revealSchedule.length > 0 ? revealedSteps / revealSchedule.length : 0;
  const winProbabilityA = estimateWinProbabilityA(
    visibleScore.scoreA,
    visibleScore.scoreB,
    currentQuarter,
    progressRatio,
    currentHighlight?.possession ?? null
  );
  const showScoreCallout =
    !!currentRevealStep &&
    currentRevealStep.kind === "play" &&
    currentRevealStep.highlight.isScore &&
    elapsed - currentRevealStep.revealAt <= SCORE_CALLOUT_MS;
  const showTurnoverCallout =
    !!currentRevealStep &&
    currentRevealStep.kind === "play" &&
    currentRevealStep.highlight.eventType === "turnover" &&
    elapsed - currentRevealStep.revealAt <= TURNOVER_CALLOUT_MS;
  const revealedQuarterMap = new Map<number, QuarterHighlight[]>();

  visibleHighlights.forEach(({ quarter, highlight }) => {
    const current = revealedQuarterMap.get(quarter) ?? [];
    current.push(highlight);
    revealedQuarterMap.set(quarter, current);
  });

  const finalScoreHoldActive =
    !!currentRevealStep &&
    currentRevealStep.kind === "play" &&
    (currentRevealStep.highlight.isScore || currentRevealStep.highlight.eventType === "turnover") &&
    elapsed - currentRevealStep.revealAt <=
      (currentRevealStep.highlight.isScore ? SCORE_CALLOUT_MS : TURNOVER_CALLOUT_MS);
  const finalStep = revealSchedule[revealSchedule.length - 1];
  const finalScoreboardHoldActive =
    finalStep?.kind === "final" &&
    elapsed >= finalStep.revealAt &&
    elapsed - finalStep.revealAt <= FINAL_SCOREBOARD_HOLD_MS;
  const allHighlightsRevealed =
    revealedSteps >= revealSchedule.length && !finalScoreHoldActive && !finalScoreboardHoldActive;
  const winnerName =
    result.finalA === result.finalB
      ? null
      : result.finalA > result.finalB
        ? teamAName
        : teamBName;

  useEffect(() => {
    if (allHighlightsRevealed) {
      onRevealComplete();
    }
  }, [allHighlightsRevealed, onRevealComplete]);

  return (
    <>
      {(showScoreCallout || showTurnoverCallout) && (
        <EventCallout
          highlight={currentHighlight}
          teamAName={teamAName}
          teamBName={teamBName}
        />
      )}

      <FieldDriveView
        highlight={currentHighlight}
        teamAName={teamAName}
        teamBName={teamBName}
        scoreA={visibleScore.scoreA}
        scoreB={visibleScore.scoreB}
        quarter={currentQuarter}
        clock={currentClock}
        winProbabilityA={winProbabilityA}
        phase={currentPhase}
        winnerName={winnerName}
      />

      <div className="space-y-3 sm:space-y-4">
        {result.quarters.map((quarter) => {
          const quarterHighlights = revealedQuarterMap.get(quarter.quarter) ?? [];
          if (quarterHighlights.length === 0) return null;

          const quarterScore = quarterHighlights[quarterHighlights.length - 1];

          return (
            <div key={quarter.quarter} className="rounded-2xl border p-4 sm:p-5">
              <h2 className="text-lg font-semibold sm:text-xl">
                Q{quarter.quarter} — {teamAName} {quarterScore.scoreA}, {teamBName} {quarterScore.scoreB}
              </h2>
              <ul className="mt-3 space-y-2 text-sm opacity-90">
                {quarterHighlights.map((highlight) => (
                  <li
                    key={highlight.id}
                    className={highlight.isScore ? "font-medium text-slate-950" : ""}
                  >
                    <span className="mr-2 font-semibold tabular-nums text-slate-500">
                      {highlight.clock}
                    </span>
                    {highlight.text}
                    {highlight.isScore && (
                      <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        Score update
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {allHighlightsRevealed && (
        <div className="rounded-2xl border bg-gray-50 p-4 sm:p-5">
          <h2 className="text-xl font-bold sm:text-2xl">Final</h2>
          <p className="mt-2 text-base sm:text-lg">
            {teamAName} {result.finalA} — {teamBName} {result.finalB}
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
            {result.finalA === result.finalB
              ? "Tie game"
              : `${result.finalA > result.finalB ? teamAName : teamBName} wins`}
          </p>
          {(() => {
            const mvp = getGameMvp(result, teamAName, teamBName);
            return mvp ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <p className="text-xs font-black uppercase tracking-[0.18em]">
                  Game MVP
                </p>
                <p className="mt-1 font-semibold">
                  {mvp.player.position} {mvp.player.name}, {mvp.teamName}
                </p>
                <p className="mt-1 text-sm opacity-80">{statSummary(mvp.player)}</p>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ResultsPageContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");
  const router = useRouter();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [rematchError, setRematchError] = useState("");
  const [rematchLoading, setRematchLoading] = useState(false);
  const [continuingSeries, setContinuingSeries] = useState(false);
  const [timelineComplete, setTimelineComplete] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    const currentRoomId = roomId;
    let unsub: (() => void) | undefined;

    async function syncRoom() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      unsub = subscribeToRoom(currentRoomId, (nextRoom) => {
        setRoom(nextRoom);
      });
    }

    syncRoom();

    return () => {
      if (unsub) unsub();
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !room) return;
    if (room.status !== "results") {
      router.replace(getRoomStatusHref(room));
    }
  }, [roomId, room, router]);

  const result: SimResult | null = room?.simResult ?? null;
  const resultKey = useMemo(() => (result ? JSON.stringify(result) : ""), [result]);
  const teamAName = room?.teamAName ?? "Team A";
  const teamBName = room?.teamBName ?? "Team B";
  const mySide = useMemo<"A" | "B" | null>(() => {
    if (!room || !uid) return null;
    if (room.playerAId === uid) return "A";
    if (room.playerBId === uid) return "B";
    return null;
  }, [room, uid]);
  const teamARematchAccepted = room?.rematchAcceptedA ?? false;
  const teamBRematchAccepted = room?.rematchAcceptedB ?? false;
  const myRematchAccepted =
    mySide === "A" ? teamARematchAccepted : mySide === "B" ? teamBRematchAccepted : false;
  const bothRematchAccepted = teamARematchAccepted && teamBRematchAccepted;
  const seriesWinner = room?.seriesWinner ?? null;
  const seriesGameNumber = room?.seriesGameNumber ?? 1;
  const seriesWinsA = room?.seriesWinsA ?? 0;
  const seriesWinsB = room?.seriesWinsB ?? 0;
  const canContinueSeries = !!room && !!result && !seriesWinner;
  const seriesPressureMessage = getSeriesPressureMessage({
    seriesGameNumber,
    seriesWinsA,
    seriesWinsB,
    teamAName,
    teamBName,
  });

  useEffect(() => {
    setTimelineComplete(false);
  }, [resultKey]);

  async function handleRematch() {
    if (
      !roomId ||
      !room ||
      room.status !== "results" ||
      !result ||
      !mySide ||
      myRematchAccepted ||
      !seriesWinner
    ) {
      return;
    }

    const currentRoomId = roomId;

    try {
      setRematchLoading(true);
      setRematchError("");
      await acceptRematch(currentRoomId);
    } catch (error) {
      console.error(error);
      setRematchError("Could not accept rematch.");
    } finally {
      setRematchLoading(false);
    }
  }

  async function handleContinueSeries() {
    if (!roomId || !room || room.status !== "results" || !result || seriesWinner) {
      return;
    }

    try {
      setContinuingSeries(true);
      setRematchError("");
      await beginBetweenGamePhase(roomId);
    } catch (error) {
      console.error(error);
      setRematchError("Could not continue the series.");
    } finally {
      setContinuingSeries(false);
    }
  }

  if (!roomId) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Game Results</h1>
          <p className="mt-4 opacity-70">This page now requires a multiplayer room.</p>
        </div>
      </main>
    );
  }

  if (!result || !teamAName || !teamBName) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Game Results</h1>
          <p className="mt-4 opacity-70">Waiting for game results...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Game Simulation</h1>
          <p className="mt-1 text-sm opacity-70 sm:text-base">
            {teamAName} vs {teamBName}
          </p>
        </div>

        {room && <RoomSyncNotice roomId={room.roomId} phaseLabel="results" />}

        <div className="rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold sm:text-xl">Run It Back Series</h2>
              <p className="text-sm opacity-70">
                Game {seriesGameNumber} of 3
              </p>
              <p className="mt-1 text-sm font-medium">
                {timelineComplete
                  ? seriesWinner
                    ? `${seriesWinner === "A" ? teamAName : teamBName} closed it out.`
                    : seriesPressureMessage
                  : "Live game simulation in progress. Series stakes reveal after the final whistle."}
              </p>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
              {timelineComplete ? (
                <>
                  <span className="rounded-full border px-3 py-1">
                    {teamAName}: {seriesWinsA} win{seriesWinsA === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border px-3 py-1">
                    {teamBName}: {seriesWinsB} win{seriesWinsB === 1 ? "" : "s"}
                  </span>
                </>
              ) : (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">
                  Series score hidden
                </span>
              )}
            </div>
          </div>
        </div>

        <ResultsTimeline
          key={resultKey}
          result={result}
          teamAName={teamAName}
          teamBName={teamBName}
          onRevealComplete={() => setTimelineComplete(true)}
        />

        {timelineComplete ? (
          <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
            <TeamBoxScore title={`${teamAName} Box Score`} stats={result.teamAStats} />
            <TeamBoxScore title={`${teamBName} Box Score`} stats={result.teamBStats} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-sm opacity-70 sm:p-5">
            Box scores unlock after the full game reveal.
          </div>
        )}

        <div className="rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">
                  {!timelineComplete
                    ? "Final Whistle Pending"
                    : seriesWinner
                      ? "Series Complete"
                      : "Between Games"}
                </h2>
                <p className="mt-1 text-sm opacity-70">
                  {!timelineComplete
                    ? "Next steps unlock after the scoreboard reveal."
                    : seriesWinner
                      ? timelineComplete
                        ? `${seriesWinner === "A" ? teamAName : teamBName} won the best-of-3 series.`
                        : "Series result hidden until the simulation finishes."
                      : "Keep 3 players, fight over 1 free agent, then jump into the next draft."}
                </p>
              </div>

              {seriesWinner && timelineComplete && (
                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
                  <span
                    className={`rounded-full border px-3 py-1 ${
                      teamARematchAccepted
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {teamAName}: {teamARematchAccepted ? "Accepted" : "Waiting"}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 ${
                      teamBRematchAccepted
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {teamBName}: {teamBRematchAccepted ? "Accepted" : "Waiting"}
                  </span>
                </div>
              )}

              <p className="text-sm opacity-70">
                {!timelineComplete
                  ? "Finish the reveal before rematch or between-game actions unlock."
                  : seriesWinner
                  ? bothRematchAccepted
                    ? "Both players accepted. Starting a brand-new series..."
                    : myRematchAccepted
                      ? "Your rematch vote is locked in. Waiting for the other player..."
                      : "Accept if you want to start a fresh best-of-3."
                  : continuingSeries
                    ? "Opening the keeper phase..."
                    : "Proceed to keepers and free agency for the next game."}
              </p>

              {rematchError && <p className="text-sm text-red-600">{rematchError}</p>}
            </div>

            {!timelineComplete ? (
              <button
                type="button"
                disabled
                className="w-full rounded-xl border px-4 py-3 font-medium opacity-50 sm:w-auto sm:rounded-md sm:py-2"
              >
                Reveal In Progress
              </button>
            ) : seriesWinner ? (
              <button
                type="button"
                onClick={handleRematch}
                disabled={!mySide || myRematchAccepted || bothRematchAccepted || rematchLoading}
                className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
              >
                {myRematchAccepted ? "Rematch Accepted" : rematchLoading ? "Accepting..." : "Accept Rematch"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleContinueSeries}
                disabled={!canContinueSeries || continuingSeries}
                className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
              >
                {continuingSeries ? "Opening..." : "Continue to Keepers"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10"><div className="mx-auto w-full max-w-5xl"><h1 className="text-2xl font-bold sm:text-3xl">Game Results</h1><p className="mt-4 opacity-70">Loading game results...</p></div></main>}>
      <ResultsPageContent />
    </Suspense>
  );
}
