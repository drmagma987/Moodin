import { buildSquad, type TeamData } from './types';
import { F_442 } from './formations';

// Sweden — 4-4-2.
export const sweden: TeamData = {
  name: 'Sweden',
  abbr: 'SWE',
  formation: '4-4-2',
  color: '#1f6bd6',
  textColor: '#ffd200',
  kit: { shirt: '#ffd200', sleeve: '#d8b000', outline: '#7a6300', shorts: '#1652a8' },
  awayKit: { shirt: '#16224d', sleeve: '#111a3b', outline: '#080f24', shorts: '#16224d' },
  gkKit: { shirt: '#1f6bd6', sleeve: '#1652a8', outline: '#0a2a5e' },
  kickoffFwd: 9,
  players: buildSquad(F_442, [
    { num: 1, name: 'ZETTERSTRÖM', r: [50, 30, 52, 46, 73, 74] },
    { num: 6, name: 'JOHANSSON', r: [80, 46, 66, 70, 73, 74] },
    { num: 3, name: 'LINDELÖF', r: [74, 45, 68, 68, 80, 78] },
    { num: 4, name: 'HIEN', r: [78, 40, 62, 64, 81, 83] },
    { num: 5, name: 'GUDMUNDSSON', r: [82, 48, 68, 72, 73, 72] },
    { num: 11, name: 'ELANGA', r: [94, 72, 72, 82, 52, 68] },
    { num: 7, name: 'BERGVALL', r: [78, 62, 72, 76, 66, 68] },
    { num: 19, name: 'SVANBERG', r: [74, 64, 72, 74, 68, 74] },
    { num: 18, name: 'AYARI', r: [76, 58, 70, 74, 64, 68] },
    { num: 9, name: 'ISAK', r: [85, 86, 76, 86, 42, 76] },
    { num: 17, name: 'GYÖKERES', r: [88, 86, 72, 80, 45, 85] },
  ]),
};
