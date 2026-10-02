import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// England — 4-2-3-1.
export const england: TeamData = {
  name: 'England',
  abbr: 'ENG',
  formation: '4-2-3-1',
  color: '#f4f4f4',
  textColor: '#0a1f44',
  kit: { shirt: '#f4f4f4', sleeve: '#dfe3ea', outline: '#13235b', shorts: '#13213f' },
  awayKit: { shirt: '#c4123a', sleeve: '#a30d2f', outline: '#5e0a1c', shorts: '#c4123a' },
  gkKit: { shirt: '#2bb673', sleeve: '#1d9159', outline: '#0c4f30' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'PICKFORD', r: [56, 30, 64, 55, 85, 82] },
    { num: 24, name: 'JAMES', r: [84, 62, 78, 82, 80, 80] },
    { num: 5, name: 'STONES', r: [72, 50, 80, 78, 83, 80] },
    { num: 6, name: 'GUÉHI', r: [80, 40, 68, 70, 83, 82] },
    { num: 3, name: 'O\u2019REILLY', r: [85, 55, 74, 78, 76, 76] },
    { num: 4, name: 'RICE', r: [78, 74, 82, 80, 84, 86] },
    { num: 8, name: 'ANDERSON', r: [80, 70, 76, 80, 76, 80] },
    { num: 10, name: 'BELLINGHAM', r: [82, 86, 84, 88, 72, 84] },
    { num: 7, name: 'SAKA', r: [88, 84, 82, 89, 46, 72] },
    { num: 9, name: 'KANE', r: [70, 93, 84, 82, 48, 84] },
    { num: 11, name: 'RASHFORD', r: [90, 82, 76, 86, 42, 76] },
  ]),
};
