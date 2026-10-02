import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateGoalkeeperVifaRatings,
  calculateOutfieldVifaRatings,
} from '@/lib/vifa/data/rating-formulas';
import { buildPlayableEraTeamOptions } from '@/lib/vifa/data/playable-era-teams';
import {
  buildSevenASideTeam,
  chooseCpuFormation,
  isCompleteSeven,
  makeSelectableSquadPlayer,
  pickBalancedSeven,
} from '@/lib/vifa/game/seven-a-side';
import { SEVEN_A_SIDE_FORMATIONS } from '@/lib/vifa/game/teams/formations';
import {
  PITCH_LENGTH_M,
  PITCH_WIDTH_M,
  GOAL_CROSSBAR_HEIGHT,
  GOAL_HEIGHT,
  M,
} from '@/lib/vifa/game/constants';
import {
  getPlayableVifaHistoricalTeams,
  getVifaHistoricalStartingXi,
  VIFA_WORLD_CUP_DATABASE,
} from '@/lib/vifa/data/world-cup-database';

test('outfield formulas reproduce the published FC 26 Bellingham face card', () => {
  const calculated = calculateOutfieldVifaRatings({
    acceleration: 81,
    sprintSpeed: 80,
    positioning: 91,
    finishing: 88,
    shotPower: 86,
    longShots: 87,
    volleys: 77,
    penalties: 74,
    vision: 90,
    crossing: 66,
    freeKickAccuracy: 68,
    shortPassing: 90,
    longPassing: 89,
    curve: 73,
    agility: 83,
    balance: 83,
    reactions: 91,
    ballControl: 91,
    dribbling: 91,
    composure: 90,
    interceptions: 82,
    headingAccuracy: 75,
    marking: 79,
    standingTackle: 77,
    slidingTackle: 77,
    jumping: 85,
    stamina: 94,
    strength: 80,
    aggression: 85,
  });

  assert.deepEqual(calculated.ratings, [80, 86, 83, 90, 78, 85]);
  assert.ok(Object.values(calculated.coverage).every((value) => value === 1));
});

test('historical formulas reweight available evidence and expose coverage', () => {
  const calculated = calculateOutfieldVifaRatings({
    acceleration: 90,
    sprintSpeed: 80,
    finishing: 85,
    shotPower: 80,
    longShots: 75,
    shortPassing: 82,
    longPassing: 78,
    crossing: 76,
    ballControl: 88,
    dribbling: 86,
    composure: 84,
    headingAccuracy: 60,
    marking: 40,
    standingTackle: 35,
    slidingTackle: 30,
    stamina: 82,
    strength: 74,
    aggression: 70,
  });

  assert.ok(calculated.ratings);
  assert.equal(calculated.coverage.pac, 1);
  assert.equal(calculated.coverage.def, 0.8);
});

test('goalkeeper adapter produces six gameplay-compatible ratings', () => {
  const calculated = calculateGoalkeeperVifaRatings({
    goalkeeperDiving: 88,
    goalkeeperHandling: 86,
    goalkeeperKicking: 84,
    goalkeeperPositioning: 87,
    goalkeeperReflexes: 90,
    goalkeeperSpeed: 55,
    acceleration: 54,
    sprintSpeed: 56,
    shortPassing: 50,
    longPassing: 58,
    reactions: 88,
    strength: 78,
    jumping: 82,
    aggression: 42,
  });

  assert.deepEqual(calculated.ratings, [55, 84, 72, 88, 88, 74]);
});

test('generated database contains only the requested mens tournaments and current pool', () => {
  assert.deepEqual(
    VIFA_WORLD_CUP_DATABASE.tournaments.map((tournament) => tournament.year),
    [1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022, 2026],
  );
  assert.equal(
    VIFA_WORLD_CUP_DATABASE.tournaments.find((tournament) => tournament.year === 2022)?.teams.length,
    32,
  );
  assert.equal(
    VIFA_WORLD_CUP_DATABASE.tournaments.find((tournament) => tournament.year === 2026)?.teams.length,
    48,
  );
});

test('generated ratings are either unavailable or valid six-value cards', () => {
  for (const tournament of VIFA_WORLD_CUP_DATABASE.tournaments) {
    for (const team of tournament.teams) {
      for (const player of team.squad) {
        if (!player.ratings) continue;
        assert.equal(player.ratings.length, 6);
        assert.ok(player.ratings.every((rating) => rating >= 1 && rating <= 99));
        assert.notEqual(player.ratingSource, 'unavailable');
      }
    }
  }
});

