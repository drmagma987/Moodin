import type { InSeasonPlayerSnapshot, InSeasonTeamSnapshot, PlayerRange } from "@/lib/fantasy/types";
import { completedGameEvidenceMeta } from "@/lib/fantasy/completedGameEvidence";

export type CoverageGrade = "complete" | "baseline-only" | "partial" | "blocked" | "not-required";
export type CoverageOptions = { candidatePlayerIds?: readonly string[] };
export function playerCoverageScope(player: InSeasonPlayerSnapshot, now = Date.now(), options: CoverageOptions = {}) {
  const reasons: string[] = [];
  if (player.player.positions[0] === "K") return { scope: "kicker" as const, reasons: ["Kicker essentials only"] };
  if (player.availability !== "free-agent") reasons.push("Rostered / trade target");
  if (Number.isFinite(player.marketRank) && player.marketRank! > 0 && player.marketRank! <= 250) reasons.push("Top 250 market rank");
  if (options.candidatePlayerIds?.includes(player.player.id)) reasons.push("Waiver / trade candidate");
  const opportunity = player.injuryOpportunity;
  const injuryAge = opportunity ? now - Date.parse(opportunity.capturedAt) : NaN;
  if (opportunity?.confirmed && opportunity.successorVerified && opportunity.source.trim() && injuryAge >= -86_400_000 && injuryAge <= 7 * 86_400_000) reasons.push("Verified injury successor");
  const evidence = player.evidence;
  const age = evidence ? now - Date.parse(evidence.capturedAt) : NaN;
  const targets = evidence?.observedTargets;
  const carries = evidence?.observedCarries;
  // Use actual game opportunities, never modeled/blended touches, for discovery.
  if (evidence?.week === completedGameEvidenceMeta.week && evidence.boxScore && evidence.source.trim() && age >= -86_400_000 && age <= 14 * 86_400_000 && evidence.participation === "played"
    && ((Number.isFinite(targets) && targets! >= 4 && targets! >= player.baselineUsage.targetsPerGame + 2)
      || (Number.isFinite(carries) && carries! >= 8 && carries! >= player.baselineUsage.carriesPerGame + 4))) reasons.push("Observed opportunity increase");
  return { scope: reasons.length ? "priority" as const : "monitor" as const, reasons };
}
export type DecisionPurpose = "valuation" | "trade" | "usage" | "receiving-efficiency" | "rushing-efficiency" | "passing-efficiency" | "injury-opportunity";
export type PlayerCoverage = {
  playerId: string;
  name: string;
  position: string;
  rostered: boolean;
  relevant: boolean;
  scope: "priority" | "monitor" | "kicker";
  scopeReasons: string[];
  grade: CoverageGrade;
  actionable: boolean;
  missing: string[];
  invalid: string[];
  notes: string[];
  evaluation: "baseline" | "observed" | "inactive" | "lightweight" | "invalid" | "monitor";
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const rangeValid = (range: PlayerRange) => Boolean(range) && [range.p10, range.p50, range.p90].every(finite)
  && range.p10 <= range.p50 && range.p50 <= range.p90;

/** Missing evidence never becomes a zero or a verified observation. Completeness is
 * data readiness, not statistical confidence: even complete Week 1 data is noisy. */
export function assessPlayerCoverage(player: InSeasonPlayerSnapshot, now = Date.now(), options: CoverageOptions & { scoped?: boolean } = {}): PlayerCoverage {
  const { scope, reasons: scopeReasons } = playerCoverageScope(player, now, options);
  const position = player.player.positions[0];
  const missing: string[] = [];
  const invalid: string[] = [];
  const notes: string[] = [];
  const advanced = player.advancedUsage;
  const evidence = player.evidence;
  const participationCurrent = evidence?.week === completedGameEvidenceMeta.week && Boolean(evidence.source.trim()) && Number.isFinite(Date.parse(evidence.capturedAt)) && now - Date.parse(evidence.capturedAt) <= 14 * 86_400_000 && now - Date.parse(evidence.capturedAt) >= -86_400_000;
  const noOpportunity = participationCurrent && (evidence?.participation === "inactive" || evidence?.participation === "zero-snaps" || evidence?.participation === "bye") || player.injuryStatus === "IR";
  if (!player.player.id || !player.player.fullName || !player.player.team) invalid.push("Missing player identity or NFL team");
  if (!["QB", "RB", "WR", "TE", "K"].includes(position)) invalid.push("Unsupported position");
  if (!rangeValid(player.weeklyProjection) || !rangeValid(player.rosProjection)) invalid.push("Invalid or inverted projection range");
  if (options.scoped && scope === "monitor") return {
    playerId: player.player.id, name: player.player.fullName, position, rostered: false, relevant: false, scope, scopeReasons,
    grade: invalid.length ? "blocked" : "not-required", actionable: false, missing: [], invalid,
    evaluation: invalid.length ? "invalid" : "monitor", notes: ["Lightweight monitoring; full profile not required until a ranking, roster, opportunity or candidate trigger promotes this player."],
  };
  for (const [label, usage] of [["Baseline", player.baselineUsage], ["Recent", player.recentUsage]] as const) {
    if (position === "K") continue;
    if (Object.values(usage).some((value) => !finite(value))) invalid.push(`${label} usage contains non-finite values`);
    if ([usage.snapShare, usage.routeParticipation, usage.targetShare].some((value) => value < 0 || value > 1)) invalid.push(`${label} usage share is outside 0–100%`);
    if ([usage.games, usage.targetsPerGame, usage.carriesPerGame].some((value) => value < 0)) invalid.push(`${label} usage has negative counts`);
  }
  if (position === "K") {
    return { playerId: player.player.id, name: player.player.fullName, position, rostered: player.availability !== "free-agent", relevant: false, scope, scopeReasons,
      grade: invalid.length ? "blocked" : "complete", actionable: !invalid.length, missing: [], invalid,
      evaluation: invalid.length ? "invalid" : "lightweight", notes: ["Kicker: identity and projection sanity checks only; no advanced profile required."] };
  }
  if (!finite(player.marketRank) || player.marketRank <= 0) missing.push("Market rank");
  if (!player.currentRole || player.currentRole === "unknown") missing.push("Current role / depth context");
  if (!player.injuryStatus || /unknown|^(NA|N\/A)$/i.test(player.injuryStatus)) missing.push("Explicit health status");
  if (player.injuryStatus === "IR" && !player.projectedReturnDate) missing.push("Injured player's return estimate");
  const age = evidence ? now - Date.parse(evidence.capturedAt) : NaN;
  const current = Boolean(evidence && evidence.week === completedGameEvidenceMeta.week && evidence.source.trim()
    && finite(age) && age >= -86_400_000 && age <= 14 * 86_400_000);
  if (!current && !noOpportunity) missing.push("Current-week sourced evidence (at most 14 days old)");
  if (!evidence?.boxScore && !noOpportunity) missing.push("Verified box score");
  if (position !== "QB" && !evidence?.snaps && !noOpportunity) missing.push("Verified snap usage");
  const advancedCurrent = advanced?.week === completedGameEvidenceMeta.week && (advanced?.games ?? 0) > 0 && Boolean(advanced?.sources.length);
  if (!noOpportunity && (position === "WR" || position === "TE" || position === "RB")) {
    if (!advancedCurrent || !evidence?.routes || advanced?.statuses.routes !== "verified" || !finite(advanced.routes) || advanced.routes <= 0) missing.push("Verified routes with a nonzero denominator");
    if (!finite(advanced?.targetsPerRouteRun) || !finite(advanced?.yardsPerRouteRun)) missing.push("TPRR and YPRR");
    if (!finite(evidence?.observedTargets) || !finite(evidence?.observedReceivingYards)) missing.push("Observed targets and receiving yards for calculation audit");
    if (finite(advanced?.routes) && advanced.routes > 0) {
      if (finite(evidence?.observedTargets) && finite(advanced.targetsPerRouteRun)
        && Math.abs(evidence.observedTargets / advanced.routes - advanced.targetsPerRouteRun) > 0.002) invalid.push("TPRR does not match targets / routes");
      if (finite(evidence?.observedReceivingYards) && finite(advanced.yardsPerRouteRun)
        && Math.abs(evidence.observedReceivingYards / advanced.routes - advanced.yardsPerRouteRun) > 0.002) invalid.push("YPRR does not match receiving yards / routes");
    }
    if (finite(advanced?.targetsPerRouteRun) && (advanced.targetsPerRouteRun < 0 || advanced.targetsPerRouteRun > 1)) invalid.push("TPRR outside 0–100%");
    if (position !== "RB" && (!advancedCurrent || advanced?.statuses.airYards !== "verified" || !finite(advanced?.airYardsShare))) missing.push("Verified air-yards share");
  }
  if (position === "RB" && !noOpportunity) {
    if (!advancedCurrent || advanced?.statuses.rushingYardsOverExpected !== "verified" || !finite(advanced?.rushingYardsOverExpectedPerAttempt)) missing.push("Verified RYOE per attempt");
    if (advanced?.statuses.forcedMissedTackles !== "verified") notes.push("Missed-tackle charting unavailable; no missed-tackle claim permitted");
    if (!finite(evidence?.observedCarries) || evidence.observedCarries <= 0 || !finite(advanced?.rushingYardsOverExpected)) missing.push("Observed carries and total RYOE for calculation audit");
    if (finite(evidence?.observedCarries) && evidence.observedCarries > 0 && finite(advanced?.rushingYardsOverExpected) && finite(advanced?.rushingYardsOverExpectedPerAttempt)
      && Math.abs(advanced.rushingYardsOverExpected / evidence.observedCarries - advanced.rushingYardsOverExpectedPerAttempt) > 0.01) invalid.push("RYOE per attempt does not match total / carries");
  }
  if (!noOpportunity && position === "QB" && (!advancedCurrent || advanced?.statuses.quarterbackEnvironment !== "verified" || !finite(advanced?.cpoe))) missing.push("Verified CPOE with adequate passing sample");
  if (!noOpportunity && (!advancedCurrent || advanced?.statuses.quarterbackEnvironment !== "verified" || !finite(advanced?.teamProe))) missing.push("Verified team passing environment (PROE)");
  if (noOpportunity) notes.push("No current playing sample expected; evaluate using prior ability, opportunity and return uncertainty.");
  if (!current && /^(out|pup|doubtful|suspended)$/i.test(player.injuryStatus ?? "")) notes.push(`Current designation: ${player.injuryStatus}. Completed-game participation is unverified; this is not proof of zero activity or a completed injury evaluation.`);
  if (player.projectionBasis === "preseason-prior") notes.push("Projection still anchored to preseason totals; not a current weekly forecast.");
  if (advanced) {
    for (const [key, value] of Object.entries(advanced)) {
      if (typeof value === "number" && !finite(value)) invalid.push(`Invalid advanced metric: ${key}`);
    }
  }
  const grade: CoverageGrade = invalid.length ? "blocked" : !missing.length ? "complete" : !evidence && !advanced ? "baseline-only" : "partial";
  const rostered = player.availability !== "free-agent";
  return { playerId: player.player.id, name: player.player.fullName, position, rostered,
    relevant: scope === "priority", scope, scopeReasons,
    grade, actionable: grade === "complete", missing, invalid, notes,
    evaluation: invalid.length ? "invalid" : noOpportunity ? "inactive" : current ? "observed" : "baseline" };
}

/** Evidence requirements belong to the claim. A missing optional metric must not
 * prevent a baseline comparison, but cannot support an efficiency claim. */
export function assessDecisionReadiness(player: InSeasonPlayerSnapshot, purpose: DecisionPurpose, now = Date.now()) {
  const report = assessPlayerCoverage(player, now);
  const reasons = [...report.invalid];
  const warnings = [...report.notes];
  const evidence = player.evidence;
  const advanced = player.advancedUsage;
  const current = evidence?.week === completedGameEvidenceMeta.week && Boolean(evidence.source.trim())
    && Number.isFinite(Date.parse(evidence.capturedAt)) && now - Date.parse(evidence.capturedAt) <= 14 * 86_400_000
    && now - Date.parse(evidence.capturedAt) >= -86_400_000;
  if (player.player.positions[0] === "K") return { actionable: !reasons.length, reasons, warnings };
  if (!player.currentRole || player.currentRole === "unknown") warnings.push("Role context not confirmed");
  if (!player.injuryStatus || /unknown|^(NA|N\/A)$/i.test(player.injuryStatus)) warnings.push("Health status not confirmed");
  if (!current) warnings.push("Uses baseline value without current game observations");
  if (player.injuryStatus === "IR" && !player.projectedReturnDate) warnings.push("Return date unknown; use a range, not a precise return assumption");
  if (purpose === "trade") {
    if (!finite(player.marketRank) || player.marketRank <= 0) reasons.push("Trade price context missing");
    if (!current && player.injuryStatus !== "IR") reasons.push("Traded player needs current evidence or confirmed injured status");
  }
  if (purpose === "usage") {
    if (!current || !evidence?.boxScore || report.evaluation === "inactive") reasons.push("Usage claim requires current observed opportunities");
  }
  if (purpose === "receiving-efficiency" || purpose === "rushing-efficiency") {
    if (!current || advanced?.week !== evidence?.week || !advanced?.sources.length) reasons.push("Efficiency claim needs current sourced advanced data");
    if (purpose === "receiving-efficiency" && (!evidence?.routes || advanced?.statuses.routes !== "verified" || !finite(advanced?.routes) || advanced.routes <= 0 || !finite(advanced?.targetsPerRouteRun) || !finite(advanced?.yardsPerRouteRun))) reasons.push("Receiving efficiency needs verified routes and production");
    if (purpose === "receiving-efficiency" && (!finite(evidence?.observedTargets) || !finite(evidence?.observedReceivingYards))) reasons.push("Receiving efficiency requires the underlying targets and yards");
    if (purpose === "rushing-efficiency" && (advanced?.statuses.rushingYardsOverExpected !== "verified" || !finite(advanced?.rushingYardsOverExpectedPerAttempt) || !finite(evidence?.observedCarries) || evidence.observedCarries <= 0)) reasons.push("Rushing efficiency needs observed carries and verified RYOE");
    if (purpose === "rushing-efficiency" && !finite(advanced?.rushingYardsOverExpected)) reasons.push("Rushing efficiency requires total RYOE for audit");
  }
  if (purpose === "injury-opportunity") {
    if (player.injuryStatus === "IR") reasons.push("The successor is on injured reserve");
    const opportunity = player.injuryOpportunity;
    const age = opportunity ? now - Date.parse(opportunity.capturedAt) : NaN;
    if (!opportunity?.confirmed || !opportunity.successorVerified || !opportunity.source.trim() || !finite(age) || age < -86_400_000 || age > 7 * 86_400_000) reasons.push("Injury claim requires a fresh confirmed absence and verified successor");
  }
  if (purpose === "passing-efficiency" && (!current || advanced?.week !== evidence?.week || advanced?.statuses.quarterbackEnvironment !== "verified" || !finite(advanced?.cpoe) || !finite(advanced?.teamProe))) reasons.push("Passing efficiency requires current verified CPOE and passing environment");
  return { actionable: !reasons.length, reasons, warnings };
}

export function buildPlayerCoverageReport(players: InSeasonPlayerSnapshot[], now = Date.now(), options: CoverageOptions = {}) {
  const entries = players.map((player) => assessPlayerCoverage(player, now, { ...options, scoped: true }));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of entries) { if (seen.has(entry.playerId)) duplicates.add(entry.playerId); seen.add(entry.playerId); }
  for (const entry of entries) if (duplicates.has(entry.playerId)) {
    entry.grade = "blocked"; entry.evaluation = "invalid"; entry.actionable = false; entry.invalid.push("Duplicate canonical player identity");
  }
  const counts = { complete: 0, "baseline-only": 0, partial: 0, blocked: 0, "not-required": 0 };
  for (const entry of entries) counts[entry.grade] += 1;
  const gapCounts = new Map<string, number>();
  for (const entry of entries.filter((entry) => entry.scope === "priority")) {
    for (const gap of entry.missing) gapCounts.set(gap, (gapCounts.get(gap) ?? 0) + 1);
  }
  return { entries, counts, total: entries.length,
    priorityGaps: [...gapCounts].map(([gap, count]) => ({ gap, count })).sort((a, b) => b.count - a.count),
    priorityTotal: entries.filter((entry) => entry.scope === "priority").length,
    priorityComplete: entries.filter((entry) => entry.scope === "priority" && entry.grade === "complete").length,
    monitored: entries.filter((entry) => entry.scope === "monitor").length,
    kickers: entries.filter((entry) => entry.scope === "kicker").length,
    rostered: entries.filter((entry) => entry.rostered).length,
    rosteredReady: entries.filter((entry) => entry.rostered && entry.actionable).length,
    relevantFreeAgents: entries.filter((entry) => !entry.rostered && entry.relevant).length,
    relevantFreeAgentsReady: entries.filter((entry) => !entry.rostered && entry.relevant && entry.actionable).length };
}

