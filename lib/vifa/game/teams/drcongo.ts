import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// DR Congo — 4-3-3.
export const drCongo: TeamData = {
  name: 'DR Congo',
  abbr: 'COD',
  formation: '4-3-3',
  color: '#1f8fff',
  textColor: '#ffd200',
  kit: { shirt: '#1f8fff', sleeve: '#1670cc', outline: '#0b3e72', shorts: '#0b3e72' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#0a8a3f', shorts: '#f5f5f5' },
  gkKit: { shirt: '#111827', sleeve: '#0a0f1c', outline: '#000000' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'MPASI', r: [50, 30, 52, 46, 72, 75] },
    { num: 2, name: 'WAN-BISSAKA', r: [88, 50, 68, 74, 82, 78] },
    { num: 22, name: 'MBEMBA', r: [78, 45, 64, 66, 80, 82] },
    { num: 4, name: 'TUANZEBE', r: [76, 40, 58, 60, 74, 78] },
    { num: 26, name: 'MASUAKU', r: [82, 50, 70, 74, 72, 72] },
    { num: 6, name: 'MUKAU', r: [74, 58, 72, 72, 72, 74] },
    { num: 8, name: 'MOUTOUSSAMY', r: [74, 60, 72, 74, 70, 72] },
    { num: 14, name: 'SADIKI', r: [78, 58, 70, 74, 70, 72] },
    { num: 10, name: 'BONGONDA', r: [88, 70, 72, 80, 50, 66] },
    { num: 19, name: 'MAYELE', r: [84, 76, 66, 74, 45, 78] },
    { num: 20, name: 'WISSA', r: [86, 80, 72, 82, 48, 74] },
  ]),
};
