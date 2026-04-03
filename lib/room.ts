import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db, ensureAnonymousAuth } from "./firebase";
import type { DraftedPlayer, Position, Prospect } from "./game/types";
import { generateProspects } from "./game/prospects";
import type { ScoutAttribute, ScoutingMap } from "./game/scouting";
import { buildScoutingRange } from "./game/scouting";
import { agePlayerForSeries, buildFreeAgencyPool, willRetireAfterGame } from "./series";
import type { SimResult } from "./sim";

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

export type RoomStatus = "lobby" | "draft" | "recap" | "results" | "betweenGames";
export type BetweenGamePhase =
  | "none"
  | "keepers"
  | "freeAgency"
  | "freeAgencyResolution";

export type RoomData = {
  roomId: string;
  status: RoomStatus;
  seed: number;
  hostId: string;
  createdAt: unknown;

  teamAName: string;
  teamBName: string;

  playerAId: string | null;
  playerBId: string | null;

  readyA: boolean;
  readyB: boolean;

  draftFirstSide: "A" | "B";
  totalDraftPicks: number;
  pickNumber: number;
  draftedIds: string[];
  teamA: DraftedPlayer[];
  teamB: DraftedPlayer[];

  teamAStrategy: {
    offense: string;
    defense: string;
    locked: boolean;
  };

  teamBStrategy: {
    offense: string;
    defense: string;
    locked: boolean;
  };

  simResult: SimResult | null;

  seriesGameNumber: number;
  seriesWinsA: number;
  seriesWinsB: number;
  seriesWinner: "A" | "B" | null;
  seriesLastProcessedGame: number;

  betweenGamePhase: BetweenGamePhase;
  keepersA: string[];
  keepersB: string[];
  keepersLockedA: boolean;
  keepersLockedB: boolean;
  carriedPlayersA: DraftedPlayer[];
  carriedPlayersB: DraftedPlayer[];
  freeAgencyPool: DraftedPlayer[];
  freeAgencyChoiceA: string | null;
  freeAgencyChoiceB: string | null;
  freeAgencyLockedA: boolean;
  freeAgencyLockedB: boolean;
  freeAgencyResolved: boolean;
  freeAgencyReplacementSide: "A" | "B" | null;
  freeAgencyAwardedSide: "A" | "B" | null;
  freeAgencyContestedPlayerId: string | null;
  freeAgencyResolutionText: string;

  scoutTokensA: number;
  scoutTokensB: number;
  scoutingA: ScoutingMap;
  scoutingB: ScoutingMap;

  rematchAcceptedA: boolean;
  rematchAcceptedB: boolean;
};

const FULL_DRAFT_PICKS = 24;
const LATER_GAME_ROSTER_TARGET = 10;
const KEEPER_COUNT = 3;
const SCOUT_TOKENS_FULL_DRAFT = 8;
const SCOUT_TOKENS_RETOOL_DRAFT = 5;
const STARTER_REQUIREMENTS: Record<Position, number> = {
  QB: 1,
  RB: 1,
  WR: 2,
  TE: 1,
  DL: 1,
  LB: 1,
  SEC: 1,
};

function emptyBetweenGameState() {
  return {
    betweenGamePhase: "none" as const,
    keepersA: [] as string[],
    keepersB: [] as string[],
    keepersLockedA: false,
    keepersLockedB: false,
    carriedPlayersA: [] as DraftedPlayer[],
    carriedPlayersB: [] as DraftedPlayer[],
    freeAgencyPool: [] as DraftedPlayer[],
    freeAgencyChoiceA: null as string | null,
    freeAgencyChoiceB: null as string | null,
    freeAgencyLockedA: false,
    freeAgencyLockedB: false,
    freeAgencyResolved: false,
    freeAgencyReplacementSide: null as "A" | "B" | null,
    freeAgencyAwardedSide: null as "A" | "B" | null,
    freeAgencyContestedPlayerId: null as string | null,
    freeAgencyResolutionText: "",
  };
}

function scoutTokensForGame(seriesGameNumber: number) {
  return seriesGameNumber <= 1 ? SCOUT_TOKENS_FULL_DRAFT : SCOUT_TOKENS_RETOOL_DRAFT;
}

