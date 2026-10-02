import { buildSquad, type TeamData } from './types';
import { F_433 } from './formations';

// Iraq — 4-3-3.
export const iraq: TeamData = {
  name: 'Iraq',
  abbr: 'IRQ',
  formation: '4-3-3',
  color: '#1f9d55',
  textColor: '#ffffff',
  kit: { shirt: '#1f9d55', sleeve: '#147a40', outline: '#0a4523', shorts: '#f1f2f4' },
  awayKit: { shirt: '#f5f5f5', sleeve: '#e3e3e3', outline: '#0a8a3f', shorts: '#f5f5f5' },
  gkKit: { shirt: '#f59e0b', sleeve: '#c47b06', outline: '#7a4d02' },
  kickoffFwd: 9,
  players: buildSquad(F_433, [
    { num: 12, name: 'JALAL', r: [50, 28, 48, 44, 70, 73] },
    { num: 2, name: 'SULAKA', r: [72, 40, 56, 58, 71, 76] },
    { num: 26, name: 'PUTROS', r: [72, 40, 54, 58, 70, 76] },
    { num: 4, name: 'TAHSEEN', r: [70, 40, 54, 56, 70, 75] },
    { num: 6, name: 'YOUNIS', r: [78, 42, 58, 64, 67, 68] },
    { num: 7, name: 'AMYN', r: [76, 55, 66, 70, 64, 68] },
    { num: 16, name: 'AL-AMMARI', r: [74, 58, 70, 72, 68, 72] },
    { num: 14, name: 'IQBAL', r: [76, 58, 72, 76, 62, 66] },
    { num: 11, name: 'QASEM', r: [82, 60, 64, 74, 48, 62] },
    { num: 18, name: 'HUSSEIN', r: [74, 72, 62, 70, 42, 80] },
    { num: 17, name: 'JASIM', r: [82, 64, 66, 76, 45, 64] },
  ]),
};
