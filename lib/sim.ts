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

export type SimOptions = {
  startQuarter?: number;
  endQuarter?: number;
  initialScoreA?: number;
  initialScoreB?: number;
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
  clock: string;
  scoreA: number;
  scoreB: number;
  isScore: boolean;
  possession: "A" | "B";
  eventType: "explosive" | "touchdown" | "fieldGoal" | "turnover" | "stop";
  eventDetail?: "interception" | "fumble" | "stripSack";
  playKind: "pass" | "run" | "sack" | "fieldGoal" | "turnover" | "punt";
  downDistance: string;
  driveId: string;
  startYardLine: number;
  endYardLine: number;
  yards: number;
  driveSummary: string;
  closeMoment: boolean;
};

export type PlayerGameStats = {
  playerId: string;
  name: string;
  position: DraftedPlayer["position"];
  passingYards: number;
  passingTD: number;
  interceptions: number;
  fumblesLost: number;
  tackles: number;
  sacks: number;
  forcedFumbles: number;
  fumbleRecoveries: number;
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
      defenseBonus += clamp((defense.pressure - offense.ballSecurity) * 0.075, -1, 4.5);
      offenseBonus -= clamp((defense.pressure - offense.ballSecurity) * 0.018, 0, 1.2);
    }
    if (defenseStyle === "Coverage") {
      defenseBonus += clamp((defense.passDefense - offense.bigPlayAttack) * 0.055, -1, 3.3);
    }
  } else if (offenseStyle === "Run Heavy") {
    offenseBonus += clamp((offense.runAttack - offense.passAttack) * 0.04, -1.5, 3);
    if (defenseStyle === "Pressure") {
      offenseBonus += 1.8;
      defenseBonus -= 0.9;
    }
    if (defenseStyle === "Coverage") {
      offenseBonus += clamp((offense.runAttack - defense.runDefense) * 0.055, -0.5, 3.2);
      defenseBonus -= 0.5;
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
  const dl1 = dls[0] ?? null;
  const lb1 = lbs[0] ?? null;
  const sec1 = secs[0] ?? null;

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
    dl1,
    lb1,
    sec1,
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

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;

  const lastName = parts[parts.length - 1];
  return `${parts[0][0]}. ${lastName}`;
}

function choosePassTarget(profile: ReturnType<typeof buildTeamProfile>, rand: () => number) {
  const candidates: { name: string; weight: number }[] = [];

  if (profile.wr1) candidates.push({ name: profile.wr1.name, weight: 34 + explosiveWeightBonus(profile.wr1) * 0.4 });
  if (profile.wr2) candidates.push({ name: profile.wr2.name, weight: 26 + explosiveWeightBonus(profile.wr2) * 0.35 });
  if (profile.te) candidates.push({ name: profile.te.name, weight: 18 + touchdownWeightBonus(profile.te) * 0.25 });
  if (profile.rb) candidates.push({ name: profile.rb.name, weight: 13 + explosiveWeightBonus(profile.rb) * 0.2 });

  return weightedChoice(candidates, rand)?.name ?? "Unknown Player";
}

function chooseRunner(profile: ReturnType<typeof buildTeamProfile>, rand: () => number) {
  const candidates: { name: string; weight: number }[] = [];

  if (profile.rb) candidates.push({ name: profile.rb.name, weight: 46 + explosiveWeightBonus(profile.rb) * 0.55 });
  if (profile.qb) candidates.push({ name: profile.qb.name, weight: 12 + explosiveWeightBonus(profile.qb) * 0.25 });
  if (profile.te) candidates.push({ name: profile.te.name, weight: 3 });

  return weightedChoice(candidates, rand)?.name ?? "Unknown Player";
}

function chooseDefender(
  profile: ReturnType<typeof buildTeamProfile>,
  rand: () => number,
  kind: "sack" | "coverage" | "fumble"
) {
  const candidates: { name: string; weight: number }[] = [];

  if (profile.dl1) {
    candidates.push({
      name: profile.dl1.name,
      weight: kind === "sack" ? 36 : kind === "fumble" ? 22 : 8,
    });
  }
  if (profile.lb1) {
    candidates.push({
      name: profile.lb1.name,
      weight: kind === "coverage" ? 18 : kind === "fumble" ? 30 : 22,
    });
  }
  if (profile.sec1) {
    candidates.push({
      name: profile.sec1.name,
      weight: kind === "coverage" ? 38 : kind === "fumble" ? 18 : 5,
    });
  }

  return weightedChoice(candidates, rand)?.name ?? "Unknown Defender";
}

function weightedChoice<T extends { weight: number }>(candidates: T[], rand: () => number) {
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rand() * totalWeight;

  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }

  return candidates[0];
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
        fumblesLost: 0,
        tackles: 0,
        sacks: 0,
        forcedFumbles: 0,
        fumbleRecoveries: 0,
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
  fumblesLost: number;
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
  fumblesLost: number;
  sacksAllowed: number;
  totalCarries: number;
  totalReceptions: number;
  drives: number;
  explosivePlays: number;
  redZoneTrips: number;
};

