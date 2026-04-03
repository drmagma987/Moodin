import { generateProspects } from "./game/prospects";
import type { CareerStage, DraftedPlayer, Position, Prospect } from "./game/types";
import { ageAdjustedPlayer, getPlayerIQ, getPlayerPower, getPlayerSpeed, getPlayerTechnical } from "./game/playerRatings";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

const STARTER_REQUIREMENTS: Record<Position, number> = {
  QB: 1,
  RB: 1,
  WR: 2,
  TE: 1,
  DL: 1,
  LB: 1,
  SEC: 1,
};

export function currentCareerStage(player: Pick<DraftedPlayer, "careerStage">) {
  return player.careerStage ?? "Rook";
}

function rookieJumpToUnc(player: Pick<DraftedPlayer, "id">, nextGameNumber: number) {
  return simpleHash(`${player.id}:${nextGameNumber}:career`) % 5 === 0;
}

export function nextCareerStage(
  stage: CareerStage,
  player?: Pick<DraftedPlayer, "id">,
  nextGameNumber?: number
) {
  switch (stage) {
    case "Rook":
      return player && nextGameNumber && rookieJumpToUnc(player, nextGameNumber)
        ? "Unc" as const
        : "Prime" as const;
    case "Prime":
      return "Unc" as const;
    case "Unc":
      return "Unc" as const;
  }
}

function careerStageDelta(stage: CareerStage) {
  switch (stage) {
    case "Prime":
      return 2;
    case "Unc":
      return -2;
    case "Rook":
      return 0;
  }
}

function careerStageAttributeDeltas(stage: CareerStage) {
  switch (stage) {
    case "Prime":
      return { speed: 1, technical: 2, power: 1, iq: 2 };
    case "Unc":
      return { speed: -2, technical: -1, power: -1, iq: 1 };
    case "Rook":
      return { speed: 0, technical: 0, power: 0, iq: 0 };
  }
}

export function describeNextCareerStage(
  player: Pick<DraftedPlayer, "careerStage" | "id">,
  nextGameNumber: number
) {
  const current = currentCareerStage(player);
  const next = willRetireAfterGame(player)
    ? "Retired"
    : nextCareerStage(current, player, nextGameNumber);
  return `${current} -> ${next}`;
}

export function willRetireAfterGame(player: Pick<DraftedPlayer, "careerStage">) {
  return currentCareerStage(player) === "Unc";
}

export function agePlayerForSeries(
  player: DraftedPlayer,
  nextGameNumber: number,
  side: "A" | "B",
  acquisitionType: "keeper" | "freeAgency"
) {
  if (willRetireAfterGame(player)) {
    return null;
  }

  const nextStage = nextCareerStage(currentCareerStage(player), player, nextGameNumber);
  const delta = careerStageDelta(nextStage);
  const nextRatings = ageAdjustedPlayer(player, careerStageAttributeDeltas(nextStage));

  return {
    ...player,
    id: `${acquisitionType}-${nextGameNumber}-${side}-${player.id}`,
    trueGrade: clamp(nextRatings.trueGrade + (delta > 0 ? 0 : 0), 50, 95),
    speedRating: nextRatings.speedRating,
    technicalRating: nextRatings.technicalRating,
    powerRating: nextRatings.powerRating,
    iqRating: nextRatings.iqRating,
    careerStage: nextStage,
    acquisitionType,
    originalOverallPick: player.originalOverallPick ?? player.overallPick,
  };
}

const RETIREMENT_GOODBYES = [
  "Coach, thanks for believing in me from the jump. I gave this team everything I had, and I hope I made you proud.",
  "Coach, I appreciate every snap and every chance you gave me. It was an honor suiting up for you, and I am leaving this game with gratitude.",
  "Coach, thank you for trusting me to help build this team. I am walking away with great memories and a lot of respect for you.",
  "Coach, you brought out the best in me when it mattered. I am hanging it up grateful for the ride and thankful you were the one leading us.",
];

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function retirementGoodbye(player: Pick<DraftedPlayer, "id" | "name">) {
  const template =
    RETIREMENT_GOODBYES[simpleHash(`${player.id}:${player.name}`) % RETIREMENT_GOODBYES.length];
  return template;
}

