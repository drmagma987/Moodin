import type {
  DraftCandidate,
  DraftState,
  ProjectionSnapshot,
  RefreshSignal,
  ProviderPlayerRecord,
} from "@/lib/fantasy/types";
import { buildCanonicalPlayers } from "@/lib/fantasy/identity";
import { yahooLeagueConfig } from "@/lib/fantasy/scoring";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "@/lib/fantasy/leagueSourceOfTruth";

const providerRecords: ProviderPlayerRecord[] = [
  {
    provider: "fantasypros",
    providerPlayerId: "fp-bijan",
    fullName: "Bijan Robinson",
    team: "ATL",
    positions: ["RB"],
    age: 24,
    externalIds: { fantasyPros: "fp-bijan", sleeper: "4017", yahoo: "33186" },
  },
  {
    provider: "sleeper",
    providerPlayerId: "4017",
    fullName: "Bijan Robinson",
    team: "ATL",
    positions: ["RB"],
    age: 24,
    externalIds: { fantasyPros: "fp-bijan", sleeper: "4017" },
  },
  {
    provider: "fantasypros",
    providerPlayerId: "fp-mhj",
    fullName: "Marvin Harrison Jr.",
    team: "ARI",
    positions: ["WR"],
    age: 24,
    externalIds: { fantasyPros: "fp-mhj", sleeper: "11699", yahoo: "37314" },
  },
  {
    provider: "nflverse",
    providerPlayerId: "00-0039999",
    fullName: "Marvin Harrison Jr.",
    team: "ARI",
    positions: ["WR"],
    age: 24,
    externalIds: { nflverse: "00-0039999", fantasyPros: "fp-mhj" },
  },
  {
    provider: "fantasypros",
    providerPlayerId: "fp-bowers",
    fullName: "Brock Bowers",
    team: "LV",
    positions: ["TE"],
    age: 23,
    externalIds: { fantasyPros: "fp-bowers", sleeper: "11697", yahoo: "37318" },
  },
  {
    provider: "fantasypros",
    providerPlayerId: "fp-daniels",
    fullName: "Jayden Daniels",
    team: "WAS",
    positions: ["QB"],
    age: 25,
    externalIds: { fantasyPros: "fp-daniels", sleeper: "11566", yahoo: "37264" },
  },
  {
    provider: "fantasypros",
    providerPlayerId: "fp-brown",
    fullName: "Chase Brown",
    team: "CIN",
    positions: ["RB"],
    age: 26,
    externalIds: { fantasyPros: "fp-brown", sleeper: "8112", yahoo: "34429" },
  },
];

const projectionsByFantasyProsId: Record<string, ProjectionSnapshot> = {
  "fp-bijan": {
    season: 2026,
    provider: "fantasypros",
    scoringType: "HALF_PPR",
    asOf: "2026-08-12T08:30:00-04:00",
    playerId: "fp-bijan",
    stats: {
      rushingYards: 1320,
      rushingTouchdowns: 10,
      receptions: 58,
      receivingYards: 470,
      receivingTouchdowns: 3,
      fumblesLost: 1,
    },
    range: { p10: 195, p50: 258, p90: 321 },
  },
  "fp-mhj": {
    season: 2026,
    provider: "fantasypros",
    scoringType: "HALF_PPR",
    asOf: "2026-08-12T08:30:00-04:00",
    playerId: "fp-mhj",
    stats: {
      receptions: 96,
      receivingYards: 1375,
      receivingTouchdowns: 10,
      rushingYards: 35,
      fumblesLost: 1,
    },
    range: { p10: 183, p50: 247, p90: 313 },
  },
  "fp-bowers": {
    season: 2026,
    provider: "fantasypros",
    scoringType: "HALF_PPR",
    asOf: "2026-08-12T08:30:00-04:00",
    playerId: "fp-bowers",
    stats: {
      receptions: 92,
      receivingYards: 1090,
      receivingTouchdowns: 8,
      fumblesLost: 1,
    },
    range: { p10: 159, p50: 214, p90: 277 },
  },
  "fp-daniels": {
    season: 2026,
    provider: "fantasypros",
    scoringType: "HALF_PPR",
    asOf: "2026-08-12T08:30:00-04:00",
    playerId: "fp-daniels",
    stats: {
      passingYards: 3920,
      passingTouchdowns: 28,
      interceptions: 12,
      rushingYards: 780,
      rushingTouchdowns: 7,
      fumblesLost: 3,
    },
    range: { p10: 235, p50: 296, p90: 352 },
  },
  "fp-brown": {
    season: 2026,
    provider: "fantasypros",
    scoringType: "HALF_PPR",
    asOf: "2026-08-12T08:30:00-04:00",
    playerId: "fp-brown",
    stats: {
      rushingYards: 940,
      rushingTouchdowns: 8,
      receptions: 41,
      receivingYards: 310,
      receivingTouchdowns: 2,
      fumblesLost: 2,
    },
    range: { p10: 118, p50: 173, p90: 247 },
  },
};

export const fixturePlayers = buildCanonicalPlayers(providerRecords);