type LocalSimHighlight = {
  text: string;
  pointsA: number;
  pointsB: number;
  isScore: boolean;
  possession: "A" | "B";
  eventType: QuarterHighlight["eventType"];
  eventDetail?: QuarterHighlight["eventDetail"];
  playKind: QuarterHighlight["playKind"];
  downDistance: string;
  driveId: string;
  startYardLine: number;
  endYardLine: number;
  yards: number;
  driveSummary: string;
  closeMoment: boolean;
};

type PlayKind = "pass" | "run" | "sack" | "fieldGoal" | "turnover" | "punt";

type DrivePlay = {
  text: string;
  yards: number;
  eventType: QuarterHighlight["eventType"];
  eventDetail?: QuarterHighlight["eventDetail"];
  isScore?: boolean;
  points?: number;
  kind: PlayKind;
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
  const fumblesLost = totals.fumblesLost;
  const totalYards = totals.passingYards + totals.rushingYards;

  const qb = profile.qb;
  const rb = profile.rb;
  const te = profile.te;
  const wr1 = profile.wr1;
  const wr2 = profile.wr2;
  const wr3 = playersByPosition(team, "WR")[2] ?? null;
  const rb2 = playersByPosition(team, "RB")[1] ?? null;
  const te2 = playersByPosition(team, "TE")[1] ?? null;

  if (qb) {
    const qbStats = stats.get(qb.id);
    if (qbStats) {
      qbStats.passingYards = passingYards;
      qbStats.passingTD = passTouchdowns;
      qbStats.interceptions = interceptionsThrown;
    }
  }

  const fumbleShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 26 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 8 }] : []),
      ...(qb ? [{ id: qb.id, weight: 16 }] : []),
      ...(wr1 ? [{ id: wr1.id, weight: 7 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 5 }] : []),
      ...(te ? [{ id: te.id, weight: 5 }] : []),
    ],
    fumblesLost
  );

  const receptionShares = distributeIntegerTotal(
    [
      ...(wr1 ? [{ id: wr1.id, weight: 34 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 26 }] : []),
      ...(wr3 ? [{ id: wr3.id, weight: 7 }] : []),
      ...(te ? [{ id: te.id, weight: 18 }] : []),
      ...(te2 ? [{ id: te2.id, weight: 4 }] : []),
      ...(rb ? [{ id: rb.id, weight: 12 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 4 }] : []),
    ],
    totalReceptions
  );
  const receivingYardShares = distributeIntegerTotal(
    [
      ...(wr1 ? [{ id: wr1.id, weight: 38 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 28 }] : []),
      ...(wr3 ? [{ id: wr3.id, weight: 8 }] : []),
      ...(te ? [{ id: te.id, weight: 18 }] : []),
      ...(te2 ? [{ id: te2.id, weight: 4 }] : []),
      ...(rb ? [{ id: rb.id, weight: 16 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 4 }] : []),
    ],
    passingYards
  );
  const receivingTDShares = distributeIntegerTotal(
    [
      ...(wr1 ? [{ id: wr1.id, weight: 36 }] : []),
      ...(wr2 ? [{ id: wr2.id, weight: 24 }] : []),
      ...(wr3 ? [{ id: wr3.id, weight: 4 }] : []),
      ...(te ? [{ id: te.id, weight: 20 }] : []),
      ...(te2 ? [{ id: te2.id, weight: 3 }] : []),
      ...(rb ? [{ id: rb.id, weight: 10 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 2 }] : []),
    ],
    passTouchdowns
  );
  const carryShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 34 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 6 }] : []),
      ...(qb ? [{ id: qb.id, weight: 12 }] : []),
      ...(te ? [{ id: te.id, weight: 3 }] : []),
    ],
    totalCarries
  );
  const rushingYardShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 36 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 6 }] : []),
      ...(qb ? [{ id: qb.id, weight: 14 }] : []),
      ...(te ? [{ id: te.id, weight: 3 }] : []),
    ],
    rushingYards
  );
  const rushingTDShares = distributeIntegerTotal(
    [
      ...(rb ? [{ id: rb.id, weight: 32 }] : []),
      ...(rb2 ? [{ id: rb2.id, weight: 3 }] : []),
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

  for (const [playerId, playerFumblesLost] of fumbleShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.fumblesLost = playerFumblesLost;
  }

  return {
    stats,
    passingYards,
    rushingYards,
    passingTD: passTouchdowns,
    rushingTD: rushTouchdowns,
    interceptionsThrown,
    fumblesLost,
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
        opponentOutput.fumblesLost * 1.2 +
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
  const totalFumbleRecoveries = opponentOutput.fumblesLost;
  const totalForcedFumbles = opponentOutput.fumblesLost;

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
  const forcedFumbleShares = distributeIntegerTotal(
    [
      ...dls.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight:
          ([14, 10, 6][index] ?? 4) +
          defensivePlayBonus(player) * 0.7 +
          (profile.defenseStyle === "Pressure" ? 5 : 0),
      })),
      ...lbs.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight:
          ([15, 11, 7][index] ?? 4) +
          defensivePlayBonus(player) * 0.65 +
          (profile.defenseStyle === "Pressure" ? 3 : 0),
      })),
      ...secs.slice(0, 2).map((player, index) => ({
        id: player.id,
        weight:
          ([8, 5][index] ?? 3) +
          defensivePlayBonus(player) * 0.35 +
          (profile.defenseStyle === "Coverage" ? 2 : 0),
      })),
    ],
    totalForcedFumbles
  );
  const fumbleRecoveryShares = distributeIntegerTotal(
    [
      ...dls.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([10, 8, 5][index] ?? 3) + defensivePlayBonus(player) * 0.35,
      })),
      ...lbs.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([12, 9, 6][index] ?? 3) + defensivePlayBonus(player) * 0.4,
      })),
      ...secs.slice(0, 3).map((player, index) => ({
        id: player.id,
        weight: ([8, 6, 4][index] ?? 2) + defensivePlayBonus(player) * 0.35,
      })),
    ],
    totalFumbleRecoveries
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

  for (const [playerId, forcedFumbles] of forcedFumbleShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.forcedFumbles = forcedFumbles;
  }

  for (const [playerId, fumbleRecoveries] of fumbleRecoveryShares) {
    const statLine = stats.get(playerId);
    if (statLine) statLine.fumbleRecoveries = fumbleRecoveries;
  }
}