export function getSeriesPressureMessage(params: {
  seriesGameNumber: number;
  seriesWinsA: number;
  seriesWinsB: number;
  teamAName: string;
  teamBName: string;
}) {
  const { seriesGameNumber, seriesWinsA, seriesWinsB, teamAName, teamBName } = params;

  if (seriesWinsA === 1 && seriesWinsB === 1) {
    return "Winner-take-all Game 3 is coming.";
  }

  if (seriesGameNumber === 1 && (seriesWinsA === 1 || seriesWinsB === 1)) {
    const leader = seriesWinsA > seriesWinsB ? teamAName : teamBName;
    return `${leader} is one win away from taking the series.`;
  }

  if (seriesGameNumber === 2 && (seriesWinsA === 1 || seriesWinsB === 1)) {
    const leader = seriesWinsA > seriesWinsB ? teamAName : teamBName;
    const trailer = seriesWinsA > seriesWinsB ? teamBName : teamAName;
    return `${leader} is on series point. ${trailer} needs this one to stay alive.`;
  }

  return "Best-of-3 pressure is building.";
}

function asFreeAgentProspect(
  prospect: Prospect,
  nextGameNumber: number
): DraftedPlayer {
  return {
    ...prospect,
    id: `fa-${nextGameNumber}-${prospect.id}`,
    overallPick: 0,
    careerStage: "Prime",
    acquisitionType: "freeAgency",
    originalOverallPick: prospect.originalOverallPick ?? null,
  };
}

function countByPosition(players: DraftedPlayer[]) {
  return {
    QB: players.filter((player) => player.position === "QB").length,
    RB: players.filter((player) => player.position === "RB").length,
    WR: players.filter((player) => player.position === "WR").length,
    TE: players.filter((player) => player.position === "TE").length,
    DL: players.filter((player) => player.position === "DL").length,
    LB: players.filter((player) => player.position === "LB").length,
    SEC: players.filter((player) => player.position === "SEC").length,
  };
}

function neededPositions(players: DraftedPlayer[]) {
  const counts = countByPosition(players);

  return (Object.keys(STARTER_REQUIREMENTS) as Position[]).filter(
    (position) => counts[position] < STARTER_REQUIREMENTS[position]
  );
}

function archetypeExcitement(player: DraftedPlayer) {
  switch (player.archetype) {
    case "Dual Threat":
    case "Deep Threat":
    case "Vertical Threat":
    case "Pass Rusher":
    case "Ball Hawk":
    case "Playmaker":
      return 5;
    case "Gunslinger":
    case "YAC Specialist":
    case "Receiving Back":
    case "Lockdown":
      return 3;
    default:
      return 1;
  }
}

function freeAgencyPoolScore(
  player: DraftedPlayer,
  fullDraftClass: Prospect[],
  priorityPositions: Set<Position>
) {
  const priorityBonus = priorityPositions.has(player.position) ? 8 : 0;
  const valueBonus = clamp(pickValueDelta(player, fullDraftClass), -6, 10);
  const veteranRisk = currentCareerStage(player) === "Unc" ? -2 : 0;

  return (
    player.trueGrade +
    priorityBonus +
    valueBonus +
    archetypeExcitement(player) +
    veteranRisk +
    Math.round((getPlayerIQ(player) - 70) * 0.08) +
    Math.round((getPlayerPower(player) - 70) * 0.04) +
    Math.round((getPlayerSpeed(player) - 70) * 0.04) +
    Math.round((getPlayerTechnical(player) - 70) * 0.08)
  );
}

function pickValueDelta(player: DraftedPlayer, fullDraftClass: Prospect[]) {
  if (!player.originalOverallPick || player.originalOverallPick <= 0) {
    return 0;
  }

  const sorted = [...fullDraftClass].sort((a, b) => b.trueGrade - a.trueGrade);
  const classRank = sorted.findIndex((candidate) => candidate.id === player.id) + 1;

  if (classRank <= 0) return 0;
  return player.originalOverallPick - classRank;
}

