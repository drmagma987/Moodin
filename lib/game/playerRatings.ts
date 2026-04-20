import type { DraftedPlayer, Prospect } from "./types";
import { speedRatingFromForty } from "./speed";

type PlayerLike = Pick<
  Prospect,
  "position" | "forty" | "technicalRating" | "trueGrade"
> &
  Partial<
    Pick<
      Prospect,
      | "speedRating"
      | "powerRating"
      | "iqRating"
      | "weight"
      | "bench"
      | "vertical"
      | "archetype"
      | "careerStage"
      | "potentialGrade"
    >
  >;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getPlayerSpeed(player: PlayerLike) {
  if (typeof player.speedRating === "number" && Number.isFinite(player.speedRating)) {
    return player.speedRating;
  }

  return speedRatingFromForty(player.position, player.forty);
}

export function getPlayerTechnical(player: PlayerLike) {
  if (typeof player.technicalRating === "number" && Number.isFinite(player.technicalRating)) {
    return player.technicalRating;
  }

  return clamp(Math.round(player.trueGrade), 45, 95);
}

export function getPlayerPower(player: PlayerLike) {
  if (typeof player.powerRating === "number" && Number.isFinite(player.powerRating)) {
    return player.powerRating;
  }

  const weightScore = typeof player.weight === "number" ? (player.weight - 180) * 0.15 : 8;
  const benchScore = typeof player.bench === "number" ? player.bench * 0.9 : 18;

  return clamp(Math.round(45 + weightScore + benchScore), 45, 95);
}

export function getPlayerIQ(player: PlayerLike) {
  if (typeof player.iqRating === "number" && Number.isFinite(player.iqRating)) {
    return player.iqRating;
  }

  return clamp(Math.round(player.trueGrade), 45, 95);
}

export function iqLabel(iqRating: number) {
  if (iqRating >= 83) return "Excellent";
  if (iqRating >= 71) return "Good";
  if (iqRating >= 58) return "Average";
  return "Poor";
}

export function overallFromCoreRatings(player: Pick<Prospect, "speedRating" | "technicalRating" | "powerRating" | "iqRating">) {
  return clamp(
    Math.round(
      player.speedRating * 0.28 +
        player.technicalRating * 0.3 +
        player.powerRating * 0.2 +
        player.iqRating * 0.22
    ),
    52,
    95
  );
}

function archetypePotentialBonus(player: PlayerLike) {
  switch (player.archetype) {
    case "Dual Threat":
    case "Elusive Back":
    case "Deep Threat":
    case "Vertical Threat":
    case "Pass Rusher":
    case "Playmaker":
    case "Ball Hawk":
      return 4;
    case "Gunslinger":
    case "Power Back":
    case "Receiving Back":
    case "YAC Specialist":
    case "Red Zone Target":
    case "Coverage LB":
      return 2;
    case "Field General":
    case "Route Technician":
    case "Possession TE":
    case "Run Stopper":
    case "Run Support":
    case "Lockdown":
      return 1;
    default:
      return 0;
  }
}

function careerStagePotentialBonus(player: PlayerLike) {
  switch (player.careerStage) {
    case "Rook":
      return 3;
    case "Unc":
      return -6;
    default:
      return 0;
  }
}

function positionUpsideBlend(player: PlayerLike) {
  const speed = getPlayerSpeed(player);
  const skill = getPlayerTechnical(player);
  const power = getPlayerPower(player);
  const iq = getPlayerIQ(player);

  switch (player.position) {
    case "QB":
      return speed * 0.28 + skill * 0.34 + iq * 0.28 + power * 0.1;
    case "RB":
      return speed * 0.34 + power * 0.26 + skill * 0.25 + iq * 0.15;
    case "WR":
      return speed * 0.38 + skill * 0.31 + iq * 0.21 + power * 0.1;
    case "TE":
      return power * 0.3 + skill * 0.3 + speed * 0.22 + iq * 0.18;
    case "DL":
      return power * 0.38 + skill * 0.26 + speed * 0.18 + iq * 0.18;
    case "LB":
      return iq * 0.29 + power * 0.25 + speed * 0.24 + skill * 0.22;
    case "SEC":
      return speed * 0.33 + iq * 0.33 + skill * 0.24 + power * 0.1;
  }
}

export function getPlayerPotential(player: PlayerLike) {
  if (typeof player.potentialGrade === "number" && Number.isFinite(player.potentialGrade)) {
    return clamp(Math.round(player.potentialGrade), 45, 99);
  }

  return clamp(
    Math.round(
      player.trueGrade * 0.42 +
        positionUpsideBlend(player) * 0.58 +
        archetypePotentialBonus(player) +
        careerStagePotentialBonus(player)
    ),
    45,
    99
  );
}

export function ageAdjustedPlayer(
  player: DraftedPlayer,
  deltas: {
    speed?: number;
    technical?: number;
    power?: number;
    iq?: number;
  }
) {
  const speedRating = clamp(getPlayerSpeed(player) + (deltas.speed ?? 0), 45, 95);
  const technicalRating = clamp(getPlayerTechnical(player) + (deltas.technical ?? 0), 45, 95);
  const powerRating = clamp(getPlayerPower(player) + (deltas.power ?? 0), 45, 95);
  const iqRating = clamp(getPlayerIQ(player) + (deltas.iq ?? 0), 45, 95);

  return {
    speedRating,
    technicalRating,
    powerRating,
    iqRating,
    trueGrade: overallFromCoreRatings({
      speedRating,
      technicalRating,
      powerRating,
      iqRating,
    }),
  };
}
