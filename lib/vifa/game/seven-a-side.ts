import {
  getSevenFormation,
  SEVEN_A_SIDE_FORMATIONS,
  type SevenFormationId,
} from './teams/formations';
import {
  buildSquad,
  computeOverallRating,
  makeIndividualStats,
  type RatingTuple,
  type SquadRole,
  type TeamData,
} from './teams/types';

export interface SelectableSquadPlayer {
  id: string;
  num: number;
  name: string;
  role: SquadRole;
  ratings: RatingTuple;
  overallRating: number;
}

export type SevenRole = SquadRole;

export const SEVEN_ROLE_ORDER: SevenRole[] = ['GK', 'DF', 'MF', 'ST'];

export interface FormationAssignment {
  player: SelectableSquadPlayer;
  targetRole: SquadRole;
  slotIndex: number;
  fitRating: number;
}

export function makeSelectableSquadPlayer(input: Omit<SelectableSquadPlayer, 'overallRating'>): SelectableSquadPlayer {
  return {
    ...input,
    overallRating: computeOverallRating(
      input.role,
      makeIndividualStats(input.role, input.ratings),
    ),
  };
}

function roleFitRating(player: SelectableSquadPlayer, targetRole: SquadRole): number {
  return computeOverallRating(
    targetRole,
    makeIndividualStats(targetRole, player.ratings),
  );
}

function bestOutfieldAssignment(
  candidates: SelectableSquadPlayer[],
  formationId: SevenFormationId,
): FormationAssignment[] {
  const formation = getSevenFormation(formationId);
  const slotRoles = formation.roles.slice(1);
  const fullMask = (1 << slotRoles.length) - 1;
  type State = { score: number; assignments: FormationAssignment[] };
  let states: Array<State | null> = Array(1 << slotRoles.length).fill(null);
  states[0] = { score: 0, assignments: [] };

  for (const player of candidates
    .filter((candidate) => candidate.role !== 'GK')
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const next = states.slice();
    for (let mask = 0; mask <= fullMask; mask++) {
      const state = states[mask];
      if (!state) continue;
      for (let slotIndex = 0; slotIndex < slotRoles.length; slotIndex++) {
        const bit = 1 << slotIndex;
        if (mask & bit) continue;
        const targetRole = slotRoles[slotIndex];
        const fitRating = roleFitRating(player, targetRole);
        const candidate: State = {
          score: state.score + fitRating,
          assignments: [
            ...state.assignments,
            { player, targetRole, slotIndex: slotIndex + 1, fitRating },
          ],
        };
        const nextMask = mask | bit;
        if (!next[nextMask] || candidate.score > next[nextMask]!.score) {
          next[nextMask] = candidate;
        }
      }
    }
    states = next;
  }

  return states[fullMask]?.assignments.sort((a, b) => a.slotIndex - b.slotIndex) ?? [];
}

export function assignPlayersToFormation(
  squad: SelectableSquadPlayer[],
  selectedIds: string[],
  formationId: SevenFormationId,
): FormationAssignment[] {
  const selected = new Set(selectedIds);
  const goalkeeper = squad
    .filter((player) => selected.has(player.id) && player.role === 'GK')
    .sort((a, b) => b.overallRating - a.overallRating)[0];
  if (!goalkeeper) return [];
  const outfield = squad.filter((player) => selected.has(player.id) && player.role !== 'GK');
  if (outfield.length !== 6) return [];
  return [
    {
      player: goalkeeper,
      targetRole: 'GK',
      slotIndex: 0,
      fitRating: goalkeeper.overallRating,
    },
    ...bestOutfieldAssignment(outfield, formationId),
  ];
}

export function pickBalancedSeven(
  squad: SelectableSquadPlayer[],
  formationId: SevenFormationId = '2-2-2',
): string[] {
  const goalkeeper = squad
    .filter((player) => player.role === 'GK')
    .sort((a, b) => b.overallRating - a.overallRating)[0];
  const assignments = bestOutfieldAssignment(squad, formationId);
  return goalkeeper
    ? [goalkeeper.id, ...assignments.map(({ player }) => player.id)]
    : [];
}

