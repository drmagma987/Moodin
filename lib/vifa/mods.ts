import type { KeyBindings } from './game/keybindings';

export const VIFA_MODS = {
  displayName: 'VIFA',
  matchRealSeconds: 180,
  localMultiplayer: {
    label: 'Local 2 Player',
    description: 'Two players share one keyboard in the same live simulation.',
  },
} as const;

export const PLAYER_TWO_BINDINGS = {
  moveUp: 'KeyI',
  moveDown: 'KeyK',
  moveLeft: 'KeyJ',
  moveRight: 'KeyL',
  sprint: 'ShiftRight',
  shot: 'KeyO',
  shortPass: 'KeyU',
  longPass: 'KeyP',
  throughPass: 'KeyY',
  switchPlayer: 'KeyH',
  contain: 'Semicolon',
} satisfies KeyBindings;
