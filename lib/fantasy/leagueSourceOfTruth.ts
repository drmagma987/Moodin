/**
 * Canonical league facts for every predraft, keeper, and war-room calculation.
 *
 * Update this file first when league rules change. Derived modules should import
 * these values instead of repeating team counts, draft slots, or keeper rules.
 */
export const leagueSourceOfTruth = {
  version: "2026.08.20-v2",
  updatedAt: "2026-08-20T00:00:00-04:00",
  season: 2026,
  leagueId: "yahoo-750909",
  leagueName: "H-Town Heroes",
  teams: 10,
  draft: {
    format: "snake",
    mySlot: 9,
    brotherSlot: 10,
  },
  keepers: {
    minimumPerTeam: 0,
    maximumPerTeam: 3,
    optional: true,
    costRule: "ordinal-round",
    costExplanation:
      "A team's first keeper consumes its Round 1 pick, second keeper consumes Round 2, and third keeper consumes Round 3. Any unused keeper slot remains a live draft pick.",
    myDeclaredPlayers: ["Jahmyr Gibbs", "Amon-Ra St. Brown"],
    brotherExpectedPlayers: ["Chase Brown", "Kenneth Walker III", "Brock Bowers"],
  },
  departedTeams: {
    count: 2,
    releasedRosterAnchors: ["Jalen Hurts", "De'Von Achane"],
    explanation:
      "Players from the two departed 12-team-era rosters return to the draft pool unless a retained team legitimately owns and declares the player.",
  },
  lineup: {
    QB: 1,
    WR: 3,
    RB: 2,
    TE: 1,
    FLEX: 2,
    K: 1,
    BN: 6,
    IR: 1,
    DST: 0,
    flexEligible: ["RB", "WR", "TE"],
  },
  waivers: {
    days: 2,
    type: "FAB w/ Reverse order of standings tiebreak",
    faabBudget: null,
  },
  playoffs: {
    teams: 6,
    weeks: [15, 16, 17],
  },
  scoring: {
    receptionPoints: 1,
    passingTouchdownPoints: 6,
    passingYardsPerPoint: 25,
    interceptionPoints: -1,
    rushingYardsPerPoint: 10,
    rushingTouchdownPoints: 6,
    receivingYardsPerPoint: 10,
    receivingTouchdownPoints: 6,
    returnTouchdownPoints: 6,
    fumbleLostPoints: -2,
    offensiveFumbleReturnTouchdownPoints: 6,
    twoPointConversionPoints: 2,
    passing300Bonus: 3,
    rushing100Bonus: 2,
    receiving100Bonus: 2,
    kickerPoints: {
      fieldGoals0to19: 3,
      fieldGoals20to29: 3,
      fieldGoals30to39: 3,
      fieldGoals40to49: 4,
      fieldGoals50Plus: 5,
      pointAfterMakes: 1,
      pointAfterMisses: -1,
    },
    defenseSpecialTeamsPoints: {
      sack: 1,
      interception: 2,
      fumbleRecovery: 2,
      touchdown: 6,
      safety: 2,
      blockedKick: 2,
      kickOrPuntReturnTouchdown: 6,
      extraPointReturn: 2,
    },
    pointsAllowed: [
      { min: 0, max: 0, points: 10 },
      { min: 1, max: 6, points: 7 },
      { min: 7, max: 13, points: 4 },
      { min: 14, max: 20, points: 1 },
      { min: 21, max: 27, points: 0 },
      { min: 28, max: 34, points: -1 },
      { min: 35, max: null, points: -4 },
    ],
  },
  governanceContext: {
    keeperChangeTiming: "announced-after-2025-season",
    note:
      "The league changed from two to as many as three keepers after the season and after roster-management decisions had been made.",
  },
} as const;

export type LeagueSourceOfTruth = typeof leagueSourceOfTruth;

