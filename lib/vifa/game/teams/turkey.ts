import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Türkiye — 4-2-3-1 (best-effort current XI).
export const turkey: TeamData = {
  name: 'Türkiye',
  abbr: 'TUR',
  formation: '4-2-3-1',
  color: '#e30a17',
  textColor: '#ffffff',
  kit: { shirt: '#e30a17', sleeve: '#b30812', outline: '#5e040a', shorts: '#f1f2f4' },
  awayKit: { shirt: '#c8102e', sleeve: '#a30d24', outline: '#5e0816', shorts: '#c8102e' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'GÜNOK', r: [52, 32, 56, 50, 78, 80] },
    { num: 2, name: 'ÇELIK', r: [80, 48, 70, 72, 76, 76] },
    { num: 3, name: 'DEMIRAL', r: [76, 48, 62, 64, 81, 84] },
    { num: 14, name: 'BARDAKCI', r: [70, 42, 62, 64, 77, 80] },
    { num: 20, name: 'KADIOĞLU', r: [84, 52, 72, 78, 75, 72] },
    { num: 10, name: 'ÇALHANOĞLU', r: [70, 82, 86, 82, 72, 76] },
    { num: 6, name: 'KÖKÇÜ', r: [74, 72, 78, 80, 70, 74] },
    { num: 8, name: 'GÜLER', r: [76, 78, 80, 84, 52, 62] },
    { num: 7, name: 'AKTÜRKOĞLU', r: [88, 76, 74, 82, 52, 68] },
    { num: 21, name: 'YILMAZ', r: [80, 72, 66, 74, 45, 76] },
    { num: 11, name: 'YILDIZ', r: [85, 76, 76, 84, 50, 70] },
  ]),
};
