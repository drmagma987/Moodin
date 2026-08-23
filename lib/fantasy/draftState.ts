import type {
  DraftCandidate,
  DraftPickEvent,
  DraftState,
  LeagueConfig,
  PlayerPosition,
  TeamRosterState,
} from "@/lib/fantasy/types";
import { yahooLeagueConfig } from "@/lib/fantasy/scoring";
import {
  assertLeagueMatchesSourceOfTruth,
  assertManagerTeamMatchesSourceOfTruth,
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "@/lib/fantasy/leagueSourceOfTruth";

const FLEX_ELIGIBLE: PlayerPosition[] = ["RB", "WR", "TE"];

function buildTeamId(index: number) {
  return index === 0 ? "team-1" : `team-${index + 1}`;
}

function starterSlots(league: LeagueConfig) {
  return league.rosterSlots.filter((slot) => slot !== "BN" && slot !== "IR");
}

function createTeams(league: LeagueConfig): TeamRosterState[] {
  const starters = starterSlots(league);
  return Array.from({ length: league.teams }, (_, index) => ({
    teamId: buildTeamId(index),
    starters: [],
    bench: [],
    positionCounts: {},
    openSlots: [...starters],
  }));
}

export function getSnakePickInfo(overallPick: number, teamCount: number) {
  const round = Math.floor((overallPick - 1) / teamCount) + 1;
  const pickInRound = ((overallPick - 1) % teamCount) + 1;
  const teamIndex = round % 2 === 1 ? pickInRound - 1 : teamCount - pickInRound;

  return {
    round,
    pickInRound,
    teamIndex,
    teamId: buildTeamId(teamIndex),
  };
}

export function calculatePicksUntilNextTurn(
  currentPick: number,
  teamCount: number,
  myTeamId: string,
) {
  for (let nextPick = currentPick + 1; nextPick <= currentPick + teamCount * 2; nextPick += 1) {
    if (getSnakePickInfo(nextPick, teamCount).teamId === myTeamId) {
      return nextPick - currentPick - 1;
    }
  }

  return teamCount - 1;
}

function nextOpenOverallPick(drafted: DraftPickEvent[], start: number) {
  const occupied = new Set(drafted.map((pick) => pick.overallPick));
  let pick = Math.max(1, start);
  while (occupied.has(pick)) pick += 1;
  return pick;
}

type InitialDraftStateOptions = Partial<Pick<DraftState, "currentPick" | "focus" | "myTeamId">> & {
  league?: LeagueConfig;
};

function buildInitialDraftState(
  candidates: DraftCandidate[],
  options?: InitialDraftStateOptions,
): DraftState {
  const league = options?.league ?? yahooLeagueConfig;
  const myTeamId = options?.myTeamId ?? `team-${leagueSourceOfTruth.draft.mySlot}`;
  const currentPick = options?.currentPick ?? 1;

  return {
    leagueConfigVersion: leagueSourceOfTruth.version,
    leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
    league,
    myTeamId,
    currentPick,
    picksUntilNextTurn: calculatePicksUntilNextTurn(currentPick, league.teams, myTeamId),
    availablePlayerIds: candidates.map((candidate) => candidate.player.id),
    drafted: [],
    teams: createTeams(league),
    focus: options?.focus ?? "balanced",
    opponentProfiles: {},
  };
}

export function createInitialDraftState(
  candidates: DraftCandidate[],
  options?: InitialDraftStateOptions,
): DraftState {
  const state = buildInitialDraftState(candidates, options);
  assertDraftStateMatchesSourceOfTruth(state);
  return state;
}

/** Diagnostic-only constructor for simulations that intentionally vary slot or league shape. */
export function createSimulationDraftState(
  candidates: DraftCandidate[],
  options?: InitialDraftStateOptions,
): DraftState {
  return buildInitialDraftState(candidates, options);
}

export function assertDraftStateMatchesSourceOfTruth(state: DraftState) {
  if (state.leagueConfigVersion !== leagueSourceOfTruth.version) {
    throw new Error(
      `Draft state version ${state.leagueConfigVersion ?? "missing"} does not match ${leagueSourceOfTruth.version}. Refusing stale draft state.`,
    );
  }
  if (state.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error(
      `Draft state fingerprint ${state.leagueConfigFingerprint ?? "missing"} does not match ${leagueSourceOfTruthFingerprint}. Refusing stale draft state.`,
    );
  }
  assertLeagueMatchesSourceOfTruth(state.league);
  assertManagerTeamMatchesSourceOfTruth(state.myTeamId);
}

function fillSlot(team: TeamRosterState, position: PlayerPosition) {
  const exactIndex = team.openSlots.findIndex((slot) => slot === position);
  if (exactIndex >= 0) {
    return team.openSlots.splice(exactIndex, 1)[0];
  }

  if (FLEX_ELIGIBLE.includes(position)) {
    const flexIndex = team.openSlots.findIndex((slot) => slot === "W/R/T");
    if (flexIndex >= 0) {
      return team.openSlots.splice(flexIndex, 1)[0];
    }
  }

  return null;
}

function updateTeamWithPick(
  team: TeamRosterState,
  playerId: string,
  position: PlayerPosition,
): TeamRosterState {
  const nextTeam: TeamRosterState = {
    ...team,
    starters: [...team.starters],
    bench: [...team.bench],
    positionCounts: { ...team.positionCounts },
    openSlots: [...team.openSlots],
  };

  const usedSlot = fillSlot(nextTeam, position);
  if (usedSlot) {
    nextTeam.starters.push(playerId);
  } else {
    nextTeam.bench.push(playerId);
  }

  nextTeam.positionCounts[position] = (nextTeam.positionCounts[position] ?? 0) + 1;
  return nextTeam;
}

type SeededDraftPick = {
  overallPick: number;
  playerId: string;
  teamId: string;
  pickedAt?: string;
  source?: DraftPickEvent["source"];
  eventType?: DraftPickEvent["eventType"];
};

export function seedDraftStateWithKnownPicks(
  state: DraftState,
  candidates: DraftCandidate[],
  picks: SeededDraftPick[],
  options?: {
    currentPick?: number;
  },
): DraftState {
  assertDraftStateMatchesSourceOfTruth(state);
  const keeperRoundsByTeam = new Map<string, number[]>();
  for (const pick of picks) {
    const pickInfo = getSnakePickInfo(pick.overallPick, state.league.teams);
    if (pickInfo.teamId !== pick.teamId) {
      throw new Error(
        `Pick ${pick.overallPick} belongs to ${pickInfo.teamId} in the canonical ${state.league.teams}-team order, not ${pick.teamId}.`,
      );
    }
    if ((pick.eventType ?? "keeper") !== "keeper") continue;
    keeperRoundsByTeam.set(
      pick.teamId,
      [...(keeperRoundsByTeam.get(pick.teamId) ?? []), pickInfo.round],
    );
  }
  for (const [teamId, rounds] of keeperRoundsByTeam) {
    const ordered = [...rounds].sort((a, b) => a - b);
    if (ordered.length > leagueSourceOfTruth.keepers.maximumPerTeam) {
      throw new Error(
        `${teamId} has ${ordered.length} keepers; canonical maximum is ${leagueSourceOfTruth.keepers.maximumPerTeam}.`,
      );
    }
    const expected = Array.from({ length: ordered.length }, (_, index) => index + 1);
    if (ordered.join(",") !== expected.join(",")) {
      throw new Error(
        `${teamId} keeper rounds ${ordered.join(", ")} violate ordinal costs; expected ${expected.join(", ")}.`,
      );
    }
  }

  let nextState: DraftState = {
    ...state,
    drafted: [...state.drafted],
    availablePlayerIds: [...state.availablePlayerIds],
    teams: state.teams.map((team) => ({
      ...team,
      starters: [...team.starters],
      bench: [...team.bench],
      positionCounts: { ...team.positionCounts },
      openSlots: [...team.openSlots],
    })),
    opponentProfiles: { ...(state.opponentProfiles ?? {}) },
  };

  const orderedPicks = [...picks].sort((a, b) => a.overallPick - b.overallPick);

  for (const pick of orderedPicks) {
    if (!nextState.availablePlayerIds.includes(pick.playerId)) {
      continue;
    }

    const candidate = candidates.find((item) => item.player.id === pick.playerId);
    if (!candidate) {
      continue;
    }

    const pickInfo = getSnakePickInfo(pick.overallPick, nextState.league.teams);
    const draftEvent: DraftPickEvent = {
      overallPick: pick.overallPick,
      round: pickInfo.round,
      pickInRound: pickInfo.pickInRound,
      teamId: pick.teamId,
      playerId: pick.playerId,
      pickedAt: pick.pickedAt ?? new Date().toISOString(),
      source: pick.source ?? "manual",
      eventType: pick.eventType ?? "keeper",
    };

    nextState = {
      ...nextState,
      availablePlayerIds: nextState.availablePlayerIds.filter((id) => id !== pick.playerId),
      drafted: [draftEvent, ...nextState.drafted],
      teams: nextState.teams.map((team) =>
        team.teamId === pick.teamId
          ? updateTeamWithPick(team, pick.playerId, candidate.player.positions[0] ?? "WR")
          : team,
      ),
    };
  }

  const currentPick = nextOpenOverallPick(
    nextState.drafted,
    options?.currentPick ?? nextState.currentPick,
  );

  return {
    ...nextState,
    currentPick,
    picksUntilNextTurn: calculatePicksUntilNextTurn(
      currentPick,
      nextState.league.teams,
      nextState.myTeamId,
    ),
  };
}

export function applyDraftPick(
  state: DraftState,
  candidate: DraftCandidate,
  teamId = getSnakePickInfo(state.currentPick, state.league.teams).teamId,
  options?: Partial<Pick<DraftPickEvent, "pickedAt" | "source">>,
): DraftState {
  const playerId = candidate.player.id;
  if (!state.availablePlayerIds.includes(playerId)) {
    return state;
  }

  const pickInfo = getSnakePickInfo(state.currentPick, state.league.teams);
  const draftEvent: DraftPickEvent = {
    overallPick: state.currentPick,
    round: pickInfo.round,
    pickInRound: pickInfo.pickInRound,
    teamId,
    playerId,
    pickedAt: options?.pickedAt ?? new Date().toISOString(),
    source: options?.source ?? "manual",
    eventType: "live",
  };

  const teams = state.teams.map((team) =>
    team.teamId === teamId
      ? updateTeamWithPick(team, playerId, candidate.player.positions[0] ?? "WR")
      : team,
  );
  const nextDrafted = [draftEvent, ...state.drafted];
  const nextPick = nextOpenOverallPick(nextDrafted, state.currentPick + 1);

  return {
    ...state,
    currentPick: nextPick,
    picksUntilNextTurn: calculatePicksUntilNextTurn(nextPick, state.league.teams, state.myTeamId),
    availablePlayerIds: state.availablePlayerIds.filter((id) => id !== playerId),
    drafted: nextDrafted,
    teams,
  };
}

export function undoLastDraftPick(
  state: DraftState,
  candidates: DraftCandidate[],
): DraftState {
  const lastPickIndex = state.drafted.findIndex((pick) => pick.eventType !== "keeper");
  const lastPick = lastPickIndex >= 0 ? state.drafted[lastPickIndex] : undefined;
  if (!lastPick) {
    return state;
  }
  const rest = state.drafted.filter((_, index) => index !== lastPickIndex);

  const candidate = candidates.find((item) => item.player.id === lastPick.playerId);
  if (!candidate) {
    return state;
  }

  const position = candidate.player.positions[0] ?? "WR";
  const teams = state.teams.map((team) => {
    if (team.teamId !== lastPick.teamId) {
      return team;
    }

    const starters = [...team.starters];
    const bench = [...team.bench];
    const starterIndex = starters.lastIndexOf(lastPick.playerId);
    if (starterIndex >= 0) {
      starters.splice(starterIndex, 1);
    } else {
      const benchIndex = bench.lastIndexOf(lastPick.playerId);
      if (benchIndex >= 0) {
        bench.splice(benchIndex, 1);
      }
    }

    return {
      ...team,
      starters,
      bench,
      positionCounts: {
        ...team.positionCounts,
        [position]: Math.max(0, (team.positionCounts[position] ?? 1) - 1),
      },
      openSlots: starterIndex >= 0
        ? [...team.openSlots, inferReturnedSlot(position, team.openSlots)]
        : [...team.openSlots],
    };
  });

  const currentPick = lastPick.overallPick;
  return {
    ...state,
    currentPick,
    picksUntilNextTurn: calculatePicksUntilNextTurn(currentPick, state.league.teams, state.myTeamId),
    availablePlayerIds: [lastPick.playerId, ...state.availablePlayerIds],
    drafted: rest,
    teams,
  };
}

export function reconcileSavedDraftState(
  saved: DraftState,
  candidates: DraftCandidate[],
  fallback: DraftState,
) {
  assertDraftStateMatchesSourceOfTruth(saved);
  assertDraftStateMatchesSourceOfTruth(fallback);
  const candidateIds = new Set(candidates.map((candidate) => candidate.player.id));
  const validEvents = Array.isArray(saved.drafted)
    ? saved.drafted.filter((event) => candidateIds.has(event.playerId))
    : [];
  const droppedCount = (saved.drafted?.length ?? 0) - validEvents.length;
  const base = createInitialDraftState(candidates, {
    league: saved.league,
    myTeamId: saved.myTeamId,
    currentPick: 1,
    focus: saved.focus ?? fallback.focus,
  });
  const rebuilt = seedDraftStateWithKnownPicks(
    base,
    candidates,
    validEvents.map((event) => ({
      overallPick: event.overallPick,
      playerId: event.playerId,
      teamId: event.teamId,
      pickedAt: event.pickedAt,
      source: event.source,
      eventType: event.eventType ?? "live",
    })),
    { currentPick: Math.max(1, saved.currentPick ?? 1) },
  );
  return { state: rebuilt, droppedCount };
}

function inferReturnedSlot(position: PlayerPosition, openSlots: string[]) {
  if (FLEX_ELIGIBLE.includes(position) && !openSlots.includes("W/R/T")) {
    return "W/R/T";
  }
  return position;
}