function stableFingerprint(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const leagueSourceOfTruthFingerprint = stableFingerprint(
  JSON.stringify(leagueSourceOfTruth),
);

export function assertCanonicalLeagueSourceOfTruth() {
  const errors: string[] = [];
  if (leagueSourceOfTruth.teams < 2) errors.push("team count must be at least 2");
  if (leagueSourceOfTruth.draft.mySlot < 1 || leagueSourceOfTruth.draft.mySlot > leagueSourceOfTruth.teams) {
    errors.push("my draft slot must be inside the league");
  }
  if (leagueSourceOfTruth.draft.brotherSlot < 1 || leagueSourceOfTruth.draft.brotherSlot > leagueSourceOfTruth.teams) {
    errors.push("brother draft slot must be inside the league");
  }
  if (leagueSourceOfTruth.keepers.minimumPerTeam !== 0 || leagueSourceOfTruth.keepers.maximumPerTeam !== 3) {
    errors.push("keeper bounds must remain 0-3 unless the canonical rule is intentionally revised");
  }
  if (leagueSourceOfTruth.keepers.myDeclaredPlayers.length > leagueSourceOfTruth.keepers.maximumPerTeam) {
    errors.push("declared keeper count exceeds the league maximum");
  }
  if (leagueSourceOfTruth.lineup.FLEX !== 2 || leagueSourceOfTruth.lineup.WR !== 3) {
    errors.push("canonical lineup must reflect the current three-WR, two-flex format");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid canonical league source of truth: ${errors.join("; ")}`);
  }
}

type LeagueShape = {
  id: string;
  name: string;
  teams: number;
  rosterSlots: string[];
  flexSlots: string[];
  waiverDays: number;
  waiverType: string;
  playoffTeams: number;
  playoffWeeks: number[];
  scoring: {
    passingYardsPerPoint: number;
    passingTouchdownPoints: number;
    interceptionPoints: number;
    rushingYardsPerPoint: number;
    rushingTouchdownPoints: number;
    receptionPoints: number;
    receivingYardsPerPoint: number;
    receivingTouchdownPoints: number;
    fumbleLostPoints: number;
  };
};

export function assertLeagueMatchesSourceOfTruth(league: LeagueShape) {
  const errors: string[] = [];
  const slotCount = (slot: string) => league.rosterSlots.filter((item) => item === slot).length;
  if (league.id !== leagueSourceOfTruth.leagueId) errors.push(`league id ${league.id}`);
  if (league.name !== leagueSourceOfTruth.leagueName) errors.push(`league name ${league.name}`);
  if (league.teams !== leagueSourceOfTruth.teams) errors.push(`${league.teams} teams`);
  const expectedSlots: Array<[string, number]> = [
    ["QB", leagueSourceOfTruth.lineup.QB], ["WR", leagueSourceOfTruth.lineup.WR],
    ["RB", leagueSourceOfTruth.lineup.RB], ["TE", leagueSourceOfTruth.lineup.TE],
    ["W/R/T", leagueSourceOfTruth.lineup.FLEX], ["K", leagueSourceOfTruth.lineup.K],
    ["BN", leagueSourceOfTruth.lineup.BN], ["IR", leagueSourceOfTruth.lineup.IR],
  ];
  for (const [slot, expected] of expectedSlots) {
    if (slotCount(slot) !== expected) errors.push(`${slotCount(slot)} ${slot} slots (expected ${expected})`);
  }
  if ([...league.flexSlots].sort().join("|") !== [...leagueSourceOfTruth.lineup.flexEligible].sort().join("|")) {
    errors.push(`flex eligibility ${league.flexSlots.join("/")}`);
  }
  if (league.waiverDays !== leagueSourceOfTruth.waivers.days) errors.push(`waiver days ${league.waiverDays}`);
  if (league.waiverType !== leagueSourceOfTruth.waivers.type) errors.push(`waiver type ${league.waiverType}`);
  if (league.playoffTeams !== leagueSourceOfTruth.playoffs.teams) errors.push(`playoff teams ${league.playoffTeams}`);
  if (league.playoffWeeks.join("|") !== leagueSourceOfTruth.playoffs.weeks.join("|")) {
    errors.push(`playoff weeks ${league.playoffWeeks.join(",")}`);
  }
  const scoringChecks: Array<[string, number, number]> = [
    ["pass TD", league.scoring.passingTouchdownPoints, leagueSourceOfTruth.scoring.passingTouchdownPoints],
    ["PPR", league.scoring.receptionPoints, leagueSourceOfTruth.scoring.receptionPoints],
    ["pass yards", league.scoring.passingYardsPerPoint, leagueSourceOfTruth.scoring.passingYardsPerPoint],
    ["interception", league.scoring.interceptionPoints, leagueSourceOfTruth.scoring.interceptionPoints],
    ["rush yards", league.scoring.rushingYardsPerPoint, leagueSourceOfTruth.scoring.rushingYardsPerPoint],
    ["rush TD", league.scoring.rushingTouchdownPoints, leagueSourceOfTruth.scoring.rushingTouchdownPoints],
    ["receiving yards", league.scoring.receivingYardsPerPoint, leagueSourceOfTruth.scoring.receivingYardsPerPoint],
    ["receiving TD", league.scoring.receivingTouchdownPoints, leagueSourceOfTruth.scoring.receivingTouchdownPoints],
    ["fumble", league.scoring.fumbleLostPoints, leagueSourceOfTruth.scoring.fumbleLostPoints],
  ];
  for (const [label, actual, expected] of scoringChecks) {
    if (actual !== expected) errors.push(`${label}=${actual} (expected ${expected})`);
  }
  if (errors.length > 0) {
    throw new Error(
      `League configuration does not match ${leagueSourceOfTruth.version} (${leagueSourceOfTruthFingerprint}): ${errors.join("; ")}`,
    );
  }
}

export function assertManagerTeamMatchesSourceOfTruth(myTeamId: string) {
  const expected = `team-${leagueSourceOfTruth.draft.mySlot}`;
  if (myTeamId !== expected) {
    throw new Error(
      `Manager team ${myTeamId} does not match ${leagueSourceOfTruth.version}; expected ${expected} for draft slot ${leagueSourceOfTruth.draft.mySlot}. Refusing to start with stale draft state.`,
    );
  }
}

assertCanonicalLeagueSourceOfTruth();
