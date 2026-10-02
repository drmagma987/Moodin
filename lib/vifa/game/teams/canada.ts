import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Canada — 4-3-3 (best-effort current XI).
export const canada: TeamData = {
  name: 'Canada',
  abbr: 'CAN',
  formation: '4-3-3',
  color: '#d52b1e',
  textColor: '#ffffff',
  kit: { shirt: '#d52b1e', sleeve: '#a81f16', outline: '#5e110c', shorts: '#a81f16' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#c8102e', shorts: '#f5f5f5' },
  gkKit: { shirt: '#1f1f24', sleeve: '#34343c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'ST. CLAIR', r: [52, 30, 54, 48, 74, 76] },
    { num: 2, name: 'JOHNSTON', r: [80, 48, 70, 72, 77, 76] },
    { num: 13, name: 'CORNELIUS', r: [74, 40, 58, 60, 74, 78] },
    { num: 15, name: 'BOMBITO', r: [82, 42, 60, 64, 77, 84] },
    { num: 19, name: 'DAVIES', r: [95, 62, 76, 84, 75, 76] },
    { num: 7, name: 'EUSTÁQUIO', r: [70, 58, 74, 74, 72, 72] },
    { num: 8, name: 'KONÉ', r: [76, 58, 70, 74, 68, 74] },
    { num: 21, name: 'OSORIO', r: [70, 62, 72, 74, 62, 68] },
    { num: 17, name: 'BUCHANAN', r: [88, 62, 68, 80, 55, 72] },
    { num: 10, name: 'DAVID', r: [82, 84, 74, 82, 45, 76] },
    { num: 14, name: 'SHAFFELBURG', r: [90, 62, 64, 76, 48, 66] },
  ]),
};
