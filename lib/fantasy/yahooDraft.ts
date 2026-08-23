import { applyDraftPick, createInitialDraftState, getSnakePickInfo, seedDraftStateWithKnownPicks } from "@/lib/fantasy/draftState";
import type { DraftCandidate, DraftState } from "@/lib/fantasy/types";

export type YahooDraftRawEvent = {
  overallPick?: number;
  round?: number;
  pickInRound?: number;
  teamId?: string;
  teamLabel?: string;
  playerName: string;
  yahooPlayerId?: string;
  team?: string;
  position?: string;
  pickedAt?: string;
};

export type YahooDraftImportResult = {
  startingPick: number;
  endingPick: number;
  appliedCount: number;
  skippedCount: number;
  messages: string[];
  outcomes: YahooDraftImportOutcome[];
  draftState: DraftState;
};

export type YahooDraftImportOutcome =
  | {
      status: "applied";
      playerName: string;
      overallPick: number;
      teamId: string;
      resolvedPlayerId: string;
      resolvedPlayerLabel: string;
      boardPickBefore: number;
    }
  | {
      status: "skipped";
      playerName: string;
      overallPick?: number;
      teamId?: string;
      boardPickBefore: number;
      reason: string;
    };

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTeamId(value: string, leagueTeams: number) {
  const direct = value.trim().toLowerCase();
  if (/^team-\d+$/.test(direct)) {
    return direct;
  }

  const numeric = Number.parseInt(direct.replace(/[^\d]/g, ""), 10);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= leagueTeams) {
    return `team-${numeric}`;
  }

  return null;
}

function resolveCandidate(
  event: YahooDraftRawEvent,
  candidates: DraftCandidate[],
  availablePlayerIds: string[],
) {
  const byYahooId = event.yahooPlayerId
    ? candidates.filter(
        (candidate) =>
          candidate.player.externalIds.yahoo === event.yahooPlayerId &&
          availablePlayerIds.includes(candidate.player.id),
      )
    : [];

  if (byYahooId.length === 1) {
    return byYahooId[0];
  }
  if (byYahooId.length > 1) {
    return undefined;
  }

  const normalizedPlayerName = normalizeName(event.playerName);
  const desiredTeam = event.team?.toLowerCase();
  const desiredPosition = event.position?.toUpperCase();

  const matches = candidates.filter((candidate) => {
    if (!availablePlayerIds.includes(candidate.player.id)) {
      return false;
    }

    if (normalizeName(candidate.player.fullName) !== normalizedPlayerName) {
      return false;
    }

    if (desiredTeam && candidate.player.team.toLowerCase() !== desiredTeam) {
      return false;
    }

    if (desiredPosition && !candidate.player.positions.includes(desiredPosition as never)) {
      return false;
    }

    return true;
  });

  return matches.length === 1 ? matches[0] : undefined;
}

export function parseYahooDraftEvents(input: string): YahooDraftRawEvent[] {
  const parsed = JSON.parse(input) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "events" in parsed
      ? (parsed as { events: unknown[] }).events
      : [parsed];

  const events: YahooDraftRawEvent[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const record = row as Record<string, unknown>;
    const playerName = String(
      record.playerName ?? record.player_name ?? record.name ?? "",
    ).trim();
    if (!playerName) {
      continue;
    }

    events.push({
      overallPick:
        typeof record.overallPick === "number"
          ? record.overallPick
          : typeof record.overall_pick === "number"
            ? record.overall_pick
            : undefined,
      round:
        typeof record.round === "number"
          ? record.round
          : undefined,
      pickInRound:
        typeof record.pickInRound === "number"
          ? record.pickInRound
          : typeof record.pick_in_round === "number"
            ? record.pick_in_round
            : undefined,
      teamId:
        typeof record.teamId === "string"
          ? record.teamId
          : typeof record.team_id === "string"
            ? record.team_id
            : undefined,
      teamLabel:
        typeof record.teamLabel === "string"
          ? record.teamLabel
          : typeof record.team_label === "string"
            ? record.team_label
            : undefined,
      playerName,
      yahooPlayerId:
        typeof record.yahooPlayerId === "string"
          ? record.yahooPlayerId
          : typeof record.yahoo_player_id === "string"
            ? record.yahoo_player_id
            : undefined,
      team: typeof record.team === "string" ? record.team : undefined,
      position:
        typeof record.position === "string"
          ? record.position
          : typeof record.pos === "string"
            ? record.pos
            : undefined,
      pickedAt:
        typeof record.pickedAt === "string"
          ? record.pickedAt
          : typeof record.picked_at === "string"
            ? record.picked_at
            : undefined,
    });
  }

  return events;
}

