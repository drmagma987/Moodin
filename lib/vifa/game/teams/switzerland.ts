import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Switzerland — 4-2-3-1 (best-effort current XI).
export const switzerland: TeamData = {
  name: 'Switzerland',
  abbr: 'SUI',
  formation: '4-2-3-1',
  color: '#d52b1e',
  textColor: '#ffffff',
  kit: { shirt: '#d52b1e', sleeve: '#a81f16', outline: '#5e110c', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#c8102e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#2bd47a', sleeve: '#17a95c', outline: '#0a5f33' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'KOBEL', r: [56, 30, 64, 56, 85, 84] },
    { num: 3, name: 'WIDMER', r: [82, 52, 72, 74, 76, 74] },
    { num: 5, name: 'AKANJI', r: [82, 45, 76, 78, 84, 82] },
    { num: 4, name: 'ELVEDI', r: [78, 42, 70, 70, 80, 80] },
    { num: 13, name: 'RODRIGUEZ', r: [72, 55, 76, 74, 78, 76] },
    { num: 10, name: 'XHAKA', r: [66, 76, 86, 80, 78, 82] },
    { num: 8, name: 'FREULER', r: [72, 70, 78, 78, 78, 78] },
    { num: 22, name: 'RIEDER', r: [76, 72, 80, 82, 68, 72] },
    { num: 11, name: 'NDOYE', r: [90, 76, 76, 86, 44, 74] },
    { num: 7, name: 'EMBOLO', r: [84, 80, 74, 80, 44, 84] },
    { num: 17, name: 'VARGAS', r: [84, 76, 76, 82, 46, 74] },
  ]),
};
