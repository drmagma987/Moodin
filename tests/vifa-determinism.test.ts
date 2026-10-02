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

  const runtimePlayer = createGame().exportSnapshot().players.home[0];
  assert.equal(typeof runtimePlayer.cachedPaceMultiplier, 'number');
  assert.equal(typeof runtimePlayer.cachedTackleRadius, 'number');
  assert.equal('ratings' in runtimePlayer, false);
});
