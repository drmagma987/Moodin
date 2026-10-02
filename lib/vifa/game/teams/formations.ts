// Shared formation position templates (fractions of the field, attacking
// RIGHT). Index 0 = GK, 1–4 = back line, then midfield, then attack. Real
// squads reference one of these so each country file only carries names,
// numbers and kit colours.
import type { SquadRole, Vec } from './types';

export type SevenFormationId =
  | '2-2-2'
  | '3-2-1'
  | '1-2-3'
  | '2-3-1'
  | '1-3-2'
  | '3-1-2';

export interface SevenFormation {
  id: SevenFormationId;
  name: string;
  identity: string;
  tradeoff: string;
  positions: Vec[];
  roles: SquadRole[];
}

// 7-a-side 2-2-2: [GK, RCB, LCB, RCM, LCM, RS, LS]
export const F_222_SEVEN: Vec[] = [
  { x: 0.055, y: 0.5 },
  { x: 0.2, y: 0.32 },
  { x: 0.2, y: 0.68 },
  { x: 0.38, y: 0.34 },
  { x: 0.38, y: 0.66 },
  { x: 0.56, y: 0.38 },
  { x: 0.56, y: 0.62 },
];

export const SEVEN_A_SIDE_FORMATIONS: SevenFormation[] = [
  {
    id: '2-2-2',
    name: 'Balanced',
    identity: 'Passing triangles across every line',
    tradeoff: 'Reliable shape without a numerical advantage in any band.',
    positions: F_222_SEVEN,
    roles: ['GK', 'DF', 'DF', 'MF', 'MF', 'ST', 'ST'],
  },
  {
    id: '3-2-1',
    name: 'Fortress',
    identity: 'Three-player defensive base',
    tradeoff: 'Hard to counter, but the lone attacker can become isolated.',
    positions: [
      { x: 0.055, y: 0.5 },
      { x: 0.18, y: 0.23 },
      { x: 0.16, y: 0.5 },
      { x: 0.18, y: 0.77 },
      { x: 0.38, y: 0.35 },
      { x: 0.38, y: 0.65 },
      { x: 0.57, y: 0.5 },
    ],
    roles: ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'ST'],
  },
  {
    id: '1-2-3',
    name: 'All Out',
    identity: 'Three attackers pin the opponent back',
    tradeoff: 'Explosive in possession and exposed immediately after turnovers.',
    positions: [
      { x: 0.055, y: 0.5 },
      { x: 0.18, y: 0.5 },
      { x: 0.37, y: 0.34 },
      { x: 0.37, y: 0.66 },
      { x: 0.56, y: 0.2 },
      { x: 0.59, y: 0.5 },
      { x: 0.56, y: 0.8 },
    ],
    roles: ['GK', 'DF', 'MF', 'MF', 'ST', 'ST', 'ST'],
  },
  {
    id: '2-3-1',
    name: 'Control',
    identity: 'Own the middle with three midfielders',
    tradeoff: 'Lots of passing options, but only one natural finisher.',
    positions: [
      { x: 0.055, y: 0.5 },
      { x: 0.19, y: 0.34 },
      { x: 0.19, y: 0.66 },
      { x: 0.37, y: 0.2 },
      { x: 0.4, y: 0.5 },
      { x: 0.37, y: 0.8 },
      { x: 0.58, y: 0.5 },
    ],
    roles: ['GK', 'DF', 'DF', 'MF', 'MF', 'MF', 'ST'],
  },
  {
    id: '1-3-2',
    name: 'Press',
    identity: 'Midfield swarm behind two forwards',
    tradeoff: 'Wins the ball high, but the single defender protects a huge space.',
    positions: [
      { x: 0.055, y: 0.5 },
      { x: 0.25, y: 0.5 },
      { x: 0.43, y: 0.2 },
      { x: 0.45, y: 0.5 },
      { x: 0.43, y: 0.8 },
      { x: 0.62, y: 0.36 },
      { x: 0.62, y: 0.64 },
    ],
    roles: ['GK', 'DF', 'MF', 'MF', 'MF', 'ST', 'ST'],
  },
  {
    id: '3-1-2',
    name: 'Counter',
    identity: 'Deep platform with two direct outlets',
    tradeoff: 'Dangerous in transition, but easy to outnumber in midfield.',
    positions: [
      { x: 0.055, y: 0.5 },
      { x: 0.18, y: 0.23 },
      { x: 0.16, y: 0.5 },
      { x: 0.18, y: 0.77 },
      { x: 0.38, y: 0.5 },
      { x: 0.57, y: 0.36 },
      { x: 0.57, y: 0.64 },
    ],
    roles: ['GK', 'DF', 'DF', 'DF', 'MF', 'ST', 'ST'],
  },
];

