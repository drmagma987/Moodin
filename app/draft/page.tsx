"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { generateProspects } from "@/lib/game/prospects";
import type { DraftedPlayer, Position, Prospect } from "@/lib/game/types";
import { makeDraftPick, RoomData, subscribeToRoom, updateRoomStatus } from "@/lib/room";

function formatHeight(inches: number) {
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

function currentPicker2P(pickNumber: number): "A" | "B" {
  const round = Math.floor(pickNumber / 2) + 1;
  const pickInRound = pickNumber % 2;

  if (round % 2 === 1) {
    return pickInRound === 0 ? "A" : "B";
  } else {
    return pickInRound === 0 ? "B" : "A";
  }
}

type TeamNeeds = Record<Position, number>;

const STARTER_REQUIREMENTS: TeamNeeds = {
  QB: 1,
  RB: 1,
  WR: 2,
  TE: 1,
  DL: 1,
  LB: 1,
  SEC: 1,
};

function countByPosition(players: DraftedPlayer[]): Record<Position, number> {
  return {
    QB: players.filter((p) => p.position === "QB").length,
    RB: players.filter((p) => p.position === "RB").length,
    WR: players.filter((p) => p.position === "WR").length,
    TE: players.filter((p) => p.position === "TE").length,
    DL: players.filter((p) => p.position === "DL").length,
    LB: players.filter((p) => p.position === "LB").length,
    SEC: players.filter((p) => p.position === "SEC").length,
  };
}

function getMissingStarterPositions(players: DraftedPlayer[]): Position[] {
  const counts = countByPosition(players);
  const missing: Position[] = [];

  (Object.keys(STARTER_REQUIREMENTS) as Position[]).forEach((position) => {
    const needed = STARTER_REQUIREMENTS[position];
    if (counts[position] < needed) {
      missing.push(position);
    }
  });

  return missing;
}

function getPositionBadgeClass(position: Position) {
  switch (position) {
    case "QB":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "RB":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "WR":
      return "bg-green-100 text-green-800 border-green-200";
    case "TE":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "DL":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "LB":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "SEC":
      return "bg-pink-100 text-pink-800 border-pink-200";
  }
}

export default function DraftPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomId = searchParams.get("roomId");
  const teamAName = searchParams.get("teamA") || "Team A";
  const teamBName = searchParams.get("teamB") || "Team B";
  const seedParam = searchParams.get("seed");
  const seed = seedParam ? Number(seedParam) : Date.now();

  const initialProspects = useMemo(() => generateProspects(seed), [seed]);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [localProspects, setLocalProspects] = useState<Prospect[]>(initialProspects);
  const [localTeamA, setLocalTeamA] = useState<DraftedPlayer[]>([]);
  const [localTeamB, setLocalTeamB] = useState<DraftedPlayer[]>([]);
  const [localPickNumber, setLocalPickNumber] = useState(0);
  const [uid, setUid] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function setup() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      if (roomId) {
        unsub = subscribeToRoom(roomId, (nextRoom) => {
          setRoom(nextRoom);

          if (nextRoom?.status === "recap") {
            router.push(`/recap?roomId=${nextRoom.roomId}`);
          }

          if (nextRoom?.status === "results") {
            router.push(`/results?roomId=${nextRoom.roomId}`);
          }
        });
      }
    }

    setup();

    return () => {
      if (unsub) unsub();
    };
  }, [roomId, router]);

  const multiplayer = !!roomId && !!room;

  const teamA: DraftedPlayer[] = multiplayer ? room.teamA : localTeamA;
  const teamB: DraftedPlayer[] = multiplayer ? room.teamB : localTeamB;
  const pickNumber = multiplayer ? room.pickNumber : localPickNumber;

  const draftOver = pickNumber >= 24;
  const currentTeam = currentPicker2P(pickNumber);
  const turnRoster = currentTeam === "A" ? teamA : teamB;
  const missingPositions = getMissingStarterPositions(turnRoster);
  const startersComplete = missingPositions.length === 0;

  const mySlot = multiplayer
    ? uid && room
      ? room.playerAId === uid
        ? "A"
        : room.playerBId === uid
          ? "B"
          : null
      : null
    : currentTeam;

  const isMyTurn = multiplayer ? mySlot === currentTeam : true;

  const draftedIds = multiplayer
    ? room.draftedIds
    : [...teamA, ...teamB].map((p) => p.id);

  const sortedProspects = useMemo(() => {
    return [...initialProspects]
      .filter((p) => !draftedIds.includes(p.id))
      .sort((a, b) => a.projectedRound - b.projectedRound);
  }, [initialProspects, draftedIds]);

  function isDraftable(player: Prospect) {
    if (draftOver) return false;
    if (!startersComplete) return missingPositions.includes(player.position);
    return true;
  }

  async function handleDraftPlayer(player: Prospect) {
    if (draftOver) return;
    if (!isDraftable(player)) return;

    try {
      setPickError("");

      if (multiplayer && roomId) {
        if (!isMyTurn) return;
        await makeDraftPick(roomId, player);
        return;
      }

      const draftedPlayer: DraftedPlayer = {
        ...player,
        overallPick: pickNumber + 1,
      };

      setLocalProspects((prev) => prev.filter((p) => p.id !== player.id));

      if (currentTeam === "A") {
        setLocalTeamA((prev) => [...prev, draftedPlayer]);
      } else {
        setLocalTeamB((prev) => [...prev, draftedPlayer]);
      }

      setLocalPickNumber((prev) => prev + 1);
    } catch (error) {
      console.error(error);
      setPickError("Pick failed. Try again.");
    }
  }

  async function continueToRecap() {
    if (multiplayer && roomId) {
      await updateRoomStatus(roomId, "recap");
      return;
    }

    const recapData = {
      teamAName,
      teamBName,
      teamA,
      teamB,
      fullDraftClass: initialProspects,
      playerAId: null,
      playerBId: null,
      roomId: null,
    };

    localStorage.setItem("moodinDraftRecap", JSON.stringify(recapData));
    router.push("/recap");
  }

  const round = Math.floor(pickNumber / 2) + 1;
  const overallPick = pickNumber + 1;

  return (
    <main className="min-h-screen p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Moodin Draft Board</h1>
        <p className="opacity-70">
          Round {Math.min(round, 12)} • Pick {Math.min(overallPick, 24)} / 24
        </p>

        {!draftOver && (
          <p className="opacity-70">
            Current Turn: {currentTeam === "A" ? teamAName : teamBName}
          </p>
        )}

        {multiplayer && mySlot && (
          <p className="text-sm opacity-70 mt-1">
            You are Team {mySlot} ({mySlot === "A" ? teamAName : teamBName})
          </p>
        )}

        {draftOver && <p className="font-medium">Draft complete</p>}
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold mb-2">{teamAName}</h2>
          <ul className="space-y-1">
            {teamA.map((p) => (
              <li key={p.id}>
                #{p.overallPick} — {p.position} — {p.name}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold mb-2">{teamBName}</h2>
          <ul className="space-y-1">
            {teamB.map((p) => (
              <li key={p.id}>
                #{p.overallPick} — {p.position} — {p.name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!draftOver && !startersComplete && (
        <div className="rounded-lg border p-4 bg-gray-50">
          <p className="font-medium">
            {(currentTeam === "A" ? teamAName : teamBName)} must fill these starter positions first:
          </p>
          <p className="text-sm opacity-70 mt-1">{missingPositions.join(", ")}</p>
        </div>
      )}

      {multiplayer && !isMyTurn && !draftOver && (
        <div className="rounded-lg border p-4 bg-gray-50">
          <p className="text-sm opacity-70">
            Waiting for {currentTeam === "A" ? teamAName : teamBName} to make a pick.
          </p>
        </div>
      )}

      {pickError && (
        <div className="rounded-lg border p-4 bg-red-50 text-red-700">
          {pickError}
        </div>
      )}

      {draftOver && (
        <div className="rounded-lg border p-4 bg-gray-50">
          <p className="font-medium mb-3">Draft complete</p>
          <button
            onClick={continueToRecap}
            className="rounded-md border px-4 py-2 hover:bg-gray-100"
          >
            Continue to Recap
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sortedProspects.map((player) => {
          const draftable = isDraftable(player);
          const disabled = !draftable || (multiplayer && !isMyTurn);

          return (
            <button
              key={player.id}
              onClick={() => handleDraftPlayer(player)}
              disabled={disabled}
              className={`w-full rounded-lg border p-4 text-left transition ${
                disabled
                  ? "cursor-not-allowed opacity-40"
                  : "cursor-pointer hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex min-w-[52px] justify-center rounded-md border px-2 py-1 text-xs font-bold ${getPositionBadgeClass(
                      player.position
                    )}`}
                  >
                    {player.position}
                  </span>

                  <div>
                    <div className="text-lg font-semibold">{player.name}</div>

                    <div className="text-sm opacity-70">
                      {formatHeight(player.height)} | {player.forty} 40
                    </div>

                    <div className="text-sm opacity-70">
                      Archetype: {player.archetype}
                    </div>
                  </div>
                </div>

                <div className="text-sm font-medium">
                  Proj: R{player.projectedRound}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}