export function freeAgencyFlavorTag(
  player: DraftedPlayer,
  fullDraftClass: Prospect[]
) {
  const valueDelta = pickValueDelta(player, fullDraftClass);
  const careerStage = currentCareerStage(player);

  if ((player.originalOverallPick ?? 99) <= 6) return "Former top pick";
  if (valueDelta >= 5) return "Former steal";
  if (careerStage === "Unc") return "Declining veteran";
  if (player.trueGrade >= 82) return "Late breakout";
  if (player.position === "WR" || player.position === "RB") return "Explosive upside";
  return "Reliable starter";
}

type FreeAgencyPoolParams = {
  previousSeed: number;
  previousTeamA: DraftedPlayer[];
  previousTeamB: DraftedPlayer[];
  keeperIdsA: string[];
  keeperIdsB: string[];
  nextGameNumber: number;
};

export function buildFreeAgencyPool({
  previousSeed,
  previousTeamA,
  previousTeamB,
  keeperIdsA,
  keeperIdsB,
  nextGameNumber,
}: FreeAgencyPoolParams) {
  const fullDraftClass = generateProspects(previousSeed);
  const keptIds = new Set([...keeperIdsA, ...keeperIdsB]);
  const rosterIds = new Set([...previousTeamA, ...previousTeamB].map((player) => player.id));

  const carryoverCandidates = [...previousTeamA, ...previousTeamB]
    .filter((player) => !keptIds.has(player.id))
    .map((player, index) => {
      const nextSide = index % 2 === 0 ? "A" : "B";
      const aged = agePlayerForSeries(player, nextGameNumber, nextSide, "freeAgency");
      if (!aged) return null;
      return {
        ...aged,
        freeAgencyTag: null,
      };
    })
    .filter(notNull);

  const projectedKeepersA = previousTeamA
    .filter((player) => keeperIdsA.includes(player.id))
    .map((player) => agePlayerForSeries(player, nextGameNumber, "A", "keeper"))
    .filter(notNull);
  const projectedKeepersB = previousTeamB
    .filter((player) => keeperIdsB.includes(player.id))
    .map((player) => agePlayerForSeries(player, nextGameNumber, "B", "keeper"))
    .filter(notNull);
  const priorityPositions = new Set<Position>([
    ...neededPositions(projectedKeepersA),
    ...neededPositions(projectedKeepersB),
  ]);

  const undraftedCandidates = fullDraftClass
    .filter((player) => !rosterIds.has(player.id))
    .map((player) => asFreeAgentProspect(player, nextGameNumber));

  const allCandidates = [...carryoverCandidates, ...undraftedCandidates].sort(
    (a, b) =>
      freeAgencyPoolScore(b, fullDraftClass, priorityPositions) -
      freeAgencyPoolScore(a, fullDraftClass, priorityPositions)
  );

  const strongOptions = [...allCandidates]
    .slice(0, 2);

  const used = new Set(strongOptions.map((player) => player.id));

  const valueOptions = [...allCandidates]
    .filter((player) => !used.has(player.id))
    .sort(
      (a, b) =>
        pickValueDelta(b, fullDraftClass) -
          pickValueDelta(a, fullDraftClass) +
          (priorityPositions.has(b.position) ? 2 : 0) -
          (priorityPositions.has(a.position) ? 2 : 0)
    )
    .slice(0, 2);

  valueOptions.forEach((player) => used.add(player.id));

  const riskyOptions = [...allCandidates]
    .filter((player) => !used.has(player.id))
    .sort((a, b) => {
      const aRiskScore =
        (currentCareerStage(a) === "Unc" ? 8 : 0) +
        archetypeExcitement(a) -
        a.trueGrade;
      const bRiskScore =
        (currentCareerStage(b) === "Unc" ? 8 : 0) +
        archetypeExcitement(b) -
        b.trueGrade;
      return bRiskScore - aRiskScore;
    })
    .slice(0, 2);

  const pool = [...strongOptions, ...valueOptions, ...riskyOptions]
    .slice(0, 6)
    .map((player) => ({
      ...player,
      freeAgencyTag: freeAgencyFlavorTag(player, fullDraftClass),
    }));

  return pool;
}
