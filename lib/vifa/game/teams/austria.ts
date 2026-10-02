import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Austria — 4-2-3-1.
export const austria: TeamData = {
  name: 'Austria',
  abbr: 'AUT',
  formation: '4-2-3-1',
  color: '#ed2939',
  textColor: '#ffffff',
  kit: { shirt: '#ed2939', sleeve: '#bd1f2d', outline: '#5e0f16', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#b4123a', shorts: '#f5f5f5' },
  gkKit: { shirt: '#2bd47a', sleeve: '#17a95c', outline: '#0a5f33' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'A. SCHLAGER', r: [52, 32, 56, 50, 78, 79] },
    { num: 5, name: 'POSCH', r: [76, 48, 68, 70, 76, 78] },
    { num: 3, name: 'DANSO', r: [80, 42, 64, 66, 80, 84] },
    { num: 8, name: 'ALABA', r: [76, 60, 80, 78, 82, 76] },
    { num: 16, name: 'MWENE', r: [78, 46, 68, 70, 72, 72] },
    { num: 4, name: 'X. SCHLAGER', r: [78, 64, 76, 78, 78, 78] },
    { num: 6, name: 'SEIWALD', r: [76, 58, 76, 76, 76, 74] },
    { num: 9, name: 'SABITZER', r: [78, 80, 80, 82, 68, 76] },
    { num: 20, name: 'LAIMER', r: [84, 66, 76, 78, 76, 76] },
    { num: 7, name: 'ARNAUTOVIĆ', r: [68, 80, 74, 76, 45, 80] },
    { num: 24, name: 'WANNER', r: [80, 66, 74, 80, 55, 66] },
  ]),
};
