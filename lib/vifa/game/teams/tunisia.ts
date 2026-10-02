import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Tunisia — 4-3-3.
export const tunisia: TeamData = {
  name: 'Tunisia',
  abbr: 'TUN',
  formation: '4-3-3',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#c8102e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 16, name: 'DAHMEN', r: [52, 30, 52, 46, 74, 76] },
    { num: 20, name: 'VALERY', r: [82, 48, 66, 70, 72, 72] },
    { num: 3, name: 'TALBI', r: [74, 42, 62, 62, 76, 80] },
    { num: 6, name: 'BRONN', r: [74, 42, 60, 62, 75, 78] },
    { num: 2, name: 'ABDI', r: [80, 46, 66, 70, 72, 70] },
    { num: 17, name: 'SKHIRI', r: [72, 66, 76, 76, 78, 80] },
    { num: 13, name: 'KHEDIRA', r: [74, 58, 70, 72, 70, 72] },
    { num: 10, name: 'MEJBRI', r: [78, 66, 74, 80, 60, 68] },
    { num: 7, name: 'ACHOURI', r: [84, 64, 68, 78, 50, 64] },
    { num: 9, name: 'MASTOURI', r: [78, 72, 64, 72, 42, 76] },
    { num: 8, name: 'SAAD', r: [86, 66, 68, 78, 48, 64] },
  ]),
};
