import { buildSquad, type TeamData } from './types';
import { F_442 } from './formations';

// New Zealand — 4-4-2.
export const newZealand: TeamData = {
  name: 'New Zealand',
  abbr: 'NZL',
  formation: '4-4-2',
  color: '#111827',
  textColor: '#ffffff',
  kit: { shirt: '#ffffff', sleeve: '#e6e6e6', outline: '#9ca3af', shorts: '#f1f2f4' },
  awayKit: { shirt: '#15171c', sleeve: '#0e1014', outline: '#444a52', shorts: '#15171c' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_442, [
    { num: 1, name: 'CROCOMBE', r: [52, 30, 50, 46, 70, 73] },
    { num: 2, name: 'PAYNE', r: [78, 42, 58, 64, 68, 68] },
    { num: 4, name: 'BINDON', r: [72, 40, 54, 58, 70, 76] },
    { num: 5, name: 'BOXALL', r: [70, 40, 56, 58, 74, 80] },
    { num: 13, name: 'CACACE', r: [84, 48, 68, 72, 72, 70] },
    { num: 7, name: 'GARBETT', r: [74, 58, 70, 72, 66, 70] },
    { num: 6, name: 'BELL', r: [72, 55, 70, 72, 68, 72] },
    { num: 8, name: 'STAMENIĆ', r: [76, 60, 70, 74, 66, 70] },
    { num: 10, name: 'SINGH', r: [78, 64, 72, 78, 55, 64] },
    { num: 9, name: 'WOOD', r: [70, 82, 66, 72, 42, 82] },
    { num: 11, name: 'JUST', r: [82, 62, 64, 74, 48, 62] },
  ]),
};
