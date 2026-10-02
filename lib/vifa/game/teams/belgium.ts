import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Belgium — 4-2-3-1 (best-effort current XI).
export const belgium: TeamData = {
  name: 'Belgium',
  abbr: 'BEL',
  formation: '4-2-3-1',
  color: '#e30613',
  textColor: '#ffffff',
  kit: { shirt: '#e30613', sleeve: '#b3050f', outline: '#5e0308', shorts: '#9e0510' },
  awayKit: { shirt: '#101524', sleeve: '#0b0f1b', outline: '#e3b23c', shorts: '#101524' },
  gkKit: { shirt: '#f6e94a', sleeve: '#d4c920', outline: '#7a7010' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'COURTOIS', r: [56, 30, 66, 58, 90, 88] },
    { num: 2, name: 'DEBAST', r: [74, 42, 72, 72, 80, 80] },
    { num: 3, name: 'THEATE', r: [78, 45, 68, 70, 80, 82] },
    { num: 4, name: 'MECHELE', r: [72, 42, 68, 66, 80, 80] },
    { num: 5, name: 'DE CUYPER', r: [82, 52, 74, 78, 76, 76] },
    { num: 6, name: 'WITSEL', r: [62, 68, 78, 74, 80, 82] },
    { num: 8, name: 'TIELEMANS', r: [72, 80, 84, 82, 72, 76] },
    { num: 7, name: 'DE BRUYNE', r: [72, 88, 93, 86, 64, 78] },
    { num: 11, name: 'DOKU', r: [95, 78, 74, 90, 38, 72] },
    { num: 9, name: 'LUKAKU', r: [82, 86, 74, 80, 44, 90] },
    { num: 10, name: 'TROSSARD', r: [82, 82, 80, 86, 46, 68] },
  ]),
};
