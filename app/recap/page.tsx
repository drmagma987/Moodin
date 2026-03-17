"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { generateProspects } from "@/lib/game/prospects";
import type { DraftedPlayer, Prospect } from "@/lib/game/types";
import { RoomData, saveSimResult, saveTeamStrategy, subscribeToRoom, updateRoomStatus } from "@/lib/room";
import { GameSetup, simulateGame, TeamRatings } from "@/lib/sim";

type DraftRecapData = {
  teamAName: string;
  teamBName: string;
  teamA: DraftedPlayer[];
  teamB: DraftedPlayer[];
  fullDraftClass: Prospect[];
  playerAId: string | null;
  playerBId: string | null;
  roomId: string | null;
};

function speedFromForty(forty: number) {
  const minForty = 4.2;
  const maxForty = 5.1;
  const clamped = Math.max(minForty, Math.min(maxForty, forty));
  return Math.round(((maxForty - clamped) / (maxForty - minForty)) * 100);
}

function technicalFromPlayer(player: DraftedPlayer) {
  const base = player.trueGrade;

  const archetypeBonus =
    player.archetype === "Field General" ||
    player.archetype === "Route Technician" ||
    player.archetype === "Possession TE" ||
    player.archetype === "Coverage LB" ||
    player.archetype === "Lockdown"
      ? 3
      : player.archetype === "Gunslinger" ||
        player.archetype === "Deep Threat" ||
        player.archetype === "Vertical Threat" ||
        player.archetype === "Pass Rusher" ||
        player.archetype === "Ball Hawk"
      ? 1
      : 0;

  return Math.max(45, Math.min(95, Math.round(base + archetypeBonus)));
}

function expectedGradeForRound(projectedRound: number) {
  return 88 - (projectedRound - 1) * 2.5;
}

function getProjectionOutcomeLabel(player: DraftedPlayer) {
  const delta = player.trueGrade - expectedGradeForRound(player.projectedRound);

  if (delta >= 6) return `High for R${player.projectedRound}`;
  if (delta >= 2) return `Solid for R${player.projectedRound}`;
  if (delta >= -2) return `Mid for R${player.projectedRound}`;
  if (delta >= -6) return `Low for R${player.projectedRound}`;
  return `Very low for R${player.projectedRound}`;
}

function getClassRank(player: DraftedPlayer, fullDraftClass: Prospect[]) {
  const sorted = [...fullDraftClass].sort((a, b) => b.trueGrade - a.trueGrade);
  return sorted.findIndex((p) => p.id === player.id) + 1;
}

function getDraftValueDelta(player: DraftedPlayer, fullDraftClass: Prospect[]) {
  const classRank = getClassRank(player, fullDraftClass);
  return player.overallPick - classRank;
}

function getDraftValueLabel(player: DraftedPlayer, fullDraftClass: Prospect[]) {
  const valueDelta = getDraftValueDelta(player, fullDraftClass);

  if (valueDelta >= 10) return `Huge steal at Pick ${player.overallPick}`;
  if (valueDelta >= 5) return `Good value at Pick ${player.overallPick}`;
  if (valueDelta >= 1) return `Fair value at Pick ${player.overallPick}`;
  if (valueDelta >= -4) return `Slight reach at Pick ${player.overallPick}`;
  return `Big reach at Pick ${player.overallPick}`;
}

function gradeFromTeam(players: DraftedPlayer[]) {
  const avgTrueGrade =
    players.reduce((sum, p) => sum + p.trueGrade, 0) / Math.max(players.length, 1);

  const score = avgTrueGrade;

  if (score >= 90) return "A+";
  if (score >= 87) return "A";
  if (score >= 84) return "A-";
  if (score >= 81) return "B+";
  if (score >= 78) return "B";
  if (score >= 75) return "B-";
  if (score >= 72) return "C+";
  if (score >= 69) return "C";
  if (score >= 66) return "C-";
  if (score >= 63) return "D+";
  if (score >= 60) return "D";
  if (score >= 57) return "D-";
  return "F";
}