function sortPlayerStats(stats: Map<string, PlayerGameStats>) {
  return [...stats.values()].sort((a, b) => {
    const aImpact =
      a.passingTD * 12 +
      a.receivingTD * 8 +
      a.rushTD * 8 +
      a.interceptions * (a.position === "QB" ? -5 : 10) +
      a.fumblesLost * -6 +
      a.sacks * 8 +
      a.forcedFumbles * 7 +
      a.fumbleRecoveries * 7 +
      a.tackles * 0.75 +
      a.passingYards * 0.08 +
      a.receivingYards * 0.1 +
      a.rushYards * 0.1;
    const bImpact =
      b.passingTD * 12 +
      b.receivingTD * 8 +
      b.rushTD * 8 +
      b.interceptions * (b.position === "QB" ? -5 : 10) +
      b.fumblesLost * -6 +
      b.sacks * 8 +
      b.forcedFumbles * 7 +
      b.fumbleRecoveries * 7 +
      b.tackles * 0.75 +
      b.passingYards * 0.08 +
      b.receivingYards * 0.1 +
      b.rushYards * 0.1;
    return bImpact - aImpact;
  });
}

function driveCountForQuarter(
  offense: ReturnType<typeof buildTeamProfile>,
  scoreDiff: number,
  quarter: number
) {
  let drives = 1;

  if (offense.offenseStyle === "Pass Heavy") drives += 1;
  if (offense.offenseStyle === "Run Heavy" && scoreDiff >= 7) drives -= 1;

  if (quarter >= 3 && scoreDiff <= -10) drives += 1;
  if (quarter >= 4 && scoreDiff <= -7) drives += 1;
  if (quarter >= 3 && scoreDiff >= 10) drives -= 1;

  return clamp(drives, 1, quarter >= 4 ? 3 : 2);
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
    fumblesLost: 0,
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
    fumblesLost: base.fumblesLost + next.fumblesLost,
    sacksAllowed: base.sacksAllowed + next.sacksAllowed,
    totalCarries: base.totalCarries + next.totalCarries,
    totalReceptions: base.totalReceptions + next.totalReceptions,
    drives: base.drives + next.drives,
    explosivePlays: base.explosivePlays + next.explosivePlays,
    redZoneTrips: base.redZoneTrips + next.redZoneTrips,
  };
}

function normalizeTeamTotals(
  totals: TeamSimTotals,
  profile: ReturnType<typeof buildTeamProfile>,
  rand: () => number
) {
  const touchdownCount = totals.passingTD + totals.rushingTD;
  const scoringDrives = touchdownCount + totals.fieldGoals;
  const currentYards = totals.passingYards + totals.rushingYards;
  const targetTotalYards = clamp(
    Math.round(
      120 +
        totals.points * 7.6 +
        totals.drives * 7 +
        totals.explosivePlays * 16 +
        scoringDrives * 8 +
        (rand() - 0.5) * 42
    ),
    totals.points >= 35 ? 330 : totals.points >= 24 ? 260 : 160,
    totals.points >= 35 ? 520 : totals.points >= 24 ? 460 : 380
  );
  const yardScale = currentYards > 0 ? targetTotalYards / currentYards : 1;
  const passShare = clamp(
    profile.passLean +
      (profile.passAttack - profile.runAttack) * 0.004 +
      (totals.passingTD - totals.rushingTD) * 0.045,
    profile.offenseStyle === "Run Heavy" ? 0.34 : 0.42,
    profile.offenseStyle === "Pass Heavy" ? 0.82 : 0.74
  );
  const minPassingYards = totals.passingTD * 28 + totals.interceptionsThrown * 8;
  const minRushingYards = totals.rushingTD * 8;
  const scaledPassingYards = Math.round(totals.passingYards * yardScale);
  const targetPassingYards = Math.round(targetTotalYards * passShare);
  const passingYards = clamp(
    Math.round((scaledPassingYards + targetPassingYards) / 2),
    minPassingYards,
    targetTotalYards - minRushingYards
  );
  const rushingYards = Math.max(minRushingYards, targetTotalYards - passingYards);
  const totalReceptions = clamp(
    Math.round(passingYards / (profile.offenseStyle === "Pass Heavy" ? 12.5 : 14.5)),
    totals.passingTD,
    36
  );
  const totalCarries = clamp(
    Math.round(rushingYards / (profile.offenseStyle === "Run Heavy" ? 4.2 : 5.1)) + totals.rushingTD,
    totals.rushingTD,
    38
  );

  return {
    ...totals,
    passingYards,
    rushingYards,
    totalReceptions,
    totalCarries,
  };
}

