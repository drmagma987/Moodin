import { parseCsv } from "@/lib/fantasy/csv";
import type {
  InSeasonPlayerSnapshot,
  PlayerPosition,
  ProductionOpportunitySnapshot,
} from "@/lib/fantasy/types";

type WeeklyOpportunity = {
  week: number;
  actualPoints: number;
  expectedPoints: number;
  actualTouchdowns: number;
  expectedTouchdowns: number;
};

type OpportunityAggregate = {
  playerName: string;
  team: string;
  position: PlayerPosition;
  weeks: WeeklyOpportunity[];
};

const normalizeName = (value: string) => value
  .toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const normalizeTeam = (value: string) => ({
  JAC: "JAX", LA: "LAR", WSH: "WAS", OAK: "LV", SD: "LAC", STL: "LAR",
}[value.trim().toUpperCase()] ?? value.trim().toUpperCase());

function numeric(value: string | undefined) {
  if (!value || value === "NA") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function primaryPosition(player: InSeasonPlayerSnapshot): PlayerPosition {
  return player.player.positions[0] ?? "WR";
}

function roleScore(player: InSeasonPlayerSnapshot) {
  const position = primaryPosition(player);
  const baseline = player.baselineUsage;
  const recent = player.recentUsage;
  return Number((
    (recent.snapShare - baseline.snapShare) * 42 +
    (recent.routeParticipation - baseline.routeParticipation) * 30 +
    (recent.targetsPerGame - baseline.targetsPerGame) * (position === "WR" || position === "TE" ? 1.9 : 1.2) +
    (recent.carriesPerGame - baseline.carriesPerGame) * (position === "RB" || position === "QB" ? 1.4 : 0.4) +
    (recent.targetShare - baseline.targetShare) * 100 * (position === "WR" || position === "TE" ? 0.9 : 0.45) +
    (recent.redZoneTouchesPerGame - baseline.redZoneTouchesPerGame) * 3.6
  ).toFixed(2));
}

function expectedFloor(position: PlayerPosition) {
  if (position === "QB") return 14;
  if (position === "RB" || position === "WR") return 8;
  if (position === "TE") return 5.5;
  return Number.POSITIVE_INFINITY;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rounded(value: number) {
  return Number(value.toFixed(2));
}

export function parseProductionOpportunityCsv(csv: string) {
  const byIdentity = new Map<string, OpportunityAggregate>();
  for (const row of parseCsv(csv)) {
    const playerName = row.full_name;
    const team = normalizeTeam(row.posteam ?? "");
    const position = (row.position ?? "").toUpperCase() as PlayerPosition;
    const week = numeric(row.week);
    if (!playerName || !team || !["QB", "RB", "WR", "TE"].includes(position) || week <= 0) continue;
    const identity = `${normalizeName(playerName)}:${team}`;
    const aggregate = byIdentity.get(identity) ?? { playerName, team, position, weeks: [] };
    const existing = aggregate.weeks.find((entry) => entry.week === week);
    const opportunity = existing ?? {
      week,
      actualPoints: 0,
      expectedPoints: 0,
      actualTouchdowns: 0,
      expectedTouchdowns: 0,
    };
    opportunity.actualPoints += numeric(row.total_fantasy_points);
    opportunity.expectedPoints += numeric(row.total_fantasy_points_exp);
    opportunity.actualTouchdowns += numeric(row.total_touchdown);
    opportunity.expectedTouchdowns += numeric(row.total_touchdown_exp);
    if (!existing) aggregate.weeks.push(opportunity);
    byIdentity.set(identity, aggregate);
  }
  for (const aggregate of byIdentity.values()) aggregate.weeks.sort((a, b) => a.week - b.week);
  return byIdentity;
}

export function buildProductionOpportunitySnapshots(
  players: InSeasonPlayerSnapshot[],
  ffOpportunityCsv?: string,
): ProductionOpportunitySnapshot[] {
  const byIdentity = ffOpportunityCsv ? parseProductionOpportunityCsv(ffOpportunityCsv) : new Map<string, OpportunityAggregate>();
  const byName = new Map<string, OpportunityAggregate | null>();
  for (const aggregate of byIdentity.values()) {
    const key = normalizeName(aggregate.playerName);
    byName.set(key, byName.has(key) ? null : aggregate);
  }

  return players.flatMap<ProductionOpportunitySnapshot>((player) => {
    const position = primaryPosition(player);
    if (!["QB", "RB", "WR", "TE"].includes(position)) return [];
    const identity = `${normalizeName(player.player.fullName)}:${normalizeTeam(player.player.team)}`;
    const aggregate = byIdentity.get(identity) ?? byName.get(normalizeName(player.player.fullName)) ?? undefined;
    const snapShareDelta = rounded(player.recentUsage.snapShare - player.baselineUsage.snapShare);
    const routeParticipationDelta = rounded(player.recentUsage.routeParticipation - player.baselineUsage.routeParticipation);
    const role = roleScore(player);
    const roleBreakout = snapShareDelta >= 0.15 || routeParticipationDelta >= 0.2 || role >= 9;

    if (!aggregate) {
      if (!roleBreakout) return [];
      return [{
        playerId: player.player.id,
        classification: "role-breakout",
        source: "role-only",
        confidence: player.evidence?.snaps || player.evidence?.routes ? "medium" : "low",
        sampleWeeks: player.recentUsage.games,
        actualPointsPerGame: player.recentUsage.fantasyPointsPerGame,
        expectedPointsPerGame: null,
        opportunityGapPerGame: null,
        expectedPointsTrend: null,
        actualTouchdowns: null,
        expectedTouchdowns: null,
        snapShareDelta,
        routeParticipationDelta,
        roleScore: role,
        signalScore: rounded(Math.abs(role)),
        summary: `${player.player.fullName}'s role is expanding, but play-level expected points are not available yet. Treat this as forward opportunity—not positive regression.`,
        drivers: [
          `Snap share changed ${Math.round(snapShareDelta * 100) >= 0 ? "+" : ""}${Math.round(snapShareDelta * 100)} points.`,
          `Route participation changed ${Math.round(routeParticipationDelta * 100) >= 0 ? "+" : ""}${Math.round(routeParticipationDelta * 100)} points.`,
          player.opportunityContext?.reason ?? "Confirm that the expanded role persists in the next finalized game.",
        ],
      } satisfies ProductionOpportunitySnapshot];
    }

    const weeks = aggregate.weeks;
    const actualPoints = weeks.reduce((sum, week) => sum + week.actualPoints, 0);
    const expectedPoints = weeks.reduce((sum, week) => sum + week.expectedPoints, 0);
    const actualTouchdowns = weeks.reduce((sum, week) => sum + week.actualTouchdowns, 0);
    const expectedTouchdowns = weeks.reduce((sum, week) => sum + week.expectedTouchdowns, 0);
    const actualPointsPerGame = rounded(actualPoints / weeks.length);
    const expectedPointsPerGame = rounded(expectedPoints / weeks.length);
    const opportunityGapPerGame = rounded(expectedPointsPerGame - actualPointsPerGame);
    const recentWeeks = weeks.slice(-2);
    const priorWeeks = weeks.slice(0, -2);
    const recentExpected = mean(recentWeeks.map((week) => week.expectedPoints));
    const priorExpected = priorWeeks.length
      ? mean(priorWeeks.map((week) => week.expectedPoints))
      : weeks.length >= 2 ? weeks.at(-2)!.expectedPoints : recentExpected;
    const expectedPointsTrend = rounded(recentExpected - priorExpected);
    const qualifiedOpportunity = expectedPointsPerGame >= expectedFloor(position);
    const underproducing = opportunityGapPerGame >= 2.5;
    const overproducing = opportunityGapPerGame <= -3;
    const touchdownGapPerGame = (actualTouchdowns - expectedTouchdowns) / weeks.length;
    const touchdownTrap = overproducing && touchdownGapPerGame >= 0.35;

    const classification: ProductionOpportunitySnapshot["classification"] =
      underproducing && qualifiedOpportunity && (roleBreakout || expectedPointsTrend >= 1)
        ? "breakout"
        : underproducing && qualifiedOpportunity
          ? player.availability === "free-agent" ? "breakout" : "buy-low"
          : roleBreakout
            ? "role-breakout"
            : touchdownTrap
              ? "touchdown-trap"
              : overproducing
                ? "sell-high"
                : "watch";
    const confidence: ProductionOpportunitySnapshot["confidence"] = weeks.length >= 4
      ? "high"
      : weeks.length >= 2 ? "medium" : "low";
    const signalScore = rounded(
      Math.abs(opportunityGapPerGame) * 3 +
      Math.abs(expectedPointsTrend) * 1.5 +
      Math.min(18, Math.abs(role)) +
      (qualifiedOpportunity ? 5 : 0),
    );
    const summary = classification === "breakout"
      ? `${player.player.fullName} is earning more expected production than the box score shows while the opportunity is holding or improving.`
      : classification === "buy-low"
        ? `${player.player.fullName}'s workload has produced more expected points than actual points, creating a regression-based acquisition case.`
        : classification === "role-breakout"
          ? `${player.player.fullName}'s role is expanding even though the prior expected-points gap alone is not a buy-low signal.`
          : classification === "touchdown-trap"
            ? `${player.player.fullName}'s fantasy scoring is running ahead of both expected points and expected touchdowns.`
            : classification === "sell-high"
              ? `${player.player.fullName}'s fantasy scoring is running ahead of the value of the underlying opportunities.`
              : `${player.player.fullName}'s production and expected opportunity are close enough to monitor without forcing an action.`;

    return [{
      playerId: player.player.id,
      classification,
      source: "ffopportunity",
      confidence,
      sampleWeeks: weeks.length,
      actualPointsPerGame,
      expectedPointsPerGame,
      opportunityGapPerGame,
      expectedPointsTrend,
      actualTouchdowns: rounded(actualTouchdowns),
      expectedTouchdowns: rounded(expectedTouchdowns),
      snapShareDelta,
      routeParticipationDelta,
      roleScore: role,
      signalScore,
      summary,
      drivers: [
        `${expectedPointsPerGame.toFixed(1)} xFP/G versus ${actualPointsPerGame.toFixed(1)} actual PPR/G.`,
        `${opportunityGapPerGame >= 0 ? "+" : ""}${opportunityGapPerGame.toFixed(1)} expected-minus-actual points per game.`,
        `Expected touchdowns ${expectedTouchdowns.toFixed(2)} versus ${actualTouchdowns.toFixed(0)} actual.`,
        roleBreakout
          ? `Role score ${role >= 0 ? "+" : ""}${role.toFixed(1)}; snaps/routes are expanding.`
          : `xFP trend ${expectedPointsTrend >= 0 ? "+" : ""}${expectedPointsTrend.toFixed(1)} points per game.`,
      ],
    } satisfies ProductionOpportunitySnapshot];
  }).filter((snapshot) =>
    snapshot.classification !== "watch" ||
    (snapshot.expectedPointsPerGame ?? 0) >= expectedFloor(primaryPosition(players.find((player) => player.player.id === snapshot.playerId)!)),
  ).sort((a, b) => {
    const priority = { breakout: 6, "role-breakout": 5, "buy-low": 4, "touchdown-trap": 3, "sell-high": 2, watch: 1 } as const;
    return priority[b.classification] - priority[a.classification] || b.signalScore - a.signalScore;
  }).slice(0, 60);
}
