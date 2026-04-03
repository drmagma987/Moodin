import type { DraftedPlayer, Prospect } from "./types";
import { speedRatingFromForty } from "./speed";

type PlayerLike = Pick<
  Prospect,
  "position" | "forty" | "technicalRating" | "trueGrade"
> &
  Partial<
    Pick<
      Prospect,
      "speedRating" | "powerRating" | "iqRating" | "weight" | "bench" | "vertical"
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
