// Stateless geometry + colour helpers shared across the game engine.
// Pure functions only — no game state, no canvas, no module-level mutables.

import type { Vec } from './types';

export function len(x: number, y: number) {
  return Math.hypot(x, y) || 1;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Lighten (f>1) or darken (f<1) a #rrggbb colour by a multiplier. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

/** Distance from point p to the line segment a→b. */
export function distToSegment(p: Vec, a: Vec, b: Vec) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}
