import type {
  DraftCandidate,
  PreferredTargetSnapshot,
} from "@/lib/fantasy/types";

type ApprovedPreferredTargetInput = {
  playerId?: string;
  fantasyProsId?: string;
  yahooId?: string;
  sleeperId?: string;
  playerName?: string;
  team?: string;
  approvedBy?: string;
  reason?: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function candidateMatchesInput(candidate: DraftCandidate, input: ApprovedPreferredTargetInput) {
  if (input.playerId && candidate.player.id === input.playerId) {
    return true;
  }
  if (
    input.fantasyProsId &&
    candidate.player.externalIds.fantasyPros === input.fantasyProsId
  ) {
    return true;
  }
  if (input.yahooId && candidate.player.externalIds.yahoo === input.yahooId) {
    return true;
  }
  if (input.sleeperId && candidate.player.externalIds.sleeper === input.sleeperId) {
    return true;
  }

  if (input.playerName) {
    const sameName =
      normalizeName(candidate.player.fullName) === normalizeName(input.playerName);
    const sameTeam =
      !input.team || candidate.player.team.toUpperCase() === input.team.toUpperCase();
    if (sameName && sameTeam) {
      return true;
    }
  }

  return false;
}

export function parseApprovedPreferredTargetsFromEnv(
  envValue = process.env.FANTASY_PREFERRED_TARGETS_JSON,
) {
  if (!envValue?.trim()) {
    return {
      targets: [] as ApprovedPreferredTargetInput[],
      messages: [] as string[],
    };
  }

  const parsed = JSON.parse(envValue) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("FANTASY_PREFERRED_TARGETS_JSON must be a JSON array.");
  }

  const targets: ApprovedPreferredTargetInput[] = [];
  const messages: string[] = [];

  for (const [index, item] of parsed.entries()) {
    const record = asRecord(item);
    if (!record) {
      messages.push(`Preferred target row ${index + 1} skipped: expected an object.`);
      continue;
    }

    const hasIdentity =
      readString(record.playerId) ||
      readString(record.fantasyProsId) ||
      readString(record.yahooId) ||
      readString(record.sleeperId) ||
      readString(record.playerName, record.name, record.fullName);
    if (!hasIdentity) {
      messages.push(`Preferred target row ${index + 1} skipped: missing player identity.`);
      continue;
    }

    targets.push({
      playerId: readString(record.playerId),
      fantasyProsId: readString(record.fantasyProsId),
      yahooId: readString(record.yahooId),
      sleeperId: readString(record.sleeperId),
      playerName: readString(record.playerName, record.name, record.fullName),
      team: readString(record.team),
      approvedBy: readString(record.approvedBy, record.source, record.authority),
      reason: readString(record.reason, record.note),
    });
  }

  return {
    targets,
    messages,
  };
}

function buildModelPreferredTarget(candidate: DraftCandidate) {
  const dossier = candidate.signals?.dossier;
  if (!dossier) {
    return null;
  }

  const convictionHighEnough = dossier.convictionScore >= 72;
  if (dossier.stance !== "priority-target" && !convictionHighEnough) {
    return null;
  }

  const reasons = [
    "Model conviction cleared the preferred-target threshold.",
    dossier.summary,
  ];
  if (candidate.signals?.refresh?.status === "rising") {
    reasons.push(candidate.signals.refresh.summary);
  }

  return {
    source: "model",
    label: "Model Preferred",
    summary:
      "The algorithm sees this as one of the cleaner names to intentionally leave the draft with.",
    reasons,
  } satisfies PreferredTargetSnapshot;
}

function buildApprovedPreferredTarget(
  candidate: DraftCandidate,
  target: ApprovedPreferredTargetInput,
) {
  const reasons = [
    target.reason ??
      "Manually approved as a preferred target from your trusted draft-prep sources.",
  ];

  return {
    source: "approved",
    label: "Approved Preferred",
    summary:
      "This player is intentionally tagged as a personal draft-day target beyond the raw model output.",
    reasons,
    approvedBy: target.approvedBy,
  } satisfies PreferredTargetSnapshot;
}

function mergePreferredTargets(
  modelPreferred: PreferredTargetSnapshot | null,
  approvedPreferred: PreferredTargetSnapshot | null,
) {
  if (modelPreferred && approvedPreferred) {
    return {
      source: "both",
      label: "Preferred",
      summary:
        "Both the model and your approved target list are pointing at this player.",
      reasons: [...modelPreferred.reasons, ...approvedPreferred.reasons].slice(0, 4),
      approvedBy: approvedPreferred.approvedBy,
    } satisfies PreferredTargetSnapshot;
  }

  return modelPreferred ?? approvedPreferred;
}

export function applyPreferredTargets(
  candidates: DraftCandidate[],
  approvedTargets: ApprovedPreferredTargetInput[] = [],
) {
  const messages: string[] = [];
  const matchedApprovedTargets = new Set<number>();

  const nextCandidates = candidates.map((candidate) => {
    const modelPreferred = buildModelPreferredTarget(candidate);
    const approvedMatchIndex = approvedTargets.findIndex((target) =>
      candidateMatchesInput(candidate, target),
    );
    const approvedPreferred =
      approvedMatchIndex >= 0
        ? buildApprovedPreferredTarget(candidate, approvedTargets[approvedMatchIndex]!)
        : null;

    if (approvedMatchIndex >= 0) {
      matchedApprovedTargets.add(approvedMatchIndex);
    }

    const preferredTarget = mergePreferredTargets(modelPreferred, approvedPreferred);
    if (!preferredTarget || !candidate.signals) {
      return candidate;
    }

    return {
      ...candidate,
      signals: {
        ...candidate.signals,
        preferredTarget,
      },
    } satisfies DraftCandidate;
  });

  approvedTargets.forEach((target, index) => {
    if (!matchedApprovedTargets.has(index)) {
      messages.push(
        `Approved preferred target could not be matched: ${target.playerName ?? target.playerId ?? "unknown player"}.`,
      );
    }
  });

  return {
    candidates: nextCandidates,
    messages,
  };
}
