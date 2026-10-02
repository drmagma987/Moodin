import { buildSquad, type TeamData } from './types';
import { F_442 } from './formations';

// Paraguay — 4-4-2 (best-effort current XI).
export const paraguay: TeamData = {
  name: 'Paraguay',
  abbr: 'PAR',
  formation: '4-4-2',
  color: '#d52b1e',
  textColor: '#ffffff',
  kit: { shirt: '#d52b1e', sleeve: '#1a4fa0', outline: '#0c2452', shorts: '#1a4fa0' },
  awayKit: { shirt: '#16224d', sleeve: '#111a3b', outline: '#080f24', shorts: '#16224d' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_442, [
    { num: 1, name: 'FERNÁNDEZ', r: [50, 30, 52, 46, 74, 75] },
    { num: 2, name: 'VELÁZQUEZ', r: [68, 42, 58, 58, 74, 78] },
    { num: 15, name: 'G. GÓMEZ', r: [62, 52, 64, 62, 80, 83] },
    { num: 3, name: 'ALDERETE', r: [72, 45, 62, 64, 78, 82] },
    { num: 6, name: 'ALONSO', r: [72, 42, 62, 64, 77, 80] },
    { num: 7, name: 'SOSA', r: [80, 55, 68, 73, 62, 70] },
    { num: 14, name: 'CUBAS', r: [72, 52, 68, 70, 77, 78] },
    { num: 8, name: 'D. GÓMEZ', r: [78, 65, 72, 75, 68, 72] },
    { num: 10, name: 'ALMIRÓN', r: [90, 72, 74, 80, 58, 68] },
    { num: 9, name: 'SANABRIA', r: [72, 76, 70, 75, 42, 76] },
    { num: 19, name: 'ENCISO', r: [82, 74, 73, 82, 48, 68] },
  ]),
};
