import type { DraftedPlayer } from "./game/types";
import { speedRatingFromForty } from "./game/speed";

export type TeamRatings = {
  pass: number;
  run: number;
  bigPlay: number;
  ballSecurity: number;
  passD: number;
  runD: number;
  pressure: number;
  takeaways: number;
};

export type StrategySet = {
  offense: string;
  defense: string;
};

export type GameSetup = {
  teamAName: string;
  teamBName: string;
  teamA: DraftedPlayer[];
  teamB: DraftedPlayer[];
  teamARatings: TeamRatings;
  teamBRatings: TeamRatings;
  teamAStrategy: StrategySet;
  teamBStrategy: StrategySet;
  simSeed: number;
};

export type QuarterResult = {
  quarter: number;
  scoreA: number;
  scoreB: number;
  plays: string[];
  highlights: QuarterHighlight[];
};

export type QuarterHighlight = {
  id: string;
  text: string;
  scoreA: number;
  scoreB: number;
  isScore: boolean;
};

export type PlayerGameStats = {
  playerId: string;
  name: string;
  position: DraftedPlayer["position"];
  passingYards: number;
  passingTD: number;
  interceptions: number;
  rushYards: number;
  rushTD: number;
  carries: number;
  receivingYards: number;
  receivingTD: number;
  receptions: number;
};

