import { createInitialDraftState, seedDraftStateWithKnownPicks } from "@/lib/fantasy/draftState";
import type { DraftCandidate, DraftState, LeagueConfig } from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

export type LeagueSetupInput = {
  teamNames: string;
  myTeamName: string;
  myDraftSlot: string;
  draftOrder: string;
  keepers: string;
};

export type LeagueSetupResolution = {
  ready: boolean;
  teamNames: string[];
  myTeamId: string | null;
  keeperCount: number;
  state: DraftState | null;
  receipts: string[];
  errors: string[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]/g, "");
}

export function parseOrderedNames(value: string) {
  return value.split(/\n|,/).map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim()).filter(Boolean);
}

function pickForRound(round: number, slot: number, teams: number) {
  const pickInRound = round % 2 === 1 ? slot : teams - slot + 1;
  return (round - 1) * teams + pickInRound;
}

function splitKeeperLine(line: string) {
  return line.split(/\s+(?:—|–|-|\|)\s+|\t+/).map((part) => part.trim()).filter(Boolean);
}

export function resolveLeagueSetup(
  input: LeagueSetupInput,
  candidates: DraftCandidate[],
  league: LeagueConfig,
): LeagueSetupResolution {
  const errors: string[] = [];
  const receipts: string[] = [];
  const ordered = parseOrderedNames(input.draftOrder);
  const listed = parseOrderedNames(input.teamNames);
  const teamNames = ordered.length > 0 ? ordered : listed;
  if (teamNames.length !== league.teams) errors.push(`Expected ${league.teams} ordered teams; found ${teamNames.length}.`);
  if (new Set(teamNames.map(normalize)).size !== teamNames.length) errors.push("Team names must be unique.");

  const requestedSlot = Number.parseInt(input.myDraftSlot, 10);
  const namedIndex = input.myTeamName.trim()
    ? teamNames.findIndex((name) => normalize(name) === normalize(input.myTeamName))
    : -1;
  if (input.myTeamName.trim() && namedIndex < 0) errors.push(`Your team “${input.myTeamName.trim()}” was not found in the official order.`);
  if (!Number.isInteger(requestedSlot) || requestedSlot < 1 || requestedSlot > league.teams) errors.push(`Draft slot must be between 1 and ${league.teams}.`);
  if (namedIndex >= 0 && Number.isInteger(requestedSlot) && namedIndex + 1 !== requestedSlot) {
    errors.push(`Your team is slot ${namedIndex + 1} in the pasted order, not slot ${requestedSlot}.`);
  }
  const slot = namedIndex >= 0 ? namedIndex + 1 : requestedSlot;
  const myTeamId = Number.isInteger(slot) && slot >= 1 && slot <= league.teams ? `team-${slot}` : null;
  if (myTeamId && myTeamId !== `team-${leagueSourceOfTruth.draft.mySlot}`) {
    errors.push(
      `Canonical league configuration places your team in slot ${leagueSourceOfTruth.draft.mySlot}, not slot ${slot}. Update leagueSourceOfTruth.ts first if the official order changed.`,
    );
  }

  const candidateByName = new Map<string, DraftCandidate[]>();
  for (const candidate of candidates) {
    const key = normalize(candidate.player.fullName);
    candidateByName.set(key, [...(candidateByName.get(key) ?? []), candidate]);
  }
  const teamIdByName = new Map(teamNames.map((name, index) => [normalize(name), `team-${index + 1}`]));
  const keeperPicks: Array<{ overallPick: number; playerId: string; teamId: string; eventType: "keeper" }> = [];
  const keeperRoundsByTeam = new Map<string, number[]>();
  const occupiedPicks = new Set<number>();
  const keeperLines = input.keepers.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const [index, line] of keeperLines.entries()) {
    const parts = splitKeeperLine(line);
    if (parts.length < 3) {
      errors.push(`Keeper line ${index + 1} needs “Team — Player — Round N”.`);
      continue;
    }
    const teamId = teamIdByName.get(normalize(parts[0]));
    const candidatesForName = candidateByName.get(normalize(parts[1])) ?? [];
    const roundMatch = parts.slice(2).join(" ").match(/(?:round|rd|r)?\s*(\d+)/i);
    const round = roundMatch ? Number.parseInt(roundMatch[1], 10) : NaN;
    if (!teamId) errors.push(`Keeper line ${index + 1}: team “${parts[0]}” did not match the official order.`);
    if (candidatesForName.length !== 1) errors.push(`Keeper line ${index + 1}: player “${parts[1]}” matched ${candidatesForName.length} players.`);
    if (!Number.isInteger(round) || round < 1) errors.push(`Keeper line ${index + 1}: round cost is missing or invalid.`);
    if (!teamId || candidatesForName.length !== 1 || !Number.isInteger(round) || round < 1) continue;
    const teamSlot = Number(teamId.replace("team-", ""));
    const overallPick = pickForRound(round, teamSlot, league.teams);
    if (occupiedPicks.has(overallPick)) {
      errors.push(`Keeper line ${index + 1}: pick ${overallPick} is already consumed.`);
      continue;
    }
    occupiedPicks.add(overallPick);
    keeperRoundsByTeam.set(teamId, [...(keeperRoundsByTeam.get(teamId) ?? []), round]);
    keeperPicks.push({ overallPick, playerId: candidatesForName[0].player.id, teamId, eventType: "keeper" });
    receipts.push(`${parts[0]} · ${candidatesForName[0].player.fullName} · Round ${round} (overall ${overallPick})`);
  }
  for (const [teamId, rounds] of keeperRoundsByTeam) {
    const orderedRounds = [...rounds].sort((a, b) => a - b);
    if (orderedRounds.length > leagueSourceOfTruth.keepers.maximumPerTeam) {
      errors.push(
        `${teamId} declares ${orderedRounds.length} keepers; the canonical maximum is ${leagueSourceOfTruth.keepers.maximumPerTeam}.`,
      );
    }
    const expectedRounds = Array.from({ length: orderedRounds.length }, (_, index) => index + 1);
    if (orderedRounds.join(",") !== expectedRounds.join(",")) {
      errors.push(
        `${teamId} keeper rounds are ${orderedRounds.join(", ")}; ordinal keeper costs must consume Rounds ${expectedRounds.join(", ")}.`,
      );
    }
  }
  if (keeperLines.length === 0) errors.push("Enter the league-wide keepers, or explicitly enter “None” after the parser supports a no-keeper league.");
  if (errors.length > 0 || !myTeamId) return { ready: false, teamNames, myTeamId, keeperCount: keeperPicks.length, state: null, receipts, errors };

  const initial = createInitialDraftState(candidates, { league, myTeamId, currentPick: 1, focus: "structural" });
  const state = seedDraftStateWithKnownPicks(initial, candidates, keeperPicks, { currentPick: 1 });
  return { ready: true, teamNames, myTeamId, keeperCount: keeperPicks.length, state, receipts, errors };
}
