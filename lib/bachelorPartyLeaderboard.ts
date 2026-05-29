import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";

import { db, ensureAnonymousAuth } from "@/lib/firebase";

const BACHELOR_PARTY_LEADERBOARD_COLLECTION = "bachelorPartyBlitzLeaderboard";
const MAX_LEADERBOARD_NAME_LENGTH = 11;
const LEADERBOARD_FETCH_LIMIT = 100;

export interface BachelorPartyLeaderboardEntry {
  id: string;
  name: string;
  score: number;
  createdAtMs: number;
}

function sanitizeLeaderboardName(name: string) {
  const trimmed = name.toUpperCase().replace(/\s+/g, " ").trim();
  const cleaned = trimmed.replace(/[^A-Z0-9 !'.-]/g, "");
  return cleaned.slice(0, MAX_LEADERBOARD_NAME_LENGTH) || "JIMMY FAN";
}

function toCreatedAtMs(value: Timestamp | null | undefined) {
  return value?.toMillis() ?? 0;
}

export async function submitBachelorPartyLeaderboardScore(name: string, score: number) {
  await ensureAnonymousAuth();

  await addDoc(collection(db, BACHELOR_PARTY_LEADERBOARD_COLLECTION), {
    name: sanitizeLeaderboardName(name),
    score: Math.max(0, Math.round(score)),
    createdAt: serverTimestamp(),
  });
}

export async function fetchBachelorPartyLeaderboard() {
  await ensureAnonymousAuth();

  const leaderboardQuery = query(
    collection(db, BACHELOR_PARTY_LEADERBOARD_COLLECTION),
    orderBy("score", "desc"),
    limit(LEADERBOARD_FETCH_LIMIT),
  );
  const snapshot = await getDocs(leaderboardQuery);

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as {
        name?: unknown;
        score?: unknown;
        createdAt?: Timestamp;
      };

      return {
        id: doc.id,
        name: sanitizeLeaderboardName(typeof data.name === "string" ? data.name : ""),
        score: typeof data.score === "number" ? data.score : 0,
        createdAtMs: toCreatedAtMs(data.createdAt),
      } satisfies BachelorPartyLeaderboardEntry;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.createdAtMs - b.createdAtMs;
    });
}
