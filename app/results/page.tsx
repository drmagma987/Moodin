"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { RoomSyncNotice } from "@/components/room-sync-notice";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { getSeriesPressureMessage } from "@/lib/series";
import {
  acceptRematch,
  beginBetweenGamePhase,
  finalizeSecondHalfGame,
  getRoomStatusHref,
  subscribeToRoom,
  saveHalftimeStrategy,
  RoomData,
} from "@/lib/room";
import { getPlayerIQ, getPlayerPower, getPlayerSpeed, getPlayerTechnical } from "@/lib/game/playerRatings";
import type { DraftedPlayer } from "@/lib/game/types";
import {
  GameSetup,
  PlayerGameStats,
  type QuarterHighlight,
  SimResult,
  simulateGame,
  TeamRatings,
} from "@/lib/sim";

const FIRST_REVEAL_DELAY_MS = 900;
const NORMAL_REVEAL_STEP_MS = 2000;
const SMALL_PLAY_REVEAL_STEP_MS = 1200;
const SCORE_REVEAL_STEP_MS = 2600;
const CLOSE_REVEAL_STEP_MS = 1900;
const SCORE_CALLOUT_MS = 2400;
const TURNOVER_CALLOUT_MS = 2200;
const MISSED_FG_CALLOUT_MS = 2200;
const HALFTIME_HOLD_MS = 2800;
const FINAL_SCOREBOARD_HOLD_MS = 3200;

type RevealStep =
  | { kind: "play"; quarter: number; highlight: QuarterHighlight; revealAt: number }
  | { kind: "halftime"; quarter: 2; revealAt: number; scoreA: number; scoreB: number }
  | { kind: "final"; quarter: number; revealAt: number; scoreA: number; scoreB: number };

const OFFENSE_STRATEGIES = ["Balanced", "Pass Heavy", "Run Heavy"];
const DEFENSE_STRATEGIES = ["Balanced", "Pressure", "Coverage"];

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

function buildRatings(players: DraftedPlayer[]): TeamRatings {
  const byPosition = (position: DraftedPlayer["position"]) =>
    [...players.filter((player) => player.position === position)].sort(
      (a, b) => b.trueGrade - a.trueGrade
    );
  const weightedStarterAvg = (
    group: DraftedPlayer[],
    selector: (player: DraftedPlayer) => number
  ) => {
    if (group.length === 0) return 60;
    const weights = [1, 0.55, 0.22, 0.12];
    const selected = group.slice(0, weights.length);
    const totalWeight = selected.reduce((sum, _, index) => sum + weights[index], 0);
    return selected.reduce((sum, player, index) => sum + selector(player) * weights[index], 0) / totalWeight;
  };

  const qbs = byPosition("QB");
  const rbs = byPosition("RB");
  const wrs = byPosition("WR");
  const tes = byPosition("TE");
  const dls = byPosition("DL");
  const lbs = byPosition("LB");
  const secs = byPosition("SEC");

  const pass =
    weightedStarterAvg(qbs, getPlayerTechnical) * 0.36 +
    weightedStarterAvg(qbs, getPlayerIQ) * 0.2 +
    weightedStarterAvg(wrs, getPlayerSpeed) * 0.18 +
    weightedStarterAvg(wrs, getPlayerTechnical) * 0.16 +
    weightedStarterAvg(tes, getPlayerTechnical) * 0.1;
  const run =
    weightedStarterAvg(rbs, getPlayerPower) * 0.34 +
    weightedStarterAvg(rbs, getPlayerSpeed) * 0.22 +
    weightedStarterAvg(tes, getPlayerPower) * 0.12 +
    weightedStarterAvg(qbs, getPlayerIQ) * 0.12 +
    weightedStarterAvg(wrs, getPlayerPower) * 0.08 +
    weightedStarterAvg(rbs, getPlayerTechnical) * 0.12;
  const bigPlay =
    weightedStarterAvg(wrs, getPlayerSpeed) * 0.32 +
    weightedStarterAvg(rbs, getPlayerSpeed) * 0.22 +
    weightedStarterAvg(qbs, getPlayerPower) * 0.12 +
    weightedStarterAvg(qbs, getPlayerTechnical) * 0.14 +
    weightedStarterAvg(tes, getPlayerSpeed) * 0.08 +
    weightedStarterAvg(wrs, getPlayerTechnical) * 0.12;
  const ballSecurity =
    weightedStarterAvg(qbs, getPlayerIQ) * 0.3 +
    weightedStarterAvg(rbs, getPlayerTechnical) * 0.22 +
    weightedStarterAvg(tes, getPlayerTechnical) * 0.12 +
    weightedStarterAvg(wrs, getPlayerTechnical) * 0.12 +
    weightedStarterAvg(rbs, getPlayerPower) * 0.12 +
    7;
  const passD =
    weightedStarterAvg(secs, getPlayerIQ) * 0.26 +
    weightedStarterAvg(secs, getPlayerSpeed) * 0.22 +
    weightedStarterAvg(lbs, getPlayerIQ) * 0.18 +
    weightedStarterAvg(dls, getPlayerPower) * 0.12 +
    weightedStarterAvg(secs, getPlayerTechnical) * 0.22;
  const runD =
    weightedStarterAvg(dls, getPlayerPower) * 0.32 +
    weightedStarterAvg(lbs, getPlayerPower) * 0.24 +
    weightedStarterAvg(lbs, getPlayerIQ) * 0.18 +
    weightedStarterAvg(secs, getPlayerPower) * 0.1 +
    weightedStarterAvg(dls, getPlayerTechnical) * 0.16;
  const pressure =
    weightedStarterAvg(dls, getPlayerPower) * 0.28 +
    weightedStarterAvg(dls, getPlayerTechnical) * 0.22 +
    weightedStarterAvg(lbs, getPlayerSpeed) * 0.18 +
    weightedStarterAvg(lbs, getPlayerPower) * 0.18 +
    weightedStarterAvg(secs, getPlayerIQ) * 0.14;
  const takeaways =
    weightedStarterAvg(secs, getPlayerIQ) * 0.28 +
    weightedStarterAvg(secs, getPlayerSpeed) * 0.18 +
    weightedStarterAvg(lbs, getPlayerIQ) * 0.18 +
    weightedStarterAvg(dls, getPlayerPower) * 0.1 +
    weightedStarterAvg(secs, getPlayerTechnical) * 0.26;

  return {
    pass: Math.round(pass),
    run: Math.round(run),
    bigPlay: Math.round(bigPlay),
    ballSecurity: Math.round(ballSecurity),
    passD: Math.round(passD),
    runD: Math.round(runD),
    pressure: Math.round(pressure),
    takeaways: Math.round(takeaways),
  };
}

