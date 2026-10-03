import { INPUT_BITS, type PlayerInputCommand } from './determinism';

export const TOUCH_MOVE_MASK =
  INPUT_BITS.moveUp |
  INPUT_BITS.moveDown |
  INPUT_BITS.moveLeft |
  INPUT_BITS.moveRight;

/** Translate a virtual-stick vector into the same direction bits used by every
 * other VIFA input source. Diagonals deliberately set two bits. */
export function touchDirectionBits(
  x: number,
  y: number,
  deadZone = 0.22,
): number {
  let bits = 0;
  if (x < -deadZone) bits |= INPUT_BITS.moveLeft;
  if (x > deadZone) bits |= INPUT_BITS.moveRight;
  if (y < -deadZone) bits |= INPUT_BITS.moveUp;
  if (y > deadZone) bits |= INPUT_BITS.moveDown;
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
