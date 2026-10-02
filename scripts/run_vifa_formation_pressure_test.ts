import { PitchKickGame } from '@/lib/vifa/game/engine';
import {
  INPUT_BITS,
  emptyInputFrame,
  type InputFrame,
  type PlayerInputCommand,
} from '@/lib/vifa/game/determinism';
import type { SimulationProbe } from '@/lib/vifa/game/engine';
import {
  buildPlayableEraTeamOptions,
  type VifaEraTeamOption,
} from '@/lib/vifa/data/playable-era-teams';
import {
  buildSevenASideTeam,
  chooseCpuFormation,
  pickBalancedSeven,
} from '@/lib/vifa/game/seven-a-side';
import {
  SEVEN_A_SIDE_FORMATIONS,
  type SevenFormationId,
} from '@/lib/vifa/game/teams/formations';
import { FIELD_H, FIELD_W, M } from '@/lib/vifa/game/constants';
import type { MatchTelemetry } from '@/lib/vifa/game/types';

const fakeCanvas = {
  getContext: () => ({}),
} as unknown as HTMLCanvasElement;

type Side = 'home' | 'away';
type ActionBit = typeof INPUT_BITS.shot | typeof INPUT_BITS.shortPass;

interface BotState {
  action: ActionBit | null;
  releaseTick: number;
  nextDecisionTick: number;
}

interface MatchResult {
  teamId: string;
  homeFormation: SevenFormationId;
  awayFormation: SevenFormationId;
  homeScore: number;
  awayScore: number;
  telemetry: MatchTelemetry;
  ticks: number;
  elapsed: number;
  invalidState: boolean;
}

function movementBits(dx: number, dy: number, sprint = true): number {
  let bits = sprint ? INPUT_BITS.sprint : 0;
  if (dx > 20) bits |= INPUT_BITS.moveRight;
  else if (dx < -20) bits |= INPUT_BITS.moveLeft;
  if (dy > 20) bits |= INPUT_BITS.moveDown;
  else if (dy < -20) bits |= INPUT_BITS.moveUp;
  return bits;
}

function botCommand(
  side: Side,
  tick: number,
  snapshot: SimulationProbe,
  state: BotState,
): PlayerInputCommand {
  const command = { held: 0, pressed: 0, released: 0 };
  const controlledRef = side === 'home' ? snapshot.controlled : snapshot.awayControlled;
  const players = snapshot.players[side];
  const controlled = players[controlledRef.index] ?? players[0];
  const px = controlled.x;
  const py = controlled.y;
  const owns = snapshot.possession?.team === side
    && snapshot.possession.index === controlledRef.index;
  const teamOwns = snapshot.possession?.team === side;
  const attackX = side === 'home' ? FIELD_W : 0;

  if (state.action !== null) {
    if (tick < state.releaseTick) command.held |= state.action;
    else {
      command.released |= state.action;
      state.action = null;
    }
  }

  if (owns) {
    const lanePhase = tick / 135 + controlledRef.index * 1.7 + (side === 'home' ? 0 : Math.PI);
    const targetY = FIELD_H / 2 + Math.sin(lanePhase) * M(14);
    const goalDistance = Math.abs(attackX - px);
    // Model deliberate possession: jog through the build-up and only open up
    // into a sprint in the attacking third. The previous always-sprint,
    // pass-every-0.6s bot measured arcade chaos more than normal play.
    command.held |= movementBits(
      attackX - px,
      targetY - py,
      goalDistance < M(25),
    );
    if (state.action === null && tick >= state.nextDecisionTick) {
      const action = goalDistance < M(20) ? INPUT_BITS.shot : INPUT_BITS.shortPass;
      const chargeTicks = action === INPUT_BITS.shot ? 8 : 4;
      state.action = action;
      state.releaseTick = tick + chargeTicks;
      state.nextDecisionTick = tick + (action === INPUT_BITS.shot ? 34 : 68);
      command.held |= action;
      command.pressed |= action;
    }
  } else if (teamOwns) {
    const supportX = side === 'home'
      ? Math.min(FIELD_W - M(8), snapshot.ball.x + M(9))
      : Math.max(M(8), snapshot.ball.x - M(9));
    const laneY = FIELD_H / 2 + (controlledRef.index % 2 === 0 ? -M(7) : M(7));
    command.held |= movementBits(supportX - px, laneY - py);
  } else {
    command.held |= movementBits(snapshot.ball.x - px, snapshot.ball.y - py);
    command.held |= INPUT_BITS.contain;
    if (tick % 36 === (side === 'home' ? 0 : 18)) {
      command.pressed |= INPUT_BITS.switchPlayer;
    }
    const ballDistance = Math.hypot(snapshot.ball.x - px, snapshot.ball.y - py);
    if (ballDistance < M(1.8) && tick >= state.nextDecisionTick) {
      command.pressed |= INPUT_BITS.shot;
      state.nextDecisionTick = tick + 24;
    }
  }

  return command;
}

