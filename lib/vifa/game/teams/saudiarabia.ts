import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Saudi Arabia — 4-3-3.
export const saudiArabia: TeamData = {
  name: 'Saudi Arabia',
  abbr: 'KSA',
  formation: '4-3-3',
  color: '#0a7a3b',
  textColor: '#ffffff',
  kit: { shirt: '#0a7a3b', sleeve: '#075c2c', outline: '#033017', shorts: '#f1f2f4' },
  awayKit: { shirt: '#0f7a3d', sleeve: '#0c6633', outline: '#063d1f', shorts: '#0f7a3d' },
  gkKit: { shirt: '#f59e0b', sleeve: '#c47b06', outline: '#7a4d02' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 21, name: 'AL-OWAIS', r: [52, 30, 52, 46, 74, 76] },
    { num: 12, name: 'ABDULHAMID', r: [82, 48, 66, 72, 72, 70] },
    { num: 4, name: 'AL-AMRI', r: [70, 40, 58, 58, 74, 78] },
    { num: 5, name: 'AL-TAMBAKTI', r: [76, 40, 60, 62, 75, 80] },
    { num: 2, name: 'MAJRASHI', r: [78, 44, 62, 66, 70, 70] },
    { num: 6, name: 'N. AL-DAWSARI', r: [76, 58, 70, 74, 68, 70] },
    { num: 23, name: 'KANNO', r: [70, 58, 72, 72, 72, 76] },
    { num: 7, name: 'AL-JUWAYR', r: [80, 62, 70, 78, 55, 64] },
    { num: 17, name: 'AL-GHANNAM', r: [82, 52, 66, 72, 66, 66] },
    { num: 9, name: 'AL-BURAIKAN', r: [80, 74, 66, 74, 45, 76] },
    { num: 10, name: 'S. AL-DAWSARI', r: [84, 76, 76, 82, 50, 66] },
  ]),
};
