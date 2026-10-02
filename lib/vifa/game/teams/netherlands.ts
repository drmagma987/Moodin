import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Netherlands — 4-3-3 (best-effort current XI).
export const netherlands: TeamData = {
  name: 'Netherlands',
  abbr: 'NED',
  formation: '4-3-3',
  color: '#f36c21',
  textColor: '#ffffff',
  kit: { shirt: '#f36c21', sleeve: '#d4571a', outline: '#7a3210', shorts: '#f1f2f4' },
  awayKit: { shirt: '#16224d', sleeve: '#111a3b', outline: '#080f24', shorts: '#16224d' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'VERBRUGGEN', r: [56, 30, 66, 56, 83, 80] },
    { num: 22, name: 'DUMFRIES', r: [86, 62, 74, 78, 78, 84] },
    { num: 4, name: 'VAN DIJK', r: [78, 50, 76, 74, 88, 90] },
    { num: 15, name: 'VAN DE VEN', r: [92, 40, 68, 72, 84, 84] },
    { num: 5, name: 'AKÉ', r: [82, 48, 72, 76, 82, 80] },
    { num: 21, name: 'DE JONG', r: [78, 76, 88, 90, 76, 78] },
    { num: 14, name: 'REIJNDERS', r: [80, 78, 84, 84, 72, 76] },
    { num: 8, name: 'GRAVENBERCH', r: [82, 74, 82, 86, 76, 82] },
    { num: 7, name: 'KLUIVERT', r: [86, 80, 76, 84, 40, 72] },
    { num: 10, name: 'DEPAY', r: [76, 84, 82, 85, 46, 80] },
    { num: 11, name: 'GAKPO', r: [86, 84, 80, 85, 46, 82] },
  ]),
};
