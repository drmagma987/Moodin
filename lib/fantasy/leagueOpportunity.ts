import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import { createDecisionGate } from "@/lib/fantasy/playerCoverage";
import type {
  InSeasonPlayerSnapshot,
  InSeasonTeamSnapshot,
  PlayerPosition,
} from "@/lib/fantasy/types";

export type OpportunityGroup = "QB" | "RB" | "WR" | "TE" | "FLEX" | "Bench";
export type TeamStrategy = "win-now" | "balanced" | "patient";
export type PlayerIntent = "neutral" | "untouchable" | "prefer-keep" | "actively-shop" | "buy-low" | "willing-stash";
export type PlayerOutlook = "bullish" | "neutral" | "bearish";

export type PlayerPreference = {
  intent: PlayerIntent;
  outlook: PlayerOutlook;
};

export type OpportunityPreferences = {
  strategy: TeamStrategy;
  players: Record<string, PlayerPreference>;
};

export const defaultOpportunityPreferences: OpportunityPreferences = {
  strategy: "balanced",
  players: {},
};

export type LineupAssignment = {
  slot: Exclude<OpportunityGroup, "Bench">;
  playerId: string;
  value: number;
  upside: number;
};

export type GroupGrade = {
  group: OpportunityGroup;
  grade: number;
  label: "Elite" | "Strong" | "Average" | "Thin" | "Critical";
  measurements: {
    startingStrength: number;
    depth: number;
    ceiling: number;
    health: number;
    surplus: number;
  };
  percentiles: {
    startingStrength: number;
    depth: number;
    ceiling: number;
    health: number;
    surplus: number;
  };
  playerIds: string[];
  detail: string;
};

export type TeamOpportunityProfile = {
  teamId: string;
  teamName: string;
  groups: Record<OpportunityGroup, GroupGrade>;
  currentLineup: LineupAssignment[];
  futureLineup: LineupAssignment[];
  benchPlayerIds: string[];
  strongestGroup: OpportunityGroup;
  weakestGroup: OpportunityGroup;
  needs: OpportunityGroup[];
  surpluses: OpportunityGroup[];
  immediatePressure: number;
};

export type MarginalLineupEffect = {
  immediateDelta: number;
  futureDelta: number;
  ceilingDelta: number;
  outgoingStarters: string[];
  outgoingBench: string[];
  incomingStarters: string[];
  incomingBench: string[];
  replacements: Array<{ incomingPlayerId: string; replacedPlayerId: string | null; slot: string }>;
  unusedIncomingValue: number;
};

export type OpportunityProposal = {
  id: string;
  format: "one-for-one" | "two-for-two" | "two-for-one" | "one-for-two";
  sendPlayerIds: string[];
  receivePlayerIds: string[];
  counterpartyTeamId: string;
  score: number;
  tier: "lowball" | "slight-advantage" | "even";
  myEffect: MarginalLineupEffect;
  theirEffect: MarginalLineupEffect;
  marketDelta: number;
  whyAccept: string;
  immediateSummary: string;
  futureSummary: string;
  warnings: string[];
  preferenceReasons: string[];
};

export type TradePartnerProfile = {
  teamId: string;
  teamName: string;
  score: number;
  viable: boolean;
  whatTheyNeed: OpportunityGroup[];
  whatTheyCanMove: OpportunityGroup[];
  whyWeMatch: string;
  movablePlayerIds: string[];
  protectedPlayerIds: string[];
  proposals: OpportunityProposal[];
};

export type MyRosterDiagnosis = {
  strongestGroup: OpportunityGroup;
  weakestGroup: OpportunityGroup;
  expendablePlayerIds: string[];
  weakestStarterId: string | null;
  bestUpgradeGroup: OpportunityGroup;
  strandedBenchPlayerIds: string[];
  injuredKeepPlayerIds: string[];
  recommendedAction: string;
};

export type WeeklyOpportunityItem = {
  label: string;
  value: string;
  detail: string;
  available: boolean;
};

export type LeagueOpportunityDashboard = {
  teams: TeamOpportunityProfile[];
  myProfile: TeamOpportunityProfile;
  diagnosis: MyRosterDiagnosis;
  partners: TradePartnerProfile[];
  weeklyBoard: WeeklyOpportunityItem[];
  usageEvidenceAvailable: boolean;
};