function emptyScoutingState(seriesGameNumber: number) {
  const tokenCount = scoutTokensForGame(seriesGameNumber);
  return {
    scoutTokensA: tokenCount,
    scoutTokensB: tokenCount,
    scoutingA: {} as ScoutingMap,
    scoutingB: {} as ScoutingMap,
  };
}

function createFreshSeriesState() {
  return {
    seriesGameNumber: 1,
    seriesWinsA: 0,
    seriesWinsB: 0,
    seriesWinner: null as "A" | "B" | null,
    seriesLastProcessedGame: 0,
    ...emptyBetweenGameState(),
    rematchAcceptedA: false,
    rematchAcceptedB: false,
  };
}

export function getRoomStatusHref(room: Pick<RoomData, "roomId" | "status">) {
  switch (room.status) {
    case "lobby":
      return `/room/${room.roomId}`;
    case "draft":
      return `/draft?roomId=${room.roomId}`;
    case "recap":
      return `/recap?roomId=${room.roomId}`;
    case "results":
      return `/results?roomId=${room.roomId}`;
    case "betweenGames":
      return `/series?roomId=${room.roomId}`;
  }
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function randomFirstSide() {
  return Math.random() < 0.5 ? "A" : "B";
}

function currentPicker2P(pickNumber: number, firstSide: "A" | "B"): "A" | "B" {
  const round = Math.floor(pickNumber / 2) + 1;
  const pickInRound = pickNumber % 2;

  if (round % 2 === 1) {
    return pickInRound === 0 ? firstSide : firstSide === "A" ? "B" : "A";
  }

  return pickInRound === 0 ? (firstSide === "A" ? "B" : "A") : firstSide;
}

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

function startersFilled(players: DraftedPlayer[]) {
  const counts = countByPosition(players);
  return (Object.keys(STARTER_REQUIREMENTS) as Position[]).every(
    (position) => counts[position] >= STARTER_REQUIREMENTS[position]
  );
}

function missingStarterPositions(players: DraftedPlayer[]) {
  const counts = countByPosition(players);
  return (Object.keys(STARTER_REQUIREMENTS) as Position[]).filter(
    (position) => counts[position] < STARTER_REQUIREMENTS[position]
  );
}

export function isRetoolRosterComplete(players: DraftedPlayer[]) {
  return players.length >= LATER_GAME_ROSTER_TARGET && startersFilled(players);
}

function isRetoolDraft(room: Pick<RoomData, "seriesGameNumber">) {
  return room.seriesGameNumber > 1;
}

export function getCurrentDraftSide(
  room: Pick<RoomData, "pickNumber" | "draftFirstSide" | "seriesGameNumber" | "teamA" | "teamB">
): "A" | "B" | null {
  const baseSide = currentPicker2P(room.pickNumber, room.draftFirstSide ?? "A");

  if (!isRetoolDraft(room)) {
    return baseSide;
  }

  const teamAReady = isRetoolRosterComplete(room.teamA);
  const teamBReady = isRetoolRosterComplete(room.teamB);

  if (teamAReady && teamBReady) return null;
  if (teamAReady) return "B";
  if (teamBReady) return "A";
  return baseSide;
}

function resetStrategyState() {
  return {
    teamAStrategy: {
      offense: "Balanced",
      defense: "Balanced",
      locked: false,
    },
    teamBStrategy: {
      offense: "Balanced",
      defense: "Balanced",
      locked: false,
    },
  };
}

function buildDraftReset(
  room: RoomData,
  options?: {
    carriedPlayersA?: DraftedPlayer[];
    carriedPlayersB?: DraftedPlayer[];
    seriesGameNumber?: number;
    resetSeries?: boolean;
  }
) {
  if (!room.playerAId || !room.playerBId) {
    throw new Error("Both players must be in the room for a draft reset");
  }

  const carriedPlayersA = options?.carriedPlayersA ?? [];
  const carriedPlayersB = options?.carriedPlayersB ?? [];
  const nextSeriesGameNumber = options?.resetSeries
    ? 1
    : options?.seriesGameNumber ?? room.seriesGameNumber;
  const totalDraftPicks =
    nextSeriesGameNumber <= 1
      ? FULL_DRAFT_PICKS
      : Math.max(
          0,
          Math.max(
            LATER_GAME_ROSTER_TARGET - carriedPlayersA.length,
            LATER_GAME_ROSTER_TARGET - carriedPlayersB.length
          ) * 2
        );

  return {
    status: "draft" as const,
    seed: Date.now(),
    readyA: false,
    readyB: false,
    draftFirstSide: randomFirstSide(),
    totalDraftPicks,
    pickNumber: 0,
    draftedIds: [] as string[],
    teamA: carriedPlayersA,
    teamB: carriedPlayersB,
    simResult: null,
    ...emptyScoutingState(nextSeriesGameNumber),
    ...(options?.resetSeries
      ? createFreshSeriesState()
      : {
          seriesGameNumber: options?.seriesGameNumber ?? room.seriesGameNumber,
          seriesWinsA: room.seriesWinsA,
          seriesWinsB: room.seriesWinsB,
          seriesWinner: null,
          seriesLastProcessedGame: room.seriesLastProcessedGame,
          ...emptyBetweenGameState(),
          rematchAcceptedA: false,
          rematchAcceptedB: false,
        }),
    ...resetStrategyState(),
  };
}

function buildInitialRoomData(roomId: string, hostId: string, teamName: string): RoomData {
  return {
    roomId,
    status: "lobby",
    seed: Date.now(),
    hostId,
    createdAt: serverTimestamp(),
    teamAName: teamName || "Team A",
    teamBName: "",
    playerAId: hostId,
    playerBId: null,
    readyA: false,
    readyB: false,
    draftFirstSide: "A",
    totalDraftPicks: FULL_DRAFT_PICKS,
    pickNumber: 0,
    draftedIds: [],
    teamA: [],
    teamB: [],
    ...emptyScoutingState(1),
    ...resetStrategyState(),
    simResult: null,
    ...createFreshSeriesState(),
  };
}

function getGameWinner(room: RoomData, simResult: SimResult): "A" | "B" {
  if (simResult.finalA > simResult.finalB) return "A";
  if (simResult.finalB > simResult.finalA) return "B";

  return room.seed % 2 === 0 ? "A" : "B";
}

function getPlayerSide(room: RoomData, uid: string): "A" | "B" | null {
  if (room.playerAId === uid) return "A";
  if (room.playerBId === uid) return "B";
  return null;
}

function selectKeepers(players: DraftedPlayer[], keeperIds: string[]) {
  const keeperIdSet = new Set(keeperIds);
  return players.filter((player) => keeperIdSet.has(player.id));
}

function getFreeAgencyTarget(pool: DraftedPlayer[], playerId: string | null) {
  if (!playerId) return null;
  return pool.find((candidate) => candidate.id === playerId) ?? null;
}

function buildNextSeriesDraft(room: RoomData, carriedPlayersA: DraftedPlayer[], carriedPlayersB: DraftedPlayer[]) {
  return buildDraftReset(room, {
    carriedPlayersA,
    carriedPlayersB,
    seriesGameNumber: room.seriesGameNumber + 1,
  });
}

function prospectFromSeed(room: RoomData, playerId: string) {
  return generateProspects(room.seed).find((prospect) => prospect.id === playerId) ?? null;
}

export async function createRoom(teamName: string) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomId = randomRoomCode();
  const roomRef = doc(db, "rooms", roomId);
  const roomData = buildInitialRoomData(roomId, user.uid, teamName);

  await setDoc(roomRef, roomData);
  return roomId;
}

