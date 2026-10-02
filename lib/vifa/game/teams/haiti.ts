import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Haiti — 4-3-3.
export const haiti: TeamData = {
  name: 'Haiti',
  abbr: 'HAI',
  formation: '4-3-3',
  color: '#1f3a93',
  textColor: '#ffffff',
  kit: { shirt: '#1f3a93', sleeve: '#162b6f', outline: '#0a153a', shorts: '#16181d' },
  awayKit: { shirt: '#c8102e', sleeve: '#a30d24', outline: '#5e0816', shorts: '#c8102e' },
  gkKit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'PLACIDE', r: [50, 28, 48, 44, 70, 72] },
    { num: 2, name: 'ARCUS', r: [78, 42, 58, 64, 66, 66] },
    { num: 4, name: 'ADÉ', r: [70, 40, 54, 58, 70, 74] },
    { num: 5, name: 'DELCROIX', r: [70, 40, 56, 58, 72, 76] },
    { num: 22, name: 'DUVERNE', r: [78, 44, 60, 66, 68, 68] },
    { num: 6, name: 'SAINTÉ', r: [74, 55, 66, 70, 66, 68] },
    { num: 17, name: 'JEAN JACQUES', r: [72, 52, 62, 66, 64, 68] },
    { num: 10, name: 'BELLEGARDE', r: [80, 68, 74, 80, 62, 72] },
    { num: 7, name: 'ETIENNE', r: [84, 60, 66, 74, 52, 64] },
    { num: 20, name: 'PIERROT', r: [76, 72, 62, 72, 42, 80] },
    { num: 11, name: 'DEEDSON', r: [82, 62, 60, 72, 42, 66] },
  ]),
};