const CORE_GROUPS: OpportunityGroup[] = ["QB", "RB", "WR", "TE", "FLEX"];
const ALL_GROUPS: OpportunityGroup[] = [...CORE_GROUPS, "Bench"];
const FLEX_POSITIONS = new Set<PlayerPosition>(leagueSourceOfTruth.lineup.flexEligible);

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function position(player: InSeasonPlayerSnapshot): PlayerPosition {
  return player.player.positions[0] ?? "WR";
}

function availabilityFactor(player: InSeasonPlayerSnapshot, future: boolean) {
  if (player.injuryStatus !== "IR") return 1;
  return future ? 0.76 : 0;
}

function value(player: InSeasonPlayerSnapshot, future = false) {
  return player.rosProjection.p50 * availabilityFactor(player, future);
}

function upside(player: InSeasonPlayerSnapshot, future = false) {
  return player.rosProjection.p90 * availabilityFactor(player, future);
}

export function allocateLeagueLineup(
  team: InSeasonTeamSnapshot,
  playersById: Map<string, InSeasonPlayerSnapshot>,
  future = false,
) {
  const pool = team.playerIds
    .map((id) => playersById.get(id))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
    .filter((player) => position(player) !== "K")
    .filter((player) => future || player.injuryStatus !== "IR");
  const used = new Set<string>();
  const assignments: LineupAssignment[] = [];
  const requirements: Array<["QB" | "RB" | "WR" | "TE", number]> = [
    ["QB", leagueSourceOfTruth.lineup.QB],
    ["RB", leagueSourceOfTruth.lineup.RB],
    ["WR", leagueSourceOfTruth.lineup.WR],
    ["TE", leagueSourceOfTruth.lineup.TE],
  ];

  for (const [slot, count] of requirements) {
    const eligible = pool
      .filter((player) => position(player) === slot)
      .sort((a, b) => value(b, future) - value(a, future));
    for (const player of eligible.slice(0, count)) {
      used.add(player.player.id);
      assignments.push({ slot, playerId: player.player.id, value: value(player, future), upside: upside(player, future) });
    }
  }

  const flex = pool
    .filter((player) => !used.has(player.player.id) && FLEX_POSITIONS.has(position(player)))
    .sort((a, b) => value(b, future) - value(a, future))
    .slice(0, leagueSourceOfTruth.lineup.FLEX);
  for (const player of flex) {
    used.add(player.player.id);
    assignments.push({ slot: "FLEX", playerId: player.player.id, value: value(player, future), upside: upside(player, future) });
  }

  const bench = pool.filter((player) => !used.has(player.player.id));
  return {
    assignments,
    bench,
    total: round(assignments.reduce((sum, assignment) => sum + assignment.value, 0)),
    ceiling: round(assignments.reduce((sum, assignment) => sum + assignment.upside, 0)),
  };
}

type RawGroup = Omit<GroupGrade, "grade" | "label" | "percentiles" | "detail">;

