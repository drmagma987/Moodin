import {
  assertDraftStateMatchesSourceOfTruth,
  createInitialDraftState,
  getSnakePickInfo,
  seedDraftStateWithKnownPicks,
} from "@/lib/fantasy/draftState";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "@/lib/fantasy/leagueSourceOfTruth";
import type {
  DraftCandidate,
  DraftPickEvent,
  DraftState,
  ProviderName,
} from "@/lib/fantasy/types";

export const DRAFT_SESSION_SCHEMA_VERSION = 1;

export type DraftSessionEvent = DraftPickEvent & {
  id: string;
  sequence: number;
  status: "active" | "reverted";
  note?: string;
};

export type DraftSession = {
  schemaVersion: typeof DRAFT_SESSION_SCHEMA_VERSION;
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  createdAt: string;
  updatedAt: string;
  events: DraftSessionEvent[];
};

export type DraftSessionMutation = {
  session: DraftSession;
  state: DraftState;
  receipts: string[];
};

function eventId(event: Pick<DraftPickEvent, "overallPick" | "playerId" | "eventType">, sequence: number) {
  return `${event.eventType ?? "live"}-${event.overallPick}-${event.playerId}-${sequence}`;
}

function activeEvents(session: DraftSession) {
  return session.events
    .filter((event) => event.status === "active")
    .sort((a, b) => a.overallPick - b.overallPick || a.sequence - b.sequence);
}

export function createDraftSession(state: DraftState, now = new Date().toISOString()): DraftSession {
  assertDraftStateMatchesSourceOfTruth(state);
  const ordered = [...state.drafted].sort((a, b) => a.overallPick - b.overallPick);
  return {
    schemaVersion: DRAFT_SESSION_SCHEMA_VERSION,
    leagueConfigVersion: leagueSourceOfTruth.version,
    leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
    createdAt: now,
    updatedAt: now,
    events: ordered.map((event, index) => ({
      ...event,
      id: eventId(event, index + 1),
      sequence: index + 1,
      status: "active",
    })),
  };
}

export function assertDraftSessionIdentity(session: DraftSession) {
  if (session.schemaVersion !== DRAFT_SESSION_SCHEMA_VERSION) {
    throw new Error(`Draft session schema ${session.schemaVersion} is not supported.`);
  }
  if (session.leagueConfigVersion !== leagueSourceOfTruth.version) {
    throw new Error(`Draft session uses ${session.leagueConfigVersion}; expected ${leagueSourceOfTruth.version}.`);
  }
  if (session.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error("Draft session fingerprint does not match the canonical league configuration.");
  }
}

export function replayDraftSession(
  session: DraftSession,
  candidates: DraftCandidate[],
  template: DraftState,
): DraftState {
  assertDraftSessionIdentity(session);
  assertDraftStateMatchesSourceOfTruth(template);
  const events = activeEvents(session);
  const occupied = new Set<number>();
  const players = new Set<string>();
  const candidateIds = new Set(candidates.map((candidate) => candidate.player.id));

  for (const event of events) {
    if (!candidateIds.has(event.playerId)) throw new Error(`Session player ${event.playerId} is not on the canonical board.`);
    if (occupied.has(event.overallPick)) throw new Error(`Session has more than one active event at Pick ${event.overallPick}.`);
    if (players.has(event.playerId)) throw new Error(`Session drafts player ${event.playerId} more than once.`);
    const expectedTeam = getSnakePickInfo(event.overallPick, template.league.teams).teamId;
    if (event.teamId !== expectedTeam) {
      throw new Error(`Pick ${event.overallPick} belongs to ${expectedTeam}, not ${event.teamId}.`);
    }
    occupied.add(event.overallPick);
    players.add(event.playerId);
  }

  const base = createInitialDraftState(candidates, {
    league: template.league,
    myTeamId: template.myTeamId,
    currentPick: 1,
    focus: template.focus,
  });
  return seedDraftStateWithKnownPicks(base, candidates, events, { currentPick: 1 });
}

