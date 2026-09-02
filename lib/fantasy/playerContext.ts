import type {
  CandidateSituationAssessment,
  DraftCandidate,
  PlayerContextSnapshot,
  PlayerCurrentRole,
  PlayerEnvironment,
  PlayerHealthStatus,
  PlayerRoleContinuity,
  PlayerTrackRecord,
} from "@/lib/fantasy/types";
import {
  deriveContextFromQualitativeEvidence,
  getQualitativeContext,
} from "@/lib/fantasy/qualitativeContext";
import type { SleeperPlayerSnapshot } from "@/lib/fantasy/sleeper";

type PlayerContextInput = Partial<Omit<PlayerContextSnapshot, "source" | "asOf">> & {
  playerName: string;
  source?: PlayerContextSnapshot["source"];
  asOf?: string;
};

const ROLES = new Set<PlayerCurrentRole>([
  "locked-starter",
  "projected-starter",
  "competition",
  "backup",
  "unknown",
]);
const HEALTH = new Set<PlayerHealthStatus>(["healthy", "recovering", "active-concern", "unknown"]);
const TRACK_RECORDS = new Set<PlayerTrackRecord>(["established", "limited-sample", "rookie", "unknown"]);
const CONTINUITY = new Set<PlayerRoleContinuity>(["stable", "promoted", "team-change", "scheme-change", "unknown"]);
const ENVIRONMENTS = new Set<PlayerEnvironment>(["strong", "neutral", "weak", "uncertain"]);

const REVIEWED_CONTEXTS: PlayerContextInput[] = [
  {
    playerName: "Lamar Jackson",
    currentRole: "locked-starter",
    healthStatus: "healthy",
    trackRecord: "established",
    roleContinuity: "stable",
    environment: "strong",
    source: "manager-reviewed",
    asOf: "2026-08-12",
    notes: [
      "Prior injuries are not being treated as a current role limitation.",
      "Healthy baseline includes established MVP-caliber upside.",
    ],
  },
  {
    playerName: "Malik Willis",
    currentRole: "projected-starter",
    healthStatus: "healthy",
    trackRecord: "limited-sample",
    roleContinuity: "promoted",
    environment: "uncertain",
    source: "manager-reviewed",
    asOf: "2026-08-12",
    notes: [
      "Starter projection is not backed by a large NFL starting sample.",
      "Supporting-cast quality remains a material question.",
    ],
  },
];

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function reconcileRookieIdentity(
  candidates: DraftCandidate[],
  rookiePlayerNames: Iterable<string>,
) {
  const rookieNames = new Set(Array.from(rookiePlayerNames, normalizeName));
  let appliedCount = 0;
  const reconciled = candidates.map((candidate) => {
    if (candidate.player.rookie || !rookieNames.has(normalizeName(candidate.player.fullName))) {
      return candidate;
    }
    appliedCount += 1;
    return {
      ...candidate,
      player: { ...candidate.player, rookie: true },
    } satisfies DraftCandidate;
  });
  return { candidates: reconciled, appliedCount };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>) {
  const parsed = stringValue(value) as T | undefined;
  return parsed && allowed.has(parsed) ? parsed : undefined;
}

function normalizeContext(input: PlayerContextInput, defaultSource: PlayerContextSnapshot["source"]): PlayerContextSnapshot {
  return {
    currentRole: input.currentRole ?? "unknown",
    healthStatus: input.healthStatus ?? "unknown",
    trackRecord: input.trackRecord ?? "unknown",
    roleContinuity: input.roleContinuity ?? "unknown",
    environment: input.environment ?? "uncertain",
    source: input.source ?? defaultSource,
    asOf: input.asOf ?? new Date().toISOString(),
    notes: input.notes?.filter(Boolean).slice(0, 5) ?? [],
    qualitative: input.qualitative,
  };
}

function hasImminentReturn(context: PlayerContextSnapshot) {
  const estimatedReturn = context.qualitative?.evidence.find((evidence) => evidence.estimatedReturn)?.estimatedReturn;
  if (!estimatedReturn) return false;
  const [month, day, year] = estimatedReturn.split("/").map(Number);
  if (!month || !day || !year) return false;
  const returnAt = Date.UTC(year, month - 1, day);
  const capturedAt = Date.parse(context.qualitative?.capturedAt ?? context.asOf);
  const days = (returnAt - capturedAt) / 86_400_000;
  return days >= 0 && days <= 7;
}

