"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { RoomData, setReady, startDraft, subscribeToRoom } from "@/lib/room";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startError, setStartError] = useState("");

  useEffect(() => {
    if (!roomId) return;

    const unsub = subscribeToRoom(roomId, (nextRoom) => {
      setRoom(nextRoom);
      setLoading(false);

      if (nextRoom?.status === "draft") {
        const search = new URLSearchParams({
          roomId: nextRoom.roomId,
          teamA: nextRoom.teamAName || "Team A",
          teamB: nextRoom.teamBName || "Team B",
          seed: String(nextRoom.seed),
        });

        router.push(`/draft?${search.toString()}`);
      }
    });

    return () => unsub();
  }, [roomId, router]);

  const uid = auth.currentUser?.uid;

  const mySlot = useMemo(() => {
    if (!uid || !room) return null;
    if (room.playerAId === uid) return "A";
    if (room.playerBId === uid) return "B";
    return null;
  }, [uid, room]);

  const isHost = uid === room?.hostId;
  const bothJoined = !!room?.playerAId && !!room?.playerBId;
  const bothReady = !!room?.readyA && !!room?.readyB;

  async function handleReady() {
    if (!room || !mySlot) return;

    const currentReady = mySlot === "A" ? room.readyA : room.readyB;
    await setReady(room.roomId, mySlot, !currentReady);
  }

  async function handleStartDraft() {
    if (!room) return;

    try {
      setStartError("");
      await startDraft(room.roomId);
    } catch (error) {
      console.error(error);
      setStartError("Could not start draft.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-3xl font-bold">Loading room...</h1>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-3xl font-bold">Room not found</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Room {room.roomId}</h1>
        <p className="opacity-70">Live lobby</p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-sm">
          Share this room code with your opponent:{" "}
          <span className="font-bold">{room.roomId}</span>
        </p>
        <p className="text-sm opacity-80">
          First pick will be randomized when the host starts the draft.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold">{room.teamAName || "Team A"}</h2>
          <p className="mt-2 text-sm opacity-80">
            Player A: {room.playerAId ? "Joined" : "Waiting"}
          </p>
          <p className="text-sm opacity-80">
            Ready: {room.readyA ? "Yes" : "No"}
          </p>
          {uid && room.playerAId === uid && (
            <p className="mt-2 text-sm font-medium">You are currently in Slot A</p>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold">
            {room.teamBName || "Waiting for Player B"}
          </h2>
          <p className="mt-2 text-sm opacity-80">
            Player B: {room.playerBId ? "Joined" : "Waiting"}
          </p>
          <p className="text-sm opacity-80">
            Ready: {room.readyB ? "Yes" : "No"}
          </p>
          {uid && room.playerBId === uid && (
            <p className="mt-2 text-sm font-medium">You are currently in Slot B</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        {mySlot && (
          <button
            onClick={handleReady}
            className="rounded-md border px-4 py-2 hover:bg-gray-100"
          >
            {mySlot === "A"
              ? room.readyA
                ? "Unready"
                : "Ready Up"
              : room.readyB
                ? "Unready"
                : "Ready Up"}
          </button>
        )}

        {isHost && bothJoined && bothReady && (
          <button
            onClick={handleStartDraft}
            className="rounded-md border px-4 py-2 hover:bg-gray-100"
          >
            Start Draft
          </button>
        )}

        {!bothJoined && (
          <p className="text-sm opacity-70">Waiting for second player to join.</p>
        )}

        {bothJoined && !bothReady && (
          <p className="text-sm opacity-70">Both players must ready up.</p>
        )}

        {startError && <p className="text-sm text-red-600">{startError}</p>}
      </div>
    </main>
  );
}