function biggestSteal(players: DraftedPlayer[], fullDraftClass: Prospect[]) {
  return [...players].sort(
    (a, b) =>
      getDraftValueDelta(b, fullDraftClass) -
      getDraftValueDelta(a, fullDraftClass)
  )[0];
}

function biggestBust(players: DraftedPlayer[], fullDraftClass: Prospect[]) {
  return [...players].sort(
    (a, b) =>
      getDraftValueDelta(a, fullDraftClass) -
      getDraftValueDelta(b, fullDraftClass)
  )[0];
}

function avgRating(players: DraftedPlayer[], filter: (p: DraftedPlayer) => boolean) {
  const filtered = players.filter(filter);
  if (filtered.length === 0) return 50;

  const total = filtered.reduce((sum, p) => {
    return sum + Math.round((speedFromForty(p.forty) + technicalFromPlayer(p)) / 2);
  }, 0);

  return Math.round(total / filtered.length);
}

function buildRatings(players: DraftedPlayer[]): TeamRatings {
  return {
    pass: avgRating(players, (p) =>
      p.position === "QB" || p.position === "WR" || p.position === "TE"
    ),
    run: avgRating(players, (p) => p.position === "RB" || p.position === "QB"),
    bigPlay: avgRating(players, (p) =>
      p.position === "WR" || p.position === "RB" || p.position === "QB"
    ),
    ballSecurity: avgRating(players, (p) =>
      p.position === "QB" || p.position === "RB" || p.position === "TE"
    ),
    passD: avgRating(players, (p) => p.position === "LB" || p.position === "SEC"),
    runD: avgRating(players, (p) => p.position === "DL" || p.position === "LB"),
    pressure: avgRating(players, (p) => p.position === "DL"),
    takeaways: avgRating(players, (p) => p.position === "SEC" || p.position === "LB"),
  };
}

