import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// USA — 4-3-3 (best-effort current XI).
export const usa: TeamData = {
  name: 'United States',
  abbr: 'USA',
  formation: '4-3-3',
  color: '#1a3a6b',
  textColor: '#ffffff',
  kit: { shirt: '#f4f4f4', sleeve: '#1a3a6b', outline: '#0c2452', shorts: '#f1f2f4' },
  awayKit: { shirt: '#16224d', sleeve: '#111a3b', outline: '#080f24', shorts: '#16224d' },
  gkKit: { shirt: '#2bd47a', sleeve: '#17a95c', outline: '#0a5f33' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'TURNER', r: [56, 30, 60, 54, 82, 80] },
    { num: 2, name: 'DEST', r: [86, 58, 76, 82, 72, 68] },
    { num: 3, name: 'RICHARDS', r: [82, 42, 66, 70, 80, 84] },
    { num: 13, name: 'REAM', r: [62, 40, 70, 66, 78, 76] },
    { num: 5, name: 'ROBINSON', r: [88, 55, 74, 78, 78, 76] },
    { num: 4, name: 'ADAMS', r: [82, 64, 76, 78, 82, 80] },
    { num: 8, name: 'McKENNIE', r: [78, 76, 80, 80, 74, 84] },
    { num: 17, name: 'TILLMAN', r: [80, 76, 80, 84, 62, 72] },
    { num: 21, name: 'WEAH', r: [92, 74, 74, 82, 44, 76] },
    { num: 9, name: 'PEPI', r: [80, 80, 70, 78, 40, 80] },
    { num: 10, name: 'PULISIC', r: [88, 84, 82, 88, 46, 68] },
  ]),
};
