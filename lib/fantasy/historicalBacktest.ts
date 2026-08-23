import { buildRedraftBoard } from "@/lib/fantasy/draft";
import { buildDraftQuickScoreBoard } from "@/lib/fantasy/draftSignals";
import { calibrateDraftCandidates } from "@/lib/fantasy/projectionCalibration";
import { scoreStatProjection, yahooLeagueConfig, yahooLeagueRules } from "@/lib/fantasy/scoring";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "@/lib/fantasy/leagueSourceOfTruth";
import { parseCsv } from "@/lib/fantasy/csv";
import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { DraftCandidate, PlayerPosition, StatProjection } from "@/lib/fantasy/types";

const BACKTEST_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];
const FLEX_POSITIONS = new Set<PlayerPosition>(["RB", "WR", "TE"]);

export type HistoricalPlayerSeason = NflversePlayerSeasonStats & {
  stats: StatProjection;
  fantasyPointsCustom: number;
};

export type HistoricalBacktestPlayer = {
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  stockRank: number;
  modelRank: number;
  actualRank: number;
  rateRank: number | null;
  adp: number;
  ecr: number;
  games: number;
  actualPoints: number;
  ratePoints: number | null;
  actualVor: number;
  rateVor: number | null;
  action: string;
  modelVsStock: number;
  actualVsStock: number;
};

export type HistoricalBacktestSeasonReport = {
  season: number;
  preseasonCutoff: string;
  priorSeason: number;
  playerCount: number;
  matchedOutcomeCount: number;
  directAdpCount: number;
  metrics: {
    realized: ComparisonMetrics;
    availabilityAdjusted: ComparisonMetrics;
  };
  availability: {
    full: number;
    partial: number;
    low: number;
  };
  calls: Array<{
    action: string;
    players: number;
    meanActualVor: number;
    meanActualVsStock: number;
    beatStockRate: number;
  }>;
  biggestWins: HistoricalBacktestPlayer[];
  biggestMisses: HistoricalBacktestPlayer[];
  players: HistoricalBacktestPlayer[];
};

export type HistoricalBacktestReport = {
  generatedAt: string;
  methodologyVersion: string;
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  league: {
    name: string;
    teams: number;
    scoring: string;
  };
  caveats: string[];
  aggregate: {
    seasons: number;
    players: number;
    realizedModelSpearman: number;
    realizedStockSpearman: number;
    adjustedModelSpearman: number;
    adjustedStockSpearman: number;
    modelDisagreementWinRate: number;
    adjustedDisagreementWinRate: number;
    verdict: "promising" | "neutral" | "needs-work";
  };
  diagnostics: {
    positions: SegmentDiagnostic[];
    draftRanges: SegmentDiagnostic[];
    actions: ActionCalibrationDiagnostic[];
    uncertainty: {
      realizedRankMaeEdge: ConfidenceInterval;
      adjustedRankMaeEdge: ConfidenceInterval;
    };
    rosterSimulation: HistoricalRosterSimulationAudit;
    tuningSuggestions: TuningSuggestion[];
  };
  seasons: HistoricalBacktestSeasonReport[];
};

export function assertHistoricalBacktestReport(
  report: HistoricalBacktestReport,
) {
  if (report.leagueConfigVersion !== leagueSourceOfTruth.version) {
    throw new Error(
      `Historical report version ${report.leagueConfigVersion ?? "missing"} does not match ${leagueSourceOfTruth.version}.`,
    );
  }
  if (report.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    throw new Error(
      `Historical report fingerprint ${report.leagueConfigFingerprint ?? "missing"} does not match ${leagueSourceOfTruthFingerprint}.`,
    );
  }
  if (report.league.teams !== leagueSourceOfTruth.teams) {
    throw new Error(
      `Historical report team count ${report.league.teams} does not match ${leagueSourceOfTruth.teams}.`,
    );
  }
}

export type SegmentDiagnostic = {
  label: string;
  players: number;
  seasons: number;
  realizedModelSpearman: number;
  realizedStockSpearman: number;
  realizedEdge: number;
  adjustedModelSpearman: number;
  adjustedStockSpearman: number;
  adjustedEdge: number;
  realizedPositiveSeasons: number;
  adjustedPositiveSeasons: number;
};

export type ActionCalibrationDiagnostic = {
  action: string;
  players: number;
  seasonsRepresented: number;
  meanActualVor: number;
  meanActualVsStock: number;
  beatStockRate: number;
  positiveSeasons: number;
  verdict: "validated" | "directional" | "recalibrate" | "descriptive";
};

export type ConfidenceInterval = {
  estimate: number;
  lower95: number;
  upper95: number;
  interpretation: "model-edge" | "inconclusive" | "stock-edge";
};

export type TuningSuggestion = {
  priority: "keep" | "tune" | "shadow" | "data";
  title: string;
  evidence: string;
  recommendation: string;
};

export type HistoricalRosterSimulationAudit = {
  teams: number;
  rounds: number;
  simulations: number;
  stock: RosterStrategyOutcome;
  currentModel: RosterStrategyOutcome;
  proposedPocket: RosterStrategyOutcome;
  leaveOneSeasonOut: Array<{
    heldOutSeason: number;
    trainedFactor: number;
    currentRealizedPoints: number;
    proposedRealizedPoints: number;
    currentAdjustedPoints: number;
    proposedAdjustedPoints: number;
    heldOutWin: boolean;
  }>;
  positiveHeldouts: number;
  productionEligible: boolean;
  recommendation: string;
};

export type RosterStrategyOutcome = {
  label: string;
  averageRealizedStarterPoints: number;
  averageAdjustedStarterPoints: number;
  averageRosterVor: number;
  validRosterRate: number;
};

type FfcAdpPlayer = {
  name: string;
  position: PlayerPosition;
  adp: number;
};