export default function RecapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [localData, setLocalData] = useState<DraftRecapData | null>(null);

  const [teamAOffenseStrategy, setTeamAOffenseStrategy] = useState("Balanced");
  const [teamADefenseStrategy, setTeamADefenseStrategy] = useState("Balanced");
  const [teamBOffenseStrategy, setTeamBOffenseStrategy] = useState("Balanced");
  const [teamBDefenseStrategy, setTeamBDefenseStrategy] = useState("Balanced");

  const multiplayer = !!roomId;

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      if (roomId) {
        unsub = subscribeToRoom(roomId, (nextRoom) => {
          setRoom(nextRoom);

          if (nextRoom?.status === "results") {
            router.push(`/results?roomId=${nextRoom.roomId}`);
          }
        });
      } else {
        const raw = localStorage.getItem("moodinDraftRecap");
        if (!raw) return;
        setLocalData(JSON.parse(raw));
      }
    }

    init();

    return () => {
      if (unsub) unsub();
    };
  }, [roomId, router]);

  useEffect(() => {
    if (!room) return;
    setTeamAOffenseStrategy(room.teamAStrategy.offense);
    setTeamADefenseStrategy(room.teamAStrategy.defense);
    setTeamBOffenseStrategy(room.teamBStrategy.offense);
    setTeamBDefenseStrategy(room.teamBStrategy.defense);
  }, [room]);

  const data = useMemo(() => {
    if (multiplayer) {
      if (!room) return null;

      return {
        teamAName: room.teamAName,
        teamBName: room.teamBName,
        teamA: room.teamA,
        teamB: room.teamB,
        fullDraftClass: generateProspects(room.seed),
        playerAId: room.playerAId,
        playerBId: room.playerBId,
        roomId: room.roomId,
      } satisfies DraftRecapData;
    }

    return localData;
  }, [multiplayer, room, localData]);

  const teamARatings = useMemo<TeamRatings | null>(() => {
    if (!data) return null;
    return buildRatings(data.teamA);
  }, [data]);

  const teamBRatings = useMemo<TeamRatings | null>(() => {
    if (!data) return null;
    return buildRatings(data.teamB);
  }, [data]);

  const mySide = useMemo<"A" | "B" | null>(() => {
    if (!data || !uid) return null;
    if (data.playerAId === uid) return "A";
    if (data.playerBId === uid) return "B";
    if (!multiplayer) return "A";
    return null;
  }, [data, uid, multiplayer]);

  const myTeam = mySide === "A" ? data?.teamA : mySide === "B" ? data?.teamB : null;
  const myTeamName =
    mySide === "A" ? data?.teamAName : mySide === "B" ? data?.teamBName : null;
  const myRatings =
    mySide === "A" ? teamARatings : mySide === "B" ? teamBRatings : null;

  async function lockStrategy() {
    if (!data || !teamARatings || !teamBRatings) return;

    if (multiplayer && roomId && mySide) {
      const offense =
        mySide === "A" ? teamAOffenseStrategy : teamBOffenseStrategy;
      const defense =
        mySide === "A" ? teamADefenseStrategy : teamBDefenseStrategy;

      await saveTeamStrategy(roomId, mySide, offense, defense, true);
      return;
    }

    const gameSetup: GameSetup = {
      teamAName: data.teamAName,
      teamBName: data.teamBName,
      teamA: data.teamA,
      teamB: data.teamB,
      teamARatings,
      teamBRatings,
      teamAStrategy: {
        offense: teamAOffenseStrategy,
        defense: teamADefenseStrategy,
      },
      teamBStrategy: {
        offense: teamBOffenseStrategy,
        defense: teamBDefenseStrategy,
      },
      simSeed: Date.now(),
    };

    localStorage.setItem("moodinGameSetup", JSON.stringify(gameSetup));
    router.push("/results");
  }

  useEffect(() => {
    async function maybeStartSim() {
      if (!multiplayer || !roomId || !room || !teamARatings || !teamBRatings) return;
      if (room.status !== "recap") return;
      if (!room.teamAStrategy.locked || !room.teamBStrategy.locked) return;
      if (room.simResult) return;
      if (uid !== room.hostId) return;

      const gameSetup: GameSetup = {
        teamAName: room.teamAName,
        teamBName: room.teamBName,
        teamA: room.teamA,
        teamB: room.teamB,
        teamARatings,
        teamBRatings,
        teamAStrategy: {
          offense: room.teamAStrategy.offense,
          defense: room.teamAStrategy.defense,
        },
        teamBStrategy: {
          offense: room.teamBStrategy.offense,
          defense: room.teamBStrategy.defense,
        },
        simSeed: Date.now(),
      };

      const result = simulateGame(gameSetup);
      await saveSimResult(roomId, result);
      await updateRoomStatus(roomId, "results");
    }

    maybeStartSim();
  }, [multiplayer, roomId, room, teamARatings, teamBRatings, uid]);

  if (!data) {
    return (
      <main className="min-h-screen p-8">
        <h1 className="text-3xl font-bold">Draft Recap</h1>
        <p className="mt-4 opacity-70">No draft data found yet. Complete a draft first.</p>
      </main>
    );
  }

  const teamAGrade = gradeFromTeam(data.teamA);
  const teamBGrade = gradeFromTeam(data.teamB);

  const teamASteal = biggestSteal(data.teamA, data.fullDraftClass);
  const teamABust = biggestBust(data.teamA, data.fullDraftClass);
  const teamBSteal = biggestSteal(data.teamB, data.fullDraftClass);
  const teamBBust = biggestBust(data.teamB, data.fullDraftClass);

  return (
    <main className="min-h-screen p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Draft Recap</h1>
        <p className="opacity-70 mt-1">Post-draft summary and game setup</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold">
            {data.teamAName} — {teamAGrade}
          </h2>
          <p className="mt-3 text-sm">
            Biggest Steal: {teamASteal.position} — {teamASteal.name}
          </p>
          <p className="text-sm opacity-80">
            {getDraftValueLabel(teamASteal, data.fullDraftClass)}
          </p>
          <p className="mt-3 text-sm">
            Biggest Bust: {teamABust.position} — {teamABust.name}
          </p>
          <p className="text-sm opacity-80">
            {getDraftValueLabel(teamABust, data.fullDraftClass)}
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold">
            {data.teamBName} — {teamBGrade}
          </h2>
          <p className="mt-3 text-sm">
            Biggest Steal: {teamBSteal.position} — {teamBSteal.name}
          </p>
          <p className="text-sm opacity-80">
            {getDraftValueLabel(teamBSteal, data.fullDraftClass)}
          </p>
          <p className="mt-3 text-sm">
            Biggest Bust: {teamBBust.position} — {teamBBust.name}
          </p>
          <p className="text-sm opacity-80">
            {getDraftValueLabel(teamBBust, data.fullDraftClass)}
          </p>
        </div>
      </div>

      {myTeam && myTeamName && (
        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="text-2xl font-semibold">Your Team Breakdown — {myTeamName}</h2>

          <div className="space-y-3">
            {myTeam.map((player) => (
              <div key={player.id} className="rounded-md border p-3">
                <div className="font-medium">
                  #{player.overallPick} — {player.position} — {player.name}
                </div>
                <div className="text-sm opacity-80">
                  Archetype: {player.archetype} • Proj. R{player.projectedRound}
                </div>
                <div className="text-sm">Speed: {speedFromForty(player.forty)}</div>
                <div className="text-sm">Technical: {technicalFromPlayer(player)}</div>
                <div className="text-sm">
                  Projection Outcome: {getProjectionOutcomeLabel(player)}
                </div>
                <div className="text-sm">
                  Draft Value: {getDraftValueLabel(player, data.fullDraftClass)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myRatings && myTeamName && (
        <div className="rounded-lg border p-4">
          <h2 className="text-xl font-semibold mb-3">{myTeamName} Ratings</h2>
          <ul className="space-y-2 text-sm">
            <li>Pass: {myRatings.pass}</li>
            <li>Run: {myRatings.run}</li>
            <li>Big Play: {myRatings.bigPlay}</li>
            <li>Ball Security: {myRatings.ballSecurity}</li>
            <li>Pass D: {myRatings.passD}</li>
            <li>Run D: {myRatings.runD}</li>
            <li>Pressure: {myRatings.pressure}</li>
            <li>Takeaways: {myRatings.takeaways}</li>
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="text-2xl font-semibold">{data.teamAName} Game Plan</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Offense Strategy</label>
            <select
              value={teamAOffenseStrategy}
              onChange={(e) => setTeamAOffenseStrategy(e.target.value)}
              disabled={multiplayer && mySide !== "A"}
              className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
            >
              <option>Balanced</option>
              <option>Pass Heavy</option>
              <option>Run Heavy</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Defense Strategy</label>
            <select
              value={teamADefenseStrategy}
              onChange={(e) => setTeamADefenseStrategy(e.target.value)}
              disabled={multiplayer && mySide !== "A"}
              className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
            >
              <option>Balanced</option>
              <option>Pressure</option>
              <option>Coverage</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="text-2xl font-semibold">{data.teamBName} Game Plan</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Offense Strategy</label>
            <select
              value={teamBOffenseStrategy}
              onChange={(e) => setTeamBOffenseStrategy(e.target.value)}
              disabled={multiplayer && mySide !== "B"}
              className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
            >
              <option>Balanced</option>
              <option>Pass Heavy</option>
              <option>Run Heavy</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Defense Strategy</label>
            <select
              value={teamBDefenseStrategy}
              onChange={(e) => setTeamBDefenseStrategy(e.target.value)}
              disabled={multiplayer && mySide !== "B"}
              className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
            >
              <option>Balanced</option>
              <option>Pressure</option>
              <option>Coverage</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <button
          type="button"
          onClick={lockStrategy}
          className="rounded-md border px-4 py-2 hover:bg-gray-100"
        >
          {multiplayer ? "Lock My Strategy" : "Lock Strategy"}
        </button>
      </div>
    </main>
  );
}