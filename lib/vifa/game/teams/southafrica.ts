import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// South Africa — 4-3-3.
export const southAfrica: TeamData = {
  name: 'South Africa',
  abbr: 'RSA',
  formation: '4-3-3',
  color: '#0a7a3b',
  textColor: '#ffd200',
  kit: { shirt: '#0a7a3b', sleeve: '#075c2c', outline: '#033017', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#0a7a47', shorts: '#f5f5f5' },
  gkKit: { shirt: '#f59e0b', sleeve: '#c47b06', outline: '#7a4d02' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 1, name: 'WILLIAMS', r: [52, 32, 56, 50, 76, 78] },
    { num: 20, name: 'MUDAU', r: [84, 46, 64, 70, 72, 70] },
    { num: 19, name: 'SIBISI', r: [74, 40, 56, 58, 72, 77] },
    { num: 3, name: 'NDAMANE', r: [72, 40, 56, 58, 72, 76] },
    { num: 6, name: 'MODIBA', r: [82, 48, 68, 72, 70, 70] },
    { num: 4, name: 'MOKOENA', r: [76, 68, 76, 76, 72, 74] },
    { num: 5, name: 'MBATHA', r: [74, 55, 68, 70, 68, 70] },
    { num: 11, name: 'ZWANE', r: [76, 66, 74, 78, 55, 62] },
    { num: 7, name: 'APPOLLIS', r: [85, 64, 68, 78, 48, 62] },
    { num: 9, name: 'FOSTER', r: [84, 74, 66, 76, 42, 76] },
    { num: 10, name: 'MOFOKENG', r: [84, 66, 68, 80, 48, 62] },
  ]),
};
