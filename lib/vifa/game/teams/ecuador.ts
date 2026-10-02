import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Ecuador — 4-3-3 (best-effort current XI).
export const ecuador: TeamData = {
  name: 'Ecuador',
  abbr: 'ECU',
  formation: '4-3-3',
  color: '#ffd100',
  textColor: '#15171c',
  kit: { shirt: '#ffd100', sleeve: '#1a4fa0', outline: '#0c2452', shorts: '#1a4fa0' },
  awayKit: { shirt: '#16224d', sleeve: '#111a3b', outline: '#080f24', shorts: '#16224d' },
  gkKit: { shirt: '#2bd47a', sleeve: '#17a95c', outline: '#0a5f33' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'GALÍNDEZ', r: [50, 28, 52, 46, 75, 76] },
    { num: 17, name: 'PRECIADO', r: [84, 48, 68, 72, 74, 74] },
    { num: 6, name: 'PACHO', r: [78, 40, 62, 66, 83, 84] },
    { num: 3, name: 'HINCAPIÉ', r: [80, 42, 68, 70, 82, 80] },
    { num: 7, name: 'ESTUPIÑÁN', r: [85, 55, 74, 78, 78, 76] },
    { num: 23, name: 'CAICEDO', r: [80, 70, 80, 82, 85, 84] },
    { num: 21, name: 'FRANCO', r: [70, 55, 68, 70, 73, 74] },
    { num: 10, name: 'PÁEZ', r: [78, 68, 75, 80, 55, 62] },
    { num: 19, name: 'PLATA', r: [86, 72, 75, 82, 50, 66] },
    { num: 13, name: 'VALENCIA', r: [72, 80, 72, 76, 45, 78] },
    { num: 14, name: 'MINDA', r: [80, 70, 68, 75, 45, 70] },
  ]),
};