export async function joinRoom(roomId: string, teamName: string) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);

  if (!snap.exists()) {
    throw new Error("Room not found");
  }

  const room = snap.data() as RoomData;

  if (room.playerBId && room.playerBId !== user.uid) {
    throw new Error("Room is full");
  }

  if (!room.playerBId) {
    await updateDoc(roomRef, {
      playerBId: user.uid,
      teamBName: teamName || "Team B",
    });
  }

  return roomId;
}

export function subscribeToRoom(
  roomId: string,
  callback: (room: RoomData | null) => void
) {
  const roomRef = doc(db, "rooms", roomId);

  return onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }

    callback(snap.data() as RoomData);
  });
}

export async function setReady(
  roomId: string,
  playerSlot: "A" | "B",
  ready: boolean
) {
  const roomRef = doc(db, "rooms", roomId);

  if (playerSlot === "A") {
    await updateDoc(roomRef, { readyA: ready });
  } else {
    await updateDoc(roomRef, { readyB: ready });
  }
}

export async function startDraft(roomId: string) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);

  if (!snap.exists()) {
    throw new Error("Room not found");
  }

  const room = snap.data() as RoomData;

  if (!room.playerAId || !room.playerBId) {
    throw new Error("Both players must join before starting the draft");
  }

  if (!room.readyA || !room.readyB) {
    throw new Error("Both players must be ready before starting the draft");
  }

  await updateDoc(roomRef, buildDraftReset(room));
}

