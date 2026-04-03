import type { DraftedPlayer } from "./game/types";
import {
  getPlayerIQ,
  getPlayerPower,
  getPlayerSpeed,
  getPlayerTechnical,
} from "./game/playerRatings";

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
  tackles: number;
  sacks: number;
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
  const speed = getPlayerSpeed(qb);

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

  const qbTech = weightedPlayerAverage(qbs, [1, 0.18], (player) => getPlayerTechnical(player));
  const qbIQ = weightedPlayerAverage(qbs, [1, 0.18], (player) => getPlayerIQ(player));
  const rbPower = weightedPlayerAverage(rbs, [1, 0.5, 0.22], (player) => getPlayerPower(player));
  const rbTech = weightedPlayerAverage(rbs, [1, 0.5, 0.22], (player) => getPlayerTechnical(player));
  const teTech = weightedPlayerAverage(tes, [1, 0.35], (player) => getPlayerTechnical(player));
  const dlPower = weightedPlayerAverage(dls, [1, 0.72, 0.45], (player) => getPlayerPower(player));
  const dlTech = weightedPlayerAverage(dls, [1, 0.72, 0.45], (player) => getPlayerTechnical(player));
  const lbIQ = weightedPlayerAverage(lbs, [1, 0.72, 0.45], (player) => getPlayerIQ(player));
  const lbPower = weightedPlayerAverage(lbs, [1, 0.72, 0.45], (player) => getPlayerPower(player));
  const secIQ = weightedPlayerAverage(secs, [1, 0.72, 0.45], (player) => getPlayerIQ(player));
  const secSpeed = weightedPlayerAverage(secs, [1, 0.72, 0.45], (player) => getPlayerSpeed(player));

  const wrGroup = playersByPosition(team, "WR");
  const wrAvgGrade = weightedPlayerAverage(
    wrGroup,
    [1, 0.8, 0.5],
    (player) => player.trueGrade
  );
  const wrAvgSpeed = weightedPlayerAverage(
    wrGroup,
    [1, 0.8, 0.5],
    (player) => getPlayerSpeed(player)
  );
  const wrAvgTech = weightedPlayerAverage(
    wrGroup,
    [1, 0.8, 0.5],
    (player) => getPlayerTechnical(player)
  );
  const rbSpeed = weightedPlayerAverage(
    rbs,
    [1, 0.4, 0.15],
    (player) => getPlayerSpeed(player)
  );
  const qbMobility = qbRunValue(qb);

  const passAttack =
    0.5 * adjOff.pass +
    0.18 * qbTech +
    0.14 * qbIQ +
    0.1 * wrAvgGrade +
    0.1 * wrAvgTech +
    0.06 * teTech +
    0.06 * wrAvgSpeed;

  const runAttack =
    0.55 * adjOff.run +
    0.17 * rbPower +
    0.12 * rbTech +
    0.1 * rbSpeed +
    0.06 * qbMobility;

  const bigPlayAttack =
    0.6 * adjOff.bigPlay +
    0.18 * wrAvgSpeed +
    0.1 * qbMobility +
    0.06 * wrAvgTech +
    0.06 * rbSpeed;

  const ballSecurity =
    0.75 * adjOff.ballSecurity +
    0.15 * qbIQ +
    0.06 * rbTech +
    0.04 * teTech;

  const passDefense =
    0.6 * adjDef.passD +
    0.18 * secIQ +
    0.1 * secSpeed +
    0.12 * lbIQ;

  const runDefense =
    0.6 * adjDef.runD +
    0.22 * dlPower +
    0.08 * lbPower +
    0.05 * lbIQ;

  const pressure =
    0.65 * adjDef.pressure +
    0.2 * dlPower +
    0.1 * dlTech +
    0.05 * lbIQ;

  const takeaways =
    0.6 * adjDef.takeaways +
    0.18 * secIQ +
    0.1 * secSpeed +
    0.07 * lbIQ;

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

  if (profile.wr1) candidates.push({ name: profile.wr1.name, weight: (preferPass ? 30 : 18) + touchdownWeightBonus(profile.wr1), kind: "pass" });
  if (profile.wr2) candidates.push({ name: profile.wr2.name, weight: (preferPass ? 24 : 14) + touchdownWeightBonus(profile.wr2), kind: "pass" });
  if (profile.te) candidates.push({ name: profile.te.name, weight: (preferPass ? 16 : 12) + touchdownWeightBonus(profile.te), kind: "pass" });
  if (profile.rb) candidates.push({ name: profile.rb.name, weight: (preferPass ? 16 : 28) + touchdownWeightBonus(profile.rb), kind: "run" });
  if (profile.qb) candidates.push({ name: profile.qb.name, weight: (preferPass ? 8 : 12) + touchdownWeightBonus(profile.qb), kind: "run" });

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

