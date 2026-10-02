import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Argentina — 4-3-3.
export const argentina: TeamData = {
  name: 'Argentina',
  abbr: 'ARG',
  formation: '4-3-3',
  color: '#75aadb',
  textColor: '#0a2b4a',
  kit: { shirt: '#75aadb', sleeve: '#ffffff', outline: '#2f6aa8', shorts: '#16181d' },
  awayKit: { shirt: '#1c2c63', sleeve: '#16224d', outline: '#0b1330', shorts: '#1c2c63' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 23, name: 'E. MARTÍNEZ', r: [55, 28, 58, 52, 88, 86] },
    { num: 26, name: 'MOLINA', r: [85, 52, 72, 76, 78, 74] },
    { num: 13, name: 'ROMERO', r: [78, 45, 68, 72, 86, 84] },
    { num: 19, name: 'OTAMENDI', r: [62, 48, 68, 66, 83, 83] },
    { num: 3, name: 'TAGLIAFICO', r: [78, 55, 72, 74, 79, 74] },
    { num: 7, name: 'DE PAUL', r: [76, 72, 82, 82, 76, 78] },
    { num: 24, name: 'ENZO', r: [72, 76, 86, 82, 72, 75] },
    { num: 20, name: 'MAC ALLISTER', r: [70, 78, 85, 83, 74, 76] },
    { num: 10, name: 'MESSI', r: [80, 90, 90, 93, 38, 64] },
    { num: 9, name: 'ÁLVAREZ', r: [85, 86, 80, 87, 45, 76] },
    { num: 22, name: 'LAUTARO', r: [84, 89, 76, 84, 46, 83] },
  ]),
};
