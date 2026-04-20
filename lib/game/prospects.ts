import { Archetype, Position, Prospect } from "./types";
import { makeRng } from "./rng";
import { overallFromCoreRatings } from "./playerRatings";
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

function getWeight(position: Position, rand: () => number): number {
  switch (position) {
    case "QB":
      return randomInt(205, 238, rand);
    case "RB":
      return randomInt(195, 233, rand);
    case "WR":
      return randomInt(178, 222, rand);
    case "TE":
      return randomInt(232, 267, rand);
    case "DL":
      return randomInt(270, 322, rand);
    case "LB":
      return randomInt(225, 262, rand);
    case "SEC":
      return randomInt(185, 219, rand);
  }
}

function getBench(position: Position, rand: () => number): number {
  switch (position) {
    case "QB":
      return randomInt(13, 22, rand);
    case "RB":
      return randomInt(15, 28, rand);
    case "WR":
      return randomInt(10, 22, rand);
    case "TE":
      return randomInt(18, 31, rand);
    case "DL":
      return randomInt(24, 39, rand);
    case "LB":
      return randomInt(18, 32, rand);
    case "SEC":
      return randomInt(10, 21, rand);
  }
}

function getVertical(position: Position, rand: () => number) {
  switch (position) {
    case "QB":
      return randomInt(28, 37, rand);
    case "RB":
      return randomInt(31, 42, rand);
    case "WR":
      return randomInt(32, 43, rand);
    case "TE":
      return randomInt(28, 38, rand);
    case "DL":
      return randomInt(24, 34, rand);
    case "LB":
      return randomInt(28, 39, rand);
    case "SEC":
      return randomInt(31, 42, rand);
  }
}

