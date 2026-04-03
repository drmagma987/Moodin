"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RoomSyncNotice } from "@/components/room-sync-notice";
import { auth, ensureAnonymousAuth } from "@/lib/firebase";
import { generateProspects } from "@/lib/game/prospects";
import type { ScoutAttribute, ScoutingMap } from "@/lib/game/scouting";
import type { DraftedPlayer, Prospect } from "@/lib/game/types";
import { getPlayerIQ, getPlayerPower, getPlayerSpeed, getPlayerTechnical, iqLabel } from "@/lib/game/playerRatings";
import {
  finalizeSeriesGame,
  getRoomStatusHref,
  RoomData,
  saveTeamStrategy,
  subscribeToRoom,
} from "@/lib/room";
import { GameSetup, simulateGame, TeamRatings } from "@/lib/sim";

function expectedGradeForRound(
  projectedRound: number,
  fullDraftClass: Prospect[]
) {
  const playersInRound = fullDraftClass.filter(
    (player) => player.projectedRound === projectedRound
  );

  if (playersInRound.length === 0) return 70;

  return (
    playersInRound.reduce((sum, player) => sum + player.trueGrade, 0) /
    playersInRound.length
  );
}

function getProjectionOutcomeLabel(
  player: DraftedPlayer,
  fullDraftClass: Prospect[]
) {
  if (player.acquisitionType && player.acquisitionType !== "draft") {
    return "Series carryover";
  }

  const delta =
    player.trueGrade - expectedGradeForRound(player.projectedRound, fullDraftClass);

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
  if (player.acquisitionType && player.acquisitionType !== "draft") {
    return player.acquisitionType === "keeper" ? "Kept for this game" : "Signed in free agency";
  }

  const valueDelta = getDraftValueDelta(player, fullDraftClass);

  if (valueDelta >= 10) return `Huge steal at Pick ${player.overallPick}`;
  if (valueDelta >= 5) return `Good value at Pick ${player.overallPick}`;
  if (valueDelta >= 1) return `Fair value at Pick ${player.overallPick}`;
  if (valueDelta >= -4) return `Slight reach at Pick ${player.overallPick}`;
  return `Big reach at Pick ${player.overallPick}`;
}

function scoutingAttributeLabel(attribute: ScoutAttribute) {
  switch (attribute) {
    case "speed":
      return "speed";
    case "technical":
      return "technical profile";
    case "power":
      return "power";
  }
}

function scoutingPayoffNote(
  player: DraftedPlayer,
  fullDraftClass: Prospect[],
  scoutingMap: ScoutingMap,
  currentSeed: number
) {
  if ((player.acquisitionType ?? "draft") !== "draft") return null;
  if (player.seriesSourceSeed !== currentSeed) return null;

  const report = scoutingMap[player.id];
  if (!report) return null;

  const valueDelta = getDraftValueDelta(player, fullDraftClass);
  const scoutedAttributes = (Object.keys(report) as ScoutAttribute[]).filter(
    (attribute) => report[attribute]
  );

  if (scoutedAttributes.length === 0) return null;

  const attributeScore = (attribute: ScoutAttribute) => {
    switch (attribute) {
      case "speed":
        return getPlayerSpeed(player);
      case "technical":
        return getPlayerTechnical(player);
      case "power":
        return getPlayerPower(player);
    }
  };

  if (valueDelta >= 5) {
    const standoutAttribute = [...scoutedAttributes]
      .sort((a, b) => attributeScore(b) - attributeScore(a))
      .find((attribute) => attributeScore(attribute) >= 82);

    if (standoutAttribute) {
      return `Scout hit: you sniffed out real ${scoutingAttributeLabel(
        standoutAttribute
      )} upside before the room let him turn into a steal.`;
    }
  }

  if (valueDelta <= -5) {
    const weakAttribute = [...scoutedAttributes]
      .sort((a, b) => attributeScore(a) - attributeScore(b))
      .find((attribute) => attributeScore(attribute) <= 74);

    if (weakAttribute) {
      return `Scout hit: your report hinted at shaky ${scoutingAttributeLabel(
        weakAttribute
      )}, and he still turned into a reach.`;
    }
  }

  return null;
}

