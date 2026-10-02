import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Morocco — 4-3-3.
export const morocco: TeamData = {
  name: 'Morocco',
  abbr: 'MAR',
  formation: '4-3-3',
  color: '#c1272d',
  textColor: '#ffffff',
  kit: { shirt: '#c1272d', sleeve: '#991e23', outline: '#5a1114', shorts: '#0a7a3b' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#a3122e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#16a34a', sleeve: '#107a37', outline: '#08461f' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'BOUNOU', r: [56, 30, 64, 56, 85, 83] },
    { num: 2, name: 'HAKIMI', r: [92, 68, 80, 84, 76, 80] },
    { num: 18, name: 'RIAD', r: [76, 42, 68, 70, 78, 78] },
    { num: 5, name: 'SAÂDANE', r: [74, 42, 66, 68, 77, 78] },
    { num: 3, name: 'MAZRAOUI', r: [84, 55, 74, 78, 78, 76] },
    { num: 4, name: 'AMRABAT', r: [74, 66, 76, 76, 82, 84] },
    { num: 8, name: 'OUNAHI', r: [80, 72, 80, 84, 68, 72] },
    { num: 23, name: 'EL KHANNOUSS', r: [80, 76, 82, 86, 58, 70] },
    { num: 7, name: 'TALBI', r: [84, 74, 74, 82, 44, 72] },
    { num: 20, name: 'EL KAABI', r: [80, 82, 72, 78, 42, 84] },
    { num: 10, name: 'DÍAZ', r: [84, 80, 84, 89, 46, 66] },
  ]),
};
