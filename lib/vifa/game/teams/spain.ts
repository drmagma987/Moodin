import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Spain — 4-3-3.
export const spain: TeamData = {
  name: 'Spain',
  abbr: 'ESP',
  formation: '4-3-3',
  color: '#e10b1a',
  textColor: '#ffffff',
  kit: { shirt: '#e10b1a', sleeve: '#b00813', outline: '#6e040b', shorts: '#13213f' },
  awayKit: { shirt: '#16224d', sleeve: '#111a3b', outline: '#080f24', shorts: '#16224d' },
  gkKit: { shirt: '#ffb52e', sleeve: '#cc8512', outline: '#7a4d08' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'RAYA', r: [56, 30, 66, 56, 86, 82] },
    { num: 12, name: 'PORRO', r: [84, 62, 78, 82, 74, 72] },
    { num: 4, name: 'GARCÍA', r: [70, 42, 74, 74, 80, 76] },
    { num: 14, name: 'LAPORTE', r: [68, 48, 76, 72, 84, 84] },
    { num: 24, name: 'CUCURELLA', r: [80, 52, 76, 78, 80, 78] },
    { num: 16, name: 'RODRI', r: [68, 78, 86, 82, 86, 86] },
    { num: 20, name: 'PEDRI', r: [78, 76, 88, 90, 68, 72] },
    { num: 6, name: 'MERINO', r: [72, 78, 80, 80, 74, 82] },
    { num: 19, name: 'YAMAL', r: [86, 84, 86, 92, 40, 66] },
    { num: 21, name: 'OYARZABAL', r: [80, 84, 80, 84, 46, 78] },
    { num: 17, name: 'WILLIAMS', r: [94, 82, 78, 89, 40, 76] },
  ]),
};