function sleeperHealth(player: SleeperPlayerSnapshot): {
  status: PlayerHealthStatus;
  note: string;
} {
  const injury = player.injuryStatus?.trim();
  const practice = player.practiceParticipation?.trim();
  const combined = `${injury ?? ""} ${practice ?? ""}`.toLowerCase();
  if (/\b(out|ir|pup|nfi|doubtful)\b/.test(combined)) {
    return {
      status: "active-concern",
      note: `Sleeper availability metadata flags ${[injury, practice].filter(Boolean).join(" / ")}.`,
    };
  }
  if (/\b(questionable|limited|dnp|did not practice)\b/.test(combined)) {
    return {
      status: "recovering",
      note: `Sleeper availability metadata flags ${[injury, practice].filter(Boolean).join(" / ")}.`,
    };
  }
  return {
    status: "healthy",
    note: "Sleeper reports no active injury designation at this refresh.",
  };
}

export function parsePlayerContexts(raw: string): PlayerContextInput[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("FANTASY_PLAYER_CONTEXT_JSON must be an array.");
  }

  return parsed.flatMap((value) => {
    const record = asRecord(value);
    const playerName = stringValue(record?.playerName ?? record?.name);
    if (!record || !playerName) return [];
    const notes = Array.isArray(record.notes)
      ? record.notes.map(stringValue).filter((note): note is string => Boolean(note))
      : [];
    return [{
      playerName,
      currentRole: enumValue(record.currentRole, ROLES),
      healthStatus: enumValue(record.healthStatus, HEALTH),
      trackRecord: enumValue(record.trackRecord, TRACK_RECORDS),
      roleContinuity: enumValue(record.roleContinuity, CONTINUITY),
      environment: enumValue(record.environment, ENVIRONMENTS),
      source: "manual-import",
      asOf: stringValue(record.asOf),
      notes,
    }];
  });
}

export function readPlayerContextsFromEnv() {
  const raw = process.env.FANTASY_PLAYER_CONTEXT_JSON?.trim();
  return raw ? parsePlayerContexts(raw) : [];
}

export function applyPlayerContexts(
  candidates: DraftCandidate[],
  imported: PlayerContextInput[] = readPlayerContextsFromEnv(),
  options?: {
    rookieNames?: Iterable<string>;
    sleeperPlayers?: Iterable<SleeperPlayerSnapshot>;
  },
) {
  const reviewedByName = new Map(
    REVIEWED_CONTEXTS.map((context) => [normalizeName(context.playerName), context]),
  );
  const importedByName = new Map(
    imported.map((context) => [normalizeName(context.playerName), context]),
  );
  const rookieNames = new Set(
    [...(options?.rookieNames ?? [])].map(normalizeName),
  );
  const sleeperWrByNameAndTeam = new Map(
    [...(options?.sleeperPlayers ?? [])]
      .filter((player) => player.position === "WR")
      .map((player) => [`${normalizeName(player.fullName)}:${player.team}`, player]),
  );
  let reviewedCount = 0;
  let importedCount = 0;
  let qualitativeCount = 0;

  const updated = candidates.map((candidate) => {
    const key = normalizeName(candidate.player.fullName);
    const importedContext = importedByName.get(key);
    const reviewedContext = reviewedByName.get(key);
    const qualitative = getQualitativeContext(candidate.player.fullName);
    if (importedContext) importedCount += 1;
    else if (reviewedContext) reviewedCount += 1;
    else if (qualitative) qualitativeCount += 1;

    let baseContext = importedContext
      ? normalizeContext({ ...importedContext, qualitative }, "manual-import")
      : reviewedContext
        ? normalizeContext({ ...reviewedContext, qualitative }, "manager-reviewed")
        : qualitative
          ? normalizeContext(
              { playerName: candidate.player.fullName, ...deriveContextFromQualitativeEvidence(candidate, qualitative) },
              "qualitative-snapshot",
            )
        : normalizeContext({
            playerName: candidate.player.fullName,
            trackRecord: candidate.player.rookie ? "rookie" : "unknown",
            notes: ["No manager-reviewed current-situation context has been supplied."],
          }, "inferred-default");

    if (rookieNames.has(key) && !importedContext && !reviewedContext) {
      baseContext = {
        ...baseContext,
        trackRecord: "rookie",
        notes: baseContext.notes.filter((note) => !/established nfl production/i.test(note)),
      };
    }

    const sleeperWr = sleeperWrByNameAndTeam.get(`${key}:${candidate.player.team}`);
    if (
      sleeperWr?.depthChartOrder !== null &&
      sleeperWr?.depthChartOrder !== undefined &&
      sleeperWr.depthChartOrder >= 1 &&
      sleeperWr.depthChartOrder <= 3 &&
      !importedContext &&
      !reviewedContext
    ) {
      const health = sleeperHealth(sleeperWr);
      baseContext = {
        ...baseContext,
        currentRole: baseContext.currentRole === "locked-starter" ? "locked-starter" : "projected-starter",
        healthStatus: baseContext.healthStatus === "active-concern" ? "active-concern" : health.status,
        source: "sleeper-depth-chart",
        asOf: new Date().toISOString(),
        notes: [
          `Sleeper lists this player at WR depth order ${sleeperWr.depthChartOrder}; treated as a path to a top-three role, not a locked target share.`,
          health.note,
          ...baseContext.notes,
        ].slice(0, 5),
      };
    }

    return { ...candidate, context: baseContext } satisfies DraftCandidate;
  });

  return { candidates: updated, reviewedCount, importedCount, qualitativeCount };
}

