import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INPUT_BITS,
  emptyInputFrame,
  snapshotDigest,
  type InputFrame,
} from '@/lib/vifa/game/determinism';
import { PitchKickGame } from '@/lib/vifa/game/engine';
import { precomputePlayerPhysicsScalars } from '@/lib/vifa/game/ratings';
import { TEAMS } from '@/lib/vifa/game/teams';
import { makeIndividualStats } from '@/lib/vifa/game/teams/types';
import { PLAYER_TWO_BINDINGS } from '@/lib/vifa/mods';
import {
  DEFAULT_CONTROLLER_BINDINGS,
  assignControllerButton,
  gamepadToCommand,
  type GamepadSnapshot,
} from '@/lib/vifa/game/gamepad';
import {
  touchDirectionBits,
  touchInputTransition,
} from '@/lib/vifa/game/touch';
import {
  CURATED_WORLD_CUP_APPEARANCES,
  getCuratedWorldCupAppearance,
} from '@/lib/vifa/data/world-cup-appearances';
import {
  CURATED_WORLD_CUP_KITS,
  getWorldCupKitArchive,
} from '@/lib/vifa/data/world-cup-kits';
import { buildPlayableEraTeamOptions } from '@/lib/vifa/data/playable-era-teams';
import { buildSevenASideTeam, pickBalancedSeven } from '@/lib/vifa/game/seven-a-side';

const fakeCanvas = {
  getContext: () => ({}),
} as unknown as HTMLCanvasElement;

const argentina = TEAMS.find((team) => team.name === 'Argentina') ?? TEAMS[0];
const brazil = TEAMS.find((team) => team.name === 'Brazil') ?? TEAMS[1];

function createGame(seed = 0x51fa2026) {
  return new PitchKickGame(
    fakeCanvas,
    () => undefined,
    argentina,
    brazil,
    {
      localMultiplayer: true,
      awayBindings: PLAYER_TWO_BINDINGS,
      seed,
    },
  );
}

function commandFrames(count: number): InputFrame[] {
  return Array.from({ length: count }, (_, index) => {
    const tick = index + 1;
    const frame = emptyInputFrame(tick);

    if (tick >= 35 && tick < 110) {
      frame.home.held |= INPUT_BITS.moveRight | INPUT_BITS.sprint;
      frame.away.held |= INPUT_BITS.moveLeft | INPUT_BITS.sprint;
    }
    if (tick === 72) {
      frame.home.held |= INPUT_BITS.shortPass;
      frame.home.pressed |= INPUT_BITS.shortPass;
    }
    if (tick > 72 && tick < 78) frame.home.held |= INPUT_BITS.shortPass;
    if (tick === 78) frame.home.released |= INPUT_BITS.shortPass;

    if (tick === 120) {
      frame.away.held |= INPUT_BITS.shot;
      frame.away.pressed |= INPUT_BITS.shot;
    }
    if (tick > 120 && tick < 128) frame.away.held |= INPUT_BITS.shot;
    if (tick === 128) frame.away.released |= INPUT_BITS.shot;

    if (tick >= 150 && tick < 205) {
      frame.home.held |= INPUT_BITS.moveDown;
      frame.away.held |= INPUT_BITS.moveUp;
    }
    return frame;
  });
}

test('the authoritative VIFA engine replays identical commands exactly', () => {
  const frames = commandFrames(240);
  const original = createGame();
  for (const frame of frames) original.advanceTick(frame);

  const replay = original.exportReplay();
  assert.equal(replay.frames.length, frames.length);
  assert.equal(replay.tickRate, 30);

  const reproduced = createGame(replay.seed);
  for (const frame of replay.frames) reproduced.advanceTick(frame);

  assert.equal(
    snapshotDigest(reproduced.exportSnapshot()),
    snapshotDigest(original.exportSnapshot()),
  );
});

test('same seed and command stream are stable across independent matches', () => {
  const frames = commandFrames(360);
  const first = createGame(123456789);
  const second = createGame(123456789);

  for (const frame of frames) {
    first.advanceTick(frame);
    second.advanceTick(frame);
  }

  const firstSnapshot = first.exportSnapshot();
  const secondSnapshot = second.exportSnapshot();
  assert.equal(firstSnapshot.tick, 360);
  assert.equal(firstSnapshot.elapsed, secondSnapshot.elapsed);
  assert.deepEqual(firstSnapshot, secondSnapshot);
});

test('out-of-order command frames fail closed', () => {
  const game = createGame();
  assert.throws(
    () => game.advanceTick(emptyInputFrame(2)),
    /input tick mismatch/,
  );
});

test('player profiles normalize to immutable 1-99 individual stats', () => {
  const stats = makeIndividualStats('ST', [0, 120, 75.4, 88.6, 40, 72]);

  assert.deepEqual(stats, {
    pac: 1,
    sho: 99,
    pas: 75,
    dri: 89,
    def: 40,
    phy: 72,
  });
  assert.equal(Object.isFrozen(stats), true);
  assert.notStrictEqual(
    argentina.players[0].individualStats,
    argentina.players[1].individualStats,
  );
});