function getClassRankComparisonLabel(
  player: DraftedPlayer,
  fullDraftClass: Prospect[]
) {
  if (player.acquisitionType && player.acquisitionType !== "draft") {
    return "Carried over from the previous game.";
  }

  const classRank = getClassRank(player, fullDraftClass);
  const pickDelta = getDraftValueDelta(player, fullDraftClass);
  const difference = Math.abs(pickDelta);

  if (pickDelta > 0) {
    return `Class rank #${classRank}, taken ${difference} picks later than that slot.`;
  }

  if (pickDelta < 0) {
    return `Class rank #${classRank}, taken ${difference} picks earlier than that slot.`;
  }

  return `Class rank #${classRank}, taken exactly where he ranked.`;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function playerSkillScore(
  player: DraftedPlayer,
  weights: {
    speed?: number;
    technical?: number;
    power?: number;
    iq?: number;
    trueGrade?: number;
  }
) {
  const speed = getPlayerSpeed(player);
  const technical = getPlayerTechnical(player);
  const power = getPlayerPower(player);
  const iq = getPlayerIQ(player);
  const trueGrade = player.trueGrade;

  return (
    speed * (weights.speed ?? 0) +
    technical * (weights.technical ?? 0) +
    power * (weights.power ?? 0) +
    iq * (weights.iq ?? 0) +
    trueGrade * (weights.trueGrade ?? 0)
  );
}

function rankedScores(
  players: DraftedPlayer[],
  position: DraftedPlayer["position"],
  count: number,
  weights: {
    speed?: number;
    technical?: number;
    power?: number;
    iq?: number;
    trueGrade?: number;
  }
) {
  return [...players]
    .filter((player) => player.position === position)
    .sort((a, b) => b.trueGrade - a.trueGrade)
    .slice(0, count)
    .map((player) => playerSkillScore(player, weights));
}

function weightedAverage(values: number[], weights: number[]) {
  if (values.length === 0) return 50;

  const appliedWeights = values.map((_, index) => weights[index] ?? weights[weights.length - 1] ?? 1);
  const totalWeight = appliedWeights.reduce((sum, weight) => sum + weight, 0);
  const weightedTotal = values.reduce(
    (sum, value, index) => sum + value * appliedWeights[index],
    0
  );

  return weightedTotal / totalWeight;
}

function stretchTeamRating(raw: number) {
  const centered = 70 + (raw - 70) * 1.35;
  return clamp(Math.round(centered), 45, 99);
}

function tunedRating(raw: number, offset = 0) {
  return stretchTeamRating(raw + offset);
}

function buildRatings(players: DraftedPlayer[]): TeamRatings {
  const qbPass = weightedAverage(
    rankedScores(players, "QB", 1, { technical: 0.3, iq: 0.35, trueGrade: 0.15, speed: 0.2 }),
    [1]
  );
  const wrPass = weightedAverage(
    rankedScores(players, "WR", 2, { technical: 0.28, iq: 0.18, trueGrade: 0.16, speed: 0.38 }),
    [1, 0.7]
  );
  const tePass = weightedAverage(
    rankedScores(players, "TE", 1, { technical: 0.26, iq: 0.22, power: 0.24, trueGrade: 0.14, speed: 0.14 }),
    [1]
  );
  const teBlock = weightedAverage(
    rankedScores(players, "TE", 1, { power: 0.45, technical: 0.2, iq: 0.2, trueGrade: 0.15 }),
    [1]
  );
  const rbRun = weightedAverage(
    rankedScores(players, "RB", 1, { technical: 0.18, iq: 0.18, power: 0.3, trueGrade: 0.12, speed: 0.22 }),
    [1]
  );
  const rbSecurity = weightedAverage(
    rankedScores(players, "RB", 1, { technical: 0.28, iq: 0.28, power: 0.2, trueGrade: 0.14, speed: 0.1 }),
    [1]
  );
  const qbRun = weightedAverage(
    rankedScores(players, "QB", 1, { technical: 0.12, iq: 0.16, power: 0.08, trueGrade: 0.12, speed: 0.52 }),
    [1]
  );
  const secCoverage = weightedAverage(
    rankedScores(players, "SEC", 2, { technical: 0.22, iq: 0.38, trueGrade: 0.14, speed: 0.26 }),
    [1, 0.75]
  );
  const lbDefense = weightedAverage(
    rankedScores(players, "LB", 2, { technical: 0.2, iq: 0.28, power: 0.24, trueGrade: 0.14, speed: 0.14 }),
    [1, 0.75]
  );
  const dlDefense = weightedAverage(
    rankedScores(players, "DL", 2, { technical: 0.18, iq: 0.18, power: 0.4, trueGrade: 0.16, speed: 0.08 }),
    [1, 0.7]
  );
  const frontSeven = weightedAverage([dlDefense, lbDefense], [1, 0.95]);
  const passGame = weightedAverage([qbPass, wrPass, tePass], [1, 0.85, 0.45]);
  const runGame = weightedAverage([rbRun, qbRun, teBlock], [1, 0.45, 0.55]);

  return {
    pass: tunedRating(passGame, -2),
    run: tunedRating(runGame, 3),
    bigPlay: tunedRating(weightedAverage([wrPass, qbRun, rbRun], [1, 0.7, 0.55]), -3),
    ballSecurity: tunedRating(weightedAverage([qbPass, rbSecurity, tePass], [1, 0.7, 0.35]), 2),
    passD: tunedRating(weightedAverage([secCoverage, lbDefense, dlDefense], [1, 0.55, 0.3]), -1),
    runD: tunedRating(weightedAverage([frontSeven, teBlock], [1, 0.15]), 4),
    pressure: tunedRating(weightedAverage([dlDefense, lbDefense], [1, 0.7]), 3),
    takeaways: tunedRating(weightedAverage([secCoverage, lbDefense, dlDefense], [0.75, 0.65, 0.45]), -2),
  };
}

function strategyStatusClasses(locked: boolean) {
  return locked
    ? "border-green-200 bg-green-50 text-green-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function HiddenStrategyState({ locked }: { locked: boolean }) {
  return (
    <div className="rounded-xl border bg-gray-50 p-3 text-sm opacity-80">
      {locked ? "Locked. Hidden until kickoff." : "Waiting on this coach to lock a strategy."}
    </div>
  );
}

function RecapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");

  const [uid, setUid] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);

  const [teamAOffenseStrategy, setTeamAOffenseStrategy] = useState<string | null>(null);
  const [teamADefenseStrategy, setTeamADefenseStrategy] = useState<string | null>(null);
  const [teamBOffenseStrategy, setTeamBOffenseStrategy] = useState<string | null>(null);
  const [teamBDefenseStrategy, setTeamBDefenseStrategy] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      await ensureAnonymousAuth();
      setUid(auth.currentUser?.uid ?? null);

      if (!roomId) return;

      unsub = subscribeToRoom(roomId, (nextRoom) => {
        setRoom(nextRoom);
      });
    }

    init();

    return () => {
      if (unsub) unsub();
    };
  }, [roomId, router]);

  useEffect(() => {
    if (!roomId || !room) return;
    if (room.status !== "recap") {
      router.replace(getRoomStatusHref(room));
    }
  }, [roomId, room, router]);

  const data = useMemo(() => {
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
    };
  }, [room]);

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
    return null;
  }, [data, uid]);

  const myTeam = mySide === "A" ? data?.teamA : mySide === "B" ? data?.teamB : null;
  const myTeamName =
    mySide === "A" ? data?.teamAName : mySide === "B" ? data?.teamBName : null;
  const myScouting = mySide === "A" ? room?.scoutingA ?? {} : mySide === "B" ? room?.scoutingB ?? {} : {};
  const myRatings =
    mySide === "A" ? teamARatings : mySide === "B" ? teamBRatings : null;
  const selectedTeamAOffense = teamAOffenseStrategy ?? room?.teamAStrategy.offense ?? "Balanced";
  const selectedTeamADefense = teamADefenseStrategy ?? room?.teamAStrategy.defense ?? "Balanced";
  const selectedTeamBOffense = teamBOffenseStrategy ?? room?.teamBStrategy.offense ?? "Balanced";
  const selectedTeamBDefense = teamBDefenseStrategy ?? room?.teamBStrategy.defense ?? "Balanced";
  const teamALocked = room?.teamAStrategy.locked ?? false;
  const teamBLocked = room?.teamBStrategy.locked ?? false;
  const myStrategyLocked =
    mySide === "A" ? teamALocked : mySide === "B" ? teamBLocked : false;
  const otherStrategyLocked =
    mySide === "A" ? teamBLocked : mySide === "B" ? teamALocked : false;
  const bothStrategiesLocked = teamALocked && teamBLocked;
  const isHost = uid === room?.hostId;

  async function lockStrategy() {
    if (
      !roomId ||
      !room ||
      room.status !== "recap" ||
      !data ||
      !teamARatings ||
      !teamBRatings ||
      !mySide ||
      myStrategyLocked
    ) {
      return;
    }

    const offense =
      mySide === "A" ? selectedTeamAOffense : selectedTeamBOffense;
    const defense =
      mySide === "A" ? selectedTeamADefense : selectedTeamBDefense;

    await saveTeamStrategy(roomId, mySide, offense, defense, true);
  }

  useEffect(() => {
    async function maybeStartSim() {
      if (!roomId || !room || !teamARatings || !teamBRatings) return;
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
      await finalizeSeriesGame(roomId, result);
    }

    maybeStartSim();
  }, [roomId, room, teamARatings, teamBRatings, uid]);

  if (!roomId) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Draft Recap</h1>
          <p className="mt-4 opacity-70">This page now requires a multiplayer room.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-2xl font-bold sm:text-3xl">Draft Recap</h1>
          <p className="mt-4 opacity-70">No draft data found yet. Complete a draft first.</p>
        </div>
      </main>
    );
  }

  const currentDraftTeamA = data.teamA.filter(
    (player) => (player.acquisitionType ?? "draft") === "draft" && player.seriesSourceSeed === room?.seed
  );
  const currentDraftTeamB = data.teamB.filter(
    (player) => (player.acquisitionType ?? "draft") === "draft" && player.seriesSourceSeed === room?.seed
  );
  const teamAGrade = gradeFromTeam(data.teamA);
  const teamBGrade = gradeFromTeam(data.teamB);

  const teamASteal =
    currentDraftTeamA.length > 0 ? biggestSteal(currentDraftTeamA, data.fullDraftClass) : null;
  const teamABust =
    currentDraftTeamA.length > 0 ? biggestBust(currentDraftTeamA, data.fullDraftClass) : null;
  const teamBSteal =
    currentDraftTeamB.length > 0 ? biggestSteal(currentDraftTeamB, data.fullDraftClass) : null;
  const teamBBust =
    currentDraftTeamB.length > 0 ? biggestBust(currentDraftTeamB, data.fullDraftClass) : null;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Draft Recap</h1>
          <p className="mt-1 opacity-70">Post-draft summary and game setup</p>
        </div>

        {room && <RoomSyncNotice roomId={room.roomId} phaseLabel="recap" />}

        <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="text-lg font-semibold sm:text-xl">
              {data.teamAName} — {teamAGrade}
            </h2>
            {teamASteal && teamABust ? (
              <>
                <p className="mt-3 text-sm">
                  Biggest Steal: {teamASteal.position} — {teamASteal.name}
                </p>
                <p className="text-sm opacity-80">
                  {getDraftValueLabel(teamASteal, data.fullDraftClass)}
                </p>
                <p className="text-sm opacity-70">
                  {getClassRankComparisonLabel(teamASteal, data.fullDraftClass)}
                </p>
                <p className="mt-3 text-sm">
                  Biggest Bust: {teamABust.position} — {teamABust.name}
                </p>
                <p className="text-sm opacity-80">
                  {getDraftValueLabel(teamABust, data.fullDraftClass)}
                </p>
                <p className="text-sm opacity-70">
                  {getClassRankComparisonLabel(teamABust, data.fullDraftClass)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm opacity-70">Carryover-heavy roster. No fresh draft value notes yet.</p>
            )}
          </div>

          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="text-lg font-semibold sm:text-xl">
              {data.teamBName} — {teamBGrade}
            </h2>
            {teamBSteal && teamBBust ? (
              <>
                <p className="mt-3 text-sm">
                  Biggest Steal: {teamBSteal.position} — {teamBSteal.name}
                </p>
                <p className="text-sm opacity-80">
                  {getDraftValueLabel(teamBSteal, data.fullDraftClass)}
                </p>
                <p className="text-sm opacity-70">
                  {getClassRankComparisonLabel(teamBSteal, data.fullDraftClass)}
                </p>
                <p className="mt-3 text-sm">
                  Biggest Bust: {teamBBust.position} — {teamBBust.name}
                </p>
                <p className="text-sm opacity-80">
                  {getDraftValueLabel(teamBBust, data.fullDraftClass)}
                </p>
                <p className="text-sm opacity-70">
                  {getClassRankComparisonLabel(teamBBust, data.fullDraftClass)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm opacity-70">Carryover-heavy roster. No fresh draft value notes yet.</p>
            )}
          </div>
        </div>

        {myTeam && myTeamName && (
          <div className="rounded-2xl border p-4 space-y-4 sm:p-5">
            <h2 className="text-xl font-semibold sm:text-2xl">Your Team Breakdown — {myTeamName}</h2>

            <div className="space-y-3">
              {myTeam.map((player) => (
                (() => {
                  const scoutingNote = scoutingPayoffNote(
                    player,
                    data.fullDraftClass,
                    myScouting,
                    room?.seed ?? 0
                  );

                  return (
                    <div key={player.id} className="rounded-xl border p-3">
                      <div className="font-medium">
                        #{player.overallPick} — {player.position} — {player.name}
                      </div>
                      <div className="text-sm opacity-80">
                        Archetype: {player.archetype} • {player.careerStage ?? "Rook"}
                      </div>
                      <div className="text-sm">Speed: {getPlayerSpeed(player)}</div>
                      <div className="text-sm">Technical: {getPlayerTechnical(player)}</div>
                      <div className="text-sm">Power: {getPlayerPower(player)}</div>
                      <div className="text-sm">IQ: {iqLabel(getPlayerIQ(player))}</div>
                      <div className="text-sm">
                        Projection Outcome: {getProjectionOutcomeLabel(player, data.fullDraftClass)}
                      </div>
                      <div className="text-sm">
                        Draft Value: {getDraftValueLabel(player, data.fullDraftClass)}
                      </div>
                      {scoutingNote && <div className="text-sm text-sky-800">{scoutingNote}</div>}
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        )}

        {myRatings && myTeamName && (
          <div className="rounded-2xl border p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold sm:text-xl">{myTeamName} Ratings</h2>
            <div className="grid gap-4 text-sm sm:grid-cols-2 sm:gap-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] opacity-70">
                  Offense
                </h3>
                <ul className="space-y-2">
                  <li>Pass: {myRatings.pass}</li>
                  <li>Run: {myRatings.run}</li>
                  <li>Explosiveness: {myRatings.bigPlay}</li>
                  <li>Ball Security: {myRatings.ballSecurity}</li>
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] opacity-70">
                  Defense
                </h3>
                <ul className="space-y-2">
                  <li>Pass D: {myRatings.passD}</li>
                  <li>Run D: {myRatings.runD}</li>
                  <li>Pressure: {myRatings.pressure}</li>
                  <li>Takeaways: {myRatings.takeaways}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2 sm:gap-6">
          <div className="rounded-2xl border p-4 space-y-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold sm:text-2xl">{data.teamAName} Game Plan</h2>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${strategyStatusClasses(
                  teamALocked
                )}`}
              >
                {teamALocked ? "Locked" : "Waiting"}
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Offense Strategy</label>
              {mySide === "A" ? (
                <select
                  value={selectedTeamAOffense}
                  onChange={(e) => setTeamAOffenseStrategy(e.target.value)}
                  disabled={teamALocked}
                  className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                >
                  <option>Balanced</option>
                  <option>Pass Heavy</option>
                  <option>Run Heavy</option>
                </select>
              ) : (
                <HiddenStrategyState locked={teamALocked} />
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Defense Strategy</label>
              {mySide === "A" ? (
                <select
                  value={selectedTeamADefense}
                  onChange={(e) => setTeamADefenseStrategy(e.target.value)}
                  disabled={teamALocked}
                  className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                >
                  <option>Balanced</option>
                  <option>Pressure</option>
                  <option>Coverage</option>
                </select>
              ) : (
                <HiddenStrategyState locked={teamALocked} />
              )}
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold sm:text-2xl">{data.teamBName} Game Plan</h2>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${strategyStatusClasses(
                  teamBLocked
                )}`}
              >
                {teamBLocked ? "Locked" : "Waiting"}
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Offense Strategy</label>
              {mySide === "B" ? (
                <select
                  value={selectedTeamBOffense}
                  onChange={(e) => setTeamBOffenseStrategy(e.target.value)}
                  disabled={teamBLocked}
                  className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                >
                  <option>Balanced</option>
                  <option>Pass Heavy</option>
                  <option>Run Heavy</option>
                </select>
              ) : (
                <HiddenStrategyState locked={teamBLocked} />
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Defense Strategy</label>
              {mySide === "B" ? (
                <select
                  value={selectedTeamBDefense}
                  onChange={(e) => setTeamBDefenseStrategy(e.target.value)}
                  disabled={teamBLocked}
                  className="w-full rounded-xl border px-3 py-3 disabled:opacity-50 sm:rounded-md sm:py-2"
                >
                  <option>Balanced</option>
                  <option>Pressure</option>
                  <option>Coverage</option>
                </select>
              ) : (
                <HiddenStrategyState locked={teamBLocked} />
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-3 z-10 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur">
          <p className="mb-3 text-sm opacity-70">
            {!mySide
              ? "Waiting for player assignment."
              : bothStrategiesLocked
                ? room?.simResult
                  ? "Both strategies are locked. Moving to results..."
                  : isHost
                    ? "Both strategies are locked. Simulating game..."
                    : "Both strategies are locked. Waiting for simulation..."
                : myStrategyLocked
                  ? otherStrategyLocked
                    ? "Both strategies are locked. Preparing results..."
                    : "Your strategy is locked. Waiting for the other player..."
                  : "Choose your plan and lock it when you're ready."}
          </p>
          <button
            type="button"
            onClick={lockStrategy}
            disabled={!mySide || myStrategyLocked || bothStrategiesLocked}
            className="w-full rounded-xl border px-4 py-3 font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-md sm:py-2"
          >
            {myStrategyLocked ? "Strategy Locked" : "Lock My Strategy"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-8 sm:px-6 sm:py-10"><div className="mx-auto w-full max-w-6xl"><h1 className="text-2xl font-bold sm:text-3xl">Draft Recap</h1><p className="mt-4 opacity-70">Loading draft recap...</p></div></main>}>
      <RecapPageContent />
    </Suspense>
  );
}
