"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/room";

export default function Home() {
  const router = useRouter();
  const [onlineTeamName, setOnlineTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateRoom() {
    try {
      setLoading(true);
      setError("");
      const roomId = await createRoom(onlineTeamName || "Team A");
      router.push(`/room/${roomId}`);
    } catch (err) {
      console.error(err);
      setError("Could not create room.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinRoom() {
    try {
      setLoading(true);
      setError("");
      const roomId = joinCode.trim().toUpperCase();
      await joinRoom(roomId, onlineTeamName || "Team B");
      router.push(`/room/${roomId}`);
    } catch (err) {
      console.error(err);
      setError("Could not join room.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col justify-center gap-6 sm:gap-8">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] opacity-60">
            Mobile Draft Arena
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl md:text-5xl">Moodin</h1>
          <p className="mx-auto mt-2 max-w-md text-sm opacity-70 sm:text-base">
            Create a room, send the code, and run the whole draft from your phone.
          </p>
        </div>

        <div className="mx-auto w-full max-w-xl rounded-2xl border p-5 space-y-4 sm:p-6">
          <h2 className="text-xl font-semibold sm:text-2xl">Online 1v1</h2>

          <input
            type="text"
            placeholder="Your team name"
            value={onlineTeamName}
            onChange={(e) => setOnlineTeamName(e.target.value)}
            className="w-full rounded-xl border px-3 py-3 text-base"
          />

          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100"
          >
            Create Room
          </button>

          <div className="border-t pt-4 space-y-4">
            <input
              type="text"
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full rounded-xl border px-3 py-3 text-base uppercase tracking-[0.2em]"
            />

            <button
              onClick={handleJoinRoom}
              disabled={loading}
              className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100"
            >
              Join Room
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </main>
  );
}
