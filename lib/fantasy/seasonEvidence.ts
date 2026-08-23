import {
  fetchFfOpportunitySeasonStats,
  type FfOpportunitySeasonStats,
} from "@/lib/fantasy/ffOpportunity";
import {
  fetchNflverseSeasonStats,
  type NflversePlayerSeasonStats,
} from "@/lib/fantasy/nflverse";

const FULL_SEASON_GAMES = 17;

type EvidenceFetchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export type SeasonEvidenceSnapshot = {
  activeSeason: number;
  priorSeason: number;
  currentWeeks: number;
  currentWeight: number;
  nflverseByPlayerId?: Map<string, NflversePlayerSeasonStats>;
  ffOpportunityByPlayerId?: Map<string, FfOpportunitySeasonStats>;
  priorNflverseAvailable: boolean;
  currentNflverseAvailable: boolean;
  priorFfOpportunityAvailable: boolean;
  currentFfOpportunityAvailable: boolean;
  summary: string;
  errors: string[];
};

function rounded(value: number) {
  return Number(value.toFixed(3));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

async function settle<T>(promise: Promise<T>): Promise<EvidenceFetchResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

export function activeNflSeasonForDate(now = new Date()) {
  const month = now.getUTCMonth() + 1;
  return month >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function currentSeasonEvidenceWeight(completedWeeks: number) {
  if (completedWeeks <= 0) {
    return 0;
  }
  if (completedWeeks === 1) {
    return 0.18;
  }
  if (completedWeeks === 2) {
    return 0.26;
  }
  if (completedWeeks === 3) {
    return 0.34;
  }
  if (completedWeeks === 4) {
    return 0.46;
  }
  if (completedWeeks === 5) {
    return 0.56;
  }
  if (completedWeeks === 6) {
    return 0.65;
  }
  if (completedWeeks === 7) {
    return 0.73;
  }
  if (completedWeeks === 8) {
    return 0.8;
  }
  if (completedWeeks === 9) {
    return 0.85;
  }
  return 0.9;
}

function annualize(value: number, observedGames: number) {
  if (observedGames <= 0) {
    return value;
  }
  return value * (FULL_SEASON_GAMES / observedGames);
}

function blendNumber(prior: number, current: number, currentWeight: number) {
  return rounded(prior * (1 - currentWeight) + current * currentWeight);
}

export function blendNflverseSeasonStats(input: {
  prior?: Map<string, NflversePlayerSeasonStats>;
  current?: Map<string, NflversePlayerSeasonStats>;
  currentWeight: number;
}) {
  const ids = new Set([
    ...(input.prior?.keys() ?? []),
    ...(input.current?.keys() ?? []),
  ]);
  const blended = new Map<string, NflversePlayerSeasonStats>();
  const countFields = [
    "attempts",
    "carries",
    "targets",
    "receptions",
    "passingYards",
    "rushingYards",
    "receivingYards",
    "passingTouchdowns",
    "rushingTouchdowns",
    "receivingTouchdowns",
    "fantasyPointsPpr",
  ] as const;

  for (const id of ids) {
    const prior = input.prior?.get(id);
    const current = input.current?.get(id);
    if (!prior && !current) {
      continue;
    }
    if (!current) {
      blended.set(id, { ...prior! });
      continue;
    }
    if (!prior) {
      const annualized = { ...current, games: FULL_SEASON_GAMES };
      for (const field of countFields) {
        annualized[field] = rounded(annualize(current[field], current.games));
      }
      annualized.sacksSuffered = rounded(annualize(current.sacksSuffered ?? 0, current.games));
      annualized.passingEpa = rounded(annualize(current.passingEpa ?? 0, current.games));
      blended.set(id, annualized);
      continue;
    }

    const next: NflversePlayerSeasonStats = {
      ...current,
      games: FULL_SEASON_GAMES,
      targetShare: blendNumber(prior.targetShare, current.targetShare, input.currentWeight),
      airYardsShare: blendNumber(prior.airYardsShare, current.airYardsShare, input.currentWeight),
      passingCpoe: blendNumber(prior.passingCpoe ?? 0, current.passingCpoe ?? 0, input.currentWeight),
      sacksSuffered: blendNumber(
        prior.sacksSuffered ?? 0,
        annualize(current.sacksSuffered ?? 0, current.games),
        input.currentWeight,
      ),
      passingEpa: blendNumber(
        prior.passingEpa ?? 0,
        annualize(current.passingEpa ?? 0, current.games),
        input.currentWeight,
      ),
      passing300Games: current.passing300Games === undefined
        ? prior.passing300Games
        : blendNumber(prior.passing300Games ?? 0, annualize(current.passing300Games, current.games), input.currentWeight),
      rushing100Games: current.rushing100Games === undefined
        ? prior.rushing100Games
        : blendNumber(prior.rushing100Games ?? 0, annualize(current.rushing100Games, current.games), input.currentWeight),
      receiving100Games: current.receiving100Games === undefined
        ? prior.receiving100Games
        : blendNumber(prior.receiving100Games ?? 0, annualize(current.receiving100Games, current.games), input.currentWeight),
    };
    for (const field of countFields) {
      next[field] = blendNumber(
        prior[field],
        annualize(current[field], current.games),
        input.currentWeight,
      );
    }
    blended.set(id, next);
  }

  return blended;
}

export function blendFfOpportunitySeasonStats(input: {
  prior?: Map<string, FfOpportunitySeasonStats>;
  current?: Map<string, FfOpportunitySeasonStats>;
  activeSeason: number;
  currentWeeks: number;
  currentWeight: number;
}) {
  const ids = new Set([
    ...(input.prior?.keys() ?? []),
    ...(input.current?.keys() ?? []),
  ]);
  const blended = new Map<string, FfOpportunitySeasonStats>();
  const totalFields = [
    "actualFantasyPoints",
    "expectedFantasyPoints",
    "actualTouchdowns",
    "expectedTouchdowns",
    "actualYards",
    "expectedYards",
  ] as const;

  for (const id of ids) {
    const prior = input.prior?.get(id);
    const current = input.current?.get(id);
    if (!prior && !current) {
      continue;
    }
    if (!current) {
      blended.set(id, {
        ...prior!,
        evidenceSeasons: [prior!.season],
        currentSeasonWeeks: 0,
        currentSeasonWeight: 0,
      });
      continue;
    }

    const currentOnly = !prior;
    const effectiveWeight = currentOnly ? 1 : input.currentWeight;
    const next: FfOpportunitySeasonStats = {
      ...(prior ?? current),
      playerName: current.playerName,
      team: current.team,
      position: current.position,
      season: input.activeSeason,
      weeks: FULL_SEASON_GAMES,
      weeklyActualVolatility: prior
        ? blendNumber(
            prior.weeklyActualVolatility,
            current.weeklyActualVolatility,
            effectiveWeight,
          )
        : current.weeklyActualVolatility,
      weeklyExpectedVolatility: prior
        ? blendNumber(
            prior.weeklyExpectedVolatility,
            current.weeklyExpectedVolatility,
            effectiveWeight,
          )
        : current.weeklyExpectedVolatility,
      weeklyConsistencyScore: Math.round(
        prior
          ? blendNumber(
              prior.weeklyConsistencyScore,
              current.weeklyConsistencyScore,
              effectiveWeight,
            )
          : current.weeklyConsistencyScore,
      ),
      evidenceSeasons: prior ? [prior.season, input.activeSeason] : [input.activeSeason],
      currentSeasonWeeks: input.currentWeeks,
      currentSeasonWeight: effectiveWeight,
    };

    for (const field of totalFields) {
      const annualizedCurrent = annualize(current[field], Math.max(1, current.weeks));
      next[field] = prior
        ? blendNumber(prior[field], annualizedCurrent, effectiveWeight)
        : rounded(annualizedCurrent);
    }
    blended.set(id, next);
  }

  return blended;
}

export async function fetchSeasonAwareEvidence(now = new Date()): Promise<SeasonEvidenceSnapshot> {
  const activeSeason = activeNflSeasonForDate(now);
  const priorSeason = activeSeason - 1;
  const [priorNflverse, currentNflverse, priorFfOpportunity, currentFfOpportunity] =
    await Promise.all([
      settle(fetchNflverseSeasonStats(priorSeason)),
      settle(fetchNflverseSeasonStats(activeSeason)),
      settle(fetchFfOpportunitySeasonStats(priorSeason)),
      settle(fetchFfOpportunitySeasonStats(activeSeason)),
    ]);
  const currentWeeks = currentFfOpportunity.ok
    ? Math.max(0, ...[...currentFfOpportunity.value.values()].map((stats) => stats.weeks))
    : currentNflverse.ok
      ? Math.max(0, ...[...currentNflverse.value.values()].map((stats) => stats.games))
      : 0;
  const currentWeight = currentSeasonEvidenceWeight(currentWeeks);
  const nflverseByPlayerId = blendNflverseSeasonStats({
    prior: priorNflverse.ok ? priorNflverse.value : undefined,
    current: currentNflverse.ok ? currentNflverse.value : undefined,
    currentWeight,
  });
  const ffOpportunityByPlayerId = blendFfOpportunitySeasonStats({
    prior: priorFfOpportunity.ok ? priorFfOpportunity.value : undefined,
    current: currentFfOpportunity.ok ? currentFfOpportunity.value : undefined,
    activeSeason,
    currentWeeks,
    currentWeight,
  });
  const errors = [
    !priorNflverse.ok ? `${priorSeason} nflverse: ${errorMessage(priorNflverse.error)}` : null,
    !currentNflverse.ok ? `${activeSeason} nflverse: ${errorMessage(currentNflverse.error)}` : null,
    !priorFfOpportunity.ok
      ? `${priorSeason} ffopportunity: ${errorMessage(priorFfOpportunity.error)}`
      : null,
    !currentFfOpportunity.ok
      ? `${activeSeason} ffopportunity: ${errorMessage(currentFfOpportunity.error)}`
      : null,
  ].filter((message): message is string => message !== null);
  const summary =
    currentWeeks > 0
      ? `${priorSeason}/${activeSeason} evidence blend: ${currentWeeks} current-season week${currentWeeks === 1 ? "" : "s"}, ${Math.round(currentWeight * 100)}% current weight.`
      : `${priorSeason} completed-season prior is active; ${activeSeason} evidence has not posted yet.`;

  return {
    activeSeason,
    priorSeason,
    currentWeeks,
    currentWeight,
    nflverseByPlayerId: nflverseByPlayerId.size > 0 ? nflverseByPlayerId : undefined,
    ffOpportunityByPlayerId:
      ffOpportunityByPlayerId.size > 0 ? ffOpportunityByPlayerId : undefined,
    priorNflverseAvailable: priorNflverse.ok,
    currentNflverseAvailable: currentNflverse.ok,
    priorFfOpportunityAvailable: priorFfOpportunity.ok,
    currentFfOpportunityAvailable: currentFfOpportunity.ok,
    summary,
    errors,
  };
}