export async function makeDraftPick(roomId: string, player: Prospect) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;

    if (room.status !== "draft") {
      throw new Error("Draft is not active");
    }

    if (room.pickNumber >= room.totalDraftPicks) {
      throw new Error("Draft is complete");
    }

    if (room.draftedIds.includes(player.id)) {
      throw new Error("Player already drafted");
    }

    const currentTeam = getCurrentDraftSide(room);
    if (!currentTeam) {
      throw new Error("Draft is complete");
    }
    const expectedUserId = currentTeam === "A" ? room.playerAId : room.playerBId;
    const currentRoster = currentTeam === "A" ? room.teamA : room.teamB;
    const missingPositions = missingStarterPositions(currentRoster);

    if (user.uid !== expectedUserId) {
      throw new Error("Not your turn");
    }

    if (missingPositions.length > 0 && !missingPositions.includes(player.position)) {
      throw new Error(`You must fill starter positions first: ${missingPositions.join(", ")}`);
    }

    const draftedPlayer: DraftedPlayer = {
      ...player,
      overallPick: room.pickNumber + 1,
      careerStage: player.careerStage ?? "Rook",
      acquisitionType: player.acquisitionType ?? "draft",
      seriesSourceSeed: player.seriesSourceSeed ?? room.seed,
      originalOverallPick: player.originalOverallPick ?? room.pickNumber + 1,
      freeAgencyTag: null,
    };

    const nextDraftedIds = [...room.draftedIds, player.id];
    const nextPickNumber = room.pickNumber + 1;
    const nextTeamA = currentTeam === "A" ? [...room.teamA, draftedPlayer] : room.teamA;
    const nextTeamB = currentTeam === "B" ? [...room.teamB, draftedPlayer] : room.teamB;
    const draftFinishedEarly =
      isRetoolDraft(room) &&
      isRetoolRosterComplete(nextTeamA) &&
      isRetoolRosterComplete(nextTeamB);
    const storedPickNumber = draftFinishedEarly ? room.totalDraftPicks : nextPickNumber;

    if (currentTeam === "A") {
      transaction.update(roomRef, {
        draftedIds: nextDraftedIds,
        pickNumber: storedPickNumber,
        teamA: nextTeamA,
      });
    } else {
      transaction.update(roomRef, {
        draftedIds: nextDraftedIds,
        pickNumber: storedPickNumber,
        teamB: nextTeamB,
      });
    }
  });
}

export async function scoutProspect(
  roomId: string,
  side: "A" | "B",
  playerId: string,
  attribute: ScoutAttribute
) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;
    const actualSide = getPlayerSide(room, user.uid);

    if (!actualSide || actualSide !== side) {
      throw new Error("You can only spend scouting tokens for your own side");
    }

    if (room.status !== "draft") {
      throw new Error("Scouting is only available during the draft");
    }

    if (room.draftedIds.includes(playerId)) {
      throw new Error("That player has already been drafted");
    }

    const prospect = prospectFromSeed(room, playerId);

    if (!prospect) {
      throw new Error("Prospect not found");
    }

    const currentMap = side === "A" ? room.scoutingA ?? {} : room.scoutingB ?? {};
    const defaultTokens = scoutTokensForGame(room.seriesGameNumber);
    const currentTokens = side === "A" ? room.scoutTokensA ?? defaultTokens : room.scoutTokensB ?? defaultTokens;
    const existingReport = currentMap[playerId] ?? {};
    const currentRange = existingReport[attribute];
    const nextLevel = currentRange ? (currentRange.level + 1) as 1 | 2 | 3 : 1;

    if (nextLevel > 2) {
      throw new Error("That attribute is already fully scouted");
    }

    if (currentTokens <= 0) {
      throw new Error("No scouting tokens remaining");
    }

    const nextRange = buildScoutingRange(
      prospect,
      attribute,
      nextLevel as 1 | 2,
      `${room.roomId}:${side}:${room.seed}`
    );
    const nextMap: ScoutingMap = {
      ...currentMap,
      [playerId]: {
        ...existingReport,
        [attribute]: nextRange,
      },
    };

    if (side === "A") {
      transaction.update(roomRef, {
        scoutingA: nextMap,
        scoutTokensA: currentTokens - 1,
      });
    } else {
      transaction.update(roomRef, {
        scoutingB: nextMap,
        scoutTokensB: currentTokens - 1,
      });
    }
  });
}

