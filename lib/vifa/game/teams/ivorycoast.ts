import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Ivory Coast — 4-3-3.
export const ivoryCoast: TeamData = {
  name: 'Ivory Coast',
  abbr: 'CIV',
  formation: '4-3-3',
  color: '#f77f00',
  textColor: '#ffffff',
  kit: { shirt: '#f77f00', sleeve: '#c66400', outline: '#7a3e00', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#f07a1a', shorts: '#f5f5f5' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'FOFANA', r: [52, 30, 54, 48, 74, 76] },
    { num: 5, name: 'SINGO', r: [90, 52, 68, 76, 78, 82] },
    { num: 7, name: 'KOSSOUNOU', r: [86, 42, 62, 66, 78, 82] },
    { num: 21, name: 'NDICKA', r: [82, 40, 62, 64, 80, 82] },
    { num: 3, name: 'KONAN', r: [80, 46, 68, 70, 72, 70] },
    { num: 8, name: 'KESSIÉ', r: [76, 76, 78, 78, 80, 84] },
    { num: 4, name: 'SERI', r: [72, 64, 76, 76, 68, 68] },
    { num: 18, name: 'SANGARÉ', r: [74, 66, 74, 74, 80, 84] },
    { num: 10, name: 'ADINGRA', r: [90, 70, 72, 82, 50, 66] },
    { num: 9, name: 'BONNY', r: [78, 72, 68, 76, 45, 78] },
    { num: 15, name: 'DIALLO', r: [86, 76, 76, 84, 55, 68] },
  ]),
};
