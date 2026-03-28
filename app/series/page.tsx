"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import {
  describeNextCareerStage,
  getSeriesPressureMessage,
  retirementGoodbye,
  willRetireAfterGame,
} from "@/lib/series";
import {
  getRoomStatusHref,
  lockKeepers,
  RoomData,
  saveKeeperSelection,
  submitFreeAgencyChoice,
  subscribeToRoom,
} from "@/lib/room";

function cardClasses(selected: boolean, disabled: boolean) {
  if (disabled) {
    return "border-gray-200 bg-gray-50 opacity-60";
  }

  if (selected) {
    return "border-blue-300 bg-blue-50";
  }

  return "border-gray-200 bg-white";
}

export default function SeriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  const [room, setRoom] = useState<RoomData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [selectedFreeAgentId, setSelectedFreeAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let unsub: (() => void) | undefined;

    async function syncRoom() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      unsub = subscribeToRoom(roomId, (nextRoom) => {
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
    if (room.status !== "betweenGames") {
      router.replace(getRoomStatusHref(room));
    }
  }, [roomId, room, router]);

  const mySide = useMemo<"A" | "B" | null>(() => {
    if (!room || !uid) return null;
    if (room.playerAId === uid) return "A";
    if (room.playerBId === uid) return "B";
    return null;
  }, [room, uid]);

  const myTeam = mySide === "A" ? room?.teamA ?? [] : mySide === "B" ? room?.teamB ?? [] : [];
  const myKeepers = mySide === "A" ? room?.keepersA ?? [] : mySide === "B" ? room?.keepersB ?? [] : [];
  const myKeepersLocked =
    mySide === "A" ? room?.keepersLockedA ?? false : mySide === "B" ? room?.keepersLockedB ?? false : false;
  const otherKeepersLocked =
    mySide === "A" ? room?.keepersLockedB ?? false : mySide === "B" ? room?.keepersLockedA ?? false : false;
  const myFreeAgencyLocked =
    mySide === "A" ? room?.freeAgencyLockedA ?? false : mySide === "B" ? room?.freeAgencyLockedB ?? false : false;
  const replacementSide = room?.freeAgencyReplacementSide ?? null;
  const isReplacementSide = !!mySide && replacementSide === mySide;
  const myLockedFreeAgencyChoice =
    mySide === "A" ? room?.freeAgencyChoiceA ?? null : mySide === "B" ? room?.freeAgencyChoiceB ?? null : null;

  useEffect(() => {
    if (!room || !mySide) return;

    if (room.betweenGamePhase === "freeAgency") {
      if (myFreeAgencyLocked) {
        setSelectedFreeAgentId(myLockedFreeAgencyChoice);
      }
      return;
    }

    if (room.betweenGamePhase === "freeAgencyResolution") {
      if (isReplacementSide) {
        if (
          !selectedFreeAgentId ||
          selectedFreeAgentId === room.freeAgencyContestedPlayerId
        ) {
          setSelectedFreeAgentId(null);
        }
      } else {
        setSelectedFreeAgentId(myLockedFreeAgencyChoice);
      }
      return;
    }

    setSelectedFreeAgentId(null);
  }, [
    room,
    mySide,
    myLockedFreeAgencyChoice,
    myFreeAgencyLocked,
    isReplacementSide,
    selectedFreeAgentId,
  ]);

  async function toggleKeeper(playerId: string) {
    if (!roomId || !room || !mySide || myKeepersLocked || room.betweenGamePhase !== "keepers") {
      return;
    }

    const nextKeepers = myKeepers.includes(playerId)
      ? myKeepers.filter((keeperId) => keeperId !== playerId)
      : myKeepers.length >= 2
        ? [...myKeepers.slice(1), playerId]
        : [...myKeepers, playerId];

    try {
      setActionError("");
      await saveKeeperSelection(roomId, mySide, nextKeepers);
    } catch (error) {
      console.error(error);
      setActionError("Could not update keepers.");
    }
  }

  async function handleLockKeepers() {
    if (!roomId || !mySide || myKeepers.length !== 2 || myKeepersLocked) return;

    try {
      setLoadingAction(true);
      setActionError("");
      await lockKeepers(roomId, mySide);
    } catch (error) {
      console.error(error);
      setActionError("Could not lock keepers.");
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleLockFreeAgent() {
    if (!roomId || !room || !mySide || !selectedFreeAgentId) return;

    try {
      setLoadingAction(true);
      setActionError("");
      await submitFreeAgencyChoice(roomId, mySide, selectedFreeAgentId);
    } catch (error) {
      console.error(error);
      setActionError("Could not submit free agency choice.");
    } finally {
      setLoadingAction(false);
    }
  }

  if (!roomId) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Run It Back</h1>
          <p className="mt-4 opacity-70">This page requires a multiplayer room.</p>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Run It Back</h1>
          <p className="mt-4 opacity-70">Loading between-games flow...</p>
        </div>
      </main>
    );
  }

  const availableReplacementPool = room.freeAgencyPool.filter(
    (player) => player.id !== room.freeAgencyContestedPlayerId
  );
  const retiringPlayers = myTeam.filter((player) => willRetireAfterGame(player));
  const seriesPressureMessage = getSeriesPressureMessage({
    seriesGameNumber: room.seriesGameNumber,
    seriesWinsA: room.seriesWinsA,
    seriesWinsB: room.seriesWinsB,
    teamAName: room.teamAName,
    teamBName: room.teamBName,
  });

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Run It Back</h1>
          <p className="mt-1 text-sm opacity-70 sm:text-base">
            Game {room.seriesGameNumber} complete. Series score: {room.teamAName} {room.seriesWinsA} - {room.seriesWinsB} {room.teamBName}
          </p>
          <p className="mt-1 text-sm font-medium">{seriesPressureMessage}</p>
        </div>

        {room.betweenGamePhase === "keepers" && (
          <>
            <div className="rounded-2xl border p-4 sm:p-5">
              <h2 className="text-xl font-semibold sm:text-2xl">Choose 2 Keepers</h2>
              <p className="mt-1 text-sm opacity-70">
                Lock exactly 2 players to carry into Game {room.seriesGameNumber + 1}.
              </p>
              {retiringPlayers.length > 0 && (
                <p className="mt-2 text-sm opacity-70">
                  Players in their `Unc` year retire after this game and cannot be kept.
                </p>
              )}
            </div>

            {retiringPlayers.length > 0 && (
              <div className="rounded-2xl border p-4 sm:p-5">
                <h3 className="text-lg font-semibold sm:text-xl">Retirement Summary</h3>
                <div className="mt-3 space-y-3">
                  {retiringPlayers.map((player) => (
                    <div key={player.id} className="rounded-xl border p-3">
                      <p className="font-medium">
                        {player.position} — {player.name}
                      </p>
                      <p className="mt-1 text-sm opacity-70">
                        {retirementGoodbye(player)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {myTeam.map((player) => {
                const selected = myKeepers.includes(player.id);
                const retiring = willRetireAfterGame(player);
                const disabled = myKeepersLocked || retiring;

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => void toggleKeeper(player.id)}
                    disabled={disabled}
                    className={`w-full rounded-2xl border p-4 text-left ${cardClasses(
                      selected,
                      disabled
                    )}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {player.position} — {player.name}
                        </div>
                        <div className="text-sm opacity-80">
                          {player.archetype} • {player.careerStage ?? "Rook"}
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {retiring ? "Retiring" : selected ? "Selected" : "Tap to keep"}
                      </div>
                    </div>
                    <p className="mt-2 text-sm opacity-70">
                      Next game: {describeNextCareerStage(player)}
                    </p>
                    {retiring && (
                      <p className="mt-2 text-sm text-amber-700">
                        Final season completed. This player retires before the next game.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur">
              <p className="mb-3 text-sm opacity-70">
                {myKeepersLocked
                  ? otherKeepersLocked
                    ? "Both players locked keepers. Opening free agency..."
                    : "Waiting for opponent to lock keepers..."
                  : `Selected ${myKeepers.length} of 2 keepers.`}
              </p>
              <button
                type="button"
                onClick={handleLockKeepers}
                disabled={myKeepersLocked || myKeepers.length !== 2 || loadingAction}
                className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
              >
                {myKeepersLocked ? "Keepers Locked" : loadingAction ? "Locking..." : "Lock Keepers"}
              </button>
            </div>
          </>
        )}

        {room.betweenGamePhase === "freeAgency" && (
          <>
            <div className="rounded-2xl border p-4 sm:p-5">
              <h2 className="text-xl font-semibold sm:text-2xl">Free Agency</h2>
              <p className="mt-1 text-sm opacity-70">
                Secretly choose 1 target. If you clash, the room will resolve it automatically.
              </p>
              <p className="mt-2 text-sm font-medium">
                One contested signing can swing the next game.
              </p>
            </div>

            <div className="space-y-3">
              {room.freeAgencyPool.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedFreeAgentId(player.id)}
                  disabled={myFreeAgencyLocked}
                  className={`w-full rounded-2xl border p-4 text-left ${cardClasses(
                    selectedFreeAgentId === player.id,
                    myFreeAgencyLocked
                  )}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {player.position} — {player.name}
                      </div>
                      <div className="text-sm opacity-80">
                        {player.archetype} • {player.careerStage ?? "Prime"}
                      </div>
                    </div>
                    <div className="text-sm font-medium opacity-70">
                      {player.freeAgencyTag}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur">
              <p className="mb-3 text-sm opacity-70">
                {myFreeAgencyLocked
                  ? `Your choice is locked in${myLockedFreeAgencyChoice ? "." : ""} Waiting for the other player...`
                  : "Pick your target, then lock it in."}
              </p>
              {myFreeAgencyLocked && myLockedFreeAgencyChoice && (
                <p className="mb-3 text-sm opacity-70">
                  Locked target:{" "}
                  {room.freeAgencyPool.find((player) => player.id === myLockedFreeAgencyChoice)?.name ??
                    "Selected free agent"}
                </p>
              )}
              <button
                type="button"
                onClick={handleLockFreeAgent}
                disabled={!selectedFreeAgentId || myFreeAgencyLocked || loadingAction}
                className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
              >
                {myFreeAgencyLocked ? "Free Agent Locked" : loadingAction ? "Locking..." : "Lock Free Agent"}
              </button>
            </div>
          </>
        )}

        {room.betweenGamePhase === "freeAgencyResolution" && (
          <>
            <div className="rounded-2xl border p-4 sm:p-5">
              <h2 className="text-xl font-semibold sm:text-2xl">Free Agency Resolution</h2>
              <p className="mt-1 text-sm opacity-70">{room.freeAgencyResolutionText}</p>
              {room.freeAgencyAwardedSide && room.freeAgencyContestedPlayerId && (
                <p className="mt-2 text-sm opacity-70">
                  {room.freeAgencyAwardedSide === mySide
                    ? "You won the contested signing."
                    : "Your opponent won the contested signing."}
                </p>
              )}
              <p className="mt-2 text-sm font-medium">
                {room.freeAgencyAwardedSide === mySide
                  ? "You landed the player both coaches wanted."
                  : "The board broke against you. Answer with the replacement pick."}
              </p>
            </div>

            {isReplacementSide ? (
              <>
                <p className="text-sm opacity-70">
                  You must choose a replacement FA.
                </p>

                <div className="space-y-3">
                  {availableReplacementPool.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelectedFreeAgentId(player.id)}
                      className={`w-full rounded-2xl border p-4 text-left ${cardClasses(
                        selectedFreeAgentId === player.id,
                        false
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {player.position} — {player.name}
                          </div>
                          <div className="text-sm opacity-80">
                            {player.archetype} • {player.careerStage ?? "Prime"}
                          </div>
                        </div>
                        <div className="text-sm font-medium opacity-70">
                          {player.freeAgencyTag}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur">
                  <p className="mb-3 text-sm opacity-70">
                    {room.seriesWinsA === room.seriesWinsB
                      ? "You received a consolation pick."
                      : "Game 1 loser had priority, so you need a new target."}
                  </p>
                  <p className="mb-3 text-sm opacity-70">
                    Choose any remaining free agent except the contested signing.
                  </p>
                  <button
                    type="button"
                    onClick={handleLockFreeAgent}
                    disabled={!selectedFreeAgentId || loadingAction}
                    className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
                  >
                    {loadingAction ? "Submitting..." : "Lock Replacement FA"}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border p-4 sm:p-5">
                <p className="text-sm opacity-70">Waiting for the other player to choose a replacement FA...</p>
              </div>
            )}
          </>
        )}

        {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      </div>
    </main>
  );
}