const FORMATION_COUNTERS: Record<SevenFormationId, Partial<Record<SevenFormationId, number>>> = {
  '2-2-2': { '2-3-1': 2.2, '1-3-2': 1.2 },
  '3-2-1': { '2-3-1': 2.8, '1-2-3': 1.2 },
  '1-2-3': { '3-2-1': 3.2, '3-1-2': 2.2 },
  '2-3-1': { '1-3-2': 2.8, '3-1-2': 1.2 },
  '1-3-2': { '3-1-2': 3, '3-2-1': 1.2 },
  '3-1-2': { '2-3-1': 2.8, '2-2-2': 1.2 },
};

function formationRosterFit(
  squad: SelectableSquadPlayer[],
  formationId: SevenFormationId,
): number {
  const goalkeeper = squad
    .filter((player) => player.role === 'GK')
    .sort((a, b) => b.overallRating - a.overallRating)[0];
  const assignments = bestOutfieldAssignment(squad, formationId);
  if (!goalkeeper || assignments.length !== 6) return 0;
  return (
    goalkeeper.overallRating
    + assignments.reduce((total, assignment) => total + assignment.fitRating, 0)
  ) / 7;
}

/** Pick a CPU shape from both roster suitability and the opponent's locked
 * formation. A tiny seeded tie-break keeps repeated matchups deterministic. */
export function chooseCpuFormation(
  squad: SelectableSquadPlayer[],
  opponentFormationId: SevenFormationId,
  seed: number,
): SevenFormationId {
  let best = SEVEN_A_SIDE_FORMATIONS[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < SEVEN_A_SIDE_FORMATIONS.length; index++) {
    const formation = SEVEN_A_SIDE_FORMATIONS[index];
    const rosterFit = formationRosterFit(squad, formation.id);
    const counterBonus = FORMATION_COUNTERS[opponentFormationId][formation.id] ?? 0;
    let styleSeed = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    styleSeed ^= styleSeed << 13;
    styleSeed ^= styleSeed >>> 17;
    styleSeed ^= styleSeed << 5;
    const managerPreference = ((styleSeed >>> 0) / 0x1_0000_0000) * 2.8 - 1.4;
    const balancedFloor = formation.id === '2-2-2' ? 1.1 : 0;
    const score = rosterFit + counterBonus + managerPreference + balancedFloor;
    if (score > bestScore) {
      best = formation;
      bestScore = score;
    }
  }
  return best.id;
}

export function isCompleteSeven(
  squad: SelectableSquadPlayer[],
  selectedIds: string[],
): boolean {
  const selected = new Set(selectedIds);
  const selectedPlayers = squad.filter((player) => selected.has(player.id));
  return selected.size === 7
    && selectedPlayers.length === 7
    && selectedPlayers.filter((player) => player.role === 'GK').length === 1
    && selectedPlayers.filter((player) => player.role !== 'GK').length === 6;
}

type TeamShell = Omit<TeamData, 'formation' | 'kickoffFwd' | 'players'>;

export function buildSevenASideTeam(
  shell: TeamShell,
  squad: SelectableSquadPlayer[],
  requestedIds: string[],
  formationId: SevenFormationId = '2-2-2',
): TeamData {
  const selectedIds = isCompleteSeven(squad, requestedIds)
    ? requestedIds
    : pickBalancedSeven(squad, formationId);
  const formation = getSevenFormation(formationId);
  const assignments = assignPlayersToFormation(squad, selectedIds, formationId);

  if (assignments.length !== 7) {
    throw new Error(`${shell.name} does not have a valid 7-a-side squad`);
  }

  return {
    ...shell,
    formation: formation.id,
    kickoffFwd: formation.roles.findIndex((role) => role === 'ST'),
    players: buildSquad(
      formation.positions,
      assignments.map(({ player, targetRole }) => ({
        num: player.num,
        name: player.name,
        r: player.ratings,
        role: targetRole,
      })),
    ),
  };
}
