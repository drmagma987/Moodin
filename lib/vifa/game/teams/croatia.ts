import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Croatia — 4-3-3.
export const croatia: TeamData = {
  name: 'Croatia',
  abbr: 'CRO',
  formation: '4-3-3',
  color: '#d6132c',
  textColor: '#ffffff',
  kit: { shirt: '#e7e7e7', sleeve: '#d6132c', outline: '#9c0f20', shorts: '#f1f2f4' },
  awayKit: { shirt: '#1a2a6e', sleeve: '#142154', outline: '#0a1133', shorts: '#1a2a6e' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'LIVAKOVIĆ', r: [56, 30, 62, 55, 83, 82] },
    { num: 2, name: 'STANIŠIĆ', r: [80, 52, 72, 76, 78, 78] },
    { num: 6, name: 'ŠUTALO', r: [76, 42, 70, 72, 79, 80] },
    { num: 3, name: 'PONGRAČIĆ', r: [74, 45, 66, 66, 79, 82] },
    { num: 4, name: 'GVARDIOL', r: [84, 52, 74, 78, 85, 85] },
    { num: 10, name: 'MODRIĆ', r: [70, 80, 90, 88, 70, 72] },
    { num: 8, name: 'KOVAČIĆ', r: [76, 74, 84, 86, 74, 78] },
    { num: 21, name: 'SUČIĆ', r: [74, 74, 80, 82, 70, 74] },
    { num: 14, name: 'PERIŠIĆ', r: [80, 80, 80, 82, 52, 80] },
    { num: 9, name: 'KRAMARIĆ', r: [76, 84, 80, 84, 46, 74] },
    { num: 15, name: 'PAŠALIĆ', r: [76, 78, 78, 80, 60, 78] },
  ]),
};
