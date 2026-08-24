import { leagueSourceOfTruth, leagueSourceOfTruthFingerprint } from "@/lib/fantasy/leagueSourceOfTruth";
import type { DraftPickEvent, DraftState } from "@/lib/fantasy/types";

export type DraftRoomFreeze = {
  schemaVersion: 1;
  frozenAt: string;
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  keeperFingerprint: string;
  boardFingerprint: string;
  keeperCount: number;
  artifactCapturedAt: string;
  candidateCount: number;
  checks: string[];
};

function fingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildKeeperFingerprint(events: DraftPickEvent[]) {
  return fingerprint(JSON.stringify(events
    .filter((event) => event.eventType === "keeper")
    .map((event) => [event.overallPick, event.teamId, event.playerId])
    .sort((a, b) => Number(a[0]) - Number(b[0]))));
}

export function freezeDraftRoom(input: {
  state: DraftState;
  candidateCount: number;
  artifactCapturedAt: string;
  setupReady: boolean;
  dataReady: boolean;
  expectedKeeperFingerprint?: string;
  boardFingerprint: string;
  now?: string;
}): DraftRoomFreeze {
  if (!input.setupReady) throw new Error("Keeper and draft-order confirmation is incomplete.");
  if (!input.dataReady) throw new Error("The candidate board is not fully validated.");
  if (input.state.leagueConfigVersion !== leagueSourceOfTruth.version || input.state.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error("Draft state identity does not match the canonical league source of truth.");
  }
  const keepers = input.state.drafted.filter((event) => event.eventType === "keeper");
  const keeperFingerprint = buildKeeperFingerprint(keepers);
  if (input.expectedKeeperFingerprint && input.expectedKeeperFingerprint !== keeperFingerprint) {
    throw new Error("Apply the reviewed keeper setup before freezing the draft room.");
  }
  return {
    schemaVersion: 1,
    frozenAt: input.now ?? new Date().toISOString(),
    leagueConfigVersion: leagueSourceOfTruth.version,
    leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
    keeperFingerprint,
    boardFingerprint: input.boardFingerprint,
    keeperCount: keepers.length,
    artifactCapturedAt: input.artifactCapturedAt,
    candidateCount: input.candidateCount,
    checks: ["canonical-identity", "keeper-review", "full-board-data"],
  };
}

export function assertDraftRoomFreeze(freeze: DraftRoomFreeze | null, state: DraftState, boardFingerprint?: string) {
  if (!freeze) throw new Error("Draft room has not been frozen after keeper review.");
  if (freeze.leagueConfigVersion !== leagueSourceOfTruth.version || freeze.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error("Frozen room identity is stale.");
  }
  if (freeze.keeperFingerprint !== buildKeeperFingerprint(state.drafted)) {
    throw new Error("Keeper configuration changed after the room was frozen.");
  }
  if (boardFingerprint && freeze.boardFingerprint !== boardFingerprint) {
    throw new Error("The player board changed after the room was frozen. Review and freeze the refresh before continuing.");
  }
}
