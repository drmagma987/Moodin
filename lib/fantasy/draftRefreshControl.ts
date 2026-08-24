import { leagueSourceOfTruth, leagueSourceOfTruthFingerprint } from "@/lib/fantasy/leagueSourceOfTruth";
import type { RedraftBoardEntry } from "@/lib/fantasy/draft";
import type { DraftCandidate } from "@/lib/fantasy/types";

export type DraftRefreshCheckpoint = {
  schemaVersion: 1;
  capturedAt: string;
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  boardFingerprint: string;
  candidates: Array<{
    playerId: string;
    fullName: string;
    boardRank: number;
    adp: number;
    median: number;
  }>;
};

function fingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildDraftRefreshCheckpoint(
  candidates: DraftCandidate[],
  board: RedraftBoardEntry[],
  capturedAt: string,
): DraftRefreshCheckpoint {
  const rankById = new Map(board.map((entry) => [entry.playerId, entry.boardRank] as const));
  const rows = candidates.map((candidate) => ({
    playerId: candidate.player.id,
    fullName: candidate.player.fullName,
    boardRank: rankById.get(candidate.player.id) ?? 999,
    adp: candidate.market.adp,
    median: candidate.projection.range.p50,
  })).sort((a, b) => a.playerId.localeCompare(b.playerId));
  return {
    schemaVersion: 1,
    capturedAt,
    leagueConfigVersion: leagueSourceOfTruth.version,
    leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
    boardFingerprint: fingerprint(JSON.stringify(rows)),
    candidates: rows,
  };
}

export function compareDraftRefreshCheckpoints(
  previous: DraftRefreshCheckpoint | null,
  current: DraftRefreshCheckpoint,
) {
  if (!previous) return { added: current.candidates, removed: [], movers: [], changed: false };
  if (previous.leagueConfigVersion !== leagueSourceOfTruth.version || previous.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error("Previous refresh checkpoint belongs to a stale league configuration.");
  }
  const previousById = new Map(previous.candidates.map((row) => [row.playerId, row] as const));
  const currentById = new Map(current.candidates.map((row) => [row.playerId, row] as const));
  const added = current.candidates.filter((row) => !previousById.has(row.playerId));
  const removed = previous.candidates.filter((row) => !currentById.has(row.playerId));
  const movers = current.candidates.flatMap((row) => {
    const before = previousById.get(row.playerId);
    if (!before) return [];
    const rankDelta = before.boardRank - row.boardRank;
    const adpDelta = before.adp - row.adp;
    const medianDelta = row.median - before.median;
    if (Math.abs(rankDelta) < 3 && Math.abs(adpDelta) < 3 && Math.abs(medianDelta) < 5) return [];
    return [{ ...row, previousRank: before.boardRank, rankDelta, adpDelta, medianDelta }];
  }).sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta));
  return {
    added,
    removed,
    movers,
    changed: previous.boardFingerprint !== current.boardFingerprint,
  };
}
