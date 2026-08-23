import warRoomDatasetJson from "@/lib/fantasy/data/warRoomDataset.generated.json";
import { assertDraftStateMatchesSourceOfTruth } from "@/lib/fantasy/draftState";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "@/lib/fantasy/leagueSourceOfTruth";
import type { DraftLabDataset } from "@/lib/fantasy/draftLab";

export type WarRoomArtifact = DraftLabDataset & {
  capturedAt: string;
};

export function assertWarRoomArtifact(value: unknown): asserts value is WarRoomArtifact {
  if (!value || typeof value !== "object") {
    throw new Error("War-room artifact is missing or malformed.");
  }
  const artifact = value as Partial<WarRoomArtifact>;
  if (artifact.leagueConfigVersion !== leagueSourceOfTruth.version) {
    throw new Error(
      `War-room artifact version ${artifact.leagueConfigVersion ?? "missing"} does not match ${leagueSourceOfTruth.version}.`,
    );
  }
  if (artifact.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error(
      `War-room artifact fingerprint ${artifact.leagueConfigFingerprint ?? "missing"} does not match ${leagueSourceOfTruthFingerprint}.`,
    );
  }
  if (!artifact.warRoomReady || (artifact.warRoomBlockers?.length ?? 0) > 0) {
    throw new Error(
      `War-room artifact is blocked: ${artifact.warRoomBlockers?.join("; ") || "readiness flag is false"}.`,
    );
  }
  if (!Array.isArray(artifact.candidates) || artifact.candidates.length < 220) {
    throw new Error(`War-room artifact has only ${artifact.candidates?.length ?? 0} candidates.`);
  }
  if (!artifact.draftState) {
    throw new Error("War-room artifact is missing draft state.");
  }
  assertDraftStateMatchesSourceOfTruth(artifact.draftState);

  const candidateById = new Map(
    artifact.candidates.map((candidate) => [candidate.player.id, candidate] as const),
  );
  const canonicalKeepers = new Set(leagueSourceOfTruth.keepers.myDeclaredPlayers);
  const artifactKeepers = new Set(
    artifact.draftState.drafted
      .filter(
        (pick) =>
          pick.teamId === artifact.draftState?.myTeamId &&
          (pick.eventType ?? "keeper") === "keeper",
      )
      .map((pick) => candidateById.get(pick.playerId)?.player.fullName)
      .filter((name): name is string => Boolean(name)),
  );
  for (const keeper of canonicalKeepers) {
    if (!artifactKeepers.has(keeper)) {
      throw new Error(`War-room artifact is missing canonical keeper ${keeper}.`);
    }
  }
}

assertWarRoomArtifact(warRoomDatasetJson);

export const warRoomArtifact = warRoomDatasetJson as WarRoomArtifact;
