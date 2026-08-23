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
  competitionPressure: number;
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
    drivers.push("Competition pressure looks real enough that weekly role slippage would matter.");
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

  if (!nflverseStats || nflverseStats.games <= 0 || !["QB", "RB", "WR", "TE"].includes(position)) {
    return {
      label: "unknown",
      securityScore: 50,
      competitionPressure: 50,
      roleShare: null,
      adjustedMedianDelta: 0,
      stabilityImpact: 0,
      summary: "Role-security layer is not active for this profile yet.",
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
  const securityScore = Math.round(
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
  const competitionPressure = Math.round(clamp(100 - securityScore + (position === "RB" ? 6 : 0), 8, 94));

  let label: CandidateRoleSecuritySnapshot["label"] = "balanced";
  if (securityScore >= 69 && competitionPressure <= 34) {
    label = "secure";
  } else if (securityScore <= 46 || competitionPressure >= 58) {
    label = "fragile";
  }

  const adjustedMedianDelta =
    label === "secure"
      ? Number(clamp((securityScore - 58) * 0.11, 0.8, 4.2).toFixed(2))
      : label === "fragile"
        ? Number((-clamp((competitionPressure - 48) * 0.12, 0.9, 4.8)).toFixed(2))
        : 0;
  const stabilityImpact =
    label === "secure"
      ? Number(clamp((securityScore - competitionPressure) * 0.06, 0.8, 4.8).toFixed(2))
      : label === "fragile"
        ? Number((-clamp((competitionPressure - securityScore) * 0.07, 0.8, 5.4)).toFixed(2))
        : 0;
  const drivers = buildDrivers({
    position,
    label,
    competitionPressure,
    roleShare,
    games,
    rookie: candidate.player.rookie,
  });
  const summary =
    label === "secure"
      ? `${candidate.player.fullName} has relatively secure role evidence for this price range, so the weekly workload is less likely to evaporate.`
      : label === "fragile"
        ? `${candidate.player.fullName} is carrying enough competition pressure that the median should not be treated like locked-in workload.`
        : `${candidate.player.fullName} has a middling role-security read right now.`;

  return {
    label,
    securityScore,
    competitionPressure,
    roleShare: roleShare === null ? null : Number(roleShare.toFixed(3)),
    adjustedMedianDelta,
    stabilityImpact,
    summary,
    drivers,
  } satisfies CandidateRoleSecuritySnapshot;
}