function finiteAndInBounds(snapshot: SimulationProbe): boolean {
  const values = [
    snapshot.ball.x,
    snapshot.ball.y,
    snapshot.ball.z,
    snapshot.ball.vx,
    snapshot.ball.vy,
    snapshot.ball.vz,
    ...snapshot.players.home.flatMap((player) => [player.x, player.y]),
    ...snapshot.players.away.flatMap((player) => [player.x, player.y]),
  ];
  if (!values.every(Number.isFinite)) return false;
  return [...snapshot.players.home, ...snapshot.players.away].every((player) => {
    return player.x >= -M(2) && player.x <= FIELD_W + M(2)
      && player.y >= -M(2) && player.y <= FIELD_H + M(2);
  });
}

function runMatch(
  option: VifaEraTeamOption,
  homeFormation: SevenFormationId,
  awayFormation: SevenFormationId,
  seed: number,
): MatchResult {
  const home = buildSevenASideTeam(
    option.team,
    option.squad,
    pickBalancedSeven(option.squad, homeFormation),
    homeFormation,
  );
  const away = buildSevenASideTeam(
    option.team,
    option.squad,
    pickBalancedSeven(option.squad, awayFormation),
    awayFormation,
  );
  const game = new PitchKickGame(fakeCanvas, () => undefined, home, away, {
    localMultiplayer: true,
    matchRealSeconds: 180,
    seed,
    recordReplay: false,
  });
  const states: Record<Side, BotState> = {
    home: { action: null, releaseTick: 0, nextDecisionTick: 12 },
    away: { action: null, releaseTick: 0, nextDecisionTick: 18 },
  };
  let snapshot = game.exportSimulationProbe();
  let invalidState = false;
  const maxTicks = 12_000;
  while (snapshot.elapsed < 180 && snapshot.tick < maxTicks) {
    const tick = snapshot.tick + 1;
    const frame: InputFrame = emptyInputFrame(tick);
    frame.home = botCommand('home', tick, snapshot, states.home);
    frame.away = botCommand('away', tick, snapshot, states.away);
    game.advanceTick(frame);
    snapshot = game.exportSimulationProbe();
    if (!finiteAndInBounds(snapshot)) {
      invalidState = true;
      break;
    }
  }
  return {
    teamId: option.id,
    homeFormation,
    awayFormation,
    homeScore: snapshot.score.home,
    awayScore: snapshot.score.away,
    telemetry: game.exportTelemetry(),
    ticks: snapshot.tick,
    elapsed: snapshot.elapsed,
    invalidState,
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

const options = buildPlayableEraTeamOptions();
const requestedTeamIds = (process.env.VIFA_SIM_TEAM_IDS ?? '2022-ARG,2010-PRK,2026-USA')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const testOptions = requestedTeamIds.map((id) => {
  const option = options.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`VIFA pressure-test team ${id} is unavailable`);
  return option;
});
const seedsPerPair = Math.max(1, Number(process.env.VIFA_SIM_SEEDS ?? 2));
const results: MatchResult[] = [];
const started = performance.now();
for (let teamIndex = 0; teamIndex < testOptions.length; teamIndex++) {
  const option = testOptions[teamIndex];
  for (let homeIndex = 0; homeIndex < SEVEN_A_SIDE_FORMATIONS.length; homeIndex++) {
    for (let awayIndex = 0; awayIndex < SEVEN_A_SIDE_FORMATIONS.length; awayIndex++) {
      const homeFormation = SEVEN_A_SIDE_FORMATIONS[homeIndex].id;
      const awayFormation = SEVEN_A_SIDE_FORMATIONS[awayIndex].id;
      for (let seedIndex = 0; seedIndex < seedsPerPair; seedIndex++) {
        const baseSeed = 0x700000 + teamIndex * 100_000 + homeIndex * 10_000 + awayIndex * 100 + seedIndex;
        results.push(runMatch(option, homeFormation, awayFormation, baseSeed));
        results.push(runMatch(option, awayFormation, homeFormation, baseSeed ^ 0x5f3759df));
      }
    }
  }
}

const formationRows = SEVEN_A_SIDE_FORMATIONS.map(({ id }) => {
  const games = results.flatMap((result) => {
    const entries: Array<{
      gf: number;
      ga: number;
      possession: number;
      opponentPossession: number;
      shots: number;
      passes: number;
      completed: number;
      points: number;
    }> = [];
    if (result.homeFormation === id) {
      entries.push({
        gf: result.homeScore,
        ga: result.awayScore,
        possession: result.telemetry.home.possessionTicks,
        opponentPossession: result.telemetry.away.possessionTicks,
        shots: result.telemetry.home.shots,
        passes: result.telemetry.home.passesAttempted,
        completed: result.telemetry.home.passesCompleted,
        points: result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0,
      });
    }
    if (result.awayFormation === id) {
      entries.push({
        gf: result.awayScore,
        ga: result.homeScore,
        possession: result.telemetry.away.possessionTicks,
        opponentPossession: result.telemetry.home.possessionTicks,
        shots: result.telemetry.away.shots,
        passes: result.telemetry.away.passesAttempted,
        completed: result.telemetry.away.passesCompleted,
        points: result.awayScore > result.homeScore ? 3 : result.awayScore === result.homeScore ? 1 : 0,
      });
    }
    return entries;
  });
  const possession = games.map((game) => {
    const total = game.possession + game.opponentPossession;
    return total ? game.possession / total : 0.5;
  });
  return {
    formation: id,
    matches: games.length,
    pointsPerGame: Number(average(games.map((game) => game.points)).toFixed(3)),
    goalsFor: Number(average(games.map((game) => game.gf)).toFixed(3)),
    goalsAgainst: Number(average(games.map((game) => game.ga)).toFixed(3)),
    possessionPct: Number((average(possession) * 100).toFixed(1)),
    shots: Number(average(games.map((game) => game.shots)).toFixed(2)),
    passCompletionPct: Number((average(games.map((game) => game.passes ? game.completed / game.passes : 0)) * 100).toFixed(1)),
  };
});

const totalGoals = results.map((result) => result.homeScore + result.awayScore);
const margins = results.map((result) => Math.abs(result.homeScore - result.awayScore));
const noShotMatches = results.filter(
  (result) => result.telemetry.home.shots + result.telemetry.away.shots === 0,
).length;
const teamGames = results.flatMap((result) => [
  result.telemetry.home,
  result.telemetry.away,
]);
const summary = {
  matches: results.length,
  teams: testOptions.map((option) => option.id),
  matchesPerFormationPairPerTeam: seedsPerPair * 2,
  runtimeSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
  averageTotalGoals: Number(average(totalGoals).toFixed(3)),
  scorelessPct: Number((results.filter((result) => result.homeScore + result.awayScore === 0).length / results.length * 100).toFixed(1)),
  noShotPct: Number((noShotMatches / results.length * 100).toFixed(1)),
  averageMargin: Number(average(margins).toFixed(3)),
  maxMargin: Math.max(...margins),
  averagePassesPerTeam: Number(average(teamGames.map((team) => team.passesAttempted)).toFixed(2)),
  averagePassCompletionPct: Number((average(teamGames.map((team) => team.passesAttempted
    ? team.passesCompleted / team.passesAttempted
    : 0)) * 100).toFixed(1)),
  averageTurnoversWonPerTeam: Number(average(teamGames.map((team) => team.turnoversWon)).toFixed(2)),
  averageShotsPerTeam: Number(average(teamGames.map((team) => team.shots)).toFixed(2)),
  incompleteMatches: results.filter((result) => result.elapsed < 180).length,
  invalidStates: results.filter((result) => result.invalidState).length,
};

const teamFormationSpreads = testOptions.map((option) => {
  const teamResults = results.filter((result) => result.teamId === option.id);
  const pointsPerGame = Object.fromEntries(SEVEN_A_SIDE_FORMATIONS.map(({ id }) => {
    const points: number[] = [];
    for (const result of teamResults) {
      if (result.homeFormation === id) {
        points.push(result.homeScore > result.awayScore ? 3 : result.homeScore === result.awayScore ? 1 : 0);
      }
      if (result.awayFormation === id) {
        points.push(result.awayScore > result.homeScore ? 3 : result.awayScore === result.homeScore ? 1 : 0);
      }
    }
    return [id, Number(average(points).toFixed(3))];
  })) as Record<SevenFormationId, number>;
  const values = Object.values(pointsPerGame);
  return {
    team: option.id,
    spread: Number((Math.max(...values) - Math.min(...values)).toFixed(3)),
    pointsPerGame,
  };
});

const cpuFormationCounts = Object.fromEntries(
  SEVEN_A_SIDE_FORMATIONS.map(({ id }) => [id, 0]),
) as Record<SevenFormationId, number>;
for (const option of options) {
  for (const opponent of SEVEN_A_SIDE_FORMATIONS) {
    const chosen = chooseCpuFormation(option.squad, opponent.id, option.year * 1000 + option.team.abbr.charCodeAt(0));
    cpuFormationCounts[chosen] += 1;
  }
}

console.log(JSON.stringify({
  summary,
  formations: formationRows,
  teamFormationSpreads,
  cpuFormationCounts,
}, null, 2));

const pointsSpread = Math.max(...formationRows.map((row) => row.pointsPerGame))
  - Math.min(...formationRows.map((row) => row.pointsPerGame));
const failures: string[] = [];
if (summary.invalidStates > 0) failures.push(`${summary.invalidStates} matches produced invalid state`);
if (summary.incompleteMatches > 0) failures.push(`${summary.incompleteMatches} matches failed to finish`);
if (summary.noShotPct > 20) failures.push(`no-shot rate ${summary.noShotPct}% is too high`);
if (summary.averageTotalGoals < 0.5 || summary.averageTotalGoals > 12) {
  failures.push(`average total goals ${summary.averageTotalGoals} is outside the playable range`);
}
if (summary.maxMargin > 10) failures.push(`maximum goal margin ${summary.maxMargin} is extreme`);
if (pointsSpread > 1.1) failures.push(`formation points-per-game spread ${pointsSpread.toFixed(3)} is extreme`);
for (const team of teamFormationSpreads) {
  if (team.spread > 1.5) failures.push(`${team.team} formation spread ${team.spread} is extreme`);
}
if (Object.values(cpuFormationCounts).some((count) => count === 0)) {
  failures.push('CPU formation selector never uses at least one available shape');
}

if (failures.length) {
  console.error(`VIFA formation pressure test failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
}
