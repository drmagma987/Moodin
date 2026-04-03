"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { generateProspects } from "@/lib/game/prospects";
import { getPlayerIQ, getPlayerPower, getPlayerSpeed, getPlayerTechnical, iqLabel } from "@/lib/game/playerRatings";
import { scoutingButtonLabel, scoutingRangeLabel, type ScoutAttribute } from "@/lib/game/scouting";
import type { DraftedPlayer, Position, Prospect } from "@/lib/game/types";
import {
  getCurrentDraftSide,
  getRoomStatusHref,
  makeDraftPick,
  scoutProspect,
  type RoomData,
  subscribeToRoom,
  updateRoomStatus,
} from "@/lib/room";

function formatHeight(inches: number) {
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  return `${feet}'${remainder}"`;
}

function formatWeight(weight: number) {
  return `${weight} lbs`;
}

type TeamNeeds = Record<Position, number>;
type ProspectTag = "gem" | "avoid" | null;
type DraftFilter = "ALL" | "DRAFTABLE" | Position;
const EMPTY_PLAYERS: DraftedPlayer[] = [];

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
const SCOUT_ATTRIBUTES: ScoutAttribute[] = ["speed", "technical", "power"];

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
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "RB":
      return "border-blue-200 bg-blue-100 text-blue-800";
    case "WR":
      return "border-green-200 bg-green-100 text-green-800";
    case "TE":
      return "border-orange-200 bg-orange-100 text-orange-800";
    case "DL":
      return "border-gray-200 bg-gray-100 text-gray-800";
    case "LB":
      return "border-purple-200 bg-purple-100 text-purple-800";
    case "SEC":
      return "border-pink-200 bg-pink-100 text-pink-800";
  }
}

function getProspectCardClass(tag: ProspectTag, disabled: boolean) {
  if (disabled) {
    return "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500 opacity-60";
  }

  if (tag === "gem") {
    return "cursor-pointer border-sky-300 bg-sky-100 text-slate-950 hover:bg-sky-200";
  }

  if (tag === "avoid") {
    return "cursor-pointer border-red-300 bg-red-100 text-slate-950 hover:bg-red-200";
  }

  return "cursor-pointer border-gray-200 bg-white text-slate-950 hover:bg-gray-50";
}

