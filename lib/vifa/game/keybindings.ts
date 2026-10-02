// User-configurable key bindings. The engine internally works in terms of the
// DEFAULT physical code for each action (its "canonical" code), so all the
// existing `this.keys.has('KeyW')` / `'ArrowUp'` logic in engine.ts keeps
// working untouched. User rebindings are translated to the canonical code on
// the way in (see PitchKickGame.setBindings / onKeyDown).

export type GameAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'shot'
  | 'shortPass'
  | 'longPass'
  | 'throughPass'
  | 'switchPlayer'
  | 'contain';

export type KeyBindings = Record<GameAction, string>;

/** Default physical code for each action — these doubles as the engine's
 *  canonical codes, so they must match the literals used inside engine.ts. */
export const DEFAULT_BINDINGS: KeyBindings = {
  moveUp: 'ArrowUp',
  moveDown: 'ArrowDown',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  sprint: 'KeyE',
  shot: 'KeyD',
  shortPass: 'KeyS',
  longPass: 'KeyA',
  throughPass: 'KeyW',
  switchPlayer: 'KeyQ',
  contain: 'KeyC',
};

export const ACTION_ORDER: GameAction[] = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'sprint',
  'shot',
  'shortPass',
  'longPass',
  'throughPass',
  'switchPlayer',
  'contain',
];

/** Grouped metadata for the settings panel. */
export const BINDING_GROUPS: {
  title: string;
  actions: { action: GameAction; label: string }[];
}[] = [
  {
    title: 'Movement',
    actions: [
      { action: 'moveUp', label: 'Move up' },
      { action: 'moveDown', label: 'Move down' },
      { action: 'moveLeft', label: 'Move left' },
      { action: 'moveRight', label: 'Move right' },
    ],
  },
  {
    title: 'Actions',
    actions: [
      { action: 'sprint', label: 'Sprint' },
      { action: 'shot', label: 'Shot / Tackle' },
      { action: 'shortPass', label: 'Short pass' },
      { action: 'longPass', label: 'Long pass / Slide' },
      { action: 'throughPass', label: 'Through pass' },
      { action: 'switchPlayer', label: 'Switch player' },
      { action: 'contain', label: 'Contain (hold)' },
    ],
  },
];

const STORAGE_KEY = 'wc2026.keybindings';

/** Load bindings from localStorage, falling back to defaults for any missing
 *  or invalid entries. */
export function loadBindings(): KeyBindings {
  const merged: KeyBindings = { ...DEFAULT_BINDINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<GameAction, unknown>>;
      for (const action of ACTION_ORDER) {
        const v = parsed[action];
        if (typeof v === 'string' && v) merged[action] = v;
      }
    }
  } catch {
    // Ignore corrupt storage and use defaults.
  }
  return merged;
}

export function saveBindings(b: KeyBindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // Storage unavailable (private mode etc.) — bindings just won't persist.
  }
}

/** Assign `code` to `action`, swapping with whatever action already owns that
 *  code so every action always stays bound to a unique key. */
export function assignKey(
  bindings: KeyBindings,
  action: GameAction,
  code: string,
): KeyBindings {
  const next: KeyBindings = { ...bindings };
  const previous = next[action];
  const clashing = ACTION_ORDER.find(
    (a) => a !== action && next[a] === code,
  );
  next[action] = code;
  if (clashing) next[clashing] = previous; // swap so nothing is left unbound
  return next;
}

/** Human-readable label for a KeyboardEvent.code (e.g. 'KeyW' → 'W'). */
export function codeLabel(code: string): string {
  if (!code) return '—';
  const arrows: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  if (arrows[code]) return arrows[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const named: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Bksp',
    Escape: 'Esc',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
  };
  return named[code] ?? code;
}

/** Bottom-of-screen controls legend, derived from the live bindings. */
export function controlsLegend(b: KeyBindings): { keys: string; label: string }[] {
  return [
    {
      keys: `${codeLabel(b.moveLeft)} ${codeLabel(b.moveUp)} ${codeLabel(b.moveDown)} ${codeLabel(b.moveRight)}`,
      label: 'Move',
    },
    { keys: codeLabel(b.sprint), label: 'Sprint' },
    { keys: codeLabel(b.shot), label: 'Shot / Tackle' },
    { keys: codeLabel(b.shortPass), label: 'Short pass' },
    { keys: codeLabel(b.longPass), label: 'Long pass / Slide' },
    { keys: codeLabel(b.throughPass), label: 'Through pass' },
    {
      keys: `${codeLabel(b.switchPlayer)} + ${codeLabel(b.throughPass)}`,
      label: 'Lofted through ball',
    },
    { keys: codeLabel(b.contain), label: 'Contain (hold)' },
    { keys: codeLabel(b.switchPlayer), label: 'Switch player' },
  ];
}