export const fixtureCandidates: DraftCandidate[] = fixturePlayers
  .map((player) => {
    const fantasyProsId = player.externalIds.fantasyPros;
    if (!fantasyProsId) {
      return null;
    }

    const projection = projectionsByFantasyProsId[fantasyProsId];
    if (!projection) {
      return null;
    }

    const marketDefaults: Record<
      string,
      { adp: number; ecr: number; tier: number; expertStdDev?: number; adpSource: "direct" }
    > = {
      "fp-bijan": { adp: 5, ecr: 4, tier: 1, expertStdDev: 2.1, adpSource: "direct" },
      "fp-mhj": { adp: 12, ecr: 14, tier: 2, expertStdDev: 4.6, adpSource: "direct" },
      "fp-bowers": { adp: 19, ecr: 18, tier: 2, expertStdDev: 5.1, adpSource: "direct" },
      "fp-daniels": { adp: 27, ecr: 24, tier: 3, expertStdDev: 6.3, adpSource: "direct" },
      "fp-brown": { adp: 42, ecr: 45, tier: 5, expertStdDev: 11.2, adpSource: "direct" },
    };

    return {
      player,
      projection,
      market: marketDefaults[fantasyProsId],
    };
  })
  .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

const fixtureRefreshSignalsSeed: RefreshSignal[] = [
  {
    playerId: fixturePlayers.find((player) => player.fullName === "Marvin Harrison Jr.")?.id ?? "",
    category: "role-up",
    headline: "Marvin Harrison Jr. working as a true alpha in camp",
    summary: "Recent camp reporting points toward heavy featured-usage expectations.",
    source: "beat-report",
    publishedAt: "2026-08-11T18:00:00-04:00",
    confidence: "medium",
    impact: 3.2,
  },
  {
    playerId: fixturePlayers.find((player) => player.fullName === "Marvin Harrison Jr.")?.id ?? "",
    category: "adp-steam",
    headline: "Marvin Harrison Jr. ADP is still climbing",
    summary: "Market momentum is continuing into late draft season.",
    source: "sleeper-market",
    publishedAt: "2026-08-12T08:00:00-04:00",
    confidence: "medium",
    impact: 1.6,
  },
  {
    playerId: fixturePlayers.find((player) => player.fullName === "Chase Brown")?.id ?? "",
    category: "role-down",
    headline: "Backfield split concerns remain for Chase Brown",
    summary: "Late-cycle reporting still questions how secure the weekly workload really is.",
    source: "fantasypros-news",
    publishedAt: "2026-08-11T09:30:00-04:00",
    confidence: "medium",
    impact: 3.4,
  },
  {
    playerId: fixturePlayers.find((player) => player.fullName === "Chase Brown")?.id ?? "",
    category: "camp-buzz-down",
    headline: "Chase Brown camp tone cools slightly",
    summary: "The buzz is softer than it was earlier in the summer.",
    source: "beat-report",
    publishedAt: "2026-08-10T14:00:00-04:00",
    confidence: "low",
    impact: 1.4,
  },
  {
    playerId: fixturePlayers.find((player) => player.fullName === "Jayden Daniels")?.id ?? "",
    category: "offense-up",
    headline: "Washington offense generating more optimism",
    summary: "Improving environment notes support the ceiling path around Daniels.",
    source: "fantasypros-news",
    publishedAt: "2026-08-12T07:15:00-04:00",
    confidence: "medium",
    impact: 2.3,
  },
];

export const fixtureRefreshSignals: RefreshSignal[] = fixtureRefreshSignalsSeed
  .filter((signal) => signal.playerId)
  .map((signal) => ({ ...signal }));

export const fixtureDraftState: DraftState = {
  leagueConfigVersion: leagueSourceOfTruth.version,
  leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
  league: yahooLeagueConfig,
  myTeamId: "me",
  currentPick: 18,
  picksUntilNextTurn: 7,
  focus: "balanced",
  availablePlayerIds: fixturePlayers.map((player) => player.id),
  drafted: [],
  teams: [
    {
      teamId: "me",
      starters: ["l-jackson", "a-gibbs", "b-thomas-jr", "george-kittle"],
      bench: [],
      positionCounts: { QB: 1, RB: 1, WR: 1, TE: 1 },
      openSlots: ["RB", "WR", "FLEX", "BENCH", "BENCH"],
    },
    {
      teamId: "team-2",
      starters: [],
      bench: [],
      positionCounts: { RB: 0, WR: 2, TE: 0, QB: 1 },
      openSlots: ["RB", "RB", "TE", "FLEX"],
    },
    {
      teamId: "team-3",
      starters: [],
      bench: [],
      positionCounts: { RB: 1, WR: 1, TE: 1, QB: 0 },
      openSlots: ["QB", "RB", "WR", "FLEX"],
    },
    {
      teamId: "team-4",
      starters: [],
      bench: [],
      positionCounts: { RB: 0, WR: 1, TE: 0, QB: 1 },
      openSlots: ["RB", "RB", "WR", "TE", "FLEX"],
    },
    {
      teamId: "team-5",
      starters: [],
      bench: [],
      positionCounts: { RB: 2, WR: 0, TE: 0, QB: 1 },
      openSlots: ["WR", "WR", "TE", "FLEX"],
    },
    {
      teamId: "team-6",
      starters: [],
      bench: [],
      positionCounts: { RB: 1, WR: 2, TE: 0, QB: 0 },
      openSlots: ["QB", "RB", "TE", "FLEX"],
    },
    {
      teamId: "team-7",
      starters: [],
      bench: [],
      positionCounts: { RB: 1, WR: 1, TE: 1, QB: 1 },
      openSlots: ["RB", "WR", "FLEX"],
    },
    {
      teamId: "team-8",
      starters: [],
      bench: [],
      positionCounts: { RB: 0, WR: 2, TE: 0, QB: 1 },
      openSlots: ["RB", "RB", "TE", "FLEX"],
    },
  ],
};