export function coverageForDecision(players: InSeasonPlayerSnapshot[], playerIds: string[], purpose: DecisionPurpose = "valuation") {
  return createDecisionGate(players)(playerIds, purpose);
}

export function createDecisionGate(players: InSeasonPlayerSnapshot[]) {
  const byPlayerId = new Map(players.map((player) => [player.player.id, player]));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const player of players) { if (seen.has(player.player.id)) duplicates.add(player.player.id); seen.add(player.player.id); }
  const cache = new Map<string, ReturnType<typeof assessDecisionReadiness>>();
  return (playerIds: string[], purpose: DecisionPurpose = "valuation") => {
  const reasons = [...new Set(playerIds)].flatMap((id) => {
    const entry = byPlayerId.get(id);
    if (!entry) return [`${id}: absent from model`];
    if (duplicates.has(id)) return [`${entry.player.fullName}: Duplicate canonical player identity`];
    const key = `${id}:${purpose}`;
    if (!cache.has(key)) cache.set(key, assessDecisionReadiness(byPlayerId.get(id)!, purpose));
    const decision = cache.get(key)!;
    return decision.actionable ? [] : [`${entry.player.fullName}: ${decision.reasons.join("; ")}`];
  });
  return { actionable: reasons.length === 0, reasons };
  };
}

export function teamCoverageIds(teams: InSeasonTeamSnapshot[]) {
  return [...new Set(teams.flatMap((team) => team.playerIds))];
}