export function applyYahooDraftEvents(
  state: DraftState,
  candidates: DraftCandidate[],
  events: YahooDraftRawEvent[],
): YahooDraftImportResult {
  let nextState = state;
  const messages: string[] = [];
  const outcomes: YahooDraftImportOutcome[] = [];
  let appliedCount = 0;
  let skippedCount = 0;
  const startingPick = state.currentPick;

  for (const event of events) {
    const boardPickBefore = nextState.currentPick;

    if (event.overallPick && event.overallPick !== nextState.currentPick) {
      const reason = `event says pick ${event.overallPick}, but the board is on pick ${nextState.currentPick}.`;
      messages.push(`Skipped ${event.playerName}: ${reason}`);
      outcomes.push({
        status: "skipped",
        playerName: event.playerName,
        overallPick: event.overallPick,
        teamId: event.teamId,
        boardPickBefore,
        reason,
      });
      skippedCount += 1;
      continue;
    }

    const candidate = resolveCandidate(event, candidates, nextState.availablePlayerIds);
    if (!candidate) {
      const reason = "no available candidate match found.";
      messages.push(`Skipped ${event.playerName}: ${reason}`);
      outcomes.push({
        status: "skipped",
        playerName: event.playerName,
        overallPick: event.overallPick,
        teamId: event.teamId,
        boardPickBefore,
        reason,
      });
      skippedCount += 1;
      continue;
    }

    const derivedTeamId =
      (event.teamId && normalizeTeamId(event.teamId, nextState.league.teams)) ??
      (event.teamLabel && normalizeTeamId(event.teamLabel, nextState.league.teams)) ??
      getSnakePickInfo(nextState.currentPick, nextState.league.teams).teamId;

    nextState = applyDraftPick(nextState, candidate, derivedTeamId, {
      pickedAt: event.pickedAt,
      source: "yahoo-browser",
    });
    outcomes.push({
      status: "applied",
      playerName: event.playerName,
      overallPick: event.overallPick ?? boardPickBefore,
      teamId: derivedTeamId,
      resolvedPlayerId: candidate.player.id,
      resolvedPlayerLabel: `${candidate.player.fullName} · ${candidate.player.positions.join("/")} · ${candidate.player.team}`,
      boardPickBefore,
    });
    appliedCount += 1;
  }

  if (appliedCount > 0) {
    messages.unshift(`Applied ${appliedCount} Yahoo draft event${appliedCount === 1 ? "" : "s"}.`);
  }

  return {
    startingPick,
    endingPick: nextState.currentPick,
    appliedCount,
    skippedCount,
    messages,
    outcomes,
    draftState: nextState,
  };
}

export function reconcileYahooDraftSnapshot(
  state: DraftState,
  candidates: DraftCandidate[],
  events: YahooDraftRawEvent[],
) {
  const errors: string[] = [];
  const receipts: string[] = [];
  const picks = new Map<number, { overallPick: number; playerId: string; teamId: string; pickedAt?: string; source: "yahoo-browser"; eventType: "live" }>();
  const usedPlayers = new Set<string>();
  for (const event of events) {
    if (!event.overallPick || event.overallPick < 1) {
      errors.push(`${event.playerName}: full-snapshot recovery requires overallPick.`);
      continue;
    }
    const candidate = resolveCandidate(event, candidates, candidates.map((item) => item.player.id));
    if (!candidate) {
      errors.push(`${event.playerName} at Pick ${event.overallPick}: no unique canonical player match.`);
      continue;
    }
    if (usedPlayers.has(candidate.player.id)) {
      errors.push(`${candidate.player.fullName}: appears more than once in the snapshot.`);
      continue;
    }
    if (picks.has(event.overallPick)) {
      errors.push(`Pick ${event.overallPick}: more than one player was supplied.`);
      continue;
    }
    const teamId = (event.teamId && normalizeTeamId(event.teamId, state.league.teams)) ??
      getSnakePickInfo(event.overallPick, state.league.teams).teamId;
    usedPlayers.add(candidate.player.id);
    picks.set(event.overallPick, {
      overallPick: event.overallPick,
      playerId: candidate.player.id,
      teamId,
      pickedAt: event.pickedAt,
      source: "yahoo-browser",
      eventType: "live",
    });
    receipts.push(`Pick ${event.overallPick} · ${candidate.player.fullName} · ${teamId}`);
  }
  const keepers = state.drafted.filter((pick) => pick.eventType === "keeper").map((pick) => ({
    overallPick: pick.overallPick,
    playerId: pick.playerId,
    teamId: pick.teamId,
    pickedAt: pick.pickedAt,
    source: pick.source,
    eventType: "keeper" as const,
  }));
  for (const keeper of keepers) {
    const conflict = picks.get(keeper.overallPick);
    if (conflict && conflict.playerId !== keeper.playerId) errors.push(`Pick ${keeper.overallPick} conflicts with a resolved keeper.`);
  }
  if (errors.length > 0) return { applied: false, state, errors, receipts };
  const base = createInitialDraftState(candidates, {
    league: state.league,
    myTeamId: state.myTeamId,
    currentPick: 1,
    focus: state.focus,
  });
  const next = seedDraftStateWithKnownPicks(base, candidates, [...keepers, ...picks.values()], { currentPick: 1 });
  return { applied: true, state: next, errors, receipts };
}

export const yahooDraftFixtureEvents: YahooDraftRawEvent[] = [
  {
    overallPick: 1,
    teamId: "team-1",
    playerName: "Jahmyr Gibbs",
    yahooPlayerId: "40059",
    team: "DET",
    position: "RB",
  },
  {
    overallPick: 2,
    teamId: "team-2",
    playerName: "Bijan Robinson",
    yahooPlayerId: "33186",
    team: "ATL",
    position: "RB",
  },
];