export type SimResult = {
  finalA: number;
  finalB: number;
  quarters: QuarterResult[];
  teamAStats: PlayerGameStats[];
  teamBStats: PlayerGameStats[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function topPlayerByPosition(
  team: DraftedPlayer[],
  position: DraftedPlayer["position"]
) {
  const players = team.filter((p) => p.position === position);
  if (players.length === 0) return null;
  return [...players].sort((a, b) => b.trueGrade - a.trueGrade)[0];
}

function topTwoWRs(team: DraftedPlayer[]) {
  return [...team.filter((p) => p.position === "WR")]
    .sort((a, b) => b.trueGrade - a.trueGrade)
    .slice(0, 2);
}

function playersByPosition(
  team: DraftedPlayer[],
  position: DraftedPlayer["position"]
) {
  return [...team.filter((player) => player.position === position)].sort(
    (a, b) => b.trueGrade - a.trueGrade
  );
}

function weightedPlayerAverage(
  players: DraftedPlayer[],
  weights: number[],
  selector: (player: DraftedPlayer) => number
) {
  if (players.length === 0) return 60;

  const selected = players.slice(0, weights.length);
  const appliedWeights = selected.map((_, index) => weights[index] ?? 0);
  const totalWeight = appliedWeights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight === 0) return 60;

  const total = selected.reduce(
    (sum, player, index) => sum + selector(player) * appliedWeights[index],
    0
  );

  return total / totalWeight;
}

function qbRunValue(qb: DraftedPlayer | null) {
  if (!qb) return 40;
  const speed = speedRatingFromForty(qb.position, qb.forty);

  let factor = 0.15;
  if (qb.archetype === "Dual Threat") factor = 1.0;
  else if (qb.archetype === "Gunslinger") factor = 0.2;
  else if (qb.archetype === "Field General") factor = 0.15;

  return speed * factor;
}

function tendencyForOffense(strategy: string) {
  switch (strategy) {
    case "Pass Heavy":
      return 0.68;
    case "Run Heavy":
      return 0.38;
    default:
      return 0.53;
  }
}

function offenseFitBonus(strategy: string, ratings: TeamRatings) {
  const passAdvantage = ratings.pass - ratings.run;
  const runAdvantage = ratings.run - ratings.pass;

  switch (strategy) {
    case "Pass Heavy":
      return clamp(passAdvantage * 0.22, -4, 6);
    case "Run Heavy":
      return clamp(runAdvantage * 0.22, -4, 6);
    default:
      return clamp((4 - Math.abs(passAdvantage)) * 0.35, -1, 2);
  }
}

function offenseStrategyModifier(strategy: string, ratings: TeamRatings) {
  const fitBonus = offenseFitBonus(strategy, ratings);

  switch (strategy) {
    case "Pass Heavy":
      return {
        pass: ratings.pass + 5 + fitBonus,
        run: ratings.run - 5,
        bigPlay: ratings.bigPlay + 4 + fitBonus * 0.6,
        ballSecurity: ratings.ballSecurity - 3,
      };
    case "Run Heavy":
      return {
        pass: ratings.pass - 4,
        run: ratings.run + 5 + fitBonus,
        bigPlay: ratings.bigPlay - 2,
        ballSecurity: ratings.ballSecurity + 3 + fitBonus * 0.4,
      };
    default:
      return {
        pass: ratings.pass + fitBonus * 0.3,
        run: ratings.run + fitBonus * 0.3,
        bigPlay: ratings.bigPlay,
        ballSecurity: ratings.ballSecurity + 1,
      };
  }
}

function defenseFitBonus(strategy: string, ratings: TeamRatings) {
  switch (strategy) {
    case "Pressure":
      return clamp((ratings.pressure - ratings.passD) * 0.2, -3, 5);
    case "Coverage":
      return clamp((ratings.passD - ratings.pressure) * 0.2, -3, 5);
    default:
      return clamp((ratings.runD - 70) * 0.08, -1, 2);
  }
}

function defenseStrategyModifier(strategy: string, ratings: TeamRatings) {
  const fitBonus = defenseFitBonus(strategy, ratings);

  switch (strategy) {
    case "Pressure":
      return {
        passD: ratings.passD - 2,
        runD: ratings.runD - 1,
        pressure: ratings.pressure + 5 + fitBonus,
        takeaways: ratings.takeaways + 2 + fitBonus * 0.6,
      };
    case "Coverage":
      return {
        passD: ratings.passD + 5 + fitBonus,
        runD: ratings.runD - 3,
        pressure: ratings.pressure - 3,
        takeaways: ratings.takeaways + 1 + fitBonus * 0.5,
      };
    default:
      return {
        passD: ratings.passD,
        runD: ratings.runD + fitBonus * 0.4,
        pressure: ratings.pressure,
        takeaways: ratings.takeaways + fitBonus * 0.2,
      };
  }
}

function strategyMatchupBonus(
  offenseStyle: string,
  defenseStyle: string,
  offense: ReturnType<typeof buildTeamProfile>,
  defense: ReturnType<typeof buildTeamProfile>
) {
  let offenseBonus = 0;
  let defenseBonus = 0;

  if (offenseStyle === "Pass Heavy") {
    offenseBonus += clamp((offense.passAttack - offense.runAttack) * 0.04, -1.5, 3);
    if (defenseStyle === "Pressure") {
      defenseBonus += clamp((defense.pressure - offense.ballSecurity) * 0.05, -1, 3.5);
    }
    if (defenseStyle === "Coverage") {
      defenseBonus += clamp((defense.passDefense - offense.bigPlayAttack) * 0.04, -1, 2.5);
    }
  } else if (offenseStyle === "Run Heavy") {
    offenseBonus += clamp((offense.runAttack - offense.passAttack) * 0.04, -1.5, 3);
    if (defenseStyle === "Pressure") {
      offenseBonus += 1.2;
      defenseBonus -= 0.5;
    }
    if (defenseStyle === "Coverage") {
      offenseBonus += clamp((offense.runAttack - defense.runDefense) * 0.04, -0.5, 2.5);
    }
  } else {
    offenseBonus += 0.5;
  }

  if (defenseStyle === "Pressure" && offenseStyle !== "Run Heavy") {
    defenseBonus += clamp((defense.pressure - 72) * 0.03, 0, 1.6);
  }

  if (defenseStyle === "Coverage" && offenseStyle !== "Run Heavy") {
    defenseBonus += clamp((defense.passDefense - 72) * 0.03, 0, 1.6);
  }

  return { offenseBonus, defenseBonus };
}

function strategyVolatility(
  offenseStyle: string,
  defenseStyle: string,
  offense: ReturnType<typeof buildTeamProfile>,
  defense: ReturnType<typeof buildTeamProfile>
) {
  let offenseVolatility = 0;
  let defenseVolatility = 0;

  if (offenseStyle === "Pass Heavy") {
    offenseVolatility += 0.05 + clamp((offense.bigPlayAttack - offense.ballSecurity) * 0.0008, -0.01, 0.025);
  } else if (offenseStyle === "Run Heavy") {
    offenseVolatility -= 0.015;
  }

  if (defenseStyle === "Pressure") {
    defenseVolatility += 0.04 + clamp((defense.pressure - defense.passDefense) * 0.0008, -0.005, 0.02);
  } else if (defenseStyle === "Coverage") {
    defenseVolatility += 0.015;
  }

  return {
    offenseVolatility: clamp(offenseVolatility, -0.03, 0.08),
    defenseVolatility: clamp(defenseVolatility, 0, 0.07),
  };
}

function buildTeamProfile(
  team: DraftedPlayer[],
  ratings: TeamRatings,
  strategy: StrategySet
) {
  const qb = topPlayerByPosition(team, "QB");
  const rb = topPlayerByPosition(team, "RB");
  const te = topPlayerByPosition(team, "TE");
  const wrs = topTwoWRs(team);
  const qbs = playersByPosition(team, "QB");
  const rbs = playersByPosition(team, "RB");
  const tes = playersByPosition(team, "TE");
  const dls = playersByPosition(team, "DL");
  const lbs = playersByPosition(team, "LB");
  const secs = playersByPosition(team, "SEC");

  const wr1 = wrs[0] ?? null;
  const wr2 = wrs[1] ?? null;

  const adjOff = offenseStrategyModifier(strategy.offense, ratings);
  const adjDef = defenseStrategyModifier(strategy.defense, ratings);

  const qbGrade = weightedPlayerAverage(qbs, [1, 0.18], (player) => player.trueGrade);
  const rbGrade = weightedPlayerAverage(rbs, [1, 0.5, 0.22], (player) => player.trueGrade);
  const teGrade = weightedPlayerAverage(tes, [1, 0.35], (player) => player.trueGrade);
  const dlGrade = weightedPlayerAverage(dls, [1, 0.72, 0.45], (player) => player.trueGrade);
  const lbGrade = weightedPlayerAverage(lbs, [1, 0.72, 0.45], (player) => player.trueGrade);
  const secGrade = weightedPlayerAverage(secs, [1, 0.72, 0.45], (player) => player.trueGrade);

  const wrGroup = playersByPosition(team, "WR");
  const wrAvgGrade = weightedPlayerAverage(
    wrGroup,
    [1, 0.8, 0.5],
    (player) => player.trueGrade
  );
  const wrAvgSpeed = weightedPlayerAverage(
    wrGroup,
    [1, 0.8, 0.5],
    (player) => speedRatingFromForty(player.position, player.forty)
  );
  const rbSpeed = weightedPlayerAverage(
    rbs,
    [1, 0.4, 0.15],
    (player) => speedRatingFromForty(player.position, player.forty)
  );
  const qbMobility = qbRunValue(qb);

  const passAttack =
    0.5 * adjOff.pass +
    0.2 * qbGrade +
    0.15 * wrAvgGrade +
    0.08 * teGrade +
    0.07 * wrAvgSpeed;

  const runAttack =
    0.55 * adjOff.run +
    0.25 * rbGrade +
    0.1 * rbSpeed +
    0.1 * qbMobility;

  const bigPlayAttack =
    0.6 * adjOff.bigPlay +
    0.2 * wrAvgSpeed +
    0.1 * qbGrade +
    0.1 * rbSpeed;

  const ballSecurity =
    0.75 * adjOff.ballSecurity +
    0.15 * qbGrade +
    0.1 * rbGrade;

  const passDefense =
    0.6 * adjDef.passD +
    0.25 * secGrade +
    0.15 * lbGrade;

  const runDefense =
    0.6 * adjDef.runD +
    0.25 * dlGrade +
    0.15 * lbGrade;

  const pressure =
    0.65 * adjDef.pressure +
    0.35 * dlGrade;

  const takeaways =
    0.6 * adjDef.takeaways +
    0.25 * secGrade +
    0.15 * lbGrade;

  return {
    qb,
    rb,
    te,
    wr1,
    wr2,
    passAttack,
    runAttack,
    bigPlayAttack,
    ballSecurity,
    passDefense,
    runDefense,
    pressure,
    takeaways,
    passLean: tendencyForOffense(strategy.offense),
    offenseStyle: strategy.offense,
    defenseStyle: strategy.defense,
  };
}

function chooseTouchdownScorer(
  profile: ReturnType<typeof buildTeamProfile>,
  rand: () => number,
  preferPass: boolean
) {
  const candidates: { name: string; weight: number; kind: "pass" | "run" }[] = [];

  if (profile.wr1) candidates.push({ name: profile.wr1.name, weight: preferPass ? 30 : 18, kind: "pass" });
  if (profile.wr2) candidates.push({ name: profile.wr2.name, weight: preferPass ? 24 : 14, kind: "pass" });
  if (profile.te) candidates.push({ name: profile.te.name, weight: preferPass ? 16 : 12, kind: "pass" });
  if (profile.rb) candidates.push({ name: profile.rb.name, weight: preferPass ? 16 : 28, kind: "run" });
  if (profile.qb) candidates.push({ name: profile.qb.name, weight: preferPass ? 8 : 12, kind: "run" });

  if (candidates.length === 0) {
    return { name: "Unknown Player", kind: "pass" as const };
  }

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rand() * totalWeight;

  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }

  return candidates[0];
}