type ComparisonMetrics = {
  modelSpearman: number;
  stockSpearman: number;
  modelRankMae: number;
  stockRankMae: number;
  modelTop48Hits: number;
  stockTop48Hits: number;
  disagreementCount: number;
  modelDisagreementWins: number;
  stockDisagreementWins: number;
  disagreementWinRate: number;
};

function numberValue(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeHistoricalPlayerName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function playerKey(name: string, position: PlayerPosition) {
  return `${normalizeHistoricalPlayerName(name)}:${position}`;
}

function asPosition(value: string | undefined): PlayerPosition | null {
  const position = value?.toUpperCase() as PlayerPosition | undefined;
  return position && BACKTEST_POSITIONS.includes(position) ? position : null;
}

export function parseFfcHistoricalAdp(json: string): FfcAdpPlayer[] {
  const payload = JSON.parse(json) as {
    players?: Array<{ name?: string; position?: string; adp?: number }>;
  };

  return (payload.players ?? [])
    .map((player) => {
      const position = asPosition(player.position);
      const adp = Number(player.adp);
      if (!player.name || !position || !Number.isFinite(adp) || adp <= 0) return null;
      return { name: player.name, position, adp };
    })
    .filter((player): player is FfcAdpPlayer => player !== null);
}

export function aggregateNflverseWeeklyStats(csv: string): Map<string, HistoricalPlayerSeason> {
  const rows = parseCsv(csv);
  const result = new Map<string, HistoricalPlayerSeason>();

  for (const row of rows) {
    if (row.season_type !== "REG") continue;
    const position = asPosition(row.position);
    const playerId = row.player_id;
    const playerName = row.player_display_name || row.player_name;
    if (!position || !playerId || !playerName) continue;

    const key = playerKey(playerName, position);
    const current = result.get(key) ?? {
      playerId,
      playerName,
      team: row.team ?? "FA",
      position,
      games: 0,
      attempts: 0,
      carries: 0,
      targets: 0,
      receptions: 0,
      passingYards: 0,
      rushingYards: 0,
      receivingYards: 0,
      passingTouchdowns: 0,
      rushingTouchdowns: 0,
      receivingTouchdowns: 0,
      targetShare: 0,
      airYardsShare: 0,
      fantasyPointsPpr: 0,
      passing300Games: 0,
      rushing100Games: 0,
      receiving100Games: 0,
      stats: {},
      fantasyPointsCustom: 0,
    } satisfies HistoricalPlayerSeason;

    const passingYards = numberValue(row.passing_yards);
    const rushingYards = numberValue(row.rushing_yards);
    const receivingYards = numberValue(row.receiving_yards);
    current.games += 1;
    current.team = row.team || current.team;
    current.attempts += numberValue(row.attempts);
    current.carries += numberValue(row.carries);
    current.targets += numberValue(row.targets);
    current.receptions += numberValue(row.receptions);
    current.passingYards += passingYards;
    current.rushingYards += rushingYards;
    current.receivingYards += receivingYards;
    current.passingTouchdowns += numberValue(row.passing_tds);
    current.rushingTouchdowns += numberValue(row.rushing_tds);
    current.receivingTouchdowns += numberValue(row.receiving_tds);
    current.targetShare += numberValue(row.target_share);
    current.airYardsShare += numberValue(row.air_yards_share);
    current.fantasyPointsPpr += numberValue(row.fantasy_points_ppr);
    current.passing300Games! += passingYards >= 300 ? 1 : 0;
    current.rushing100Games! += rushingYards >= 100 ? 1 : 0;
    current.receiving100Games! += receivingYards >= 100 ? 1 : 0;

    const add = (field: keyof StatProjection, value: number) => {
      current.stats[field] = (current.stats[field] ?? 0) + value;
    };
    add("passingYards", passingYards);
    add("passingTouchdowns", numberValue(row.passing_tds));
    add("interceptions", numberValue(row.passing_interceptions));
    add("rushingYards", rushingYards);
    add("rushingTouchdowns", numberValue(row.rushing_tds));
    add("receptions", numberValue(row.receptions));
    add("receivingYards", receivingYards);
    add("receivingTouchdowns", numberValue(row.receiving_tds));
    add("returnTouchdowns", numberValue(row.special_teams_tds));
    add("fumblesLost", numberValue(row.fumbles_lost_total));
    add(
      "twoPointConversions",
      numberValue(row.passing_2pt_conversions) +
        numberValue(row.rushing_2pt_conversions) +
        numberValue(row.receiving_2pt_conversions),
    );
    result.set(key, current);
  }

  for (const item of result.values()) {
    item.targetShare = item.games ? item.targetShare / item.games : 0;
    item.airYardsShare = item.games ? item.airYardsShare / item.games : 0;
    item.stats.passing300Games = item.passing300Games;
    item.stats.rushing100Games = item.rushing100Games;
    item.stats.receiving100Games = item.receiving100Games;
    item.fantasyPointsCustom = scoreStatProjection(item.stats, yahooLeagueRules, {
      explicitMilestoneGamesOnly: true,
    });
  }

  return result;
}

function rankMap<T>(items: T[], score: (item: T) => number) {
  return new Map(
    [...items]
      .sort((a, b) => score(b) - score(a))
      .map((item, index) => [item, index + 1] as const),
  );
}

function replacementDemand(candidates: DraftCandidate[], teamCount: number) {
  const demand: Record<string, number> = {
    QB: teamCount,
    RB: teamCount * 2,
    WR: teamCount * 3,
    TE: teamCount,
  };
  const flexPool = candidates
    .filter((candidate) => FLEX_POSITIONS.has(candidate.player.positions[0] ?? "WR"))
    .filter((candidate) => {
      const position = candidate.player.positions[0] ?? "WR";
      const positionRank = candidates
        .filter((other) => other.player.positions[0] === position)
        .sort((a, b) => a.market.adp - b.market.adp)
        .findIndex((other) => other.player.id === candidate.player.id) + 1;
      return positionRank > (demand[position] ?? 0);
    })
    .sort((a, b) => a.market.adp - b.market.adp)
    .slice(0, teamCount * 2);
  for (const candidate of flexPool) {
    const position = candidate.player.positions[0] ?? "WR";
    demand[position] = (demand[position] ?? 0) + 1;
  }
  return demand;
}

function spearman(predicted: number[], actual: number[]) {
  if (predicted.length < 2 || predicted.length !== actual.length) return 0;
  const sum = predicted.reduce((total, value, index) => total + (value - actual[index]) ** 2, 0);
  return Number((1 - (6 * sum) / (predicted.length * (predicted.length ** 2 - 1))).toFixed(3));
}

function comparisonMetrics(
  players: HistoricalBacktestPlayer[],
  actualRankField: "actualRank" | "rateRank",
): ComparisonMetrics {
  const eligible = players.filter((player) => player[actualRankField] !== null);
  const modelEvaluationRank = new Map(
    [...eligible]
      .sort((a, b) => a.modelRank - b.modelRank)
      .map((player, index) => [player.playerId, index + 1] as const),
  );
  const stockEvaluationRank = new Map(
    [...eligible]
      .sort((a, b) => a.stockRank - b.stockRank)
      .map((player, index) => [player.playerId, index + 1] as const),
  );
  const actualRanks = eligible.map((player) => player[actualRankField] as number);
  const modelRanks = eligible.map((player) => modelEvaluationRank.get(player.playerId)!);
  const stockRanks = eligible.map((player) => stockEvaluationRank.get(player.playerId)!);
  const disagreements = eligible.filter(
    (player) =>
      Math.abs(
        modelEvaluationRank.get(player.playerId)! - stockEvaluationRank.get(player.playerId)!,
      ) >= 6,
  );
  let modelWins = 0;
  let stockWins = 0;
  for (const player of disagreements) {
    const actual = player[actualRankField] as number;
    const modelError = Math.abs(modelEvaluationRank.get(player.playerId)! - actual);
    const stockError = Math.abs(stockEvaluationRank.get(player.playerId)! - actual);
    if (modelError < stockError) modelWins += 1;
    if (stockError < modelError) stockWins += 1;
  }

  const top48 = new Set(
    [...eligible]
      .sort((a, b) => (a[actualRankField] as number) - (b[actualRankField] as number))
      .slice(0, 48)
      .map((player) => player.playerId),
  );
  const predictedHits = (ranks: Map<string, number>) =>
    eligible.filter((player) => ranks.get(player.playerId)! <= 48 && top48.has(player.playerId)).length;
  const mae = (ranks: number[]) => Number(
    (ranks.reduce((sum, rank, index) => sum + Math.abs(rank - actualRanks[index]), 0) / Math.max(1, ranks.length)).toFixed(2),
  );

  return {
    modelSpearman: spearman(modelRanks, actualRanks),
    stockSpearman: spearman(stockRanks, actualRanks),
    modelRankMae: mae(modelRanks),
    stockRankMae: mae(stockRanks),
    modelTop48Hits: predictedHits(modelEvaluationRank),
    stockTop48Hits: predictedHits(stockEvaluationRank),
    disagreementCount: disagreements.length,
    modelDisagreementWins: modelWins,
    stockDisagreementWins: stockWins,
    disagreementWinRate: Number((modelWins / Math.max(1, modelWins + stockWins)).toFixed(3)),
  };
}

function segmentCorrelation(
  players: HistoricalBacktestPlayer[],
  outcomeField: "actualVor" | "rateVor",
) {
  const eligible = players.filter((player) => player[outcomeField] !== null);
  if (eligible.length < 3) return null;
  const modelRanks = rankMap(eligible, (player) => -player.modelRank);
  const stockRanks = rankMap(eligible, (player) => -player.stockRank);
  const outcomeRanks = rankMap(eligible, (player) => player[outcomeField] as number);
  return {
    players: eligible.length,
    model: spearman(
      eligible.map((player) => modelRanks.get(player)!),
      eligible.map((player) => outcomeRanks.get(player)!),
    ),
    stock: spearman(
      eligible.map((player) => stockRanks.get(player)!),
      eligible.map((player) => outcomeRanks.get(player)!),
    ),
  };
}

function buildSegmentDiagnostic(
  seasons: HistoricalBacktestSeasonReport[],
  label: string,
  predicate: (player: HistoricalBacktestPlayer) => boolean,
): SegmentDiagnostic {
  const realized = seasons
    .map((season) => segmentCorrelation(season.players.filter(predicate), "actualVor"))
    .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
  const adjusted = seasons
    .map((season) => segmentCorrelation(season.players.filter(predicate), "rateVor"))
    .filter((metric): metric is NonNullable<typeof metric> => metric !== null);
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const realizedModel = mean(realized.map((metric) => metric.model));
  const realizedStock = mean(realized.map((metric) => metric.stock));
  const adjustedModel = mean(adjusted.map((metric) => metric.model));
  const adjustedStock = mean(adjusted.map((metric) => metric.stock));

  return {
    label,
    players: seasons.reduce(
      (sum, season) => sum + season.players.filter(predicate).length,
      0,
    ),
    seasons: realized.length,
    realizedModelSpearman: Number(realizedModel.toFixed(3)),
    realizedStockSpearman: Number(realizedStock.toFixed(3)),
    realizedEdge: Number((realizedModel - realizedStock).toFixed(3)),
    adjustedModelSpearman: Number(adjustedModel.toFixed(3)),
    adjustedStockSpearman: Number(adjustedStock.toFixed(3)),
    adjustedEdge: Number((adjustedModel - adjustedStock).toFixed(3)),
    realizedPositiveSeasons: realized.filter((metric) => metric.model > metric.stock).length,
    adjustedPositiveSeasons: adjusted.filter((metric) => metric.model > metric.stock).length,
  };
}

function actionCalibration(
  seasons: HistoricalBacktestSeasonReport[],
): ActionCalibrationDiagnostic[] {
  const actions = ["Smash", "Target", "Fair", "Pass", "Avoid"];
  return actions.map((action) => {
    const players = seasons.flatMap((season) =>
      season.players.filter((player) => player.action === action),
    );
    const seasonMeans = seasons
      .map((season) => {
        const group = season.players.filter((player) => player.action === action);
        return group.length
          ? group.reduce((sum, player) => sum + player.actualVsStock, 0) / group.length
          : null;
      })
      .filter((value): value is number => value !== null);
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const positiveSeasons = seasonMeans.filter((value) => value > 0).length;
    const positiveAction = action === "Smash" || action === "Target";
    const verdict = positiveAction
      ? positiveSeasons === seasons.length && players.length >= 30
        ? "validated"
        : positiveSeasons >= 2
          ? "directional"
          : "recalibrate"
      : "descriptive";

    return {
      action,
      players: players.length,
      seasonsRepresented: seasonMeans.length,
      meanActualVor: Number(mean(players.map((player) => player.actualVor)).toFixed(2)),
      meanActualVsStock: Number(mean(players.map((player) => player.actualVsStock)).toFixed(2)),
      beatStockRate: Number(
        (players.filter((player) => player.actualVsStock > 0).length / Math.max(1, players.length)).toFixed(3),
      ),
      positiveSeasons,
      verdict,
    } satisfies ActionCalibrationDiagnostic;
  });
}

function rankMaeEdges(
  season: HistoricalBacktestSeasonReport,
  outcomeField: "actualRank" | "rateRank",
) {
  const eligible = season.players.filter((player) => player[outcomeField] !== null);
  const modelRanks = new Map(
    [...eligible]
      .sort((a, b) => a.modelRank - b.modelRank)
      .map((player, index) => [player.playerId, index + 1] as const),
  );
  const stockRanks = new Map(
    [...eligible]
      .sort((a, b) => a.stockRank - b.stockRank)
      .map((player, index) => [player.playerId, index + 1] as const),
  );
  return eligible.map((player) => {
    const actualRank = player[outcomeField] as number;
    return (
      Math.abs(stockRanks.get(player.playerId)! - actualRank) -
      Math.abs(modelRanks.get(player.playerId)! - actualRank)
    );
  });
}

function bootstrapMeanInterval(groups: number[][], seed: number): ConfidenceInterval {
  const allValues = groups.flat();
  const estimate = allValues.reduce((sum, value) => sum + value, 0) / Math.max(1, allValues.length);
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const samples: number[] = [];
  for (let iteration = 0; iteration < 2_000; iteration += 1) {
    let total = 0;
    let count = 0;
    for (const group of groups) {
      for (let index = 0; index < group.length; index += 1) {
        total += group[Math.floor(random() * group.length)] ?? 0;
        count += 1;
      }
    }
    samples.push(total / Math.max(1, count));
  }
  samples.sort((a, b) => a - b);
  const lower95 = samples[Math.floor(samples.length * 0.025)] ?? 0;
  const upper95 = samples[Math.floor(samples.length * 0.975)] ?? 0;
  return {
    estimate: Number(estimate.toFixed(2)),
    lower95: Number(lower95.toFixed(2)),
    upper95: Number(upper95.toFixed(2)),
    interpretation: lower95 > 0 ? "model-edge" : upper95 < 0 ? "stock-edge" : "inconclusive",
  };
}

type HistoricalDraftRoster = {
  playerIds: string[];
  counts: Partial<Record<PlayerPosition, number>>;
};

function historicalDraftScore(
  player: HistoricalBacktestPlayer,
  strategy: "stock" | "model" | "pocket",
  round: number,
  pocketFactor: number,
) {
  if (strategy === "stock") return player.stockRank;
  if (strategy === "pocket" && round >= 4 && round <= 10) {
    return player.modelRank - pocketFactor * (player.stockRank - player.modelRank);
  }
  return player.modelRank;
}

function chooseHistoricalDraftPlayer(args: {
  available: HistoricalBacktestPlayer[];
  roster: HistoricalDraftRoster;
  strategy: "stock" | "model" | "pocket";
  round: number;
  roundsRemaining: number;
  pocketFactor: number;
}) {
  const minimums: Partial<Record<PlayerPosition, number>> = { QB: 1, RB: 2, WR: 3, TE: 1 };
  const maximums: Partial<Record<PlayerPosition, number>> = { QB: 2, RB: 5, WR: 6, TE: 2 };
  const missing = BACKTEST_POSITIONS.filter(
    (position) => (args.roster.counts[position] ?? 0) < (minimums[position] ?? 0),
  );
  const missingPicks = missing.reduce(
    (sum, position) => sum + (minimums[position] ?? 0) - (args.roster.counts[position] ?? 0),
    0,
  );
  const mustFill = args.roundsRemaining <= missingPicks;
  const eligible = args.available.filter((player) => {
    if ((args.roster.counts[player.position] ?? 0) >= (maximums[player.position] ?? 99)) return false;
    return !mustFill || missing.includes(player.position);
  });

  return [...eligible].sort((a, b) => {
    const penalty = (player: HistoricalBacktestPlayer) => {
      const count = args.roster.counts[player.position] ?? 0;
      if (player.position === "QB" && count >= 1) return 45;
      if (player.position === "TE" && count >= 1) return 34;
      if (player.position === "RB" && count >= 2) return (count - 1) * 7;
      if (player.position === "WR" && count >= 3) return (count - 2) * 6;
      return 0;
    };
    return (
      historicalDraftScore(a, args.strategy, args.round, args.pocketFactor) + penalty(a) -
      historicalDraftScore(b, args.strategy, args.round, args.pocketFactor) - penalty(b)
    );
  })[0] ?? null;
}

function starterPoints(
  roster: HistoricalBacktestPlayer[],
  field: "actualPoints" | "ratePoints",
) {
  const points = (player: HistoricalBacktestPlayer) =>
    field === "ratePoints" ? player.ratePoints ?? player.actualPoints : player.actualPoints;
  const take = (position: PlayerPosition, count: number) =>
    roster
      .filter((player) => player.position === position)
      .sort((a, b) => points(b) - points(a))
      .slice(0, count);
  const fixed = [
    ...take("QB", 1),
    ...take("RB", 2),
    ...take("WR", 3),
    ...take("TE", 1),
  ];
  const used = new Set(fixed.map((player) => player.playerId));
  const flex = roster
    .filter((player) => FLEX_POSITIONS.has(player.position) && !used.has(player.playerId))
    .sort((a, b) => points(b) - points(a))
    .slice(0, 2);
  return [...fixed, ...flex].reduce((sum, player) => sum + points(player), 0);
}

function simulateHistoricalDraftSeason(
  season: HistoricalBacktestSeasonReport,
  userStrategy: "stock" | "model" | "pocket",
  pocketFactor = 0,
) {
  const teamCount = yahooLeagueConfig.teams;
  const rounds = 12;
  const outcomes: Array<{ realized: number; adjusted: number; vor: number; valid: boolean }> = [];
  for (let userSlot = 1; userSlot <= teamCount; userSlot += 1) {
    const rosters: HistoricalDraftRoster[] = Array.from({ length: teamCount }, () => ({
      playerIds: [],
      counts: {},
    }));
    const available = new Map(season.players.map((player) => [player.playerId, player] as const));
    for (let overallPick = 1; overallPick <= teamCount * rounds; overallPick += 1) {
      const round = Math.ceil(overallPick / teamCount);
      const pickInRound = ((overallPick - 1) % teamCount) + 1;
      const teamNumber = round % 2 === 1 ? pickInRound : teamCount + 1 - pickInRound;
      const roster = rosters[teamNumber - 1];
      const player = chooseHistoricalDraftPlayer({
        available: [...available.values()],
        roster,
        strategy: teamNumber === userSlot ? userStrategy : "stock",
        round,
        roundsRemaining: rounds + 1 - round,
        pocketFactor,
      });
      if (!player) continue;
      roster.playerIds.push(player.playerId);
      roster.counts[player.position] = (roster.counts[player.position] ?? 0) + 1;
      available.delete(player.playerId);
    }
    const userRoster = rosters[userSlot - 1];
    const players = userRoster.playerIds
      .map((playerId) => season.players.find((player) => player.playerId === playerId))
      .filter((player): player is HistoricalBacktestPlayer => Boolean(player));
    const valid =
      (userRoster.counts.QB ?? 0) >= 1 &&
      (userRoster.counts.RB ?? 0) >= 2 &&
      (userRoster.counts.WR ?? 0) >= 3 &&
      (userRoster.counts.TE ?? 0) >= 1;
    outcomes.push({
      realized: starterPoints(players, "actualPoints"),
      adjusted: starterPoints(players, "ratePoints"),
      vor: players.reduce((sum, player) => sum + player.actualVor, 0),
      valid,
    });
  }
  const mean = (field: "realized" | "adjusted" | "vor") =>
    outcomes.reduce((sum, outcome) => sum + outcome[field], 0) / Math.max(1, outcomes.length);
  return {
    realized: mean("realized"),
    adjusted: mean("adjusted"),
    vor: mean("vor"),
    validRate: outcomes.filter((outcome) => outcome.valid).length / Math.max(1, outcomes.length),
  };
}

function buildHistoricalRosterSimulation(
  seasons: HistoricalBacktestSeasonReport[],
): HistoricalRosterSimulationAudit {
  const factors = [0, 0.15, 0.3, 0.45];
  const bySeason = new Map<number, {
    stock: ReturnType<typeof simulateHistoricalDraftSeason>;
    model: ReturnType<typeof simulateHistoricalDraftSeason>;
    factors: Map<number, ReturnType<typeof simulateHistoricalDraftSeason>>;
  }>();
  for (const season of seasons) {
    bySeason.set(season.season, {
      stock: simulateHistoricalDraftSeason(season, "stock"),
      model: simulateHistoricalDraftSeason(season, "model"),
      factors: new Map(
        factors.map((factor) => [factor, simulateHistoricalDraftSeason(season, "pocket", factor)] as const),
      ),
    });
  }
  const leaveOneSeasonOut = seasons.map((heldOut) => {
    const training = seasons.filter((season) => season.season !== heldOut.season);
    const trainedFactor = [...factors].sort((a, b) => {
      const score = (factor: number) => training.reduce((sum, season) => {
        const outcome = bySeason.get(season.season)!.factors.get(factor)!;
        return sum + outcome.realized + outcome.adjusted;
      }, 0);
      return score(b) - score(a);
    })[0];
    const heldOutCurrent = bySeason.get(heldOut.season)!.model;
    const heldOutProposed = bySeason.get(heldOut.season)!.factors.get(trainedFactor)!;
    return {
      heldOutSeason: heldOut.season,
      trainedFactor,
      currentRealizedPoints: Number(heldOutCurrent.realized.toFixed(1)),
      proposedRealizedPoints: Number(heldOutProposed.realized.toFixed(1)),
      currentAdjustedPoints: Number(heldOutCurrent.adjusted.toFixed(1)),
      proposedAdjustedPoints: Number(heldOutProposed.adjusted.toFixed(1)),
      heldOutWin:
        heldOutProposed.realized + heldOutProposed.adjusted >
        heldOutCurrent.realized + heldOutCurrent.adjusted,
    };
  });
  const positiveHeldouts = leaveOneSeasonOut.filter((outcome) => outcome.heldOutWin).length;
  const trainedFactors = leaveOneSeasonOut.map((outcome) => outcome.trainedFactor).sort((a, b) => a - b);
  const proposedFactor = trainedFactors[1] ?? 0;
  const aggregate = (
    label: string,
    selector: (season: HistoricalBacktestSeasonReport) => ReturnType<typeof simulateHistoricalDraftSeason>,
  ): RosterStrategyOutcome => {
    const outcomes = seasons.map(selector);
    const mean = (read: (outcome: typeof outcomes[number]) => number) =>
      outcomes.reduce((sum, outcome) => sum + read(outcome), 0) / Math.max(1, outcomes.length);
    return {
      label,
      averageRealizedStarterPoints: Number(mean((outcome) => outcome.realized).toFixed(1)),
      averageAdjustedStarterPoints: Number(mean((outcome) => outcome.adjusted).toFixed(1)),
      averageRosterVor: Number(mean((outcome) => outcome.vor).toFixed(1)),
      validRosterRate: Number(mean((outcome) => outcome.validRate).toFixed(3)),
    };
  };

  return {
    teams: yahooLeagueConfig.teams,
    rounds: 12,
    simulations: seasons.length * yahooLeagueConfig.teams * (2 + factors.length),
    stock: aggregate("Stock ADP", (season) => bySeason.get(season.season)!.stock),
    currentModel: aggregate("Current model", (season) => bySeason.get(season.season)!.model),
    proposedPocket: aggregate(
      `Pocket factor ${proposedFactor.toFixed(2)}`,
      (season) => bySeason.get(season.season)!.factors.get(proposedFactor)!,
    ),
    leaveOneSeasonOut,
    positiveHeldouts,
    productionEligible: positiveHeldouts >= 2 && proposedFactor > 0,
    recommendation: positiveHeldouts >= 2 && proposedFactor > 0
      ? `The ${proposedFactor.toFixed(2)} middle-round authority factor passed ${positiveHeldouts} of ${seasons.length} held-out seasons and is eligible for live shadow testing.`
      : `No middle-round authority factor cleared the two-of-three held-out gate; keep the current ranking order in production.`,
  };
}

export function runHistoricalSeasonBacktest(args: {
  season: number;
  preseasonCutoff: string;
  candidates: DraftCandidate[];
  ffcAdp: FfcAdpPlayer[];
  priorStats: Map<string, HistoricalPlayerSeason>;
  outcomeStats: Map<string, HistoricalPlayerSeason>;
}): HistoricalBacktestSeasonReport {
  const adpByKey = new Map(args.ffcAdp.map((player) => [playerKey(player.name, player.position), player.adp]));
  const pool = args.candidates
    .reduce<DraftCandidate[]>((items, candidate) => {
      const position = candidate.player.positions[0];
      if (!position || !BACKTEST_POSITIONS.includes(position)) return items;
      const key = playerKey(candidate.player.fullName, position);
      const adp = adpByKey.get(key);
      if (!adp || adp > 220) return items;
      const prior = args.priorStats.get(key);
      items.push({
        ...candidate,
        player: {
          ...candidate.player,
          externalIds: {
            ...candidate.player.externalIds,
            ...(prior ? { nflverse: prior.playerId } : {}),
          },
        },
        market: {
          ...candidate.market,
          adp,
          adpSource: "direct" as const,
          adpProvider: "fantasy-football-calculator",
        },
        projection: {
          ...candidate.projection,
          season: args.season,
          asOf: args.preseasonCutoff,
        },
      });
      return items;
    }, [])
    .sort((a, b) => a.market.adp - b.market.adp);

  const priorById = new Map([...args.priorStats.values()].map((stats) => [stats.playerId, stats]));
  const calibrated = calibrateDraftCandidates(pool, yahooLeagueRules, {
    nflverseByPlayerId: priorById,
    useQualitativeContext: false,
  });
  const board = buildRedraftBoard(calibrated, yahooLeagueConfig);
  const quickScores = buildDraftQuickScoreBoard(calibrated, board);
  const boardById = new Map(board.map((entry) => [entry.playerId, entry]));
  const demand = replacementDemand(calibrated, yahooLeagueConfig.teams);
  const matched = calibrated.reduce<Array<{ candidate: DraftCandidate; outcome: HistoricalPlayerSeason }>>(
    (items, candidate) => {
      const outcome = args.outcomeStats.get(
        playerKey(candidate.player.fullName, candidate.player.positions[0] ?? "WR"),
      );
      if (outcome) items.push({ candidate, outcome });
      return items;
    },
    [],
  );

  const actualBaselines = new Map<PlayerPosition, number>();
  const rateBaselines = new Map<PlayerPosition, number>();
  for (const position of BACKTEST_POSITIONS) {
    const samePosition = matched.filter((item) => item.candidate.player.positions[0] === position);
    const replacement = demand[position] ?? 0;
    actualBaselines.set(
      position,
      [...samePosition].sort((a, b) => b.outcome.fantasyPointsCustom - a.outcome.fantasyPointsCustom)[replacement]?.outcome.fantasyPointsCustom ?? 0,
    );
    const rateReplacement = [...samePosition]
      .filter((item) => item.outcome.games >= 6)
      .sort((a, b) => (b.outcome.fantasyPointsCustom / b.outcome.games) - (a.outcome.fantasyPointsCustom / a.outcome.games))[replacement];
    rateBaselines.set(
      position,
      rateReplacement
        ? (rateReplacement.outcome.fantasyPointsCustom / rateReplacement.outcome.games) * 17
        : 0,
    );
  }

  const actualRankByItem = rankMap(matched, (item) =>
    item.outcome.fantasyPointsCustom - (actualBaselines.get(item.candidate.player.positions[0] ?? "WR") ?? 0));
  const rateEligible = matched.filter((item) => item.outcome.games >= 6);
  const rateRankByItem = rankMap(rateEligible, (item) => {
    const rate = (item.outcome.fantasyPointsCustom / item.outcome.games) * 17;
    return rate - (rateBaselines.get(item.candidate.player.positions[0] ?? "WR") ?? 0);
  });
  const stockRankByItem = new Map(
    [...matched]
      .sort((a, b) => a.candidate.market.adp - b.candidate.market.adp)
      .map((item, index) => [item, index + 1] as const),
  );
  const modelRankByItem = new Map(
    [...matched]
      .sort(
        (a, b) =>
          (boardById.get(a.candidate.player.id)?.boardRank ?? 999) -
          (boardById.get(b.candidate.player.id)?.boardRank ?? 999),
      )
      .map((item, index) => [item, index + 1] as const),
  );

  const players = matched.map((item) => {
    const position = item.candidate.player.positions[0] ?? "WR";
    const ratePoints = item.outcome.games >= 6
      ? Number(((item.outcome.fantasyPointsCustom / item.outcome.games) * 17).toFixed(2))
      : null;
    const actualRank = actualRankByItem.get(item)!;
    const stockRank = stockRankByItem.get(item)!;
    const modelRank = modelRankByItem.get(item)!;
    return {
      playerId: item.candidate.player.id,
      playerName: item.candidate.player.fullName,
      position,
      stockRank,
      modelRank,
      actualRank,
      rateRank: rateRankByItem.get(item) ?? null,
      adp: item.candidate.market.adp,
      ecr: item.candidate.market.ecr,
      games: item.outcome.games,
      actualPoints: item.outcome.fantasyPointsCustom,
      ratePoints,
      actualVor: Number((item.outcome.fantasyPointsCustom - (actualBaselines.get(position) ?? 0)).toFixed(2)),
      rateVor: ratePoints === null ? null : Number((ratePoints - (rateBaselines.get(position) ?? 0)).toFixed(2)),
      action: quickScores.get(item.candidate.player.id)?.action ?? "Fair",
      modelVsStock: stockRank - modelRank,
      actualVsStock: stockRank - actualRank,
    } satisfies HistoricalBacktestPlayer;
  });

  const calls = [...new Set(players.map((player) => player.action))].map((action) => {
    const group = players.filter((player) => player.action === action);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    return {
      action,
      players: group.length,
      meanActualVor: Number(mean(group.map((player) => player.actualVor)).toFixed(2)),
      meanActualVsStock: Number(mean(group.map((player) => player.actualVsStock)).toFixed(2)),
      beatStockRate: Number((group.filter((player) => player.actualVsStock > 0).length / Math.max(1, group.length)).toFixed(3)),
    };
  });

  const sortedByModelValue = [...players].sort((a, b) =>
    (b.modelVsStock * b.actualVsStock) - (a.modelVsStock * a.actualVsStock));
  return {
    season: args.season,
    preseasonCutoff: args.preseasonCutoff,
    priorSeason: args.season - 1,
    playerCount: pool.length,
    matchedOutcomeCount: players.length,
    directAdpCount: pool.length,
    metrics: {
      realized: comparisonMetrics(players, "actualRank"),
      availabilityAdjusted: comparisonMetrics(players, "rateRank"),
    },
    availability: {
      full: players.filter((player) => player.games >= 15).length,
      partial: players.filter((player) => player.games >= 12 && player.games < 15).length,
      low: players.filter((player) => player.games < 12).length,
    },
    calls,
    biggestWins: sortedByModelValue.slice(0, 8),
    biggestMisses: sortedByModelValue.slice(-8).reverse(),
    players,
  };
}

export function buildHistoricalBacktestReport(
  seasons: HistoricalBacktestSeasonReport[],
  generatedAt = new Date().toISOString(),
): HistoricalBacktestReport {
  const average = (values: number[]) => Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(3));
  const disagreementWins = seasons.reduce((sum, season) => sum + season.metrics.realized.modelDisagreementWins, 0);
  const disagreementLosses = seasons.reduce((sum, season) => sum + season.metrics.realized.stockDisagreementWins, 0);
  const adjustedWins = seasons.reduce((sum, season) => sum + season.metrics.availabilityAdjusted.modelDisagreementWins, 0);
  const adjustedLosses = seasons.reduce((sum, season) => sum + season.metrics.availabilityAdjusted.stockDisagreementWins, 0);
  const realizedModel = average(seasons.map((season) => season.metrics.realized.modelSpearman));
  const realizedStock = average(seasons.map((season) => season.metrics.realized.stockSpearman));
  const adjustedModel = average(seasons.map((season) => season.metrics.availabilityAdjusted.modelSpearman));
  const adjustedStock = average(seasons.map((season) => season.metrics.availabilityAdjusted.stockSpearman));
  const improvement = (realizedModel - realizedStock) + (adjustedModel - adjustedStock);
  const positions = BACKTEST_POSITIONS.map((position) =>
    buildSegmentDiagnostic(
      seasons,
      position,
      (player) => player.position === position,
    ),
  );
  const draftRanges = [
    { label: "Rounds 1–3", min: 1, max: yahooLeagueConfig.teams * 3 },
    { label: "Rounds 4–6", min: yahooLeagueConfig.teams * 3 + 1, max: yahooLeagueConfig.teams * 6 },
    { label: "Rounds 7–10", min: yahooLeagueConfig.teams * 6 + 1, max: yahooLeagueConfig.teams * 10 },
    { label: "Rounds 11+", min: yahooLeagueConfig.teams * 10 + 1, max: 220 },
  ].map((range) =>
    buildSegmentDiagnostic(
      seasons,
      range.label,
      (player) => player.adp >= range.min && player.adp <= range.max,
    ),
  );
  const actions = actionCalibration(seasons);
  const smash = actions.find((action) => action.action === "Smash");
  const target = actions.find((action) => action.action === "Target");
  const tightEnd = positions.find((position) => position.label === "TE");
  const positiveCoreSeasons = seasons.filter(
    (season) =>
      season.metrics.realized.modelSpearman > season.metrics.realized.stockSpearman &&
      season.metrics.availabilityAdjusted.modelSpearman >
        season.metrics.availabilityAdjusted.stockSpearman,
  ).length;
  const realizedRankMaeEdge = bootstrapMeanInterval(
    seasons.map((season) => rankMaeEdges(season, "actualRank")),
    202303,
  );
  const adjustedRankMaeEdge = bootstrapMeanInterval(
    seasons.map((season) => rankMaeEdges(season, "rateRank")),
    202305,
  );
  const rosterSimulation = buildHistoricalRosterSimulation(seasons);
  const tuningSuggestions: TuningSuggestion[] = [
    {
      priority: "keep",
      title: "Keep the core model-versus-market blend",
      evidence: `The model beat stock correlation in both outcome views in ${positiveCoreSeasons} of ${seasons.length} seasons.`,
      recommendation: "Do not broadly reweight VOR, prior usage, or market anchoring from this test.",
    },
    {
      priority: target?.verdict === "validated" ? "keep" : "shadow",
      title: "Keep Target as the primary positive draft call",
      evidence: `${target?.players ?? 0} Targets beat their stock rank ${Math.round((target?.beatStockRate ?? 0) * 100)}% of the time with positive average rank surplus in ${target?.positiveSeasons ?? 0} of ${seasons.length} seasons.`,
      recommendation: "Use Target as the actionable positive label while preserving its current selectivity.",
    },
    {
      priority: "tune",
      title: "Retire the legacy static Smash label",
      evidence: `${smash?.players ?? 0} Smash calls averaged ${(smash?.meanActualVsStock ?? 0).toFixed(1)} ranks versus cost and were positive in ${smash?.positiveSeasons ?? 0} of ${seasons.length} seasons.`,
      recommendation: "Display Target before the draft. Allow Smash Now only after the live room supplies a validated price fall, urgent survival risk, and usable roster fit.",
    },
    {
      priority: tightEnd && tightEnd.realizedPositiveSeasons < 2 ? "shadow" : "keep",
      title: "Keep TE changes in shadow mode",
      evidence: `TE produced a ${tightEnd?.realizedEdge.toFixed(3) ?? "0.000"} realized correlation edge and beat stock in ${tightEnd?.realizedPositiveSeasons ?? 0} of ${seasons.length} seasons.`,
      recommendation: "Do not restore blanket TE value. Test route participation and TPRR only when complete historical coverage exists.",
    },
    {
      priority: "data",
      title: "Complete historical rookie inputs before tuning rookies",
      evidence: "Archived ECR/ADP are complete, but comparable preseason college-production, team-situation, and Vegas yardage snapshots are not.",
      recommendation: "Keep rookies market-anchored in this backtest and build a separate rookie validation lane rather than inferring a rookie weight from veteran results.",
    },
    {
      priority: rosterSimulation.productionEligible ? "shadow" : "keep",
      title: "Gate stronger middle-round authority on roster outcomes",
      evidence: rosterSimulation.recommendation,
      recommendation: rosterSimulation.productionEligible
        ? "Run the held-out factor beside the live board without changing pick order, then compare it in the existing pressure suite."
        : "Keep the current acquisition order; use the value-pocket queue as context rather than a rank multiplier.",
    },
  ];

  return {
    generatedAt,
    methodologyVersion: "historical-replay-v1",
    leagueConfigVersion: leagueSourceOfTruth.version,
    leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
    league: {
      name: yahooLeagueConfig.name,
      teams: yahooLeagueConfig.teams,
      scoring: "Full PPR, 6-point passing TD, -1 INT, +3 at 300 passing, +2 at 100 rushing/receiving",
    },
    caveats: [
      "This is a reconstruction of today's model architecture, not the exact code that existed before either season.",
      "Only archived preseason ECR/ADP and prior-season NFL evidence enter each replay; outcome-season stats are isolated until evaluation.",
      "Availability-adjusted results use 17-game pace for players with at least six stat-active games. They do not claim every missed game was an injury.",
      "Historical rookie college and preseason Vegas snapshots are not yet complete, so rookies stay closer to archived market priors in v1.",
      "Three seasons are directional evidence, not enough to prove a durable predictive edge.",
    ],
    aggregate: {
      seasons: seasons.length,
      players: seasons.reduce((sum, season) => sum + season.matchedOutcomeCount, 0),
      realizedModelSpearman: realizedModel,
      realizedStockSpearman: realizedStock,
      adjustedModelSpearman: adjustedModel,
      adjustedStockSpearman: adjustedStock,
      modelDisagreementWinRate: Number((disagreementWins / Math.max(1, disagreementWins + disagreementLosses)).toFixed(3)),
      adjustedDisagreementWinRate: Number((adjustedWins / Math.max(1, adjustedWins + adjustedLosses)).toFixed(3)),
      verdict: improvement >= 0.04 ? "promising" : improvement >= -0.02 ? "neutral" : "needs-work",
    },
    diagnostics: {
      positions,
      draftRanges,
      actions,
      uncertainty: {
        realizedRankMaeEdge,
        adjustedRankMaeEdge,
      },
      rosterSimulation,
      tuningSuggestions,
    },
    seasons,
  };
}
