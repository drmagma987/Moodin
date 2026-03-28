"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { getRoomStatusHref, RoomData, setReady, startDraft, subscribeToRoom } from "@/lib/room";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [room, setRoom] = useState<RoomData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startError, setStartError] = useState("");
  const [startingDraft, setStartingDraft] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    let unsub: (() => void) | undefined;

    async function syncRoom() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      unsub = subscribeToRoom(roomId, (nextRoom) => {
        setRoom(nextRoom);
        setLoading(false);
        if (nextRoom && nextRoom.status !== "lobby") {
          router.replace(getRoomStatusHref(nextRoom));
        }
      });
    }

    syncRoom();

    return () => {
      if (unsub) unsub();
    };
  }, [roomId, router]);

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
    if (!room || !mySlot || room.status !== "lobby") return;

    const currentReady = mySlot === "A" ? room.readyA : room.readyB;
    await setReady(room.roomId, mySlot, !currentReady);
  }

  const handleStartDraft = useCallback(async () => {
    if (!room || room.status !== "lobby") return;

    try {
      setStartingDraft(true);
      setStartError("");
      await startDraft(room.roomId);
    } catch (error) {
      console.error(error);
      setStartError("Could not start draft.");
    } finally {
      setStartingDraft(false);
    }
  }, [room]);

  useEffect(() => {
    if (!room || room.status !== "lobby") return;
    if (!isHost || !bothJoined || !bothReady || startingDraft) return;

    handleStartDraft();
  }, [room, isHost, bothJoined, bothReady, startingDraft, handleStartDraft]);

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Loading room...</h1>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Room not found</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Room {room.roomId}</h1>
          <p className="opacity-70">Live lobby</p>
        </div>

        <div className="rounded-2xl border p-4 space-y-3 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm opacity-80">
              Share this room code with your opponent
            </p>
            <span className="rounded-full border px-3 py-1 text-sm font-bold tracking-[0.2em]">
              {room.roomId}
            </span>
          </div>
          <p className="text-sm opacity-80">
            First pick will be randomized as soon as both players are ready.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 sm:gap-6">
          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="text-lg font-semibold sm:text-xl">{room.teamAName || "Team A"}</h2>
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

          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="text-lg font-semibold sm:text-xl">
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

        <div className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur sm:static sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
          <div className="space-y-4 rounded-2xl sm:border sm:p-4">
            {mySlot && (
              <button
                onClick={handleReady}
                className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 sm:w-auto sm:rounded-md sm:py-2"
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

            {!bothJoined && (
              <p className="text-sm opacity-70">Waiting for second player to join.</p>
            )}

            {bothJoined && !bothReady && (
              <p className="text-sm opacity-70">Both players must ready up.</p>
            )}

            {bothJoined && bothReady && (
              <p className="text-sm opacity-70">
                {startingDraft
                  ? "Both players are ready. Starting draft..."
                  : "Both players are ready. Draft is starting automatically..."}
              </p>
            )}

            {startError && <p className="text-sm text-red-600">{startError}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