function chooseBigPlayMaker(
  profile: ReturnType<typeof buildTeamProfile>,
  rand: () => number,
  preferPass: boolean
) {
  const candidates: { name: string; weight: number; kind: "pass" | "run" }[] = [];

  if (profile.wr1) candidates.push({ name: profile.wr1.name, weight: preferPass ? 34 : 14, kind: "pass" });
  if (profile.wr2) candidates.push({ name: profile.wr2.name, weight: preferPass ? 24 : 10, kind: "pass" });
  if (profile.te) candidates.push({ name: profile.te.name, weight: preferPass ? 12 : 6, kind: "pass" });
  if (profile.rb) candidates.push({ name: profile.rb.name, weight: preferPass ? 10 : 28, kind: "run" });
  if (profile.qb) candidates.push({ name: profile.qb.name, weight: preferPass ? 8 : 10, kind: "run" });

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rand() * totalWeight;

  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }

  return candidates[0] ?? { name: "Unknown Player", kind: "pass" as const };
}

function initPlayerStats(team: DraftedPlayer[]) {
  return new Map(
    team.map((player) => [
      player.id,
      {
        playerId: player.id,
        name: player.name,
        position: player.position,
        passingYards: 0,
        passingTD: 0,
        interceptions: 0,
        rushYards: 0,
        rushTD: 0,
        carries: 0,
        receivingYards: 0,
        receivingTD: 0,
        receptions: 0,
      },
    ])
  );
}