function eventTypeLabel(highlight: QuarterHighlight) {
  if (highlight.playKind === "punt") return "Punt";
  if (highlight.playKind === "fieldGoal" && !highlight.isScore) return "Missed FG";

  switch (highlight.eventType) {
    case "explosive":
      return "Big play";
    case "touchdown":
      return "Touchdown";
    case "fieldGoal":
      return "Field goal";
    case "turnover":
      return "Turnover";
    case "fourthDown":
      return highlight.eventDetail === "fourthDownConversion" ? "Fourth down" : "Turnover on downs";
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
    case "fourthDown":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "explosive":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "stop":
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function strategyStatusClasses(locked: boolean) {
  return locked
    ? "border-green-200 bg-green-50 text-green-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function offenseStrategyDescription(strategy: string) {
  switch (strategy) {
    case "Pass Heavy":
      return "Push the ball downfield, chase chunk plays, accept more turnover danger.";
    case "Run Heavy":
      return "Shorten the game, protect the ball, test whether their front can hold up.";
    default:
      return "Stay flexible and let the roster answer what the defense gives.";
  }
}

function defenseStrategyDescription(strategy: string) {
  switch (strategy) {
    case "Pressure":
      return "Heat up the quarterback and create strip-sack chaos, with some coverage risk.";
    case "Coverage":
      return "Take away explosives and bait throws, but give up more underneath space.";
    default:
      return "Keep the shell steady and avoid overcommitting.";
  }
}

function halftimeAssessment(result: SimResult, side: "A" | "B", teamAName: string, teamBName: string) {
  const firstHalfHighlights = result.quarters
    .filter((quarter) => quarter.quarter <= 2)
    .flatMap((quarter) => quarter.highlights);
  const halftimeQuarter = result.quarters.find((quarter) => quarter.quarter === 2) ?? result.quarters[result.quarters.length - 1];
  const ownName = side === "A" ? teamAName : teamBName;
  const ownScore = side === "A" ? halftimeQuarter?.scoreA ?? 0 : halftimeQuarter?.scoreB ?? 0;
  const opponentScore = side === "A" ? halftimeQuarter?.scoreB ?? 0 : halftimeQuarter?.scoreA ?? 0;
  const margin = ownScore - opponentScore;
  const ownPlays = firstHalfHighlights.filter((highlight) => highlight.possession === side);
  const opponentPlays = firstHalfHighlights.filter((highlight) => highlight.possession !== side);
  const ownTurnovers = ownPlays.filter((highlight) => highlight.eventType === "turnover").length;
  const takeaways = opponentPlays.filter((highlight) => highlight.eventType === "turnover").length;
  const ownExplosives = ownPlays.filter((highlight) => highlight.eventType === "explosive").length;
  const opponentExplosives = opponentPlays.filter((highlight) => highlight.eventType === "explosive").length;
  const ownScores = ownPlays.filter((highlight) => highlight.isScore).length;
  const opponentScores = opponentPlays.filter((highlight) => highlight.isScore).length;
  const sacksTaken = ownPlays.filter((highlight) => highlight.playKind === "sack").length;
  const pressureCreated = opponentPlays.filter((highlight) => highlight.playKind === "sack").length;

  if (margin <= -9 && ownTurnovers > 0) {
    return `${ownName} is chasing a two-score game because giveaways have erased possessions, so halftime is about protecting the ball or choosing a higher-variance comeback plan.`;
  }

  if (margin <= -9 && opponentExplosives >= 2) {
    return `${ownName} is down two scores because chunk plays are tilting the field, so decide whether to limit space or gamble harder for disruption.`;
  }

  if (margin < 0 && sacksTaken >= 2) {
    return `${ownName} is still within reach, but pressure is squeezing key downs, so the adjustment is whether to calm the game down or keep hunting explosives.`;
  }

  if (margin < 0 && ownScores <= 1) {
    return `${ownName} is behind because drives are not turning into points, so pick the plan that creates the cleanest scoring chances without handing over short fields.`;
  }

  if (margin >= 9 && ownTurnovers + opponentExplosives > 1) {
    return `${ownName} has a two-score lead, but the first half still had volatility, so choose whether to protect the edge or keep pressing for the knockout.`;
  }

  if (margin >= 9) {
    return `${ownName} is in control because the current identity is holding up, so the safest question is whether the opponent has shown enough to force a change.`;
  }

  if (margin > 0 && takeaways > ownTurnovers) {
    return `${ownName} has the lead because the defense stole possessions, so halftime is about deciding whether to stay opportunistic or reduce risk with the ball.`;
  }

  if (margin > 0) {
    return `${ownName} has the lead, but it is still a one-score game, so the next call is whether to protect the advantage or make the first aggressive move.`;
  }

  if (ownExplosives + opponentExplosives >= 4 || ownScores + opponentScores >= 5) {
    return `This is turning into a track meet, so halftime is about choosing whether to keep trading punches or make the first defensive gamble.`;
  }

  if (takeaways > 0 || pressureCreated >= 2) {
    return `${ownName} is being kept alive by defensive swings, so the adjustment is finding just enough offense without giving the game away.`;
  }

  return `Both teams are fighting for inches, which means one turnover or explosive play could swing everything, so aim your adjustment at the cleanest visible edge.`;
}

function scoreCalloutLabel(highlight: QuarterHighlight, teamAName: string, teamBName: string) {
  const teamName = highlight.possession === "A" ? teamAName : teamBName;
  const scoreType = highlight.eventType === "fieldGoal" ? "FG" : "TD";

  return `${scoreType} ${teamName}!`;
}

function eventCalloutLabel(highlight: QuarterHighlight, teamAName: string, teamBName: string) {
  if (highlight.isScore) return scoreCalloutLabel(highlight, teamAName, teamBName);

  if (highlight.playKind === "fieldGoal") {
    const teamName = highlight.possession === "A" ? teamAName : teamBName;
    return `MISS ${teamName}!`;
  }

  if (highlight.eventType === "turnover") {
    const defenseName = highlight.possession === "A" ? teamBName : teamAName;
    if (highlight.eventDetail === "interception") return `PICK ${defenseName}!`;
    if (highlight.eventDetail === "stripSack") return `STRIP SACK ${defenseName}!`;
    return `FUMBLE ${defenseName}!`;
  }

  if (highlight.eventType === "fourthDown") {
    const offenseName = highlight.possession === "A" ? teamAName : teamBName;
    const defenseName = highlight.possession === "A" ? teamBName : teamAName;
    return highlight.eventDetail === "fourthDownConversion"
      ? `CONVERTED ${offenseName}!`
      : `TURNOVER ON DOWNS ${defenseName}!`;
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
  const missedFieldGoal = highlight?.playKind === "fieldGoal" && !highlight.isScore;
  const fourthDown = highlight?.eventType === "fourthDown";
  if (!highlight || (!highlight.isScore && highlight.eventType !== "turnover" && !missedFieldGoal && !fourthDown)) return null;
  const tone =
    highlight.eventType === "turnover"
      ? "border-red-100 bg-red-950 text-white"
      : fourthDown
        ? highlight.eventDetail === "fourthDownConversion"
          ? "border-emerald-100 bg-emerald-950 text-white"
          : "border-red-100 bg-red-950 text-white"
      : missedFieldGoal
        ? "border-amber-100 bg-amber-950 text-white"
      : "border-white bg-slate-950 text-white";

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-[1px]">
      <div
        key={highlight.id}
        className={`animate-bounce rounded-[2rem] border-4 px-8 py-6 text-center shadow-2xl sm:px-12 sm:py-8 ${tone}`}
      >
        <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">
          {highlight.eventType === "turnover"
            ? "Turnover"
            : fourthDown
              ? "Fourth Down"
              : missedFieldGoal
                ? "Kick Missed"
                : "Score Update"}
        </p>
        <p className="mt-2 text-4xl font-black uppercase tracking-tight sm:text-6xl">
          {eventCalloutLabel(highlight, teamAName, teamBName)}
        </p>
      </div>
    </div>
  );
}

function revealStepMs(highlight: QuarterHighlight) {
  if (highlight.isScore || highlight.playKind === "fieldGoal") return SCORE_REVEAL_STEP_MS;
  if (highlight.eventType === "turnover") return TURNOVER_CALLOUT_MS;
  if (highlight.eventType === "fourthDown") return TURNOVER_CALLOUT_MS;
  if (highlight.closeMoment || highlight.eventType === "explosive" || Math.abs(highlight.yards) >= 16) {
    return CLOSE_REVEAL_STEP_MS;
  }
  if (highlight.eventType === "stop" && Math.abs(highlight.yards) <= 4) {
    return SMALL_PLAY_REVEAL_STEP_MS;
  }
  return NORMAL_REVEAL_STEP_MS;
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

function teamAbbreviation(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "TM";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return cleaned.slice(0, 3).toUpperCase();
}

function ballSpotLabel(highlight: QuarterHighlight | null, teamAName: string, teamBName: string) {
  if (!highlight) return "";
  const offenseName = highlight.possession === "A" ? teamAName : teamBName;
  const defenseName = highlight.possession === "A" ? teamBName : teamAName;
  const yardLine = clamp(Math.round(highlight.startYardLine), 0, 100);

  if (yardLine === 50) return "50";
  if (yardLine >= 100) return `${teamAbbreviation(defenseName)} goal line`;
  if (yardLine <= 0) return `${teamAbbreviation(offenseName)} goal line`;

  const teamName = yardLine < 50 ? offenseName : defenseName;
  const displayYard = yardLine < 50 ? yardLine : 100 - yardLine;
  return `${teamAbbreviation(teamName)} ${displayYard}`;
}

function downDistanceWithSpot(
  highlight: QuarterHighlight | null,
  teamAName: string,
  teamBName: string
) {
  if (!highlight) return "Ball ready";
  const spot = ballSpotLabel(highlight, teamAName, teamBName);
  return spot ? `${highlight.downDistance} at ${spot}` : highlight.downDistance;
}

function estimateWinProbabilityA(
  scoreA: number,
  scoreB: number,
  currentQuarter: number,
  progressRatio: number,
  possession: "A" | "B" | null
) {
  const scoreDiff = scoreA - scoreB;
  const gameProgress = clamp(progressRatio, (currentQuarter - 1) / 4, 0.98);
  const leverage = 1.05 + gameProgress * 3.45;
  const possessionBump = possession === "A" ? 1.5 : possession === "B" ? -1.5 : 0;
  const liveCap = 68 + gameProgress * 28;
  const liveFloor = 100 - liveCap;

  return clamp(Math.round(50 + scoreDiff * leverage + possessionBump), liveFloor, liveCap);
}

function possessionLabel(possession: "A" | "B", teamAName: string, teamBName: string) {
  return possession === "A" ? teamAName : teamBName;
}

function otherPossession(possession: "A" | "B") {
  return possession === "A" ? "B" : "A";
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
  showHalftimeShow = false,
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
  showHalftimeShow?: boolean;
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
  const [ballPosition, setBallPosition] = useState(end);
  const movingRight = end >= start;
  const isPassShape = highlight?.playKind === "pass" || highlight?.playKind === "punt";
  const arrowColor = highlight && highlight.yards < 0 ? "rgb(220 38 38)" : "rgb(15 23 42)";
  const passArc = `M ${start} 54 Q ${(start + end) / 2} ${highlight?.playKind === "punt" ? 10 : start === end ? 32 : 18} ${end} 54`;
  const runLine = `M ${start} 54 L ${end} 54`;
  const possessionArrow = highlight?.possession === "A" ? ">" : "<";
  const arrowMarkerId = highlight ? `play-arrow-${highlight.id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : "play-arrow";
  const liveDownDistance = downDistanceWithSpot(highlight, teamAName, teamBName);

  useEffect(() => {
    let frame = 0;
    const reset = window.setTimeout(() => {
      setBallPosition(start);
      frame = window.requestAnimationFrame(() => {
        setBallPosition(end);
      });
    }, 0);

    return () => {
      window.clearTimeout(reset);
      window.cancelAnimationFrame(frame);
    };
  }, [end, highlight?.id, start]);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-emerald-950 p-4 text-white shadow-sm sm:p-5">
      <div className="rounded-2xl border border-white/15 bg-white/10 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
              {phase === "final" ? "Final" : phase === "halftime" ? "Halftime" : `${quarter === 5 ? "OT" : `Q${quarter}`} • ${clock}`}
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
                {eventTypeLabel(highlight)}
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
                : liveDownDistance}
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

      <div className="relative mt-4 h-36 overflow-hidden rounded-2xl border border-white/20 bg-[linear-gradient(90deg,rgba(6,78,59,0.95),rgba(5,150,105,0.75),rgba(6,78,59,0.95))]">
        <div className="absolute inset-y-0 left-0 w-[9%] border-r border-white/25 bg-emerald-950/55" />
        <div className="absolute inset-y-0 right-0 w-[9%] border-l border-white/25 bg-emerald-950/55" />
        <div className="absolute left-[4.5%] top-1/2 max-w-[4.5rem] -translate-x-1/2 -translate-y-1/2 -rotate-90 truncate text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
          {teamAName}
        </div>
        <div className="absolute right-[4.5%] top-1/2 max-w-[4.5rem] translate-x-1/2 -translate-y-1/2 rotate-90 truncate text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
          {teamBName}
        </div>
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
        {highlight && phase === "live" && (
          <div
            className="absolute top-2 rounded-full border border-amber-200 bg-amber-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-950 shadow"
            style={{ left: highlight.possession === "A" ? "10px" : "auto", right: highlight.possession === "B" ? "10px" : "auto" }}
          >
            {possessionArrow} {possessionName} ball
          </div>
        )}
        {highlight && phase === "live" && (
          <div className="absolute bottom-2 left-1/2 max-w-[88%] -translate-x-1/2 rounded border border-white/20 bg-slate-950/70 px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white shadow">
            {liveDownDistance}
          </div>
        )}
        {highlight && (
          <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker
                id={arrowMarkerId}
                markerHeight="4"
                markerWidth="5"
                orient="auto"
                refX="4.5"
                refY="2"
                viewBox="0 0 5 4"
              >
                <path d="M 0 0 L 5 2 L 0 4 z" fill={arrowColor} />
              </marker>
            </defs>
            <path
              key={highlight.id}
              d={isPassShape ? passArc : runLine}
              fill="none"
              markerEnd={`url(#${arrowMarkerId})`}
              stroke={arrowColor}
              strokeDasharray={isPassShape ? "3 3" : undefined}
              strokeLinecap="round"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              className="drop-shadow-[0_0_6px_rgba(255,255,255,0.45)]"
            />
          </svg>
        )}
        <div
          className={`absolute top-[54%] -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ${
            movingRight ? "rotate-12" : "-rotate-12"
          }`}
          style={{ left: `${clamp(ballPosition, 3, 97)}%` }}
        >
          <div className="relative h-4 w-7 rounded-[50%] border border-white/80 bg-amber-900 shadow-[0_0_20px_rgba(252,211,77,0.75)]">
            <div className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-white/75" />
          </div>
        </div>
        <div className="absolute left-2 bottom-2 rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
          {highlight?.possession === "B" ? "Goal" : "Own"}
        </div>
        <div className="absolute right-2 bottom-2 rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
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
        </div>
        {highlight && phase === "live" && (
          <p className="shrink-0 font-semibold">
            {highlight.yards >= 0 ? "+" : ""}
            {highlight.yards} yards
          </p>
        )}
      </div>

      {showHalftimeShow && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-[2px]">
          <div className="w-full max-w-sm overflow-hidden rounded-lg border border-white/20 bg-slate-950/90 shadow-2xl sm:max-w-lg">
            <div className="relative aspect-square w-full bg-black">
              <Image
                src="/diaztablegif.gif"
                alt="Diaz The Amazing Table Breaker halftime show"
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 640px) calc(100vw - 4rem), 32rem"
              />
            </div>
            <p className="bg-amber-300 px-4 py-3 text-center text-sm font-black uppercase text-slate-950 sm:text-base">
              Your Halftime Show: Diaz The Amazing Table Breaker!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsTimeline({
  result,
  teamAName,
  teamBName,
  awaitingHalftimeAdjustments,
  resumeFromQuarter = 1,
  forceComplete,
  onHalftimeRevealComplete,
  onRevealComplete,
}: {
  result: SimResult;
  teamAName: string;
  teamBName: string;
  awaitingHalftimeAdjustments: boolean;
  resumeFromQuarter?: number;
  forceComplete?: boolean;
  onHalftimeRevealComplete: () => void;
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

    result.quarters
      .filter((quarter) => quarter.quarter >= resumeFromQuarter)
      .forEach((quarter) => {
        quarter.highlights.forEach((highlight) => {
          const revealAt = nextRevealAt;
          steps.push({ kind: "play", quarter: quarter.quarter, highlight, revealAt });
          nextRevealAt += revealStepMs(highlight);
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

    if (!awaitingHalftimeAdjustments) {
      const finalQuarter = result.quarters[result.quarters.length - 1]?.quarter ?? 4;
      steps.push({
        kind: "final",
        quarter: finalQuarter,
        revealAt: nextRevealAt,
        scoreA: result.finalA,
        scoreB: result.finalB,
      });
    }

    return steps;
  }, [awaitingHalftimeAdjustments, result, resumeFromQuarter]);

  const scheduleCompleteAt =
    revealSchedule.length > 0
      ? Math.max(...revealSchedule.map((step) => step.revealAt)) + FINAL_SCOREBOARD_HOLD_MS + 1
      : 0;
  const elapsed = forceComplete ? scheduleCompleteAt : now - startedAt;
  const revealedSteps = revealSchedule.filter((step) => elapsed >= step.revealAt).length;
  const visibleSteps = revealSchedule.slice(0, revealedSteps);
  const preRevealedHighlights = result.quarters
    .filter((quarter) => quarter.quarter < resumeFromQuarter)
    .flatMap((quarter) =>
      quarter.highlights.map((highlight) => ({
        kind: "play" as const,
        quarter: quarter.quarter,
        highlight,
        revealAt: 0,
      }))
    );
  const visibleHighlights = visibleSteps.filter(
    (step): step is Extract<RevealStep, { kind: "play" }> => step.kind === "play"
  );
  const allVisibleHighlights = [...preRevealedHighlights, ...visibleHighlights];
  const preRevealScore = result.quarters
    .filter((quarter) => quarter.quarter < resumeFromQuarter)
    .at(-1);
  const visibleScore =
    visibleSteps.length > 0
      ? (() => {
          const current = visibleSteps[visibleSteps.length - 1];
          if (current.kind === "play") return current.highlight;
          return { scoreA: current.scoreA, scoreB: current.scoreB };
        })()
      : { scoreA: preRevealScore?.scoreA ?? 0, scoreB: preRevealScore?.scoreB ?? 0 };
  const currentRevealStep = visibleSteps[visibleSteps.length - 1] ?? null;
  const lastPlayStep = allVisibleHighlights[allVisibleHighlights.length - 1] ?? null;
  const currentHighlight =
    currentRevealStep?.kind === "play"
      ? currentRevealStep.highlight
      : resumeFromQuarter > 1 && visibleHighlights.length === 0
        ? null
        : lastPlayStep?.highlight ?? null;
  const currentQuarter = currentRevealStep?.quarter ?? resumeFromQuarter;
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
  const showMissedFieldGoalCallout =
    !!currentRevealStep &&
    currentRevealStep.kind === "play" &&
    currentRevealStep.highlight.playKind === "fieldGoal" &&
    !currentRevealStep.highlight.isScore &&
    elapsed - currentRevealStep.revealAt <= MISSED_FG_CALLOUT_MS;
  const showFourthDownCallout =
    !!currentRevealStep &&
    currentRevealStep.kind === "play" &&
    currentRevealStep.highlight.eventType === "fourthDown" &&
    elapsed - currentRevealStep.revealAt <= TURNOVER_CALLOUT_MS;
  const revealedQuarterMap = new Map<number, QuarterHighlight[]>();

  allVisibleHighlights.forEach(({ quarter, highlight }) => {
    const current = revealedQuarterMap.get(quarter) ?? [];
    current.push(highlight);
    revealedQuarterMap.set(quarter, current);
  });

  const finalScoreHoldActive =
    !!currentRevealStep &&
    currentRevealStep.kind === "play" &&
    (currentRevealStep.highlight.isScore ||
      currentRevealStep.highlight.eventType === "turnover" ||
      currentRevealStep.highlight.eventType === "fourthDown") &&
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
      if (awaitingHalftimeAdjustments) {
        onHalftimeRevealComplete();
      } else {
        onRevealComplete();
      }
    }
  }, [allHighlightsRevealed, awaitingHalftimeAdjustments, onHalftimeRevealComplete, onRevealComplete]);

  return (
    <>
      {(showScoreCallout || showTurnoverCallout || showMissedFieldGoalCallout || showFourthDownCallout) && (
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
        showHalftimeShow={awaitingHalftimeAdjustments && currentPhase === "halftime"}
      />

      <div className="space-y-3 sm:space-y-4">
        {result.quarters.map((quarter) => {
          const quarterHighlights = revealedQuarterMap.get(quarter.quarter) ?? [];
          if (quarterHighlights.length === 0) return null;

          const quarterScore = quarterHighlights[quarterHighlights.length - 1];
          const recentQuarterHighlights = quarterHighlights.slice(-5);

          return (
            <div key={quarter.quarter} className="rounded-2xl border p-4 sm:p-5">
              <h2 className="text-lg font-semibold sm:text-xl">
                {quarter.quarter === 5 ? "OT" : `Q${quarter.quarter}`} — {teamAName} {quarterScore.scoreA}, {teamBName} {quarterScore.scoreB}
              </h2>
              <ul className="mt-3 space-y-2 text-sm opacity-90">
                {recentQuarterHighlights.map((highlight, index) => {
                  const fullIndex = quarterHighlights.length - recentQuarterHighlights.length + index;
                  const previous = quarterHighlights[fullIndex - 1] ?? null;
                  const changedPossession =
                    fullIndex > 0 &&
                    previous?.possession !== highlight.possession &&
                    previous.eventType !== "turnover";
                  const turnoverPossession = otherPossession(highlight.possession);

                  return (
                    <Fragment key={highlight.id}>
                      {changedPossession && (
                        <li className="list-none rounded border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
                          Change of Possession:{" "}
                          {possessionLabel(highlight.possession, teamAName, teamBName)} with ball
                        </li>
                      )}
                      <li className={highlight.isScore ? "font-medium text-slate-950" : ""}>
                        <span className="mr-2 font-semibold tabular-nums text-slate-500">
                          {highlight.clock} {downDistanceWithSpot(highlight, teamAName, teamBName)}
                        </span>
                        {highlight.text}
                        {highlight.isScore && (
                          <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Score update
                          </span>
                        )}
                      </li>
                      {highlight.eventType === "turnover" && (
                        <li className="list-none rounded border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-red-800">
                          Change of Possession:{" "}
                          {possessionLabel(turnoverPossession, teamAName, teamBName)} with ball
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {allHighlightsRevealed && !awaitingHalftimeAdjustments && (
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
  const [halftimeRevealComplete, setHalftimeRevealComplete] = useState(false);
  const [halftimeError, setHalftimeError] = useState("");
  const [halftimeSubmitting, setHalftimeSubmitting] = useState(false);
  const [halftimeTeamAOffense, setHalftimeTeamAOffense] = useState<string | null>(null);
  const [halftimeTeamADefense, setHalftimeTeamADefense] = useState<string | null>(null);
  const [halftimeTeamBOffense, setHalftimeTeamBOffense] = useState<string | null>(null);
  const [halftimeTeamBDefense, setHalftimeTeamBDefense] = useState<string | null>(null);
  const timelineKeyRef = useRef("");
  const finalizingSecondHalfRef = useRef(false);

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
    if (room.status !== "results" && room.status !== "halftime") {
      router.replace(getRoomStatusHref(room));
    }
  }, [roomId, room, router]);

  const firstHalfResult =
    room?.firstHalfResult ??
    (room?.status === "halftime" && room?.simResult?.quarters.length === 2 ? room.simResult : null);
  const result: SimResult | null =
    room?.status === "halftime" ? firstHalfResult : room?.simResult ?? firstHalfResult ?? null;
  const timelineKey = useMemo(() => {
    if (!room || !result) return "";
    const phase = room.status === "halftime" ? "first-half" : room.secondHalfResult ? "full-game" : "results";
    const quarterKey = result.quarters
      .map((quarter) => `${quarter.quarter}:${quarter.highlights.length}:${quarter.scoreA}-${quarter.scoreB}`)
      .join("|");
    return `${roomId ?? ""}:${room.seriesGameNumber}:${phase}:${quarterKey}:${result.finalA}-${result.finalB}`;
  }, [room, result, roomId]);
  const teamAName = room?.teamAName ?? "Team A";
  const teamBName = room?.teamBName ?? "Team B";
  const awaitingHalftimeAdjustments = room?.status === "halftime" && !!firstHalfResult;
  const shouldResumeFromSecondHalf =
    room?.status === "results" &&
    !!room.firstHalfResult &&
    !!room.secondHalfResult;
  const resumeFromQuarter = shouldResumeFromSecondHalf ? 3 : 1;
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
  const canContinueSeries = !!room && room.status === "results" && !!result && !seriesWinner;
  const seriesPressureMessage = getSeriesPressureMessage({
    seriesGameNumber,
    seriesWinsA,
    seriesWinsB,
    teamAName,
    teamBName,
  });

  useEffect(() => {
    if (timelineKeyRef.current === timelineKey) return;
    timelineKeyRef.current = timelineKey;
    setTimelineComplete(false);
    setHalftimeRevealComplete(false);
  }, [timelineKey]);

  const selectedHalftimeTeamAOffense =
    halftimeTeamAOffense ?? room?.halftimeTeamAStrategy?.offense ?? room?.teamAStrategy.offense ?? "Balanced";
  const selectedHalftimeTeamADefense =
    halftimeTeamADefense ?? room?.halftimeTeamAStrategy?.defense ?? room?.teamAStrategy.defense ?? "Balanced";
  const selectedHalftimeTeamBOffense =
    halftimeTeamBOffense ?? room?.halftimeTeamBStrategy?.offense ?? room?.teamBStrategy.offense ?? "Balanced";
  const selectedHalftimeTeamBDefense =
    halftimeTeamBDefense ?? room?.halftimeTeamBStrategy?.defense ?? room?.teamBStrategy.defense ?? "Balanced";
  const halftimeTeamALocked = room?.halftimeTeamAStrategy?.locked ?? false;
  const halftimeTeamBLocked = room?.halftimeTeamBStrategy?.locked ?? false;
  const myHalftimeLocked =
    mySide === "A" ? halftimeTeamALocked : mySide === "B" ? halftimeTeamBLocked : false;
  const otherHalftimeLocked =
    mySide === "A" ? halftimeTeamBLocked : mySide === "B" ? halftimeTeamALocked : false;
  const bothHalftimeLocked = halftimeTeamALocked && halftimeTeamBLocked;
  const myHalftimeAssessment =
    result && mySide ? halftimeAssessment(result, mySide, teamAName, teamBName) : "";

  const finishSecondHalfFromRoom = useCallback(
    async (roomState: RoomData) => {
      if (!roomId || roomState.status !== "halftime") return;
      if (finalizingSecondHalfRef.current) return;
      if (!roomState.halftimeTeamAStrategy?.locked || !roomState.halftimeTeamBStrategy?.locked) return;

      const storedFirstHalf =
        roomState.firstHalfResult ??
        (roomState.simResult && roomState.simResult.quarters.length === 2 ? roomState.simResult : null);

      if (!storedFirstHalf || storedFirstHalf.quarters.length !== 2) return;

      const teamARatings = buildRatings(roomState.teamA);
      const teamBRatings = buildRatings(roomState.teamB);
      const secondHalfSetup: GameSetup = {
        teamAName: roomState.teamAName,
        teamBName: roomState.teamBName,
        teamA: roomState.teamA,
        teamB: roomState.teamB,
        teamARatings,
        teamBRatings,
        teamAStrategy: {
          offense: roomState.halftimeTeamAStrategy.offense,
          defense: roomState.halftimeTeamAStrategy.defense,
        },
        teamBStrategy: {
          offense: roomState.halftimeTeamBStrategy.offense,
          defense: roomState.halftimeTeamBStrategy.defense,
        },
        simSeed:
          roomState.seed +
          roomState.seriesGameNumber * 1_000_003 +
          roomState.seriesWinsA * 10_007 +
          roomState.seriesWinsB * 101 +
          2_000_029,
      };

      try {
        finalizingSecondHalfRef.current = true;
        const secondHalf = simulateGame(secondHalfSetup, {
          startQuarter: 3,
          endQuarter: 4,
          initialScoreA: storedFirstHalf.finalA,
          initialScoreB: storedFirstHalf.finalB,
          startingPossession: roomState.coinToss?.secondHalfPossession ?? "B",
        });
        await finalizeSecondHalfGame(roomId, secondHalf);
      } catch (error) {
        console.error("Could not finalize second half", error);
        setHalftimeError("Could not start the second half.");
        finalizingSecondHalfRef.current = false;
      }
    },
    [roomId]
  );

  async function lockHalftimeStrategy() {
    if (!roomId || !room || room.status !== "halftime" || !mySide || myHalftimeLocked) {
      return;
    }

    const offense = mySide === "A" ? selectedHalftimeTeamAOffense : selectedHalftimeTeamBOffense;
    const defense = mySide === "A" ? selectedHalftimeTeamADefense : selectedHalftimeTeamBDefense;

    try {
      setHalftimeSubmitting(true);
      setHalftimeError("");
      const confirmedRoom = await saveHalftimeStrategy(roomId, mySide, offense, defense, true);
      await finishSecondHalfFromRoom(confirmedRoom);
    } catch (error) {
      console.error(error);
      setHalftimeError("Could not lock halftime adjustments.");
    } finally {
      setHalftimeSubmitting(false);
    }
  }

  useEffect(() => {
    if (!room || !firstHalfResult) return;
    finishSecondHalfFromRoom(room);
  }, [room, firstHalfResult, finishSecondHalfFromRoom]);

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
          key={timelineKey}
          result={result}
          teamAName={teamAName}
          teamBName={teamBName}
          awaitingHalftimeAdjustments={awaitingHalftimeAdjustments}
          resumeFromQuarter={resumeFromQuarter}
          forceComplete={awaitingHalftimeAdjustments && halftimeRevealComplete}
          onHalftimeRevealComplete={() => setHalftimeRevealComplete(true)}
          onRevealComplete={() => setTimelineComplete(true)}
        />

        {awaitingHalftimeAdjustments && (
          <div className="rounded-2xl border p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">Halftime Adjustments</h2>
                <p className="mt-1 text-sm opacity-70">
                  {halftimeRevealComplete
                    ? "Switch the plan, lock it in, and the second half starts when both coaches are ready."
                    : "Adjustments unlock once the halftime scoreboard hits the screen."}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-sm sm:flex-row">
                <span className={`rounded-full border px-3 py-1 ${strategyStatusClasses(halftimeTeamALocked)}`}>
                  {teamAName}: {halftimeTeamALocked ? "Locked" : "Adjusting"}
                </span>
                <span className={`rounded-full border px-3 py-1 ${strategyStatusClasses(halftimeTeamBLocked)}`}>
                  {teamBName}: {halftimeTeamBLocked ? "Locked" : "Adjusting"}
                </span>
              </div>
            </div>

            {halftimeRevealComplete && myHalftimeAssessment && (
              <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-medium text-sky-950">
                {myHalftimeAssessment}
              </p>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border p-3">
                <h3 className="font-semibold">{teamAName}</h3>
                {mySide === "A" ? (
                  <>
                    <label className="block text-sm font-medium">Offense</label>
                    <select
                      value={selectedHalftimeTeamAOffense}
                      onChange={(event) => setHalftimeTeamAOffense(event.target.value)}
                      disabled={!halftimeRevealComplete || halftimeTeamALocked}
                      className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                    >
                      {OFFENSE_STRATEGIES.map((strategy) => (
                        <option key={strategy}>{strategy}</option>
                      ))}
                    </select>
                    <p className="text-sm opacity-70">{offenseStrategyDescription(selectedHalftimeTeamAOffense)}</p>
                    <label className="block text-sm font-medium">Defense</label>
                    <select
                      value={selectedHalftimeTeamADefense}
                      onChange={(event) => setHalftimeTeamADefense(event.target.value)}
                      disabled={!halftimeRevealComplete || halftimeTeamALocked}
                      className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                    >
                      {DEFENSE_STRATEGIES.map((strategy) => (
                        <option key={strategy}>{strategy}</option>
                      ))}
                    </select>
                    <p className="text-sm opacity-70">{defenseStrategyDescription(selectedHalftimeTeamADefense)}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Opponent counters stay hidden until the second half kicks off.
                    </p>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed p-3 text-sm opacity-70">
                    {halftimeTeamALocked ? "Locked. Hidden until the second half kicks off." : "Coach is making adjustments."}
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border p-3">
                <h3 className="font-semibold">{teamBName}</h3>
                {mySide === "B" ? (
                  <>
                    <label className="block text-sm font-medium">Offense</label>
                    <select
                      value={selectedHalftimeTeamBOffense}
                      onChange={(event) => setHalftimeTeamBOffense(event.target.value)}
                      disabled={!halftimeRevealComplete || halftimeTeamBLocked}
                      className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                    >
                      {OFFENSE_STRATEGIES.map((strategy) => (
                        <option key={strategy}>{strategy}</option>
                      ))}
                    </select>
                    <p className="text-sm opacity-70">{offenseStrategyDescription(selectedHalftimeTeamBOffense)}</p>
                    <label className="block text-sm font-medium">Defense</label>
                    <select
                      value={selectedHalftimeTeamBDefense}
                      onChange={(event) => setHalftimeTeamBDefense(event.target.value)}
                      disabled={!halftimeRevealComplete || halftimeTeamBLocked}
                      className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                    >
                      {DEFENSE_STRATEGIES.map((strategy) => (
                        <option key={strategy}>{strategy}</option>
                      ))}
                    </select>
                    <p className="text-sm opacity-70">{defenseStrategyDescription(selectedHalftimeTeamBDefense)}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Opponent counters stay hidden until the second half kicks off.
                    </p>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed p-3 text-sm opacity-70">
                    {halftimeTeamBLocked ? "Locked. Hidden until the second half kicks off." : "Coach is making adjustments."}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm opacity-70">
                {!mySide
                  ? "Waiting for player assignment."
                  : !halftimeRevealComplete
                    ? "Reach halftime before locking changes."
                    : bothHalftimeLocked
                      ? "Both staffs locked in. Starting the second half..."
                      : myHalftimeLocked
                        ? otherHalftimeLocked
                          ? "Both staffs locked in. Starting the second half..."
                          : "Your changes are locked. Waiting for the other sideline..."
                        : "Make the call that gives you the best shot after halftime."}
              </p>
              <button
                type="button"
                onClick={lockHalftimeStrategy}
                disabled={!mySide || !halftimeRevealComplete || myHalftimeLocked || bothHalftimeLocked || halftimeSubmitting}
                className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
              >
                {myHalftimeLocked ? "Adjustments Locked" : halftimeSubmitting ? "Locking..." : "Lock Adjustments"}
              </button>
            </div>
            {halftimeError && <p className="mt-3 text-sm text-red-600">{halftimeError}</p>}
          </div>
        )}

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
