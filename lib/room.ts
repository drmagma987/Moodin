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
import type { DraftedPlayer, Prospect } from "./game/types";
import type { SimResult } from "./sim";

export type RoomStatus = "lobby" | "draft" | "recap" | "results";

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
};

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function currentPicker2P(pickNumber: number): "A" | "B" {
  const round = Math.floor(pickNumber / 2) + 1;
  const pickInRound = pickNumber % 2;

  if (round % 2 === 1) {
    return pickInRound === 0 ? "A" : "B";
  } else {
    return pickInRound === 0 ? "B" : "A";
  }
}

export async function createRoom(teamName: string) {
  await ensureAnonymousAuth();

  const user = auth.currentUser;
  if (!user) throw new Error("No authenticated user");

  const roomId = randomRoomCode();
  const roomRef = doc(db, "rooms", roomId);

  const roomData: RoomData = {
    roomId,
    status: "lobby",
    seed: Date.now(),
    hostId: user.uid,
    createdAt: serverTimestamp(),

    teamAName: teamName || "Team A",
    teamBName: "",

    playerAId: user.uid,
    playerBId: null,

    readyA: false,
    readyB: false,

    pickNumber: 0,
    draftedIds: [],
    teamA: [],
    teamB: [],

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

    simResult: null,
  };

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

  const hostPlayerId = room.playerAId;
  const joinerPlayerId = room.playerBId;
  const hostTeamName = room.teamAName || "Team A";
  const joinerTeamName = room.teamBName || "Team B";

  const hostGetsFirstPick = Math.random() < 0.5;

  const randomizedPlayerAId = hostGetsFirstPick ? hostPlayerId : joinerPlayerId;
  const randomizedPlayerBId = hostGetsFirstPick ? joinerPlayerId : hostPlayerId;

  const randomizedTeamAName = hostGetsFirstPick ? hostTeamName : joinerTeamName;
  const randomizedTeamBName = hostGetsFirstPick ? joinerTeamName : hostTeamName;

  await updateDoc(roomRef, {
    status: "draft",
    seed: Date.now(),

    playerAId: randomizedPlayerAId,
    playerBId: randomizedPlayerBId,
    teamAName: randomizedTeamAName,
    teamBName: randomizedTeamBName,

    pickNumber: 0,
    draftedIds: [],
    teamA: [],
    teamB: [],

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

    simResult: null,
  });
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

    if (room.draftedIds.includes(player.id)) {
      throw new Error("Player already drafted");
    }

    const currentTeam = currentPicker2P(room.pickNumber);
    const expectedUserId = currentTeam === "A" ? room.playerAId : room.playerBId;

    if (user.uid !== expectedUserId) {
      throw new Error("Not your turn");
    }

    const draftedPlayer: DraftedPlayer = {
      ...player,
      overallPick: room.pickNumber + 1,
    };

    const nextDraftedIds = [...room.draftedIds, player.id];
    const nextPickNumber = room.pickNumber + 1;

    if (currentTeam === "A") {
      transaction.update(roomRef, {
        draftedIds: nextDraftedIds,
        pickNumber: nextPickNumber,
        teamA: [...room.teamA, draftedPlayer],
      });
    } else {
      transaction.update(roomRef, {
        draftedIds: nextDraftedIds,
        pickNumber: nextPickNumber,
        teamB: [...room.teamB, draftedPlayer],
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

export async function saveSimResult(roomId: string, simResult: SimResult) {
  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { simResult });
}