import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Japan — 4-2-3-1 (best-effort current XI).
export const japan: TeamData = {
  name: 'Japan',
  abbr: 'JPN',
  formation: '4-2-3-1',
  color: '#0b1f6b',
  textColor: '#ffffff',
  kit: { shirt: '#0b1f6b', sleeve: '#081852', outline: '#040d2e', shorts: '#081852' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#1b2a78', shorts: '#f5f5f5' },
  gkKit: { shirt: '#2bd47a', sleeve: '#17a95c', outline: '#0a5f33' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'SUZUKI', r: [54, 32, 56, 52, 78, 79] },
    { num: 2, name: 'SUGAWARA', r: [86, 48, 70, 74, 73, 72] },
    { num: 4, name: 'ITAKURA', r: [76, 42, 66, 66, 79, 80] },
    { num: 16, name: 'WATANABE', r: [74, 40, 60, 62, 75, 78] },
    { num: 5, name: 'NAGATOMO', r: [76, 42, 62, 66, 71, 68] },
    { num: 7, name: 'TANAKA', r: [74, 62, 74, 76, 72, 72] },
    { num: 15, name: 'KAMADA', r: [74, 76, 80, 80, 66, 72] },
    { num: 8, name: 'KUBO', r: [85, 76, 78, 86, 52, 62] },
    { num: 10, name: 'DOAN', r: [82, 76, 76, 82, 55, 68] },
    { num: 18, name: 'UEDA', r: [82, 76, 66, 74, 42, 76] },
    { num: 11, name: 'MAEDA', r: [92, 72, 68, 76, 55, 72] },
  ]),
};
