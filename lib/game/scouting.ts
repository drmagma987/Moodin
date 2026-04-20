import type { DraftedPlayer, Prospect } from "./types";
import { getPlayerPower, getPlayerSpeed, getPlayerTechnical } from "./playerRatings";

export type ScoutAttribute = "speed" | "technical" | "power";
export type ScoutLevel = 1 | 2;
export type ScoutingRange = {
  min: number;
  max: number;
  level: ScoutLevel;
};
export type PlayerScoutingReport = Partial<Record<ScoutAttribute, ScoutingRange>>;
export type ScoutingMap = Record<string, PlayerScoutingReport>;

const SCOUT_MIN = 45;
const SCOUT_MAX = 99;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function trueAttributeValue(player: Prospect | DraftedPlayer, attribute: ScoutAttribute) {
  switch (attribute) {
    case "speed":
      return getPlayerSpeed(player);
    case "technical":
      return getPlayerTechnical(player);
    case "power":
      return getPlayerPower(player);
  }
}

export function scoutingRangeWidth(level: ScoutLevel) {
  return level === 1 ? 10 : 3;
}

export function buildScoutingRange(
  player: Prospect | DraftedPlayer,
  attribute: ScoutAttribute,
  level: ScoutLevel,
  salt: string
): ScoutingRange {
  const truth = trueAttributeValue(player, attribute);
  const width = scoutingRangeWidth(level);
  const hash = hashString(`${salt}:${player.id}:${attribute}:${level}`);
  let leftSpan = hash % (width + 1);

  // Avoid ranges that reveal the true value as a simple midpoint.
  if (width > 2 && leftSpan === Math.floor(width / 2)) {
    leftSpan = leftSpan >= width ? leftSpan - 1 : leftSpan + 1;
  }

  let min = truth - leftSpan;
  let max = min + width;

  if (min < SCOUT_MIN) {
    min = SCOUT_MIN;
    max = min + width;
  }

  if (max > SCOUT_MAX) {
    max = SCOUT_MAX;
    min = max - width;
  }

  if (truth < min) {
    min = truth;
    max = clamp(min + width, min, SCOUT_MAX);
  }

  if (truth > max) {
    max = truth;
    min = clamp(max - width, SCOUT_MIN, max);
  }

  return {
    min: clamp(min, SCOUT_MIN, SCOUT_MAX),
    max: clamp(max, SCOUT_MIN, SCOUT_MAX),
    level,
  };
}

export function scoutingButtonLabel(attribute: ScoutAttribute) {
  switch (attribute) {
    case "speed":
      return "SPD";
    case "technical":
      return "SKL";
    case "power":
      return "PWR";
  }
}

export function scoutingRangeLabel(
  attribute: ScoutAttribute,
  range: ScoutingRange | undefined
) {
  const label = scoutingButtonLabel(attribute);
  if (!range) return `${label} hidden`;
  return `${label} ${range.min}-${range.max}`;
}
