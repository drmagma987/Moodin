import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Colombia — 4-2-3-1.
export const colombia: TeamData = {
  name: 'Colombia',
  abbr: 'COL',
  formation: '4-2-3-1',
  color: '#fcd116',
  textColor: '#15171c',
  kit: { shirt: '#fcd116', sleeve: '#d8b00e', outline: '#7a6300', shorts: '#1a3a8f' },
  awayKit: { shirt: '#16307a', sleeve: '#112460', outline: '#0a163b', shorts: '#16307a' },
  gkKit: { shirt: '#2b7fff', sleeve: '#1f63cc', outline: '#0a2f6e' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'OSPINA', r: [54, 30, 62, 56, 82, 78] },
    { num: 2, name: 'MUÑOZ', r: [85, 58, 74, 78, 78, 80] },
    { num: 3, name: 'LUCUMÍ', r: [78, 42, 68, 70, 80, 82] },
    { num: 23, name: 'D. SÁNCHEZ', r: [76, 42, 66, 68, 80, 84] },
    { num: 17, name: 'MOJICA', r: [80, 52, 72, 76, 75, 74] },
    { num: 5, name: 'CASTAÑO', r: [74, 68, 78, 78, 78, 80] },
    { num: 16, name: 'LERMA', r: [76, 72, 78, 78, 80, 82] },
    { num: 10, name: 'J. RODRÍGUEZ', r: [68, 82, 90, 86, 52, 72] },
    { num: 11, name: 'J. ARIAS', r: [86, 76, 78, 84, 46, 72] },
    { num: 9, name: 'J. CÓRDOBA', r: [82, 82, 72, 80, 42, 86] },
    { num: 7, name: 'L. DÍAZ', r: [90, 84, 80, 89, 48, 80] },
  ]),
};