function driveStartYardLine(rand: () => number, scoreDiff: number, quarter: number) {
  const urgencyBoost = quarter >= 4 && scoreDiff < 0 ? 4 : 0;
  return clamp(Math.round(20 + rand() * 17 + urgencyBoost), 15, 42);
}

function formatDownDistance(down: number, yardsToGo: number, yardLine: number) {
  if (yardLine >= 100) return "Goal line";
  const distance = yardLine + yardsToGo >= 100 ? "Goal" : yardsToGo.toString();
  return `${down}${down === 1 ? "st" : down === 2 ? "nd" : down === 3 ? "rd" : "th"} & ${distance}`;
}

function localHighlight({
  text,
  pointsA,
  pointsB,
  isScore,
  possession,
  eventType,
  eventDetail,
  playKind,
  downDistance,
  driveId,
  startYardLine,
  endYardLine,
  driveSummary,
  closeMoment,
}: Omit<LocalSimHighlight, "yards">) {
  const clampedStart = clamp(Math.round(startYardLine), 0, 100);
  const clampedEnd = clamp(Math.round(endYardLine), 0, 100);

  return {
    text,
    pointsA,
    pointsB,
    isScore,
    possession,
    eventType,
    ...(eventDetail ? { eventDetail } : {}),
    playKind,
    downDistance,
    driveId,
    startYardLine: clampedStart,
    endYardLine: clampedEnd,
    yards: clampedEnd - clampedStart,
    driveSummary,
    closeMoment,
  };
}

