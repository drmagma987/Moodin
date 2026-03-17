"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/room";

export default function Home() {
  const router = useRouter();

  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [onlineTeamName, setOnlineTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function startLocalDraft() {
    const teamAName = teamA || "Team A";
    const teamBName = teamB || "Team B";
    const seed = Date.now();

    const params = new URLSearchParams({
      teamA: teamAName,
      teamB: teamBName,
      seed: seed.toString(),
    });

    router.push(`/draft?${params.toString()}`);
  }

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
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Moodin</h1>
        <p className="opacity-70">Draft. Mongies. Forever.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 w-full max-w-4xl">
        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="text-2xl font-semibold">Local Draft</h2>

          <input
            type="text"
            placeholder="Team A name"
            value={teamA}
            onChange={(e) => setTeamA(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />

          <input
            type="text"
            placeholder="Team B name"
            value={teamB}
            onChange={(e) => setTeamB(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />

          <button
            onClick={startLocalDraft}
            className="w-full border rounded-md px-4 py-2 hover:bg-gray-100"
          >
            Start Local Draft
          </button>
        </div>

        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="text-2xl font-semibold">Online 1v1</h2>

          <input
            type="text"
            placeholder="Your team name"
            value={onlineTeamName}
            onChange={(e) => setOnlineTeamName(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />

          <button
            onClick={handleCreateRoom}
            disabled={loading}
            className="w-full border rounded-md px-4 py-2 hover:bg-gray-100"
          >
            Create Room
          </button>

          <div className="border-t pt-4 space-y-4">
            <input
              type="text"
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full border rounded-md px-3 py-2"
            />

            <button
              onClick={handleJoinRoom}
              disabled={loading}
              className="w-full border rounded-md px-4 py-2 hover:bg-gray-100"
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