export function getSevenFormation(id: SevenFormationId): SevenFormation {
  return SEVEN_A_SIDE_FORMATIONS.find((formation) => formation.id === id)
    ?? SEVEN_A_SIDE_FORMATIONS[0];
}

// 4-3-3: [GK, RB, CB, CB, LB, DM, CM, CM, RW, ST, LW]
export const F_433: Vec[] = [
  { x: 0.045, y: 0.5 },
  { x: 0.17, y: 0.18 },
  { x: 0.13, y: 0.4 },
  { x: 0.13, y: 0.6 },
  { x: 0.17, y: 0.82 },
  { x: 0.27, y: 0.5 },
  { x: 0.37, y: 0.34 },
  { x: 0.37, y: 0.66 },
  { x: 0.5, y: 0.16 },
  { x: 0.55, y: 0.5 },
  { x: 0.5, y: 0.84 },
];

// 4-2-3-1: [GK, RB, CB, CB, LB, DM, DM, AM, RW, ST, LW]
export const F_4231: Vec[] = [
  { x: 0.045, y: 0.5 },
  { x: 0.17, y: 0.18 },
  { x: 0.13, y: 0.4 },
  { x: 0.13, y: 0.6 },
  { x: 0.17, y: 0.82 },
  { x: 0.27, y: 0.38 },
  { x: 0.27, y: 0.62 },
  { x: 0.4, y: 0.5 },
  { x: 0.47, y: 0.18 },
  { x: 0.56, y: 0.5 },
  { x: 0.47, y: 0.82 },
];

// 4-4-2: [GK, RB, CB, CB, LB, RM, CM, CM, LM, ST, ST]
export const F_442: Vec[] = [
  { x: 0.045, y: 0.5 },
  { x: 0.17, y: 0.18 },
  { x: 0.13, y: 0.4 },
  { x: 0.13, y: 0.6 },
  { x: 0.17, y: 0.82 },
  { x: 0.4, y: 0.16 },
  { x: 0.33, y: 0.42 },
  { x: 0.33, y: 0.58 },
  { x: 0.4, y: 0.84 },
  { x: 0.55, y: 0.42 },
  { x: 0.55, y: 0.58 },
];

// 3-5-2: [GK, CB, CB, CB, DM, RWB, CM, CM, LWB, ST, ST]
export const F_352: Vec[] = [
  { x: 0.045, y: 0.5 },
  { x: 0.14, y: 0.32 },
  { x: 0.12, y: 0.5 },
  { x: 0.14, y: 0.68 },
  { x: 0.27, y: 0.5 },
  { x: 0.34, y: 0.14 },
  { x: 0.4, y: 0.42 },
  { x: 0.4, y: 0.58 },
  { x: 0.34, y: 0.86 },
  { x: 0.56, y: 0.42 },
  { x: 0.56, y: 0.58 },
];

// 3-4-3: [GK, CB, CB, CB, RWB, CM, CM, LWB, RW, ST, LW]
export const F_343: Vec[] = [
  { x: 0.045, y: 0.5 },
  { x: 0.14, y: 0.32 },
  { x: 0.12, y: 0.5 },
  { x: 0.14, y: 0.68 },
  { x: 0.32, y: 0.14 },
  { x: 0.36, y: 0.42 },
  { x: 0.36, y: 0.58 },
  { x: 0.32, y: 0.86 },
  { x: 0.52, y: 0.2 },
  { x: 0.57, y: 0.5 },
  { x: 0.52, y: 0.8 },
];