function distributeIntegerTotal(
  recipients: Array<{ id: string; weight: number }>,
  total: number
) {
  if (total <= 0 || recipients.length === 0) return new Map<string, number>();

  const validRecipients = recipients.filter((recipient) => recipient.weight > 0);
  if (validRecipients.length === 0) return new Map<string, number>();

  const totalWeight = validRecipients.reduce((sum, recipient) => sum + recipient.weight, 0);
  const rawShares = validRecipients.map((recipient) => ({
    id: recipient.id,
    value: (recipient.weight / totalWeight) * total,
  }));
  const shares = new Map<string, number>();

  let assigned = 0;
  for (const share of rawShares) {
    const base = Math.floor(share.value);
    shares.set(share.id, base);
    assigned += base;
  }

  const remainders = rawShares
    .map((share) => ({
      id: share.id,
      remainder: share.value - Math.floor(share.value),
    }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let index = 0; index < total - assigned; index += 1) {
    const next = remainders[index % remainders.length];
    shares.set(next.id, (shares.get(next.id) ?? 0) + 1);
  }

  return shares;
}

function buildTeamGameStats(
  team: DraftedPlayer[],
  profile: ReturnType<typeof buildTeamProfile>,
  finalPoints: number,
  rand: () => number
) {
  const stats = initPlayerStats(team);
  const touchdowns = Math.max(0, Math.floor(finalPoints / 7));
  const totalYards = clamp(
    Math.round(
      195 +
        finalPoints * 13 +
        (profile.passAttack + profile.runAttack) * 0.9 +
        (rand() - 0.5) * 50
    ),
    150,
    520
  );
  const passShare = clamp(
    profile.passLean + (profile.offenseStyle === "Pass Heavy" ? 0.05 : profile.offenseStyle === "Run Heavy" ? -0.08 : 0),
    0.28,
    0.78
  );
  const passingYards = Math.round(totalYards * passShare);
  const rushingYards = Math.max(0, totalYards - passingYards);
  const passTouchdowns = clamp(
    Math.round(touchdowns * (passShare + (profile.offenseStyle === "Pass Heavy" ? 0.08 : 0))),
    0,
    touchdowns
  );
  const rushTouchdowns = Math.max(0, touchdowns - passTouchdowns);
  const totalReceptions = clamp(Math.round(passingYards / 11.2), 8, 34);
  const totalCarries = clamp(Math.round(rushingYards / 4.4), 12, 32);
  const interceptions = clamp(
    Math.round(
      (100 - profile.ballSecurity) * 0.03 +
        (profile.offenseStyle === "Pass Heavy" ? 0.4 : 0) +
        (rand() < 0.3 ? 1 : 0)
    ),
    0,
    3
  );

  const qb = profile.qb;
  const rb = profile.rb;
  const te = profile.te;
  const wr1 = profile.wr1;
  const wr2 = profile.wr2;

  if (qb) {
    const qbStats = stats.get(qb.id);
    if (qbStats) {
      qbStats.passingYards = passingYards;
      qbStats.passingTD = passTouchdowns;
      qbStats.interceptions = interceptions;
    }
  }

  const receptionShares = distributeIntegerTotal(
    [
      ...(wr1 ? [{ id: wr1.id, weight: 34 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 26 }] : []),
      ...(te ? [{ id: te.id, weight: 18 }] : []),
      ...(rb ? [{ id: rb.id, weight: 12 }] : []),
    ],
    totalReceptions
  );
  const receivingYardShares = distributeIntegerTotal(
    [
      ...(wr1 ? [{ id: wr1.id, weight: 38 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 28 }] : []),
      ...(te ? [{ id: te.id, weight: 18 }] : []),
      ...(rb ? [{ id: rb.id, weight: 16 }] : []),
    ],
    passingYards
  );
  const receivingTDShares = distributeIntegerTotal(
    [
      ...(wr1 ? [{ id: wr1.id, weight: 36 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 24 }] : []),
      ...(te ? [{ id: te.id, weight: 20 }] : []),
      ...(rb ? [{ id: rb.id, weight: 10 }] : []),
    ],
    passTouchdowns
  );
  const carryShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 34 }] : []),
      ...(qb ? [{ id: qb.id, weight: 12 }] : []),
      ...(te ? [{ id: te.id, weight: 3 }] : []),
    ],
    totalCarries
  );
  const rushingYardShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 36 }] : []),
      ...(qb ? [{ id: qb.id, weight: 14 }] : []),
      ...(te ? [{ id: te.id, weight: 3 }] : []),
    ],
    rushingYards
  );
  const rushingTDShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 32 }] : []),
      ...(qb ? [{ id: qb.id, weight: 12 }] : []),
    ],
    rushTouchdowns
  );

  for (const [playerId, receptions] of receptionShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.receptions = receptions;
  }

  for (const [playerId, yards] of receivingYardShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.receivingYards = yards;
  }

  for (const [playerId, touchdownsForPlayer] of receivingTDShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.receivingTD = touchdownsForPlayer;
  }

  for (const [playerId, carries] of carryShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.carries = carries;
  }

  for (const [playerId, yards] of rushingYardShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.rushYards = yards;
  }

  for (const [playerId, touchdownsForPlayer] of rushingTDShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.rushTD = touchdownsForPlayer;
  }

  return [...stats.values()].sort((a, b) => {
    const aImpact =
      a.passingTD * 12 +
      a.receivingTD * 8 +
      a.rushTD * 8 +
      a.passingYards * 0.08 +
      a.receivingYards * 0.1 +
      a.rushYards * 0.1;
    const bImpact =
      b.passingTD * 12 +
      b.receivingTD * 8 +
      b.rushTD * 8 +
      b.passingYards * 0.08 +
      b.receivingYards * 0.1 +
      b.rushYards * 0.1;
    return bImpact - aImpact;
  });
}