export async function updateRoomStatus(roomId: string, status: RoomStatus) {
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { status });
}

export async function saveTeamStrategy(
  roomId: string,
  side: "A" | "B",
  offense: string,
  defense: string,
  locked: boolean
) {
  const roomRef = doc(db, "rooms", roomId);

  if (side === "A") {
    await updateDoc(roomRef, {
      teamAStrategy: { offense, defense, locked },
    });
  } else {
    await updateDoc(roomRef, {
      teamBStrategy: { offense, defense, locked },
    });
  }
}

export async function finalizeSeriesGame(roomId: string, simResult: SimResult) {
  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;

    if (room.seriesLastProcessedGame >= room.seriesGameNumber && room.simResult) {
      transaction.update(roomRef, { status: "results", simResult });
      return;
    }

    const winnerSide = getGameWinner(room, simResult);
    const nextWinsA = room.seriesWinsA + (winnerSide === "A" ? 1 : 0);
    const nextWinsB = room.seriesWinsB + (winnerSide === "B" ? 1 : 0);
    const seriesWinner =
      nextWinsA >= 2 ? "A" : nextWinsB >= 2 ? "B" : null;

    transaction.update(roomRef, {
      simResult,
      status: "results",
      seriesWinsA: nextWinsA,
      seriesWinsB: nextWinsB,
      seriesWinner,
      seriesLastProcessedGame: room.seriesGameNumber,
      rematchAcceptedA: false,
      rematchAcceptedB: false,
    });
  });
}

export async function beginBetweenGamePhase(roomId: string) {
  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;

    if (room.status !== "results" || !room.simResult) {
      throw new Error("Between-games flow can only start after results");
    }

    if (room.seriesWinner) {
      throw new Error("Series is already complete");
    }

    if (room.seriesLastProcessedGame < room.seriesGameNumber) {
      throw new Error("Series result has not been finalized yet");
    }

    transaction.update(roomRef, {
      status: "betweenGames",
      betweenGamePhase: "keepers",
      keepersA: [],
      keepersB: [],
      keepersLockedA: false,
      keepersLockedB: false,
      carriedPlayersA: [],
      carriedPlayersB: [],
      freeAgencyPool: [],
      freeAgencyChoiceA: null,
      freeAgencyChoiceB: null,
      freeAgencyLockedA: false,
      freeAgencyLockedB: false,
      freeAgencyResolved: false,
      freeAgencyReplacementSide: null,
      freeAgencyAwardedSide: null,
      freeAgencyContestedPlayerId: null,
      freeAgencyResolutionText: "",
    });
  });
}

export async function saveKeeperSelection(
  roomId: string,
  side: "A" | "B",
  keeperIds: string[]
) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);
  const trimmedKeeperIds = [...new Set(keeperIds)].slice(0, KEEPER_COUNT);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;
    const actualSide = getPlayerSide(room, user.uid);

    if (!actualSide || actualSide !== side) {
      throw new Error("You can only edit your own keepers");
    }

    if (room.status !== "betweenGames" || room.betweenGamePhase !== "keepers") {
      throw new Error("Keeper phase is not active");
    }

    if (actualSide === "A" && room.keepersLockedA) {
      throw new Error("Your keepers are already locked");
    }

    if (actualSide === "B" && room.keepersLockedB) {
      throw new Error("Your keepers are already locked");
    }

    if (actualSide === "A") {
      transaction.update(roomRef, { keepersA: trimmedKeeperIds });
    } else {
      transaction.update(roomRef, { keepersB: trimmedKeeperIds });
    }
  });
}

