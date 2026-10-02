import { buildSquad, type TeamData } from './types';
import { F_4231 } from './formations';

// Ghana — 4-2-3-1.
export const ghana: TeamData = {
  name: 'Ghana',
  abbr: 'GHA',
  formation: '4-2-3-1',
  color: '#0a7a3b',
  textColor: '#ffffff',
  kit: { shirt: '#ffffff', sleeve: '#e6e6e6', outline: '#9ca3af', shorts: '#f1f2f4' },
  awayKit: { shirt: '#15171c', sleeve: '#0e1014', outline: '#c8102e', shorts: '#15171c' },
  gkKit: { shirt: '#0a7a3b', sleeve: '#075c2c', outline: '#033017' },
  kickoffFwd: 9,
  players: buildSquad(F_4231, [
    { num: 1, name: 'ATI-ZIGI', r: [52, 30, 54, 48, 74, 76] },
    { num: 2, name: 'SEIDU', r: [84, 46, 64, 70, 73, 72] },
    { num: 4, name: 'ADJETEY', r: [76, 40, 58, 60, 74, 78] },
    { num: 6, name: 'MUMIN', r: [76, 40, 58, 62, 76, 80] },
    { num: 14, name: 'MENSAH', r: [82, 46, 64, 70, 72, 70] },
    { num: 5, name: 'PARTEY', r: [74, 74, 80, 80, 80, 82] },
    { num: 8, name: 'SIBO', r: [76, 58, 70, 72, 70, 72] },
    { num: 11, name: 'SEMENYO', r: [88, 76, 72, 80, 52, 78] },
    { num: 7, name: 'FATAWU', r: [90, 72, 72, 82, 50, 66] },
    { num: 9, name: 'JORDAN AYEW', r: [78, 76, 74, 78, 52, 76] },
    { num: 19, name: 'I. WILLIAMS', r: [92, 76, 72, 80, 48, 80] },
  ]),
};
