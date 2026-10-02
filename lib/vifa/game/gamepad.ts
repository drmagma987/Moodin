import { INPUT_BITS, type PlayerInputCommand } from './determinism';
import type { GameAction } from './keybindings';

export type ControllerAction = Exclude<
  GameAction,
  'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'
>;

export type ControllerBindings = Record<ControllerAction, number>;

export interface GamepadSnapshot {
  id: string;
  index: number;
  mapping: string;
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

export const CONTROLLER_ACTION_ORDER: ControllerAction[] = [
  'sprint',
  'shot',
  'shortPass',
  'longPass',
  'throughPass',
  'switchPlayer',
  'contain',
];

export const CONTROLLER_ACTION_LABELS: Record<ControllerAction, string> = {
  sprint: 'Sprint',
  shot: 'Shot / Tackle',
  shortPass: 'Short pass',
  longPass: 'Long pass / Slide',
  throughPass: 'Through pass',
  switchPlayer: 'Switch player',
  contain: 'Contain (hold)',
};

export const CONTROLLER_ACTION_HELP: Record<ControllerAction, string> = {
  sprint:
    'Hold while moving to run faster. Sprint is useful in open grass, but it makes tight turns and close control harder.',
  shot:
    'With the ball: hold to build shot power, then release to shoot. Without the ball: tap for a standing tackle.',
  shortPass:
    'Your safest pass along the ground. Tap for a soft nearby pass or hold briefly to send it with more pace.',
  longPass:
    'With the ball: play a longer lofted pass. Without the ball: commit to a sliding tackle.',
  throughPass:
    'Lead a teammate into open space. When defending, hold it to rush your goalkeeper toward the ball.',
  switchPlayer:
    'Change control to the highlighted teammate. Hold this together with Through Pass for a lofted through ball.',
  contain:
    'Hold while defending to face the ball, slow down, and stay goal-side instead of diving into a tackle.',
};

/** Standard-layout defaults based on button position, not printed letters:
 * south=pass, east=shoot, west=long, north=through, shoulders/triggers for
 * defensive modifiers. GameCube-style face labels vary by browser/driver, so
 * the settings capture screen remains the source of truth. */
export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = {
  sprint: 7,
  shot: 1,
  shortPass: 0,
  longPass: 2,
  throughPass: 3,
  switchPlayer: 4,
  contain: 6,
};

const ACTION_BITS: Record<ControllerAction, number> = {
  sprint: INPUT_BITS.sprint,
  shot: INPUT_BITS.shot,
  shortPass: INPUT_BITS.shortPass,
  longPass: INPUT_BITS.longPass,
  throughPass: INPUT_BITS.throughPass,
  switchPlayer: INPUT_BITS.switchPlayer,
  contain: INPUT_BITS.contain,
};

const STORAGE_KEY = 'vifa.controller-bindings.v1';
export const GAMEPAD_DEAD_ZONE = 0.28;

export function loadControllerBindings(): ControllerBindings {
  const next = { ...DEFAULT_CONTROLLER_BINDINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return next;
    const parsed = JSON.parse(raw) as Partial<Record<ControllerAction, unknown>>;
    for (const action of CONTROLLER_ACTION_ORDER) {
      const value = parsed[action];
      if (Number.isInteger(value) && (value as number) >= 0) {
        next[action] = value as number;
      }
    }
  } catch {
    // Storage is optional; malformed profiles safely fall back to defaults.
  }
  return next;
}

export function saveControllerBindings(bindings: ControllerBindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Private browsing/storage denial should not disable controller play.
  }
}

/** Keep every gameplay action reachable by swapping duplicate assignments. */
export function assignControllerButton(
  bindings: ControllerBindings,
  action: ControllerAction,
  button: number,
): ControllerBindings {
  const next = { ...bindings };
  const previous = next[action];
  const clashing = CONTROLLER_ACTION_ORDER.find(
    (candidate) => candidate !== action && next[candidate] === button,
  );
  next[action] = button;
  if (clashing) next[clashing] = previous;
  return next;
}

export function controllerButtonLabel(index: number): string {
  const standard: Record<number, string> = {
    0: 'Bottom face · 0',
    1: 'Right face · 1',
    2: 'Left face · 2',
    3: 'Top face · 3',
    4: 'Left bumper · 4',
    5: 'Right bumper · 5',
    6: 'Left trigger · 6',
    7: 'Right trigger · 7',
    8: 'Select / − · 8',
    9: 'Start / + · 9',
  };
  return standard[index] ?? `Button ${index}`;
}

export function pressedButtonIndexes(gamepad: GamepadSnapshot): number[] {
  const pressed: number[] = [];
  gamepad.buttons.forEach((button, index) => {
    if (button.pressed || button.value > 0.5) pressed.push(index);
  });
  return pressed;
}

/** Convert a polled browser gamepad into the same deterministic command bits
 * used by keyboard input and network/replay frames. */
export function gamepadToCommand(
  gamepad: GamepadSnapshot,
  bindings: ControllerBindings,
  previousPressed: ReadonlySet<number>,
): { command: PlayerInputCommand; pressedButtons: Set<number> } {
  const pressedButtons = new Set(pressedButtonIndexes(gamepad));
  let held = 0;
  let pressed = 0;
  let released = 0;

  const x = gamepad.axes[0] ?? 0;
  const y = gamepad.axes[1] ?? 0;
  if (x < -GAMEPAD_DEAD_ZONE || pressedButtons.has(14)) held |= INPUT_BITS.moveLeft;
  if (x > GAMEPAD_DEAD_ZONE || pressedButtons.has(15)) held |= INPUT_BITS.moveRight;
  if (y < -GAMEPAD_DEAD_ZONE || pressedButtons.has(12)) held |= INPUT_BITS.moveUp;
  if (y > GAMEPAD_DEAD_ZONE || pressedButtons.has(13)) held |= INPUT_BITS.moveDown;

  for (const action of CONTROLLER_ACTION_ORDER) {
    const button = bindings[action];
    const bit = ACTION_BITS[action];
    const isDown = pressedButtons.has(button);
    const wasDown = previousPressed.has(button);
    if (isDown) held |= bit;
    if (isDown && !wasDown) pressed |= bit;
    if (!isDown && wasDown) released |= bit;
  }

  return { command: { held, pressed, released }, pressedButtons };
}

export function connectedGamepads(): GamepadSnapshot[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return Array.from(navigator.getGamepads())
    .filter((gamepad): gamepad is Gamepad => !!gamepad && gamepad.connected)
    .sort((a, b) => a.index - b.index);
}
