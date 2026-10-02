import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Senegal — 4-3-3.
export const senegal: TeamData = {
  name: 'Senegal',
  abbr: 'SEN',
  formation: '4-3-3',
  color: '#1f9d55',
  textColor: '#ffffff',
  kit: { shirt: '#ffffff', sleeve: '#e6e6e6', outline: '#9ca3af', shorts: '#0a7a3b' },
  awayKit: { shirt: '#0f7a3d', sleeve: '#0c6633', outline: '#063d1f', shorts: '#0f7a3d' },
  gkKit: { shirt: '#1f9d55', sleeve: '#147a40', outline: '#0a4523' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 16, name: 'MENDY', r: [56, 30, 62, 55, 84, 84] },
    { num: 15, name: 'DIATTA', r: [85, 58, 74, 80, 75, 76] },
    { num: 3, name: 'KOULIBALY', r: [78, 45, 70, 70, 84, 88] },
    { num: 19, name: 'NIAKHATÉ', r: [78, 42, 66, 68, 80, 84] },
    { num: 14, name: 'JAKOBS', r: [86, 52, 72, 78, 74, 74] },
    { num: 5, name: 'GUEYE', r: [78, 68, 76, 78, 82, 82] },
    { num: 8, name: 'CAMARA', r: [80, 68, 78, 80, 78, 82] },
    { num: 17, name: 'P. M. SARR', r: [82, 76, 82, 84, 72, 78] },
    { num: 18, name: 'I. SARR', r: [90, 80, 78, 86, 44, 76] },
    { num: 11, name: 'JACKSON', r: [88, 82, 74, 82, 42, 84] },
    { num: 10, name: 'MANÉ', r: [86, 84, 80, 87, 46, 78] },
  ]),
};
