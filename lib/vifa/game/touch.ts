import { INPUT_BITS, type PlayerInputCommand } from './determinism';

export const TOUCH_MOVE_MASK =
  INPUT_BITS.moveUp |
  INPUT_BITS.moveDown |
  INPUT_BITS.moveLeft |
  INPUT_BITS.moveRight;

export const TOUCH_SPRINT_THRESHOLD = 0.75;

/** The stick owns sprint as well as direction so easing back inside the outer
 * ring releases sprint without disturbing any action held by the right thumb. */
export const TOUCH_JOYSTICK_MASK = TOUCH_MOVE_MASK | INPUT_BITS.sprint;

/** Bits owned by the left touch stick, including its pass-aim assistance tag. */
export const TOUCH_STICK_INPUT_MASK =
  TOUCH_JOYSTICK_MASK | INPUT_BITS.touchPassAssist;

/** Translate a virtual-stick vector into the same direction bits used by every
 * other VIFA input source. Diagonals deliberately set two bits. Pushing the
 * stick through the outer 25% automatically adds sprint for two-thumb play. */
export function touchDirectionBits(
  x: number,
  y: number,
  deadZone = 0.22,
  sprintThreshold = TOUCH_SPRINT_THRESHOLD,
): number {
  let bits = 0;
  if (x < -deadZone) bits |= INPUT_BITS.moveLeft;
  if (x > deadZone) bits |= INPUT_BITS.moveRight;
  if (y < -deadZone) bits |= INPUT_BITS.moveUp;
  if (y > deadZone) bits |= INPUT_BITS.moveDown;
  if (bits !== 0 && Math.hypot(x, y) >= sprintThreshold) {
    bits |= INPUT_BITS.sprint;
  }
  return bits;
}

/** Preserve press/release edges when touch state joins keyboard and gamepad
 * input in the deterministic engine frame. */
export function touchInputTransition(
  previousHeld: number,
  nextHeld: number,
): PlayerInputCommand {
  return {
    held: nextHeld,
    pressed: nextHeld & ~previousHeld,
    released: previousHeld & ~nextHeld,
  };
}
