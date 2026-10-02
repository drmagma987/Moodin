import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Uzbekistan — 4-2-3-1.
export const uzbekistan: TeamData = {
  name: 'Uzbekistan',
  abbr: 'UZB',
  formation: '4-2-3-1',
  color: '#1f8fff',
  textColor: '#ffffff',
  kit: { shirt: '#ffffff', sleeve: '#e6e6e6', outline: '#9ca3af', shorts: '#f1f2f4' },
  awayKit: { shirt: '#0f7a3d', sleeve: '#0c6633', outline: '#063d1f', shorts: '#0f7a3d' },
  gkKit: { shirt: '#1f8fff', sleeve: '#1670cc', outline: '#0b3e72' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'YUSUPOV', r: [50, 30, 50, 46, 71, 73] },
    { num: 4, name: 'SAYFIEV', r: [80, 44, 62, 68, 70, 70] },
    { num: 2, name: 'KHUSANOV', r: [88, 40, 62, 68, 79, 82] },
    { num: 5, name: 'ASHURMATOV', r: [72, 40, 58, 60, 74, 78] },
    { num: 3, name: 'ALIJONOV', r: [80, 44, 62, 68, 70, 70] },
    { num: 7, name: 'SHUKUROV', r: [72, 55, 68, 70, 70, 72] },
    { num: 9, name: 'HAMROBEKOV', r: [74, 55, 70, 72, 68, 72] },
    { num: 10, name: 'MASHARIPOV', r: [78, 68, 74, 78, 56, 64] },
    { num: 17, name: 'KHAMDAMOV', r: [82, 68, 68, 78, 48, 64] },
    { num: 14, name: 'SHOMURODOV', r: [80, 76, 68, 76, 45, 78] },
    { num: 22, name: 'FAYZULLAEV', r: [80, 68, 74, 80, 55, 64] },
  ]),
};
