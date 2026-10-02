import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Cape Verde — 4-3-3 (World Cup debut).
export const capeVerde: TeamData = {
  name: 'Cape Verde',
  abbr: 'CPV',
  formation: '4-3-3',
  color: '#1f3a93',
  textColor: '#ffffff',
  kit: { shirt: '#1f3a93', sleeve: '#162b6f', outline: '#0a153a', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#1b3a78', shorts: '#f5f5f5' },
  gkKit: { shirt: '#f59e0b', sleeve: '#c47b06', outline: '#7a4d02' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'VOZINHA', r: [50, 30, 50, 46, 71, 73] },
    { num: 22, name: 'MOREIRA', r: [80, 44, 62, 68, 70, 70] },
    { num: 4, name: 'LOPES', r: [70, 40, 58, 60, 73, 77] },
    { num: 5, name: 'COSTA', r: [72, 40, 56, 58, 72, 76] },
    { num: 2, name: 'STOPIRA', r: [78, 44, 62, 66, 70, 70] },
    { num: 6, name: 'PINA', r: [74, 55, 68, 70, 66, 70] },
    { num: 8, name: 'JOÃO PAULO', r: [74, 55, 66, 70, 64, 70] },
    { num: 10, name: 'MONTEIRO', r: [78, 64, 73, 76, 62, 68] },
    { num: 7, name: 'JOVANE', r: [86, 68, 68, 80, 48, 64] },
    { num: 9, name: 'BENCHIMOL', r: [78, 70, 64, 72, 42, 80] },
    { num: 11, name: 'RODRIGUES', r: [82, 68, 72, 78, 50, 68] },
  ]),
};
