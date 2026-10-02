import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Algeria — 4-3-3.
export const algeria: TeamData = {
  name: 'Algeria',
  abbr: 'ALG',
  formation: '4-3-3',
  color: '#0a7a3b',
  textColor: '#ffffff',
  kit: { shirt: '#ffffff', sleeve: '#e6e6e6', outline: '#9ca3af', shorts: '#f1f2f4' },
  awayKit: { shirt: '#0f7a3d', sleeve: '#0c6633', outline: '#063d1f', shorts: '#0f7a3d' },
  gkKit: { shirt: '#0a7a3b', sleeve: '#075c2c', outline: '#033017' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'MASTIL', r: [52, 30, 52, 46, 74, 76] },
    { num: 17, name: 'BELGHALI', r: [86, 48, 68, 72, 72, 70] },
    { num: 2, name: 'MANDI', r: [72, 42, 64, 64, 77, 78] },
    { num: 21, name: 'BENSEBAINI', r: [80, 55, 68, 70, 80, 82] },
    { num: 15, name: 'AÏT-NOURI', r: [88, 52, 72, 80, 76, 72] },
    { num: 6, name: 'ZERROUKI', r: [72, 55, 72, 72, 74, 74] },
    { num: 8, name: 'AOUAR', r: [76, 72, 78, 82, 62, 68] },
    { num: 10, name: 'CHAÏBI', r: [80, 70, 74, 80, 58, 68] },
    { num: 7, name: 'MAHREZ', r: [80, 82, 82, 88, 45, 62] },
    { num: 9, name: 'GOUIRI', r: [82, 78, 74, 80, 48, 74] },
    { num: 18, name: 'AMOURA', r: [92, 78, 72, 82, 45, 70] },
  ]),
};