function rawTeamGroups(team: InSeasonTeamSnapshot, playersById: Map<string, InSeasonPlayerSnapshot>) {
  const current = allocateLeagueLineup(team, playersById);
  const future = allocateLeagueLineup(team, playersById, true);
  const roster = team.playerIds.map((id) => playersById.get(id))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
    .filter((player) => position(player) !== "K");
  const assigned = new Set(current.assignments.map((item) => item.playerId));
  const groups = {} as Record<OpportunityGroup, RawGroup>;

  for (const group of ALL_GROUPS) {
    const starters = group === "Bench"
      ? current.bench
      : current.assignments.filter((item) => item.slot === group).map((item) => playersById.get(item.playerId)!).filter(Boolean);
    const positionPlayers = group === "FLEX"
      ? roster.filter((player) => FLEX_POSITIONS.has(position(player)))
      : group === "Bench"
        ? roster.filter((player) => !assigned.has(player.player.id))
        : roster.filter((player) => position(player) === group);
    const groupStarterIds = new Set(starters.map((player) => player.player.id));
    const depthPlayers = group === "Bench"
      ? current.bench
      : positionPlayers.filter((player) => !assigned.has(player.player.id) && !groupStarterIds.has(player.player.id));
    const expected = group === "QB" ? leagueSourceOfTruth.lineup.QB
      : group === "RB" ? leagueSourceOfTruth.lineup.RB
        : group === "WR" ? leagueSourceOfTruth.lineup.WR
          : group === "TE" ? leagueSourceOfTruth.lineup.TE
            : group === "FLEX" ? leagueSourceOfTruth.lineup.FLEX
              : leagueSourceOfTruth.lineup.BN;
    const topDepth = [...depthPlayers].sort((a, b) => value(b, true) - value(a, true)).slice(0, Math.max(2, expected));
    const futureRelevant = positionPlayers
      .sort((a, b) => value(b, true) - value(a, true))
      .slice(0, expected + (group === "Bench" ? 0 : 1));
    const healthyValue = futureRelevant.reduce((sum, player) => sum + (player.injuryStatus === "IR" ? 0 : value(player, true)), 0);
    const possibleValue = futureRelevant.reduce((sum, player) => sum + value(player, true), 0);
    const startingStrength = starters.reduce((sum, player) => sum + value(player), 0) / Math.max(1, expected);
    const ceiling = starters.reduce((sum, player) => sum + upside(player), 0) / Math.max(1, expected);
    const depth = topDepth.reduce((sum, player) => sum + value(player, true), 0) / Math.max(1, Math.min(topDepth.length || 1, expected));
    const excessCount = Math.max(0, positionPlayers.length - expected);
    const excessValue = [...positionPlayers]
      .sort((a, b) => value(b, true) - value(a, true))
      .slice(expected)
      .reduce((sum, player) => sum + value(player, true), 0) / Math.max(1, excessCount);
    groups[group] = {
      group,
      measurements: {
        startingStrength: round(startingStrength),
        depth: round(depth),
        ceiling: round(ceiling),
        health: round(possibleValue ? (healthyValue / possibleValue) * 100 : 0),
        surplus: round(excessCount * 100 + excessValue),
      },
      playerIds: positionPlayers.map((player) => player.player.id),
    };
  }
  return { groups, current, future };
}