function bigPlayText(
  scoringTeamName: string,
  playerName: string,
  playKind: "pass" | "run",
  yardage: number
) {
  return playKind === "pass"
    ? `${scoringTeamName}: ${playerName} rips off a ${yardage}-yard catch-and-run to flip the quarter.`
    : `${scoringTeamName}: ${playerName} bursts loose for ${yardage} yards and swings field position.`;
}

function touchdownText(
  scoringTeamName: string,
  scorer: { name: string; kind: "pass" | "run" },
  yardage: number
) {
  return scorer.kind === "pass"
    ? `${scoringTeamName}: Touchdown on a ${yardage}-yard strike finished by ${scorer.name}.`
    : `${scoringTeamName}: ${scorer.name} punches in a ${yardage}-yard rushing touchdown.`;
}

function fieldGoalText(scoringTeamName: string, yardage: number) {
  return `${scoringTeamName}: ${yardage}-yard field goal is good, and the scoreboard moves.`;
}

function simulateQuarterTeamPoints(
  offenseTeamName: string,
  defenseTeamName: string,
  side: "A" | "B",
  offense: ReturnType<typeof buildTeamProfile>,
  defense: ReturnType<typeof buildTeamProfile>,
  rand: () => number
) {
  let points = 0;
  const highlights: Array<{ text: string; pointsA: number; pointsB: number; isScore: boolean }> = [];

  for (let drive = 0; drive < 3; drive++) {
    const passEdge = offense.passAttack - defense.passDefense;
    const runEdge = offense.runAttack - defense.runDefense;
    const bigPlayEdge =
      offense.bigPlayAttack - (defense.passDefense * 0.7 + defense.takeaways * 0.3);
    const turnoverPressure =
      defense.pressure * 0.55 + defense.takeaways * 0.45 - offense.ballSecurity;
    const { offenseBonus, defenseBonus } = strategyMatchupBonus(
      offense.offenseStyle,
      defense.defenseStyle,
      offense,
      defense
    );
    const { offenseVolatility, defenseVolatility } = strategyVolatility(
      offense.offenseStyle,
      defense.defenseStyle,
      offense,
      defense
    );
    const passLean = clamp(
      offense.passLean + clamp((passEdge - runEdge) * 0.004, -0.08, 0.08),
      0.3,
      0.75
    );
    const runLean = 1 - passLean;
    const baseAttackEdge = passEdge * passLean + runEdge * runLean;

    const overallEdge =
      0.58 * baseAttackEdge +
      0.15 * bigPlayEdge -
      0.12 * turnoverPressure +
      offenseBonus -
      defenseBonus;

    const swingFactor = (rand() - 0.5) * 2 * (offenseVolatility + defenseVolatility);
    const scoreChance = clamp(0.42 + overallEdge * 0.004 + swingFactor, 0.14, 0.8);

    if (rand() < scoreChance) {
      const tdChance = clamp(
        0.56 +
          bigPlayEdge * 0.0025 +
          passEdge * passLean * 0.0015 +
          runEdge * runLean * 0.0015 +
          (offense.offenseStyle === "Pass Heavy" ? 0.03 : 0) +
          (offense.offenseStyle === "Run Heavy" ? -0.01 : 0) -
          defenseBonus * 0.01 +
          swingFactor * 0.6,
        0.28,
        0.84
      );

      if (rand() < tdChance) {
        if (rand() < clamp(0.33 + bigPlayEdge * 0.002, 0.2, 0.7)) {
          const playmaker = chooseBigPlayMaker(offense, rand, passLean >= runLean);
          const yardage = clamp(
            Math.round(28 + rand() * 30 + Math.max(bigPlayEdge, 0) * 0.12),
            21,
            61
          );
          highlights.push({
            text: bigPlayText(offenseTeamName, playmaker.name, playmaker.kind, yardage),
            pointsA: 0,
            pointsB: 0,
            isScore: false,
          });
        }

        points += 7;
        const scorer = chooseTouchdownScorer(
          offense,
          rand,
          offense.offenseStyle === "Pass Heavy" || passLean >= runLean
        );
        const yardage = scorer.kind === "pass"
          ? clamp(Math.round(10 + rand() * 28), 7, 38)
          : clamp(Math.round(2 + rand() * 13), 1, 15);

        highlights.push({
          text: touchdownText(offenseTeamName, scorer, yardage),
          pointsA: side === "A" ? 7 : 0,
          pointsB: side === "B" ? 7 : 0,
          isScore: true,
        });
      } else {
        points += 3;
        highlights.push({
          text: fieldGoalText(
            offenseTeamName,
            clamp(Math.round(31 + rand() * 22), 29, 53)
          ),
          pointsA: side === "A" ? 3 : 0,
          pointsB: side === "B" ? 3 : 0,
          isScore: true,
        });
      }
    } else {
      const turnoverChance = clamp(
        0.11 +
          turnoverPressure * 0.002 +
          (defense.defenseStyle === "Pressure" ? 0.015 : 0) +
          (offense.offenseStyle === "Pass Heavy" ? 0.01 : 0) -
          (offense.offenseStyle === "Run Heavy" ? 0.01 : 0) +
          defenseVolatility * 0.4,
        0.04,
        0.34
      );
      if (rand() < turnoverChance && highlights.length < 4) {
        highlights.push({
          text:
            rand() < 0.5
              ? `${defenseTeamName}: pressure blows up the drive and forces a brutal mistake.`
              : `${defenseTeamName}: a takeaway wipes out a promising possession.`,
          pointsA: 0,
          pointsB: 0,
          isScore: false,
        });
      }
    }
  }

  return { points, highlights };
}

