export const FIXED_TICK_RATE = 30;
export const FIXED_DT = 1 / FIXED_TICK_RATE;

export const INPUT_BITS = {
  moveUp: 1 << 0,
  moveDown: 1 << 1,
  moveLeft: 1 << 2,
  moveRight: 1 << 3,
  sprint: 1 << 4,
  shot: 1 << 5,
  shortPass: 1 << 6,
  longPass: 1 << 7,
  throughPass: 1 << 8,
  switchPlayer: 1 << 9,
  contain: 1 << 10,
  /** Touch-only marker: strengthen receiver selection toward stick direction. */
  touchPassAssist: 1 << 11,
} as const;

export interface PlayerInputCommand {
  held: number;
  pressed: number;
  released: number;
}

export interface InputFrame {
  tick: number;
  home: PlayerInputCommand;
  away: PlayerInputCommand;
}

export interface ReplayLog {
  version: 1;
  seed: number;
  tickRate: number;
  frames: InputFrame[];
}

export interface EntityRef {
  team: 'home' | 'away';
  index: number;
}

export interface MatchSnapshot {
  version: 1;
  tick: number;
  seed: number;
  rngState: number;
  score: { home: number; away: number };
  elapsed: number;
  ball: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    r: number;
  };
  players: {
    home: Array<Record<string, unknown>>;
    away: Array<Record<string, unknown>>;
  };
  possession: EntityRef | null;
  controlled: EntityRef;
  awayControlled: EntityRef;
  phase: {
    freeze: number;
    outOfPlay: number;
    celebration: number;
    message: string;
  };
}

const CODE_BITS: ReadonlyArray<readonly [string, number]> = [
  ['ArrowUp', INPUT_BITS.moveUp],
  ['ArrowDown', INPUT_BITS.moveDown],
  ['ArrowLeft', INPUT_BITS.moveLeft],
  ['ArrowRight', INPUT_BITS.moveRight],
  ['KeyE', INPUT_BITS.sprint],
  ['KeyD', INPUT_BITS.shot],
  ['KeyS', INPUT_BITS.shortPass],
  ['KeyA', INPUT_BITS.longPass],
  ['KeyW', INPUT_BITS.throughPass],
  ['KeyQ', INPUT_BITS.switchPlayer],
  ['KeyC', INPUT_BITS.contain],
  ['TouchPassAssist', INPUT_BITS.touchPassAssist],
];

export function codesToBits(codes: Iterable<string>): number {
  const values = new Set(codes);
  let bits = 0;
  for (const [code, bit] of CODE_BITS) {
    if (values.has(code)) bits |= bit;
  }
  return bits;
}

export function bitsToCodes(bits: number): string[] {
  const codes: string[] = [];
  for (const [code, bit] of CODE_BITS) {
    if ((bits & bit) !== 0) codes.push(code);
  }
  return codes;
}

export function emptyInputFrame(tick: number): InputFrame {
  const empty = { held: 0, pressed: 0, released: 0 };
  return { tick, home: { ...empty }, away: { ...empty } };
}

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number) {
    this.state = normalizeSeed(state);
  }
}

export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function snapshotDigest(snapshot: MatchSnapshot): string {
  const json = JSON.stringify(snapshot);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