function percentile(valueToRank: number, values: number[], highIsGood = true) {
  if (values.length <= 1) return 50;
  const below = values.filter((entry) => highIsGood ? entry < valueToRank : entry > valueToRank).length;
  const equal = values.filter((entry) => entry === valueToRank).length;
  return round(clamp(((below + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100), 0);
}

function gradeLabel(grade: number): GroupGrade["label"] {
  if (grade >= 85) return "Elite";
  if (grade >= 68) return "Strong";
  if (grade >= 42) return "Average";
  if (grade >= 22) return "Thin";
  return "Critical";
}

export function buildLeaguePositionGrades(
  players: InSeasonPlayerSnapshot[],
  teams: InSeasonTeamSnapshot[],
): TeamOpportunityProfile[] {
  const playersById = new Map(players.map((player) => [player.player.id, player] as const));
  const raw = teams.map((team) => ({ team, ...rawTeamGroups(team, playersById) }));
  return raw.map(({ team, groups, current, future }) => {
    const graded = {} as Record<OpportunityGroup, GroupGrade>;
    for (const group of ALL_GROUPS) {
      const metricValues = (metric: keyof RawGroup["measurements"]) => raw.map((entry) => entry.groups[group].measurements[metric]);
      const measurements = groups[group].measurements;
      const percentiles = {
        startingStrength: percentile(measurements.startingStrength, metricValues("startingStrength")),
        depth: percentile(measurements.depth, metricValues("depth")),
        ceiling: percentile(measurements.ceiling, metricValues("ceiling")),
        health: percentile(measurements.health, metricValues("health")),
        surplus: percentile(measurements.surplus, metricValues("surplus")),
      };
      const grade = round(
        percentiles.startingStrength * 0.34 + percentiles.depth * 0.2 + percentiles.ceiling * 0.2 + percentiles.health * 0.14 + percentiles.surplus * 0.12,
        0,
      );
      graded[group] = {
        ...groups[group],
        grade,
        label: gradeLabel(grade),
        percentiles,
        detail: `${round(measurements.startingStrength)} starter value, ${round(measurements.depth)} depth value, ${round(measurements.ceiling)} ceiling and ${round(measurements.health, 0)}% healthy availability. All percentiles are versus this league.`,
      };
    }
    const rankedCore = [...CORE_GROUPS].sort((a, b) => graded[b].grade - graded[a].grade);
    const immediatePressure = round(100 - (graded.RB.percentiles.health * 0.28 + graded.WR.percentiles.health * 0.28 + graded.FLEX.percentiles.health * 0.24 + graded.Bench.percentiles.depth * 0.2), 0);
    return {
      teamId: team.teamId,
      teamName: team.name,
      groups: graded,
      currentLineup: current.assignments,
      futureLineup: future.assignments,
      benchPlayerIds: current.bench.map((player) => player.player.id),
      strongestGroup: rankedCore[0],
      weakestGroup: rankedCore[rankedCore.length - 1],
      needs: CORE_GROUPS.filter((group) => graded[group].grade < 40).sort((a, b) => graded[a].grade - graded[b].grade),
      surpluses: CORE_GROUPS.filter((group) => graded[group].percentiles.surplus >= 65).sort((a, b) => graded[b].percentiles.surplus - graded[a].percentiles.surplus),
      immediatePressure,
    };
  });
}

function changedLineupEffect(
  beforeTeam: InSeasonTeamSnapshot,
  afterIds: string[],
  playersById: Map<string, InSeasonPlayerSnapshot>,
  incomingIds: string[],
  outgoingIds: string[],
): MarginalLineupEffect {
  const before = allocateLeagueLineup(beforeTeam, playersById);
  const after = allocateLeagueLineup({ ...beforeTeam, playerIds: afterIds }, playersById);
  const beforeFuture = allocateLeagueLineup(beforeTeam, playersById, true);
  const afterFuture = allocateLeagueLineup({ ...beforeTeam, playerIds: afterIds }, playersById, true);
  const beforeStarterIds = new Set(before.assignments.map((entry) => entry.playerId));
  const afterStarterIds = new Set(after.assignments.map((entry) => entry.playerId));
  const incomingStarters = incomingIds.filter((id) => afterStarterIds.has(id));
  const outgoingStarters = outgoingIds.filter((id) => beforeStarterIds.has(id));
  const displaced = before.assignments.filter((entry) => !afterStarterIds.has(entry.playerId) && !outgoingIds.includes(entry.playerId));
  const replacements = incomingStarters.map((incomingId) => {
    const incoming = after.assignments.find((entry) => entry.playerId === incomingId)!;
    const sameSlot = displaced.find((entry) => entry.slot === incoming.slot);
    const sentSameSlot = before.assignments.find((entry) => outgoingIds.includes(entry.playerId) && entry.slot === incoming.slot);
    return { incomingPlayerId: incomingId, replacedPlayerId: sameSlot?.playerId ?? sentSameSlot?.playerId ?? null, slot: incoming.slot };
  });
  const unusedIncomingValue = incomingIds
    .filter((id) => !afterStarterIds.has(id))
    .reduce((sum, id) => sum + (playersById.get(id) ? value(playersById.get(id)!, true) : 0), 0);
  return {
    immediateDelta: round(after.total - before.total),
    futureDelta: round(afterFuture.total - beforeFuture.total),
    ceilingDelta: round(afterFuture.ceiling - beforeFuture.ceiling),
    outgoingStarters,
    outgoingBench: outgoingIds.filter((id) => !beforeStarterIds.has(id)),
    incomingStarters,
    incomingBench: incomingIds.filter((id) => !afterStarterIds.has(id)),
    replacements,
    unusedIncomingValue: round(unusedIncomingValue),
  };
}

export function calculateMarginalLineupEffects(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
  theirTeam: InSeasonTeamSnapshot,
  sendIds: string[],
  receiveIds: string[],
) {
  const playersById = new Map(players.map((player) => [player.player.id, player] as const));
  const swap = (ids: string[], remove: string[], add: string[]) => ids.filter((id) => !remove.includes(id)).concat(add);
  return {
    myEffect: changedLineupEffect(myTeam, swap(myTeam.playerIds, sendIds, receiveIds), playersById, receiveIds, sendIds),
    theirEffect: changedLineupEffect(theirTeam, swap(theirTeam.playerIds, receiveIds, sendIds), playersById, sendIds, receiveIds),
  };
}

function preferenceAdjustment(ids: string[], direction: "send" | "receive", preferences: OpportunityPreferences) {
  let score = 0;
  const reasons: string[] = [];
  for (const id of ids) {
    const pref = preferences.players[id];
    if (!pref) continue;
    if (direction === "send" && pref.intent === "untouchable") { score -= 1000; reasons.push("Untouchable player blocks this offer."); }
    if (direction === "send" && pref.intent === "prefer-keep") { score -= 18; reasons.push("Ranked lower because you prefer to keep an outgoing player."); }
    if (direction === "send" && pref.intent === "actively-shop") { score += 16; reasons.push("Ranked higher because an outgoing player is actively shopped."); }
    if (direction === "receive" && pref.intent === "buy-low") { score += 15; reasons.push("Ranked higher because the return includes your buy-low target."); }
    if (direction === "receive" && pref.intent === "willing-stash") { score += 8; reasons.push("Your stash preference supports carrying this return."); }
    if (direction === "send" && pref.outlook === "bullish") { score -= 10; reasons.push("Bullish outlook raises the cost of sending this player."); }
    if (direction === "send" && pref.outlook === "bearish") { score += 8; reasons.push("Bearish outlook raises this player's shop priority."); }
    if (direction === "receive" && pref.outlook === "bullish") { score += 10; reasons.push("Bullish outlook raises this target's rank."); }
    if (direction === "receive" && pref.outlook === "bearish") { score -= 10; reasons.push("Bearish outlook lowers this target's rank."); }
  }
  return { score, reasons };
}

function packageQuality(
  send: InSeasonPlayerSnapshot[],
  receive: InSeasonPlayerSnapshot[],
  myEffect: MarginalLineupEffect,
) {
  const warnings: string[] = [];
  const outgoingAnchor = [...send].sort((a, b) => (a.marketTier ?? 99) - (b.marketTier ?? 99))[0];
  if ((outgoingAnchor?.marketTier ?? 99) <= 3 && !receive.some((player) => (player.marketTier ?? 99) <= (outgoingAnchor.marketTier ?? 3))) {
    warnings.push(`${outgoingAnchor.player.fullName} is an elite-tier anchor without a comparable incoming centerpiece.`);
  }
  if (myEffect.ceilingDelta < -12) warnings.push("The package sacrifices too much usable-lineup ceiling.");
  if (myEffect.futureDelta < -4) warnings.push("A smaller upgrade elsewhere does not cover the larger positional loss.");
  return warnings;
}

function combinations<T>(items: T[], count: number) {
  if (count === 1) return items.map((item) => [item]);
  const result: T[][] = [];
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) result.push([items[first], items[second]]);
  }
  return result;
}