test('rating math is precomputed into flat runtime physics scalars', () => {
  const low = precomputePlayerPhysicsScalars({
    individualStats: makeIndividualStats('ST', [40, 40, 40, 40, 40, 40]),
  });
  const high = precomputePlayerPhysicsScalars({
    individualStats: makeIndividualStats('ST', [95, 95, 95, 95, 95, 95]),
  });

  assert.ok(high.cachedPaceMultiplier > low.cachedPaceMultiplier);
  assert.ok(high.cachedShotPowerMultiplier > low.cachedShotPowerMultiplier);
  assert.ok(high.cachedShotChargeRate > low.cachedShotChargeRate);
  assert.ok(high.cachedPassSpreadMultiplier < low.cachedPassSpreadMultiplier);
  assert.ok(high.cachedBallControlRadius > low.cachedBallControlRadius);
  assert.ok(high.cachedTackleRadius > low.cachedTackleRadius);
  assert.ok(high.cachedKeeperReachMultiplier > low.cachedKeeperReachMultiplier);

  // Attribute gaps should be plainly felt, not merely visible on the card.
  assert.ok(high.cachedPaceMultiplier / low.cachedPaceMultiplier > 1.35);
  assert.ok(high.cachedPassPowerMultiplier / low.cachedPassPowerMultiplier > 1.22);
  assert.ok(low.cachedPassSpreadMultiplier / high.cachedPassSpreadMultiplier > 1.45);
  assert.ok(high.cachedDribbleAccelerationMultiplier / low.cachedDribbleAccelerationMultiplier > 1.35);

  const runtimePlayer = createGame().exportSnapshot().players.home[0];
  assert.equal(typeof runtimePlayer.cachedPaceMultiplier, 'number');
  assert.equal(typeof runtimePlayer.cachedTackleRadius, 'number');
  assert.equal('ratings' in runtimePlayer, false);
});

test('match telemetry is deterministic and accounts for possession', () => {
  const frames = commandFrames(360);
  const first = createGame(8844);
  const second = createGame(8844);
  for (const frame of frames) {
    first.advanceTick(frame);
    second.advanceTick(frame);
  }

  assert.deepEqual(first.exportTelemetry(), second.exportTelemetry());
  const telemetry = first.exportTelemetry();
  assert.ok(
    telemetry.home.possessionTicks + telemetry.away.possessionTicks > 0,
  );
});

test('gamepad adapter maps analog movement, buttons, and release edges', () => {
  const makePad = (
    axes: number[],
    pressed: number[],
  ): GamepadSnapshot => ({
    id: 'Synthetic PowerA GameCube controller',
    index: 0,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
  });

  const first = gamepadToCommand(
    makePad([0.8, -0.7], [0, 7]),
    DEFAULT_CONTROLLER_BINDINGS,
    new Set(),
  );
  assert.ok(first.command.held & INPUT_BITS.moveRight);
  assert.ok(first.command.held & INPUT_BITS.moveUp);
  assert.ok(first.command.held & INPUT_BITS.shortPass);
  assert.ok(first.command.held & INPUT_BITS.sprint);
  assert.ok(first.command.pressed & INPUT_BITS.shortPass);

  const released = gamepadToCommand(
    makePad([0, 0], []),
    DEFAULT_CONTROLLER_BINDINGS,
    first.pressedButtons,
  );
  assert.ok(released.command.released & INPUT_BITS.shortPass);
  assert.equal(released.command.held, 0);
});

test('controller rebinding swaps collisions and preserves every action', () => {
  const rebound = assignControllerButton(
    DEFAULT_CONTROLLER_BINDINGS,
    'shot',
    DEFAULT_CONTROLLER_BINDINGS.shortPass,
  );
  assert.equal(rebound.shot, DEFAULT_CONTROLLER_BINDINGS.shortPass);
  assert.equal(rebound.shortPass, DEFAULT_CONTROLLER_BINDINGS.shot);
  assert.equal(new Set(Object.values(rebound)).size, Object.values(rebound).length);
});

test('touch joystick maps dead zone, cardinals, and diagonals', () => {
  assert.equal(touchDirectionBits(0.1, -0.1), 0);
  assert.equal(touchDirectionBits(-0.8, 0), INPUT_BITS.moveLeft);
  assert.equal(touchDirectionBits(0, 0.8), INPUT_BITS.moveDown);
  assert.equal(
    touchDirectionBits(0.7, -0.7),
    INPUT_BITS.moveRight | INPUT_BITS.moveUp,
  );
});

