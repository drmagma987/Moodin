import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import type { InSeasonPlayerSnapshot, PlayerRange } from "@/lib/fantasy/types";

const REGULAR_SEASON_GAMES = 17;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

function ratio(current: number, baseline: number) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) return 1;
  return clamp(current / baseline, 0.55, 1.45);
}

function weightedUsageMultiplier(player: InSeasonPlayerSnapshot) {
  const position = player.player.positions[0];
  const baseline = player.baselineUsage;
  const recent = player.recentUsage;
  const snap = ratio(recent.snapShare, baseline.snapShare);
  const carries = ratio(recent.carriesPerGame, baseline.carriesPerGame);
  const targets = ratio(recent.targetsPerGame, baseline.targetsPerGame);
  const targetShare = ratio(recent.targetShare, baseline.targetShare);
  const routes = ratio(recent.routeParticipation, baseline.routeParticipation);
  const fantasy = ratio(recent.fantasyPointsPerGame, baseline.fantasyPointsPerGame);
  const raw = position === "RB"
    ? carries * 0.5 + targets * 0.25 + snap * 0.25
    : position === "WR" || position === "TE"
      ? targets * 0.45 + targetShare * 0.25 + routes * 0.2 + snap * 0.1
      : position === "QB"
        ? fantasy * 0.7 + carries * 0.15 + snap * 0.15
        : fantasy;
  // recentUsage is already blended against the preseason prior at the slate's
  // published evidence weight. Applying the resulting ratio directly avoids a
  // second small-sample adjustment while keeping Week 1 movement bounded.
  return clamp(raw, 0.88, 1.12);
}

function roleMultiplier(player: InSeasonPlayerSnapshot) {
  if (player.injuryOpportunity?.confirmed && player.injuryOpportunity.successorVerified) return 1.05;
  if (player.opportunityContext?.stability === "durable") return 1.03;
  if (player.opportunityContext?.stability === "contingent") return 0.97;
  return 1;
}

function healthMultiplier(player: InSeasonPlayerSnapshot) {
  const status = (player.injuryStatus ?? "").trim().toLowerCase();
  if (/^(ir|pup|nfi)$/.test(status)) return 0.05;
  if (/^(out|o)$/.test(status)) return 0.08;
  if (/^(doubtful|d)$/.test(status)) return 0.45;
  if (/^(questionable|q)$/.test(status)) return 0.92;
  return 1;
}

function rosHealthMultiplier(player: InSeasonPlayerSnapshot, capturedAt: string, remainingGames: number) {
  const status = (player.injuryStatus ?? "").trim().toLowerCase();
  if (!/^(ir|pup|nfi|out|o|doubtful|d)$/.test(status)) return healthMultiplier(player) === 0.92 ? 0.98 : 1;
  if (!player.projectedReturnDate) return /^(ir|pup|nfi)$/.test(status) ? 0.55 : 0.85;
  const captured = Date.parse(capturedAt);
  const returned = Date.parse(`${player.projectedReturnDate}T12:00:00Z`);
  if (!Number.isFinite(captured) || !Number.isFinite(returned)) return 0.55;
  const missedGames = clamp(Math.ceil((returned - captured) / (7 * 86_400_000)), 0, remainingGames);
  return clamp((remainingGames - missedGames) / Math.max(1, remainingGames), 0.05, 1);
}

function teamContextMultiplier(player: InSeasonPlayerSnapshot) {
  const advanced = player.advancedUsage;
  if (advanced?.statuses.quarterbackEnvironment !== "verified" || !Number.isFinite(advanced.teamProe)) return 1;
  return clamp(1 + (advanced.teamProe ?? 0) / 400, 0.975, 1.025);
}

function scaleRange(range: PlayerRange, medianMultiplier: number, uncertainty: number, seasonFraction = 1): PlayerRange {
  const p50 = Math.max(0, range.p50 * medianMultiplier * seasonFraction);
  const p10 = Math.max(0, range.p10 * Math.max(0, medianMultiplier - uncertainty) * seasonFraction);
  const p90 = Math.max(p50, range.p90 * (medianMultiplier + uncertainty) * seasonFraction);
  return { p10: rounded(Math.min(p10, p50)), p50: rounded(p50), p90: rounded(p90) };
}

