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
};

export type SimResult = {
  finalA: number;
  finalB: number;
  quarters: QuarterResult[];
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

function buildQuarterPlays(
  scoringTeamName: string,
  defendingTeamName: string,
  scoringTeamProfile: ReturnType<typeof buildTeamProfile>,
  scoringPoints: number,
  rand: () => number
) {
  const plays: string[] = [];

  if (scoringPoints >= 7) {
    const scorer = chooseTouchdownScorer(
      scoringTeamProfile,
      rand,
      scoringTeamProfile.offenseStyle === "Pass Heavy"
    );

    if (scorer.kind === "pass") {
      plays.push(`${scoringTeamName}: Touchdown pass finished by ${scorer.name}.`);
    } else {
      plays.push(`${scoringTeamName}: Rushing touchdown by ${scorer.name}.`);
    }
  } else if (scoringPoints >= 3) {
    plays.push(`${scoringTeamName}: Field goal caps the drive.`);
  }

  const fillerTemplates = [
    `${defendingTeamName}: Coverage tightens up late in the quarter.`,
    `${defendingTeamName}: Pressure forces a tough third-down decision.`,
    `${scoringTeamName}: Big play flips field position.`,
    `${scoringTeamName}: Sustained drive keeps the chains moving.`,
    `${scoringTeamName}: Red-zone execution turns momentum their way.`,
  ];

  const filler = fillerTemplates[Math.floor(rand() * fillerTemplates.length)];
  plays.push(filler);

  return plays;
}

function simulateQuarterTeamPoints(
  offense: ReturnType<typeof buildTeamProfile>,
  defense: ReturnType<typeof buildTeamProfile>,
  rand: () => number
) {
  let points = 0;
  const plays: string[] = [];

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
        points += 7;
        plays.push(...buildQuarterPlays("OFFENSE", "DEFENSE", offense, 7, rand));
      } else {
        points += 3;
        plays.push("Field goal caps the drive.");
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
      if (rand() < turnoverChance && plays.length < 3) {
        plays.push("Pressure forces a drive-killing mistake.");
      }
    }
  }

  return { points, plays };
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
    const aQuarter = simulateQuarterTeamPoints(teamAProfile, teamBProfile, rand);
    const bQuarter = simulateQuarterTeamPoints(teamBProfile, teamAProfile, rand);

    runningA += aQuarter.points;
    runningB += bQuarter.points;

    const quarterPlays: string[] = [];

    if (aQuarter.points > 0) {
      quarterPlays.push(
        ...buildQuarterPlays(
          setup.teamAName,
          setup.teamBName,
          teamAProfile,
          aQuarter.points,
          rand
        )
      );
    }

    if (bQuarter.points > 0) {
      quarterPlays.push(
        ...buildQuarterPlays(
          setup.teamBName,
          setup.teamAName,
          teamBProfile,
          bQuarter.points,
          rand
        )
      );
    }

    while (quarterPlays.length < 2) {
      quarterPlays.push("Both defenses hold firm for long stretches.");
    }

    quarters.push({
      quarter: i + 1,
      scoreA: runningA,
      scoreB: runningB,
      plays: quarterPlays.slice(0, 3),
    });
  }

  return {
    finalA: runningA,
    finalB: runningB,
    quarters,
  };
}