function clockForHighlight(index: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const secondsLeft = clamp(
    Math.round(15 * 60 - ((index + 0.65) / (safeTotal + 0.35)) * 15 * 60),
    0,
    14 * 60 + 55
  );
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function driveSummaryText(
  playCount: number,
  yards: number,
  result: "TD" | "FG" | "INT" | "FUM" | "PUNT" | "BIG"
) {
  const yardText = yards >= 0 ? `+${yards}` : `${yards}`;
  const playLabel = playCount === 1 ? "play" : "plays";
  return `${playCount} ${playLabel}, ${yardText} yards, ${result}`;
}

function playText({
  offense,
  defense,
  yards,
  kind,
  qbName,
  targetName,
  runnerName,
  defenderName,
  fieldGoalDistance,
}: {
  offense: ReturnType<typeof buildTeamProfile>;
  defense: ReturnType<typeof buildTeamProfile>;
  yards: number;
  kind: PlayKind;
  qbName?: string;
  targetName?: string;
  runnerName?: string;
  defenderName?: string;
  fieldGoalDistance?: number;
}) {
  const qb = shortPlayerName(qbName ?? offense.qb?.name ?? "QB");
  const target = shortPlayerName(targetName ?? choosePassTarget(offense, () => 0));
  const runner = shortPlayerName(runnerName ?? offense.rb?.name ?? "Runner");
  const defender = shortPlayerName(defenderName ?? defense.dl1?.name ?? "Defender");
  const yardText = Math.abs(yards) === 1 ? "yard" : "yards";

  if (kind === "sack") {
    return `${defender} sacks ${qb} for ${yards} yards.`;
  }

  if (kind === "fieldGoal") {
    return `${shortPlayerName(offense.qb?.name ?? "Kicker")} steadies the operation for a ${fieldGoalDistance ?? 38}-yard field goal.`;
  }

  if (kind === "turnover") {
    return `${defender} jars it loose and the defense recovers.`;
  }

  if (kind === "pass") {
    if (yards < 0) return `${qb} checks it to ${target}, but it loses ${Math.abs(yards)} ${yardText}.`;
    return `${qb} hits ${target} for ${yards} ${yardText}.`;
  }

  if (yards < 0) return `${runner} is stacked up for ${yards} ${yardText}.`;
  return `${runner} rushes for ${yards} ${yardText}.`;
}

function splitDriveYards(
  totalYards: number,
  playCount: number,
  finalPlayYards: number,
  rand: () => number
) {
  const earlyCount = Math.max(playCount - 1, 0);
  const remaining = totalYards - finalPlayYards;
  const yards: number[] = [];
  let used = 0;

  for (let index = 0; index < earlyCount; index += 1) {
    const playsLeft = earlyCount - index;
    const averageLeft = playsLeft > 0 ? (remaining - used) / playsLeft : 0;
    const next = clamp(
      Math.round(averageLeft + (rand() - 0.45) * 7),
      index === earlyCount - 1 ? -8 : -5,
      24
    );
    yards.push(index === earlyCount - 1 ? remaining - used : next);
    used += next;
  }

  return yards;
}

function buildDriveHighlights({
  offense,
  defense,
  side,
  startYardLine,
  totalYards,
  playCount,
  result,
  eventType,
  eventDetail,
  isScore,
  points,
  closeMoment,
  rand,
  preferPass,
  finalText,
  finalPlayKind,
  finalPlayYards,
  fieldGoalDistance,
  driveId,
}: {
  offense: ReturnType<typeof buildTeamProfile>;
  defense: ReturnType<typeof buildTeamProfile>;
  side: "A" | "B";
  startYardLine: number;
  totalYards: number;
  playCount: number;
  result: "TD" | "FG" | "INT" | "FUM" | "PUNT" | "BIG";
  eventType: QuarterHighlight["eventType"];
  eventDetail?: QuarterHighlight["eventDetail"];
  isScore: boolean;
  points: number;
  closeMoment: boolean;
  rand: () => number;
  preferPass: boolean;
  finalText?: string;
  finalPlayKind?: PlayKind;
  finalPlayYards?: number;
  fieldGoalDistance?: number;
  driveId: string;
}) {
  const safePlayCount = clamp(playCount, 1, 11);
  const finalYards =
    finalPlayYards ??
    (result === "TD"
      ? clamp(100 - startYardLine - Math.round(totalYards * 0.72), 1, 35)
      : clamp(Math.round(totalYards / safePlayCount), -8, 28));
  const earlyYards = splitDriveYards(totalYards, safePlayCount, finalYards, rand);
  const plays: DrivePlay[] = earlyYards.map((yards, index) => {
    const passPlay = rand() < (preferPass ? 0.68 : 0.38) || (index === 0 && preferPass);
    const kind: PlayKind = passPlay ? "pass" : "run";
    const defender = chooseDefender(defense, rand, "sack");

    if (passPlay && yards <= -5 && rand() < 0.55) {
      return {
        kind: "sack",
        yards,
        eventType: "stop",
        text: playText({
          offense,
          defense,
          yards,
          kind: "sack",
          defenderName: defender,
        }),
      };
    }

    return {
      kind,
      yards,
      eventType: Math.abs(yards) >= 18 ? "explosive" : "stop",
      text: playText({
        offense,
        defense,
        yards,
        kind,
        targetName: kind === "pass" ? choosePassTarget(offense, rand) : undefined,
        runnerName: kind === "run" ? chooseRunner(offense, rand) : undefined,
      }),
    };
  });

  const finalKind = finalPlayKind ?? (preferPass ? "pass" : "run");
  const finalDefenderKind = eventDetail === "interception" ? "coverage" : eventDetail ? "fumble" : "sack";
  const finalDefender = chooseDefender(defense, rand, finalDefenderKind);
  const finalPlayText =
    finalText ??
    playText({
      offense,
      defense,
      yards: finalYards,
      kind: finalKind,
      targetName: finalKind === "pass" ? choosePassTarget(offense, rand) : undefined,
      runnerName: finalKind === "run" ? chooseRunner(offense, rand) : undefined,
      defenderName: finalDefender,
      fieldGoalDistance,
    });

  plays.push({
    text: finalPlayText,
    yards: finalYards,
    eventType,
    ...(eventDetail ? { eventDetail } : {}),
    isScore,
    points,
    kind: finalKind,
  });

  const highlights: LocalSimHighlight[] = [];
  let currentYardLine = startYardLine;
  let currentDown = 1;
  let yardsToGo = Math.min(10, 100 - currentYardLine);

  plays.forEach((play, index) => {
    const isFinalPlay = index === plays.length - 1;
    const nextYardLine =
      result === "TD" && isFinalPlay
        ? 100
        : clamp(currentYardLine + play.yards, 0, 100);

    highlights.push(localHighlight({
      text: play.text,
      pointsA: side === "A" ? play.points ?? 0 : 0,
      pointsB: side === "B" ? play.points ?? 0 : 0,
      isScore: play.isScore ?? false,
      possession: side,
      eventType: isFinalPlay ? play.eventType : play.eventType === "explosive" ? "explosive" : "stop",
      ...(isFinalPlay && play.eventDetail ? { eventDetail: play.eventDetail } : {}),
      playKind: play.kind,
      downDistance:
        play.kind === "fieldGoal"
          ? `4th & ${Math.max(1, yardsToGo)}`
          : formatDownDistance(isFinalPlay && result === "PUNT" ? 4 : currentDown, yardsToGo, currentYardLine),
      driveId,
      startYardLine: currentYardLine,
      endYardLine: nextYardLine,
      driveSummary: driveSummaryText(safePlayCount, totalYards, result),
      closeMoment,
    }));

    currentYardLine = nextYardLine;
    if (play.yards >= yardsToGo) {
      currentDown = 1;
      yardsToGo = Math.min(10, Math.max(1, 100 - currentYardLine));
    } else {
      currentDown = clamp(currentDown + 1, 1, 4);
      yardsToGo = clamp(yardsToGo - play.yards, 1, 30);
    }
  });

  if (result === "PUNT") {
    const puntEndYardLine = clamp(currentYardLine + Math.round(34 + rand() * 14), currentYardLine + 20, 98);
    highlights.push(localHighlight({
      text: "The punt team sends it away and flips the field.",
      pointsA: 0,
      pointsB: 0,
      isScore: false,
      possession: side,
      eventType: "stop",
      playKind: "punt",
      downDistance: "4th & punt",
      driveId,
      startYardLine: currentYardLine,
      endYardLine: puntEndYardLine,
      driveSummary: driveSummaryText(safePlayCount + 1, totalYards, result),
      closeMoment,
    }));
  }

  return highlights;
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
  let fumblesLost = 0;
  let sacksAllowed = 0;
  let totalCarries = 0;
  let totalReceptions = 0;
  let explosivePlays = 0;
  let redZoneTrips = 0;
  const highlights: LocalSimHighlight[] = [];
  const drives = driveCountForQuarter(offense, scoreDiff, quarter);

  for (let drive = 0; drive < drives; drive++) {
    const startYardLine = driveStartYardLine(rand, scoreDiff, quarter);
    const playCount = clamp(Math.round(3 + rand() * 5), 3, 8);
    const closeMoment = quarter >= 4 && Math.abs(scoreDiff) <= 8;
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
      0.43 +
        chosenEdge * 0.004 +
        offenseBonus * 0.012 -
        defenseBonus * 0.012 +
        (quarter >= 4 && scoreDiff <= -7 ? 0.04 : 0),
      0.22,
      0.86
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
        (defense.defenseStyle === "Pressure" ? 0.012 : 0) +
        defenseVolatility * 0.45,
      0.02,
      0.28
    );

    if (rand() < turnoverChance) {
      const turnoverYards = clamp(Math.round(6 + rand() * 18), 4, 20);
      const stripSackChance = clamp(
        0.16 +
          (defense.pressure - offense.ballSecurity) * 0.003 +
          (defense.defenseStyle === "Pressure" ? 0.14 : 0) +
          (preferPass ? 0.08 : 0),
        0.08,
        0.5
      );
      const fumbleChance = clamp(
        (preferPass ? 0.18 : 0.56) +
          (offense.offenseStyle === "Run Heavy" ? 0.12 : 0) +
          (defense.defenseStyle === "Pressure" ? 0.08 : 0) -
          (defense.defenseStyle === "Coverage" && preferPass ? 0.13 : 0) +
          (defense.pressure - offense.ballSecurity) * 0.002,
        0.1,
        0.72
      );
      const turnoverType: "interception" | "fumble" =
        rand() < fumbleChance ? "fumble" : "interception";
      const stripSack = turnoverType === "fumble" && preferPass && rand() < stripSackChance;

      if (turnoverType === "interception") {
        passingYards += turnoverYards;
        totalReceptions += 1;
        interceptionsThrown += 1;
      } else {
        fumblesLost += 1;
        if (stripSack) {
          sacksAllowed += 1;
          passingYards += clamp(Math.round(2 + rand() * 8), 0, 10);
        } else if (preferPass) {
          passingYards += turnoverYards;
          totalReceptions += 1;
        } else {
          rushingYards += turnoverYards;
          totalCarries += 2;
        }
      }
      const turnoverDetail =
        turnoverType === "interception" ? "interception" : stripSack ? "stripSack" : "fumble";
      const defenderName = chooseDefender(
        defense,
        rand,
        turnoverDetail === "interception" ? "coverage" : "fumble"
      );
      const turnoverPlayText =
        turnoverDetail === "interception"
          ? `${shortPlayerName(defenderName)} jumps the route for an interception.`
          : turnoverDetail === "stripSack"
            ? `${shortPlayerName(defenderName)} strips the quarterback on the sack and recovers.`
            : `${shortPlayerName(defenderName)} punches it loose and the defense recovers.`;

      highlights.push(...buildDriveHighlights({
        offense,
        defense,
        side,
        startYardLine,
        totalYards: turnoverYards,
        playCount,
        result: turnoverType === "interception" ? "INT" : "FUM",
        eventType: "turnover",
        eventDetail: turnoverDetail,
        isScore: false,
        points: 0,
        closeMoment,
        rand,
        preferPass,
        finalText: turnoverPlayText,
        finalPlayKind: stripSack
          ? "sack"
          : turnoverDetail === "interception"
            ? "pass"
            : preferPass
              ? "pass"
              : "run",
        finalPlayYards: stripSack
          ? -clamp(Math.round(5 + rand() * 5), 4, 10)
          : clamp(Math.round(turnoverYards * 0.45), 2, turnoverYards),
        driveId: `${side}-q${quarter}-d${drive + 1}`,
      }));
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
      highlights.push(...buildDriveHighlights({
        offense,
        defense,
        side,
        startYardLine,
        totalYards: yardage,
        playCount: Math.max(1, Math.round(playCount / 2)),
        result: "BIG",
        eventType: "explosive",
        isScore: false,
        points: 0,
        closeMoment,
        rand,
        preferPass,
        finalText:
          playmaker.kind === "pass"
            ? `${shortPlayerName(offense.qb?.name ?? "QB")} hits ${shortPlayerName(playmaker.name)} in stride for ${yardage} yards.`
            : `${shortPlayerName(playmaker.name)} breaks free for ${yardage} yards.`,
        finalPlayKind: playmaker.kind,
        finalPlayYards: clamp(Math.round(yardage * 0.62), 12, yardage),
        driveId: `${side}-q${quarter}-d${drive + 1}`,
      }));
    }

    const stalledByPressure = rand() < pressureChance;
    const driveFinishChance = clamp(successChance + redZoneBoost + swingFactor, 0.12, 0.88);

    if (stalledByPressure && driveFinishChance < 0.62) {
      sacksAllowed += 1;
      const stopYards = preferPass
        ? clamp(Math.round(6 + rand() * 12), 3, 18)
        : clamp(Math.round(4 + rand() * 10), 2, 14);
      if (preferPass) {
        passingYards += stopYards;
        totalReceptions += 1;
      } else {
        rushingYards += stopYards;
        totalCarries += 2;
      }
      highlights.push(...buildDriveHighlights({
        offense,
        defense,
        side,
        startYardLine,
        totalYards: stopYards,
        playCount,
        result: "PUNT",
        eventType: "stop",
        isScore: false,
        points: 0,
        closeMoment,
        rand,
        preferPass,
        finalText: `${shortPlayerName(chooseDefender(defense, rand, "sack"))} gets home on third down and forces the punt.`,
        finalPlayKind: "sack",
        finalPlayYards: -clamp(Math.round(4 + rand() * 5), 3, 9),
        driveId: `${side}-q${quarter}-d${drive + 1}`,
      }));
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
        0.52 +
          redZoneBoost +
          bigPlayEdge * 0.002 +
          chosenEdge * 0.0018 +
          (offense.offenseStyle === "Pass Heavy" ? 0.03 : 0) -
          (defense.defenseStyle === "Pressure" ? 0.015 : 0) +
          swingFactor * 0.45,
        0.24,
        0.9
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

        highlights.push(...buildDriveHighlights({
          offense,
          defense,
          side,
          startYardLine,
          totalYards: 100 - startYardLine,
          playCount,
          result: "TD",
          eventType: "touchdown",
          isScore: true,
          points: 7,
          closeMoment,
          rand,
          preferPass,
          finalText:
            scorer.kind === "pass"
              ? `${shortPlayerName(offense.qb?.name ?? "QB")} finds ${shortPlayerName(scorer.name)} for a ${yardage}-yard touchdown.`
              : `${shortPlayerName(scorer.name)} powers in for a ${yardage}-yard touchdown.`,
          finalPlayKind: scorer.kind,
          finalPlayYards: yardage,
          driveId: `${side}-q${quarter}-d${drive + 1}`,
        }));
      } else {
        points += 3;
        fieldGoals += 1;
        const fieldGoalDistance = clamp(Math.round(28 + rand() * 25), 27, 54);
        const kickSpotYardLine = clamp(100 - (fieldGoalDistance - 17), startYardLine + 8, 88);
        if (preferPass) {
          passingYards += driveYards;
          totalReceptions += clamp(Math.round(driveYards / 15), 1, 4);
        } else {
          rushingYards += Math.round(driveYards * 0.55);
          passingYards += Math.round(driveYards * 0.45);
          totalCarries += clamp(Math.round(driveYards / 10), 2, 5);
          totalReceptions += clamp(Math.round(driveYards / 18), 1, 3);
        }
        highlights.push(...buildDriveHighlights({
          offense,
          defense,
          side,
          startYardLine,
          totalYards: kickSpotYardLine - startYardLine,
          playCount,
          result: "FG",
          eventType: "fieldGoal",
          isScore: true,
          points: 3,
          closeMoment,
          rand,
          preferPass,
          finalText: `${offenseTeamName} converts a ${fieldGoalDistance}-yard field goal.`,
          finalPlayKind: "fieldGoal",
          finalPlayYards: 0,
          fieldGoalDistance,
          driveId: `${side}-q${quarter}-d${drive + 1}`,
        }));
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
      highlights.push(...buildDriveHighlights({
        offense,
        defense,
        side,
        startYardLine,
        totalYards: emptyDriveYards,
        playCount,
        result: "PUNT",
        eventType: "stop",
        isScore: false,
        points: 0,
        closeMoment,
        rand,
        preferPass,
        finalText: `${shortPlayerName(chooseDefender(defense, rand, "coverage"))} closes the window on third down. Punt team coming on.`,
        finalPlayKind: preferPass ? "pass" : "run",
        finalPlayYards: clamp(Math.round(1 + rand() * 4), 0, 5),
        driveId: `${side}-q${quarter}-d${drive + 1}`,
      }));
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
      fumblesLost,
      sacksAllowed,
      totalCarries,
      totalReceptions,
      drives,
      explosivePlays,
      redZoneTrips,
    },
  };
}

