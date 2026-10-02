import { buildSquad, type TeamData } from './types';
import { F_442 } from './formations';

// Australia — 4-4-2.
export const australia: TeamData = {
  name: 'Australia',
  abbr: 'AUS',
  formation: '4-4-2',
  color: '#0b6b3a',
  textColor: '#ffd200',
  kit: { shirt: '#f4c300', sleeve: '#d8aa00', outline: '#8a6c00', shorts: '#0a7a3b' },
  awayKit: { shirt: '#15233f', sleeve: '#101b30', outline: '#080f1c', shorts: '#15233f' },
  gkKit: { shirt: '#0b6b3a', sleeve: '#075029', outline: '#032916' },
  kickoffFwd: 9,
  players: buildSquad(F_442, [
    { num: 1, name: 'RYAN', r: [54, 32, 56, 52, 76, 76] },
    { num: 2, name: 'DEGENEK', r: [76, 42, 60, 62, 73, 77] },
    { num: 19, name: 'SOUTTAR', r: [62, 42, 58, 58, 78, 82] },
    { num: 3, name: 'CIRCATI', r: [74, 40, 62, 64, 76, 78] },
    { num: 16, name: 'BEHICH', r: [80, 46, 66, 70, 72, 70] },
    { num: 7, name: 'LECKIE', r: [84, 68, 68, 74, 52, 72] },
    { num: 22, name: 'IRVINE', r: [72, 64, 72, 72, 70, 76] },
    { num: 13, name: 'O\u2019NEILL', r: [70, 55, 70, 70, 70, 72] },
    { num: 5, name: 'BOS', r: [84, 55, 70, 76, 66, 70] },
    { num: 9, name: 'TOURÉ', r: [82, 70, 64, 74, 42, 72] },
    { num: 11, name: 'MABIL', r: [86, 66, 68, 76, 48, 64] },
  ]),
};
