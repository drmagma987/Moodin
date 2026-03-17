import { Archetype, Position, Prospect } from "./types";
import { makeRng } from "./rng";
import {
  FIRST_NAMES,
  LAST_NAMES,
  SCHOOL_PREFIXES,
  SCHOOL_SUFFIXES,
} from "./names";

const POSITION_COUNTS: Position[] = [
  "QB",
  "QB",
  "QB",
  "QB",
  "RB",
  "RB",
  "RB",
  "RB",
  "RB",
  "WR",
  "WR",
  "WR",
  "WR",
  "WR",
  "WR",
  "WR",
  "WR",
  "TE",
  "TE",
  "TE",
  "TE",
  "TE",
  "DL",
  "DL",
  "DL",
  "DL",
  "LB",
  "LB",
  "LB",
  "LB",
  "LB",
  "SEC",
  "SEC",
  "SEC",
  "SEC",
  "SEC",
];

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

function speedFromForty(forty: number) {
  const minForty = 4.2;
  const maxForty = 5.1;
  const clamped = Math.max(minForty, Math.min(maxForty, forty));
  return Math.round(((maxForty - clamped) / (maxForty - minForty)) * 100);
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

export function generateProspects(seed: number): Prospect[] {
  const rand = makeRng(seed);
  const usedNames = new Set<string>();

  const generated: GeneratedProspect[] = POSITION_COUNTS.map((position, index) => {
    const archetype = getArchetype(position, rand);
    const height = getHeight(position, rand);
    const forty = getForty(position, rand);
    const speed = speedFromForty(forty);

    const name =
      position === "DL" || position === "LB" || position === "SEC"
        ? generateDefenseUnitName(rand, usedNames)
        : generateUniquePlayerName(rand, usedNames);

    const athleticBonus =
      position === "WR" || position === "RB" || position === "SEC"
        ? Math.round((speed - 50) * 0.12)
        : position === "QB"
        ? Math.round((speed - 50) * 0.08)
        : Math.round((speed - 50) * 0.06);

    const heightBonus =
      position === "TE" || position === "WR" || position === "DL"
        ? Math.round((height - 72) * 0.8)
        : Math.round((height - 72) * 0.3);

    const trueGrade = clamp(
      baseTrueGradeByPosition(position) +
        archetypeGradeBonus(archetype) +
        athleticBonus +
        heightBonus +
        randomInt(-8, 8, rand),
      52,
      95
    );

    const scoutGrade = trueGrade + randomInt(-5, 5, rand);

    return {
      id: `p-${index + 1}`,
      name,
      position,
      archetype,
      height,
      forty,
      projectedRound: 12,
      trueGrade,
      scoutGrade,
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
    projectedRound: Math.floor(index / 3) + 1,
    trueGrade: player.trueGrade,
  }));
}