function baseGradeByPosition(position: Position) {
  switch (position) {
    case "QB":
      return 77;
    case "RB":
      return 75;
    case "WR":
      return 76;
    case "TE":
      return 74;
    case "DL":
      return 74;
    case "LB":
      return 74;
    case "SEC":
      return 75;
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

function archetypeSpeedBonus(archetype: Archetype) {
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

function archetypePowerBonus(archetype: Archetype) {
  switch (archetype) {
    case "Power Back":
    case "Red Zone Target":
    case "Run Stopper":
    case "Run Support":
      return 7;
    case "Pass Rusher":
    case "Playmaker":
    case "Possession TE":
      return 4;
    case "Dual Threat":
    case "Elusive Back":
    case "Deep Threat":
    case "YAC Specialist":
    case "Ball Hawk":
      return -1;
    default:
      return 1;
  }
}

function archetypeIQBonus(archetype: Archetype) {
  switch (archetype) {
    case "Field General":
    case "Route Technician":
    case "Coverage LB":
    case "Lockdown":
    case "Possession TE":
      return 7;
    case "Run Support":
    case "Ball Hawk":
    case "Red Zone Target":
      return 4;
    case "Gunslinger":
    case "Deep Threat":
    case "Dual Threat":
    case "Pass Rusher":
      return 0;
    default:
      return 2;
  }
}

function positionOverallWeights(position: Position) {
  switch (position) {
    case "QB":
      return { speed: 0.17, technical: 0.33, power: 0.14, iq: 0.36 };
    case "RB":
      return { speed: 0.3, technical: 0.24, power: 0.23, iq: 0.23 };
    case "WR":
      return { speed: 0.34, technical: 0.27, power: 0.12, iq: 0.27 };
    case "TE":
      return { speed: 0.2, technical: 0.27, power: 0.3, iq: 0.23 };
    case "DL":
      return { speed: 0.16, technical: 0.24, power: 0.38, iq: 0.22 };
    case "LB":
      return { speed: 0.22, technical: 0.23, power: 0.24, iq: 0.31 };
    case "SEC":
      return { speed: 0.31, technical: 0.22, power: 0.1, iq: 0.37 };
  }
}

function scoutingErrorRange(trueGrade: number) {
  if (trueGrade >= 86) return 3;
  if (trueGrade >= 80) return 5;
  if (trueGrade >= 74) return 7;
  return 9;
}

function assignProjectedRounds(sorted: GeneratedProspect[], rand: () => number) {
  const maxProjectedRound = 10;
  let currentRound = 1;
  let playersInRound = 0;

  return sorted.map((player, index) => {
    const projectedRound = currentRound;
    playersInRound += 1;

    const nextPlayer = sorted[index + 1];
    const scoutGap = nextPlayer ? player.scoutGrade - nextPlayer.scoutGrade : 0;
    const remainingPlayers = sorted.length - index - 1;
    const remainingRounds = maxProjectedRound - currentRound;
    const mustAdvanceToFillBoard = remainingPlayers === remainingRounds;
    const canAdvance = currentRound < maxProjectedRound;
    const softTierBreak =
      scoutGap >= 4 ||
      (scoutGap >= 2 && playersInRound >= 2 && rand() < 0.65) ||
      (playersInRound >= 3 && rand() < 0.22) ||
      playersInRound >= 4;

    if (canAdvance && (mustAdvanceToFillBoard || softTierBreak)) {
      currentRound += 1;
      playersInRound = 0;
    }

    return {
      ...player,
      projectedRound,
    };
  });
}

export function generateProspects(seed: number): Prospect[] {
  const rand = makeRng(seed);
  const usedNames = new Set<string>();
  const positionCounts = buildPositionCounts(rand);

  const generated: GeneratedProspect[] = positionCounts.map((position, index) => {
    const archetype = getArchetype(position, rand);
    const height = getHeight(position, rand);
    const weight = getWeight(position, rand);
    const forty = getForty(position, rand);
    const bench = getBench(position, rand);
    const vertical = getVertical(position, rand);

    const name =
      position === "DL" || position === "LB" || position === "SEC"
        ? generateDefenseUnitName(rand, usedNames)
        : generateUniquePlayerName(rand, usedNames);

    const prospectTalentBias = randomInt(-10, 12, rand);
    const readinessBias = randomInt(-11, 11, rand);
    const instinctsBias = randomInt(-12, 12, rand);

    const speedRating = clamp(
      Math.round(
        80 +
          (4.7 - forty) * 36 +
          (vertical - 30) * 0.9 -
          Math.max(0, weight - 235) * 0.05 +
          prospectTalentBias * 0.35 +
          archetypeSpeedBonus(archetype) +
          randomInt(-5, 5, rand)
      ),
      58,
      97
    );

    const technicalRating = clamp(
      Math.round(
        baseGradeByPosition(position) +
        archetypeTechnicalBonus(archetype) +
          readinessBias +
          prospectTalentBias * 0.6 +
          randomInt(-8, 8, rand)
      ),
      46,
      99
    );

    const powerRating = clamp(
      Math.round(
        56 +
          (bench - 18) * 1.1 +
          (weight - 215) * 0.12 +
          prospectTalentBias * 0.45 +
          archetypePowerBonus(archetype) +
          randomInt(-6, 6, rand)
      ),
      48,
      97
    );

    const iqRating = clamp(
      Math.round(
        baseGradeByPosition(position) +
          archetypeIQBonus(archetype) +
          instinctsBias +
          prospectTalentBias * 0.4 +
          randomInt(-8, 8, rand)
      ),
      42,
      99
    );

    const weights = positionOverallWeights(position);

    const trueGrade = clamp(
      Math.round(
        overallFromCoreRatings({
          speedRating,
          technicalRating,
          powerRating,
          iqRating,
        }) * 0.78 +
          speedRating * weights.speed * 0.22 +
          technicalRating * weights.technical * 0.22 +
          powerRating * weights.power * 0.22 +
          iqRating * weights.iq * 0.22 +
          archetypeGradeBonus(archetype) +
          randomInt(-4, 4, rand)
      ),
      52,
      95
    );

    const errorRange = scoutingErrorRange(trueGrade);
    const scoutGrade = clamp(
      Math.round(
        trueGrade +
          (technicalRating + iqRating - speedRating - powerRating) * 0.03 +
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
      weight,
      forty,
      bench,
      vertical,
      speedRating,
      technicalRating,
      powerRating,
      iqRating,
      projectedRound: 10,
      trueGrade,
      scoutGrade,
    };
  });

  const sorted = [...generated].sort((a, b) => b.scoutGrade - a.scoutGrade);
  const projected = assignProjectedRounds(sorted, rand);

  return projected.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    archetype: player.archetype,
    height: player.height,
    weight: player.weight,
    forty: player.forty,
    bench: player.bench,
    vertical: player.vertical,
    speedRating: player.speedRating,
    technicalRating: player.technicalRating,
    powerRating: player.powerRating,
    iqRating: player.iqRating,
    projectedRound: player.projectedRound,
    trueGrade: player.trueGrade,
    careerStage: "Rook" as const,
    acquisitionType: "draft" as const,
    seriesSourceSeed: seed,
    originalOverallPick: null,
    freeAgencyTag: null,
  }));
}
