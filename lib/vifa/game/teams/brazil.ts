import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Brazil — 4-3-3 (best-effort current XI).
export const brazil: TeamData = {
  name: 'Brazil',
  abbr: 'BRA',
  formation: '4-3-3',
  color: '#fbe108',
  textColor: '#0a6b3a',
  kit: { shirt: '#fbe108', sleeve: '#1c9e57', outline: '#0a6b3a', shorts: '#1b3fae' },
  awayKit: { shirt: '#2b56c7', sleeve: '#2146a3', outline: '#11265e', shorts: '#2b56c7' },
  gkKit: { shirt: '#2b7fff', sleeve: '#1f63cc', outline: '#0a2f6e' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'ALISSON', r: [56, 30, 62, 55, 89, 86] },
    { num: 13, name: 'DANILO', r: [74, 55, 74, 76, 79, 76] },
    { num: 4, name: 'MARQUINHOS', r: [78, 55, 75, 76, 86, 82] },
    { num: 3, name: 'G. MAGALHÃES', r: [80, 52, 68, 68, 85, 86] },
    { num: 6, name: 'ALEX SANDRO', r: [76, 55, 72, 74, 77, 76] },
    { num: 5, name: 'CASEMIRO', r: [62, 72, 76, 72, 84, 87] },
    { num: 8, name: 'BRUNO G.', r: [74, 74, 82, 80, 78, 80] },
    { num: 20, name: 'PAQUETÁ', r: [78, 78, 83, 86, 68, 78] },
    { num: 11, name: 'RAPHINHA', r: [88, 84, 82, 87, 45, 68] },
    { num: 9, name: 'M. CUNHA', r: [82, 80, 75, 84, 42, 78] },
    { num: 7, name: 'VINI JR.', r: [95, 86, 80, 92, 34, 68] },
  ]),
};