test('playable historical teams have a role-complete starting eleven', () => {
  assert.equal(getPlayableVifaHistoricalTeams(2006).length, 0);
  assert.equal(getPlayableVifaHistoricalTeams(2010).length, 32);
  assert.equal(getPlayableVifaHistoricalTeams(2014).length, 32);
  assert.equal(getPlayableVifaHistoricalTeams(2018).length, 32);
  assert.equal(getPlayableVifaHistoricalTeams(2022).length, 32);
  assert.equal(getPlayableVifaHistoricalTeams(2026).length, 48);

  for (const tournament of VIFA_WORLD_CUP_DATABASE.tournaments) {
    for (const team of tournament.teams.filter((candidate) => candidate.playable)) {
      const lineup = getVifaHistoricalStartingXi(tournament.year, team.code);
      const roles = lineup.reduce<Record<string, number>>((counts, player) => {
        counts[player.position] = (counts[player.position] ?? 0) + 1;
        return counts;
      }, {});
      assert.equal(lineup.length, 11);
      assert.deepEqual(roles, { GK: 1, DF: 4, MF: 4, FW: 2 });
    }
  }
});

test('transparent tournament estimates fill only the agreed role gaps', () => {
  const estimated = VIFA_WORLD_CUP_DATABASE.tournaments
    .flatMap((tournament) => tournament.teams)
    .flatMap((team) => team.squad)
    .filter((player) => player.ratingSource === 'vifa-tournament-estimate');
  assert.equal(estimated.length, 42);
  assert.ok(estimated.every((player) => player.estimationEvidence));
  assert.ok(estimated.every((player) => player.sourcePlayerId === null));

  assert.equal(getVifaHistoricalStartingXi(2010, 'PRK').length, 11);
  assert.equal(getVifaHistoricalStartingXi(2022, 'CRI').length, 11);
  assert.equal(getVifaHistoricalStartingXi(2022, 'QAT').length, 11);
});

test('playable era packs support independent cross-era matchups', () => {
  const options = buildPlayableEraTeamOptions();
  const counts = Object.fromEntries(
    [...Map.groupBy(options, (option) => option.year).entries()]
      .map(([year, teams]) => [year, teams.length]),
  );
  assert.deepEqual(counts, {
    2010: 32,
    2014: 32,
    2018: 32,
    2022: 32,
    2026: 48,
  });
  assert.ok(options.some((option) => option.id === '2010-FRA'));
  assert.ok(options.some((option) => option.id === '2022-ARG'));
  assert.ok(options.every((option) => option.team.players.length === 7));
  assert.ok(options.every((option) => option.squad.length >= 11));
  assert.ok(options.every((option) => (
    option.team.players.filter((player) => player.role === 'GK').length === 1
    && option.team.players.filter((player) => player.role === 'DF').length === 2
    && option.team.players.filter((player) => player.role === 'MF').length === 2
    && option.team.players.filter((player) => player.role === 'ST').length === 2
  )));
  assert.ok(options.every((option) => option.team.players[0].overallRating > 0));
});

test('all six seven-a-side formations build role-correct lineups', () => {
  const option = buildPlayableEraTeamOptions().find((candidate) => candidate.id === '2022-ARG');
  assert.ok(option);
  for (const formation of SEVEN_A_SIDE_FORMATIONS) {
    const ids = pickBalancedSeven(option.squad, formation.id);
    const team = buildSevenASideTeam(option.team, option.squad, ids, formation.id);
    assert.equal(team.players.length, 7);
    assert.equal(team.formation, formation.id);
    assert.deepEqual(
      team.players.map((player) => player.role),
      formation.roles,
    );
  }
});

test('squad legality allows six outfielders from the same natural role', () => {
  const squad = [
    makeSelectableSquadPlayer({ id: 'gk', num: 1, name: 'KEEPER', role: 'GK', ratings: [60, 20, 65, 55, 80, 78] }),
    ...Array.from({ length: 6 }, (_, index) => makeSelectableSquadPlayer({
      id: `st-${index}`,
      num: index + 2,
      name: `ATTACKER ${index + 1}`,
      role: 'ST' as const,
      ratings: [85, 84, 72, 82, 35, 70],
    })),
  ];
  assert.equal(isCompleteSeven(squad, squad.map((player) => player.id)), true);
});

test('CPU formation choice is deterministic and evaluates every tactical shape', () => {
  const option = buildPlayableEraTeamOptions().find((candidate) => candidate.id === '2022-ARG');
  assert.ok(option);
  const first = chooseCpuFormation(option.squad, '1-2-3', 2022);
  const second = chooseCpuFormation(option.squad, '1-2-3', 2022);
  assert.equal(first, second);
  assert.ok(SEVEN_A_SIDE_FORMATIONS.some((formation) => formation.id === first));
});

test('VIFA uses compact seven-a-side pitch and goal dimensions', () => {
  assert.equal(PITCH_LENGTH_M, 70);
  assert.equal(PITCH_WIDTH_M, 50);
  assert.equal(GOAL_HEIGHT, Math.round(M(5)));
  assert.equal(GOAL_CROSSBAR_HEIGHT, M(2));
});