function mergePlayerStats(
  first: PlayerGameStats[],
  second: PlayerGameStats[]
) {
  const byPlayer = new Map<string, PlayerGameStats>();

  [...first, ...second].forEach((statLine) => {
    const current = byPlayer.get(statLine.playerId);

    if (!current) {
      byPlayer.set(statLine.playerId, { ...statLine });
      return;
    }

    byPlayer.set(statLine.playerId, {
      ...current,
      passingYards: current.passingYards + statLine.passingYards,
      passingTD: current.passingTD + statLine.passingTD,
      interceptions: current.interceptions + statLine.interceptions,
      fumblesLost: current.fumblesLost + statLine.fumblesLost,
      tackles: current.tackles + statLine.tackles,
      sacks: current.sacks + statLine.sacks,
      forcedFumbles: current.forcedFumbles + statLine.forcedFumbles,
      fumbleRecoveries: current.fumbleRecoveries + statLine.fumbleRecoveries,
      rushYards: current.rushYards + statLine.rushYards,
      rushTD: current.rushTD + statLine.rushTD,
      carries: current.carries + statLine.carries,
      receivingYards: current.receivingYards + statLine.receivingYards,
      receivingTD: current.receivingTD + statLine.receivingTD,
      receptions: current.receptions + statLine.receptions,
    });
  });

  return sortPlayerStats(byPlayer);
}