function touchdownWeightBonus(player: DraftedPlayer | null) {
  if (!player) return 0;

  switch (player.archetype) {
    case "Red Zone Target":
      return 8;
    case "Vertical Threat":
    case "Deep Threat":
    case "Dual Threat":
    case "Power Back":
    case "Playmaker":
      return 5;
    case "Possession TE":
    case "YAC Specialist":
    case "Receiving Back":
      return 3;
    default:
      return 0;
  }
}

function explosiveWeightBonus(player: DraftedPlayer | null) {
  if (!player) return 0;

  switch (player.archetype) {
    case "Deep Threat":
    case "Vertical Threat":
    case "YAC Specialist":
    case "Dual Threat":
    case "Elusive Back":
    case "Playmaker":
      return 8;
    case "Gunslinger":
    case "Receiving Back":
    case "Ball Hawk":
      return 4;
    default:
      return 0;
  }
}

function defensivePlayBonus(player: DraftedPlayer | null) {
  if (!player) return 0;

  switch (player.archetype) {
    case "Pass Rusher":
    case "Ball Hawk":
      return 8;
    case "Lockdown":
    case "Coverage LB":
    case "Playmaker":
      return 5;
    case "Run Stopper":
    case "Run Support":
      return 3;
    default:
      return 0;
  }
}