function generateTeamProposals(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
  theirTeam: InSeasonTeamSnapshot,
  preferences: OpportunityPreferences,
) {
  const decisionGate = createDecisionGate(players);
  const byId = new Map(players.map((player) => [player.player.id, player] as const));
  const rank = (ids: string[]) => ids.map((id) => byId.get(id))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
    .filter((player) => position(player) !== "K")
    .sort((a, b) => value(b, true) - value(a, true)).slice(0, 11);
  const mine = rank(myTeam.playerIds);
  const theirs = rank(theirTeam.playerIds);
  const structures: Array<[number, number, OpportunityProposal["format"]]> = [[1, 1, "one-for-one"], [2, 2, "two-for-two"], [2, 1, "two-for-one"], [1, 2, "one-for-two"]];
  const proposals: OpportunityProposal[] = [];

  for (const [sendCount, receiveCount, format] of structures) {
    for (const send of combinations(mine, sendCount)) {
      for (const receive of combinations(theirs, receiveCount)) {
        if (format === "one-for-one" && position(send[0]) === position(receive[0])) {
          const riskBenefit = (receive[0].rosProjection.p90 - receive[0].rosProjection.p10) + 8 < (send[0].rosProjection.p90 - send[0].rosProjection.p10);
          const injuryBenefit = send[0].injuryStatus === "IR" && receive[0].injuryStatus !== "IR";
          const ceilingBenefit = receive[0].rosProjection.p90 >= send[0].rosProjection.p90 + 12;
          if (!riskBenefit && !injuryBenefit && !ceilingBenefit) continue;
        }
        const sendIds = send.map((player) => player.player.id);
        const receiveIds = receive.map((player) => player.player.id);
        if (!decisionGate([...sendIds, ...receiveIds], "trade").actionable) continue;
        const effects = calculateMarginalLineupEffects(players, myTeam, theirTeam, sendIds, receiveIds);
        const replacementIds = [effects.myEffect, effects.theirEffect].flatMap((effect) => effect.replacements.flatMap((replacement) => [replacement.incomingPlayerId, ...(replacement.replacedPlayerId ? [replacement.replacedPlayerId] : [])]));
        if (!decisionGate(replacementIds).actionable) continue;
        const warnings = packageQuality(send, receive, effects.myEffect);
        const marketDelta = round(receive.reduce((sum, player) => sum + value(player, true), 0) - send.reduce((sum, player) => sum + value(player, true), 0));
        const prefSend = preferenceAdjustment(sendIds, "send", preferences);
        const prefReceive = preferenceAdjustment(receiveIds, "receive", preferences);
        if (prefSend.score <= -900 || warnings.length) continue;
        const winNowWeight = preferences.strategy === "win-now" ? 1.45 : preferences.strategy === "patient" ? 0.75 : 1;
        const futureWeight = preferences.strategy === "patient" ? 1.35 : 1;
        const score = round(
          effects.myEffect.immediateDelta * 2.4 * winNowWeight + effects.myEffect.futureDelta * 1.8 * futureWeight + effects.myEffect.ceilingDelta * 0.65 +
          Math.min(effects.theirEffect.immediateDelta, 18) * 1.35 + Math.min(effects.theirEffect.futureDelta, 18) * 0.8 - Math.abs(marketDelta) * 0.08 + prefSend.score + prefReceive.score,
        );
        const bothBenefit = Math.max(effects.myEffect.immediateDelta, effects.myEffect.futureDelta) >= 1.5 && Math.max(effects.theirEffect.immediateDelta, effects.theirEffect.futureDelta) >= 0.5;
        const fairMarket = Math.abs(marketDelta) <= (format === "one-for-one" ? 22 : 42);
        if (!bothBenefit || !fairMarket || score < 5) continue;
        const tier = marketDelta >= 12 ? "lowball" : marketDelta >= 3 ? "slight-advantage" : "even";
        const injuredIncoming = receive.find((player) => player.injuryStatus === "IR");
        const injuredOutgoing = send.find((player) => player.injuryStatus === "IR");
        const whyAccept = effects.theirEffect.immediateDelta > 0
          ? `Their usable lineup gains ${round(effects.theirEffect.immediateDelta)} now, so the offer solves an active starter problem.`
          : `Their future lineup gains ${round(effects.theirEffect.futureDelta)} while preserving enough current depth.`;
        const proposalWarnings = [
          ...(injuredIncoming ? [`${injuredIncoming.player.fullName} is an IR discount: current points are sacrificed for return-adjusted future value.`] : []),
          ...(injuredOutgoing ? [`${injuredOutgoing.player.fullName} retains future value and is not priced as disposable.`] : []),
          ...(effects.myEffect.unusedIncomingValue > 0 ? [`${round(effects.myEffect.unusedIncomingValue)} incoming value remains on your bench instead of improving the lineup.`] : []),
        ];
        proposals.push({
          id: `${theirTeam.teamId}:${sendIds.join("+")}:${receiveIds.join("+")}`,
          format, sendPlayerIds: sendIds, receivePlayerIds: receiveIds, counterpartyTeamId: theirTeam.teamId,
          score, tier, myEffect: effects.myEffect, theirEffect: effects.theirEffect, marketDelta,
          whyAccept,
          immediateSummary: `Your active lineup ${effects.myEffect.immediateDelta >= 0 ? "gains" : "loses"} ${Math.abs(effects.myEffect.immediateDelta)}; theirs ${effects.theirEffect.immediateDelta >= 0 ? "gains" : "loses"} ${Math.abs(effects.theirEffect.immediateDelta)}.`,
          futureSummary: `Return-adjusted lineup: you ${effects.myEffect.futureDelta >= 0 ? "+" : ""}${effects.myEffect.futureDelta}, them ${effects.theirEffect.futureDelta >= 0 ? "+" : ""}${effects.theirEffect.futureDelta}; your ceiling ${effects.myEffect.ceilingDelta >= 0 ? "+" : ""}${effects.myEffect.ceilingDelta}.`,
          warnings: proposalWarnings,
          preferenceReasons: [...new Set([...prefSend.reasons, ...prefReceive.reasons])],
        });
      }
    }
  }
  return proposals.sort((a, b) => b.score - a.score);
}

