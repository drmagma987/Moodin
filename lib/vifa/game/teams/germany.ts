import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Germany — 4-2-3-1. Real 2026 WC squad (Nagelsmann, announced 21 May 2026).
// Neuer recalled as #1; Kimmich captain.
export const germany: TeamData = {
  name: 'Germany',
  abbr: 'GER',
  formation: '4-2-3-1',
  color: '#f4f4f4',
  textColor: '#15171c',
  kit: { shirt: '#f4f4f4', sleeve: '#d2d2d2', outline: '#2b2b2b', shorts: '#16181d' },
  awayKit: { shirt: '#15171c', sleeve: '#0e1014', outline: '#c8102e', shorts: '#15171c' },
  gkKit: { shirt: '#27e0a6', sleeve: '#12a878', outline: '#0a5c42' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'NEUER', r: [58, 30, 72, 62, 86, 84] },
    { num: 6, name: 'KIMMICH', r: [76, 72, 86, 82, 80, 78] },
    { num: 4, name: 'TAH', r: [78, 42, 68, 68, 83, 85] },
    { num: 2, name: 'RÜDIGER', r: [82, 45, 70, 70, 85, 86] },
    { num: 22, name: 'RAUM', r: [82, 55, 78, 78, 78, 78] },
    { num: 5, name: 'PAVLOVIĆ', r: [76, 68, 80, 82, 78, 80] },
    { num: 8, name: 'GORETZKA', r: [76, 78, 80, 80, 74, 86] },
    { num: 17, name: 'WIRTZ', r: [82, 82, 86, 90, 60, 72] },
    { num: 19, name: 'SANÉ', r: [92, 82, 80, 87, 42, 76] },
    { num: 11, name: 'WOLTEMADE', r: [80, 80, 72, 80, 40, 84] },
    { num: 10, name: 'MUSIALA', r: [84, 84, 84, 93, 52, 72] },
  ]),
};
