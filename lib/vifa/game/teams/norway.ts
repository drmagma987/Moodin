import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Norway — 4-3-3.
export const norway: TeamData = {
  name: 'Norway',
  abbr: 'NOR',
  formation: '4-3-3',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#16224d', shorts: '#f5f5f5' },
  gkKit: { shirt: '#16a34a', sleeve: '#107a37', outline: '#08461f' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'NYLAND', r: [52, 32, 56, 50, 78, 80] },
    { num: 26, name: 'RYERSON', r: [86, 48, 72, 74, 77, 76] },
    { num: 3, name: 'AJER', r: [82, 40, 64, 66, 78, 82] },
    { num: 4, name: 'ØSTIGÅRD', r: [72, 40, 58, 60, 77, 80] },
    { num: 5, name: 'WOLFE', r: [82, 44, 64, 68, 72, 72] },
    { num: 8, name: 'BERGE', r: [72, 62, 74, 74, 74, 80] },
    { num: 6, name: 'BERG', r: [70, 58, 72, 72, 68, 70] },
    { num: 10, name: 'ØDEGAARD', r: [78, 80, 87, 88, 64, 62] },
    { num: 20, name: 'NUSA', r: [92, 68, 72, 84, 45, 66] },
    { num: 9, name: 'HAALAND', r: [89, 93, 68, 80, 45, 88] },
    { num: 7, name: 'SØRLOTH', r: [78, 83, 70, 76, 42, 85] },
  ]),
};