export function removeQualitativeContexts(candidates: DraftCandidate[]) {
  return candidates.map((candidate) => {
    const context = candidate.context;
    if (!context) return candidate;
    if (context.source === "qualitative-snapshot") {
      return {
        ...candidate,
        context: normalizeContext({
          playerName: candidate.player.fullName,
          trackRecord: candidate.player.rookie ? "rookie" : "unknown",
          notes: ["Qualitative snapshot intentionally excluded for before/after comparison."],
        }, "inferred-default"),
      } satisfies DraftCandidate;
    }
    return {
      ...candidate,
      context: { ...context, qualitative: undefined },
    } satisfies DraftCandidate;
  });
}

export function assessPlayerSituation(candidate: DraftCandidate): CandidateSituationAssessment {
  const context = candidate.context;
  if (!context) {
    return {
      certainty: "low",
      reviewed: false,
      summary: "Current role, health, and environment have not been reviewed.",
      strengths: [],
      questions: ["No structured player context is available."],
    };
  }

  const strengths: string[] = [];
  const questions: string[] = [];
  let certaintyPoints = 0;
  if (context.currentRole === "locked-starter") {
    certaintyPoints += 3;
    strengths.push("Starting role is locked.");
  } else if (context.currentRole === "projected-starter") {
    certaintyPoints += 1;
    questions.push("Starter projection still needs confirmation through real games or depth-chart stability.");
  } else {
    questions.push(`Current role is ${context.currentRole}.`);
  }
  if (context.healthStatus === "healthy") {
    certaintyPoints += 2;
    strengths.push("No current health limitation is being applied.");
  } else {
    questions.push(`Health status is ${context.healthStatus}.`);
  }
  if (context.trackRecord === "established") {
    certaintyPoints += 2;
    strengths.push("Established NFL production provides a meaningful baseline.");
  } else if (context.trackRecord === "limited-sample") {
    questions.push("Limited starting sample widens the realistic range.");
  }
  if (context.roleContinuity === "stable") certaintyPoints += 2;
  else if (context.roleContinuity !== "unknown") questions.push(`Role continuity is ${context.roleContinuity}.`);
  if (context.environment === "strong" || context.environment === "neutral") certaintyPoints += 1;
  else questions.push(`Supporting environment is ${context.environment}.`);
  if (context.source === "inferred-default") questions.push("Situation has not been manager reviewed.");

  // Missing review is a monitoring state, not proof that an established player's role is unstable.
  // Explicit rookie, competition, backup, health, or continuity concerns can still resolve to low.
  const hasExplicitConcern =
    context.trackRecord === "rookie" ||
    context.currentRole === "competition" ||
    context.currentRole === "backup" ||
    (context.healthStatus === "recovering" && !hasImminentReturn(context)) ||
    context.healthStatus === "active-concern";
  const certainty =
    context.source === "inferred-default" && !hasExplicitConcern
      ? "medium"
      : context.source === "qualitative-snapshot" && !hasExplicitConcern && certaintyPoints < 4
        ? "medium"
      : certaintyPoints >= 8
        ? "high"
        : certaintyPoints >= 4
          ? "medium"
          : "low";
  return {
    certainty,
    reviewed: context.source !== "inferred-default",
    summary:
      certainty === "high"
        ? "Current role, health, track record, and environment form a stable situation baseline."
        : certainty === "medium"
          ? context.source === "inferred-default"
            ? "No specific current disruption is encoded, but the situation still needs draft-week review."
            : "The situation is usable, but at least one role, health, or environment assumption needs monitoring."
          : "Situation uncertainty is substantial enough to prevent a definitive target or fade.",
    strengths: [...strengths, ...context.notes].slice(0, 4),
    questions: questions.slice(0, 4),
  };
}