function diagnoseMyRoster(profile: TeamOpportunityProfile, players: InSeasonPlayerSnapshot[]): MyRosterDiagnosis {
  const byId = new Map(players.map((player) => [player.player.id, player] as const));
  const weakestStarter = [...profile.currentLineup].sort((a, b) => a.value - b.value)[0];
  const bench = profile.benchPlayerIds.map((id) => byId.get(id)).filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
  const surplusPositions = new Set(profile.surpluses);
  const expendable = bench.filter((player) => {
    const playerPosition = position(player);
    const rosterGroup = CORE_GROUPS.find((group) => group === playerPosition);
    return player.injuryStatus !== "IR" && rosterGroup !== undefined && surplusPositions.has(rosterGroup);
  }).sort((a, b) => value(b, true) - value(a, true)).slice(0, 4);
  const weakestStarterValue = weakestStarter?.value ?? 0;
  const stranded = bench.filter((player) => player.injuryStatus !== "IR" && value(player) >= weakestStarterValue * 0.9).sort((a, b) => value(b) - value(a)).slice(0, 4);
  const injuredKeep = profile.groups.Bench.playerIds.map((id) => byId.get(id))
    .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
    .filter((player) => player.injuryStatus === "IR");
  const tradeSurplus = profile.surpluses.find((group) => group !== "FLEX") ?? profile.strongestGroup;
  return {
    strongestGroup: profile.strongestGroup,
    weakestGroup: profile.weakestGroup,
    expendablePlayerIds: expendable.map((player) => player.player.id),
    weakestStarterId: weakestStarter?.playerId ?? null,
    bestUpgradeGroup: weakestStarter?.slot ?? profile.weakestGroup,
    strandedBenchPlayerIds: stranded.map((player) => player.player.id),
    injuredKeepPlayerIds: injuredKeep.map((player) => player.player.id),
    recommendedAction: `Shop excess ${tradeSurplus} depth into a ${weakestStarter?.slot ?? profile.weakestGroup} starter upgrade without touching an elite anchor.`,
  };
}

