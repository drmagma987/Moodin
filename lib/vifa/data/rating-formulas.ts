import type { RatingTuple } from '../game/teams/types';

export const VIFA_FACE_CATEGORIES = [
  'pac',
  'sho',
  'pas',
  'dri',
  'def',
  'phy',
] as const;

export type VifaFaceCategory = (typeof VIFA_FACE_CATEGORIES)[number];

export interface GranularPlayerAttributes {
  acceleration: number;
  sprintSpeed: number;
  positioning: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  volleys: number;
  penalties: number;
  vision: number;
  crossing: number;
  freeKickAccuracy: number;
  shortPassing: number;
  longPassing: number;
  curve: number;
  agility: number;
  balance: number;
  reactions: number;
  ballControl: number;
  dribbling: number;
  composure: number;
  interceptions: number;
  headingAccuracy: number;
  marking: number;
  standingTackle: number;
  slidingTackle: number;
  jumping: number;
  stamina: number;
  strength: number;
  aggression: number;
  goalkeeperDiving: number;
  goalkeeperHandling: number;
  goalkeeperKicking: number;
  goalkeeperPositioning: number;
  goalkeeperReflexes: number;
  goalkeeperSpeed: number;
}
export type PartialGranularPlayerAttributes = Partial<GranularPlayerAttributes>;

interface WeightedAttribute {
  attribute: keyof GranularPlayerAttributes;
  weight: number;
}

const OUTFIELD_FORMULAS: Record<VifaFaceCategory, readonly WeightedAttribute[]> = {
  pac: [
    { attribute: 'acceleration', weight: 0.45 },
    { attribute: 'sprintSpeed', weight: 0.55 },
  ],
  sho: [
    { attribute: 'positioning', weight: 0.05 },
    { attribute: 'finishing', weight: 0.45 },
    { attribute: 'shotPower', weight: 0.2 },
    { attribute: 'longShots', weight: 0.2 },
    { attribute: 'volleys', weight: 0.05 },
    { attribute: 'penalties', weight: 0.05 },
  ],
  pas: [
    { attribute: 'vision', weight: 0.2 },
    { attribute: 'crossing', weight: 0.2 },
    { attribute: 'freeKickAccuracy', weight: 0.05 },
    { attribute: 'shortPassing', weight: 0.35 },
    { attribute: 'longPassing', weight: 0.15 },
    { attribute: 'curve', weight: 0.05 },
  ],
  dri: [
    { attribute: 'agility', weight: 0.1 },
    { attribute: 'balance', weight: 0.05 },
    { attribute: 'reactions', weight: 0.05 },
    { attribute: 'ballControl', weight: 0.3 },
    { attribute: 'dribbling', weight: 0.45 },
    { attribute: 'composure', weight: 0.05 },
  ],
  def: [
    { attribute: 'interceptions', weight: 0.2 },
    { attribute: 'headingAccuracy', weight: 0.1 },
    { attribute: 'marking', weight: 0.3 },
    { attribute: 'standingTackle', weight: 0.3 },
    { attribute: 'slidingTackle', weight: 0.1 },
  ],
  phy: [
    { attribute: 'jumping', weight: 0.05 },
    { attribute: 'stamina', weight: 0.25 },
    { attribute: 'strength', weight: 0.5 },
    { attribute: 'aggression', weight: 0.2 },
  ],
};

const GOALKEEPER_VIFA_FORMULAS: Record<
  VifaFaceCategory,
  readonly WeightedAttribute[]
> = {
  pac: [
    { attribute: 'goalkeeperSpeed', weight: 0.7 },
    { attribute: 'acceleration', weight: 0.15 },
    { attribute: 'sprintSpeed', weight: 0.15 },
  ],
  sho: [{ attribute: 'goalkeeperKicking', weight: 1 }],
  pas: [
    { attribute: 'goalkeeperKicking', weight: 0.6 },
    { attribute: 'shortPassing', weight: 0.2 },
    { attribute: 'longPassing', weight: 0.2 },
  ],
  dri: [
    { attribute: 'goalkeeperHandling', weight: 0.5 },
    { attribute: 'goalkeeperReflexes', weight: 0.25 },
    { attribute: 'reactions', weight: 0.25 },
  ],
  def: [
    { attribute: 'goalkeeperDiving', weight: 0.25 },
    { attribute: 'goalkeeperReflexes', weight: 0.35 },
    { attribute: 'goalkeeperPositioning', weight: 0.25 },
    { attribute: 'goalkeeperHandling', weight: 0.15 },
  ],
  phy: [
    { attribute: 'goalkeeperHandling', weight: 0.25 },
    { attribute: 'strength', weight: 0.35 },
    { attribute: 'jumping', weight: 0.2 },
    { attribute: 'aggression', weight: 0.2 },
  ],
};

export interface CalculatedVifaRatings {
  ratings: RatingTuple | null;
  coverage: Record<VifaFaceCategory, number>;
}

function clampRating(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function calculateCategory(
  attributes: PartialGranularPlayerAttributes,
  formula: readonly WeightedAttribute[],
): { rating: number | null; coverage: number } {
  let weightedTotal = 0;
  let availableWeight = 0;

  for (const component of formula) {
    const value = attributes[component.attribute];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    weightedTotal += value * component.weight;
    availableWeight += component.weight;
  }

  if (availableWeight === 0) return { rating: null, coverage: 0 };
  return {
    rating: clampRating(weightedTotal / availableWeight),
    coverage: Number(availableWeight.toFixed(2)),
  };
}

function calculateFromFormulas(
  attributes: PartialGranularPlayerAttributes,
  formulas: Record<VifaFaceCategory, readonly WeightedAttribute[]>,
  minimumCoverage: number,
): CalculatedVifaRatings {
  const values: number[] = [];
  const coverage = {} as Record<VifaFaceCategory, number>;

  for (const category of VIFA_FACE_CATEGORIES) {
    const result = calculateCategory(attributes, formulas[category]);
    coverage[category] = result.coverage;
    if (result.rating === null || result.coverage < minimumCoverage) {
      return { ratings: null, coverage };
    }
    values.push(result.rating);
  }

  return { ratings: values as RatingTuple, coverage };
}

/**
 * Rebuild the standard EA-style outfield face card from granular attributes.
 * Missing historical attributes are reweighted, but a category is rejected
 * when less than half of its normal evidence is present.
 */
export function calculateOutfieldVifaRatings(
  attributes: PartialGranularPlayerAttributes,
  minimumCoverage = 0.5,
): CalculatedVifaRatings {
  return calculateFromFormulas(attributes, OUTFIELD_FORMULAS, minimumCoverage);
}

/**
 * Translate EA's goalkeeper card (DIV/HAN/KIC/REF/SPD/POS) into the six
 * gameplay inputs VIFA currently understands. This is a VIFA balance adapter,
 * not a claim that EA publishes outfield PAC/SHO/PAS/DRI/DEF/PHY for keepers.
 */
export function calculateGoalkeeperVifaRatings(
  attributes: PartialGranularPlayerAttributes,
  minimumCoverage = 0.5,
): CalculatedVifaRatings {
  return calculateFromFormulas(
    attributes,
    GOALKEEPER_VIFA_FORMULAS,
    minimumCoverage,
  );
}
