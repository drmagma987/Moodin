import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// South Korea — 4-2-3-1.
export const southKorea: TeamData = {
  name: 'South Korea',
  abbr: 'KOR',
  formation: '4-2-3-1',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#a00b24', outline: '#5e0714', shorts: '#13213f' },
  awayKit: { shirt: '#15224d', sleeve: '#101a3b', outline: '#080f24', shorts: '#15224d' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'KIM SEUNG-GYU', r: [52, 30, 54, 48, 76, 78] },
    { num: 22, name: 'SEOL YOUNG-WOO', r: [82, 48, 66, 70, 72, 72] },
    { num: 4, name: 'KIM MIN-JAE', r: [82, 45, 68, 70, 86, 86] },
    { num: 5, name: 'KIM TAE-HYEON', r: [74, 40, 58, 60, 74, 78] },
    { num: 15, name: 'KIM MOON-HWAN', r: [80, 46, 66, 70, 72, 70] },
    { num: 6, name: 'HWANG IN-BEOM', r: [74, 68, 78, 78, 70, 70] },
    { num: 8, name: 'PAIK SEUNG-HO', r: [72, 62, 74, 74, 72, 74] },
    { num: 10, name: 'LEE JAE-SUNG', r: [78, 72, 76, 78, 62, 72] },
    { num: 19, name: 'LEE KANG-IN', r: [78, 78, 80, 85, 55, 62] },
    { num: 9, name: 'CHO GUE-SUNG', r: [78, 76, 66, 72, 45, 82] },
    { num: 7, name: 'SON HEUNG-MIN', r: [86, 88, 80, 86, 45, 75] },
  ]),
};
