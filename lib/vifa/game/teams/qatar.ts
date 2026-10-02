import { buildSquad, type TeamData } from './types';
import { F_352 } from './formations';

// Qatar — 3-5-2.
export const qatar: TeamData = {
  name: 'Qatar',
  abbr: 'QAT',
  formation: '3-5-2',
  color: '#8a1538',
  textColor: '#ffffff',
  kit: { shirt: '#8a1538', sleeve: '#6c102b', outline: '#3a0817', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#7a153b', shorts: '#f5f5f5' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_352, [
    { num: 22, name: 'BARSHAM', r: [50, 30, 52, 46, 72, 74] },
    { num: 2, name: 'PEDRO MIGUEL', r: [76, 42, 62, 64, 73, 76] },
    { num: 16, name: 'KHOUKHI', r: [70, 48, 64, 64, 74, 76] },
    { num: 3, name: 'MENDES', r: [74, 40, 58, 60, 72, 76] },
    { num: 23, name: 'MADIBO', r: [76, 52, 68, 70, 73, 72] },
    { num: 6, name: 'HATEM', r: [72, 55, 68, 70, 66, 70] },
    { num: 12, name: 'BOUDIAF', r: [70, 55, 68, 68, 72, 76] },
    { num: 10, name: 'AL-HAYDOS', r: [74, 68, 74, 76, 58, 66] },
    { num: 14, name: 'HOMAM AHMED', r: [80, 44, 64, 68, 68, 68] },
    { num: 11, name: 'AFIF', r: [82, 76, 78, 84, 52, 64] },
    { num: 19, name: 'ALI', r: [78, 76, 68, 74, 45, 76] },
  ]),
};
