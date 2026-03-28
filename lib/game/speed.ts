import type { Position } from "./types";

type SpeedBand = {
  minForty: number;
  maxForty: number;
  minSpeed: number;
  maxSpeed: number;
};

const SPEED_BANDS: Record<Position, SpeedBand> = {
  QB: { minForty: 4.45, maxForty: 4.9, minSpeed: 74, maxSpeed: 90 },
  RB: { minForty: 4.32, maxForty: 4.67, minSpeed: 82, maxSpeed: 94 },
  WR: { minForty: 4.24, maxForty: 4.64, minSpeed: 86, maxSpeed: 95 },
  TE: { minForty: 4.5, maxForty: 4.8, minSpeed: 76, maxSpeed: 88 },
  DL: { minForty: 4.65, maxForty: 5.0, minSpeed: 65, maxSpeed: 79 },
  LB: { minForty: 4.48, maxForty: 4.83, minSpeed: 78, maxSpeed: 88 },
  SEC: { minForty: 4.28, maxForty: 4.63, minSpeed: 88, maxSpeed: 95 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function speedRatingFromForty(position: Position, forty: number) {
  const band = SPEED_BANDS[position];
  const clampedForty = clamp(forty, band.minForty, band.maxForty);
  const normalized =
    (band.maxForty - clampedForty) / (band.maxForty - band.minForty);

  return Math.round(
    band.minSpeed + normalized * (band.maxSpeed - band.minSpeed)
  );
}
