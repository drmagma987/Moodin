import type { DraftedPlayer } from "./game/types";

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

function speedFromForty(forty: number) {
  const minForty = 4.2;
  const maxForty = 5.1;
  const clamped = Math.max(minForty, Math.min(maxForty, forty));
  return Math.round(((maxForty - clamped) / (maxForty - minForty)) * 100);
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

function avgTrueGrade(players: DraftedPlayer[]) {
  if (players.length === 0) return 60;
  return players.reduce((sum, p) => sum + p.trueGrade, 0) / players.length;
}

function qbRunValue(qb: DraftedPlayer | null) {
  if (!qb) return 40;
  const speed = speedFromForty(qb.forty);

  let factor = 0.15;
  if (qb.archetype === "Dual Threat") factor = 1.0;
  else if (qb.archetype === "Gunslinger") factor = 0.2;
  else if (qb.archetype === "Field General") factor = 0.15;

  return speed * factor;
}

function offenseStrategyModifier(strategy: string, ratings: TeamRatings) {
  switch (strategy) {
    case "Pass Heavy":
      return {
        pass: ratings.pass + 7,
        run: ratings.run - 5,
        bigPlay: ratings.bigPlay + 6,
        ballSecurity: ratings.ballSecurity - 3,
      };
    case "Run Heavy":
      return {
        pass: ratings.pass - 5,
        run: ratings.run + 7,
        bigPlay: ratings.bigPlay - 2,
        ballSecurity: ratings.ballSecurity + 4,
      };
    default:
      return {
        pass: ratings.pass,
        run: ratings.run,
        bigPlay: ratings.bigPlay,
        ballSecurity: ratings.ballSecurity,
      };
  }
}

function defenseStrategyModifier(strategy: string, ratings: TeamRatings) {
  switch (strategy) {
    case "Pressure":
      return {
        passD: ratings.passD - 3,
        runD: ratings.runD,
        pressure: ratings.pressure + 7,
        takeaways: ratings.takeaways + 4,
      };
    case "Coverage":
      return {
        passD: ratings.passD + 7,
        runD: ratings.runD - 2,
        pressure: ratings.pressure - 4,
        takeaways: ratings.takeaways + 1,
      };
    default:
      return {
        passD: ratings.passD,
        runD: ratings.runD,
        pressure: ratings.pressure,
        takeaways: ratings.takeaways,
      };
  }
}

function buildTeamProfile(
  team: DraftedPlayer[],
  ratings: TeamRatings,
  strategy: StrategySet
) {
  const qb = topPlayerByPosition(team, "QB");
  const rb = topPlayerByPosition(team, "RB");
  const te = topPlayerByPosition(team, "TE");
  const dl = topPlayerByPosition(team, "DL");
  const lb = topPlayerByPosition(team, "LB");
  const sec = topPlayerByPosition(team, "SEC");
  const wrs = topTwoWRs(team);

  const wr1 = wrs[0] ?? null;
  const wr2 = wrs[1] ?? null;

  const adjOff = offenseStrategyModifier(strategy.offense, ratings);
  const adjDef = defenseStrategyModifier(strategy.defense, ratings);

  const qbGrade = qb?.trueGrade ?? 60;
  const rbGrade = rb?.trueGrade ?? 60;
  const teGrade = te?.trueGrade ?? 60;
  const dlGrade = dl?.trueGrade ?? 60;
  const lbGrade = lb?.trueGrade ?? 60;
  const secGrade = sec?.trueGrade ?? 60;

  const wrAvgGrade = avgTrueGrade(wrs.length ? wrs : []);
  const wrAvgSpeed = avgTrueGrade(
    wrs.map((w) => ({
      ...w,
      trueGrade: speedFromForty(w.forty),
    }))
  );
  const rbSpeed = rb ? speedFromForty(rb.forty) : 60;
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

    const overallEdge =
      0.45 * passEdge +
      0.3 * runEdge +
      0.15 * bigPlayEdge -
      0.1 * turnoverPressure;

    const scoreChance = clamp(0.42 + overallEdge * 0.004, 0.16, 0.78);

    if (rand() < scoreChance) {
      const tdChance = clamp(
        0.56 +
          bigPlayEdge * 0.0025 +
          (offense.offenseStyle === "Pass Heavy" ? 0.03 : 0) +
          (offense.offenseStyle === "Run Heavy" ? -0.02 : 0),
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
      const turnoverChance = clamp(0.12 + turnoverPressure * 0.002, 0.05, 0.32);
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