export async function lockKeepers(roomId: string, side: "A" | "B") {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;
    const actualSide = getPlayerSide(room, user.uid);

    if (!actualSide || actualSide !== side) {
      throw new Error("You can only lock your own keepers");
    }

    if (room.status !== "betweenGames" || room.betweenGamePhase !== "keepers") {
      throw new Error("Keeper phase is not active");
    }

    const ownTeam = side === "A" ? room.teamA : room.teamB;
    const keeperIds = side === "A" ? room.keepersA : room.keepersB;

    if (keeperIds.length !== KEEPER_COUNT) {
      throw new Error(`You must select exactly ${KEEPER_COUNT} keepers`);
    }

    const ownIds = new Set(ownTeam.map((player) => player.id));
    if (!keeperIds.every((keeperId) => ownIds.has(keeperId))) {
      throw new Error("Keepers must come from your own roster");
    }

    const selectedKeepers = selectKeepers(ownTeam, keeperIds);
    if (selectedKeepers.some((player) => willRetireAfterGame(player))) {
      throw new Error("Retiring players cannot be kept");
    }

    const updates =
      side === "A"
        ? { keepersLockedA: true }
        : { keepersLockedB: true };

    const nextLockedA = side === "A" ? true : room.keepersLockedA;
    const nextLockedB = side === "B" ? true : room.keepersLockedB;

    if (nextLockedA && nextLockedB) {
      const nextGameNumber = room.seriesGameNumber + 1;
      const carriedPlayersA = selectKeepers(room.teamA, room.keepersA)
        .map((player) => agePlayerForSeries(player, nextGameNumber, "A", "keeper"))
        .filter(notNull);
      const carriedPlayersB = selectKeepers(room.teamB, room.keepersB)
        .map((player) => agePlayerForSeries(player, nextGameNumber, "B", "keeper"))
        .filter(notNull);
      const freeAgencyPool = buildFreeAgencyPool({
        previousSeed: room.seed,
        previousTeamA: room.teamA,
        previousTeamB: room.teamB,
        keeperIdsA: room.keepersA,
        keeperIdsB: room.keepersB,
        nextGameNumber,
      });

      transaction.update(roomRef, {
        ...updates,
        carriedPlayersA,
        carriedPlayersB,
        betweenGamePhase: "freeAgency",
        freeAgencyPool,
        freeAgencyChoiceA: null,
        freeAgencyChoiceB: null,
        freeAgencyLockedA: false,
        freeAgencyLockedB: false,
        freeAgencyResolved: false,
        freeAgencyReplacementSide: null,
        freeAgencyAwardedSide: null,
        freeAgencyContestedPlayerId: null,
        freeAgencyResolutionText: "",
      });
      return;
    }

    transaction.update(roomRef, updates);
  });
}

