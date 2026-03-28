import { Archetype, Position, Prospect } from "./types";
import { makeRng } from "./rng";
import { speedRatingFromForty } from "./speed";
import {
  FIRST_NAMES,
  LAST_NAMES,
  SCHOOL_PREFIXES,
  SCHOOL_SUFFIXES,
} from "./names";

const TOTAL_PROSPECTS = 36;

const BASE_POSITION_COUNTS: Record<Position, number> = {
  QB: 4,
  RB: 5,
  WR: 8,
  TE: 5,
  DL: 4,
  LB: 5,
  SEC: 5,
};

const MIN_POSITION_COUNTS: Record<Position, number> = {
  QB: 3,
  RB: 3,
  WR: 5,
  TE: 3,
  DL: 3,
  LB: 3,
  SEC: 3,
};

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "DL", "LB", "SEC"];

type GeneratedProspect = Prospect & {
  scoutGrade: number;
  athleticRating: number;
};

function randomFrom<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function randomInt(min: number, max: number, rand: () => number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildPositionCounts(rand: () => number) {
  const counts: Record<Position, number> = { ...MIN_POSITION_COUNTS };
  const remainingSlots =
    TOTAL_PROSPECTS -
    POSITIONS.reduce((sum, position) => sum + MIN_POSITION_COUNTS[position], 0);

  const scarcityProfile = POSITIONS.reduce<Record<Position, number>>((profile, position) => {
    profile[position] = BASE_POSITION_COUNTS[position] * (0.7 + rand() * 0.9);
    return profile;
  }, {} as Record<Position, number>);

  for (let index = 0; index < remainingSlots; index += 1) {
    const availablePositions = POSITIONS.filter(
      (position) => counts[position] < BASE_POSITION_COUNTS[position] + 3
    );
    const totalWeight = availablePositions.reduce(
      (sum, position) => sum + scarcityProfile[position],
      0
    );

    let roll = rand() * totalWeight;

    for (const position of availablePositions) {
      roll -= scarcityProfile[position];
      if (roll <= 0) {
        counts[position] += 1;
        break;
      }
    }
  }

  return POSITIONS.flatMap((position) =>
    Array.from({ length: counts[position] }, () => position)
  );
}

function generateUniquePlayerName(rand: () => number, used: Set<string>) {
  let name = "";

  do {
    name = `${randomFrom(FIRST_NAMES, rand)} ${randomFrom(LAST_NAMES, rand)}`;
  } while (used.has(name));

  used.add(name);
  return name;
}

function generateDefenseUnitName(rand: () => number, used: Set<string>) {
  let name = "";

  do {
    name = `${randomFrom(SCHOOL_PREFIXES, rand)} ${randomFrom(
      SCHOOL_SUFFIXES,
      rand
    )}`;
  } while (used.has(name));

  used.add(name);
  return name;
}

function getArchetype(position: Position, rand: () => number): Archetype {
  switch (position) {
    case "QB":
      return randomFrom(["Field General", "Gunslinger", "Dual Threat"], rand);
    case "RB":
      return randomFrom(["Power Back", "Elusive Back", "Receiving Back"], rand);
    case "WR":
      return randomFrom(["Deep Threat", "Route Technician", "YAC Specialist"], rand);
    case "TE":
      return randomFrom(["Possession TE", "Vertical Threat", "Red Zone Target"], rand);
    case "DL":
      return randomFrom(["Pass Rusher", "Run Stopper"], rand);
    case "LB":
      return randomFrom(["Coverage LB", "Run Support", "Playmaker"], rand);
    case "SEC":
      return randomFrom(["Lockdown", "Ball Hawk"], rand);
  }
}

function getHeight(position: Position, rand: () => number): number {
  switch (position) {
    case "QB":
      return randomInt(72, 76, rand);
    case "RB":
      return randomInt(68, 72, rand);
    case "WR":
      return randomInt(69, 75, rand);
    case "TE":
      return randomInt(75, 78, rand);
    case "DL":
      return randomInt(74, 78, rand);
    case "LB":
      return randomInt(72, 76, rand);
    case "SEC":
      return randomInt(69, 73, rand);
  }
}

function getForty(position: Position, rand: () => number): number {
  switch (position) {
    case "QB":
      return Number((4.45 + rand() * 0.45).toFixed(2));
    case "RB":
      return Number((4.32 + rand() * 0.35).toFixed(2));
    case "WR":
      return Number((4.24 + rand() * 0.4).toFixed(2));
    case "TE":
      return Number((4.5 + rand() * 0.3).toFixed(2));
    case "DL":
      return Number((4.65 + rand() * 0.35).toFixed(2));
    case "LB":
      return Number((4.48 + rand() * 0.35).toFixed(2));
    case "SEC":
      return Number((4.28 + rand() * 0.35).toFixed(2));
  }
}

function baseTrueGradeByPosition(position: Position) {
  switch (position) {
    case "QB":
      return 73;
    case "RB":
      return 72;
    case "WR":
      return 73;
    case "TE":
      return 71;
    case "DL":
      return 71;
    case "LB":
      return 71;
    case "SEC":
      return 72;
  }
}

function archetypeGradeBonus(archetype: Archetype) {
  switch (archetype) {
    case "Field General":
    case "Route Technician":
    case "Possession TE":
    case "Coverage LB":
    case "Lockdown":
      return 3;
    case "Gunslinger":
    case "Deep Threat":
    case "Vertical Threat":
    case "Pass Rusher":
    case "Ball Hawk":
      return 1;
    case "Dual Threat":
    case "Receiving Back":
    case "YAC Specialist":
    case "Playmaker":
      return 0;
    case "Power Back":
    case "Elusive Back":
    case "Red Zone Target":
    case "Run Stopper":
    case "Run Support":
      return 2;
  }
}

function archetypeTechnicalBonus(archetype: Archetype) {
  switch (archetype) {
    case "Field General":
    case "Route Technician":
    case "Possession TE":
    case "Coverage LB":
    case "Lockdown":
      return 7;
    case "Power Back":
    case "Red Zone Target":
    case "Run Stopper":
    case "Run Support":
      return 4;
    case "Gunslinger":
    case "Deep Threat":
    case "Vertical Threat":
    case "Pass Rusher":
    case "Ball Hawk":
      return 1;
    case "Dual Threat":
    case "Receiving Back":
    case "YAC Specialist":
    case "Playmaker":
      return -1;
    case "Elusive Back":
      return 2;
  }
}

function archetypeAthleticBonus(archetype: Archetype) {
  switch (archetype) {
    case "Dual Threat":
    case "Receiving Back":
    case "Deep Threat":
    case "YAC Specialist":
    case "Vertical Threat":
    case "Pass Rusher":
    case "Ball Hawk":
    case "Playmaker":
      return 5;
    case "Gunslinger":
    case "Elusive Back":
    case "Red Zone Target":
      return 2;
    case "Field General":
    case "Route Technician":
    case "Possession TE":
    case "Coverage LB":
    case "Lockdown":
      return -1;
    case "Power Back":
    case "Run Stopper":
    case "Run Support":
      return 1;
  }
}

function scoutingErrorRange(trueGrade: number) {
  if (trueGrade >= 86) return 3;
  if (trueGrade >= 80) return 5;
  if (trueGrade >= 74) return 7;
  return 9;
}

export function generateProspects(seed: number): Prospect[] {
  const rand = makeRng(seed);
  const usedNames = new Set<string>();
  const positionCounts = buildPositionCounts(rand);

  const generated: GeneratedProspect[] = positionCounts.map((position, index) => {
    const archetype = getArchetype(position, rand);
    const height = getHeight(position, rand);
    const forty = getForty(position, rand);
    const speed = speedRatingFromForty(position, forty);

    const name =
      position === "DL" || position === "LB" || position === "SEC"
        ? generateDefenseUnitName(rand, usedNames)
        : generateUniquePlayerName(rand, usedNames);

    const speedBonus =
      position === "WR" || position === "RB" || position === "SEC"
        ? Math.round((speed - 50) * 0.12)
        : position === "QB"
        ? Math.round((speed - 50) * 0.08)
        : Math.round((speed - 50) * 0.06);

    const heightBonus =
      position === "TE" || position === "WR" || position === "DL"
        ? Math.round((height - 72) * 0.8)
        : Math.round((height - 72) * 0.3);

    const athleticRating = clamp(
      Math.round(
        0.75 * speed +
          heightBonus +
          archetypeAthleticBonus(archetype) +
          randomInt(-6, 6, rand)
      ),
      62,
      95
    );

    const technicalRating = clamp(
      baseTrueGradeByPosition(position) +
        archetypeTechnicalBonus(archetype) +
        randomInt(-8, 8, rand),
      52,
      95
    );

    const trueGrade = clamp(
      Math.round(
        baseTrueGradeByPosition(position) * 0.2 +
          technicalRating * 0.45 +
          athleticRating * 0.35 +
          archetypeGradeBonus(archetype) +
          speedBonus +
          randomInt(-4, 4, rand)
      ),
      52,
      95
    );

    const errorRange = scoutingErrorRange(trueGrade);
    const scoutGrade = clamp(
      Math.round(
        trueGrade +
          (technicalRating - athleticRating) * 0.08 +
          randomInt(-errorRange, errorRange, rand)
      ),
      50,
      97
    );

    return {
      id: `p-${index + 1}`,
      name,
      position,
      archetype,
      height,
      forty,
      technicalRating,
      projectedRound: 12,
      trueGrade,
      scoutGrade,
      athleticRating,
    };
  });

  const sorted = [...generated].sort((a, b) => b.scoutGrade - a.scoutGrade);

  return sorted.map((player, index) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    archetype: player.archetype,
    height: player.height,
    forty: player.forty,
    technicalRating: player.technicalRating,
    projectedRound: Math.floor(index / 3) + 1,
    trueGrade: player.trueGrade,
    careerStage: "Rook" as const,
    acquisitionType: "draft" as const,
    seriesSourceSeed: seed,
    originalOverallPick: null,
    freeAgencyTag: null,
  }));
}