/**
 * Rebuild current-week and rest-of-season ranges from immutable preseason
 * baselines. Reapplying this function is idempotent: prior updated ranges are
 * never used as the next baseline.
 */
export function applyCurrentSeasonProjectionUpdates(
  players: InSeasonPlayerSnapshot[],
  options: { week: number; capturedAt: string; observationWeight: number },
) {
  const remainingGames = Math.max(0, REGULAR_SEASON_GAMES - options.week);
  return players.map((player) => {
    const baselineWeekly = player.projectionUpdate?.baselineWeekly ?? player.weeklyProjection;
    const baselineRos = player.projectionUpdate?.baselineRos ?? player.rosProjection;
    const evidenceCurrent = player.evidence?.week === options.week
      && Boolean(player.evidence.source.trim())
      && Number.isFinite(Date.parse(player.evidence.capturedAt));
    const verifiedForwardChange = Boolean(
      player.injuryOpportunity?.confirmed && player.injuryOpportunity.successorVerified,
    ) || player.opportunityContext?.stability === "durable" || /^(IR|PUP|NFI|Out|O|Doubtful|D|Questionable|Q)$/i.test(player.injuryStatus ?? "");
    if (!evidenceCurrent && !verifiedForwardChange) return player;

    const usage = evidenceCurrent && player.evidence?.participation === "played" ? weightedUsageMultiplier(player) : 1;
    const role = roleMultiplier(player);
    const health = healthMultiplier(player);
    const team = teamContextMultiplier(player);
    const nonHealthWeekly = clamp(usage * role * team, 0.85, 1.15);
    const weeklyMultiplier = clamp(nonHealthWeekly * health, 0.02, 1.15);
    const rosRoleMultiplier = 1 + (nonHealthWeekly - 1) * 0.6;
    const rosHealth = rosHealthMultiplier(player, options.capturedAt, remainingGames);
    const rosMultiplier = clamp(rosRoleMultiplier * rosHealth, 0.25, 1.1);
    const sources = [...new Set([
      ...(evidenceCurrent ? [player.evidence!.source] : []),
      ...(player.advancedUsage?.sources ?? []),
      ...(player.injuryOpportunity?.source ? [player.injuryOpportunity.source] : []),
      ...(verifiedForwardChange ? ["manager-reviewed / roster-status context"] : []),
    ])];
    const drivers = [
      ...(usage !== 1 ? [`Observed workload blend ${usage >= 1 ? "+" : ""}${rounded((usage - 1) * 100)}%`] : []),
      ...(role !== 1 ? [`Verified role context ${role >= 1 ? "+" : ""}${rounded((role - 1) * 100)}%`] : []),
      ...(health !== 1 ? [`Forward health availability ${rounded(health * 100)}%`] : []),
      ...(team !== 1 ? [`Verified team passing context ${team >= 1 ? "+" : ""}${rounded((team - 1) * 100)}%`] : []),
    ];
    const limitations = [
      `Only ${player.recentUsage.games || 0} completed-game sample; workload movement remains conservative.`,
      "Touchdowns and one-game efficiency are not extrapolated directly.",
      ...(player.advancedUsage?.statuses.routes !== "verified" && ["Route-based receiving efficiency remains unavailable."] || []),
    ];
    const uncertainty = clamp(0.08 - Math.min(player.recentUsage.games || 0, 4) * 0.01, 0.04, 0.08);
    return {
      ...player,
      projectionBasis: "weekly-updated" as const,
      weeklyProjection: scaleRange(baselineWeekly, weeklyMultiplier, uncertainty),
      rosProjection: scaleRange(baselineRos, rosMultiplier, uncertainty * 0.35, remainingGames / REGULAR_SEASON_GAMES),
      projectionUpdate: {
        season: leagueSourceOfTruth.season,
        week: options.week,
        capturedAt: options.capturedAt,
        sampleGames: player.recentUsage.games || 0,
        observationWeight: options.observationWeight,
        baselineWeekly,
        baselineRos,
        usageMultiplier: rounded(usage),
        roleMultiplier: rounded(role),
        healthMultiplier: rounded(health),
        teamContextMultiplier: rounded(team),
        sources,
        drivers: drivers.length ? drivers : ["Current-week evidence retained the preseason median."],
        limitations,
      },
    } satisfies InSeasonPlayerSnapshot;
  });
}