export function buildLeagueOpportunityDashboard(
  players: InSeasonPlayerSnapshot[],
  myTeam: InSeasonTeamSnapshot,
  teams: InSeasonTeamSnapshot[],
  preferences: OpportunityPreferences = defaultOpportunityPreferences,
): LeagueOpportunityDashboard {
  const profiles = buildLeaguePositionGrades(players, teams);
  const myProfile = profiles.find((profile) => profile.teamId === myTeam.teamId) ?? profiles[0];
  if (!myProfile) throw new Error("League opportunity dashboard requires at least one team.");
  const byId = new Map(players.map((player) => [player.player.id, player] as const));
  const partners = profiles.filter((profile) => profile.teamId !== myTeam.teamId).map((profile) => {
    const theirNeedOurSurplus = profile.needs.filter((group) => myProfile.surpluses.includes(group));
    const ourNeedTheirSurplus = myProfile.needs.filter((group) => profile.surpluses.includes(group));
    const proposals = generateTeamProposals(players, myTeam, teams.find((team) => team.teamId === profile.teamId)!, preferences);
    const structuralFit = theirNeedOurSurplus.length * 14 + ourNeedTheirSurplus.length * 18;
    const proposalFit = proposals[0] ? clamp(proposals[0].score, 0, 45) : 0;
    const score = round(clamp(structuralFit + proposalFit + (profile.immediatePressure >= 60 ? 8 : 0)), 0);
    const roster = profile.groups.Bench.playerIds.map((id) => byId.get(id)).filter((player): player is InSeasonPlayerSnapshot => Boolean(player));
    const movable = roster.filter((player) => player.injuryStatus !== "IR" && !profile.currentLineup.some((slot) => slot.playerId === player.player.id)).sort((a, b) => value(b, true) - value(a, true)).slice(0, 5);
    const protectedPlayers = profile.currentLineup.map((slot) => byId.get(slot.playerId))
      .filter((player): player is InSeasonPlayerSnapshot => player !== undefined)
      .filter((player) => (player.marketTier ?? 99) <= 3 || profile.groups[slotGroup(player, profile)].grade < 35)
      .slice(0, 5);
    const matchPieces = [
      theirNeedOurSurplus.length ? `They need ${theirNeedOurSurplus.join("/")}, where you have surplus.` : null,
      ourNeedTheirSurplus.length ? `They can cover your ${ourNeedTheirSurplus.join("/")} need.` : null,
      proposals[0] ? "At least one structure improves both usable lineups." : null,
    ].filter(Boolean);
    return {
      teamId: profile.teamId,
      teamName: profile.teamName,
      score,
      viable: score >= 28 && proposals.length > 0,
      whatTheyNeed: profile.needs,
      whatTheyCanMove: profile.surpluses,
      whyWeMatch: matchPieces.join(" ") || "Roster strengths do not line up cleanly enough for a natural deal.",
      movablePlayerIds: movable.map((player) => player.player.id),
      protectedPlayerIds: protectedPlayers.map((player) => player.player.id),
      proposals,
    } satisfies TradePartnerProfile;
  }).sort((a, b) => b.score - a.score);
  const diagnosis = diagnoseMyRoster(myProfile, players);
  const allProposals = partners.flatMap((partner) => partner.proposals);
  const best = (format: OpportunityProposal["format"] | OpportunityProposal["format"][]) => allProposals.find((proposal) => (Array.isArray(format) ? format : [format]).includes(proposal.format));
  const formatProposal = (proposal: OpportunityProposal | undefined) => proposal
    ? `${proposal.sendPlayerIds.map((id) => byId.get(id)?.player.fullName ?? id).join(" + ")} for ${proposal.receivePlayerIds.map((id) => byId.get(id)?.player.fullName ?? id).join(" + ")}`
    : "No worthwhile structure clears the safeguards";
  const injuredDiscount = allProposals.find((proposal) => proposal.receivePlayerIds.some((id) => byId.get(id)?.injuryStatus === "IR"));
  const usageEvidenceAvailable = players.some((player) => player.recentUsage.games > 0);
  const pressureTeam = [...profiles.filter((profile) => profile.teamId !== myTeam.teamId)].sort((a, b) => b.immediatePressure - a.immediatePressure)[0];
  const weeklyBoard: WeeklyOpportunityItem[] = [
    { label: "Best natural trade partner", value: partners[0]?.teamName ?? "Unavailable", detail: partners[0]?.whyWeMatch ?? "No partner data.", available: Boolean(partners[0]?.viable) },
    { label: "Most exploitable opponent weakness", value: partners[0]?.whatTheyNeed[0] ?? "No clear weakness", detail: partners[0] ? `${partners[0].teamName} grades lowest where your roster may have leverage.` : "No league profile.", available: Boolean(partners[0]?.whatTheyNeed.length) },
    { label: "Best clean 1-for-1", value: formatProposal(best("one-for-one")), detail: "Shown only when both lineups improve and the same-position safeguard is satisfied.", available: Boolean(best("one-for-one")) },
    { label: "Best roster-balancing package", value: formatProposal(best("two-for-two")), detail: "Trades strength at one group for a different starting-lineup need.", available: Boolean(best("two-for-two")) },
    { label: "Best consolidation opportunity", value: formatProposal(best(["two-for-one", "one-for-two"])), detail: "Unequal-player package shown only when roster structure supports the open bench slot.", available: Boolean(best(["two-for-one", "one-for-two"])) },
    { label: "Best injured-player discount", value: formatProposal(injuredDiscount), detail: "IR value is return-adjusted, never treated as zero.", available: Boolean(injuredDiscount) },
    { label: "Best buy-low candidate", value: usageEvidenceAvailable ? "See correction board" : "Unavailable — no regular-season usage yet", detail: "Requires real routes, targets, carries or snaps before making the claim.", available: usageEvidenceAvailable },
    { label: "Best sell-high candidate", value: usageEvidenceAvailable ? "See correction board" : "Unavailable — no regular-season usage yet", detail: "Market movement without regular-season usage is not enough evidence.", available: usageEvidenceAvailable },
    { label: "Most immediate lineup pressure", value: pressureTeam?.teamName ?? "Unavailable", detail: pressureTeam ? `${pressureTeam.immediatePressure}/100 pressure from health and replacement-level depth.` : "No opponent data.", available: Boolean(pressureTeam) },
  ];
  return { teams: profiles, myProfile, diagnosis, partners, weeklyBoard, usageEvidenceAvailable };
}

function slotGroup(player: InSeasonPlayerSnapshot, profile: TeamOpportunityProfile): OpportunityGroup {
  return profile.currentLineup.find((slot) => slot.playerId === player.player.id)?.slot ?? "Bench";
}