export function simulateGame(setup: GameSetup): SimResult {
  const rand = mulberry32(setup.simSeed || Date.now());

  const teamAProfile = buildTeamProfile(
    setup.teamA,
    setup.teamARatings,
    setup.teamAStrategy
  );
  const teamBProfile = buildTeamProfile(
    setup.teamB,
    setup.teamBRatings,
    setup.teamBStrategy
  );

  let runningA = 0;
  let runningB = 0;

  const quarters: QuarterResult[] = [];

  for (let i = 0; i < 4; i++) {
    const aQuarter = simulateQuarterTeamPoints(
      setup.teamAName,
      setup.teamBName,
      "A",
      teamAProfile,
      teamBProfile,
      rand
    );
    const bQuarter = simulateQuarterTeamPoints(
      setup.teamBName,
      setup.teamAName,
      "B",
      teamBProfile,
      teamAProfile,
      rand
    );

    runningA += aQuarter.points;
    runningB += bQuarter.points;

    const quarterPlays: string[] = [];
    const mergedHighlights: QuarterHighlight[] = [];
    const aHighlights = [...aQuarter.highlights];
    const bHighlights = [...bQuarter.highlights];
    let quarterRunningA = i > 0 ? quarters[i - 1].scoreA : 0;
    let quarterRunningB = i > 0 ? quarters[i - 1].scoreB : 0;
    let highlightIndex = 0;
    const startWithA = rand() < 0.5;

    while (aHighlights.length > 0 || bHighlights.length > 0) {
      const pullFromA =
        aHighlights.length === 0
          ? false
          : bHighlights.length === 0
            ? true
            : (mergedHighlights.length % 2 === 0 ? startWithA : !startWithA);

      const next = pullFromA ? aHighlights.shift() : bHighlights.shift();
      if (!next) continue;

      quarterRunningA += next.pointsA;
      quarterRunningB += next.pointsB;
      quarterPlays.push(next.text);
      mergedHighlights.push({
        id: `q${i + 1}-h${highlightIndex + 1}`,
        text: next.text,
        scoreA: quarterRunningA,
        scoreB: quarterRunningB,
        isScore: next.isScore,
      });
      highlightIndex += 1;
    }

    if (mergedHighlights.length === 0) {
      mergedHighlights.push({
        id: `q${i + 1}-h1`,
        text: "Both defenses hold firm for long stretches.",
        scoreA: runningA,
        scoreB: runningB,
        isScore: false,
      });
      quarterPlays.push("Both defenses hold firm for long stretches.");
    }

    quarters.push({
      quarter: i + 1,
      scoreA: runningA,
      scoreB: runningB,
      plays: quarterPlays.slice(0, 4),
      highlights: mergedHighlights,
    });
  }

  return {
    finalA: runningA,
    finalB: runningB,
    quarters,
    teamAStats: buildTeamGameStats(setup.teamA, teamAProfile, runningA, rand),
    teamBStats: buildTeamGameStats(setup.teamB, teamBProfile, runningB, rand),
  };
}
