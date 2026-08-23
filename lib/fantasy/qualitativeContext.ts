import snapshotJson from "@/lib/fantasy/data/qualitative-context-2026-08-12.json" with { type: "json" };
import type {
  CandidateQualitativeContextSnapshot,
  DraftCandidate,
  PlayerContextSnapshot,
  QualitativeContextSignal,
  QualitativeEvidenceRecord,
} from "@/lib/fantasy/types";

type SnapshotPlayer = {
  playerName: string;
  sourceCount: number;
  evidence: QualitativeEvidenceRecord[];
};

type QualitativeSnapshotFile = {
  capturedAt: string;
  players: SnapshotPlayer[];
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const snapshot = snapshotJson as QualitativeSnapshotFile;
const evidenceByName = new Map(
  snapshot.players.map((player) => [normalizeName(player.playerName), player]),
);

function sourcesForSignal(evidence: QualitativeEvidenceRecord[], signal: QualitativeContextSignal) {
  return new Set(
    evidence.filter((record) => record.signals.includes(signal)).map((record) => record.source),
  );
}

function buildAgreements(evidence: QualitativeEvidenceRecord[]) {
  const claims: Array<[QualitativeContextSignal, string]> = [
    ["role-secure", "Multiple sources support a secure featured role."],
    ["role-competition", "Multiple sources identify meaningful role competition."],
    ["volume-support", "Multiple sources cite workload or target-volume support."],
    ["upside", "Multiple sources identify material fantasy ceiling."],
    ["efficiency-concern", "Multiple sources flag efficiency or regression risk."],
  ];
  return claims
    .filter(([signal]) => sourcesForSignal(evidence, signal).size >= 2)
    .map(([, summary]) => summary);
}

function buildConflicts(evidence: QualitativeEvidenceRecord[]) {
  const conflicts: string[] = [];
  if (
    sourcesForSignal(evidence, "role-secure").size > 0 &&
    sourcesForSignal(evidence, "role-competition").size > 0
  ) {
    conflicts.push("Sources disagree on whether the player has a secure role or material competition.");
  }
  if (
    sourcesForSignal(evidence, "environment-strong").size > 0 &&
    sourcesForSignal(evidence, "environment-weak").size > 0
  ) {
    conflicts.push("Sources disagree on the quality of the supporting offensive environment.");
  }
  return conflicts;
}

export function getQualitativeContext(playerName: string): CandidateQualitativeContextSnapshot | undefined {
  const record = evidenceByName.get(normalizeName(playerName));
  if (!record) return undefined;
  const agreements = buildAgreements(record.evidence);
  const conflicts = buildConflicts(record.evidence);
  return {
    capturedAt: snapshot.capturedAt,
    sourceCount: record.sourceCount,
    evidence: record.evidence,
    agreements,
    conflicts,
    summary: `${record.sourceCount} qualitative source${record.sourceCount === 1 ? "" : "s"} captured; ${agreements.length} cross-source agreement${agreements.length === 1 ? "" : "s"} and ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}.`,
  };
}

function hasSignal(context: CandidateQualitativeContextSnapshot, signal: QualitativeContextSignal) {
  return context.evidence.some((record) => record.signals.includes(signal));
}

export function deriveContextFromQualitativeEvidence(
  candidate: DraftCandidate,
  qualitative: CandidateQualitativeContextSnapshot,
): Partial<PlayerContextSnapshot> {
  const roleConflict = hasSignal(qualitative, "role-secure") && hasSignal(qualitative, "role-competition");
  const environmentConflict =
    hasSignal(qualitative, "environment-strong") && hasSignal(qualitative, "environment-weak");
  const recoveringEvidence = qualitative.evidence.find((record) =>
    record.signals.includes("health-recovering") || record.signals.includes("health-active-concern"),
  );
  const currentRole = roleConflict
    ? "competition"
    : hasSignal(qualitative, "role-competition")
      ? "competition"
      : hasSignal(qualitative, "role-secure")
        ? "locked-starter"
        : hasSignal(qualitative, "role-expansion")
          ? "projected-starter"
          : "unknown";
  const trackRecord = candidate.player.rookie
    ? "rookie"
    : hasSignal(qualitative, "established-production")
        ? "established"
        : hasSignal(qualitative, "limited-sample")
          ? "limited-sample"
        : "unknown";

  return {
    currentRole,
    healthStatus: hasSignal(qualitative, "health-active-concern")
      ? "active-concern"
      : hasSignal(qualitative, "health-recovering")
        ? "recovering"
        : "unknown",
    trackRecord,
    roleContinuity: hasSignal(qualitative, "team-change")
      ? "team-change"
      : hasSignal(qualitative, "role-expansion")
        ? "promoted"
        : currentRole === "locked-starter"
          ? "stable"
          : "unknown",
    environment: environmentConflict
      ? "uncertain"
      : hasSignal(qualitative, "environment-strong")
        ? "strong"
        : hasSignal(qualitative, "environment-weak")
          ? "weak"
          : "uncertain",
    source: "qualitative-snapshot",
    asOf: qualitative.capturedAt,
    notes: [
      qualitative.summary,
      ...qualitative.agreements,
      ...qualitative.conflicts,
      ...(recoveringEvidence?.injuryDetail
        ? [`Current ${recoveringEvidence.injuryDetail} status: ${recoveringEvidence.injuryStatus}${recoveringEvidence.estimatedReturn ? `; estimated return ${recoveringEvidence.estimatedReturn}` : ""}.`]
        : []),
    ].slice(0, 5),
    qualitative,
  };
}

export const qualitativeContextSnapshotMeta = {
  capturedAt: snapshot.capturedAt,
  playerCount: snapshot.players.length,
  multiSourcePlayerCount: snapshot.players.filter((player) => player.sourceCount >= 2).length,
};
