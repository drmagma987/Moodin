import { parseCsv } from "@/lib/fantasy/csv";
import type {
  AdvancedResearchComponent,
  AdvancedResearchInput,
  AdvancedResearchSnapshot,
  DraftCandidate,
  PlayerPosition,
  QbAdvancedResearchInput,
  RookieAdvancedResearchInput,
} from "@/lib/fantasy/types";
import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import {
  normalizeNflversePlayerName,
  type NflversePlayerProfile,
} from "@/lib/fantasy/nflversePlayers";

const SUPPORTED_ROOKIE_POSITIONS = new Set<PlayerPosition>(["RB", "WR", "TE"]);

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function scale(value: number, low: number, high: number) {
  if (high <= low) return 0;
  return clamp(((value - low) / (high - low)) * 100);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validShare(value: unknown) {
  const parsed = readNumber(value);
  return parsed !== undefined && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function validNonNegative(value: unknown) {
  const parsed = readNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function parseInput(value: unknown): AdvancedResearchInput | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const playerName = typeof row.playerName === "string" ? row.playerName.trim() : "";
  const sources = Array.isArray(row.sources)
    ? row.sources.filter((source): source is AdvancedResearchInput["sources"][number] =>
        ["nflverse-pbp", "nflverse-players", "nfl-draft-tracker", "college-football-data", "sportsdataverse-cfbfastr", "sleeper-depth-chart", "win-with-odds", "manager-reviewed"].includes(String(source)),
      )
    : [];
  if (!playerName) return null;

  if (row.lane === "qb") {
    const season = readNumber(row.season);
    const dropbacks = readNumber(row.dropbacks);
    const designedRushShare = validShare(row.designedRushShare);
    const scrambleRate = validShare(row.scrambleRate);
    const epaPerDropback = readNumber(row.epaPerDropback);
    const cpoe = readNumber(row.cpoe);
    const passingTouchdownRate = validShare(row.passingTouchdownRate);
    if (season === undefined || dropbacks === undefined) return null;
    return {
      lane: "qb",
      playerId: typeof row.playerId === "string" ? row.playerId : undefined,
      playerName,
      season: season!,
      dropbacks: dropbacks!,
      designedRushShare,
      scrambleRate,
      epaPerDropback,
      cpoe,
      passingTouchdownRate,
      sources,
    };
  }

  const position = typeof row.position === "string" ? row.position.toUpperCase() : "";
  if (row.lane !== "rookie" || !["RB", "WR", "TE"].includes(position)) return null;
  return {
    lane: "rookie",
    playerId: typeof row.playerId === "string" ? row.playerId : undefined,
    playerName,
    position: position as RookieAdvancedResearchInput["position"],
    draftPick: readNumber(row.draftPick),
    collegeDominator: validShare(row.collegeDominator),
    breakoutAge: readNumber(row.breakoutAge),
    breakoutQualified: typeof row.breakoutQualified === "boolean" ? row.breakoutQualified : undefined,
    collegeTargetShare: validShare(row.collegeTargetShare),
    collegeScrimmageYardsShare: validShare(row.collegeScrimmageYardsShare),
    collegeTouchdownShare: validShare(row.collegeTouchdownShare),
    collegeBestSeasonYardsShare: validShare(row.collegeBestSeasonYardsShare),
    collegeFinalSeasonYardsShare: validShare(row.collegeFinalSeasonYardsShare),
    collegeRushAttempts: validNonNegative(row.collegeRushAttempts),
    collegeRushingYardsPerCarry: validNonNegative(row.collegeRushingYardsPerCarry),
    collegeRushingExplosiveRate: validShare(row.collegeRushingExplosiveRate),
    collegeRushingStuffAvoidanceRate: validShare(row.collegeRushingStuffAvoidanceRate),
    collegeRushingTeamYpcDelta: readNumber(row.collegeRushingTeamYpcDelta),
    collegeTargets: validNonNegative(row.collegeTargets),
    collegeCatchRate: validShare(row.collegeCatchRate),
    collegeReceivingYardsPerTarget: validNonNegative(row.collegeReceivingYardsPerTarget),
    collegeReceivingExplosiveRate: validShare(row.collegeReceivingExplosiveRate),
    collegeReceivingTeamYptDelta: readNumber(row.collegeReceivingTeamYptDelta),
    collegeTargetEpaPerTarget: readNumber(row.collegeTargetEpaPerTarget),
    collegeTargetSuccessRate: validShare(row.collegeTargetSuccessRate),
    collegeTargetFirstDownRate: validShare(row.collegeTargetFirstDownRate),
    collegeRedZoneTargetShare: validShare(row.collegeRedZoneTargetShare),
    collegeScoringOpportunityTargetShare: validShare(row.collegeScoringOpportunityTargetShare),
    collegeSeasons: Array.isArray(row.collegeSeasons)
      ? row.collegeSeasons.map(readNumber).filter((season): season is number => season !== undefined)
      : undefined,
    teamSituationScore: readNumber(row.teamSituationScore),
    teamSituationNotes: Array.isArray(row.teamSituationNotes)
      ? row.teamSituationNotes.filter((item): item is string => typeof item === "string")
      : undefined,
    sources,
  };
}

export function parseAdvancedResearchJson(raw: string | undefined) {
  if (!raw?.trim()) return { inputs: [] as AdvancedResearchInput[], errors: [] as string[] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { inputs: [], errors: ["Advanced research input must be a JSON array."] };
    const inputs = parsed.map(parseInput).filter((item): item is AdvancedResearchInput => item !== null);
    return {
      inputs,
      errors: inputs.length === parsed.length ? [] : [`Skipped ${parsed.length - inputs.length} invalid advanced research record(s).`],
    };
  } catch (error) {
    return { inputs: [], errors: [error instanceof Error ? error.message : "Invalid advanced research JSON."] };
  }
}

export function readAdvancedResearchInputsFromEnv() {
  return parseAdvancedResearchJson(process.env.FANTASY_ADVANCED_RESEARCH_JSON);
}

function situationScore(candidate: DraftCandidate, input: RookieAdvancedResearchInput) {
  if (input.teamSituationScore !== undefined) return clamp(input.teamSituationScore);
  const context = candidate.context;
  if (!context) return null;
  const role = {
    "locked-starter": 92,
    "projected-starter": 74,
    competition: 48,
    backup: 22,
    unknown: 40,
  }[context.currentRole];
  const environment = { strong: 10, neutral: 0, weak: -10, uncertain: -4 }[context.environment];
  return clamp(role + environment);
}

function draftCapitalScore(pick: number | undefined) {
  if (pick === undefined || pick <= 0) return null;
  return clamp((1 - Math.log(Math.min(pick, 257)) / Math.log(257)) * 100);
}

function weightedMean(parts: Array<{ score: number | null; weight: number }>) {
  const present = parts.filter((part): part is { score: number; weight: number } => part.score !== null);
  const weight = present.reduce((sum, part) => sum + part.weight, 0);
  return weight > 0 ? present.reduce((sum, part) => sum + part.score * part.weight, 0) / weight : null;
}

function shrinkRateScore(score: number | null, sample: number | undefined, fullSample: number) {
  if (score === null) return null;
  const reliability = clamp((sample ?? 0) / fullSample, 0, 1);
  return 50 + (score - 50) * reliability;
}

function rushingEfficiencyScore(input: RookieAdvancedResearchInput) {
  const raw = weightedMean([
    { score: input.collegeRushingYardsPerCarry === undefined ? null : scale(input.collegeRushingYardsPerCarry, 3.5, 7), weight: 0.3 },
    { score: input.collegeRushingExplosiveRate === undefined ? null : scale(input.collegeRushingExplosiveRate, 0.08, 0.25), weight: 0.25 },
    { score: input.collegeRushingStuffAvoidanceRate === undefined ? null : scale(input.collegeRushingStuffAvoidanceRate, 0.65, 0.88), weight: 0.2 },
    { score: input.collegeRushingTeamYpcDelta === undefined ? null : scale(input.collegeRushingTeamYpcDelta, -0.5, 2), weight: 0.25 },
  ]);
  return shrinkRateScore(raw, input.collegeRushAttempts, 180);
}

function receivingEfficiencyScore(input: RookieAdvancedResearchInput) {
  const raw = weightedMean([
    { score: input.collegeReceivingYardsPerTarget === undefined ? null : scale(input.collegeReceivingYardsPerTarget, 4, 11), weight: 0.24 },
    { score: input.collegeCatchRate === undefined ? null : scale(input.collegeCatchRate, 0.45, 0.82), weight: 0.12 },
    { score: input.collegeReceivingExplosiveRate === undefined ? null : scale(input.collegeReceivingExplosiveRate, 0.05, 0.22), weight: 0.14 },
    { score: input.collegeReceivingTeamYptDelta === undefined ? null : scale(input.collegeReceivingTeamYptDelta, -1.5, 3), weight: 0.1 },
    { score: input.collegeTargetEpaPerTarget === undefined ? null : scale(input.collegeTargetEpaPerTarget, -0.2, 0.8), weight: 0.16 },
    { score: input.collegeTargetSuccessRate === undefined ? null : scale(input.collegeTargetSuccessRate, 0.3, 0.65), weight: 0.1 },
    { score: input.collegeTargetFirstDownRate === undefined ? null : scale(input.collegeTargetFirstDownRate, 0.2, 0.55), weight: 0.08 },
    { score: input.collegeScoringOpportunityTargetShare === undefined ? null : scale(input.collegeScoringOpportunityTargetShare, 0.1, 0.4), weight: 0.06 },
  ]);
  return shrinkRateScore(raw, input.collegeTargets, 110);
}

function collegeOpportunityScore(input: RookieAdvancedResearchInput) {
  const low = 0.12;
  const high = input.position === "RB" ? 0.36 : 0.4;
  return weightedMean([
    { score: input.collegeBestSeasonYardsShare === undefined ? null : scale(input.collegeBestSeasonYardsShare, low, high), weight: 0.45 },
    { score: input.collegeFinalSeasonYardsShare === undefined ? null : scale(input.collegeFinalSeasonYardsShare, low, high), weight: 0.35 },
    { score: input.collegeTargetShare === undefined ? null : scale(input.collegeTargetShare, input.position === "RB" ? 0.03 : 0.12, input.position === "RB" ? 0.18 : 0.32), weight: 0.2 },
  ]);
}

function weightedSnapshot(
  lane: AdvancedResearchSnapshot["lane"],
  components: AdvancedResearchComponent[],
  criticalKeys: string[],
  nonDirectionalKeys: string[] = [],
) {
  const present = components.filter((component) => component.score !== null);
  const coverage = Number(present.reduce((sum, component) => sum + component.weight, 0).toFixed(2));
  const directional = present.filter((component) => !nonDirectionalKeys.includes(component.key));
  const directionalWeight = directional.reduce((sum, component) => sum + component.weight, 0);
  const researchScore = directionalWeight > 0
    ? Number((directional.reduce((sum, component) => sum + component.score! * component.weight, 0) / directionalWeight).toFixed(1))
    : null;
  const missingCritical = criticalKeys.filter((key) => !present.some((component) => component.key === key));
  const blockers = [
    ...missingCritical.map((key) => `Missing required ${key.replace(/-/g, " ")} evidence.`),
    ...(coverage < 0.7 ? [`Only ${Math.round(coverage * 100)}% of the research design is populated.`] : []),
    "Research has no ranking impact until its historical backtest clears activation criteria.",
  ];
  const status: AdvancedResearchSnapshot["status"] =
    coverage >= 0.85 && missingCritical.length === 0
      ? "backtest-ready"
      : coverage >= 0.45
        ? "partial"
        : "insufficient";
  return {
    lane,
    status,
    rankingImpact: "none" as const,
    researchScore,
    coverage,
    components,
    blockers,
    summary: `${lane.toUpperCase()} research profile is ${status.replace(/-/g, " ")} with ${Math.round(coverage * 100)}% metric coverage; it does not change projections or ranks.`,
  } satisfies AdvancedResearchSnapshot;
}

function qbSnapshot(input: QbAdvancedResearchInput) {
  const source = input.sources.includes("nflverse-pbp") ? "nflverse-pbp" as const : "manager-reviewed" as const;
  const rushingScore = input.designedRushShare === undefined || input.scrambleRate === undefined
    ? null
    : 0.65 * scale(input.designedRushShare, 0.01, 0.22) + 0.35 * scale(input.scrambleRate, 0.01, 0.13);
  const passingScore = input.epaPerDropback === undefined || input.cpoe === undefined
    ? null
    : 0.55 * scale(input.epaPerDropback, -0.15, 0.3) + 0.45 * scale(input.cpoe, -8, 8);
  const touchdownRegression = input.passingTouchdownRate === undefined
    ? null
    : clamp(50 - ((input.passingTouchdownRate - 0.045) / 0.04) * 50);
  return weightedSnapshot("qb", [
    { key: "rushing-baseline", label: "Designed rushing + scrambles", score: rushingScore, weight: 0.35, source: rushingScore === null ? "missing" : source, summary: rushingScore === null ? "Play-by-play designed-run and scramble splits are not populated." : `${(input.designedRushShare! * 100).toFixed(1)}% designed-rush share and ${(input.scrambleRate! * 100).toFixed(1)}% scramble rate.` },
    { key: "passing-efficiency", label: "EPA/dropback + CPOE", score: passingScore, weight: 0.35, source: passingScore === null ? "missing" : source, summary: passingScore === null ? "EPA/dropback and CPOE are not populated." : `${input.epaPerDropback!.toFixed(3)} EPA/dropback and ${input.cpoe!.toFixed(1)} CPOE.` },
    { key: "td-regression", label: "Passing TD regression", score: touchdownRegression, weight: 0.15, source: touchdownRegression === null ? "missing" : source, summary: touchdownRegression === null ? "Passing touchdown rate is not populated." : `${(input.passingTouchdownRate! * 100).toFixed(1)}% passing TD rate is centered on a 4.5% regression prior; unusually high rates point down and unusually low rates point up.` },
    { key: "sample", label: "Dropback sample", score: scale(input.dropbacks, 100, 550), weight: 0.15, source, summary: `${input.dropbacks} dropbacks in the ${input.season} evidence season.` },
  ], ["rushing-baseline", "passing-efficiency"], ["sample"]);
}

function rookieSnapshot(candidate: DraftCandidate, input: RookieAdvancedResearchInput) {
  const situation = situationScore(candidate, input);
  const source = input.sources.includes("sportsdataverse-cfbfastr")
    ? "sportsdataverse-cfbfastr" as const
    : input.sources.includes("college-football-data")
      ? "college-football-data" as const
      : "manager-reviewed" as const;
  const marketSource = candidate.seasonMarket?.stats;
  const situationSource = candidate.context?.source === "sleeper-depth-chart"
    ? "sleeper-depth-chart" as const
    : "manager-reviewed" as const;
  const situationSummary = input.teamSituationNotes?.join(" ") || candidate.context?.notes.join(" ") || "NFL role and offensive environment require review.";

  if (input.position === "RB") {
    const rushingEfficiency = rushingEfficiencyScore(input);
    const receivingEfficiency = receivingEfficiencyScore(input);
    const efficiency = weightedMean([
      { score: rushingEfficiency, weight: 0.75 },
      { score: receivingEfficiency, weight: 0.25 },
    ]);
    const opportunity = collegeOpportunityScore(input);
    const vegasRushYards = marketSource?.rushingYards;
    return weightedSnapshot("rookie-rb", [
      { key: "college-efficiency", label: "College efficiency", score: efficiency, weight: 0.35, source: efficiency === null ? "missing" : source, summary: efficiency === null ? "Per-carry and per-target efficiency evidence is missing." : `${input.collegeRushAttempts ?? 0} carries: ${input.collegeRushingYardsPerCarry?.toFixed(2) ?? "—"} YPC, ${input.collegeRushingExplosiveRate === undefined ? "—" : `${(input.collegeRushingExplosiveRate * 100).toFixed(1)}%`} explosive-run rate, ${input.collegeRushingTeamYpcDelta === undefined ? "—" : `${input.collegeRushingTeamYpcDelta >= 0 ? "+" : ""}${input.collegeRushingTeamYpcDelta.toFixed(2)}`} YPC versus other team rushers.` },
      { key: "college-opportunity", label: "College opportunity", score: opportunity, weight: 0.2, source: opportunity === null ? "missing" : source, summary: opportunity === null ? "Best-season, final-season, and target shares are missing." : `Best-season yardage share ${((input.collegeBestSeasonYardsShare ?? 0) * 100).toFixed(1)}%; final-season share ${((input.collegeFinalSeasonYardsShare ?? 0) * 100).toFixed(1)}%. This describes workload, not talent.` },
      { key: "nfl-situation", label: "NFL team situation", score: situation, weight: 0.2, source: situation === null ? "missing" : input.teamSituationScore === undefined ? "manager-reviewed" : source, summary: situationSummary },
      { key: "vegas-yardage", label: "Season rushing-yard market", score: vegasRushYards === undefined ? null : scale(vegasRushYards, 250, 1_150), weight: 0.15, source: vegasRushYards === undefined ? "missing" : "win-with-odds", summary: vegasRushYards === undefined ? "No season rushing-yard market is matched." : `${vegasRushYards.toFixed(0)} market-derived projected rushing yards; treated as an opportunity expectation, not a talent grade.` },
      { key: "draft-capital", label: "Draft capital", score: draftCapitalScore(input.draftPick), weight: 0.1, source: input.draftPick === undefined ? "missing" : input.sources.includes("nfl-draft-tracker") ? "nfl-draft-tracker" : input.sources.includes("nflverse-players") ? "nflverse-players" : source, summary: input.draftPick === undefined ? "Exact NFL draft pick is missing." : `Pick ${input.draftPick}; deliberately capped at 10% of the rookie RB research design.` },
    ], ["college-efficiency", "nfl-situation"]);
  }

  const receivingYards = marketSource?.receivingYards;
  const efficiency = receivingEfficiencyScore(input);
  const opportunity = collegeOpportunityScore(input);
  const breakout = input.breakoutAge !== undefined
    ? clamp(100 - scale(input.breakoutAge, 18, 23))
    : input.breakoutQualified === false
      ? 0
      : null;
  const lane = input.position === "WR" ? "rookie-wr" as const : "rookie-te" as const;
  return weightedSnapshot(lane, [
    { key: "college-efficiency", label: "College receiving efficiency", score: efficiency, weight: 0.3, source: efficiency === null ? "missing" : source, summary: efficiency === null ? "Per-target receiving efficiency evidence is missing." : `${input.collegeTargets ?? 0} targets: ${input.collegeReceivingYardsPerTarget?.toFixed(2) ?? "—"} yards/target, ${input.collegeCatchRate === undefined ? "—" : `${(input.collegeCatchRate * 100).toFixed(1)}%`} catch rate, ${input.collegeTargetEpaPerTarget === undefined ? "—" : `${input.collegeTargetEpaPerTarget >= 0 ? "+" : ""}${input.collegeTargetEpaPerTarget.toFixed(2)}`} EPA/target, ${input.collegeTargetSuccessRate === undefined ? "—" : `${(input.collegeTargetSuccessRate * 100).toFixed(1)}%`} success, ${input.collegeTargetFirstDownRate === undefined ? "—" : `${(input.collegeTargetFirstDownRate * 100).toFixed(1)}%`} first downs, ${input.collegeReceivingTeamYptDelta === undefined ? "—" : `${input.collegeReceivingTeamYptDelta >= 0 ? "+" : ""}${input.collegeReceivingTeamYptDelta.toFixed(2)}`} yards/target versus teammates.` },
    { key: "college-opportunity", label: "College opportunity", score: opportunity, weight: 0.15, source: opportunity === null ? "missing" : source, summary: opportunity === null ? "Best-season, final-season, and target shares are missing." : `Best-season yardage share ${((input.collegeBestSeasonYardsShare ?? 0) * 100).toFixed(1)}%; final-season share ${((input.collegeFinalSeasonYardsShare ?? 0) * 100).toFixed(1)}%. This describes workload, not talent.` },
    {
      key: "breakout-age",
      label: "Breakout age",
      score: breakout,
      weight: 0.1,
      source: breakout === null ? "missing" : source,
      summary: breakout === null
        ? "Age-adjusted breakout evidence is missing."
        : input.breakoutQualified === false
          ? "Observed college seasons did not produce a qualifying 20% receiving-yard or dominator breakout."
          : `First qualifying breakout at age ${input.breakoutAge}.`,
    },
    { key: "draft-capital", label: "Draft capital", score: draftCapitalScore(input.draftPick), weight: 0.2, source: input.draftPick === undefined ? "missing" : input.sources.includes("nfl-draft-tracker") ? "nfl-draft-tracker" : input.sources.includes("nflverse-players") ? "nflverse-players" : source, summary: input.draftPick === undefined ? "Exact NFL draft pick is missing." : `Selected at pick ${input.draftPick}.` },
    { key: "nfl-situation", label: "NFL team situation", score: situation, weight: 0.15, source: situation === null ? "missing" : situationSource, summary: situationSummary },
    { key: "vegas-yardage", label: "Season receiving-yard market", score: receivingYards === undefined ? null : scale(receivingYards, 250, 1_100), weight: 0.1, source: receivingYards === undefined ? "missing" : "win-with-odds", summary: receivingYards === undefined ? "No season receiving-yard market is matched." : `${receivingYards.toFixed(0)} market-derived projected receiving yards.` },
  ], ["college-efficiency", "nfl-situation"]);
}

export function applyAdvancedResearchSnapshots(candidates: DraftCandidate[], inputs: AdvancedResearchInput[]) {
  const byId = new Map(inputs.filter((input) => input.playerId).map((input) => [input.playerId!, input]));
  const byName = new Map(inputs.map((input) => [normalizeName(input.playerName), input]));
  let appliedCount = 0;
  const next = candidates.map((candidate) => {
    const input = byId.get(candidate.player.id) ?? byName.get(normalizeName(candidate.player.fullName));
    const position = candidate.player.positions[0];
    if (!input || (input.lane === "qb" && position !== "QB") || (input.lane === "rookie" && (input.position !== position || !SUPPORTED_ROOKIE_POSITIONS.has(position)))) return candidate;
    const snapshot = input.lane === "qb" ? qbSnapshot(input) : rookieSnapshot(candidate, input);
    appliedCount += 1;
    return { ...candidate, advancedResearch: snapshot } satisfies DraftCandidate;
  });
  return { candidates: next, appliedCount };
}

export function buildAutomaticAdvancedResearchInputs(input: {
  candidates: DraftCandidate[];
  playerProfiles: NflversePlayerProfile[];
  nflverseStats?: Map<string, NflversePlayerSeasonStats>;
  activeSeason: number;
  evidenceSeason: number;
}) {
  const byGsis = new Map(input.playerProfiles.map((profile) => [profile.gsisId, profile]));
  const byName = new Map(input.playerProfiles.map((profile) => [normalizeNflversePlayerName(profile.displayName), profile]));
  const outputs: AdvancedResearchInput[] = [];
  let rookieCount = 0;
  let qbCount = 0;
  for (const candidate of input.candidates) {
    const profile = candidate.player.externalIds.nflverse
      ? byGsis.get(candidate.player.externalIds.nflverse)
      : byName.get(normalizeNflversePlayerName(candidate.player.fullName));
    const position = candidate.player.positions[0];
    if (profile && profile.position === position && (profile.rookieSeason === input.activeSeason || profile.draftYear === input.activeSeason) && SUPPORTED_ROOKIE_POSITIONS.has(position)) {
      outputs.push({
        lane: "rookie",
        playerId: candidate.player.id,
        playerName: candidate.player.fullName,
        position: position as RookieAdvancedResearchInput["position"],
        draftPick: profile.draftPick ?? undefined,
        sources: ["nflverse-players"],
      });
      rookieCount += 1;
    }
    if (position === "QB") {
      const statsId = candidate.player.externalIds.nflverse ?? profile?.gsisId;
      const stats = statsId ? input.nflverseStats?.get(statsId) : undefined;
      if (!stats || stats.attempts <= 0) continue;
      outputs.push({
        lane: "qb",
        playerId: candidate.player.id,
        playerName: candidate.player.fullName,
        season: input.evidenceSeason,
        dropbacks: stats.attempts + (stats.sacksSuffered ?? 0),
        epaPerDropback: (stats.passingEpa ?? 0) / Math.max(1, stats.attempts + (stats.sacksSuffered ?? 0)),
        cpoe: stats.passingCpoe ?? 0,
        passingTouchdownRate: stats.passingTouchdowns / stats.attempts,
        sources: ["nflverse-pbp"],
      });
      qbCount += 1;
    }
  }
  return { inputs: outputs, rookieCount, qbCount };
}

export function mergeAdvancedResearchInputs(
  automatic: AdvancedResearchInput[],
  reviewed: AdvancedResearchInput[],
) {
  const merged = new Map<string, AdvancedResearchInput>();
  const key = (input: AdvancedResearchInput) => input.playerId || normalizeName(input.playerName);
  const keyByName = new Map<string, string>();
  for (const input of automatic) {
    const inputKey = key(input);
    merged.set(inputKey, input);
    keyByName.set(normalizeName(input.playerName), inputKey);
  }
  for (const input of reviewed) {
    const inputKey = input.playerId && merged.has(input.playerId)
      ? input.playerId
      : keyByName.get(normalizeName(input.playerName)) ?? key(input);
    const current = merged.get(inputKey);
    if (current?.lane === "rookie" && input.lane === "rookie") {
      merged.set(inputKey, { ...current, ...input, playerId: current.playerId ?? input.playerId, sources: [...new Set([...current.sources, ...input.sources])] });
    } else if (current?.lane === "qb" && input.lane === "qb") {
      merged.set(inputKey, { ...current, ...input, playerId: current.playerId ?? input.playerId, sources: [...new Set([...current.sources, ...input.sources])] });
    } else {
      merged.set(inputKey, input);
    }
    keyByName.set(normalizeName(input.playerName), inputKey);
  }
  return [...merged.values()];
}

export function aggregateQbResearchFromPbpCsv(csv: string, season: number) {
  const rows = parseCsv(csv);
  const qbIds = new Set(rows.map((row) => row.passer_player_id).filter(Boolean));
  const teamDesignedRushes = new Map<string, number>();
  const records = new Map<string, { name: string; team: string; dropbacks: number; epa: number; cpoe: number; cpoeN: number; attempts: number; passTds: number; scrambles: number; designedRushes: number }>();
  const get = (id: string, name: string, team: string) => {
    const current = records.get(id) ?? { name, team, dropbacks: 0, epa: 0, cpoe: 0, cpoeN: 0, attempts: 0, passTds: 0, scrambles: 0, designedRushes: 0 };
    records.set(id, current);
    return current;
  };
  for (const row of rows) {
    const team = row.posteam;
    const rush = row.rush_attempt === "1";
    const scramble = row.qb_scramble === "1";
    if (team && rush && !scramble) teamDesignedRushes.set(team, (teamDesignedRushes.get(team) ?? 0) + 1);
    const passerId = row.passer_player_id;
    if (passerId && row.qb_dropback === "1") {
      const record = get(passerId, row.passer_player_name || passerId, team);
      record.dropbacks += 1;
      record.epa += Number(row.epa) || 0;
      if (row.cpoe !== "") { record.cpoe += Number(row.cpoe) || 0; record.cpoeN += 1; }
      if (row.pass_attempt === "1") record.attempts += 1;
      if (row.pass_touchdown === "1") record.passTds += 1;
      if (scramble) record.scrambles += 1;
    }
    const rusherId = row.rusher_player_id;
    if (rusherId && rush && !scramble && qbIds.has(rusherId)) {
      get(rusherId, row.rusher_player_name || rusherId, team).designedRushes += 1;
    }
  }
  const inputs = new Map<string, QbAdvancedResearchInput>();
  for (const [id, record] of records) {
    if (record.dropbacks === 0) continue;
    inputs.set(id, {
      lane: "qb",
      playerId: id,
      playerName: record.name,
      season,
      dropbacks: record.dropbacks,
      designedRushShare: Number((record.designedRushes / Math.max(1, teamDesignedRushes.get(record.team) ?? 0)).toFixed(4)),
      scrambleRate: Number((record.scrambles / record.dropbacks).toFixed(4)),
      epaPerDropback: Number((record.epa / record.dropbacks).toFixed(4)),
      cpoe: Number((record.cpoe / Math.max(1, record.cpoeN)).toFixed(4)),
      passingTouchdownRate: Number((record.passTds / Math.max(1, record.attempts)).toFixed(4)),
      sources: ["nflverse-pbp"],
    });
  }
  return inputs;
}