export function appendDraftSessionPick(
  session: DraftSession,
  candidates: DraftCandidate[],
  template: DraftState,
  input: {
    overallPick?: number;
    playerId: string;
    source?: ProviderName;
    pickedAt?: string;
    eventType?: "live" | "keeper";
    note?: string;
  },
): DraftSessionMutation {
  const state = replayDraftSession(session, candidates, template);
  const overallPick = input.overallPick ?? state.currentPick;
  const candidate = candidates.find((item) => item.player.id === input.playerId);
  if (!candidate) throw new Error(`Player ${input.playerId} is not on the canonical board.`);
  if (!state.availablePlayerIds.includes(input.playerId)) throw new Error(`${candidate.player.fullName} is already drafted.`);
  if (activeEvents(session).some((event) => event.overallPick === overallPick)) throw new Error(`Pick ${overallPick} is already occupied.`);
  const pickInfo = getSnakePickInfo(overallPick, state.league.teams);
  const sequence = session.events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
  const pickedAt = input.pickedAt ?? new Date().toISOString();
  const event: DraftSessionEvent = {
    id: eventId({ overallPick, playerId: input.playerId, eventType: input.eventType }, sequence),
    sequence,
    status: "active",
    overallPick,
    round: pickInfo.round,
    pickInRound: pickInfo.pickInRound,
    teamId: pickInfo.teamId,
    playerId: input.playerId,
    pickedAt,
    source: input.source ?? "manual",
    eventType: input.eventType ?? "live",
    note: input.note,
  };
  const nextSession = { ...session, updatedAt: pickedAt, events: [...session.events, event] };
  return {
    session: nextSession,
    state: replayDraftSession(nextSession, candidates, template),
    receipts: [`Pick ${overallPick} · ${candidate.player.fullName} · ${pickInfo.teamId}`],
  };
}

export function revertDraftSessionEvent(
  session: DraftSession,
  candidates: DraftCandidate[],
  template: DraftState,
  eventIdToRevert?: string,
): DraftSessionMutation {
  const target = eventIdToRevert
    ? session.events.find((event) => event.id === eventIdToRevert && event.status === "active")
    : [...session.events].reverse().find((event) => event.status === "active" && event.eventType !== "keeper");
  if (!target) return { session, state: replayDraftSession(session, candidates, template), receipts: ["No live pick was available to undo."] };
  if (target.eventType === "keeper") throw new Error("Keeper events can only be replaced through the reviewed keeper workflow.");
  const updatedAt = new Date().toISOString();
  const nextSession: DraftSession = {
    ...session,
    updatedAt,
    events: session.events.map((event) => event.id === target.id ? { ...event, status: "reverted" } : event),
  };
  return {
    session: nextSession,
    state: replayDraftSession(nextSession, candidates, template),
    receipts: [`Reverted Pick ${target.overallPick}. The event remains in the audit log.`],
  };
}

export function replaceDraftSessionSnapshot(
  session: DraftSession,
  candidates: DraftCandidate[],
  template: DraftState,
  picks: Array<Pick<DraftPickEvent, "overallPick" | "playerId" | "pickedAt" | "source">>,
): DraftSessionMutation {
  assertDraftSessionIdentity(session);
  const keepers = activeEvents(session).filter((event) => event.eventType === "keeper");
  const now = new Date().toISOString();
  let sequence = session.events.reduce((max, event) => Math.max(max, event.sequence), 0);
  const reverted = session.events.map((event) => event.eventType === "keeper" ? event : { ...event, status: "reverted" as const });
  const additions: DraftSessionEvent[] = picks.map((pick) => {
    sequence += 1;
    const info = getSnakePickInfo(pick.overallPick, template.league.teams);
    return {
      ...pick,
      id: eventId({ ...pick, eventType: "live" }, sequence),
      sequence,
      status: "active",
      round: info.round,
      pickInRound: info.pickInRound,
      teamId: info.teamId,
      source: pick.source ?? "manual",
      eventType: "live",
      pickedAt: pick.pickedAt ?? now,
    };
  });
  const nextSession: DraftSession = { ...session, updatedAt: now, events: [...reverted, ...additions] };
  const state = replayDraftSession(nextSession, candidates, template);
  return {
    session: nextSession,
    state,
    receipts: [`Reconciled ${additions.length} live picks and preserved ${keepers.length} keepers.`],
  };
}

export function getDraftSessionHealth(session: DraftSession, state: DraftState) {
  try {
    assertDraftSessionIdentity(session);
    assertDraftStateMatchesSourceOfTruth(state);
    const active = activeEvents(session);
    return {
      ok: true,
      activeEvents: active.length,
      revertedEvents: session.events.length - active.length,
      lastEventAt: active.at(-1)?.pickedAt ?? null,
      message: `Session healthy · ${active.length} active events · Pick ${state.currentPick} next.`,
    };
  } catch (error) {
    return {
      ok: false,
      activeEvents: 0,
      revertedEvents: 0,
      lastEventAt: null,
      message: error instanceof Error ? error.message : "Draft session validation failed.",
    };
  }
}
