import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Czech Republic — 4-2-3-1.
export const czechia: TeamData = {
  name: 'Czech Republic',
  abbr: 'CZE',
  formation: '4-2-3-1',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#11457e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'KOVÁŘ', r: [52, 30, 54, 48, 75, 77] },
    { num: 5, name: 'COUFAL', r: [78, 48, 70, 72, 77, 76] },
    { num: 7, name: 'KREJČÍ', r: [80, 52, 68, 72, 80, 80] },
    { num: 4, name: 'HRANÁČ', r: [72, 40, 60, 62, 76, 78] },
    { num: 14, name: 'JURÁSEK', r: [84, 46, 66, 72, 71, 70] },
    { num: 22, name: 'SOUČEK', r: [66, 72, 72, 70, 78, 84] },
    { num: 18, name: 'SADÍLEK', r: [74, 55, 70, 72, 70, 72] },
    { num: 17, name: 'PROVOD', r: [82, 72, 76, 78, 62, 72] },
    { num: 9, name: 'HLOŽEK', r: [85, 74, 73, 80, 50, 72] },
    { num: 10, name: 'SCHICK', r: [74, 84, 72, 78, 42, 82] },
    { num: 15, name: 'ŠULC', r: [80, 70, 73, 78, 55, 68] },
  ]),
};