function scarcityTone(count: number) {
  if (count <= 1) return "border-red-200 bg-red-50 text-red-700";
  if (count <= 2) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function rosterLineLabel(player: DraftedPlayer) {
  if (player.acquisitionType === "freeAgency") return "FA";
  if (player.acquisitionType === "keeper") return "Keep";
  return `#${player.overallPick}`;
}

function RosterPanel({
  title,
  players,
  filledCounts,
  showRatings,
}: {
  title: string;
  players: DraftedPlayer[];
  filledCounts: Record<Position, number>;
  showRatings: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 text-slate-950 sm:p-5">
      <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {POSITIONS.map((position) => {
          const needed = STARTER_REQUIREMENTS[position];
          const filled = filledCounts[position];
          const ready = filled >= needed;

          return (
            <span
              key={position}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                ready
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {position} {Math.min(filled, needed)}/{needed}
            </span>
          );
        })}
      </div>
      <div className="mt-4 space-y-2">
        {players.length === 0 ? (
          <p className="text-sm text-gray-600">No players drafted yet.</p>
        ) : (
          players.map((player) => (
            <div key={player.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {player.position} - {player.name}
                  </div>
                  <p className="text-sm text-gray-600">
                    {player.archetype}
                    {showRatings
                      ? ` • SPD ${getPlayerSpeed(player)} • TEC ${getPlayerTechnical(player)} • PWR ${getPlayerPower(player)} • IQ ${iqLabel(getPlayerIQ(player))}`
                      : " • Ratings hidden from opponents"}
                  </p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  {rosterLineLabel(player)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DraftPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomId = searchParams.get("roomId");

  const [room, setRoom] = useState<RoomData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");
  const [prospectTags, setProspectTags] = useState<Record<string, ProspectTag>>({});
  const [draftFilter, setDraftFilter] = useState<DraftFilter>("ALL");
  const [rosterOpen, setRosterOpen] = useState(false);

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

    void setup();

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

  const teamA: DraftedPlayer[] = room?.teamA ?? EMPTY_PLAYERS;
  const teamB: DraftedPlayer[] = room?.teamB ?? EMPTY_PLAYERS;
  const pickNumber = room?.pickNumber ?? 0;
  const totalDraftPicks = room?.totalDraftPicks ?? 24;

  const draftOver = pickNumber >= totalDraftPicks;
  const currentTeam = room ? getCurrentDraftSide(room) : null;
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

  const isMyTurn = !!currentTeam && mySlot === currentTeam;
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

    return lines.slice(0, 3);
  }, [missingPositions, remainingByPosition]);
  const draftablePositionSet = useMemo(
    () => (startersComplete ? null : new Set<Position>(missingPositions)),
    [startersComplete, missingPositions]
  );

  function isDraftable(player: Prospect) {
    if (draftOver) return false;
    if (!startersComplete) return missingPositions.includes(player.position);
    return true;
  }

  const filteredProspects = useMemo(() => {
    return sortedProspects.filter((player) => {
      if (draftFilter === "ALL") return true;
      if (draftFilter === "DRAFTABLE") {
        if (draftOver) return false;
        if (draftablePositionSet) return draftablePositionSet.has(player.position);
        return true;
      }
      return player.position === draftFilter;
    });
  }, [draftFilter, sortedProspects, draftOver, draftablePositionSet]);

  const teamACounts = useMemo(() => countByPosition(teamA), [teamA]);
  const teamBCounts = useMemo(() => countByPosition(teamB), [teamB]);
  const emptyCounts = useMemo(() => countByPosition([]), []);
  const myTeamName = mySlot === "A" ? teamAName : mySlot === "B" ? teamBName : "Your Team";
  const myPlayers = mySlot === "A" ? teamA : mySlot === "B" ? teamB : [];
  const myCounts = mySlot === "A" ? teamACounts : mySlot === "B" ? teamBCounts : emptyCounts;
  const opponentTeamName = mySlot === "A" ? teamBName : teamAName;
  const opponentPlayers = mySlot === "A" ? teamB : teamA;
  const opponentCounts = mySlot === "A" ? teamBCounts : teamACounts;
  const myScouting =
    mySlot === "A" ? room?.scoutingA ?? {} : mySlot === "B" ? room?.scoutingB ?? {} : {};
  const myScoutTokens =
    mySlot === "A" ? room?.scoutTokensA ?? 0 : mySlot === "B" ? room?.scoutTokensB ?? 0 : 0;

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

  async function handleScoutPlayer(playerId: string, attribute: ScoutAttribute) {
    if (!roomId || !mySlot || !room || room.status !== "draft") return;

    try {
      setPickError("");
      await scoutProspect(roomId, mySlot, playerId, attribute);
    } catch (error) {
      console.error(error);
      setPickError("Scouting failed. Try again.");
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
      {rosterOpen && (
        <button
          type="button"
          aria-label="Close roster drawer"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setRosterOpen(false)}
        />
      )}

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6 sm:space-y-8">
          <div
            className={`sticky top-3 z-20 rounded-2xl border px-4 py-4 shadow-sm backdrop-blur ${
              draftOver
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
                : isMyTurn
                  ? "border-sky-200 bg-sky-50/95 text-sky-950"
                  : "border-amber-200 bg-amber-50/95 text-amber-950"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-70">
                  {draftOver ? "Draft Complete" : isMyTurn ? "On The Clock" : "Waiting"}
                </p>
                <p className="mt-1 text-lg font-semibold sm:text-xl">
                  {draftOver
                    ? "Both rosters are set. Move to recap when ready."
                  : isMyTurn
                      ? `You are on the clock for Pick ${Math.min(overallPick, Math.max(totalDraftPicks, 1))}.`
                      : `${currentTeam === "A" ? teamAName : teamBName} is making the next pick.`}
                </p>
                {!draftOver && (
                  <p className="mt-1 text-sm opacity-80">
                    Round {Math.max(1, round)} • Pick {Math.min(overallPick, Math.max(totalDraftPicks, 1))} / {totalDraftPicks}
                  </p>
                )}
                <p className="mt-1 text-sm opacity-80">Scout Tokens: {myScoutTokens}</p>
              </div>
              <button
                type="button"
                onClick={() => setRosterOpen(true)}
                className="rounded-xl border border-current/20 bg-white/70 px-4 py-2 text-sm font-medium lg:hidden"
              >
                View Rosters
              </button>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Moodin Draft Board</h1>
            {room.seriesGameNumber > 1 && (
              <p className="mt-1 text-sm font-medium text-sky-800">
                Retool Draft: fill your starters, then add 2 bench players.
              </p>
            )}
            {mySlot && (
              <p className="mt-1 text-sm opacity-70">
                You are Team {mySlot} ({mySlot === "A" ? teamAName : teamBName})
              </p>
            )}
            {draftOver && <p className="mt-1 font-medium">Draft complete</p>}
          </div>

          {!draftOver && !startersComplete && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="font-medium">
                {(currentTeam === "A" ? teamAName : teamBName)} must fill these starter positions first:
              </p>
              <p className="mt-1 text-sm opacity-80">{missingPositions.join(", ")}</p>
            </div>
          )}

          {!draftOver && boardPressureLines.length > 0 && (
            <div className="rounded-2xl border bg-white p-4 text-slate-950">
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

          {pickError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              {pickError}
            </div>
          )}

          <div className="rounded-2xl border bg-white p-4 text-slate-950 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Board Filters</p>
                <p className="text-sm text-gray-600">
                  Toggle draftable players only or zero in on a position. Scout Tokens: {myScoutTokens}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["ALL", "DRAFTABLE", ...POSITIONS] as DraftFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setDraftFilter(filter)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      draftFilter === filter
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-gray-200 bg-white text-slate-900 hover:bg-gray-50"
                    }`}
                  >
                    {filter === "ALL"
                      ? "All"
                      : filter === "DRAFTABLE"
                        ? "Draftable"
                        : filter}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
            {filteredProspects.map((player) => {
              const draftable = isDraftable(player);
              const disabled = !draftable || !isMyTurn;
              const playerTag = prospectTags[player.id] ?? null;
              const remainingAtPosition = remainingByPosition[player.position] ?? 0;
              const scoutingReport = myScouting[player.id] ?? {};

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
                          {formatHeight(player.height)} • {formatWeight(player.weight)}
                        </div>
                        <div className="text-sm opacity-70">Archetype: {player.archetype}</div>
                        <div className="text-sm opacity-70">
                          40: {player.forty} • Bench: {player.bench} • Vert: {player.vertical}&quot;
                        </div>
                        <div className="text-sm opacity-70">IQ: {iqLabel(getPlayerIQ(player))}</div>
                      </div>
                    </div>

                    <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70 sm:text-right sm:text-sm sm:tracking-normal sm:opacity-100">
                      Proj: R{player.projectedRound}
                      {remainingAtPosition <= 2 && (
                        <div className="mt-1 text-[11px] normal-case tracking-normal text-red-600 sm:text-xs">
                          {remainingAtPosition <= 1
                            ? "Last one at this spot"
                            : `${remainingAtPosition} left at ${player.position}`}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {SCOUT_ATTRIBUTES.map((attribute) => {
                      const range = scoutingReport[attribute];
                      const fullyScouted = range?.level === 2;
                      const scoutDisabled = myScoutTokens <= 0 || fullyScouted || draftOver;

                      return (
                        <button
                          key={attribute}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleScoutPlayer(player.id, attribute);
                          }}
                          disabled={scoutDisabled}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-slate-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="font-medium">
                            {range ? `${scoutingButtonLabel(attribute)} Tighten` : `Scout ${scoutingButtonLabel(attribute)}`}
                          </div>
                          <div className="text-xs opacity-70">{scoutingRangeLabel(attribute, range)}</div>
                        </button>
                      );
                    })}
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
                            ? "border-sky-400 bg-sky-200 text-slate-950"
                            : "border-gray-200 bg-white text-slate-900 hover:bg-gray-100"
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
                            ? "border-red-400 bg-red-200 text-slate-950"
                            : "border-gray-200 bg-white text-slate-900 hover:bg-gray-100"
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

            {filteredProspects.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
                No prospects match this filter right now.
              </div>
            )}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <RosterPanel title={myTeamName} players={myPlayers} filledCounts={myCounts} showRatings />
            <RosterPanel
              title={opponentTeamName}
              players={opponentPlayers}
              filledCounts={opponentCounts}
              showRatings={false}
            />
          </div>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border border-gray-200 bg-white p-4 shadow-2xl transition-transform lg:hidden ${
          rosterOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
            Rosters
          </p>
          <button
            type="button"
            onClick={() => setRosterOpen(false)}
            className="rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-slate-900"
          >
            Close
          </button>
        </div>
        <div className="mx-auto mt-4 max-h-[70vh] max-w-2xl space-y-4 overflow-y-auto pb-4">
          <RosterPanel
            title={teamAName}
            players={teamA}
            filledCounts={teamACounts}
            showRatings={mySlot === "A"}
          />
          <RosterPanel
            title={teamBName}
            players={teamB}
            filledCounts={teamBCounts}
            showRatings={mySlot === "B"}
          />
        </div>
      </div>
    </main>
  );
}

export default function DraftPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto w-full max-w-6xl">
            <h1 className="text-2xl font-bold sm:text-3xl">Moodin Draft Board</h1>
            <p className="mt-4 opacity-70">Loading draft room...</p>
          </div>
        </main>
      }
    >
      <DraftPageContent />
    </Suspense>
  );
}
