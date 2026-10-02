import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Iran — 4-2-3-1.
export const iran: TeamData = {
  name: 'Iran',
  abbr: 'IRN',
  formation: '4-2-3-1',
  color: '#d11a2a',
  textColor: '#ffffff',
  kit: { shirt: '#ffffff', sleeve: '#e6e6e6', outline: '#9ca3af', shorts: '#f1f2f4' },
  awayKit: { shirt: '#c8102e', sleeve: '#a30d24', outline: '#5e0816', shorts: '#c8102e' },
  gkKit: { shirt: '#1f9d55', sleeve: '#147a40', outline: '#0a4523' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'BEIRANVAND', r: [52, 30, 52, 46, 75, 78] },
    { num: 2, name: 'HARDANI', r: [80, 44, 64, 68, 72, 72] },
    { num: 4, name: 'KHALILZADEH', r: [70, 40, 58, 58, 75, 80] },
    { num: 13, name: 'KANAANIZADEGAN', r: [72, 42, 60, 60, 76, 80] },
    { num: 5, name: 'MOHAMMADI', r: [80, 46, 66, 70, 72, 72] },
    { num: 6, name: 'EZATOLAHI', r: [68, 55, 68, 68, 75, 80] },
    { num: 14, name: 'GHODDOS', r: [78, 70, 74, 76, 60, 70] },
    { num: 7, name: 'JAHANBAKHSH', r: [82, 72, 74, 78, 55, 68] },
    { num: 8, name: 'MOHEBI', r: [84, 66, 66, 76, 48, 64] },
    { num: 9, name: 'TAREMI', r: [72, 82, 76, 78, 48, 82] },
    { num: 10, name: 'GHAYEDI', r: [86, 66, 66, 78, 45, 62] },
  ]),
};
