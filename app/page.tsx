"use client";

import Image from "next/image";
import Link from "next/link";
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
      router.replace(`/room/${roomId}`);
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
      router.replace(`/room/${roomId}`);
    } catch (err) {
      console.error(err);
      setError("Could not join room.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8fb] px-4 py-6 text-[#071229] sm:px-6 sm:py-8">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,18,41,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(7,18,41,0.05)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="absolute inset-x-0 top-0 h-36 border-b-4 border-[#c8102e] bg-[#064789]" />
      <div className="absolute inset-x-0 top-36 h-2 bg-[#071229]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center gap-5 sm:gap-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <div className="relative h-40 w-40 sm:h-52 sm:w-52">
            <Image
              src="/moodinlogo.png"
              alt="Moodin football crest"
              fill
              priority
              sizes="(max-width: 640px) 160px, 208px"
              className="object-contain drop-shadow-[0_14px_18px_rgba(7,18,41,0.28)]"
            />
          </div>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.28em] text-[#c8102e]">
            Mobile Draft Arena
          </p>
          <h1 className="mt-2 text-4xl font-black uppercase leading-none sm:text-6xl">
            Draft. Adjust. Win.
          </h1>
          <p className="mt-3 max-w-xl text-base font-medium text-[#30405f] sm:text-lg">
            Build a squad, call your shot, and settle a best-of-3 from your phone.
          </p>
        </div>

        <div className="mx-auto w-full max-w-xl border-2 border-[#071229] bg-white shadow-[8px_8px_0_#071229]">
          <div className="flex items-center justify-between border-b-2 border-[#071229] bg-[#f0f4fa] px-4 py-3 sm:px-5">
            <h2 className="text-xl font-black uppercase tracking-wide sm:text-2xl">
              Online 1v1
            </h2>
            <span className="border border-[#071229] bg-[#c8102e] px-2 py-1 text-xs font-black uppercase tracking-wide text-white">
              Live Room
            </span>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <p className="border-l-4 border-[#c8102e] bg-[#f7f8fb] px-3 py-2 text-sm font-semibold text-[#30405f]">
              One player creates the room. The other joins with their code.
            </p>

            <div className="space-y-3 rounded-xl border-2 border-[#d6deea] bg-[#fbfcfe] p-3 sm:p-4">
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#064789]">
                  Player Name
                </p>
                <p className="text-sm font-medium text-[#50607d]">
                  Enter this first. It is your team name whether you create a room or join one.
                </p>
              </div>
              <input
                type="text"
                placeholder="Your team name"
                value={onlineTeamName}
                onChange={(e) => setOnlineTeamName(e.target.value)}
                className="w-full rounded-lg border-2 border-[#9aa6ba] px-3 py-3 text-base font-semibold outline-none transition focus:border-[#064789] focus:ring-2 focus:ring-[#064789]/20"
              />
            </div>

            <div className="space-y-4 pt-2">
              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="w-full rounded-lg border-2 border-[#071229] bg-[#064789] px-4 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-[#073a70] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create Room
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-[#9aa6ba]" />
                <span className="text-xs font-black uppercase tracking-[0.24em] text-[#62708a]">
                  or
                </span>
                <div className="h-px flex-1 bg-[#9aa6ba]" />
              </div>

              <input
                type="text"
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border-2 border-[#9aa6ba] px-3 py-3 text-base font-black uppercase tracking-[0.2em] outline-none transition focus:border-[#c8102e] focus:ring-2 focus:ring-[#c8102e]/20"
              />

              <button
                onClick={handleJoinRoom}
                disabled={loading}
                className="w-full rounded-lg border-2 border-[#071229] bg-[#c8102e] px-4 py-3 text-base font-black uppercase tracking-wide text-white transition hover:bg-[#a70c25] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Join Room
              </button>
            </div>

            {error && (
              <p className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-xl">
          <div className="space-y-3">
            <Link
              href="/make-it-rain"
              className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-[#071229] bg-[#14532d] px-4 py-4 text-base font-black uppercase tracking-wide text-white transition hover:bg-[#0f4224]"
            >
              💸 Make It Rain
            </Link>
            <Link
              href="/bachelor-party-blitz"
              className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-[#071229] bg-[#071229] px-4 py-4 text-base font-black uppercase tracking-wide text-white transition hover:bg-[#0f2040]"
            >
              🎉 Jimmy&apos;s Bachelor Party Blitz
            </Link>
            <Link
              href="/bachelor-party-blitz?debug=bill"
              className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-[#071229] bg-[#f0f4fa] px-4 py-3 text-sm font-black uppercase tracking-wide text-[#071229] transition hover:bg-[#e1e8f3]"
            >
              TEST BILL MODE
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
