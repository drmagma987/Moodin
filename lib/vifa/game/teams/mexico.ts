import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Mexico — 4-3-3 (best-effort current XI).
export const mexico: TeamData = {
  name: 'Mexico',
  abbr: 'MEX',
  formation: '4-3-3',
  color: '#0a6b3a',
  textColor: '#ffffff',
  kit: { shirt: '#0a6b3a', sleeve: '#08572f', outline: '#043019', shorts: '#f1f2f4' },
  awayKit: { shirt: '#15171c', sleeve: '#0e1014', outline: '#0a7a47', shorts: '#15171c' },
  gkKit: { shirt: '#fb3acb', sleeve: '#d41ba8', outline: '#7a0a60' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'RANGEL', r: [52, 30, 55, 48, 76, 77] },
    { num: 2, name: 'SÁNCHEZ', r: [82, 45, 68, 72, 72, 70] },
    { num: 3, name: 'MONTES', r: [68, 48, 62, 60, 77, 82] },
    { num: 5, name: 'VÁSQUEZ', r: [70, 42, 60, 63, 79, 80] },
    { num: 23, name: 'GALLARDO', r: [80, 50, 70, 73, 74, 72] },
    { num: 4, name: 'ÁLVAREZ', r: [65, 58, 69, 72, 80, 82] },
    { num: 6, name: 'LIRA', r: [70, 55, 68, 70, 72, 72] },
    { num: 17, name: 'PINEDA', r: [76, 68, 76, 79, 58, 62] },
    { num: 25, name: 'ALVARADO', r: [85, 70, 73, 80, 55, 62] },
    { num: 9, name: 'JIMÉNEZ', r: [57, 79, 74, 75, 46, 79] },
    { num: 10, name: 'VEGA', r: [80, 72, 72, 79, 50, 72] },
  ]),
};
