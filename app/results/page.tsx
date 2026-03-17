"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { subscribeToRoom, RoomData } from "@/lib/room";
import { GameSetup, SimResult, simulateGame } from "@/lib/sim";

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  const [room, setRoom] = useState<RoomData | null>(null);
  const [localSetup, setLocalSetup] = useState<GameSetup | null>(null);
  const [revealedQuarters, setRevealedQuarters] = useState(0);

  const multiplayer = !!roomId;

  useEffect(() => {
    let unsub: (() => void) | undefined;

    if (multiplayer && roomId) {
      unsub = subscribeToRoom(roomId, (nextRoom) => {
        setRoom(nextRoom);
      });
    } else {
      const raw = localStorage.getItem("moodinGameSetup");
      if (raw) setLocalSetup(JSON.parse(raw));
    }

    return () => {
      if (unsub) unsub();
    };
  }, [multiplayer, roomId]);

  const localResult = useMemo(() => {
    if (!localSetup) return null;
    return simulateGame(localSetup);
  }, [localSetup]);

  const result: SimResult | null = multiplayer
    ? room?.simResult ?? null
    : localResult;

  const teamAName = multiplayer ? room?.teamAName : localSetup?.teamAName;
  const teamBName = multiplayer ? room?.teamBName : localSetup?.teamBName;

  useEffect(() => {
    if (!result) return;

    setRevealedQuarters(0);

    const timers = [
      setTimeout(() => setRevealedQuarters(1), 500),
      setTimeout(() => setRevealedQuarters(2), 5500),
      setTimeout(() => setRevealedQuarters(3), 10500),
      setTimeout(() => setRevealedQuarters(4), 15500),
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [result]);

  if (!result || !teamAName || !teamBName) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-3xl font-bold">Game Results</h1>
        <p className="mt-4 opacity-70">Waiting for game results...</p>
      </main>
    );
  }

  const visibleScore =
    revealedQuarters > 0
      ? result.quarters[revealedQuarters - 1]
      : { scoreA: 0, scoreB: 0 };

  return (
    <main className="min-h-screen p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Game Simulation</h1>
        <p className="opacity-70 mt-1">
          {teamAName} vs {teamBName}
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>{teamAName}</span>
          <span>{revealedQuarters === 4 ? result.finalA : visibleScore.scoreA}</span>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>{teamBName}</span>
          <span>{revealedQuarters === 4 ? result.finalB : visibleScore.scoreB}</span>
        </div>
      </div>

      <div className="space-y-4">
        {result.quarters.slice(0, revealedQuarters).map((quarter) => (
          <div key={quarter.quarter} className="rounded-lg border p-4">
            <h2 className="text-xl font-semibold">
              Q{quarter.quarter} — {teamAName} {quarter.scoreA}, {teamBName} {quarter.scoreB}
            </h2>
            <ul className="mt-3 space-y-1 text-sm opacity-80">
              {quarter.plays.map((play, idx) => (
                <li key={idx}>• {play}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {revealedQuarters === 4 && (
        <div className="rounded-lg border p-4 bg-gray-50">
          <h2 className="text-2xl font-bold">Final</h2>
          <p className="mt-2 text-lg">
            {teamAName} {result.finalA} — {teamBName} {result.finalB}
          </p>
        </div>
      )}
    </main>
  );
}