export function combineSimResults(firstHalf: SimResult, secondHalf: SimResult): SimResult {
  return {
    finalA: secondHalf.finalA,
    finalB: secondHalf.finalB,
    quarters: [...firstHalf.quarters, ...secondHalf.quarters],
    teamAStats: mergePlayerStats(firstHalf.teamAStats, secondHalf.teamAStats),
    teamBStats: mergePlayerStats(firstHalf.teamBStats, secondHalf.teamBStats),
  };
}

function groupHighlightsByDrive(highlights: LocalSimHighlight[]) {
  const groups: LocalSimHighlight[][] = [];

  highlights.forEach((highlight) => {
    const current = groups[groups.length - 1];
    if (current && current[0]?.driveId === highlight.driveId) {
      current.push(highlight);
      return;
    }

    groups.push([highlight]);
  });

  return groups;
}

export function simulateGame(setup: GameSetup, options: SimOptions = {}): SimResult {
  const rand = mulberry32(setup.simSeed || Date.now());
  const startQuarter = clamp(Math.round(options.startQuarter ?? 1), 1, 4);
  const endQuarter = clamp(Math.round(options.endQuarter ?? 4), startQuarter, 4);

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

  let runningA = Math.max(0, Math.round(options.initialScoreA ?? 0));
  let runningB = Math.max(0, Math.round(options.initialScoreB ?? 0));
  let totalsA = emptyTotals();
  let totalsB = emptyTotals();

  const quarters: QuarterResult[] = [];

  for (let quarterNumber = startQuarter; quarterNumber <= endQuarter; quarterNumber++) {
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
    const aDrives = groupHighlightsByDrive(aQuarter.highlights);
    const bDrives = groupHighlightsByDrive(bQuarter.highlights);
    let quarterRunningA = quarters[quarters.length - 1]?.scoreA ?? runningA - aQuarter.points;
    let quarterRunningB = quarters[quarters.length - 1]?.scoreB ?? runningB - bQuarter.points;
    let highlightIndex = 0;
    let mergedDriveIndex = 0;
    const startWithA = rand() < 0.5;

    while (aDrives.length > 0 || bDrives.length > 0) {
      const pullFromA =
        aDrives.length === 0
          ? false
          : bDrives.length === 0
            ? true
            : (mergedDriveIndex % 2 === 0 ? startWithA : !startWithA);

      const nextDrive = pullFromA ? aDrives.shift() : bDrives.shift();
      if (!nextDrive) continue;

      nextDrive.forEach((next) => {
        quarterRunningA += next.pointsA;
        quarterRunningB += next.pointsB;
        quarterPlays.push(next.text);
        mergedHighlights.push({
          id: `q${quarterNumber}-h${highlightIndex + 1}`,
          text: next.text,
          clock: "15:00",
          scoreA: quarterRunningA,
          scoreB: quarterRunningB,
          isScore: next.isScore,
          possession: next.possession,
          eventType: next.eventType,
          ...(next.eventDetail ? { eventDetail: next.eventDetail } : {}),
          playKind: next.playKind,
          downDistance: next.downDistance,
          driveId: next.driveId,
          startYardLine: next.startYardLine,
          endYardLine: next.endYardLine,
          yards: next.yards,
          driveSummary: next.driveSummary,
          closeMoment: next.closeMoment,
        });
        highlightIndex += 1;
      });
      mergedDriveIndex += 1;
    }

    const highlightsInQuarter = Math.max(mergedHighlights.length, 1);
    mergedHighlights.forEach((highlight, index) => {
      highlight.clock = clockForHighlight(index, highlightsInQuarter);
    });

    if (mergedHighlights.length === 0) {
      mergedHighlights.push({
        id: `q${quarterNumber}-h1`,
        text: `Q${quarterNumber}: both defenses trade clean stops and keep the scoreboard frozen.`,
        clock: "0:00",
        scoreA: runningA,
        scoreB: runningB,
        isScore: false,
        possession: quarterNumber % 2 === 1 ? "A" : "B",
        eventType: "stop",
        playKind: "run",
        downDistance: "1st & 10",
        driveId: `fallback-q${quarterNumber}`,
        startYardLine: 25,
        endYardLine: 37,
        yards: 12,
        driveSummary: "5 plays, +12 yards, PUNT",
        closeMoment: quarterNumber === 4 && Math.abs(runningA - runningB) <= 8,
      });
      quarterPlays.push(`Q${quarterNumber}: both defenses trade clean stops and keep the scoreboard frozen.`);
    }

    quarters.push({
      quarter: quarterNumber,
      scoreA: runningA,
      scoreB: runningB,
      plays: quarterPlays.slice(0, 4),
      highlights: mergedHighlights,
    });
  }

  const normalizedTotalsA = normalizeTeamTotals(totalsA, teamAProfile, rand);
  const normalizedTotalsB = normalizeTeamTotals(totalsB, teamBProfile, rand);

  const teamAOffense = buildOffenseGameStats(
    setup.teamA,
    teamAProfile,
    normalizedTotalsA
  );
  const teamBOffense = buildOffenseGameStats(
    setup.teamB,
    teamBProfile,
    normalizedTotalsB
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
