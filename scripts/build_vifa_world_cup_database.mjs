import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  calculateGoalkeeperVifaRatings,
  calculateOutfieldVifaRatings,
} from '../lib/vifa/data/rating-formulas.ts';
import { TEAMS } from '../lib/vifa/game/teams/index.ts';
import {
  computeOverallRating,
  makeIndividualStats,
} from '../lib/vifa/game/teams/types.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(
  ROOT,
  'lib/vifa/data/world-cup-database.generated.json',
);
const REPORT_PATH = path.join(
  ROOT,
  'lib/vifa/data/world-cup-database.report.json',
);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(`Invalid argument near ${key ?? 'end of command'}`);
    }
    args[key.slice(2)] = path.resolve(value);
  }
  return args;
}

function requiredPath(args, key) {
  if (!args[key]) {
    throw new Error(
      `Missing --${key}. See docs/vifa-data.md for the reproducible command.`,
    );
  }
  return args[key];
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}

async function readCsv(filePath, predicate = () => true) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  const rows = [];

  for await (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, '');
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    if (predicate(row)) rows.push(row);
  }
  return rows;
}

function numberOrUndefined(value) {
  if (value === '' || value === 'NA' || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberOrNull(value) {
  return numberOrUndefined(value) ?? null;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compact(value) {
  return normalize(value).replace(/\s+/g, '');
}

const COUNTRY_ALIASES = new Map(
  Object.entries({
    'cote d ivoire': 'ivory coast',
    'korea republic': 'south korea',
    korea: 'south korea',
    'ir iran': 'iran',
    'united states': 'usa',
    'united states of america': 'usa',
    'czech republic': 'czechia',
    'bosnia h': 'bosnia and herzegovina',
    'bosnia herzegovina': 'bosnia and herzegovina',
    'cape verde': 'cabo verde',
    'korea dpr': 'north korea',
    'serbia and montenegro': 'serbia',
    'trinidad tobago': 'trinidad and tobago',
    curacao: 'curacao',
    'dr congo': 'congo dr',
    'congo dr': 'congo dr',
  }),
);

function canonicalCountry(value) {
  const normalized = normalize(value);
  return COUNTRY_ALIASES.get(normalized) ?? normalized;
}

function fullWorldCupName(row) {
  const given = row.given_name === 'not applicable' ? '' : row.given_name;
  return `${given} ${row.family_name}`.trim();
}

function oldFifaAttributes(row) {
  return {
    acceleration: numberOrUndefined(row.acceleration),
    sprintSpeed: numberOrUndefined(row.sprint_speed),
    positioning: numberOrUndefined(row.att_position),
    finishing: numberOrUndefined(row.finishing),
    shotPower: numberOrUndefined(row.shot_power),
    longShots: numberOrUndefined(row.long_shots),
    volleys: numberOrUndefined(row.vollies),
    penalties: numberOrUndefined(row.penalties),
    vision: numberOrUndefined(row.vision),
    crossing: numberOrUndefined(row.crossing),
    freeKickAccuracy: numberOrUndefined(row.free_kick_accuracy),
    shortPassing: numberOrUndefined(row.short_pass),
    longPassing: numberOrUndefined(row.long_pass),
    curve: numberOrUndefined(row.curve),
    agility: numberOrUndefined(row.agility),
    balance: numberOrUndefined(row.balance),
    reactions: numberOrUndefined(row.reactions),
    ballControl: numberOrUndefined(row.ball_control),
    dribbling: numberOrUndefined(row.dribbling),
    composure: numberOrUndefined(row.composure),
    interceptions: numberOrUndefined(row.interceptions),
    headingAccuracy: numberOrUndefined(row.heading),
    marking: numberOrUndefined(row.marking),
    standingTackle: numberOrUndefined(row.stand_tackle),
    slidingTackle: numberOrUndefined(row.slide_tackle),
    jumping: numberOrUndefined(row.jumping),
    stamina: numberOrUndefined(row.stamina),
    strength: numberOrUndefined(row.strength),
    aggression: numberOrUndefined(row.aggression),
    goalkeeperDiving: numberOrUndefined(row.gk_diving),
    goalkeeperHandling: numberOrUndefined(row.gk_handling),
    goalkeeperKicking: numberOrUndefined(row.gk_kicking),
    goalkeeperPositioning: numberOrUndefined(row.gk_positioning),
    goalkeeperReflexes: numberOrUndefined(row.gk_reflexes),
    goalkeeperSpeed: numberOrUndefined(row.gk_rushing),
  };
}

function modernAttributes(row) {
  return {
    acceleration: numberOrUndefined(row.movement_acceleration),
    sprintSpeed: numberOrUndefined(row.movement_sprint_speed),
    positioning: numberOrUndefined(row.mentality_positioning),
    finishing: numberOrUndefined(row.attacking_finishing),
    shotPower: numberOrUndefined(row.power_shot_power),
    longShots: numberOrUndefined(row.power_long_shots),
    volleys: numberOrUndefined(row.attacking_volleys),
    penalties: numberOrUndefined(row.mentality_penalties),
    vision: numberOrUndefined(row.mentality_vision),
    crossing: numberOrUndefined(row.attacking_crossing),
    freeKickAccuracy: numberOrUndefined(row.skill_fk_accuracy),
    shortPassing: numberOrUndefined(row.attacking_short_passing),
    longPassing: numberOrUndefined(row.skill_long_passing),
    curve: numberOrUndefined(row.skill_curve),
    agility: numberOrUndefined(row.movement_agility),
    balance: numberOrUndefined(row.movement_balance),
    reactions: numberOrUndefined(row.movement_reactions),
    ballControl: numberOrUndefined(row.skill_ball_control),
    dribbling: numberOrUndefined(row.skill_dribbling),
    composure: numberOrUndefined(row.mentality_composure),
    interceptions: numberOrUndefined(row.mentality_interceptions),
    headingAccuracy: numberOrUndefined(row.attacking_heading_accuracy),
    marking: numberOrUndefined(row.defending_marking_awareness),
    standingTackle: numberOrUndefined(row.defending_standing_tackle),
    slidingTackle: numberOrUndefined(row.defending_sliding_tackle),
    jumping: numberOrUndefined(row.power_jumping),
    stamina: numberOrUndefined(row.power_stamina),
    strength: numberOrUndefined(row.power_strength),
    aggression: numberOrUndefined(row.mentality_aggression),
    goalkeeperDiving: numberOrUndefined(row.goalkeeping_diving),
    goalkeeperHandling: numberOrUndefined(row.goalkeeping_handling),
    goalkeeperKicking: numberOrUndefined(row.goalkeeping_kicking),
    goalkeeperPositioning: numberOrUndefined(row.goalkeeping_positioning),
    goalkeeperReflexes: numberOrUndefined(row.goalkeeping_reflexes),
    goalkeeperSpeed: numberOrUndefined(row.goalkeeping_speed),
  };
}

function sourceCountry(row) {
  return row.nationality_name || row.nationality;
}

function sourceBirthDate(row) {
  const value = row.dob || row.birthdate;
  return value && value !== 'NA' ? value : null;
}

function indexPlayersByCountry(rows) {
  return Map.groupBy(rows, (row) => canonicalCountry(sourceCountry(row)));
}

function scoreSingleName(target, candidateNameValue) {
  const targetName = normalize(target.name);
  const candidateName = normalize(candidateNameValue);
  const targetTokens = targetName.split(' ').filter(Boolean);
  const candidateTokens = candidateName.split(' ').filter(Boolean);
  const family = normalize(target.familyName || target.name);
  const familyLast = family.split(' ').at(-1) ?? '';
  const candidateLast = candidateTokens.at(-1) ?? '';
  const givenFirst = normalize(target.givenName).split(' ')[0] ?? '';
  let score = 0;

  if (compact(targetName) === compact(candidateName)) score += 100;
  if (family && compact(candidateName).endsWith(compact(family))) score += 40;
  if (familyLast && familyLast === candidateLast) score += 25;
  if (givenFirst && candidateTokens.includes(givenFirst)) score += 25;
  else if (givenFirst && candidateTokens[0]?.[0] === givenFirst[0]) score += 8;

  const overlap = new Set(targetTokens.filter((token) => candidateTokens.includes(token)));
  score += Math.min(24, overlap.size * 8);

  return score;
}

function scoreNameMatch(target, candidate, shirtNumber = null) {
  const names = [candidate.long_name, candidate.name, candidate.short_name].filter(Boolean);
  let score = Math.max(...names.map((name) => scoreSingleName(target, name)));

  const sourceShirt = numberOrUndefined(
    candidate.nation_jersey_number ?? candidate.country_kit_number,
  );
  if (shirtNumber && sourceShirt === shirtNumber) score += 20;
  return score;
}

function findSourcePlayer(target, candidates, shirtNumber = null) {
  const sameBirthDate = target.birthDate
    ? candidates.filter((candidate) => sourceBirthDate(candidate) === target.birthDate)
    : [];
  if (sameBirthDate.length === 1) {
    return { row: sameBirthDate[0], confidence: 100, method: 'birth-date' };
  }

  const candidatePool = sameBirthDate.length > 1 ? sameBirthDate : candidates;
  const ranked = candidatePool
    .map((candidate) => ({
      candidate,
      score: scoreNameMatch(target, candidate, shirtNumber),
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 48 || (second && best.score - second.score < 8)) return null;
  return {
    row: best.candidate,
    confidence: Math.min(100, best.score),
    method: sameBirthDate.length > 1 ? 'birth-date-and-name' : 'name',
  };
}

function goalkeeperSourceRatings(attributes) {
  const values = [
    attributes.goalkeeperDiving,
    attributes.goalkeeperHandling,
    attributes.goalkeeperKicking,
    attributes.goalkeeperReflexes,
    attributes.goalkeeperSpeed,
    attributes.goalkeeperPositioning,
  ];
  return values.every((value) => typeof value === 'number') ? values : null;
}

function minimumCoverage(coverage) {
  return Math.min(...Object.values(coverage));
}

const HISTORICAL_ATTRIBUTE_KEYS = Object.keys(oldFifaAttributes({}));

function mergeHistoricalAttributes(rows, targetEdition) {
  const editions = rows
    .map((row) => ({ row, edition: Number(row.year), attributes: oldFifaAttributes(row) }))
    .filter(({ edition }) => Math.abs(edition - targetEdition) <= 2)
    .sort((left, right) => left.edition - right.edition);
  const exact = editions.find(({ edition }) => edition === targetEdition);
  const attributes = { ...(exact?.attributes ?? {}) };
  let usedAdjacentEdition = false;

  for (const attribute of HISTORICAL_ATTRIBUTE_KEYS) {
    if (typeof attributes[attribute] === 'number') continue;
    const available = editions.filter(
      (entry) => typeof entry.attributes[attribute] === 'number',
    );
    if (!available.length) continue;
    const before = available.filter((entry) => entry.edition < targetEdition).at(-1);
    const after = available.find((entry) => entry.edition > targetEdition);
    if (before && after) {
      const distance = after.edition - before.edition;
      const progress = (targetEdition - before.edition) / distance;
      attributes[attribute] = Math.round(
        before.attributes[attribute]
          + (after.attributes[attribute] - before.attributes[attribute]) * progress,
      );
    } else {
      attributes[attribute] = (before ?? after).attributes[attribute];
    }
    usedAdjacentEdition = true;
  }

  return { attributes, usedAdjacentEdition };
}

function findHistoricalSource(target, targetEdition, byEdition, shirtNumber) {
  const editions = [
    targetEdition,
    targetEdition - 1,
    targetEdition + 1,
    targetEdition - 2,
    targetEdition + 2,
  ];
  for (const edition of editions) {
    const candidates = byEdition.get(edition)?.get(canonicalCountry(target.teamName)) ?? [];
    const match = findSourcePlayer(target, candidates, shirtNumber);
    if (match) return { ...match, edition };
  }
  return null;
}

function publishedOutfieldRatings(row) {
  const values = [row.pace, row.shooting, row.passing, row.dribbling, row.defending, row.physic]
    .map(numberOrUndefined);
  return values.every((value) => typeof value === 'number') ? values : null;
}

function buildRatedPlayer(source, position, edition, options = {}) {
  const isGoalkeeper = position === 'GK';
  const attributes = options.attributes
    ?? (options.modern ? modernAttributes(source) : oldFifaAttributes(source));
  const calculated = isGoalkeeper
    ? calculateGoalkeeperVifaRatings(attributes, options.modern ? 0.5 : 0.3)
    : calculateOutfieldVifaRatings(attributes);
  const published = options.modern && !isGoalkeeper ? publishedOutfieldRatings(source) : null;
  const ratings = published ?? calculated.ratings;
  const sourcePrefix = options.sourcePrefix ?? 'fifa-model';

  return {
    overall: numberOrNull(source.overall ?? source.rating),
    ratings,
    sourceGoalkeeperRatings: isGoalkeeper ? goalkeeperSourceRatings(attributes) : null,
    ratingSource: ratings
      ? options.ratingSource
        ?? (isGoalkeeper && options.modern
        ? `${sourcePrefix}-published-gk-adapter`
        : options.modern
          ? `${sourcePrefix}-published`
          : 'fifa-model-derived')
      : 'unavailable',
    sourcePlayerId: String(source.player_id || source.sofifa_id || '') || null,
    ratingCoverage: ratings ? minimumCoverage(calculated.coverage) : null,
    ratingEdition: options.ratingEdition ?? edition,
    estimationEvidence: null,
  };
}

function unavailableRating() {
  return {
    overall: null,
    ratings: null,
    sourceGoalkeeperRatings: null,
    ratingSource: 'unavailable',
    sourcePlayerId: null,
    matchConfidence: null,
    ratingCoverage: null,
    ratingEdition: null,
    identityMatchMethod: null,
    estimationEvidence: null,
  };
}

function validatePublishedCategories(rows) {
  const totals = Object.fromEntries(['pac', 'sho', 'pas', 'dri', 'def', 'phy'].map((key) => [key, {
    compared: 0,
    exact: 0,
    withinOne: 0,
    absoluteError: 0,
  }]));

  for (const row of rows) {
    const published = publishedOutfieldRatings(row);
    if (!published) continue;
    const calculated = calculateOutfieldVifaRatings(modernAttributes(row)).ratings;
    if (!calculated) continue;
    Object.keys(totals).forEach((category, index) => {
      const error = Math.abs(published[index] - calculated[index]);
      totals[category].compared += 1;
      totals[category].absoluteError += error;
      if (error === 0) totals[category].exact += 1;
      if (error <= 1) totals[category].withinOne += 1;
    });
  }

  return Object.fromEntries(Object.entries(totals).map(([category, total]) => [category, {
    compared: total.compared,
    exactRate: Number((total.exact / total.compared).toFixed(4)),
    withinOneRate: Number((total.withinOne / total.compared).toFixed(4)),
    meanAbsoluteError: Number((total.absoluteError / total.compared).toFixed(4)),
  }]));
}

function positionCode(value) {
  return value === 'FW' || value === 'ST' ? 'FW' : value;
}

const STARTING_XI_REQUIREMENTS = { GK: 1, DF: 4, MF: 4, FW: 2 };
const ESTIMATION_TARGETS = new Map([
  [2010, new Set(['HND', 'JPN', 'NGA', 'PRK'])],
  [2014, new Set(['IRN'])],
  [2018, new Set(['IRN', 'NGA', 'PAN', 'TUN'])],
  [2022, new Set(['CRI', 'QAT', 'TUN'])],
]);

function clampRating(value) {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function averageRatingTuple(players) {
  const tuples = players.map((player) => player.ratings).filter(Boolean);
  if (!tuples.length) return null;
  return tuples[0].map((_, index) => (
    tuples.reduce((total, tuple) => total + tuple[index], 0) / tuples.length
  ));
}

function tournamentRoleProfiles(teams) {
  return Object.fromEntries(Object.keys(STARTING_XI_REQUIREMENTS).map((role) => {
    const players = teams.flatMap((team) => team.squad)
      .filter((player) => player.position === role && player.ratings);
    return [role, { ratings: averageRatingTuple(players), sampleSize: players.length }];
  }));
}

function evidenceKey(tournamentId, teamId, playerId) {
  return `${tournamentId}:${teamId}:${playerId}`;
}

function buildTournamentEvidence(appearances, goals) {
  const evidence = new Map();
  for (const row of appearances) {
    const key = evidenceKey(row.tournament_id, row.team_id, row.player_id);
    const current = evidence.get(key) ?? { appearances: 0, starts: 0, goals: 0 };
    current.appearances += 1;
    current.starts += Number(row.starter) === 1 ? 1 : 0;
    evidence.set(key, current);
  }
  for (const row of goals) {
    if (Number(row.own_goal) === 1) continue;
    const key = evidenceKey(row.tournament_id, row.player_team_id, row.player_id);
    const current = evidence.get(key) ?? { appearances: 0, starts: 0, goals: 0 };
    current.goals += 1;
    evidence.set(key, current);
  }
  return evidence;
}

function estimateRatingTuple({
  role,
  teamRolePlayers,
  tournamentProfile,
  evidence,
  countMatches,
}) {
  const teamRatings = averageRatingTuple(teamRolePlayers);
  const teamSampleSize = teamRolePlayers.filter((player) => player.ratings).length;
  if (!tournamentProfile.ratings) return null;
  const base = tournamentProfile.ratings.map((tournamentValue, index) => (
    teamRatings
      ? (teamRatings[index] * 0.65) + (tournamentValue * 0.35)
      : tournamentValue
  ));
  const startRate = countMatches ? evidence.starts / countMatches : 0;
  const usageAdjustment = startRate >= 0.75
    ? 2
    : startRate >= 0.4
      ? 1
      : evidence.appearances === 0
        ? -2
        : 0;
  const goalAdjustment = Math.min(4, evidence.goals * 2);
  const tuple = base.map((value, index) => {
    const scoringBoost = role !== 'GK' && index === 1 ? goalAdjustment : 0;
    const dribblingBoost = role !== 'GK' && index === 3
      ? Math.min(2, evidence.goals)
      : 0;
    return clampRating(value + usageAdjustment + scoringBoost + dribblingBoost);
  });
  return { tuple, teamSampleSize };
}

function fillEstimatedRoleGaps({ team, year, countMatches, evidence, profiles }) {
  if (!ESTIMATION_TARGETS.get(year)?.has(team.code)) return team;
  const tournamentId = `WC-${year}`;
  const squad = [...team.squad];

  for (const [role, required] of Object.entries(STARTING_XI_REQUIREMENTS)) {
    const ratedPlayers = squad.filter(
      (player) => player.position === role && player.ratings,
    );
    const needed = Math.max(0, required - ratedPlayers.length);
    if (!needed) continue;
    const candidates = squad
      .filter((player) => player.position === role && !player.ratings)
      .map((player) => ({
        player,
        evidence: evidence.get(evidenceKey(tournamentId, team.teamId, player.playerId))
          ?? { appearances: 0, starts: 0, goals: 0 },
      }))
      .sort((left, right) => (
        right.evidence.starts - left.evidence.starts
        || right.evidence.appearances - left.evidence.appearances
        || right.evidence.goals - left.evidence.goals
        || left.player.shirtNumber - right.player.shirtNumber
      ))
      .slice(0, needed);

    for (const candidate of candidates) {
      const estimated = estimateRatingTuple({
        role,
        teamRolePlayers: ratedPlayers,
        tournamentProfile: profiles[role],
        evidence: candidate.evidence,
        countMatches,
      });
      if (!estimated) continue;
      const playerIndex = squad.findIndex(
        (player) => player.playerId === candidate.player.playerId,
      );
      const engineRole = role === 'FW' ? 'ST' : role;
      squad[playerIndex] = {
        ...candidate.player,
        overall: computeOverallRating(
          engineRole,
          makeIndividualStats(engineRole, estimated.tuple),
        ),
        ratings: estimated.tuple,
        ratingSource: 'vifa-tournament-estimate',
        matchConfidence: Math.min(
          85,
          40
            + Math.min(25, candidate.evidence.starts * 5)
            + Math.min(12, candidate.evidence.appearances * 2)
            + Math.min(8, candidate.evidence.goals * 4),
        ),
        ratingCoverage: null,
        ratingEdition: year,
        estimationEvidence: {
          method: 'team-role-65-tournament-role-35-plus-tournament-usage',
          appearances: candidate.evidence.appearances,
          starts: candidate.evidence.starts,
          goals: candidate.evidence.goals,
          teamMatches: countMatches,
          teamRoleSampleSize: estimated.teamSampleSize,
          tournamentRoleSampleSize: profiles[role].sampleSize,
        },
      };
    }
  }
  return { ...team, squad };
}

function addPlayableTeamState(team, year) {
  const selected = [];
  const ratedByRole = {};
  for (const [role, required] of Object.entries(STARTING_XI_REQUIREMENTS)) {
    const candidates = team.squad
      .filter((player) => player.position === role && player.ratings)
      .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0));
    ratedByRole[role] = candidates.length;
    selected.push(...candidates.slice(0, required));
  }
  const roleComplete = Object.entries(STARTING_XI_REQUIREMENTS).every(
    ([role, required]) => ratedByRole[role] >= required,
  );
  const playable = year >= 2010 && roleComplete;
  return {
    ...team,
    playable,
    ratedByRole,
    startingXiPlayerIds: playable ? selected.map((player) => player.playerId) : [],
  };
}

function buildHistoricalRatedPlayer(match, position, targetEdition, rowsByPlayerId) {
  if (match.edition === targetEdition) {
    const exact = buildRatedPlayer(match.row, position, targetEdition, {
      attributes: oldFifaAttributes(match.row),
      ratingEdition: targetEdition,
      ratingSource: 'fifa-model-derived',
    });
    if (exact.ratings) return exact;
  }
  const relatedRows = rowsByPlayerId.get(match.row.player_id) ?? [match.row];
  const merged = mergeHistoricalAttributes(relatedRows, targetEdition);
  const ratingSource = match.edition !== targetEdition
    ? 'fifa-model-nearest-derived'
    : merged.usedAdjacentEdition
      ? 'fifa-model-interpolated'
      : 'fifa-model-derived';
  return buildRatedPlayer(match.row, position, targetEdition, {
    attributes: merged.attributes,
    ratingEdition: match.edition,
    ratingSource,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const worldCupDir = requiredPath(args, 'worldcup-dir');
  const fifaModelCsv = requiredPath(args, 'fifa-model-csv');
  const fifa18Csv = requiredPath(args, 'fifa18-csv');
  const fifa22Csv = requiredPath(args, 'fifa22-csv');
  const fc26Csv = requiredPath(args, 'fc26-csv');

  const [
    qualifiedTeams,
    squads,
    worldCupPlayers,
    appearances,
    goals,
    fifaModelRows,
    fifa18Rows,
    fifa22Rows,
    fc26Rows,
  ] = await Promise.all([
    readCsv(path.join(worldCupDir, 'qualified_teams.csv'), (row) =>
      row.tournament_name.includes("Men's World Cup") && Number(row.tournament_id.slice(3)) >= 1982),
    readCsv(path.join(worldCupDir, 'squads.csv'), (row) =>
      row.tournament_name.includes("Men's World Cup") && Number(row.tournament_id.slice(3)) >= 1982),
    readCsv(path.join(worldCupDir, 'players.csv')),
    readCsv(path.join(worldCupDir, 'player_appearances.csv'), (row) =>
      row.tournament_name.includes("Men's World Cup") && Number(row.tournament_id.slice(3)) >= 1982),
    readCsv(path.join(worldCupDir, 'goals.csv'), (row) =>
      row.tournament_name.includes("Men's World Cup") && Number(row.tournament_id.slice(3)) >= 1982),
    readCsv(fifaModelCsv),
    readCsv(fifa18Csv),
    readCsv(fifa22Csv),
    readCsv(fc26Csv),
  ]);

  const fifaModelByEdition = new Map(
    [...Map.groupBy(fifaModelRows, (row) => Number(row.year)).entries()]
      .map(([edition, rows]) => [edition, indexPlayersByCountry(rows)]),
  );
  const fifaModelByPlayerId = Map.groupBy(fifaModelRows, (row) => row.player_id);
  const modernByEdition = new Map([
    [2018, indexPlayersByCountry(fifa18Rows)],
    [2022, indexPlayersByCountry(fifa22Rows)],
  ]);
  const worldCupPlayerById = new Map(
    worldCupPlayers.map((player) => [player.player_id, player]),
  );
  const fc26ByCountry = indexPlayersByCountry(fc26Rows);
  const squadsByTournamentTeam = Map.groupBy(
    squads,
    (row) => `${row.tournament_id}:${row.team_id}`,
  );
  const tournamentEvidence = buildTournamentEvidence(appearances, goals);

  const tournamentsByYear = Map.groupBy(
    qualifiedTeams,
    (row) => Number(row.tournament_id.slice(3)),
  );
  const matchSummary = {};
  const tournaments = [];

  for (const [year, teamRows] of [...tournamentsByYear.entries()].sort((a, b) => a[0] - b[0])) {
    const modernEditionRows = modernByEdition.get(year);
    const rawTeams = teamRows
      .map((teamRow) => {
        const squadRows = squadsByTournamentTeam.get(`${teamRow.tournament_id}:${teamRow.team_id}`) ?? [];
        const squad = squadRows.map((playerRow) => {
          const name = fullWorldCupName(playerRow);
          const position = positionCode(playerRow.position_code);
          const worldCupPlayer = worldCupPlayerById.get(playerRow.player_id);
          const target = {
            name,
            givenName: playerRow.given_name,
            familyName: playerRow.family_name,
            teamName: teamRow.team_name,
            birthDate: worldCupPlayer?.birth_date || null,
          };
          const shirtNumber = Number(playerRow.shirt_number);
          const modernCandidates = modernEditionRows?.get(canonicalCountry(teamRow.team_name)) ?? [];
          const modernMatch = modernCandidates.length
            ? findSourcePlayer(target, modernCandidates, shirtNumber)
            : null;
          const historicalMatch = !modernMatch && [2006, 2010, 2014].includes(year)
            ? findHistoricalSource(target, year, fifaModelByEdition, shirtNumber)
            : null;
          const rated = modernMatch
            ? buildRatedPlayer(modernMatch.row, position, year, {
                modern: true,
                sourcePrefix: `fifa-${year % 100}`,
              })
            : historicalMatch
              ? buildHistoricalRatedPlayer(
                  historicalMatch,
                  position,
                  year,
                  fifaModelByPlayerId,
                )
              : unavailableRating();
          const sourceMatch = modernMatch ?? historicalMatch;
          return {
            playerId: playerRow.player_id,
            name,
            shirtNumber,
            position,
            ...rated,
            matchConfidence: sourceMatch?.confidence ?? null,
            identityMatchMethod: sourceMatch?.method ?? null,
          };
        });
        return {
          teamId: teamRow.team_id,
          name: teamRow.team_name,
          code: teamRow.team_code,
          performance: teamRow.performance,
          squad,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    const profiles = tournamentRoleProfiles(rawTeams);
    const matchCounts = new Map(
      teamRows.map((teamRow) => [teamRow.team_id, Number(teamRow.count_matches)]),
    );
    const teams = rawTeams.map((team) => addPlayableTeamState(
      fillEstimatedRoleGaps({
        team,
        year,
        countMatches: matchCounts.get(team.teamId) ?? 0,
        evidence: tournamentEvidence,
        profiles,
      }),
      year,
    ));

    const players = teams.flatMap((team) => team.squad);
    const identityMatches = players.filter((player) => player.sourcePlayerId).length;
    const completeCards = players.filter((player) => player.ratings).length;
    const ratingSourceCounts = Object.fromEntries(
      [...Map.groupBy(players, (player) => player.ratingSource).entries()]
        .map(([source, sourcePlayers]) => [source, sourcePlayers.length]),
    );
    matchSummary[year] = {
      teams: teams.length,
      players: players.length,
      identityMatches,
      identityMatchRate: Number((identityMatches / players.length).toFixed(4)),
      completeCards,
      completeCardRate: Number((completeCards / players.length).toFixed(4)),
      playableTeams: teams.filter((team) => team.playable).length,
      playableTeamCodes: teams.filter((team) => team.playable).map((team) => team.code),
      estimatedCards: players.filter(
        (player) => player.ratingSource === 'vifa-tournament-estimate',
      ).length,
      ratingSourceCounts,
    };
    tournaments.push({ year, name: teamRows[0].tournament_name, teams });
  }

  const currentTeams = TEAMS.map((team) => {
    const squad = team.players.map((player, index) => {
      const position = index === 0 ? 'GK' : index <= 4 ? 'DF' : index <= 8 ? 'MF' : 'FW';
      const authoredName = player.name.replace(/^([A-Z])\.\s+/, '').replace(/\s+[A-Z]\.$/, '');
      const sourceMatch = findSourcePlayer(
        {
          name: authoredName,
          givenName: '',
          familyName: authoredName,
          teamName: team.name,
        },
        fc26ByCountry.get(canonicalCountry(team.name)) ?? [],
        player.num,
      );
      const published = sourceMatch
        ? buildRatedPlayer(sourceMatch.row, position, 2026, {
            modern: true,
            sourcePrefix: 'fc-26',
          })
        : null;
      const manual = {
        overall: player.overallRating,
        ratings: [
          player.individualStats.pac,
          player.individualStats.sho,
          player.individualStats.pas,
          player.individualStats.dri,
          player.individualStats.def,
          player.individualStats.phy,
        ],
        sourceGoalkeeperRatings: null,
        ratingSource: 'vifa-manual',
        sourcePlayerId: null,
        matchConfidence: null,
        ratingCoverage: null,
        ratingEdition: 2026,
        identityMatchMethod: null,
        estimationEvidence: null,
      };
      return {
        playerId: `VIFA-2026-${team.abbr}-${player.num}-${compact(player.name)}`,
        name: player.name,
        shirtNumber: player.num,
        position,
        ...(published?.ratings
          ? {
              ...published,
              matchConfidence: sourceMatch.confidence,
              identityMatchMethod: sourceMatch.method,
            }
          : manual),
      };
    });
    return addPlayableTeamState({
      teamId: `VIFA-${team.abbr}`,
      name: team.name,
      code: team.abbr,
      performance: 'qualified',
      squad,
    }, 2026);
  }).sort((left, right) => left.name.localeCompare(right.name));

  const currentPlayers = currentTeams.flatMap((team) => team.squad);
  const currentIdentityMatches = currentPlayers.filter((player) => player.sourcePlayerId).length;
  const currentCompleteCards = currentPlayers.filter((player) => player.ratings).length;
  const currentRatingSourceCounts = Object.fromEntries(
    [...Map.groupBy(currentPlayers, (player) => player.ratingSource).entries()]
      .map(([source, sourcePlayers]) => [source, sourcePlayers.length]),
  );
  matchSummary[2026] = {
    teams: currentTeams.length,
    players: currentPlayers.length,
    identityMatches: currentIdentityMatches,
    identityMatchRate: Number((currentIdentityMatches / currentPlayers.length).toFixed(4)),
    completeCards: currentCompleteCards,
    completeCardRate: Number((currentCompleteCards / currentPlayers.length).toFixed(4)),
    playableTeams: currentTeams.filter((team) => team.playable).length,
    playableTeamCodes: currentTeams.filter((team) => team.playable).map((team) => team.code),
    estimatedCards: 0,
    ratingSourceCounts: currentRatingSourceCounts,
  };
  tournaments.push({
    year: 2026,
    name: '2026 VIFA current national teams',
    teams: currentTeams,
  });

  const database = {
    schemaVersion: 3,
    dataLicense: 'CC BY-SA 4.0',
    attribution: {
      worldCupDatabase: '© 2023 Joshua C. Fjelstul, Ph.D.; CC BY-SA 4.0; filtered and joined for VIFA',
      fifaModel: 'lbenz730/fifa_model; no repository license declared; derived values only',
      fifa22: 'Kaggle stefanoleone992/fifa-22-complete-player-dataset; CC0',
      fc26: 'Kaggle rovnez/fc-26-fifa-26-player-data; CC BY 4.0',
    },
    ratingOrder: ['pac', 'sho', 'pas', 'dri', 'def', 'phy'],
    tournaments,
  };
  const report = {
    schemaVersion: 3,
    scope: 'Men\'s World Cup teams and squads from 1982 onward, plus the current VIFA 2026 teams',
    matchSummary,
    publishedFormulaValidation: {
      fifa18: validatePublishedCategories(fifa18Rows),
      fifa22: validatePublishedCategories(fifa22Rows),
      fc26: validatePublishedCategories(fc26Rows),
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await Promise.all([
    writeFile(OUTPUT_PATH, `${JSON.stringify(database, null, 2)}\n`),
    writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
