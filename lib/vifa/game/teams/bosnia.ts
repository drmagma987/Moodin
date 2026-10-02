import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Bosnia and Herzegovina — 4-2-3-1.
export const bosnia: TeamData = {
  name: 'Bosnia & H.',
  abbr: 'BIH',
  formation: '4-2-3-1',
  color: '#1f57b6',
  textColor: '#ffd200',
  kit: { shirt: '#1f57b6', sleeve: '#16438f', outline: '#0a234d', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f4d23a', sleeve: '#e0bd24', outline: '#1b3a78', shorts: '#f4d23a' },
  gkKit: { shirt: '#f59e0b', sleeve: '#c47b06', outline: '#7a4d02' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'VASILJ', r: [50, 30, 52, 46, 74, 76] },
    { num: 7, name: 'DEDIĆ', r: [84, 50, 70, 74, 74, 74] },
    { num: 4, name: 'MUHAREMOVIĆ', r: [72, 40, 58, 60, 74, 78] },
    { num: 3, name: 'HADŽIKADUNIĆ', r: [74, 40, 58, 60, 74, 79] },
    { num: 5, name: 'KOLAŠINAC', r: [72, 48, 66, 66, 78, 84] },
    { num: 6, name: 'TAHIROVIĆ', r: [74, 55, 70, 74, 68, 72] },
    { num: 16, name: 'HADŽIAHMETOVIĆ', r: [72, 52, 66, 68, 70, 72] },
    { num: 10, name: 'DEMIROVIĆ', r: [78, 76, 74, 78, 52, 76] },
    { num: 20, name: 'BAJRAKTAREVIĆ', r: [82, 62, 66, 76, 48, 64] },
    { num: 11, name: 'DŽEKO', r: [60, 82, 76, 76, 42, 82] },
    { num: 9, name: 'BAZDAR', r: [78, 70, 62, 72, 40, 74] },
  ]),
};
