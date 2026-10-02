import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Uruguay — 4-3-3 (best-effort current XI).
export const uruguay: TeamData = {
  name: 'Uruguay',
  abbr: 'URU',
  formation: '4-3-3',
  color: '#5aa6dd',
  textColor: '#15171c',
  kit: { shirt: '#5aa6dd', sleeve: '#3d87bd', outline: '#1f4d70', shorts: '#16181d' },
  awayKit: { shirt: '#15171c', sleeve: '#0e1014', outline: '#3a4a6e', shorts: '#15171c' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'ROCHET', r: [56, 30, 60, 54, 82, 80] },
    { num: 13, name: 'VARELA', r: [82, 52, 72, 76, 77, 76] },
    { num: 4, name: 'ARAÚJO', r: [86, 48, 72, 76, 85, 88] },
    { num: 2, name: 'GIMÉNEZ', r: [76, 46, 70, 70, 85, 85] },
    { num: 16, name: 'OLIVERA', r: [82, 52, 72, 76, 78, 78] },
    { num: 5, name: 'UGARTE', r: [78, 66, 78, 78, 82, 84] },
    { num: 6, name: 'BENTANCUR', r: [74, 72, 82, 80, 78, 80] },
    { num: 8, name: 'VALVERDE', r: [88, 84, 86, 85, 80, 86] },
    { num: 11, name: 'PELLISTRI', r: [88, 74, 74, 84, 42, 68] },
    { num: 9, name: 'NÚÑEZ', r: [90, 84, 72, 80, 42, 86] },
    { num: 10, name: 'DE ARRASCAETA', r: [74, 80, 84, 86, 52, 72] },
  ]),
};
