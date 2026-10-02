import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Portugal — 4-3-3.
export const portugal: TeamData = {
  name: 'Portugal',
  abbr: 'POR',
  formation: '4-3-3',
  color: '#c8102e',
  textColor: '#ffffff',
  kit: { shirt: '#c8102e', sleeve: '#9d0c24', outline: '#5e0715', shorts: '#0a7a3b' },
  awayKit: { shirt: '#1c8a5e', sleeve: '#15704b', outline: '#0a3d29', shorts: '#1c8a5e' },
  gkKit: { shirt: '#2bd4c4', sleeve: '#17a99b', outline: '#0a5f57' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'COSTA', r: [56, 30, 64, 56, 85, 82] },
    { num: 5, name: 'DALOT', r: [84, 58, 76, 80, 78, 78] },
    { num: 3, name: 'DIAS', r: [72, 45, 76, 74, 87, 86] },
    { num: 14, name: 'INÁCIO', r: [78, 42, 72, 74, 80, 80] },
    { num: 25, name: 'N. MENDES', r: [89, 58, 76, 82, 80, 80] },
    { num: 23, name: 'VITINHA', r: [78, 76, 86, 88, 74, 72] },
    { num: 15, name: 'J. NEVES', r: [76, 72, 82, 82, 78, 76] },
    { num: 8, name: 'B. FERNANDES', r: [78, 86, 88, 85, 68, 78] },
    { num: 10, name: 'B. SILVA', r: [80, 80, 86, 90, 62, 66] },
    { num: 7, name: 'RONALDO', r: [78, 90, 78, 82, 38, 82] },
    { num: 17, name: 'LEÃO', r: [93, 84, 78, 88, 40, 82] },
  ]),
};
