import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Curaçao — 4-2-3-1 (World Cup debut).
export const curacao: TeamData = {
  name: 'Curaçao',
  abbr: 'CUW',
  formation: '4-2-3-1',
  color: '#0a285f',
  textColor: '#ffd200',
  kit: { shirt: '#0a285f', sleeve: '#071e47', outline: '#030f24', shorts: '#0a285f' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#1b66b3', shorts: '#f5f5f5' },
  gkKit: { shirt: '#16a34a', sleeve: '#107a37', outline: '#08461f' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'ROOM', r: [50, 30, 54, 48, 73, 74] },
    { num: 2, name: 'SAMBO', r: [78, 42, 58, 64, 68, 68] },
    { num: 3, name: 'GAARI', r: [70, 40, 54, 58, 68, 74] },
    { num: 4, name: 'VAN EIJMA', r: [70, 40, 54, 58, 69, 74] },
    { num: 5, name: 'FLORANUS', r: [80, 44, 60, 66, 68, 68] },
    { num: 6, name: 'ROEMERATOE', r: [70, 52, 64, 66, 70, 72] },
    { num: 7, name: 'BACUNA J.', r: [74, 62, 70, 74, 64, 72] },
    { num: 10, name: 'BACUNA L.', r: [74, 62, 70, 72, 66, 74] },
    { num: 17, name: 'KUWAS', r: [82, 62, 66, 76, 48, 62] },
    { num: 9, name: 'LOCADIA', r: [80, 72, 66, 74, 42, 78] },
    { num: 21, name: 'CHONG', r: [80, 60, 68, 78, 52, 66] },
  ]),
};
