import { buildSquad, type TeamData } from './types';
import { F_442 } from './formations';

// Panama — 4-4-2.
export const panama: TeamData = {
  name: 'Panama',
  abbr: 'PAN',
  formation: '4-4-2',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#1a3a6b', outline: '#0c2452', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#1b2a6e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#2bd47a', sleeve: '#17a95c', outline: '#0a5f33' },
  kickoffFwd: 9,
  players: buildSquad(F_442, [
    { num: 1, name: 'MEJÍA', r: [50, 30, 50, 46, 73, 74] },
    { num: 23, name: 'MURILLO', r: [84, 50, 68, 72, 73, 74] },
    { num: 3, name: 'CÓRDOBA', r: [70, 42, 58, 60, 75, 79] },
    { num: 4, name: 'ESCOBAR', r: [70, 42, 56, 58, 74, 78] },
    { num: 15, name: 'DAVIS', r: [78, 48, 66, 70, 71, 70] },
    { num: 7, name: 'J. RODRÍGUEZ', r: [86, 58, 66, 75, 55, 64] },
    { num: 8, name: 'CARRASQUILLA', r: [74, 62, 72, 74, 68, 72] },
    { num: 20, name: 'GODOY', r: [62, 55, 68, 68, 73, 76] },
    { num: 11, name: 'BÁRCENAS', r: [80, 62, 68, 74, 52, 64] },
    { num: 17, name: 'FAJARDO', r: [76, 72, 64, 72, 42, 74] },
    { num: 18, name: 'WATERMAN', r: [78, 72, 64, 72, 42, 74] },
  ]),
};
