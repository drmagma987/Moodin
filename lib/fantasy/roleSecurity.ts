import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type {
  CandidateRoleSecuritySnapshot,
  DraftCandidate,
  PlayerPosition,
} from "@/lib/fantasy/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function roleShareForPosition(position: PlayerPosition, stats: NflversePlayerSeasonStats) {
  if (position === "WR" || position === "TE") {
    return stats.targetShare;
  }
  if (position === "RB") {
    return clamp(
      stats.targetShare * 0.65 + Math.min(0.4, stats.carries / Math.max(1, stats.games) / 45),
      0,
      1,
    );
  }
  if (position === "QB") {
    return clamp(Math.min(1, stats.attempts / Math.max(1, stats.games) / 40), 0, 1);
  }
  return null;
}

function buildDrivers(input: {
  position: PlayerPosition;
  label: CandidateRoleSecuritySnapshot["label"];
  competitionEvidence: boolean;
  roleShare: number | null;
  games: number;
  rookie: boolean;
}) {
  const drivers: string[] = [];

  if (input.label === "secure") {
    drivers.push(
      input.position === "QB"
        ? "Weekly control of the offense looks relatively secure."
        : "Role concentration suggests the player is not living in a messy committee.",
    );
  } else if (input.label === "fragile") {
    drivers.push(
      input.competitionEvidence
        ? "Current player-specific evidence identifies material role competition."
        : "Historical workload evidence is thin enough to lower the weekly floor.",
    );
  }

  if (input.roleShare !== null && input.roleShare >= 0.27) {
    drivers.push("Share-based role evidence is strong for this position.");
  } else if (input.roleShare !== null && input.roleShare <= 0.16) {
    drivers.push("Share-based role evidence is thin for this draft range.");
  }

  if (input.games < 12) {
    drivers.push("The role sample is not especially long, which keeps certainty lower.");
  }
  if (input.rookie) {
    drivers.push("Rookie deployment uncertainty still leaves more paths to role volatility.");
  }

  return drivers.slice(0, 3);
}

export function buildRoleSecuritySignal(input: {
  candidate: DraftCandidate;
  nflverseStats?: NflversePlayerSeasonStats;
}) {
  const { candidate, nflverseStats } = input;
  const position = primaryPosition(candidate);
  const competitionEvidence = candidate.context?.currentRole === "competition";

  if (!nflverseStats || nflverseStats.games <= 0 || !["QB", "RB", "WR", "TE"].includes(position)) {
    return {
      label: "unknown",
      securityScore: 50,
      workloadUncertainty: 50,
      competitionPressure: competitionEvidence ? 65 : null,
      competitionEvidence,
      evidenceGames: 0,
      roleShare: null,
      adjustedMedianDelta: 0,
      stabilityImpact: 0,
      summary: competitionEvidence
        ? "Current context identifies competition, but historical workload evidence is unavailable."
        : "Historical workload evidence is unavailable, so no role adjustment is applied.",
      drivers: [],
    } satisfies CandidateRoleSecuritySnapshot;
  }

  const games = Math.max(1, nflverseStats.games);
  const roleShare = roleShareForPosition(position, nflverseStats);
  const touchesPerGame =
    position === "QB"
      ? nflverseStats.attempts / games + nflverseStats.carries / games * 1.25
      : position === "RB"
        ? nflverseStats.carries / games + nflverseStats.targets / games * 1.35
        : nflverseStats.targets / games;
  const rbReceivingPenalty =
    position === "RB" && nflverseStats.targets / games < 3.2 ? 18 : 0;
  const rbSharePenalty =
    position === "RB" && nflverseStats.targetShare < 0.075 ? 8 : 0;
  const rbCarryPenalty =
    position === "RB" && nflverseStats.carries / games < 12 ? 6 : 0;
  const rawSecurityScore = Math.round(
    clamp(
      (roleShare ?? 0.18) * 170 +
        touchesPerGame * (position === "QB" ? 1.05 : position === "RB" ? 2.1 : 2.6) +
        (position === "WR" || position === "TE" ? nflverseStats.airYardsShare * 42 : 0) +
        -rbReceivingPenalty -
        rbSharePenalty -
        rbCarryPenalty +
        (candidate.player.rookie ? -7 : 0) +
        (games >= 15 ? 4 : games <= 10 ? -4 : 0),
      12,
      96,
    ),
  );
  const sampleReliability = clamp(games / 14, 0.35, 1);
  const contextBonus = candidate.context?.currentRole === "locked-starter"
    ? 8
    : candidate.context?.currentRole === "projected-starter"
      ? 3
      : 0;
  const trackRecordBonus = candidate.context?.trackRecord === "established" ? 6 : 0;
  const securityScore = Math.round(clamp(
    50 + (rawSecurityScore - 50) * sampleReliability + contextBonus + trackRecordBonus,
    12,
    96,
  ));
  const workloadUncertainty = Math.round(clamp(100 - securityScore, 8, 88));
  const competitionPressure = competitionEvidence
    ? Math.round(clamp(62 + (position === "RB" ? 8 : 0), 62, 86))
    : null;

  let label: CandidateRoleSecuritySnapshot["label"] = "balanced";
  if (securityScore >= 69 && !competitionEvidence) {
    label = "secure";
  } else if (competitionEvidence || (securityScore <= 46 && games >= 12)) {
    label = "fragile";
  }

  const adjustedMedianDelta =
    label === "secure"
      ? Number(clamp((securityScore - 58) * 0.11, 0.8, 4.2).toFixed(2))
      : label === "fragile"
        ? Number((-clamp(((competitionPressure ?? workloadUncertainty) - 48) * 0.12, 0.9, 4.8)).toFixed(2))
        : 0;
  const stabilityImpact =
    label === "secure"
      ? Number(clamp((securityScore - workloadUncertainty) * 0.06, 0.8, 4.8).toFixed(2))
      : label === "fragile"
        ? Number((-clamp(((competitionPressure ?? workloadUncertainty) - securityScore) * 0.07, 0.8, 5.4)).toFixed(2))
        : 0;
  const drivers = buildDrivers({
    position,
    label,
    competitionEvidence,
    roleShare,
    games,
    rookie: candidate.player.rookie,
  });
  const summary =
    label === "secure"
      ? `${candidate.player.fullName} has relatively secure role evidence for this price range, so the weekly workload is less likely to evaporate.`
      : label === "fragile"
        ? competitionEvidence
          ? `${candidate.player.fullName} has current player-specific competition evidence, so the workload should not be treated as locked in.`
          : `${candidate.player.fullName} has a fragile historical workload profile, though that is not itself evidence of current competition.`
        : `${candidate.player.fullName} has a balanced historical workload-security read right now.`;

  return {
    label,
    securityScore,
    workloadUncertainty,
    competitionPressure,
    competitionEvidence,
    evidenceGames: games,
    roleShare: roleShare === null ? null : Number(roleShare.toFixed(3)),
    adjustedMedianDelta,
    stabilityImpact,
    summary,
    drivers,
  } satisfies CandidateRoleSecuritySnapshot;
}