test('touch actions preserve held, pressed, and released edges', () => {
  const pressed = touchInputTransition(0, INPUT_BITS.shortPass | INPUT_BITS.sprint);
  assert.equal(pressed.held, INPUT_BITS.shortPass | INPUT_BITS.sprint);
  assert.equal(pressed.pressed, INPUT_BITS.shortPass | INPUT_BITS.sprint);
  assert.equal(pressed.released, 0);

  const released = touchInputTransition(
    pressed.held,
    INPUT_BITS.sprint,
  );
  assert.equal(released.held, INPUT_BITS.sprint);
  assert.equal(released.pressed, 0);
  assert.equal(released.released, INPUT_BITS.shortPass);
});

test('curated player appearances are locked to an exact World Cup edition', () => {
  const messi2010 = getCuratedWorldCupAppearance(2010, 'ARG', 'P-14758');
  const messi2014 = getCuratedWorldCupAppearance(2014, 'ARG', 'P-14758');
  const messi2018 = getCuratedWorldCupAppearance(2018, 'ARG', 'P-14758');
  const beckham2006 = getCuratedWorldCupAppearance(2006, 'ENG', 'P-81049');

  assert.equal(messi2010?.appearance.hairStyle, 'long-loose');
  assert.equal(messi2014?.appearance.hairStyle, 'short');
  assert.equal(messi2018?.appearance.facialHair, 'beard');
  assert.equal(beckham2006?.appearance.hairStyle, 'spiked');
  assert.equal(getCuratedWorldCupAppearance(2012, 'ARG', 'P-14758'), undefined);
  assert.equal(getCuratedWorldCupAppearance(2010, 'ENG', 'P-81049'), undefined);

  const keys = CURATED_WORLD_CUP_APPEARANCES.map(
    ({ year, teamCode, playerId }) => `${year}:${teamCode}:${playerId}`,
  );
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(CURATED_WORLD_CUP_APPEARANCES.every(({ evidenceUrl }) => (
    evidenceUrl.startsWith('https://www.fifa.com/')
      || evidenceUrl.startsWith('https://inside.fifa.com/')
  )));
});

test('era appearances and featured cosmetics reach the match lineup without changing ratings', () => {
  const options = buildPlayableEraTeamOptions();
  const argentina2010 = options.find((option) => option.id === '2010-ARG');
  assert.ok(argentina2010);
  const messi = argentina2010.squad.find((player) => player.name === 'Lionel Messi');
  assert.ok(messi);
  assert.equal(messi.appearance?.hairStyle, 'long-loose');

  const lineupIds = pickBalancedSeven(argentina2010.squad);
  const baseRating = messi.overallRating;
  const team = buildSevenASideTeam(
    argentina2010.team,
    argentina2010.squad,
    lineupIds,
    '2-2-2',
    {
      playerId: messi.id,
      accent: '#22d3ee',
      marker: 'diamond',
    },
  );
  const matchMessi = team.players.find((player) => player.name === 'Lionel Messi');
  assert.ok(matchMessi);
  assert.equal(matchMessi.overallRating, baseRating);
  assert.equal(matchMessi.appearance?.bootColor, '#22d3ee');
  assert.equal(matchMessi.appearance?.featuredMarker, 'diamond');
  assert.equal(matchMessi.appearance?.hairStyle, 'long-loose');
});

test('World Cup kit archives include only explicitly recorded third kits', () => {
  const franceOptions = buildPlayableEraTeamOptions().filter(
    (option) => option.team.abbr === 'FRA',
  );
  const archive = getWorldCupKitArchive(
    'FRA',
    franceOptions.map((option) => ({
      year: option.year,
      home: option.team.kit,
      away: option.team.awayKit,
    })),
  );

  assert.ok(archive.some((option) => option.id === 'FRA-2002-home'));
  assert.ok(archive.some((option) => option.id === 'FRA-1978-third'));
  assert.equal(
    archive.filter((option) => option.variant === 'third').length,
    1,
  );
  assert.equal(new Set(archive.map((option) => option.id)).size, archive.length);
  assert.equal(
    new Set(CURATED_WORLD_CUP_KITS.map((option) => option.id)).size,
    CURATED_WORLD_CUP_KITS.length,
  );
});

test('a cross-era jersey changes presentation without changing the selected squad', () => {
  const france2018 = buildPlayableEraTeamOptions().find(
    (option) => option.id === '2018-FRA',
  );
  assert.ok(france2018);
  const france2002Home = getWorldCupKitArchive('FRA', []).find(
    (option) => option.id === 'FRA-2002-home',
  );
  assert.ok(france2002Home);

  const lineupIds = pickBalancedSeven(france2018.squad);
  const team = buildSevenASideTeam(
    { ...france2018.team, kit: france2002Home.kit },
    france2018.squad,
    lineupIds,
  );

  assert.deepEqual(team.kit, france2002Home.kit);
  assert.deepEqual(
    team.players.map(({ name, r }) => ({ name, r })),
    buildSevenASideTeam(france2018.team, france2018.squad, lineupIds).players
      .map(({ name, r }) => ({ name, r })),
  );
});
