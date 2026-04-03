"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function statSummary(statLine: PlayerGameStats) {
  const chunks: string[] = [];

  if (statLine.passingYards > 0) chunks.push(`${statLine.passingYards} pass yds`);
  if (statLine.passingTD > 0) chunks.push(`${statLine.passingTD} pass TD`);
  if (statLine.interceptions > 0) chunks.push(`${statLine.interceptions} INT`);
  if (statLine.carries > 0) chunks.push(`${statLine.carries} car`);
  if (statLine.rushYards > 0) chunks.push(`${statLine.rushYards} rush yds`);
  if (statLine.rushTD > 0) chunks.push(`${statLine.rushTD} rush TD`);
  if (statLine.receptions > 0) chunks.push(`${statLine.receptions} rec`);
  if (statLine.receivingYards > 0) chunks.push(`${statLine.receivingYards} rec yds`);
  if (statLine.receivingTD > 0) chunks.push(`${statLine.receivingTD} rec TD`);

  return chunks.length > 0 ? chunks.join(" • ") : "No touches recorded.";
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

function ResultsTimeline({
  result,
  teamAName,
  teamBName,
}: {
  result: SimResult;
  teamAName: string;
  teamBName: string;
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

  const revealPlan = useMemo(() => {
    const steps: Array<{ quarter: number; highlight: QuarterHighlight }> = [];

    result.quarters.forEach((quarter) => {
      quarter.highlights.forEach((highlight) => {
        steps.push({ quarter: quarter.quarter, highlight });
      });
    });

    return steps;
  }, [result]);

  const elapsed = now - startedAt;
  const revealedHighlights = clamp(Math.floor(Math.max(0, elapsed - 500) / 1200) + 1, 0, revealPlan.length);
  const visibleHighlights = revealPlan.slice(0, revealedHighlights);
  const visibleScore =
    visibleHighlights.length > 0
      ? visibleHighlights[visibleHighlights.length - 1].highlight
      : { scoreA: 0, scoreB: 0 };
  const revealedQuarterMap = new Map<number, QuarterHighlight[]>();

  visibleHighlights.forEach(({ quarter, highlight }) => {
    const current = revealedQuarterMap.get(quarter) ?? [];
    current.push(highlight);
    revealedQuarterMap.set(quarter, current);
  });

  const allHighlightsRevealed = revealedHighlights >= revealPlan.length;

  return (
    <>
      <div className="rounded-2xl border p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4 text-base font-semibold sm:text-lg">
          <span className="truncate pr-3">{teamAName}</span>
          <span>{allHighlightsRevealed ? result.finalA : visibleScore.scoreA}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-4 text-base font-semibold sm:text-lg">
          <span className="truncate pr-3">{teamBName}</span>
          <span>{allHighlightsRevealed ? result.finalB : visibleScore.scoreB}</span>
        </div>
      </div>

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
                    • {highlight.text}
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

        <div className="rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold sm:text-xl">Run It Back Series</h2>
              <p className="text-sm opacity-70">
                Game {seriesGameNumber} of 3
              </p>
              <p className="mt-1 text-sm font-medium">
                {seriesWinner
                  ? `${seriesWinner === "A" ? teamAName : teamBName} closed it out.`
                  : seriesPressureMessage}
              </p>
            </div>

            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
              <span className="rounded-full border px-3 py-1">
                {teamAName}: {seriesWinsA} win{seriesWinsA === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border px-3 py-1">
                {teamBName}: {seriesWinsB} win{seriesWinsB === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        <ResultsTimeline
          key={JSON.stringify(result)}
          result={result}
          teamAName={teamAName}
          teamBName={teamBName}
        />

        <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
          <TeamBoxScore title={`${teamAName} Box Score`} stats={result.teamAStats} />
          <TeamBoxScore title={`${teamBName} Box Score`} stats={result.teamBStats} />
        </div>

        <div className="rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-semibold sm:text-2xl">
                  {seriesWinner ? "Series Complete" : "Between Games"}
                </h2>
                <p className="mt-1 text-sm opacity-70">
                  {seriesWinner
                    ? `${seriesWinner === "A" ? teamAName : teamBName} won the best-of-3 series.`
                    : "Keep 2 players, fight over 1 free agent, then jump into the next draft."}
                </p>
              </div>

              {seriesWinner && (
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
                {seriesWinner
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

            {seriesWinner ? (
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
