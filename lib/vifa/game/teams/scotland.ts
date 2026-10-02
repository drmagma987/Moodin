import { buildSquad, type TeamData } from './types';
import { F_352 } from './formations';

// Scotland — 3-5-2.
export const scotland: TeamData = {
  name: 'Scotland',
  abbr: 'SCO',
  formation: '3-5-2',
  color: '#0a285f',
  textColor: '#ffffff',
  kit: { shirt: '#0a285f', sleeve: '#071e47', outline: '#030f24', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#1b2a6e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#f59e0b', sleeve: '#c47b06', outline: '#7a4d02' },
  kickoffFwd: 9,
  players: buildSquad(F_352, [
    { num: 1, name: 'GUNN', r: [52, 30, 54, 48, 75, 77] },
    { num: 13, name: 'HENDRY', r: [74, 42, 62, 62, 75, 79] },
    { num: 15, name: 'SOUTTAR', r: [68, 40, 58, 58, 76, 80] },
    { num: 26, name: 'McKENNA', r: [72, 42, 58, 60, 75, 80] },
    { num: 19, name: 'FERGUSON', r: [76, 70, 74, 77, 72, 76] },
    { num: 2, name: 'HICKEY', r: [84, 52, 70, 74, 72, 72] },
    { num: 4, name: 'McTOMINAY', r: [76, 78, 74, 76, 76, 84] },
    { num: 7, name: 'McGINN', r: [78, 74, 76, 78, 74, 80] },
    { num: 3, name: 'ROBERTSON', r: [82, 58, 80, 78, 80, 76] },
    { num: 10, name: 'ADAMS', r: [82, 76, 68, 76, 42, 76] },
    { num: 9, name: 'DYKES', r: [62, 74, 64, 68, 42, 80] },
  ]),
};
