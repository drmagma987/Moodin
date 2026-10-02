import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// France — 4-2-3-1.
export const france: TeamData = {
  name: 'France',
  abbr: 'FRA',
  formation: '4-2-3-1',
  color: '#21356e',
  textColor: '#ffffff',
  kit: { shirt: '#21356e', sleeve: '#172a5c', outline: '#0c1838', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#1b2a6e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#d6e34a', sleeve: '#b4c130', outline: '#6f7a14' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 16, name: 'MAIGNAN', r: [58, 30, 68, 58, 88, 85] },
    { num: 5, name: 'KOUNDÉ', r: [85, 45, 72, 78, 84, 78] },
    { num: 4, name: 'UPAMECANO', r: [82, 42, 68, 70, 84, 86] },
    { num: 17, name: 'SALIBA', r: [84, 40, 72, 76, 86, 85] },
    { num: 19, name: 'T. HERNANDEZ', r: [90, 62, 76, 82, 80, 82] },
    { num: 8, name: 'TCHOUAMÉNI', r: [76, 68, 80, 78, 84, 85] },
    { num: 6, name: 'KONÉ', r: [84, 68, 78, 80, 80, 84] },
    { num: 11, name: 'OLISE', r: [82, 82, 84, 88, 52, 68] },
    { num: 7, name: 'DEMBÉLÉ', r: [93, 84, 82, 90, 42, 70] },
    { num: 10, name: 'MBAPPÉ', r: [97, 91, 82, 92, 36, 80] },
    { num: 9, name: 'THURAM', r: [86, 82, 72, 82, 40, 86] },
  ]),
};