export async function submitFreeAgencyChoice(
  roomId: string,
  side: "A" | "B",
  playerId: string
) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;
    const actualSide = getPlayerSide(room, user.uid);

    if (!actualSide || actualSide !== side) {
      throw new Error("You can only submit free agency choices for your own side");
    }

    if (room.status !== "betweenGames") {
      throw new Error("Between-games flow is not active");
    }

    if (
      room.betweenGamePhase !== "freeAgency" &&
      room.betweenGamePhase !== "freeAgencyResolution"
    ) {
      throw new Error("Free agency is not active");
    }

    const target = getFreeAgencyTarget(room.freeAgencyPool, playerId);

    if (!target) {
      throw new Error("Selected free agent is unavailable");
    }

    if (
      room.betweenGamePhase === "freeAgencyResolution" &&
      room.freeAgencyReplacementSide !== side
    ) {
      throw new Error("Only the replacement side can make this pick");
    }

    if (
      room.betweenGamePhase === "freeAgencyResolution" &&
      playerId === room.freeAgencyContestedPlayerId
    ) {
      throw new Error("You must choose a different free agent");
    }

    if (room.betweenGamePhase === "freeAgency") {
      if (side === "A" && room.freeAgencyLockedA) {
        throw new Error("Your free agency choice is already locked");
      }

      if (side === "B" && room.freeAgencyLockedB) {
        throw new Error("Your free agency choice is already locked");
      }
    }

    if (room.betweenGamePhase === "freeAgencyResolution") {
      const nextCarriedA = [...room.carriedPlayersA];
      const nextCarriedB = [...room.carriedPlayersB];

      if (side === "A") {
        nextCarriedA.push(target);
      } else {
        nextCarriedB.push(target);
      }

      transaction.update(roomRef, buildNextSeriesDraft(room, nextCarriedA, nextCarriedB));
      return;
    }

    const nextChoiceA = side === "A" ? playerId : room.freeAgencyChoiceA;
    const nextChoiceB = side === "B" ? playerId : room.freeAgencyChoiceB;
    const nextLockedA = side === "A" ? true : room.freeAgencyLockedA;
    const nextLockedB = side === "B" ? true : room.freeAgencyLockedB;

    if (!(nextLockedA && nextLockedB && nextChoiceA && nextChoiceB)) {
      transaction.update(roomRef, {
        freeAgencyChoiceA: nextChoiceA,
        freeAgencyChoiceB: nextChoiceB,
        freeAgencyLockedA: nextLockedA,
        freeAgencyLockedB: nextLockedB,
      });
      return;
    }

    const choiceA = getFreeAgencyTarget(room.freeAgencyPool, nextChoiceA);
    const choiceB = getFreeAgencyTarget(room.freeAgencyPool, nextChoiceB);

    if (!choiceA || !choiceB) {
      throw new Error("Free agency choices could not be resolved");
    }

    if (choiceA.id !== choiceB.id) {
      transaction.update(
        roomRef,
        buildNextSeriesDraft(room, [...room.carriedPlayersA, choiceA], [...room.carriedPlayersB, choiceB])
      );
      return;
    }

    const contestedPlayerId = choiceA.id;
    const seriesTied = room.seriesWinsA === room.seriesWinsB;
    const awardedSide = seriesTied
      ? Math.random() < 0.5
        ? "A"
        : "B"
      : room.seriesWinsA > room.seriesWinsB
        ? "B"
        : "A";
    const replacementSide = awardedSide === "A" ? "B" : "A";
    const nextCarriedA = [...room.carriedPlayersA];
    const nextCarriedB = [...room.carriedPlayersB];

    if (awardedSide === "A") {
      nextCarriedA.push(choiceA);
    } else {
      nextCarriedB.push(choiceA);
    }

    transaction.update(roomRef, {
      carriedPlayersA: nextCarriedA,
      carriedPlayersB: nextCarriedB,
      betweenGamePhase: "freeAgencyResolution",
      freeAgencyChoiceA: awardedSide === "A" ? contestedPlayerId : null,
      freeAgencyChoiceB: awardedSide === "B" ? contestedPlayerId : null,
      freeAgencyLockedA: awardedSide === "A",
      freeAgencyLockedB: awardedSide === "B",
      freeAgencyResolved: true,
      freeAgencyReplacementSide: replacementSide,
      freeAgencyAwardedSide: awardedSide,
      freeAgencyContestedPlayerId: contestedPlayerId,
      freeAgencyResolutionText: seriesTied
        ? `Both coaches went after ${choiceA.name}. Contested signing resolved by coin flip. Losing player receives a consolation pick.`
        : `Both coaches went after ${choiceA.name}. Game 1 loser has priority in contested free agency.`,
    });
  });
}

export async function acceptRematch(roomId: string) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomRef = doc(db, "rooms", roomId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(roomRef);

    if (!snap.exists()) {
      throw new Error("Room not found");
    }

    const room = snap.data() as RoomData;

    if (room.status !== "results" || !room.simResult || !room.seriesWinner) {
      throw new Error("Rematch is only available after the series ends");
    }

    const side = getPlayerSide(room, user.uid);

    if (!side) {
      throw new Error("You are not a player in this room");
    }

    const nextAcceptedA = side === "A" ? true : room.rematchAcceptedA;
    const nextAcceptedB = side === "B" ? true : room.rematchAcceptedB;

    if (nextAcceptedA && nextAcceptedB) {
      transaction.update(roomRef, buildDraftReset(room, { resetSeries: true }));
      return;
    }

    transaction.update(roomRef, {
      rematchAcceptedA: nextAcceptedA,
      rematchAcceptedB: nextAcceptedB,
    });
  });
}