function chooseBigPlayMaker(
  profile: ReturnType<typeof buildTeamProfile>,
  rand: () => number,
  preferPass: boolean
) {
  const candidates: { name: string; weight: number; kind: "pass" | "run" }[] = [];

  if (profile.wr1) candidates.push({ name: profile.wr1.name, weight: (preferPass ? 34 : 14) + explosiveWeightBonus(profile.wr1), kind: "pass" });
  if (profile.wr2) candidates.push({ name: profile.wr2.name, weight: (preferPass ? 24 : 10) + explosiveWeightBonus(profile.wr2), kind: "pass" });
  if (profile.te) candidates.push({ name: profile.te.name, weight: (preferPass ? 12 : 6) + explosiveWeightBonus(profile.te), kind: "pass" });
  if (profile.rb) candidates.push({ name: profile.rb.name, weight: (preferPass ? 10 : 28) + explosiveWeightBonus(profile.rb), kind: "run" });
  if (profile.qb) candidates.push({ name: profile.qb.name, weight: (preferPass ? 8 : 10) + explosiveWeightBonus(profile.qb), kind: "run" });

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
        tackles: 0,
        sacks: 0,
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

type OffensiveOutput = {
  stats: Map<string, PlayerGameStats>;
  passingYards: number;
  rushingYards: number;
  passingTD: number;
  rushingTD: number;
  interceptionsThrown: number;
  totalYards: number;
  totalCarries: number;
  totalReceptions: number;
  sacksAllowed: number;
  drives: number;
  explosivePlays: number;
  redZoneTrips: number;
};

type TeamSimTotals = {
  points: number;
  passingYards: number;
  rushingYards: number;
  passingTD: number;
  rushingTD: number;
  fieldGoals: number;
  interceptionsThrown: number;
  sacksAllowed: number;
  totalCarries: number;
  totalReceptions: number;
  drives: number;
  explosivePlays: number;
  redZoneTrips: number;
};

function buildOffenseGameStats(
  team: DraftedPlayer[],
  profile: ReturnType<typeof buildTeamProfile>,
  totals: TeamSimTotals
) : OffensiveOutput {
  const stats = initPlayerStats(team);
  const passingYards = totals.passingYards;
  const rushingYards = totals.rushingYards;
  const passTouchdowns = totals.passingTD;
  const rushTouchdowns = totals.rushingTD;
  const totalReceptions = totals.totalReceptions;
  const totalCarries = totals.totalCarries;
  const interceptionsThrown = totals.interceptionsThrown;
  const totalYards = totals.passingYards + totals.rushingYards;

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
      qbStats.interceptions = interceptionsThrown;
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

  return {
    stats,
    passingYards,
    rushingYards,
    passingTD: passTouchdowns,
    rushingTD: rushTouchdowns,
    interceptionsThrown,
    totalYards,
    totalCarries,
    totalReceptions,
    sacksAllowed: totals.sacksAllowed,
    drives: totals.drives,
    explosivePlays: totals.explosivePlays,
    redZoneTrips: totals.redZoneTrips,
  };
}

function applyDefensiveGameStats(
  team: DraftedPlayer[],
  profile: ReturnType<typeof buildTeamProfile>,
  opponentOutput: OffensiveOutput,
  opponentProfile: ReturnType<typeof buildTeamProfile>,
  stats: Map<string, PlayerGameStats>,
  rand: () => number
) {
  const dls = playersByPosition(team, "DL");
  const lbs = playersByPosition(team, "LB");
  const secs = playersByPosition(team, "SEC");
  const totalTackles = clamp(
    Math.round(
      22 +
        opponentOutput.totalCarries * 0.8 +
        opponentOutput.totalReceptions * 0.75 +
        opponentOutput.redZoneTrips * 1.5 +
        opponentOutput.interceptionsThrown * 1.4 +
        rand() * 7
    ),
    24,
    52
  );
  const totalSacks = clamp(
    opponentOutput.sacksAllowed +
      Math.round(
        (profile.pressure - opponentProfile.ballSecurity) * 0.015 +
          (rand() - 0.5) * 1.4
      ),
    0,
    6
  );
  const totalInterceptions = opponentOutput.interceptionsThrown;

  const tackleShares = distributeIntegerTotal(
    [
      ...dls.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([14, 10, 6][index] ?? 4) + defensivePlayBonus(player) * 0.3,
      })),
      ...lbs.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([18, 13, 8][index] ?? 5) + defensivePlayBonus(player) * 0.35,
      })),
      ...secs.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([12, 9, 6][index] ?? 4) + defensivePlayBonus(player) * 0.25,
      })),
    ],
    totalTackles
  );
  const sackShares = distributeIntegerTotal(
    [
      ...dls.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([20, 13, 7][index] ?? 4) + defensivePlayBonus(player),
      })),
      ...lbs.slice(0, 2).map((player, index) => ({
        id: player.id,
        weight: ([10, 6][index] ?? 3) + defensivePlayBonus(player) * 0.6,
      })),
      ...secs.slice(0, 1).map((player) => ({ id: player.id, weight: 2 })),
    ],
    totalSacks
  );
  const interceptionShares = distributeIntegerTotal(
    [
      ...secs.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([18, 12, 7][index] ?? 4) + defensivePlayBonus(player),
      })),
      ...lbs.slice(0, 2).map((player, index) => ({
        id: player.id,
        weight: ([7, 4][index] ?? 2) + defensivePlayBonus(player) * 0.5,
      })),
    ],
    totalInterceptions
  );

  for (const [playerId, tackles] of tackleShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.tackles = tackles;
  }

  for (const [playerId, sacks] of sackShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.sacks = sacks;
  }

  for (const [playerId, interceptions] of interceptionShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.interceptions += interceptions;
  }
}

