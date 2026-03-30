"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { generateProspects } from "@/lib/game/prospects";
import type { DraftedPlayer, Position, Prospect } from "@/lib/game/types";
import {
  getRoomStatusHref,
  makeDraftPick,
  RoomData,
  subscribeToRoom,
  updateRoomStatus,
} from "@/lib/room";

function formatHeight(inches: number) {
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

function currentPicker2P(pickNumber: number, firstSide: "A" | "B"): "A" | "B" {
  const round = Math.floor(pickNumber / 2) + 1;
  const pickInRound = pickNumber % 2;

  if (round % 2 === 1) {
    return pickInRound === 0 ? firstSide : firstSide === "A" ? "B" : "A";
  }

  return pickInRound === 0 ? (firstSide === "A" ? "B" : "A") : firstSide;
}

type TeamNeeds = Record<Position, number>;
type ProspectTag = "gem" | "avoid" | null;

const STARTER_REQUIREMENTS: TeamNeeds = {
  QB: 1,
  RB: 1,
  WR: 2,
  TE: 1,
  DL: 1,
  LB: 1,
  SEC: 1,
};

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "DL", "LB", "SEC"];

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

function getProspectCardClass(tag: ProspectTag, disabled: boolean) {
  if (disabled) {
    return "cursor-not-allowed opacity-40";
  }

  if (tag === "gem") {
    return "cursor-pointer border-sky-200 bg-sky-50 hover:bg-sky-100";
  }

  if (tag === "avoid") {
    return "cursor-pointer border-red-200 bg-red-50 hover:bg-red-100";
  }

  return "cursor-pointer hover:bg-gray-50";
}

