import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Jordan — 4-2-3-1.
export const jordan: TeamData = {
  name: 'Jordan',
  abbr: 'JOR',
  formation: '4-2-3-1',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714', shorts: '#f1f2f4' },
  awayKit: { shirt: '#c8102e', sleeve: '#a30d24', outline: '#5e0816', shorts: '#c8102e' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'ABULAILA', r: [50, 28, 48, 44, 70, 73] },
    { num: 2, name: 'ABU HASHISH', r: [78, 42, 58, 64, 68, 68] },
    { num: 5, name: 'AL-ARAB', r: [70, 40, 56, 58, 71, 76] },
    { num: 23, name: 'HADDAD', r: [70, 40, 54, 58, 71, 76] },
    { num: 16, name: 'ABUALNADI', r: [78, 42, 58, 64, 67, 68] },
    { num: 6, name: 'JAMOUS', r: [72, 55, 66, 70, 66, 70] },
    { num: 21, name: 'AL-RASHDAN', r: [74, 58, 70, 72, 66, 70] },
    { num: 8, name: 'AL-RAWABDEH', r: [78, 62, 68, 74, 55, 64] },
    { num: 10, name: 'AL-TAAMARI', r: [88, 72, 74, 82, 50, 64] },
    { num: 9, name: 'OLWAN', r: [78, 72, 64, 72, 42, 74] },
    { num: 11, name: 'AL-FAKHOURI', r: [82, 62, 64, 74, 48, 62] },
  ]),
};