function sortPlayerStats(stats: Map<string, PlayerGameStats>) {
  return [...stats.values()].sort((a, b) => {
    const aImpact =
      a.passingTD * 12 +
      a.receivingTD * 8 +
      a.rushTD * 8 +
      a.interceptions * (a.position === "QB" ? -5 : 10) +
      a.sacks * 8 +
      a.tackles * 0.75 +
      a.passingYards * 0.08 +
      a.receivingYards * 0.1 +
      a.rushYards * 0.1;
    const bImpact =
      b.passingTD * 12 +
      b.receivingTD * 8 +
      b.rushTD * 8 +
      b.interceptions * (b.position === "QB" ? -5 : 10) +
      b.sacks * 8 +
      b.tackles * 0.75 +
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

function driveCountForQuarter(
  offense: ReturnType<typeof buildTeamProfile>,
  scoreDiff: number,
  quarter: number
) {
  let drives = 3;

  if (offense.offenseStyle === "Pass Heavy") drives += 1;
  if (offense.offenseStyle === "Run Heavy") drives -= 1;

  if (quarter >= 3 && scoreDiff <= -10) drives += 1;
  if (quarter >= 3 && scoreDiff >= 10) drives -= 1;

  return clamp(drives, 2, 4);
}

function gameScriptPassLean(basePassLean: number, scoreDiff: number, quarter: number) {
  const urgency =
    quarter >= 4 ? 0.14 : quarter === 3 ? 0.1 : 0.05;

  if (scoreDiff <= -10) {
    return clamp(basePassLean + urgency, 0.32, 0.84);
  }

  if (scoreDiff >= 10) {
    return clamp(basePassLean - urgency * 0.8, 0.22, 0.74);
  }

  return clamp(basePassLean, 0.26, 0.8);
}

function emptyTotals(): TeamSimTotals {
  return {
    points: 0,
    passingYards: 0,
    rushingYards: 0,
    passingTD: 0,
    rushingTD: 0,
    fieldGoals: 0,
    interceptionsThrown: 0,
    sacksAllowed: 0,
    totalCarries: 0,
    totalReceptions: 0,
    drives: 0,
    explosivePlays: 0,
    redZoneTrips: 0,
  };
}

function addTotals(base: TeamSimTotals, next: TeamSimTotals) {
  return {
    points: base.points + next.points,
    passingYards: base.passingYards + next.passingYards,
    rushingYards: base.rushingYards + next.rushingYards,
    passingTD: base.passingTD + next.passingTD,
    rushingTD: base.rushingTD + next.rushingTD,
    fieldGoals: base.fieldGoals + next.fieldGoals,
    interceptionsThrown: base.interceptionsThrown + next.interceptionsThrown,
    sacksAllowed: base.sacksAllowed + next.sacksAllowed,
    totalCarries: base.totalCarries + next.totalCarries,
    totalReceptions: base.totalReceptions + next.totalReceptions,
    drives: base.drives + next.drives,
    explosivePlays: base.explosivePlays + next.explosivePlays,
    redZoneTrips: base.redZoneTrips + next.redZoneTrips,
  };
}

function simulateQuarterTeamPoints(
  offenseTeamName: string,
  defenseTeamName: string,
  side: "A" | "B",
  offense: ReturnType<typeof buildTeamProfile>,
  defense: ReturnType<typeof buildTeamProfile>,
  scoreDiff: number,
  quarter: number,
  rand: () => number
) {
  let points = 0;
  let passingYards = 0;
  let rushingYards = 0;
  let passingTD = 0;
  let rushingTD = 0;
  let fieldGoals = 0;
  let interceptionsThrown = 0;
  let sacksAllowed = 0;
  let totalCarries = 0;
  let totalReceptions = 0;
  let explosivePlays = 0;
  let redZoneTrips = 0;
  const highlights: Array<{ text: string; pointsA: number; pointsB: number; isScore: boolean }> = [];
  const drives = driveCountForQuarter(offense, scoreDiff, quarter);

  for (let drive = 0; drive < drives; drive++) {
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
    const passLean = gameScriptPassLean(
      clamp(
        offense.passLean + clamp((passEdge - runEdge) * 0.004, -0.08, 0.08),
        0.3,
        0.75
      ),
      scoreDiff,
      quarter
    );
    const runLean = 1 - passLean;
    const swingFactor = (rand() - 0.5) * 2 * (offenseVolatility + defenseVolatility);
    const preferPass = passLean >= runLean;
    const chosenEdge = preferPass ? passEdge : runEdge;
    const successChance = clamp(
      0.4 +
        chosenEdge * 0.004 +
        offenseBonus * 0.012 -
        defenseBonus * 0.012 +
        (quarter >= 4 && scoreDiff <= -7 ? 0.04 : 0),
      0.18,
      0.82
    );
    const explosiveChance = clamp(
      0.1 +
        bigPlayEdge * 0.003 +
        (preferPass ? 0.03 : 0.01) +
        offenseVolatility * 0.5 -
        defense.passDefense * 0.0006,
      0.03,
      0.42
    );
    const pressureChance = clamp(
      0.12 +
        (defense.pressure - offense.ballSecurity) * 0.0025 +
        (defense.defenseStyle === "Pressure" ? 0.04 : 0) +
        (preferPass ? 0.02 : -0.01),
      0.03,
      0.36
    );
    const turnoverChance = clamp(
      0.05 +
        turnoverPressure * 0.0025 +
        (preferPass ? 0.02 : 0) +
        (defense.defenseStyle === "Coverage" ? 0.015 : 0) +
        defenseVolatility * 0.45,
      0.02,
      0.28
    );

    if (rand() < turnoverChance) {
      const turnoverYards = clamp(Math.round(6 + rand() * 18), 4, 20);
      if (preferPass) {
        passingYards += turnoverYards;
        totalReceptions += 1;
        interceptionsThrown += 1;
      } else {
        rushingYards += turnoverYards;
        totalCarries += 2;
      }
      highlights.push({
        text:
          preferPass
            ? rand() < 0.5
              ? `${defenseTeamName}: a ball hawk jumps the throw and kills the drive.`
              : `${defenseTeamName}: the quarterback forces it, and the takeaway swings the quarter.`
            : rand() < 0.5
            ? `${defenseTeamName}: a takeaway flips the drive before points can land.`
            : `${defenseTeamName}: the offense presses, and the ball comes out.`,
        pointsA: 0,
        pointsB: 0,
        isScore: false,
      });
      continue;
    }

    let redZoneBoost = 0;
    if (rand() < explosiveChance) {
      const playmaker = chooseBigPlayMaker(offense, rand, preferPass);
      const yardage = clamp(
        Math.round(24 + rand() * 34 + Math.max(bigPlayEdge, 0) * 0.14),
        18,
        68
      );
      redZoneBoost += 0.18;
      explosivePlays += 1;
      if (playmaker.kind === "pass") {
        passingYards += yardage;
        totalReceptions += 1;
      } else {
        rushingYards += yardage;
        totalCarries += clamp(Math.round(yardage / 11), 1, 3);
      }
      highlights.push({
        text: bigPlayText(offenseTeamName, playmaker.name, playmaker.kind, yardage),
        pointsA: 0,
        pointsB: 0,
        isScore: false,
      });
    }

    const stalledByPressure = rand() < pressureChance;
    const driveFinishChance = clamp(successChance + redZoneBoost + swingFactor, 0.12, 0.88);

    if (stalledByPressure && driveFinishChance < 0.62) {
      sacksAllowed += 1;
      if (preferPass) {
        passingYards += clamp(Math.round(6 + rand() * 12), 3, 18);
        totalReceptions += 1;
      } else {
        rushingYards += clamp(Math.round(4 + rand() * 10), 2, 14);
        totalCarries += 2;
      }
      highlights.push({
        text: `${defenseTeamName}: pressure wrecks the timing and forces the punt team on.`,
        pointsA: 0,
        pointsB: 0,
        isScore: false,
      });
      continue;
    }

    if (rand() < driveFinishChance) {
      const driveYards = clamp(
        Math.round(18 + rand() * 28 + Math.max(chosenEdge, 0) * 0.12 + redZoneBoost * 35),
        14,
        72
      );
      redZoneTrips += driveYards >= 35 ? 1 : 0;
      const tdChance = clamp(
        0.45 +
          redZoneBoost +
          bigPlayEdge * 0.002 +
          chosenEdge * 0.0018 +
          (offense.offenseStyle === "Pass Heavy" ? 0.03 : 0) -
          (defense.defenseStyle === "Pressure" ? 0.015 : 0) +
          swingFactor * 0.45,
        0.2,
        0.86
      );

      if (rand() < tdChance) {
        points += 7;
        const scorer = chooseTouchdownScorer(offense, rand, preferPass);
        const yardage =
          scorer.kind === "pass"
            ? clamp(Math.round(8 + rand() * 31), 5, 39)
            : clamp(Math.round(1 + rand() * 14), 1, 15);

        if (scorer.kind === "pass") {
          passingTD += 1;
          passingYards += driveYards;
          totalReceptions += clamp(Math.round(driveYards / 14), 1, 4);
        } else {
          rushingTD += 1;
          rushingYards += driveYards;
          totalCarries += clamp(Math.round(driveYards / 5.5), 3, 8);
        }

        highlights.push({
          text: touchdownText(offenseTeamName, scorer, yardage),
          pointsA: side === "A" ? 7 : 0,
          pointsB: side === "B" ? 7 : 0,
          isScore: true,
        });
      } else {
        points += 3;
        fieldGoals += 1;
        if (preferPass) {
          passingYards += driveYards;
          totalReceptions += clamp(Math.round(driveYards / 15), 1, 4);
        } else {
          rushingYards += Math.round(driveYards * 0.55);
          passingYards += Math.round(driveYards * 0.45);
          totalCarries += clamp(Math.round(driveYards / 10), 2, 5);
          totalReceptions += clamp(Math.round(driveYards / 18), 1, 3);
        }
        highlights.push({
          text: fieldGoalText(offenseTeamName, clamp(Math.round(28 + rand() * 25), 27, 54)),
          pointsA: side === "A" ? 3 : 0,
          pointsB: side === "B" ? 3 : 0,
          isScore: true,
        });
      }
      continue;
    }

    if (highlights.length < 5) {
      const emptyDriveYards = clamp(Math.round(7 + rand() * 18 + Math.max(chosenEdge, -4) * 0.4), 4, 28);
      if (preferPass) {
        passingYards += Math.round(emptyDriveYards * 0.7);
        totalReceptions += clamp(Math.round(emptyDriveYards / 16), 1, 3);
      } else {
        rushingYards += Math.round(emptyDriveYards * 0.6);
        totalCarries += clamp(Math.round(emptyDriveYards / 6), 2, 5);
      }
      highlights.push({
        text:
          rand() < 0.5
            ? `${defenseTeamName}: the drive crosses midfield, but the stop comes in time.`
            : `${offenseTeamName}: a promising march stalls just outside scoring range.`,
        pointsA: 0,
        pointsB: 0,
        isScore: false,
      });
    }
  }

  return {
    points,
    highlights,
    totals: {
      points,
      passingYards,
      rushingYards,
      passingTD,
      rushingTD,
      fieldGoals,
      interceptionsThrown,
      sacksAllowed,
      totalCarries,
      totalReceptions,
      drives,
      explosivePlays,
      redZoneTrips,
    },
  };
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
  let totalsA = emptyTotals();
  let totalsB = emptyTotals();

  const quarters: QuarterResult[] = [];

  for (let i = 0; i < 4; i++) {
    const quarterNumber = i + 1;
    const preQuarterDiff = runningA - runningB;
    const aQuarter = simulateQuarterTeamPoints(
      setup.teamAName,
      setup.teamBName,
      "A",
      teamAProfile,
      teamBProfile,
      preQuarterDiff,
      quarterNumber,
      rand
    );
    const bQuarter = simulateQuarterTeamPoints(
      setup.teamBName,
      setup.teamAName,
      "B",
      teamBProfile,
      teamAProfile,
      -preQuarterDiff - aQuarter.points,
      quarterNumber,
      rand
    );

    runningA += aQuarter.points;
    runningB += bQuarter.points;
    totalsA = addTotals(totalsA, aQuarter.totals);
    totalsB = addTotals(totalsB, bQuarter.totals);

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

  const teamAOffense = buildOffenseGameStats(
    setup.teamA,
    teamAProfile,
    totalsA
  );
  const teamBOffense = buildOffenseGameStats(
    setup.teamB,
    teamBProfile,
    totalsB
  );

  applyDefensiveGameStats(
    setup.teamA,
    teamAProfile,
    teamBOffense,
    teamBProfile,
    teamAOffense.stats,
    rand
  );
  applyDefensiveGameStats(
    setup.teamB,
    teamBProfile,
    teamAOffense,
    teamAProfile,
    teamBOffense.stats,
    rand
  );

  return {
    finalA: runningA,
    finalB: runningB,
    quarters,
    teamAStats: sortPlayerStats(teamAOffense.stats),
    teamBStats: sortPlayerStats(teamBOffense.stats),
  };
}
