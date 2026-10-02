// ---- TV broadcast projection ----------------------------------------------
// The simulation stays flat 2D (x = goal-to-goal, y = depth between the
// touchlines). The renderer projects it like a TV camera: the far touchline
// (y=0) is drawn smaller and higher, the near touchline (y=FIELD_H) bigger
// and lower, and everything scales with depth.

import { clamp } from './math';
import { FIELD_W, FIELD_H, CANVAS_W } from './constants';

export const S_FAR = 0.66; // scale at the far touchline (camera pulled closer)
const S_NEAR = 1.24; // scale at the near touchline
export const PITCH_TOP = 110; // base screen y of the far touchline (pre-zoom)
const PITCH_DRAW_H = 560; // base screen height of the pitch (pre-zoom)
const AVG_S = (S_FAR + S_NEAR) / 2;

// Broadcast zoom: a real TV / FIFA tele camera does NOT show the whole pitch —
// it crops in close and pans to follow the ball both horizontally AND
// vertically (depth). ZOOM>1 enlarges everything and crops the field; the
// vertical camera (viewCamY) then keeps the action framed.
export const ZOOM = 1.5;
/** Screen y where the camera-centre depth (viewCamY) is drawn (≈ the ball). */
const VIEW_ANCHOR_Y = 400;

// The camera pans to follow the ball (FIFA tele cam) — only a section of the
// pitch is visible at a time. `viewCamX`/`viewCamY` are the field coords the
// camera is centred on; call `setCamera` each frame before projecting.
let viewCamX = FIELD_W / 2;
let viewCamY = FIELD_H / 2;

/** Camera clamp so the goal + some behind-goal apron stays on screen.
 *  Pulled in with the closer zoom so the goalmouth stays framed. */
export const CAM_MIN = 360;
export const CAM_MAX = FIELD_W - 360;
/** Vertical camera clamp: keep the visible window roughly within the pitch.
 *  CAM_Y_MAX is pulled DOWN close to the near touchline so that when play is in
 *  the bottom third the camera pans far enough to actually show the near
 *  (bottom) touchline — otherwise it sits just off the bottom of the canvas. */
export const CAM_Y_MIN = FIELD_H * 0.30;
export const CAM_Y_MAX = FIELD_H * 0.82;

export type Projected = { x: number; y: number; s: number };

/** Sync the projection with the engine camera (field coords). */
export function setCamera(camX: number, camY: number) {
  viewCamX = camX;
  viewCamY = camY;
}

/** Base (pre-zoom) vertical screen position of a field depth y. */
function baseDepthY(y: number): number {
  const t = clamp(y / FIELD_H, -0.2, 1.2);
  const v = (S_FAR * t + 0.5 * (S_NEAR - S_FAR) * t * t) / AVG_S;
  return PITCH_TOP + PITCH_DRAW_H * v;
}

/** Project field coordinates to screen coordinates. */
export function proj(x: number, y: number): Projected {
  const t = clamp(y / FIELD_H, -0.2, 1.2);
  const s = (S_FAR + (S_NEAR - S_FAR) * t) * ZOOM;
  // Vertical: zoom in around the camera-centre depth and pan to follow it.
  const yScreen = VIEW_ANCHOR_Y + (baseDepthY(y) - baseDepthY(viewCamY)) * ZOOM;
  return {
    x: CANVAS_W / 2 + (x - viewCamX) * s,
    y: yScreen,
    s,
  };
}
