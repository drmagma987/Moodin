import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Egypt — 4-3-3.
export const egypt: TeamData = {
  name: 'Egypt',
  abbr: 'EGY',
  formation: '4-3-3',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#c8102e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'EL SHENAWY', r: [52, 32, 56, 50, 78, 80] },
    { num: 3, name: 'HANY', r: [80, 46, 66, 70, 72, 72] },
    { num: 6, name: 'ABDELMONEM', r: [74, 42, 60, 62, 76, 78] },
    { num: 4, name: 'ABDELMAGUID', r: [70, 40, 58, 58, 74, 78] },
    { num: 13, name: 'FATOUH', r: [80, 46, 66, 70, 71, 70] },
    { num: 8, name: 'ASHOUR', r: [74, 58, 70, 72, 68, 72] },
    { num: 14, name: 'FATHY', r: [72, 55, 70, 70, 74, 76] },
    { num: 25, name: 'ZIZO', r: [82, 72, 74, 80, 52, 66] },
    { num: 7, name: 'TRÉZÉGUET', r: [86, 74, 72, 80, 52, 68] },
    { num: 22, name: 'MARMOUSH', r: [90, 82, 76, 82, 48, 76] },
    { num: 10, name: 'SALAH', r: [89, 89, 82, 89, 45, 75] },
  ]),
};