function scarcityTone(count: number) {
  if (count <= 1) return "border-red-200 bg-red-50 text-red-700";
  if (count <= 2) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function DraftPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomId = searchParams.get("roomId");

  const [room, setRoom] = useState<RoomData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");
  const [prospectTags, setProspectTags] = useState<Record<string, ProspectTag>>({});

  useEffect(() => {
    if (!roomId) return;

    const currentRoomId = roomId;
    let unsub: (() => void) | undefined;

    async function setup() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      unsub = subscribeToRoom(currentRoomId, (nextRoom) => {
        setRoom(nextRoom);
        if (nextRoom && nextRoom.status !== "draft") {
          router.replace(getRoomStatusHref(nextRoom));
        }
      });
    }

    setup();

    return () => {
      if (unsub) unsub();
    };
  }, [roomId, router]);

  const teamAName = room?.teamAName || "Team A";
  const teamBName = room?.teamBName || "Team B";
  const seed = room?.seed ?? null;
  const prospects = useMemo(() => {
    if (seed === null) return [];
    return generateProspects(seed);
  }, [seed]);

  const teamA: DraftedPlayer[] = room?.teamA ?? [];
  const teamB: DraftedPlayer[] = room?.teamB ?? [];
  const pickNumber = room?.pickNumber ?? 0;
  const totalDraftPicks = room?.totalDraftPicks ?? 24;
  const draftFirstSide = room?.draftFirstSide ?? "A";

  const draftOver = pickNumber >= totalDraftPicks;
  const currentTeam = currentPicker2P(pickNumber, draftFirstSide);
  const turnRoster = currentTeam === "A" ? teamA : teamB;
  const missingPositions = getMissingStarterPositions(turnRoster);
  const startersComplete = missingPositions.length === 0;

  const mySlot =
    uid && room
      ? room.playerAId === uid
        ? "A"
        : room.playerBId === uid
          ? "B"
          : null
      : null;

  const isMyTurn = mySlot === currentTeam;
  const sortedProspects = useMemo(() => {
    const draftedIds = room?.draftedIds ?? [];

    return [...prospects]
      .filter((p) => !draftedIds.includes(p.id))
      .sort((a, b) => a.projectedRound - b.projectedRound);
  }, [prospects, room?.draftedIds]);
  const remainingByPosition = useMemo(() => {
    return POSITIONS.reduce<Record<Position, number>>((counts, position) => {
      counts[position] = sortedProspects.filter((player) => player.position === position).length;
      return counts;
    }, {} as Record<Position, number>);
  }, [sortedProspects]);
  const premiumByPosition = useMemo(() => {
    return POSITIONS.reduce<Record<Position, number>>((counts, position) => {
      counts[position] = sortedProspects.filter(
        (player) => player.position === position && player.projectedRound <= 4
      ).length;
      return counts;
    }, {} as Record<Position, number>);
  }, [sortedProspects]);
  const boardPressureLines = useMemo(() => {
    const lines: string[] = [];

    for (const position of missingPositions) {
      const remaining = remainingByPosition[position] ?? 0;
      if (remaining <= 1) {
        lines.push(`${position} is down to the last real option.`);
      } else if (remaining <= 2) {
        lines.push(`${position} is getting thin fast with only ${remaining} left.`);
      }
    }

    const premiumRuns = POSITIONS
      .filter((position) => (premiumByPosition[position] ?? 0) <= 1)
      .sort((a, b) => (remainingByPosition[a] ?? 0) - (remainingByPosition[b] ?? 0));

    for (const position of premiumRuns) {
      if (lines.length >= 3) break;
      if (!lines.some((line) => line.includes(position))) {
        const premiumLeft = premiumByPosition[position] ?? 0;
        if (premiumLeft === 0) {
          lines.push(`The premium ${position} tier is gone. This is a gamble now.`);
        } else {
          lines.push(`Only 1 premium ${position} remains on the board.`);
        }
      }
    }

    return lines.slice(0, 3);
  }, [missingPositions, premiumByPosition, remainingByPosition]);

  function isDraftable(player: Prospect) {
    if (draftOver) return false;
    if (!startersComplete) return missingPositions.includes(player.position);
    return true;
  }

  async function handleDraftPlayer(player: Prospect) {
    if (!roomId || !room || room.status !== "draft" || draftOver) return;
    if (!isDraftable(player)) return;

    try {
      setPickError("");
      if (!isMyTurn) return;
      await makeDraftPick(roomId, player);
    } catch (error) {
      console.error(error);
      setPickError("Pick failed. Try again.");
    }
  }

  async function continueToRecap() {
    if (!roomId || !room || room.status !== "draft" || !draftOver) return;
    await updateRoomStatus(roomId, "recap");
  }

  const round = Math.floor(pickNumber / 2) + 1;
  const overallPick = pickNumber + 1;

  function toggleProspectTag(playerId: string, tag: Exclude<ProspectTag, null>) {
    setProspectTags((prev) => ({
      ...prev,
      [playerId]: prev[playerId] === tag ? null : tag,
    }));
  }

  if (!roomId) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Moodin Draft Board</h1>
          <p className="mt-4 opacity-70">This page now requires a multiplayer room.</p>
        </div>
      </main>
    );
  }

  if (!room || seed === null) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Moodin Draft Board</h1>
          <p className="mt-4 opacity-70">Loading draft room...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Moodin Draft Board</h1>
          <p className="opacity-70">
            Round {Math.max(1, round)} • Pick {Math.min(overallPick, Math.max(totalDraftPicks, 1))} / {totalDraftPicks}
          </p>

          {!draftOver && (
            <p className="opacity-70">
              Current Turn: {currentTeam === "A" ? teamAName : teamBName}
            </p>
          )}

          {mySlot && (
            <p className="mt-1 text-sm opacity-70">
              You are Team {mySlot} ({mySlot === "A" ? teamAName : teamBName})
            </p>
          )}

          {draftOver && <p className="font-medium">Draft complete</p>}
        </div>

        <div className="grid gap-4 xl:grid-cols-2 sm:gap-6">
          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="mb-2 text-lg font-semibold sm:text-xl">{teamAName}</h2>
            <ul className="space-y-1 text-sm sm:text-base">
              {teamA.map((p) => (
                <li key={p.id}>
                  {p.acquisitionType !== "draft" ? "Carryover" : `#${p.overallPick}`} — {p.position} — {p.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="mb-2 text-lg font-semibold sm:text-xl">{teamBName}</h2>
            <ul className="space-y-1 text-sm sm:text-base">
              {teamB.map((p) => (
                <li key={p.id}>
                  {p.acquisitionType !== "draft" ? "Carryover" : `#${p.overallPick}`} — {p.position} — {p.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {!draftOver && !startersComplete && (
          <div className="rounded-2xl border p-4 bg-gray-50">
            <p className="font-medium">
              {(currentTeam === "A" ? teamAName : teamBName)} must fill these starter positions first:
            </p>
            <p className="mt-1 text-sm opacity-70">{missingPositions.join(", ")}</p>
          </div>
        )}

        {!draftOver && boardPressureLines.length > 0 && (
          <div className="rounded-2xl border p-4">
            <p className="font-medium">Board Pressure</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {POSITIONS.map((position) => (
                <span
                  key={position}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${scarcityTone(
                    remainingByPosition[position] ?? 0
                  )}`}
                >
                  {position}: {remainingByPosition[position] ?? 0} left
                </span>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-sm opacity-80">
              {boardPressureLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {!isMyTurn && !draftOver && (
          <div className="rounded-2xl border p-4 bg-gray-50">
            <p className="text-sm opacity-70">
              Waiting for {currentTeam === "A" ? teamAName : teamBName} to make a pick.
            </p>
          </div>
        )}

        {pickError && (
          <div className="rounded-2xl border p-4 bg-red-50 text-red-700">
            {pickError}
          </div>
        )}

        {draftOver && (
          <div className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur">
            <p className="mb-3 font-medium">Draft complete</p>
            <button
              onClick={continueToRecap}
              className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 sm:w-auto sm:rounded-md sm:py-2"
            >
              Continue to Recap
            </button>
          </div>
        )}

        <div className="space-y-2 sm:space-y-3">
          {sortedProspects.map((player) => {
            const draftable = isDraftable(player);
            const disabled = !draftable || !isMyTurn;
            const playerTag = prospectTags[player.id] ?? null;
            const remainingAtPosition = remainingByPosition[player.position] ?? 0;
            const premiumAtPosition = premiumByPosition[player.position] ?? 0;

            return (
              <div
                key={player.id}
                onClick={() => {
                  if (!disabled) {
                    void handleDraftPlayer(player);
                  }
                }}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void handleDraftPlayer(player);
                  }
                }}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                className={`w-full rounded-2xl border p-3 text-left transition sm:p-4 ${
                  getProspectCardClass(playerTag, disabled)
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex min-w-[48px] justify-center rounded-md border px-2 py-1 text-[11px] font-bold sm:min-w-[52px] sm:text-xs ${getPositionBadgeClass(
                        player.position
                      )}`}
                    >
                      {player.position}
                    </span>

                    <div>
                      <div className="text-base font-semibold sm:text-lg">{player.name}</div>

                      <div className="text-sm opacity-70">
                        {formatHeight(player.height)} | {player.forty} 40
                      </div>

                      <div className="text-sm opacity-70">
                        Archetype: {player.archetype}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70 sm:text-right sm:text-sm sm:tracking-normal sm:opacity-100">
                    Proj: R{player.projectedRound}
                    {(remainingAtPosition <= 2 || premiumAtPosition <= 1) && (
                      <div className="mt-1 text-[11px] normal-case tracking-normal text-red-600 sm:text-xs">
                        {remainingAtPosition <= 1
                          ? "Last one at this spot"
                          : premiumAtPosition === 0
                            ? "Premium tier gone after this"
                            : premiumAtPosition === 1
                              ? "Last premium option"
                              : `${remainingAtPosition} left at ${player.position}`}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleProspectTag(player.id, "gem");
                      }}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        playerTag === "gem"
                          ? "border-sky-300 bg-sky-100"
                          : "hover:bg-gray-100"
                      }`}
                      aria-pressed={playerTag === "gem"}
                    >
                      💎
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleProspectTag(player.id, "avoid");
                      }}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        playerTag === "avoid"
                          ? "border-red-300 bg-red-100"
                          : "hover:bg-gray-100"
                      }`}
                      aria-pressed={playerTag === "avoid"}
                    >
                      ❌
                    </button>
                  </div>

                  {playerTag && (
                    <span className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
                      {playerTag === "gem" ? "Targeted" : "Avoid"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function DraftPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10"><div className="mx-auto w-full max-w-6xl"><h1 className="text-2xl font-bold sm:text-3xl">Moodin Draft Board</h1><p className="mt-4 opacity-70">Loading draft room...</p></div></main>}>
      <DraftPageContent />
    </Suspense>
  );
}
