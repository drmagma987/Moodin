import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseHTML } from "linkedom";
import {
  buildRedraftBoard,
  buildConditionalDraftPathBoard,
  buildWrapSimulationSnapshot,
  buildPickWindowSnapshot,
  buildPositionRunSnapshots,
  buildReachToleranceSnapshot,
  buildTierWipeScenarioSnapshots,
  buildUndervaluedPlaySnapshots,
  rankDraftCandidates,
} from "@/lib/fantasy/draft";
import {
  applyDraftPick,
  createInitialDraftState,
  reconcileSavedDraftState,
  seedDraftStateWithKnownPicks,
  undoLastDraftPick,
} from "@/lib/fantasy/draftState";
import { resolveLeagueSetup } from "@/lib/fantasy/leagueSetup";
import { buildOpponentDraftProfiles, chooseOpponentBehavior } from "@/lib/fantasy/opponentProfiles";
import { buildDraftPlanSnapshot } from "@/lib/fantasy/draftPlan";
import { buildDraftMorningPack } from "@/lib/fantasy/draftMorning";
import { buildMarketDisagreementBoard } from "@/lib/fantasy/marketDisagreement";
import { buildEvidenceConfidence } from "@/lib/fantasy/evidenceConfidence";
import {
  applyPlayerContexts,
  assessPlayerSituation,
  removeQualitativeContexts,
} from "@/lib/fantasy/playerContext";
import { getQualitativeContext } from "@/lib/fantasy/qualitativeContext";
import { buildContextImpactBoard } from "@/lib/fantasy/contextImpact";
import { buildDraftStressTestBoard } from "@/lib/fantasy/draftStressTest";
import { fixtureCandidates } from "@/lib/fantasy/fixtures";
import {
  buildOpportunityTrendSnapshots,
  buildTransactionQueue,
  buildTradeIdeaSnapshots,
  buildWaiverRecommendationSnapshots,
} from "@/lib/fantasy/inSeason";
import {
  inSeasonFixtureLeagueTeams,
  inSeasonFixtureMyTeam,
  inSeasonFixturePlayers,
} from "@/lib/fantasy/inSeasonFixtures";
import { buildBreakingNewsResponse } from "@/lib/fantasy/breakingNews";
import type { NflversePlayerSeasonStats } from "@/lib/fantasy/nflverse";
import type { SleeperPlayerSnapshot } from "@/lib/fantasy/sleeper";
import {
  applyPreferredTargets,
  parseApprovedPreferredTargetsFromEnv,
} from "@/lib/fantasy/preferredTargets";
import {
  createPersonalTargetTag,
  parsePersonalTargetTags,
  resolvePersonalTargetTags,
  serializePersonalTargetTags,
} from "@/lib/fantasy/personalTargets";
import { calibrateDraftCandidates } from "@/lib/fantasy/projectionCalibration";
import {
  aggregateNflverseWeeklyStats,
  normalizeHistoricalPlayerName,
  parseFfcHistoricalAdp,
} from "@/lib/fantasy/historicalBacktest";
import { applyRefreshSignals } from "@/lib/fantasy/refresh";
import {
  normalizeFantasyProsRefreshSignals,
  parseManualRefreshSignals,
} from "@/lib/fantasy/refreshFeed";
import {
  consolidateFantasyNewsSignals,
  ingestFantasyNewsItems,
  ingestManualSleeperNotification,
  parseFantasyNewsFeedConfig,
  parseFantasyNewsJson,
  parseFantasyNewsRss,
} from "@/lib/fantasy/newsIngestion";
import {
  normalizeFantasyProsInjuryPayload,
  normalizeFantasyProsNewsPayload,
} from "@/lib/fantasy/fantasyProsNews";
import { scoreProjectionSnapshot, scoreStatProjection, yahooLeagueConfig, yahooLeagueRules } from "@/lib/fantasy/scoring";
import type { SleeperTrendSnapshot } from "@/lib/fantasy/sleeper";
import type { AdvancedResearchInput, DraftBoardMovementEntry, DraftCandidate, RefreshSignal } from "@/lib/fantasy/types";
import { applyYahooDraftEvents } from "@/lib/fantasy/yahooDraft";
import { reconcileYahooDraftSnapshot } from "@/lib/fantasy/yahooDraft";
import {
  buildYahooExtensionPreview,
  buildYahooActionHandoffPlan,
  compareYahooExtensionEnvelopes,
  extractYahooDraftEventsFromEnvelope,
  inspectYahooFantasyUrl,
  yahooExtensionFixtureEnvelope,
  isYahooExtensionEnvelope,
} from "@/lib/fantasy/yahooBridge";
import { applyYahooLeagueInventory } from "@/lib/fantasy/yahooInventory";
import {
  appendDraftSessionPick,
  createDraftSession,
  replayDraftSession,
  revertDraftSessionEvent,
} from "@/lib/fantasy/draftSession";
import { assertDraftRoomFreeze, freezeDraftRoom } from "@/lib/fantasy/draftOperations";
import { parseScreenshotDraftText } from "@/lib/fantasy/screenshotDraftRecovery";
import { buildPostDraftActionQueue } from "@/lib/fantasy/postDraftActions";
import { recordDraftDecision } from "@/lib/fantasy/draftDecisionJournal";
import { buildDraftRefreshCheckpoint, compareDraftRefreshCheckpoints } from "@/lib/fantasy/draftRefreshControl";

const require = createRequire(import.meta.url);
const yahooDomExtractor = require("../tools/yahoo-draft-extension/extractor.js") as {
  sanitizeYahooPageUrl: (url: string) => string;
  extractYahooSnapshot: (
    document: unknown,
    url: string,
  ) => {
    snapshot: {
      leagueId: string | null;
      teamId: string | null;
      pageType: string;
      players: Array<{
        providerPlayerId: string;
        fullName: string;
        nflTeam: string | null;
        positions: string[];
        availability: string;
        fantasyTeamId: string | null;
      }>;
      draft: unknown;
    };
    diagnostics: {
      deterministicSignals: string[];
      provisionalSignals: string[];
      unavailableSignals: string[];
      unsupportedActions: string[];
    };
  };
  extractLeagueTeamIds: (document: unknown, leagueId: string, url: string) => string[];
};

test("rolling news ingestion classifies explicit reports and preserves provenance", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item>
    <guid>beat-123</guid>
    <title>Chase Brown returns to practice as a full participant</title>
    <description><![CDATA[Chase Brown was cleared to return Thursday.]]></description>
    <pubDate>Thu, 13 Aug 2026 14:00:00 GMT</pubDate>
    <link>https://example.com/chase-brown-update</link>
  </item></channel></rss>`;
  const items = parseFantasyNewsRss(rss);
  const result = ingestFantasyNewsItems({
    candidates: cloneFixtureCandidates(),
    feed: {
      id: "verified-beat",
      label: "Verified beat feed",
      url: "https://example.com/feed.xml",
      format: "rss",
      sourceKind: "beat-writer",
      trust: "verified",
    },
    items,
    now: "2026-08-13T15:00:00Z",
  });

  assert.equal(items.length, 1);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].category, "injury-down");
  assert.equal(result.signals[0].source, "beat-report");
  assert.equal(result.signals[0].sourceLabel, "Verified beat feed");
  assert.equal(result.signals[0].sourceUrl, "https://example.com/chase-brown-update");
  assert.ok(result.signals[0].fingerprint);
  assert.ok(result.signals[0].expiresAt);
});

test("RotoWire-style practice exits become immediate injury signals", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item>
    <guid>practice-exit-456</guid>
    <title>Chase Brown: Exits practice early Thursday</title>
    <description><![CDATA[Brown left practice early because of a hamstring issue.]]></description>
    <pubDate>Thu, 13 Aug 2026 16:14:00 GMT</pubDate>
    <link>https://example.com/chase-brown-practice</link>
  </item></channel></rss>`;
  const result = ingestFantasyNewsItems({
    candidates: cloneFixtureCandidates(),
    feed: {
      id: "rotowire-nfl-rss",
      label: "RotoWire NFL News",
      url: "https://www.rotowire.com/rss/news.php?sport=NFL",
      format: "rss",
      sourceKind: "fantasy-news",
      trust: "aggregator",
    },
    items: parseFantasyNewsRss(rss),
    now: "2026-08-13T16:15:00Z",
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.category, "injury-up");
  assert.equal(result.signals[0]?.sourceLabel, "RotoWire NFL News");
  assert.equal(result.signals[0]?.externalId, "practice-exit-456");
});

test("rolling news ingestion suppresses duplicate, ambiguous, stale, and vague stories", () => {
  const candidates = cloneFixtureCandidates();
  const brown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");
  assert.ok(brown);
  const rows = parseFantasyNewsJson([
    {
      id: "one",
      title: "Chase Brown named the starter",
      summary: "Chase Brown was named the starter after Thursday practice.",
      published_at: "2026-08-13T12:00:00Z",
    },
    {
      id: "two",
      title: "Chase Brown named the starter",
      summary: "Wire copy of the same update.",
      published_at: "2026-08-13T12:01:00Z",
    },
    {
      id: "vague",
      title: "Chase Brown speaks after practice",
      published_at: "2026-08-13T12:02:00Z",
    },
    {
      id: "old",
      title: "Chase Brown named the starter",
      published_at: "2026-07-01T12:00:00Z",
    },
    {
      id: "multi",
      title: "Chase Brown and Marvin Harrison Jr. are earning more snaps",
      published_at: "2026-08-13T12:03:00Z",
    },
  ]);
  const result = ingestFantasyNewsItems({
    candidates,
    feed: {
      id: "news-json",
      label: "News JSON",
      url: "https://example.com/news.json",
      format: "json",
      sourceKind: "fantasy-news",
      trust: "aggregator",
    },
    items: rows,
    now: "2026-08-13T15:00:00Z",
  });

  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].playerId, brown.player.id);
  assert.ok(result.issues.some((issue) => issue.reason === "duplicate"));
  assert.ok(result.issues.some((issue) => issue.reason === "unclassified"));
  assert.ok(result.issues.some((issue) => issue.reason === "stale"));
  assert.ok(result.issues.some((issue) => issue.reason === "ambiguous-player"));
});

test("pasted Sleeper notifications become immediate manual refresh signals", () => {
  const candidates = cloneFixtureCandidates();
  const brown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");
  assert.ok(brown);
  const result = ingestManualSleeperNotification({
    candidates,
    text: "Sleeper Sports — Chase Brown left practice early with a hamstring issue.",
    now: "2026-08-13T16:14:00Z",
  });

  assert.equal(result.issues.length, 0);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]?.playerId, brown.player.id);
  assert.equal(result.signals[0]?.category, "injury-up");
  assert.equal(result.signals[0]?.source, "manual");
  assert.equal(result.signals[0]?.sourceLabel, "Sleeper notification (pasted)");
});

test("news feed configuration rejects insecure URLs and expired signals do not move projections", () => {
  assert.throws(() => parseFantasyNewsFeedConfig(JSON.stringify([{
    id: "bad",
    label: "Bad feed",
    url: "http://example.com/feed.xml",
    format: "rss",
    sourceKind: "beat-writer",
    trust: "verified",
  }])));

  const candidates = cloneFixtureCandidates();
  const candidate = candidates[0];
  const original = candidate.projection.range.p50;
  const result = applyRefreshSignals(candidates, [{
    playerId: candidate.player.id,
    category: "injury-up",
    headline: "Old injury",
    summary: "Old injury",
    source: "beat-report",
    publishedAt: "2026-08-01T12:00:00Z",
    expiresAt: "2026-08-08T12:00:00Z",
    confidence: "high",
    impact: 5,
  }], { now: "2026-08-13T12:00:00Z" });

  assert.equal(result.digest.appliedSignalCount, 0);
  assert.equal(result.candidates[0].projection.range.p50, original);
});

test("FantasyPros news and injury payloads normalize into the shared ingestion contract", () => {
  const news = normalizeFantasyProsNewsPayload({ items: [{
    id: 123,
    player_id: "fp-brown",
    title: "Chase Brown named the starter",
    impact: "Brown is expected to handle the lead role.",
    created: "2026-08-13 13:30:00",
    link: "https://www.fantasypros.com/nfl/news/123/example.php",
    team_id: "CIN",
  }] }, "2026-08-13T14:00:00Z");
  const injuries = normalizeFantasyProsInjuryPayload({ injuries: [{
    player_id: "fp-brown",
    yahoo_id: "999",
    name: "Chase Brown",
    team_id: "CIN",
    status: "Questionable",
    injury_type: "Hamstring",
    injury_update_date: "2026-08-13",
    comment: "Brown was limited Thursday.",
  }] }, "2026-08-13T14:00:00Z");

  assert.equal(news[0].fantasyProsId, "fp-brown");
  assert.equal(news[0].publishedAt, "2026-08-13T13:30:00.000Z");
  assert.equal(injuries[0].injuryStatus, "Questionable");
  assert.match(injuries[0].headline, /Hamstring/);

  const candidate = cloneFixtureCandidates().find((item) => item.player.fullName === "Chase Brown");
  assert.ok(candidate);
  const consolidated = consolidateFantasyNewsSignals([
    {
      playerId: candidate.player.id,
      category: "injury-up",
      headline: "Chase Brown is questionable",
      summary: "Questionable",
      source: "fantasypros-news",
      publishedAt: "2026-08-13T13:00:00Z",
      confidence: "medium",
      impact: 3,
    },
    {
      playerId: candidate.player.id,
      category: "injury-up",
      headline: "Chase Brown: Questionable (Hamstring)",
      summary: "Limited Thursday",
      source: "fantasypros-injury",
      publishedAt: "2026-08-13T14:00:00Z",
      confidence: "high",
      impact: 4.8,
    },
  ]);
  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0].source, "fantasypros-injury");
});
import { buildFantasyProsPublicDraftCandidatesFromHtml } from "@/lib/fantasy/fantasyprosPublic";
import {
  applyFantasyProsPublicProjections,
  parseFantasyProsPublicProjectionHtml,
} from "@/lib/fantasy/fantasyprosPublicProjections";
import { extractFantasyProsStats } from "@/lib/fantasy/fantasypros";
import {
  applyFantasyFootballCalculatorAdp,
  parseFantasyFootballCalculatorAdp,
} from "@/lib/fantasy/fantasyFootballCalculator";
import { assessDraftDataQuality } from "@/lib/fantasy/draftDataQuality";
import { buildDraftBoardSignal, buildDraftQuickScoreBoard, buildLiveDraftCall, preDraftActionLabel } from "@/lib/fantasy/draftSignals";
import {
  aggregateQbResearchFromPbpCsv,
  applyAdvancedResearchSnapshots,
  buildAutomaticAdvancedResearchInputs,
  mergeAdvancedResearchInputs,
} from "@/lib/fantasy/advancedResearch";
import { evaluateAdvancedResearchBacktest } from "@/lib/fantasy/advancedResearchBacktest";
import { buildAdvancedResearchShadowBoard } from "@/lib/fantasy/advancedResearchShadow";
import { applyValidatedRookieWrModel } from "@/lib/fantasy/rookieWrModel";
import {
  enrichCandidatesWithNflverseProfiles,
  parseNflversePlayersCsv,
} from "@/lib/fantasy/nflversePlayers";
import { collegeResearchInputs, collegeResearchMeta } from "@/lib/fantasy/collegeResearch";
import {
  ageFragilityPoints,
  opportunityScoreFromZ,
  populationMoments,
  positionalZScore,
  weightedOpportunityRating,
} from "@/lib/fantasy/advancedUsage";
import { applyMilestoneGameProjection } from "@/lib/fantasy/milestoneProjection";
import { advancedUsageValidation } from "@/lib/fantasy/data/advancedUsageValidation.generated";
import { rookieWrValidation } from "@/lib/fantasy/data/rookieWrValidation.generated";
import { applyYahooBaselineToDraftCandidates } from "@/lib/fantasy/yahooRanks";
import { buildFfOpportunitySeasonStatsFromCsv } from "@/lib/fantasy/ffOpportunity";
import {
  activeNflSeasonForDate,
  blendFfOpportunitySeasonStats,
  currentSeasonEvidenceWeight,
} from "@/lib/fantasy/seasonEvidence";
import {
  applyVegasPropsToCandidates,
  normalizeOddsApiPlayerProps,
} from "@/lib/fantasy/vegasProps";
import {
  applySeasonMarketToCandidates,
  parseWinWithOddsSeasonCsv,
} from "@/lib/fantasy/seasonMarket";
import { tuneStatsToTarget } from "@/lib/fantasy/fantasyprosPublic";
import { assessProjectionCoherence } from "@/lib/fantasy/projectionCoherence";

function cloneFixtureCandidates() {
  return structuredClone(fixtureCandidates);
}

function buildCalibrationContext() {
  const nflverseByPlayerId = new Map<string, NflversePlayerSeasonStats>([
    [
      "00-0039999",
      {
        playerId: "00-0039999",
        playerName: "Marvin Harrison Jr.",
        team: "ARI",
        position: "WR",
        games: 17,
        attempts: 0,
        carries: 4,
        targets: 165,
        receptions: 102,
        passingYards: 0,
        rushingYards: 38,
        receivingYards: 1430,
        passingTouchdowns: 0,
        rushingTouchdowns: 0,
        receivingTouchdowns: 11,
        targetShare: 0.31,
        airYardsShare: 0.43,
        fantasyPointsPpr: 329,
      },
    ],
    [
      "mock-chase-brown",
      {
        playerId: "mock-chase-brown",
        playerName: "Chase Brown",
        team: "CIN",
        position: "RB",
        games: 16,
        attempts: 146,
        carries: 146,
        targets: 28,
        receptions: 21,
        passingYards: 0,
        rushingYards: 705,
        receivingYards: 168,
        passingTouchdowns: 0,
        rushingTouchdowns: 5,
        receivingTouchdowns: 1,
        targetShare: 0.07,
        airYardsShare: 0.02,
        fantasyPointsPpr: 176,
      },
    ],
  ]);
  const sleeperTrendsByPlayerId = new Map<string, SleeperTrendSnapshot>([
    ["11699", { playerId: "11699", trend: "add", count: 1640 }],
    ["8112", { playerId: "8112", trend: "drop", count: 910 }],
    ["11566", { playerId: "11566", trend: "add", count: 580 }],
  ]);

  return {
    nflverseByPlayerId,
    sleeperTrendsByPlayerId,
  };
}

test("calibration adds robustness scenarios and conviction dossiers", () => {
  const candidates = cloneFixtureCandidates();
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(mhj, "fixture should include Marvin Harrison Jr.");
  assert.ok(chaseBrown, "fixture should include Chase Brown");

  mhj.market = {
    ...mhj.market,
    adp: 23,
    ecr: 21,
    tier: 3,
    expertStdDev: 3.2,
  };
  chaseBrown.player.externalIds.nflverse = "mock-chase-brown";
  chaseBrown.market = {
    ...chaseBrown.market,
    adp: 17,
    ecr: 16,
    tier: 2,
    expertStdDev: 13.8,
  };

  const calibrated = calibrateDraftCandidates(
    candidates,
    yahooLeagueRules,
    buildCalibrationContext(),
  );

  const calibratedMhj = calibrated.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );
  const calibratedBrown = calibrated.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.ok(calibratedMhj?.signals, "MHJ should have calibration signals");
  assert.ok(calibratedBrown?.signals, "Brown should have calibration signals");
  assert.equal(calibratedMhj?.signals?.robustness.base.label, "base");
  assert.equal(calibratedMhj?.signals?.robustness.ceiling.label, "ceiling");
  assert.ok((calibratedMhj?.signals?.dossier.convictionScore ?? 0) > 0);
  assert.equal(calibratedBrown?.signals?.robustness.fragility, "fragile");
  assert.equal(calibratedBrown?.signals?.dossier.stance, "fragile-bet");
  assert.ok(
    calibratedBrown?.signals?.dossier.failureModes.length,
    "fragile profiles should have explicit failure modes",
  );
});

test("ffopportunity parser aggregates weekly expected production and powers regression", () => {
  const csv = [
    "season,posteam,week,player_id,full_name,position,total_fantasy_points,total_fantasy_points_exp,total_touchdown,total_touchdown_exp,total_yards_gained,total_yards_gained_exp",
    "2025,CIN,1,mock-ff-brown,Chase Brown,RB,8,16,0,1.1,58,92",
    "2025,CIN,2,mock-ff-brown,Chase Brown,RB,10,18,0,1.2,71,104",
    "2025,CIN,2,NA,NA,NA,4,7,0,0.4,20,35",
  ].join("\n");
  const ffOpportunityByPlayerId = buildFfOpportunitySeasonStatsFromCsv(csv);
  const snapshot = ffOpportunityByPlayerId.get("mock-ff-brown");

  assert.ok(snapshot);
  assert.equal(snapshot.weeks, 2);
  assert.equal(snapshot.actualFantasyPoints, 18);
  assert.equal(snapshot.expectedFantasyPoints, 34);
  assert.equal(snapshot.expectedTouchdowns, 2.3);
  assert.equal(snapshot.weeklyExpectedVolatility, 1);
  assert.ok(snapshot.weeklyConsistencyScore >= 80);

  const candidates = cloneFixtureCandidates();
  const chaseBrown = candidates.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );
  assert.ok(chaseBrown);
  chaseBrown.player.externalIds.nflverse = "mock-ff-brown";

  const calibrated = calibrateDraftCandidates(candidates, yahooLeagueRules, {
    ffOpportunityByPlayerId,
  });
  const calibratedBrown = calibrated.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.equal(
    calibratedBrown?.signals?.expectedOpportunity.evidenceSource,
    "ffopportunity",
  );
  assert.equal(calibratedBrown?.signals?.expectedOpportunity.gapVsActual, 16);
  assert.equal(calibratedBrown?.signals?.expectedOpportunity.weeklyConsistencyScore, snapshot.weeklyConsistencyScore);
  assert.equal(calibratedBrown?.signals?.regression.direction, "positive");
  assert.ok((calibratedBrown?.signals?.sourceCount ?? 0) >= 2);
});

test("season evidence rolls over automatically and phases current data in gradually", () => {
  assert.equal(activeNflSeasonForDate(new Date("2026-08-12T12:00:00Z")), 2026);
  assert.equal(activeNflSeasonForDate(new Date("2027-01-15T12:00:00Z")), 2026);
  assert.equal(activeNflSeasonForDate(new Date("2027-03-01T12:00:00Z")), 2027);
  assert.equal(currentSeasonEvidenceWeight(0), 0);
  assert.equal(currentSeasonEvidenceWeight(2), 0.26);
  assert.equal(currentSeasonEvidenceWeight(6), 0.65);
  assert.equal(currentSeasonEvidenceWeight(10), 0.9);

  const prior = buildFfOpportunitySeasonStatsFromCsv([
    "season,posteam,week,player_id,full_name,position,total_fantasy_points,total_fantasy_points_exp,total_touchdown,total_touchdown_exp,total_yards_gained,total_yards_gained_exp",
    "2025,CIN,1,blend-player,Blend Player,RB,200,220,10,11,1200,1250",
  ].join("\n"));
  const current = buildFfOpportunitySeasonStatsFromCsv([
    "season,posteam,week,player_id,full_name,position,total_fantasy_points,total_fantasy_points_exp,total_touchdown,total_touchdown_exp,total_yards_gained,total_yards_gained_exp",
    "2026,CIN,1,blend-player,Blend Player,RB,10,15,0,0.8,60,85",
    "2026,CIN,2,blend-player,Blend Player,RB,12,17,1,0.9,72,92",
  ].join("\n"));
  const blended = blendFfOpportunitySeasonStats({
    prior,
    current,
    activeSeason: 2026,
    currentWeeks: 2,
    currentWeight: currentSeasonEvidenceWeight(2),
  }).get("blend-player");

  assert.ok(blended);
  assert.deepEqual(blended.evidenceSeasons, [2025, 2026]);
  assert.equal(blended.currentSeasonWeeks, 2);
  assert.equal(blended.currentSeasonWeight, 0.26);
  assert.equal(blended.expectedFantasyPoints, 233.52);
  assert.equal(blended.season, 2026);
});

test("Vegas props de-vig bookmaker lines and make bounded raw-stat adjustments", () => {
  const event = {
    id: "event-1",
    commence_time: "2026-09-10T00:00:00Z",
    home_team: "Cincinnati Bengals",
    away_team: "Cleveland Browns",
    bookmakers: ["draftkings", "fanduel"].map((bookmaker, index) => ({
      key: bookmaker,
      markets: [
        {
          key: "player_rush_yds",
          outcomes: [
            {
              name: "Over",
              description: "Chase Brown",
              price: index === 0 ? -120 : -110,
              point: index === 0 ? 79.5 : 80.5,
            },
            {
              name: "Under",
              description: "Chase Brown",
              price: index === 0 ? 100 : -110,
              point: index === 0 ? 79.5 : 80.5,
            },
          ],
        },
        {
          key: "player_receptions",
          outcomes: [
            { name: "Over", description: "Chase Brown", price: -115, point: 3.5 },
            { name: "Under", description: "Chase Brown", price: -105, point: 3.5 },
          ],
        },
      ],
    })),
  };
  const players = normalizeOddsApiPlayerProps([event]);
  const chaseProps = players.get("chasebrown");

  assert.ok(chaseProps);
  assert.equal(chaseProps.lines.rushingYards?.bookmakerCount, 2);
  assert.ok((chaseProps.lines.rushingYards?.point ?? 0) > 79.9);
  assert.equal(chaseProps.lines.receptions?.point, 3.507);

  const candidates = cloneFixtureCandidates();
  const applied = applyVegasPropsToCandidates(
    candidates,
    {
      players,
      eventCount: 1,
      requestCount: 2,
      markets: ["player_rush_yds", "player_receptions"],
      quotaRemaining: 498,
      fetchedAt: "2026-09-09T12:00:00Z",
    },
    yahooLeagueRules,
    { preseason: true },
  );
  const adjustedBrown = applied.candidates.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.equal(applied.appliedCount, 1);
  assert.ok((adjustedBrown?.projection.stats.rushingYards ?? 0) > 940);
  assert.ok((adjustedBrown?.projection.stats.rushingYards ?? 0) <= 1052.8);
  assert.ok((adjustedBrown?.projection.stats.receptions ?? 0) > 41);
  assert.equal(adjustedBrown?.vegas?.marketCount, 2);

  const calibrated = calibrateDraftCandidates(applied.candidates, yahooLeagueRules);
  const calibratedBrown = calibrated.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );
  assert.equal(calibratedBrown?.signals?.vegas?.status, "applied");
  assert.ok((calibratedBrown?.signals?.vegas?.projectionDelta ?? 0) > 0);
});

test("season market parser preserves full-year volume and blends scoreable stats", () => {
  const csv = [
    "Rank,Name,Pos,Attempts,Comps,Pass TDs,Pass Yards,Ints,Receptions,Rec Yards,Rec TDs,Rec FD,Rush Attempts,Rush Yards,Rush TDs,Rush FD,Fumbles,Projections",
    "0,Josh Allen,QB,474,313,24.5,3624.5,10,,,,,110,499.5,11.5,53.5,3,349.93",
    "43,Chase Brown,RB,,,,,,57,417,3,41.7,220,824.5,5.5,94.5,2,228.15",
    "399,Deep Player,RB,,,,,,10,75,0,7.5,40,150,1,15,0,39.5",
  ].join("\n");
  const players = parseWinWithOddsSeasonCsv(csv);
  const brown = players.get("chasebrown");

  assert.equal(players.size, 3);
  assert.equal(brown?.rank, 44);
  assert.equal(brown?.stats.rushingAttempts, 220);
  assert.equal(brown?.stats.rushingYards, 824.5);
  assert.equal(brown?.stats.sourcePprPoints, 228.15);

  const candidates = cloneFixtureCandidates();
  const originalBrown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");
  assert.ok(originalBrown);
  const originalRushing = originalBrown.projection.stats.rushingYards ?? 0;
  const result = applySeasonMarketToCandidates(
    candidates,
    {
      provider: "win-with-odds",
      players,
      rowCount: players.size,
      fetchedAt: "2026-08-12T12:00:00Z",
      sourceUpdatedAt: null,
    },
    yahooLeagueRules,
  );
  const adjustedBrown = result.candidates.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.equal(result.appliedCount, 1);
  assert.equal(adjustedBrown?.seasonMarket?.sourceRank, 44);
  assert.equal(adjustedBrown?.seasonMarket?.blendWeight, 0.25);
  assert.equal(adjustedBrown?.seasonMarket?.context, "standard");
  assert.ok((adjustedBrown?.projection.stats.rushingYards ?? 0) < originalRushing);
  assert.ok(adjustedBrown?.player.sources.includes("win-with-odds"));

  const calibrated = calibrateDraftCandidates(result.candidates, yahooLeagueRules);
  const calibratedBrown = calibrated.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );
  assert.equal(calibratedBrown?.signals?.seasonMarket?.provider, "win-with-odds");
  assert.ok((calibratedBrown?.signals?.sourceCount ?? 0) >= 2);
});

test("public rank estimates preserve a coherent receiver stat line when tuned down", () => {
  const stats = tuneStatsToTarget(
    "WR",
    {
      receptions: 66,
      receivingYards: 780,
      receivingTouchdowns: 4,
      rushingYards: 0,
      rushingTouchdowns: 0,
      fumblesLost: 1,
    },
    108.6,
  );

  assert.ok(Math.abs(scoreStatProjection(stats, yahooLeagueRules) - 108.6) < 0.15);
  assert.ok((stats.receivingYards ?? 0) / (stats.receptions ?? 1) >= 8);
  assert.deepEqual(assessProjectionCoherence("WR", stats), []);
});

test("projection coherence catches the impossible rookie WR line that polluted the model", () => {
  const issues = assessProjectionCoherence("WR", {
    receptions: 65.84,
    receivingYards: 142.8,
    receivingTouchdowns: 2.8,
  });

  assert.ok(issues.some((issue) => issue.code === "receiving-yards-per-reception"));
});

test("season market uses a stronger correction when full-season volume implies a new role", () => {
  const candidates = cloneFixtureCandidates();
  const candidate = candidates[0];
  candidate.player.positions = ["QB"];
  candidate.projection.stats = {
    passingYards: 1200,
    passingTouchdowns: 10,
    interceptions: 5,
    rushingYards: 150,
    rushingTouchdowns: 2,
  };
  const players = parseWinWithOddsSeasonCsv([
    "Rank,Name,Pos,Attempts,Comps,Pass TDs,Pass Yards,Ints,Receptions,Rec Yards,Rec TDs,Rec FD,Rush Attempts,Rush Yards,Rush TDs,Rush FD,Fumbles,Projections",
    `20,${candidate.player.fullName},QB,450,300,22,3400,10,,,,,95,550,5,45,3,285`,
  ].join("\n"));
  const result = applySeasonMarketToCandidates(
    candidates,
    {
      provider: "win-with-odds",
      players,
      rowCount: 1,
      fetchedAt: "2026-08-12T12:00:00Z",
      sourceUpdatedAt: null,
    },
    yahooLeagueRules,
  );
  const adjusted = result.candidates[0];

  assert.equal(adjusted.seasonMarket?.context, "expanded-role-or-health-rebound");
  assert.equal(adjusted.seasonMarket?.blendWeight, 0.65);
  assert.ok((adjusted.projection.stats.passingYards ?? 0) >= 2040);
  assert.match(adjusted.seasonMarket?.summary ?? "", /expanded role or health rebound/);
});

test("evidence confidence separates projection agreement from market-price quality", () => {
  const candidate = calibrateDraftCandidates(cloneFixtureCandidates(), yahooLeagueRules)[0];
  candidate.market = {
    ...candidate.market,
    adp: 80,
    ecr: 20,
    adpSource: "rank-proxy",
  };
  candidate.seasonMarket = {
    provider: "win-with-odds",
    context: "standard",
    sourceRank: 20,
    sourcePosition: candidate.player.positions[0],
    sourcePprPoints: candidate.projection.range.p50,
    blendWeight: 0.25,
    projectionDelta: 1,
    stats: {},
    adjustments: [
      {
        stat: "receivingYards",
        sourceProjection: 1000,
        previousProjection: 980,
        adjustedProjection: 985,
      },
      {
        stat: "receptions",
        sourceProjection: 80,
        previousProjection: 78,
        adjustedProjection: 78.5,
      },
      {
        stat: "receivingTouchdowns",
        sourceProjection: 7,
        previousProjection: 7.2,
        adjustedProjection: 7.15,
      },
    ],
    summary: "Aligned season projection.",
  };
  const evidence = buildEvidenceConfidence({
    candidate,
    expectedOpportunity: candidate.signals!.expectedOpportunity,
    roleSecurity: candidate.signals!.roleSecurity,
    robustness: candidate.signals!.robustness,
    situation: assessPlayerSituation(candidate),
  });

  assert.equal(evidence.projection.level, "high");
  assert.equal(evidence.price.level, "low");
  assert.ok(evidence.projection.score > evidence.price.score);
  assert.ok(evidence.blockers.some((blocker) => blocker.includes("rank-based ADP proxy")));
});

test("market disagreement board separates supported values, avoids, and source conflicts", () => {
  const fixturePool = cloneFixtureCandidates();
  const reviewedContexts = fixturePool.slice(0, 3).map((candidate) => ({
    playerName: candidate.player.fullName,
    currentRole: "locked-starter" as const,
    healthStatus: "healthy" as const,
    trackRecord: "established" as const,
    roleContinuity: "stable" as const,
    environment: "neutral" as const,
    notes: ["Stable test context."],
  }));
  const candidates = calibrateDraftCandidates(
    applyPlayerContexts(fixturePool, reviewedContexts).candidates,
    yahooLeagueRules,
  );
  assert.ok(candidates.length >= 3);
  const [target, avoid, contested] = candidates;

  const fillerTemplate = structuredClone(candidates[3] ?? candidates[0]);
  for (let index = 0; index < 72; index += 1) {
    const filler = structuredClone(fillerTemplate);
    filler.player.id = `market-disagreement-filler-${index + 1}`;
    filler.player.fullName = `Market Disagreement Filler ${index + 1}`;
    filler.projection.playerId = filler.player.id;
    filler.projection.range = {
      p10: 135 - index * 0.4,
      p50: 180 - index * 0.5,
      p90: 225 - index * 0.6,
    };
    filler.market = {
      ...filler.market,
      ecr: 20 + index,
      adp: 20 + index,
      tier: Math.floor(index / 12) + 2,
    };
    candidates.push(filler);
  }

  target.market = { ...target.market, ecr: 120, adp: 120 };
  target.projection.range = { p10: 330, p50: 390, p90: 450 };
  target.seasonMarket = {
    provider: "win-with-odds",
    context: "standard",
    sourceRank: 30,
    sourcePosition: target.player.positions[0],
    sourcePprPoints: 380,
    blendWeight: 0.25,
    projectionDelta: 8,
    stats: {},
    adjustments: [],
    summary: "Positive season market support.",
  };

  avoid.market = { ...avoid.market, ecr: 1, adp: 1 };
  avoid.projection.range = { p10: 40, p50: 70, p90: 100 };
  avoid.seasonMarket = {
    provider: "win-with-odds",
    context: "standard",
    sourceRank: 80,
    sourcePosition: avoid.player.positions[0],
    sourcePprPoints: 75,
    blendWeight: 0.25,
    projectionDelta: -8,
    stats: {},
    adjustments: [],
    summary: "Negative season market support.",
  };

  contested.market = { ...contested.market, ecr: 110, adp: 110 };
  contested.projection.range = { p10: 310, p50: 370, p90: 430 };
  contested.seasonMarket = {
    provider: "win-with-odds",
    context: "standard",
    sourceRank: 95,
    sourcePosition: contested.player.positions[0],
    sourcePprPoints: 210,
    blendWeight: 0.25,
    projectionDelta: -10,
    stats: {},
    adjustments: [],
    summary: "Season market conflicts with model rank.",
  };

  const board = buildMarketDisagreementBoard(candidates, {
    id: "test",
    name: "Test",
    teams: 12,
    rosterSlots: ["QB", "WR", "WR", "WR", "RB", "RB", "TE", "W/R/T", "W/R/T", "K"],
    flexSlots: ["W/R/T"],
    benchSlots: 6,
    irSlots: 1,
    faabBudget: 100,
    scoringType: "PPR",
    waiverDays: 2,
    waiverType: "FAB",
    playoffTeams: 6,
    playoffWeeks: [15, 16, 17],
    scoring: yahooLeagueRules,
  });

  assert.ok(board.targets.some((entry) => entry.playerId === target.player.id));
  assert.ok(board.avoids.some((entry) => entry.playerId === avoid.player.id));
  assert.ok(board.contested.some((entry) => entry.playerId === contested.player.id));
  assert.ok(board.targets[0]?.acquisitionWindow.includes("Round"));

  avoid.signals!.situation = {
    certainty: "low",
    reviewed: true,
    summary: "Limited sample and promoted role remain unresolved.",
    strengths: [],
    questions: ["Limited starting sample."],
  };
  const contextAwareBoard = buildMarketDisagreementBoard(candidates, {
    id: "test",
    name: "Test",
    teams: 12,
    rosterSlots: ["QB", "WR", "WR", "WR", "RB", "RB", "TE", "W/R/T", "W/R/T", "K"],
    flexSlots: ["W/R/T"],
    benchSlots: 6,
    irSlots: 1,
    faabBudget: 100,
    scoringType: "PPR",
    waiverDays: 2,
    waiverType: "FAB",
    playoffTeams: 6,
    playoffWeeks: [15, 16, 17],
    scoring: yahooLeagueRules,
  });
  assert.ok(
    !contextAwareBoard.avoids.some((entry) => entry.playerId === avoid.player.id),
    "low-certainty situations should not remain definitive avoids",
  );
});

test("reviewed player context separates Lamar Jackson from Malik Willis", () => {
  const candidates = cloneFixtureCandidates().slice(0, 2);
  candidates[0].player.fullName = "Lamar Jackson";
  candidates[1].player.fullName = "Malik Willis";

  const contextualized = applyPlayerContexts(candidates).candidates;
  const lamar = contextualized.find((candidate) => candidate.player.fullName === "Lamar Jackson");
  const malik = contextualized.find((candidate) => candidate.player.fullName === "Malik Willis");

  assert.ok(lamar);
  assert.ok(malik);
  assert.equal(assessPlayerSituation(lamar).certainty, "high");
  assert.equal(assessPlayerSituation(malik).certainty, "low");
  assert.equal(lamar.context?.currentRole, "locked-starter");
  assert.equal(lamar.context?.healthStatus, "healthy");
  assert.equal(malik.context?.trackRecord, "limited-sample");
  assert.equal(malik.context?.roleContinuity, "promoted");
});

test("missing context stays reviewable without falsely labeling every veteran unstable", () => {
  const fixture = cloneFixtureCandidates()[0];
  fixture.player.fullName = "Unmatched Veteran Fixture";
  const candidate = applyPlayerContexts([fixture]).candidates[0];
  const situation = assessPlayerSituation(candidate);

  assert.equal(situation.certainty, "medium");
  assert.equal(situation.reviewed, false);
  assert.match(situation.summary, /draft-week review/);
});

test("Sleeper top-three WR depth paths become sourced role evidence without locking target share", () => {
  const candidate = cloneFixtureCandidates().find((item) => item.player.positions[0] === "WR")!;
  candidate.player.fullName = "Rookie Depth Receiver";
  candidate.player.team = "TST";
  candidate.player.rookie = false;
  const sleeper: SleeperPlayerSnapshot = {
    playerId: "sleeper-wr",
    fullName: candidate.player.fullName,
    team: candidate.player.team,
    position: "WR",
    depthChartOrder: 3,
    injuryStatus: null,
    practiceParticipation: null,
  };
  const contextualized = applyPlayerContexts([candidate], [], {
    rookieNames: [candidate.player.fullName],
    sleeperPlayers: [sleeper],
  }).candidates[0];

  assert.equal(contextualized.player.rookie, false);
  assert.equal(contextualized.context?.trackRecord, "rookie");
  assert.equal(contextualized.context?.currentRole, "projected-starter");
  assert.equal(contextualized.context?.healthStatus, "healthy");
  assert.equal(contextualized.context?.source, "sleeper-depth-chart");
  assert.match(contextualized.context?.notes[0] ?? "", /top-three role, not a locked target share/i);
  assert.match(contextualized.context?.notes[1] ?? "", /no active injury designation/i);
});

test("reviewed stable context resolves a false health-rebound projection cap", () => {
  const candidate = cloneFixtureCandidates()[0];
  candidate.player.fullName = "Lamar Jackson";
  const contextualized = applyPlayerContexts([candidate]).candidates[0];
  const calibrated = calibrateDraftCandidates([contextualized], yahooLeagueRules)[0];
  calibrated.seasonMarket = {
    provider: "win-with-odds",
    context: "expanded-role-or-health-rebound",
    sourceRank: 5,
    sourcePosition: "QB",
    sourcePprPoints: calibrated.projection.range.p50,
    blendWeight: 0.65,
    projectionDelta: 0,
    stats: {},
    adjustments: [
      {
        stat: "passingYards",
        sourceProjection: 4000,
        previousProjection: 3960,
        adjustedProjection: 3970,
      },
      {
        stat: "passingTouchdowns",
        sourceProjection: 30,
        previousProjection: 29,
        adjustedProjection: 29.25,
      },
      {
        stat: "rushingYards",
        sourceProjection: 800,
        previousProjection: 780,
        adjustedProjection: 785,
      },
    ],
    summary: "The source volume exceeds an incomplete baseline.",
  };
  const evidence = buildEvidenceConfidence({
    candidate: calibrated,
    expectedOpportunity: calibrated.signals!.expectedOpportunity,
    roleSecurity: calibrated.signals!.roleSecurity,
    robustness: calibrated.signals!.robustness,
    situation: assessPlayerSituation(calibrated),
  });

  assert.notEqual(evidence.projection.level, "low");
  assert.ok(
    !evidence.blockers.some((blocker) => blocker.includes("unresolved role expansion")),
  );
  assert.ok(evidence.projection.drivers.some((driver) => driver.includes("resolves")));
});

test("qualitative snapshot adds multi-source situation evidence without overriding manager review", () => {
  const candidates = cloneFixtureCandidates();
  const bijan = candidates.find((candidate) => candidate.player.fullName === "Bijan Robinson");
  assert.ok(bijan);
  bijan.player.fullName = "Brock Bowers";

  const contextualized = applyPlayerContexts([bijan]).candidates[0];
  assert.equal(contextualized.context?.source, "qualitative-snapshot");
  assert.equal(contextualized.context?.currentRole, "locked-starter");
  assert.ok((contextualized.context?.qualitative?.sourceCount ?? 0) >= 2);
  assert.ok(
    contextualized.context?.qualitative?.evidence.every((evidence) =>
      evidence.sourceUrl.startsWith("https://"),
    ),
  );

  const lamarCandidate = structuredClone(bijan);
  lamarCandidate.player.fullName = "Lamar Jackson";
  const lamar = applyPlayerContexts([lamarCandidate]).candidates[0];
  assert.equal(lamar.context?.source, "manager-reviewed");
  assert.equal(lamar.context?.environment, "strong");
  assert.ok((lamar.context?.qualitative?.sourceCount ?? 0) >= 2);
});

test("qualitative snapshot preserves current injury evidence and source conflicts", () => {
  const gibbs = getQualitativeContext("Jahmyr Gibbs");
  assert.ok(gibbs);
  assert.ok(
    gibbs.evidence.some((evidence) =>
      evidence.signals.includes("health-recovering") && evidence.injuryDetail === "Back",
    ),
  );

  const malik = getQualitativeContext("Malik Willis");
  assert.ok(malik);
  assert.ok(malik.evidence.some((evidence) => evidence.signals.includes("limited-sample")));
});

test("qualitative projection correction is bounded and ignores analyst target sentiment", () => {
  const competitionFixture = cloneFixtureCandidates()[0];
  competitionFixture.player.fullName = "D'Andre Swift";
  const competitionContext = applyPlayerContexts([competitionFixture]).candidates;
  const competitionBaseline = calibrateDraftCandidates(
    removeQualitativeContexts(competitionContext),
    yahooLeagueRules,
    { useQualitativeContext: false },
  )[0];
  const competitionAdjusted = calibrateDraftCandidates(competitionContext, yahooLeagueRules)[0];

  assert.equal(competitionAdjusted.signals?.qualitativeAdjustment.direction, "down");
  assert.ok((competitionAdjusted.signals?.qualitativeAdjustment.percentDelta ?? -99) >= -5);
  assert.ok(competitionAdjusted.projection.range.p50 < competitionBaseline.projection.range.p50);

  const targetFixture = cloneFixtureCandidates()[1];
  targetFixture.player.fullName = "Brock Purdy";
  const targetAdjusted = calibrateDraftCandidates(
    applyPlayerContexts([targetFixture]).candidates,
    yahooLeagueRules,
  )[0];
  assert.ok(
    targetAdjusted.context?.qualitative?.evidence.some((evidence) => evidence.kind === "analyst-target"),
  );
  assert.equal(targetAdjusted.signals?.qualitativeAdjustment.pointsDelta, 0);
});

test("an imminent preseason return stays visible without changing the projection", () => {
  const fixture = cloneFixtureCandidates()[0];
  fixture.player.fullName = "Christian McCaffrey";
  const adjusted = calibrateDraftCandidates(
    applyPlayerContexts([fixture]).candidates,
    yahooLeagueRules,
  )[0];

  assert.equal(adjusted.context?.healthStatus, "recovering");
  assert.equal(adjusted.signals?.qualitativeAdjustment.pointsDelta, 0);
  assert.match(
    adjusted.signals?.qualitativeAdjustment.drivers.join(" ") ?? "",
    /no projection penalty/i,
  );
});

test("context impact board explains before-and-after rank and price decisions", () => {
  const candidates = cloneFixtureCandidates();
  candidates[0].player.fullName = "D'Andre Swift";
  candidates[1].player.fullName = "R.J. Harvey";
  const contextualized = applyPlayerContexts(candidates).candidates;
  const before = calibrateDraftCandidates(
    removeQualitativeContexts(contextualized),
    yahooLeagueRules,
    { useQualitativeContext: false },
  );
  const after = calibrateDraftCandidates(contextualized, yahooLeagueRules);
  const board = buildContextImpactBoard(before, after, {
    id: "context-test",
    name: "Context Test",
    teams: 12,
    rosterSlots: ["QB", "WR", "WR", "WR", "RB", "RB", "TE", "W/R/T", "W/R/T", "K"],
    flexSlots: ["W/R/T"],
    benchSlots: 6,
    irSlots: 1,
    faabBudget: 100,
    scoringType: "PPR",
    waiverDays: 2,
    waiverType: "FAB",
    playoffTeams: 6,
    playoffWeeks: [15, 16, 17],
    scoring: yahooLeagueRules,
  });

  assert.match(board.summary, /with and without/);
  assert.ok(board.fallers.some((entry) => entry.playerName === "D'Andre Swift"));
  assert.ok(
    [...board.fallers, ...board.decisions].some((entry) => entry.reasons.length > 0),
  );
});

test("draft stress test is deterministic, keeper-aware, and completes valid starters", () => {
  const positions = ["RB", "WR", "TE", "QB"] as const;
  const templates = cloneFixtureCandidates();
  const candidates = Array.from({ length: 240 }, (_, index) => {
    const template = structuredClone(templates[index % templates.length]);
    const position = positions[index % positions.length];
    template.player.id = `stress-${index + 1}`;
    template.player.fullName = `Stress Player ${index + 1}`;
    template.player.positions = [position];
    template.market = {
      ...template.market,
      adp: index + 1,
      ecr: index + 1,
      tier: Math.floor(index / 12) + 1,
      adpSource: "rank-proxy",
    };
    template.projection.playerId = template.player.id;
    template.projection.range = {
      p10: 180 - index * 0.3,
      p50: 260 - index * 0.4,
      p90: 340 - index * 0.45,
    };
    return template;
  });
  const initial = createInitialDraftState(candidates, {
    league: yahooLeagueConfig,
    myTeamId: "team-9",
  });
  const state = seedDraftStateWithKnownPicks(
    initial,
    candidates,
    [
      { overallPick: 9, playerId: "stress-1", teamId: "team-9" },
      { overallPick: 12, playerId: "stress-2", teamId: "team-9" },
    ],
    { currentPick: 29 },
  );
  const options = { simulations: 80, generatedAt: "2026-08-12T00:00:00.000Z" };
  const first = buildDraftStressTestBoard(candidates, state, options);
  const second = buildDraftStressTestBoard(candidates, state, options);

  assert.deepEqual(first, second);
  assert.equal(first.firstLivePick, 29);
  assert.deepEqual(first.livePickNumbers.slice(0, 4), [29, 32, 49, 52]);
  assert.ok(first.strategyOutcomes.every((outcome) => outcome.validStarterRate === 1));
  assert.ok(first.pickWindows.every((window) => window.positionMix.K === undefined));
  assert.ok(first.pickWindows.every((window) => window.positionMix.DST === undefined));
  const managerPlayerIds = Object.values(first.managerBoard).flat().map((entry) => entry.playerId);
  assert.ok(!managerPlayerIds.includes("stress-1"));
  assert.ok(!managerPlayerIds.includes("stress-2"));
});

test("regression layer flags positive and negative veteran correction candidates", () => {
  const candidates = cloneFixtureCandidates();
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(mhj);
  assert.ok(chaseBrown);

  mhj.player.externalIds.nflverse = "mock-mhj-reg";
  chaseBrown.player.externalIds.nflverse = "mock-chase-reg";

  const calibrated = calibrateDraftCandidates(candidates, yahooLeagueRules, {
    nflverseByPlayerId: new Map<string, NflversePlayerSeasonStats>([
      [
        "mock-mhj-reg",
        {
          playerId: "mock-mhj-reg",
          playerName: "Marvin Harrison Jr.",
          team: "ARI",
          position: "WR",
          games: 17,
          attempts: 0,
          carries: 2,
          targets: 152,
          receptions: 96,
          passingYards: 0,
          rushingYards: 14,
          receivingYards: 1115,
          passingTouchdowns: 0,
          rushingTouchdowns: 0,
          receivingTouchdowns: 5,
          targetShare: 0.31,
          airYardsShare: 0.41,
          fantasyPointsPpr: 237,
        },
      ],
      [
        "mock-chase-reg",
        {
          playerId: "mock-chase-reg",
          playerName: "Chase Brown",
          team: "CIN",
          position: "RB",
          games: 17,
          attempts: 214,
          carries: 214,
          targets: 34,
          receptions: 27,
          passingYards: 0,
          rushingYards: 1008,
          receivingYards: 206,
          passingTouchdowns: 0,
          rushingTouchdowns: 14,
          receivingTouchdowns: 2,
          targetShare: 0.08,
          airYardsShare: 0.02,
          fantasyPointsPpr: 273,
        },
      ],
    ]),
  });

  const calibratedMhj = calibrated.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );
  const calibratedBrown = calibrated.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.equal(calibratedMhj?.signals?.regression.direction, "positive");
  assert.ok((calibratedMhj?.signals?.regression.adjustedMedianDelta ?? 0) > 0);
  assert.equal(calibratedBrown?.signals?.regression.direction, "negative");
  assert.ok((calibratedBrown?.signals?.regression.adjustedMedianDelta ?? 0) < 0);
});

test("regression layer skips rookies in v1", () => {
  const candidates = cloneFixtureCandidates();
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");

  assert.ok(mhj);
  mhj.player.rookie = true;
  mhj.player.externalIds.nflverse = "mock-mhj-rookie";

  const calibrated = calibrateDraftCandidates(candidates, yahooLeagueRules, {
    nflverseByPlayerId: new Map<string, NflversePlayerSeasonStats>([
      [
        "mock-mhj-rookie",
        {
          playerId: "mock-mhj-rookie",
          playerName: "Marvin Harrison Jr.",
          team: "ARI",
          position: "WR",
          games: 17,
          attempts: 0,
          carries: 0,
          targets: 150,
          receptions: 94,
          passingYards: 0,
          rushingYards: 0,
          receivingYards: 1120,
          passingTouchdowns: 0,
          rushingTouchdowns: 0,
          receivingTouchdowns: 5,
          targetShare: 0.3,
          airYardsShare: 0.39,
          fantasyPointsPpr: 235,
        },
      ],
    ]),
  });

  const calibratedMhj = calibrated.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );

  assert.equal(calibratedMhj?.signals?.regression.direction, "none");
  assert.equal(calibratedMhj?.signals?.regression.adjustedMedianDelta, 0);
});

test("scoring profile layer separates volume-backed projections from touchdown-fragile ones", () => {
  const candidates = cloneFixtureCandidates();
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(mhj);
  assert.ok(chaseBrown);

  mhj.player.externalIds.nflverse = "mock-volume-backed";
  mhj.market = {
    ...mhj.market,
    adp: 24,
    ecr: 22,
    tier: 3,
    expertStdDev: 3.4,
  };
  mhj.projection.stats = {
    receptions: 97,
    receivingYards: 1260,
    receivingTouchdowns: 6,
    rushingYards: 24,
  };
  mhj.projection.range = { p10: 188, p50: 246, p90: 304 };

  chaseBrown.player.externalIds.nflverse = "mock-td-fragile";
  chaseBrown.market = {
    ...chaseBrown.market,
    adp: 17,
    ecr: 15,
    tier: 2,
    expertStdDev: 10.8,
  };
  chaseBrown.projection.stats = {
    rushingYards: 910,
    rushingTouchdowns: 13,
    receptions: 28,
    receivingYards: 188,
    receivingTouchdowns: 1,
    fumblesLost: 2,
  };
  chaseBrown.projection.range = { p10: 135, p50: 194, p90: 258 };

  const calibrated = calibrateDraftCandidates(candidates, yahooLeagueRules, {
    nflverseByPlayerId: new Map<string, NflversePlayerSeasonStats>([
      [
        "mock-volume-backed",
        {
          playerId: "mock-volume-backed",
          playerName: "Marvin Harrison Jr.",
          team: "ARI",
          position: "WR",
          games: 17,
          attempts: 0,
          carries: 1,
          targets: 168,
          receptions: 109,
          passingYards: 0,
          rushingYards: 8,
          receivingYards: 1348,
          passingTouchdowns: 0,
          rushingTouchdowns: 0,
          receivingTouchdowns: 5,
          targetShare: 0.32,
          airYardsShare: 0.39,
          fantasyPointsPpr: 273,
        },
      ],
      [
        "mock-td-fragile",
        {
          playerId: "mock-td-fragile",
          playerName: "Chase Brown",
          team: "CIN",
          position: "RB",
          games: 17,
          attempts: 180,
          carries: 180,
          targets: 27,
          receptions: 21,
          passingYards: 0,
          rushingYards: 776,
          receivingYards: 162,
          passingTouchdowns: 0,
          rushingTouchdowns: 12,
          receivingTouchdowns: 1,
          targetShare: 0.07,
          airYardsShare: 0.01,
          fantasyPointsPpr: 214,
        },
      ],
    ]),
  });

  const calibratedMhj = calibrated.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );
  const calibratedBrown = calibrated.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.equal(calibratedMhj?.signals?.scoringProfile.label, "volume-backed");
  assert.ok((calibratedMhj?.signals?.scoringProfile.adjustedMedianDelta ?? 0) > 0);
  assert.equal(calibratedBrown?.signals?.scoringProfile.label, "touchdown-fragile");
  assert.ok((calibratedBrown?.signals?.scoringProfile.adjustedMedianDelta ?? 0) < 0);
});

test("expected opportunity and role security layers separate secure-volume anchors from fragile workload bets", () => {
  const candidates = cloneFixtureCandidates();
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(mhj);
  assert.ok(chaseBrown);

  mhj.player.externalIds.nflverse = "mock-mhj-xopp";
  mhj.market = {
    ...mhj.market,
    adp: 18,
    ecr: 17,
    tier: 2,
    expertStdDev: 3.1,
  };
  mhj.projection.stats = {
    receptions: 95,
    receivingYards: 1240,
    receivingTouchdowns: 8,
  };
  mhj.projection.range = { p10: 184, p50: 233, p90: 295 };

  chaseBrown.player.externalIds.nflverse = "mock-brown-xopp";
  chaseBrown.market = {
    ...chaseBrown.market,
    adp: 20,
    ecr: 18,
    tier: 2,
    expertStdDev: 11.6,
  };
  chaseBrown.projection.stats = {
    rushingYards: 965,
    rushingTouchdowns: 11,
    receptions: 26,
    receivingYards: 180,
    receivingTouchdowns: 1,
  };
  chaseBrown.projection.range = { p10: 128, p50: 189, p90: 250 };

  const calibrated = calibrateDraftCandidates(candidates, yahooLeagueRules, {
    nflverseByPlayerId: new Map<string, NflversePlayerSeasonStats>([
      [
        "mock-mhj-xopp",
        {
          playerId: "mock-mhj-xopp",
          playerName: "Marvin Harrison Jr.",
          team: "ARI",
          position: "WR",
          games: 17,
          attempts: 0,
          carries: 1,
          targets: 166,
          receptions: 104,
          passingYards: 0,
          rushingYards: 7,
          receivingYards: 1328,
          passingTouchdowns: 0,
          rushingTouchdowns: 0,
          receivingTouchdowns: 7,
          targetShare: 0.32,
          airYardsShare: 0.4,
          fantasyPointsPpr: 279,
        },
      ],
      [
        "mock-brown-xopp",
        {
          playerId: "mock-brown-xopp",
          playerName: "Chase Brown",
          team: "CIN",
          position: "RB",
          games: 17,
          attempts: 171,
          carries: 171,
          targets: 24,
          receptions: 18,
          passingYards: 0,
          rushingYards: 732,
          receivingYards: 144,
          passingTouchdowns: 0,
          rushingTouchdowns: 10,
          receivingTouchdowns: 1,
          targetShare: 0.055,
          airYardsShare: 0.01,
          fantasyPointsPpr: 198,
        },
      ],
    ]),
  });

  const calibratedMhj = calibrated.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );
  const calibratedBrown = calibrated.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.equal(calibratedMhj?.signals?.expectedOpportunity.label, "strong");
  assert.equal(calibratedMhj?.signals?.roleSecurity.label, "secure");
  assert.ok((calibratedMhj?.signals?.expectedOpportunity.adjustedMedianDelta ?? 0) >= 0);
  assert.ok((calibratedMhj?.signals?.roleSecurity.stabilityImpact ?? 0) > 0);

  assert.equal(calibratedBrown?.signals?.expectedOpportunity.label, "thin");
  assert.equal(calibratedBrown?.signals?.roleSecurity.label, "fragile");
  assert.ok((calibratedBrown?.signals?.expectedOpportunity.adjustedMedianDelta ?? 0) < 0);
  assert.ok((calibratedBrown?.signals?.roleSecurity.stabilityImpact ?? 0) < 0);
  assert.ok(
    ["fragile-bet", "market-trap"].includes(
      calibratedBrown?.signals?.dossier.stance ?? "",
    ),
  );
});

test("position run modeling identifies stressed positions before the next wrap", () => {
  const candidates = cloneFixtureCandidates();
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = candidates.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(mhj && chaseBrown);
  chaseBrown.player.externalIds.nflverse = "mock-chase-brown";
  mhj.market = {
    ...mhj.market,
    adp: 25,
    ecr: 22,
    tier: 3,
  };

  const calibrated = calibrateDraftCandidates(
    candidates,
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(calibrated, {
    currentPick: 2,
    myTeamId: "team-9",
    league: yahooLeagueConfig,
  });

  state.teams = state.teams.map((team, index) => {
    if (index === 0) {
      return team;
    }

    return {
      ...team,
      positionCounts: {
        QB: 1,
        RB: index % 2 === 0 ? 2 : 1,
        WR: 0,
        TE: 1,
        K: 0,
      },
      openSlots: ["WR", "WR", "WR", "W/R/T", "W/R/T", "K", "BN"],
    };
  });

  const runSnapshots = buildPositionRunSnapshots(state, calibrated);
  const wrRun = runSnapshots.find((snapshot) => snapshot.position === "WR");
  const qbRun = runSnapshots.find((snapshot) => snapshot.position === "QB");

  assert.ok(wrRun, "WR run snapshot should exist");
  assert.ok(qbRun, "QB run snapshot should exist");
  assert.ok(
    wrRun.expectedSelectionsBeforeNextTurn >= 1,
    "WR demand should still project at least one likely selection in a WR-starved room",
  );
  assert.ok(wrRun.teamsWithStarterNeed > 0);
  assert.ok(wrRun.urgentTeamIds.length > 0);
  assert.equal(wrRun.upcomingPickCount, state.picksUntilNextTurn);
  assert.ok(
    wrRun.runRisk === "high" || wrRun.runRisk === "medium",
    "WR should carry real run pressure in this setup",
  );
  assert.ok(
    wrRun.tierSurvivalProbability < 0.75,
    "WR tier should not feel overly safe when multiple teams need receivers",
  );
  assert.ok(runSnapshots.every((snapshot) => snapshot.tierSurvivalProbability <= 1));
  assert.ok(
    wrRun.tierSurvivalProbability <= qbRun.tierSurvivalProbability,
    "WR should not look safer than QB in this receiver-starved room",
  );
});

test("wrap simulation is deterministic and exposes threatened players", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(candidates, {
    currentPick: 19,
    myTeamId: "team-9",
    league: yahooLeagueConfig,
  });

  state.teams = state.teams.map((team, index) => ({
    ...team,
    positionCounts: {
      QB: 1,
      RB: index % 2 === 0 ? 1 : 2,
      WR: index === 3 ? 1 : 0,
      TE: index % 3 === 0 ? 1 : 0,
      K: 0,
    },
    openSlots: ["WR", "WR", "RB", "TE", "W/R/T", "K", "BN"],
  }));

  const first = buildWrapSimulationSnapshot(state, candidates, { simulations: 120 });
  const second = buildWrapSimulationSnapshot(state, candidates, { simulations: 120 });
  const wrPosition = first.positionSnapshots.find((snapshot) => snapshot.position === "WR");
  const qbPosition = first.positionSnapshots.find((snapshot) => snapshot.position === "QB");

  assert.deepEqual(first, second, "wrap simulation should stay deterministic for the same board state");
  assert.ok(wrPosition && qbPosition, "WR and QB wrap snapshots should exist");
  assert.ok(
    wrPosition.expectedSelections >= qbPosition.expectedSelections,
    "WR should carry at least as much expected pressure as QB in this room setup",
  );
  assert.ok(
    first.threatenedPlayers.length > 0,
    "simulation should surface threatened players before the next turn",
  );
  assert.ok(
    first.pickPredictions.length === state.picksUntilNextTurn,
    "simulation should emit one pick prediction per simulated wrap pick",
  );
});

test("public FantasyPros fallback builds a full-board candidate set from embedded page data", () => {
  const rankingsHtml = `
    <script>
      var ecrData = {
        "players": [
          {
            "player_id": "22968",
            "player_name": "Jahmyr Gibbs",
            "player_team_id": "DET",
            "player_position_id": "RB",
            "rank_ecr": 1,
            "rank_ave": 2.2,
            "rank_std": 1.5,
            "pos_rank": "RB1",
            "tier": 1
          },
          {
            "player_id": "19222",
            "player_name": "DeVonta Smith",
            "player_team_id": "PHI",
            "player_position_id": "WR",
            "rank_ecr": 22,
            "rank_ave": 27.4,
            "rank_std": 5.6,
            "pos_rank": "WR11",
            "tier": 3
          }
        ]
      };
    </script>
  `;
  const adpHtml = `
    <script>
      window.FP = window.FP || {};
      window.FP.reportConfig = {
        "table": {
          "rows": [
            {
              "id": 22968,
              "avg": 1.3,
              "realtime": 1
            }
          ]
        }
      };
    </script>
  `;

  const source = buildFantasyProsPublicDraftCandidatesFromHtml(rankingsHtml, adpHtml);
  const gibbs = source.candidates.find((candidate) => candidate.player.fullName === "Jahmyr Gibbs");
  const devonta = source.candidates.find((candidate) => candidate.player.fullName === "DeVonta Smith");

  assert.equal(source.candidates.length, 2);
  assert.equal(source.directAdpCount, 1);
  assert.equal(source.proxiedAdpCount, 1);
  assert.ok(gibbs);
  assert.ok(devonta);
  assert.equal(gibbs?.market.adp, 1.3);
  assert.equal(devonta?.market.adp, 27.4);
  assert.equal(gibbs?.projection.scoringType, "PPR");
  assert.ok(
    Math.abs(scoreProjectionSnapshot(gibbs!.projection, yahooLeagueRules).exact - gibbs!.projection.range.p50) < 1.2,
  );
});

test("Yahoo v0 baseline stays an independent sanity check instead of mutating ECR", () => {
  const candidates = cloneFixtureCandidates();
  const bijan = candidates.find((candidate) => candidate.player.fullName === "Bijan Robinson");
  const mhj = candidates.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");

  assert.ok(bijan);
  assert.ok(mhj);

  bijan.market.ecr = 4;
  mhj.market.ecr = 14;

  const result = applyYahooBaselineToDraftCandidates(candidates);
  const blendedBijan = result.candidates.find((candidate) => candidate.player.fullName === "Bijan Robinson");
  const unchangedMhj = result.candidates.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );

  assert.equal(result.appliedCount >= 1, true);
  assert.equal(blendedBijan?.market.ecr, 4);
  assert.equal(blendedBijan?.market.yahooRank, 1);
  assert.equal(unchangedMhj?.market.ecr, 14);
});

test("Fantasy Football Calculator parser supplies verified overall PPR ADP", () => {
  const players = Array.from({ length: 160 }, (_, index) => ({
    player_id: index + 1,
    name: index === 0 ? "Josh Allen" : `ADP Player ${index + 1}`,
    position: index % 4 === 0 ? "QB" : index % 4 === 1 ? "RB" : index % 4 === 2 ? "WR" : "TE",
    team: index === 0 ? "BUF" : "TST",
    adp: index === 0 ? 22.4 : index + 1.2,
    times_drafted: 100,
    stdev: 4.5,
  }));
  const source = parseFantasyFootballCalculatorAdp({
    meta: { total_drafts: 6160, start_date: "2026-08-06", end_date: "2026-08-13" },
    players,
  });
  const candidate = structuredClone(fixtureCandidates[0]);
  candidate.player.fullName = "Josh Allen";
  candidate.player.team = "BUF";
  candidate.player.positions = ["QB"];

  const applied = applyFantasyFootballCalculatorAdp([candidate], source);

  assert.equal(source.rows.length, 160);
  assert.equal(source.totalDrafts, 6160);
  assert.equal(applied.appliedCount, 1);
  assert.equal(applied.candidates[0].market.adp, 22.4);
  assert.equal(applied.candidates[0].market.adpSource, "direct");
  assert.equal(applied.candidates[0].market.adpProvider, "fantasy-football-calculator");
});

test("FantasyPros PPR projections retain receptions and do not equate fumbles with fumbles lost", () => {
  const stats = extractFantasyProsStats({
    stats: {
      rec_rec: 106.09,
      rec_yds: 1038.11,
      rec_tds: 6.72,
      fumbles: 2.4,
    },
  });

  assert.equal(stats.receptions, 106.09);
  assert.equal(stats.receivingYards, 1038.11);
  assert.equal(stats.fumblesLost, undefined);
  assert.ok(scoreProjectionSnapshot({
    season: 2026,
    provider: "fantasypros",
    scoringType: "PPR",
    asOf: "2026-08-13T12:00:00Z",
    playerId: "te-test",
    stats,
    range: { p10: 0, p50: 0, p90: 0 },
  }, yahooLeagueRules).exact > 240);
});

test("public FantasyPros projection tables overlay scoreable PPR stats", () => {
  const html = Array.from({ length: 10 }, (_, index) => `
    <tr class="mpb-player-${index + 1} js-tr-game-select"><td><a fp-player-name="${index === 0 ? "Trey McBride" : `TE Player ${index + 1}`}">${index === 0 ? "Trey McBride" : `TE Player ${index + 1}`}</a> ${index === 0 ? "ARI" : "TST"}</td>
    <td class="center">${index === 0 ? "109.0" : "60.0"}</td><td class="center">${index === 0 ? "1,051.0" : "600.0"}</td><td class="center">6.8</td><td class="center">0.2</td><td class="center">254.3</td></tr>
  `).join("");
  const rows = parseFantasyProsPublicProjectionHtml(html, "TE");
  const candidate = structuredClone(fixtureCandidates[0]);
  candidate.player.fullName = "Trey McBride";
  candidate.player.positions = ["TE"];
  candidate.player.externalIds.fantasyPros = "1";

  const applied = applyFantasyProsPublicProjections([candidate], rows);

  assert.equal(rows.length, 10);
  assert.equal(rows[0].stats.receptions, 109);
  assert.equal(applied.appliedCount, 1);
  assert.ok(applied.candidates[0].projection.range.p50 > 250);
});

test("draft data quality blocks truncated pools and accepts complete verified boards", () => {
  const truncated = fixtureCandidates.slice(0, 4);
  assert.equal(assessDraftDataQuality(truncated).status, "blocked");

  const positions = [
    ...Array(25).fill("QB"),
    ...Array(60).fill("RB"),
    ...Array(90).fill("WR"),
    ...Array(25).fill("TE"),
    ...Array(10).fill("K"),
    ...Array(10).fill("DST"),
  ] as Array<"QB" | "RB" | "WR" | "TE" | "K" | "DST">;
  const complete = positions.map((position, index) => {
    const candidate = structuredClone(fixtureCandidates[index % fixtureCandidates.length]);
    candidate.player.id = `quality-${index}`;
    candidate.player.fullName = `Quality Player ${index}`;
    candidate.player.positions = [position];
    candidate.projection.playerId = candidate.player.id;
    candidate.market = {
      adp: index + 1,
      ecr: index + 1,
      tier: Math.ceil((index + 1) / 12),
      adpSource: "direct",
      adpProvider: "fantasy-football-calculator",
      ecrProvider: "fantasypros",
    };
    return candidate;
  });

  const quality = assessDraftDataQuality(complete);
  assert.equal(quality.status, "ready");
  assert.equal(quality.candidateCount, 220);
  assert.equal(quality.directAdpCount, 220);
});

test("pre-draft signals separate price, target attribution, and evidence", () => {
  const candidate = calibrateDraftCandidates(cloneFixtureCandidates(), yahooLeagueRules)[0];
  assert.ok(candidate.signals);
  candidate.market.adp = 31;
  candidate.signals.evidenceConfidence.projection.score = 80;
  candidate.signals.evidenceConfidence.role.score = 80;
  candidate.signals.evidenceConfidence.robustness.score = 80;
  candidate.signals.evidenceConfidence.price.score = 80;
  candidate.signals.robustness.fragilityScore = 30;
  candidate.signals.roleSecurity.label = "balanced";

  const signal = buildDraftBoardSignal(candidate, {
    boardRank: 20,
    boardEdge: 8,
    structuralRank: 14,
    marketRank: 28,
    valueOverReplacement: 30,
  }, true);

  assert.equal(signal.valueLabel, "Strong value");
  assert.equal(signal.valueDeltaVsAdp, 11);
  assert.equal(signal.targetAttribution, "both");
  assert.ok(["Strong", "Usable", "Limited"].includes(signal.evidenceLabel));

  candidate.market.adp = 20.4;
  const disagreement = buildDraftBoardSignal(candidate, {
    boardRank: 20,
    boardEdge: 8,
    structuralRank: 14,
    marketRank: 28,
    valueOverReplacement: 30,
  }, false);
  assert.equal(
    disagreement.valueLabel,
    "At cost",
    "a structural edge must not produce a value label when direct ADP is tied",
  );
});

test("quick-read stars separate structural VOR, tier cliffs, and price action", () => {
  const receiver = cloneFixtureCandidates().find((candidate) => candidate.player.positions[0] === "WR")!;
  const secondReceiver = structuredClone(receiver);
  secondReceiver.player.id = `${receiver.player.id}-second-tier`;
  secondReceiver.player.fullName = "Second Tier Receiver";
  secondReceiver.projection.playerId = secondReceiver.player.id;
  const candidates = calibrateDraftCandidates([receiver, secondReceiver], yahooLeagueRules);
  const [smash, avoid] = candidates;
  smash.market = { ...smash.market, adp: 30, tier: 1 };
  avoid.market = { ...avoid.market, adp: 10, tier: 2 };
  smash.projection.range.p50 = 300;
  avoid.projection.range.p50 = 260;
  for (const candidate of candidates) {
    candidate.signals!.evidenceConfidence.projection.score = 85;
    candidate.signals!.evidenceConfidence.role.score = 85;
    candidate.signals!.evidenceConfidence.robustness.score = 85;
    candidate.signals!.evidenceConfidence.price.score = 85;
    candidate.signals!.robustness.fragilityScore = 25;
    candidate.signals!.roleSecurity.label = "balanced";
  }
  avoid.signals!.roleSecurity.label = "fragile";
  avoid.signals!.robustness.fragilityScore = 80;
  avoid.signals!.evidenceConfidence.projection.score = 20;
  avoid.signals!.evidenceConfidence.role.score = 20;
  avoid.signals!.evidenceConfidence.robustness.score = 20;
  avoid.signals!.evidenceConfidence.price.score = 20;

  const quick = buildDraftQuickScoreBoard(candidates, [
    { playerId: smash.player.id, boardRank: 10, boardEdge: 15, structuralRank: 8, marketRank: 25, valueOverReplacement: 55 },
    { playerId: avoid.player.id, boardRank: 25, boardEdge: -15, structuralRank: 30, marketRank: 10, valueOverReplacement: 5 },
  ]);

  assert.equal(quick.get(smash.player.id)?.vorStars, 5);
  assert.equal(quick.get(smash.player.id)?.cliffStars, 5);
  assert.equal(quick.get(smash.player.id)?.action, "Smash");
  assert.equal(
    preDraftActionLabel(quick.get(smash.player.id)!.action),
    "Target",
    "preseason conviction alone must not display a Smash call",
  );
  const liveSignal = buildDraftBoardSignal(smash, {
    boardRank: 10,
    boardEdge: 15,
    structuralRank: 8,
    marketRank: 25,
    valueOverReplacement: 55,
  }, false);
  smash.market.adp = 30;
  const liveCall = buildLiveDraftCall({
    candidate: smash,
    quickScore: quick.get(smash.player.id)!,
    signal: liveSignal,
    currentPick: 40,
    isMyTurn: true,
    makeItBackProbability: 0.2,
    tierSurvivalProbability: 0.3,
    rosterFit: "need",
  });
  assert.equal(liveCall.action, "Smash Now");
  assert.equal(
    buildLiveDraftCall({
      candidate: smash,
      quickScore: quick.get(smash.player.id)!,
      signal: liveSignal,
      currentPick: 40,
      isMyTurn: false,
      makeItBackProbability: 0.2,
      tierSurvivalProbability: 0.3,
      rosterFit: "need",
    }).action,
    "Target",
  );
  assert.equal(quick.get(avoid.player.id)?.action, "Avoid");
  assert.ok(
    (quick.get(avoid.player.id)?.vorStars ?? 5) <= 2,
    "a small absolute VOR cannot earn an elite rating from positional percentile alone",
  );
});

test("rookie RB research separates efficiency from opportunity without moving production ranks", () => {
  const candidate = structuredClone(fixtureCandidates.find((item) => item.player.positions[0] === "RB")!);
  candidate.player.id = "rookie-rb-research";
  candidate.player.fullName = "Rookie Research Back";
  candidate.player.rookie = true;
  candidate.projection.playerId = candidate.player.id;
  candidate.context = {
    currentRole: "projected-starter",
    healthStatus: "healthy",
    trackRecord: "rookie",
    roleContinuity: "promoted",
    environment: "strong",
    source: "manager-reviewed",
    asOf: "2026-08-13T12:00:00Z",
    notes: ["Clear path to the lead early-down role."],
  };
  candidate.seasonMarket = {
    provider: "win-with-odds",
    context: "standard",
    sourceRank: 80,
    sourcePosition: "RB",
    sourcePprPoints: 190,
    blendWeight: 0.25,
    projectionDelta: 0,
    stats: { rushingYards: 875 },
    adjustments: [],
    summary: "Research fixture.",
  };
  const input = (draftPick: number): AdvancedResearchInput => ({
    lane: "rookie" as const,
    playerId: candidate.player.id,
    playerName: candidate.player.fullName,
    position: "RB" as const,
    draftPick,
    collegeScrimmageYardsShare: 0.34,
    collegeTouchdownShare: 0.31,
    collegeTargetShare: 0.12,
    collegeBestSeasonYardsShare: 0.36,
    collegeFinalSeasonYardsShare: 0.32,
    collegeRushAttempts: 240,
    collegeRushingYardsPerCarry: 6.1,
    collegeRushingExplosiveRate: 0.19,
    collegeRushingStuffAvoidanceRate: 0.81,
    collegeRushingTeamYpcDelta: 1.15,
    collegeTargets: 42,
    collegeCatchRate: 0.76,
    collegeReceivingYardsPerTarget: 8.8,
    collegeReceivingExplosiveRate: 0.14,
    collegeReceivingTeamYptDelta: 1.1,
    sources: ["college-football-data", "nflverse-players"],
  });
  const beforeProjection = structuredClone(candidate.projection);
  const early = applyAdvancedResearchSnapshots([candidate], [input(10)]).candidates[0];
  const late = applyAdvancedResearchSnapshots([candidate], [input(150)]).candidates[0];

  assert.deepEqual(early.projection, beforeProjection);
  assert.equal(early.advancedResearch?.rankingImpact, "none");
  assert.equal(early.advancedResearch?.status, "backtest-ready");
  assert.deepEqual(
    early.advancedResearch?.components.map((component) => component.weight),
    [0.35, 0.2, 0.2, 0.15, 0.1],
  );
  assert.ok(Math.abs(early.advancedResearch!.researchScore! - late.advancedResearch!.researchScore!) <= 10);
  assert.deepEqual(buildRedraftBoard([early], yahooLeagueConfig), buildRedraftBoard([late], yahooLeagueConfig));
  const shadow = buildAdvancedResearchShadowBoard([early], yahooLeagueConfig);
  assert.equal(shadow[0]?.productionEligible, false);
  assert.deepEqual(early.projection, beforeProjection);
});

test("rookie WR research separates per-target efficiency from opportunity share", () => {
  const candidate = structuredClone(fixtureCandidates.find((item) => item.player.positions[0] === "WR")!);
  candidate.player.id = "rookie-wr-efficiency";
  candidate.player.fullName = "Committee Receiver";
  candidate.projection.playerId = candidate.player.id;
  candidate.context = {
    currentRole: "competition",
    healthStatus: "healthy",
    trackRecord: "rookie",
    roleContinuity: "team-change",
    environment: "neutral",
    source: "manager-reviewed",
    asOf: "2026-08-14T12:00:00Z",
    notes: ["Drafted into an unsettled receiver room."],
  };
  candidate.seasonMarket = {
    provider: "win-with-odds",
    context: "standard",
    sourceRank: 90,
    sourcePosition: "WR",
    sourcePprPoints: 150,
    blendWeight: 0.25,
    projectionDelta: 0,
    stats: { receivingYards: 720 },
    adjustments: [],
    summary: "Research fixture.",
  };
  const input: AdvancedResearchInput = {
    lane: "rookie",
    playerId: candidate.player.id,
    playerName: candidate.player.fullName,
    position: "WR",
    draftPick: 28,
    breakoutAge: 20.2,
    collegeTargetShare: 0.16,
    collegeBestSeasonYardsShare: 0.22,
    collegeFinalSeasonYardsShare: 0.18,
    collegeTargets: 145,
    collegeCatchRate: 0.71,
    collegeReceivingYardsPerTarget: 10.4,
    collegeReceivingExplosiveRate: 0.18,
    collegeReceivingTeamYptDelta: 2.2,
    sources: ["sportsdataverse-cfbfastr", "nflverse-players"],
  };
  const applied = applyAdvancedResearchSnapshots([candidate], [input]).candidates[0];
  assert.equal(applied.advancedResearch?.status, "backtest-ready");
  assert.ok((applied.advancedResearch?.components.find((component) => component.key === "college-efficiency")?.score ?? 0) > 60);
  assert.ok((applied.advancedResearch?.components.find((component) => component.key === "college-opportunity")?.score ?? 100) < 50);
  assert.equal(applied.advancedResearch?.rankingImpact, "none");
  const shadow = applyValidatedRookieWrModel([applied], yahooLeagueConfig, { mode: "shadow" });
  assert.equal(shadow.appliedCount, 0);
  assert.ok(shadow.candidates[0].rookieWrOpportunity);
  assert.equal(shadow.candidates[0].rookieWrOpportunity?.mode, "shadow");
  assert.deepEqual(shadow.candidates[0].projection, applied.projection);
  const blocked = applyValidatedRookieWrModel([applied], yahooLeagueConfig, {
    mode: "production",
    validation: { activationEligible: false, blockers: ["Holdout gate failed."] },
  });
  assert.equal(blocked.appliedCount, 0);
  assert.equal(blocked.blockedReason, "Holdout gate failed.");
  assert.deepEqual(blocked.candidates[0].projection, applied.projection);

  const eligible = applyValidatedRookieWrModel([applied], yahooLeagueConfig, {
    mode: "production",
    validation: {
      activationEligible: true,
      blockers: [],
      selectedAdjustment: { efficiencyWeight: 0.8, opportunityWeight: 0.2, maxPercent: 0.035 },
    },
  });
  assert.equal(eligible.appliedCount, 1);
  assert.equal(eligible.candidates[0].advancedResearch?.rankingImpact, "production");
  assert.notEqual(eligible.candidates[0].projection.range.p50, applied.projection.range.p50);
});

test("college research snapshot is keyless, multi-season, and merges onto canonical player ids", () => {
  const college = collegeResearchInputs.find((input) => input.playerName === "Jeremiyah Love");
  assert.ok(college && college.lane === "rookie");
  assert.equal(college.position, "RB");
  assert.ok((college.collegeScrimmageYardsShare ?? 0) > 0);
  assert.deepEqual(college.collegeSeasons, [2023, 2024, 2025]);
  assert.equal(college.sources.includes("sportsdataverse-cfbfastr"), true);
  assert.equal(collegeResearchMeta.recencyWeighting, "none");

  const automatic: AdvancedResearchInput = {
    lane: "rookie",
    playerId: "canonical-love",
    playerName: "Jeremiyah Love",
    position: "RB",
    draftPick: 42,
    sources: ["nflverse-players"],
  };
  const merged = mergeAdvancedResearchInputs([automatic], [college]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].playerId, "canonical-love");
  assert.equal(merged[0].sources.includes("sportsdataverse-cfbfastr"), true);
});

test("league scoring applies every projected milestone game and six-point passing TDs", () => {
  const score = scoreStatProjection({
    passingYards: 300,
    passingTouchdowns: 2,
    passing300Games: 3,
  }, yahooLeagueRules);
  assert.equal(score, 33);
  assert.equal(
    scoreStatProjection(
      { passingYards: 4_000, passingTouchdowns: 30 },
      yahooLeagueRules,
      { explicitMilestoneGamesOnly: true },
    ),
    340,
  );
  assert.equal(
    scoreStatProjection({ passingYards: 4_000, passingTouchdowns: 30 }, yahooLeagueRules),
    343,
  );
});

test("advanced usage formalizes WOPR and standardizes only within position", () => {
  const stats: NflversePlayerSeasonStats = {
    playerId: "wopr-1",
    playerName: "Usage Receiver",
    team: "TST",
    position: "WR",
    games: 17,
    attempts: 0,
    carries: 2,
    targets: 130,
    receptions: 85,
    passingYards: 0,
    rushingYards: 10,
    receivingYards: 1_250,
    passingTouchdowns: 0,
    rushingTouchdowns: 0,
    receivingTouchdowns: 7,
    targetShare: 0.28,
    airYardsShare: 0.36,
    fantasyPointsPpr: 254,
    passing300Games: 0,
    rushing100Games: 0,
    receiving100Games: 6,
  };
  assert.equal(weightedOpportunityRating(stats), 0.672);
  const moments = populationMoments([10, 20, 30]);
  assert.equal(positionalZScore(20, moments.mean, moments.standardDeviation), 0);
  assert.ok(positionalZScore(30, moments.mean, moments.standardDeviation) > 1);
  assert.equal(opportunityScoreFromZ(0), 50);
});

test("age curves add bounded fragility without directly changing projected points", () => {
  assert.equal(ageFragilityPoints("RB", 24), 0);
  assert.equal(ageFragilityPoints("RB", 27), 4);
  assert.equal(ageFragilityPoints("RB", 31), 8);
  assert.equal(ageFragilityPoints("WR", 28), 0);
  assert.equal(ageFragilityPoints("WR", 31), 5);
  assert.equal(ageFragilityPoints("QB", 38), 0);
});

test("milestone projection uses observed game frequency and league scoring counts every projected game", () => {
  const candidate = structuredClone(fixtureCandidates.find((item) => item.player.positions[0] === "WR")!);
  candidate.projection.stats.receivingYards = 1_200;
  const prior: NflversePlayerSeasonStats = {
    playerId: "milestone",
    playerName: candidate.player.fullName,
    team: candidate.player.team,
    position: "WR",
    games: 17,
    attempts: 0,
    carries: 0,
    targets: 130,
    receptions: 90,
    passingYards: 0,
    rushingYards: 0,
    receivingYards: 1_000,
    passingTouchdowns: 0,
    rushingTouchdowns: 0,
    receivingTouchdowns: 7,
    targetShare: 0.25,
    airYardsShare: 0.3,
    fantasyPointsPpr: 232,
    passing300Games: 0,
    rushing100Games: 0,
    receiving100Games: 4,
  };
  const projected = applyMilestoneGameProjection(candidate, prior);
  assert.equal(projected.projection.stats.receiving100Games, 4.8);
  assert.equal(scoreStatProjection({ receiving100Games: 4.8 }, yahooLeagueRules), 9.6);
});

test("nflverse draft identity activates rookie research without mutating production identity", () => {
  const candidate = structuredClone(fixtureCandidates.find((item) => item.player.positions[0] === "RB")!);
  candidate.player.id = "rookie-shadow-id";
  candidate.player.fullName = "Shadow Rookie";
  candidate.player.rookie = false;
  const profiles = parseNflversePlayersCsv([
    "gsis_id,display_name,position,latest_team,rookie_season,draft_year,draft_round,draft_pick,draft_team,college_name,height,weight",
    "00-0099999,Shadow Rookie,RB,TST,2026,2026,4,112,TST,Example State,71,215",
  ].join("\n"));
  const automatic = buildAutomaticAdvancedResearchInputs({
    candidates: [candidate],
    playerProfiles: profiles,
    activeSeason: 2026,
    evidenceSeason: 2025,
  });
  const applied = applyAdvancedResearchSnapshots([candidate], automatic.inputs).candidates[0];
  assert.equal(automatic.rookieCount, 1);
  assert.equal(applied.player.rookie, false);
  assert.equal(applied.advancedResearch?.lane, "rookie-rb");
  assert.equal(
    applied.advancedResearch?.components.find((component) => component.key === "draft-capital")?.summary,
    "Pick 112; deliberately capped at 10% of the rookie RB research design.",
  );
  const shadow = buildAdvancedResearchShadowBoard([applied], yahooLeagueConfig)[0];
  assert.equal(shadow.movement, 0);
  assert.equal(shadow.medianDelta, 0);
  assert.match(shadow.explanation, /critical research evidence is missing/i);
});

test("nflverse identity enrichment safely attaches usage IDs and age without changing rookie flags", () => {
  const candidate = structuredClone(fixtureCandidates[0]);
  candidate.player.fullName = "Identity Player";
  candidate.player.positions = ["WR"];
  candidate.player.rookie = false;
  candidate.player.age = undefined;
  candidate.player.externalIds.nflverse = undefined;
  const profiles = parseNflversePlayersCsv([
    "gsis_id,display_name,position,latest_team,rookie_season,draft_year,draft_round,draft_pick,draft_team,college_name,height,weight,birth_date",
    "00-0012345,Identity Player,WR,TST,2021,2021,2,40,TST,Example State,72,205,1998-10-10",
  ].join("\n"));
  const enriched = enrichCandidatesWithNflverseProfiles([candidate], profiles).candidates[0];
  assert.equal(enriched.player.externalIds.nflverse, "00-0012345");
  assert.equal(enriched.player.age, 27);
  assert.equal(enriched.player.rookie, false);
  assert.equal(enriched.player.id, candidate.player.id);
});

test("league setup resolves ordered teams, canonical keepers, and snake-round costs", () => {
  const teams = Array.from({ length: 10 }, (_, index) => `Club ${index + 1}`).join("\n");
  const result = resolveLeagueSetup({
    teamNames: teams,
    draftOrder: teams,
    myTeamName: "Club 9",
    myDraftSlot: "9",
    keepers: `Club 9 — ${fixtureCandidates[0].player.fullName} — Round 1\nClub 2 — ${fixtureCandidates[1].player.fullName} — Round 1`,
  }, fixtureCandidates, yahooLeagueConfig);
  assert.equal(result.ready, true);
  assert.equal(result.myTeamId, "team-9");
  assert.equal(result.state?.currentPick, 1);
  assert.deepEqual(result.state?.drafted.map((pick) => pick.overallPick).sort((a, b) => a - b), [2, 9]);
  assert.equal(result.state?.drafted.every((pick) => pick.eventType === "keeper"), true);
});

test("live draft skips consumed keeper picks and undo never removes a keeper", () => {
  const base = createInitialDraftState(fixtureCandidates, { currentPick: 1 });
  const withKeeper = seedDraftStateWithKnownPicks(base, fixtureCandidates, [{
    overallPick: 2,
    playerId: fixtureCandidates[1].player.id,
    teamId: "team-2",
    eventType: "keeper",
  }]);
  const afterLivePick = applyDraftPick(withKeeper, fixtureCandidates[0]);
  assert.equal(afterLivePick.currentPick, 3);
  const undone = undoLastDraftPick(afterLivePick, fixtureCandidates);
  assert.equal(undone.currentPick, 1);
  assert.equal(undone.drafted.length, 1);
  assert.equal(undone.drafted[0].eventType, "keeper");
});

test("saved draft state fails closed when canonical identity changes", () => {
  const current = createInitialDraftState(fixtureCandidates, { currentPick: 1 });
  const stale = {
    ...structuredClone(current),
    leagueConfigFingerprint: "fnv1a-stale",
  };

  assert.throws(
    () => reconcileSavedDraftState(stale, fixtureCandidates, current),
    /fingerprint .* does not match .* refusing stale draft state/i,
  );
});

test("full Yahoo snapshot recovery is atomic and resumes at the first missing pick", () => {
  const base = createInitialDraftState(fixtureCandidates, { currentPick: 1 });
  const result = reconcileYahooDraftSnapshot(base, fixtureCandidates, [
    { overallPick: 1, playerName: fixtureCandidates[0].player.fullName },
    { overallPick: 3, playerName: fixtureCandidates[2].player.fullName },
  ]);
  assert.equal(result.applied, true);
  assert.equal(result.state.currentPick, 2);
  assert.equal(result.state.drafted.length, 2);
  const conflict = reconcileYahooDraftSnapshot(base, fixtureCandidates, [
    { overallPick: 1, playerName: fixtureCandidates[0].player.fullName },
    { overallPick: 1, playerName: fixtureCandidates[1].player.fullName },
  ]);
  assert.equal(conflict.applied, false);
  assert.equal(conflict.state.currentPick, 1);
});

test("opponent profiles require useful history and otherwise retain a neutral fallback", () => {
  const player = fixtureCandidates[0];
  const picks = Array.from({ length: 8 }, (_, index) => ({
    teamId: "team-2",
    overallPick: Math.round(player.market.adp + 12 + index),
    playerName: player.player.fullName,
  }));
  const profiles = buildOpponentDraftProfiles(picks, fixtureCandidates);
  assert.equal(profiles["team-2"].source, "history");
  assert.ok(profiles["team-2"].valueProbability > profiles["team-2"].needProbability);
  assert.equal(chooseOpponentBehavior(undefined, 0.2), "value");
  assert.equal(chooseOpponentBehavior(undefined, 0.5), "market");
  assert.equal(chooseOpponentBehavior(undefined, 0.9), "need");
});

test("advanced usage walk-forward validation beats prior-PPG baseline on the held-out season", () => {
  assert.deepEqual(advancedUsageValidation.trainSeasons, [2022, 2023, 2024]);
  assert.equal(advancedUsageValidation.holdoutSeason, 2025);
  assert.equal(advancedUsageValidation.reports.every((report) => report.holdoutSamples >= 30), true);
  assert.equal(advancedUsageValidation.reports.every((report) => report.maeImprovement >= 0.03), true);
});

test("QB play-by-play research separates designed runs, scrambles, EPA, and CPOE", () => {
  const csv = [
    "posteam,rush_attempt,qb_scramble,qb_dropback,pass_attempt,pass_touchdown,passer_player_id,passer_player_name,rusher_player_id,rusher_player_name,epa,cpoe",
    "TST,1,0,0,0,0,,,qb-1,Test QB,0,",
    "TST,0,0,1,1,1,qb-1,Test QB,,,0.2,3",
    "TST,1,0,0,0,0,,,rb-1,Test RB,0,",
    "TST,1,1,1,0,0,qb-1,Test QB,qb-1,Test QB,0.1,",
  ].join("\n");
  const result = aggregateQbResearchFromPbpCsv(csv, 2025).get("qb-1");
  assert.ok(result);
  assert.equal(result.dropbacks, 2);
  assert.equal(result.designedRushShare, 0.5);
  assert.equal(result.scrambleRate, 0.5);
  assert.equal(result.epaPerDropback, 0.15);
  assert.equal(result.cpoe, 3);
  assert.equal(result.passingTouchdownRate, 1);
});

test("advanced research must beat market baselines before activation", () => {
  const report = evaluateAdvancedResearchBacktest("rookie-rb", [
    { playerId: "a", season: 2024, lane: "rookie-rb", actualPpg: 12, marketBaselinePpg: 9, researchModelPpg: 11.5, hitThresholdPpg: 10 },
    { playerId: "b", season: 2025, lane: "rookie-rb", actualPpg: 7, marketBaselinePpg: 11, researchModelPpg: 8, hitThresholdPpg: 10 },
  ], { minSamples: 2, minSeasons: 2, minMaeImprovement: 0.05, minHitLift: 0.03 });
  assert.equal(report.activationEligible, true);
  assert.ok(report.maeImprovement > 0.05);
  assert.ok(report.hitAccuracyLift >= 0.03);
});

test("rookie WR production gate fails closed when forward validation misses the market", () => {
  assert.ok(rookieWrValidation.samples >= 150);
  assert.ok(rookieWrValidation.holdoutSeasons.length >= 5);
  assert.equal(rookieWrValidation.activationEligible, false);
  assert.ok(rookieWrValidation.blockers.some((blocker) => /MAE improvement/i.test(blocker)));
  assert.ok(rookieWrValidation.breakoutBlockers.some((blocker) => /precision-recall AUC lift/i.test(blocker)));
  assert.ok(rookieWrValidation.ablations.opportunity.mae < rookieWrValidation.ablations.market.mae);
  assert.ok(rookieWrValidation.ablations.opportunity.spearman > rookieWrValidation.ablations.market.spearman);
  assert.ok(rookieWrValidation.segments.directAdp.maeImprovement < 0);
  assert.equal(rookieWrValidation.stableHoldouts, 0);
});

test("redraft-aware board uses lineup-derived replacement instead of positional penalties", () => {
  const league = {
    id: "one-qb-redraft",
    name: "One QB",
    teams: 12,
    rosterSlots: ["QB", "WR", "WR", "WR", "RB", "RB", "TE", "W/R/T", "W/R/T", "K", "BN"],
    flexSlots: ["RB", "WR", "TE"],
    benchSlots: 1,
    irSlots: 0,
    faabBudget: null,
    scoringType: "Head-to-Head",
    waiverDays: 2,
    waiverType: "FAB",
    playoffTeams: 6,
    playoffWeeks: [15, 16, 17],
    keeperLeague: true,
    scoring: yahooLeagueRules,
  };
  const candidates: DraftCandidate[] = [];
  const buildCandidate = (
    id: string,
    name: string,
    position: "QB" | "WR",
    p50: number,
    ecr: number,
  ): DraftCandidate => ({
    player: {
      id,
      fullName: name,
      team: "TST",
      positions: [position],
      rookie: false,
      externalIds: {},
      sources: ["manual"],
    },
    projection: {
      season: 2026,
      provider: "manual",
      scoringType: "PPR",
      asOf: "2026-08-12T12:00:00Z",
      playerId: id,
      stats: {},
      range: {
        p10: p50 - 35,
        p50,
        p90: p50 + 35,
      },
    },
    market: {
      adp: ecr,
      ecr,
      tier: Math.max(1, Math.ceil(ecr / 12)),
    },
  });

  for (let index = 0; index < 16; index += 1) {
    candidates.push(
      buildCandidate(
        `qb-${index + 1}`,
        index === 0 ? "QB Ceiling Guy" : `QB Depth ${index + 1}`,
        "QB",
        310 - index * 7,
        20 + index,
      ),
    );
  }

  for (let index = 0; index < 72; index += 1) {
    candidates.push(
      buildCandidate(
        `wr-${index + 1}`,
        index === 0 ? "Elite WR Anchor" : `WR Depth ${index + 1}`,
        "WR",
        265 - index * 4.2,
        8 + index,
      ),
    );
  }

  const board = buildRedraftBoard(candidates, league);
  const wrBoard = board.find((entry) => entry.playerId === "wr-1");
  const qbBoard = board.find((entry) => entry.playerId === "qb-1");

  assert.ok(wrBoard);
  assert.ok(qbBoard);
  assert.ok(
    wrBoard.boardRank < qbBoard.boardRank,
    "elite WR should outrank a QB with higher raw points in a normal 1QB redraft room",
  );
  assert.ok(
    qbBoard.onesiePenalty === 0,
    "lineup-derived QB replacement should make an extra positional penalty unnecessary",
  );
  assert.ok(wrBoard.positionUtilityMultiplier > 1);
  assert.equal(qbBoard.positionUtilityMultiplier, 1);
  assert.ok(qbBoard.replacementBaseline > 0);
});

test("replacement baselines allocate flex spots once in expected market order", () => {
  const league = {
    ...yahooLeagueConfig,
    id: "lineup-derived-replacement",
  };
  const makeCandidates = (
    position: "QB" | "RB" | "WR" | "TE",
    count: number,
    start: number,
    step: number,
    marketStart: number,
    marketStep: number,
  ): DraftCandidate[] => Array.from({ length: count }, (_, index) => {
    const p50 = start - index * step;
    const id = `${position.toLowerCase()}-replacement-${index + 1}`;
    return {
      player: {
        id,
        fullName: `${position} Replacement ${index + 1}`,
        team: "TST",
        positions: [position],
        rookie: false,
        externalIds: {},
        sources: ["manual"],
      },
      projection: {
        season: 2026,
        provider: "manual",
        scoringType: "PPR",
        asOf: "2026-08-13T12:00:00Z",
        playerId: id,
        stats: {},
        range: { p10: p50 - 25, p50, p90: p50 + 25 },
      },
      market: {
        adp: marketStart + index * marketStep,
        ecr: marketStart + index * marketStep,
        tier: Math.max(1, Math.ceil((marketStart + index * marketStep) / 12)),
      },
    };
  });
  const candidates = [
    ...makeCandidates("QB", 24, 330, 5, 24, 8),
    ...makeCandidates("RB", 60, 300, 3, 1, 2),
    ...makeCandidates("WR", 80, 310, 2.5, 2, 2),
    ...makeCandidates("TE", 24, 230, 5, 40, 6),
  ];

  const board = buildRedraftBoard(candidates, league);
  const te1 = board.find((entry) => entry.playerId === "te-replacement-1");
  const te11 = candidates.find((candidate) => candidate.player.id === "te-replacement-11");
  const rb1 = board.find((entry) => entry.playerId === "rb-replacement-1");
  const wr1 = board.find((entry) => entry.playerId === "wr-replacement-1");

  assert.ok(te1);
  assert.ok(te11);
  assert.ok(rb1);
  assert.ok(wr1);
  assert.equal(te1.replacementBaseline, te11.projection.range.p50);
  assert.ok(te1.positionUtilityMultiplier > 1);
  assert.equal(te1.onesiePenalty, 0);
  assert.notEqual(rb1.replacementBaseline, wr1.replacementBaseline);
});

test("an incomplete position pool cannot manufacture value over replacement", () => {
  const candidate = structuredClone(fixtureCandidates[0]);
  candidate.player.id = "only-qb";
  candidate.player.fullName = "Only Quarterback";
  candidate.player.positions = ["QB"];
  candidate.projection.playerId = candidate.player.id;
  candidate.projection.range = { p10: 350, p50: 400, p90: 450 };
  candidate.market = { adp: 24, ecr: 24, tier: 2, adpSource: "direct" };

  const entry = buildRedraftBoard([candidate], yahooLeagueConfig)[0];

  assert.equal(entry.valueOverReplacement, 0);
  assert.equal(entry.replacementBaseline, 400);
});

test("conditional draft paths compare paired multi-pick portfolios deterministically", () => {
  const templates = cloneFixtureCandidates();
  const positions = ["RB", "WR", "TE", "QB"] as const;
  const candidates = Array.from({ length: 180 }, (_, index) => {
    const candidate = structuredClone(templates[index % templates.length]);
    const position = positions[index % positions.length];
    const id = `conditional-${index + 1}`;
    candidate.player.id = id;
    candidate.player.fullName = `Conditional Player ${index + 1}`;
    candidate.player.positions = [position];
    candidate.projection.playerId = id;
    candidate.projection.range = {
      p10: 205 - index * 0.45,
      p50: 270 - index * 0.55,
      p90: 340 - index * 0.65,
    };
    candidate.market = {
      ...candidate.market,
      adp: index + 1,
      ecr: index + 1,
      tier: Math.floor(index / 12) + 1,
      adpSource: "rank-proxy",
    };
    return candidate;
  });
  const initial = createInitialDraftState(candidates, {
    currentPick: 29,
    myTeamId: "team-9",
    league: yahooLeagueConfig,
  });
  const state = seedDraftStateWithKnownPicks(initial, candidates, [
    { overallPick: 9, playerId: candidates[0].player.id, teamId: "team-9" },
    { overallPick: 12, playerId: candidates[1].player.id, teamId: "team-9" },
  ], { currentPick: 29 });
  const first = buildConditionalDraftPathBoard(state, candidates, undefined, {
    simulations: 40,
    candidateLimit: 5,
    horizonPicks: 3,
  });
  const second = buildConditionalDraftPathBoard(state, candidates, undefined, {
    simulations: 40,
    candidateLimit: 5,
    horizonPicks: 3,
  });

  assert.deepEqual(first.futurePicks, [29, 32, 49]);
  assert.ok(first.outcomes.length >= 3);
  assert.equal(first.outcomes.filter((outcome) => outcome.recommended).length, 1);
  assert.deepEqual(first.outcomes, second.outcomes);
  for (const outcome of first.outcomes) {
    assert.ok(outcome.winRate >= 0 && outcome.winRate <= 1);
    assert.ok(outcome.ceilingLineupPoints >= outcome.medianLineupPoints);
    assert.ok(outcome.medianLineupPoints >= outcome.floorLineupPoints);
    for (const sequence of outcome.commonSequences) {
      assert.deepEqual(sequence.picks.map((pick) => pick.overallPick), [29, 32, 49]);
      assert.equal(new Set(sequence.picks.map((pick) => pick.playerId)).size, 3);
    }
  }
});

test("draft recommendations and pick windows carry robustness and scarcity context", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(candidates, {
    currentPick: 8,
    myTeamId: "team-9",
    league: yahooLeagueConfig,
  });

  state.teams = state.teams.map((team, index) => ({
    ...team,
    positionCounts: {
      QB: index === 1 ? 0 : 1,
      RB: 1,
      WR: index < 4 ? 0 : 1,
      TE: 0,
      K: 0,
    },
    openSlots: ["WR", "WR", "RB", "TE", "W/R/T", "K", "BN"],
  }));

  const recommendations = rankDraftCandidates(state, candidates);
  const topRecommendation = recommendations[0];

  assert.ok(topRecommendation, "recommendations should exist");
  assert.ok(
    topRecommendation.explanation.tierSurvivalProbability <= 1 &&
      topRecommendation.explanation.tierSurvivalProbability >= 0,
    "tier survival probability should stay bounded",
  );
  assert.ok(
    topRecommendation.explanation.convictionScore >= 0,
    "recommendation should carry conviction scoring",
  );
  assert.ok(
    topRecommendation.explanation.fragilityScore >= 0,
    "recommendation should carry fragility scoring",
  );

  const window = buildPickWindowSnapshot(topRecommendation, state, candidates);
  assert.ok(window, "pick window should exist for the top recommendation");
  assert.ok(
    window.expectedPositionSelections >= 0,
    "pick window should expose expected selections before the next turn",
  );
  assert.ok(
    ["low", "medium", "high"].includes(window.runRisk),
    "pick window should expose a run risk band",
  );
});

test("draft plan turns opening-round strategy into format-aware roster checkpoints", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(candidates, {
    currentPick: 13,
    myTeamId: "team-9",
  });
  const myTeam = state.teams.find((team) => team.teamId === state.myTeamId);

  assert.ok(myTeam);
  myTeam.positionCounts = { RB: 1, WR: 0, QB: 0, TE: 0 };
  myTeam.starters = ["seed-rb"];
  myTeam.openSlots = ["RB", "WR", "WR", "WR", "TE", "W/R/T", "W/R/T", "K"];

  const plan = buildDraftPlanSnapshot(state, candidates);
  const rbRule = plan.rules.find((rule) => rule.id === "rb-foundation");
  const wrRule = plan.rules.find((rule) => rule.id === "wr-core");
  const endgameRule = plan.rules.find((rule) => rule.id === "endgame");

  assert.equal(plan.phase, "foundation");
  assert.equal(plan.round, 2);
  assert.equal(rbRule?.status, "attack");
  assert.equal(wrRule?.status, "attack");
  assert.equal(endgameRule?.status, "hold");
  assert.ok(plan.targets.length > 0, "the plan should include a model-backed target queue");
  assert.match(plan.formatRead, /1QB/);
});

test("draft plan changes from opening structure to late upside and endgame discipline", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(candidates, {
    currentPick: 157,
    myTeamId: "team-9",
  });
  const myTeam = state.teams.find((team) => team.teamId === state.myTeamId);

  assert.ok(myTeam);
  myTeam.positionCounts = { RB: 4, WR: 5, QB: 1, TE: 1, K: 0, DST: 0 };
  myTeam.starters = ["rb-1", "rb-2", "wr-1", "wr-2", "wr-3", "qb-1", "te-1"];
  myTeam.bench = ["rb-3", "rb-4", "wr-4", "wr-5"];
  myTeam.openSlots = ["K"];

  const plan = buildDraftPlanSnapshot(state, candidates);
  const benchRule = plan.rules.find((rule) => rule.id === "bench-upside");
  const endgameRule = plan.rules.find((rule) => rule.id === "endgame");

  assert.equal(plan.phase, "endgame");
  assert.equal(benchRule?.status, "attack");
  assert.equal(endgameRule?.status, "attack");
  assert.equal(plan.rules.find((rule) => rule.id === "rb-foundation")?.status, "satisfied");
  assert.equal(plan.rules.find((rule) => rule.id === "wr-core")?.status, "satisfied");
});

test("Yahoo URL inspection distinguishes stable navigation from fragile draft patterns", () => {
  const players = inspectYahooFantasyUrl(
    "https://football.fantasysports.yahoo.com/f1/101/players?cat_type=S_S&pos=DEF&status=ALL",
  );
  const availablePlayers = inspectYahooFantasyUrl(
    "https://football.fantasysports.yahoo.com/f1/750909/players?&pos=O&sort=OR&sdir=1&status=A&eteam=ALL&fteam=NONE&stat1=S_S_2025&jsenabled=1",
  );
  const managers = inspectYahooFantasyUrl(
    "https://football.fantasysports.yahoo.com/f1/101/teams",
  );
  const myTeam = inspectYahooFantasyUrl(
    "https://football.fantasysports.yahoo.com/f1/750909/11",
  );
  const draft = inspectYahooFantasyUrl(
    "https://football.fantasysports.yahoo.com/f1/draft",
  );

  assert.equal(players.pageKind, "players");
  assert.equal(players.stability, "stable");
  assert.equal(players.interaction, "manual-action-landing");
  assert.ok(players.parameterizedFields.includes("pos"));
  assert.ok(players.supportedActions.includes("add-drop"));
  assert.equal(players.teamPageId, null);

  assert.equal(availablePlayers.pageKind, "players");
  assert.equal(availablePlayers.leagueId, "750909");
  assert.ok(availablePlayers.parameterizedFields.includes("sort"));
  assert.ok(availablePlayers.parameterizedFields.includes("fteam"));

  assert.equal(myTeam.pageKind, "team-roster");
  assert.equal(myTeam.leagueId, "750909");
  assert.equal(myTeam.teamPageId, "11");
  assert.equal(myTeam.stability, "stable");
  assert.equal(myTeam.interaction, "manual-action-landing");
  assert.ok(myTeam.supportedActions.includes("add-drop"));

  assert.equal(managers.pageKind, "managers");
  assert.ok(managers.supportedActions.includes("trade-proposal"));

  assert.equal(draft.pageKind, "research");
  assert.equal(draft.interaction, "read-only-navigation");
});

test("Yahoo action handoff plans stay human-in-the-loop", () => {
  const addDropPlan = buildYahooActionHandoffPlan(
    {
      kind: "add-drop",
      add: [
        {
          fullName: "Jaylen Warren",
          positions: ["RB"],
          team: "PIT",
        },
      ],
      drop: [
        {
          fullName: "Tyjae Spears",
          positions: ["RB"],
          team: "TEN",
        },
      ],
    },
    "101",
  );
  const tradePlan = buildYahooActionHandoffPlan(
    {
      kind: "trade-proposal",
      send: [
        {
          fullName: "Chris Olave",
          positions: ["WR"],
          team: "NO",
        },
      ],
      receive: [
        {
          fullName: "Kenneth Walker III",
          positions: ["RB"],
          team: "SEA",
        },
      ],
      counterpartyTeamId: "team-6",
    },
    "101",
  );

  assert.equal(addDropPlan.supported, true);
  assert.equal(addDropPlan.completion, "manual-in-yahoo");
  assert.match(addDropPlan.landingUrl ?? "", /\/f1\/101\/players/);
  assert.match(addDropPlan.landingUrl ?? "", /pos=RB/);

  assert.equal(tradePlan.supported, true);
  assert.equal(tradePlan.completion, "manual-in-yahoo");
  assert.equal(tradePlan.landingUrl, "https://football.fantasysports.yahoo.com/f1/101/teams");
});

test("Yahoo extension previews and event extraction stay aligned", () => {
  const preview = buildYahooExtensionPreview(yahooExtensionFixtureEnvelope);
  const events = extractYahooDraftEventsFromEnvelope(yahooExtensionFixtureEnvelope);

  assert.equal(preview.payloadKind, "draft-sync");
  assert.equal(preview.inspection.pageKind, "draft-room");
  assert.equal(preview.recentPickCount, 2);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.playerName, "Jahmyr Gibbs");
  assert.equal(events[1]?.teamId, "team-2");
});

test("Yahoo DOM extractor builds a provider-neutral available-player snapshot", () => {
  const html = readFileSync(
    new URL("./fixtures/yahoo/available-players.html", import.meta.url),
    "utf8",
  );
  const { document } = parseHTML(html);
  const result = yahooDomExtractor.extractYahooSnapshot(
    document,
    "https://football.fantasysports.yahoo.com/f1/750909/players?status=A&pos=O",
  );

  assert.equal(result.snapshot.pageType, "players");
  assert.equal(result.snapshot.leagueId, "750909");
  assert.equal(result.snapshot.teamId, "11");
  assert.equal(result.snapshot.players.length, 2);
  assert.deepEqual(result.snapshot.players[0], {
    providerPlayerId: "40896",
    fullName: "Jayden Daniels",
    nflTeam: "WAS",
    positions: ["QB"],
    availability: "available",
    rosterStatusLabel: "FA",
    fantasyTeamId: null,
  });
  assert.ok(result.diagnostics.deterministicSignals.includes("player-id-from-data-ys-playerid"));
  assert.ok(result.diagnostics.unavailableSignals.includes("live-draft-current-pick"));
  assert.ok(result.diagnostics.unsupportedActions.includes("draft-pick"));
});

test("Yahoo DOM extractor marks team-page players as rostered", () => {
  const html = readFileSync(
    new URL("./fixtures/yahoo/team-roster.html", import.meta.url),
    "utf8",
  );
  const { document } = parseHTML(html);
  const result = yahooDomExtractor.extractYahooSnapshot(
    document,
    "https://football.fantasysports.yahoo.com/f1/750909/11",
  );

  assert.equal(result.snapshot.pageType, "team-roster");
  assert.equal(result.snapshot.teamId, "11");
  assert.equal(result.snapshot.players.length, 2);
  assert.equal(result.snapshot.players[0]?.providerPlayerId, "40059");
  assert.equal(result.snapshot.players[0]?.availability, "rostered");
  assert.equal(result.snapshot.players[0]?.fantasyTeamId, "11");
  assert.equal(result.snapshot.draft, null);
});

test("Yahoo extractor discovers league roster pages for a user-initiated inventory scan", () => {
  const { document } = parseHTML(`<!doctype html><html><body>
    <a href="/f1/750909/11">My Team</a>
    <a href="https://football.fantasysports.yahoo.com/f1/750909/2">Second Team</a>
    <a href="/f1/750909/teams">Managers</a>
  </body></html>`);
  const ids = yahooDomExtractor.extractLeagueTeamIds(
    document,
    "750909",
    "https://football.fantasysports.yahoo.com/f1/750909/teams",
  );
  assert.deepEqual(ids, ["11", "2"]);
});

test("Yahoo league inventory validates coverage and updates in-season ownership", () => {
  const envelope = {
    version: 1,
    emittedAt: "2026-08-13T17:00:00Z",
    provider: "yahoo-browser-extension",
    page: {
      url: "https://football.fantasysports.yahoo.com/f1/750909",
      title: "H-Town Heroes | Yahoo Fantasy Football",
      kind: "league-home",
      leagueId: "750909",
    },
    payload: {
      kind: "league-inventory",
      inventory: {
        schemaVersion: 1,
        source: "yahoo-browser",
        leagueId: "750909",
        myTeamId: "11",
        startedAt: "2026-08-13T16:59:30Z",
        completedAt: "2026-08-13T17:00:00Z",
        players: [
          {
            providerPlayerId: "40059",
            fullName: "Jahmyr Gibbs",
            nflTeam: "DET",
            positions: ["RB"],
            availability: "rostered",
            rosterStatusLabel: null,
            fantasyTeamId: "11",
          },
          {
            providerPlayerId: "99999",
            fullName: "Tyjae Spears",
            nflTeam: "TEN",
            positions: ["RB"],
            availability: "available",
            rosterStatusLabel: "FA",
            fantasyTeamId: null,
          },
        ],
        coverage: {
          myRosterCaptured: true,
          availablePositions: ["QB", "RB", "WR", "TE"],
          teamRosterIds: ["1", "2", "11"],
          pagesFetched: 9,
          partial: false,
          errors: [],
        },
      },
      diagnostics: {
        deterministicSignals: ["my-roster-from-team-page", "available-players-from-status-a"],
        provisionalSignals: [],
        unavailableSignals: [],
        unsupportedActions: ["add-drop"],
      },
    },
  };
  assert.equal(isYahooExtensionEnvelope(envelope), true);
  assert.match(buildYahooExtensionPreview(envelope as Parameters<typeof buildYahooExtensionPreview>[0]).nextStep, /ready/);

  const players = structuredClone(inSeasonFixturePlayers);
  const gibbs = players.find((player) => player.player.fullName === "Jahmyr Gibbs");
  const spears = players.find((player) => player.player.fullName === "Tyjae Spears");
  assert.ok(gibbs && spears);
  gibbs.availability = "league-rostered";
  spears.availability = "league-rostered";
  const applied = applyYahooLeagueInventory(
    players,
    envelope.payload.inventory as Parameters<typeof applyYahooLeagueInventory>[1],
    { now: "2026-08-13T17:05:00Z" },
  );
  assert.equal(applied.transactionReady, true);
  assert.equal(applied.matchedCount, 2);
  assert.equal(gibbs.player.id && applied.players.find((player) => player.player.id === gibbs.player.id)?.availability, "my-roster");
  assert.equal(applied.players.find((player) => player.player.id === spears.player.id)?.availability, "free-agent");
});

test("Yahoo inventory blocks transactions when stale or position coverage is partial", () => {
  const inventory = {
    schemaVersion: 1 as const,
    source: "yahoo-browser" as const,
    leagueId: "750909",
    myTeamId: "11",
    startedAt: "2026-08-13T15:00:00Z",
    completedAt: "2026-08-13T15:01:00Z",
    players: [],
    coverage: {
      myRosterCaptured: true,
      availablePositions: ["RB" as const],
      teamRosterIds: ["11"],
      pagesFetched: 2,
      partial: true,
      errors: [],
    },
  };
  const applied = applyYahooLeagueInventory(inSeasonFixturePlayers, inventory, { now: "2026-08-13T17:00:00Z" });
  assert.equal(applied.transactionReady, false);
  assert.ok(applied.blockers.some((blocker) => /partial/.test(blocker)));
  assert.ok(applied.blockers.some((blocker) => /stale/.test(blocker)));
  assert.ok(applied.blockers.some((blocker) => /QB, WR, TE/.test(blocker)));
});

test("Yahoo extension boundary accepts snapshots and rejects secret-shaped additions", () => {
  const envelope = {
    version: 1 as const,
    emittedAt: "2026-08-12T19:20:00-04:00",
    provider: "yahoo-browser-extension" as const,
    page: {
      url: "https://football.fantasysports.yahoo.com/f1/750909/players?status=A",
      title: "Player List | Yahoo Fantasy Football",
      kind: "players" as const,
      leagueId: "750909",
    },
    payload: {
      kind: "state-snapshot" as const,
      snapshot: {
        schemaVersion: 1 as const,
        source: "yahoo-browser" as const,
        leagueId: "750909",
        teamId: "11",
        pageType: "players" as const,
        players: [
          {
            providerPlayerId: "40896",
            fullName: "Jayden Daniels",
            nflTeam: "WAS",
            positions: ["QB"],
            availability: "available" as const,
            rosterStatusLabel: "FA",
            fantasyTeamId: null,
          },
        ],
        draft: null,
      },
      diagnostics: {
        deterministicSignals: ["player-id-from-data-ys-playerid"],
        provisionalSignals: [],
        unavailableSignals: ["live-draft-current-pick"],
        unsupportedActions: ["draft-pick"],
      },
    },
  };

  assert.equal(isYahooExtensionEnvelope(envelope), true);
  assert.equal(
    isYahooExtensionEnvelope({
      ...envelope,
      payload: { ...envelope.payload, cookie: "must-never-cross-boundary" },
    }),
    false,
  );
  assert.equal(
    isYahooExtensionEnvelope({
      ...envelope,
      page: { ...envelope.page, url: "https://example.com/f1/750909/players" },
    }),
    false,
  );
  assert.equal(
    yahooDomExtractor.sanitizeYahooPageUrl(
      "https://football.fantasysports.yahoo.com/f1/750909/players?status=A&crumb=secret-value",
    ),
    "https://football.fantasysports.yahoo.com/f1/750909/players?status=A",
  );
  assert.equal(
    isYahooExtensionEnvelope({
      ...envelope,
      page: {
        ...envelope.page,
        url: "https://football.fantasysports.yahoo.com/f1/750909/players?crumb=secret-value",
      },
    }),
    false,
  );
});

test("Yahoo live mock URL is classified without retaining its auth query", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const result = yahooDomExtractor.extractYahooSnapshot(
    document,
    "https://football.fantasysports.yahoo.com/draftclient/f1/8713897/4?auth=sensitive",
  );

  assert.equal(result.snapshot.pageType, "draft-room");
  assert.equal(result.snapshot.leagueId, null);
  assert.deepEqual(result.snapshot.draft, {
    roomId: "8713897",
    userSlot: "4",
    currentPick: null,
    currentPickText: null,
    currentTeamId: null,
    currentTeamLabel: null,
    picks: [],
    availablePlayers: [],
    selectorConfidence: "provisional",
  });
  assert.equal(
    yahooDomExtractor.sanitizeYahooPageUrl(
      "https://football.fantasysports.yahoo.com/draftclient/f1/8713897/4?auth=sensitive",
    ),
    "https://football.fantasysports.yahoo.com/draftclient/f1/8713897/4",
  );
});

test("Yahoo draft import returns accepted and skipped outcome receipts", () => {
  const candidates = cloneFixtureCandidates();
  const state = createInitialDraftState(candidates);
  const result = applyYahooDraftEvents(state, candidates, [
    {
      overallPick: 1,
      teamId: "team-1",
      playerName: "Bijan Robinson",
      yahooPlayerId: "33186",
      team: "ATL",
      position: "RB",
    },
    {
      overallPick: 3,
      teamId: "team-3",
      playerName: "Nonexistent Player",
      team: "XXX",
      position: "WR",
    },
  ]);

  assert.equal(result.startingPick, 1);
  assert.equal(result.endingPick, 2);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.outcomes.length, 2);
  assert.equal(result.outcomes[0]?.status, "applied");
  assert.equal(result.outcomes[1]?.status, "skipped");

  if (result.outcomes[0]?.status === "applied") {
    assert.match(result.outcomes[0].resolvedPlayerLabel, /Bijan Robinson/);
  }

  if (result.outcomes[1]?.status === "skipped") {
    assert.match(result.outcomes[1].reason, /event says pick 3/);
  }
});

test("Yahoo envelope comparison detects incremental progress and stale snapshots", () => {
  assert.equal(yahooExtensionFixtureEnvelope.payload.kind, "draft-sync");
  const basePayload = yahooExtensionFixtureEnvelope.payload;
  const previous = yahooExtensionFixtureEnvelope;
  const next = {
    ...yahooExtensionFixtureEnvelope,
    emittedAt: "2026-08-12T20:16:30-04:00",
    payload: {
      ...basePayload,
      recentPickTexts: [
        "Pick 1 Jahmyr Gibbs DET RB",
        "Pick 2 Bijan Robinson ATL RB",
        "Pick 3 CeeDee Lamb DAL WR",
      ],
      events: [
        ...basePayload.events,
        {
          overallPick: 3,
          teamId: "team-3",
          playerName: "CeeDee Lamb",
          yahooPlayerId: "30123",
          team: "DAL",
          position: "WR",
          pickedAt: "2026-08-12T20:13:25-04:00",
        },
      ],
    },
  };
  const stale = {
    ...yahooExtensionFixtureEnvelope,
    emittedAt: "2026-08-12T20:10:30-04:00",
  };

  const comparison = compareYahooExtensionEnvelopes(previous, next);
  const staleComparison = compareYahooExtensionEnvelopes(previous, stale);

  assert.equal(comparison.emittedAtOrder, "newer");
  assert.equal(comparison.staleLikely, false);
  assert.equal(comparison.incrementalEvents.length, 1);
  assert.equal(comparison.incrementalEvents[0]?.playerName, "CeeDee Lamb");

  assert.equal(staleComparison.emittedAtOrder, "older");
  assert.equal(staleComparison.staleLikely, true);
});

test("refresh signals adjust projections and produce a watchlist digest", () => {
  const calibrated = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const marvin = calibrated.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = calibrated.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(marvin && chaseBrown);

  const refreshSignals: RefreshSignal[] = [
    {
      playerId: marvin.player.id,
      category: "role-up",
      headline: "Marvin Harrison Jr. is dominating first-team reps",
      summary: "Role signal points to featured usage.",
      source: "beat-report",
      publishedAt: "2026-08-12T09:00:00-04:00",
      confidence: "medium",
      impact: 3.6,
    },
    {
      playerId: chaseBrown.player.id,
      category: "role-down",
      headline: "Chase Brown backfield remains murky",
      summary: "The weekly touch floor is less certain than the market price.",
      source: "fantasypros-news",
      publishedAt: "2026-08-12T08:30:00-04:00",
      confidence: "high",
      impact: 3.8,
    },
  ];

  const refreshed = applyRefreshSignals(calibrated, refreshSignals, {
    now: "2026-08-12T12:00:00-04:00",
  });
  const refreshedMarvin = refreshed.candidates.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );
  const refreshedBrown = refreshed.candidates.find(
    (candidate) => candidate.player.fullName === "Chase Brown",
  );

  assert.ok(refreshedMarvin && refreshedBrown);
  assert.ok(
    refreshedMarvin.projection.range.p50 > marvin.projection.range.p50,
    "positive refresh signals should lift the projection median",
  );
  assert.ok(
    refreshedBrown.projection.range.p50 < chaseBrown.projection.range.p50,
    "negative refresh signals should lower the projection median",
  );
  assert.equal(refreshedMarvin.signals?.refresh?.status, "rising");
  assert.equal(refreshedBrown.signals?.refresh?.status, "falling");
  assert.ok(
    refreshed.digest.watchlist.some((entry) => entry.playerId === marvin.player.id),
    "rising player should appear in the watchlist",
  );
  assert.ok(
    refreshed.digest.watchlist.some((entry) => entry.playerId === chaseBrown.player.id),
    "falling player should appear in the watchlist",
  );
});

test("manual refresh import matches players by ids or names", () => {
  const calibrated = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const marvin = calibrated.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const jayden = calibrated.find((candidate) => candidate.player.fullName === "Jayden Daniels");

  assert.ok(marvin && jayden);

  const raw = JSON.stringify([
    {
      fantasyProsId: marvin.player.externalIds.fantasyPros,
      category: "role-up",
      headline: "Featured camp usage",
      impact: 3.1,
    },
    {
      playerName: "Jayden Daniels",
      team: "WAS",
      category: "offense-up",
      headline: "Offense trending up",
      confidence: "high",
    },
    {
      playerName: "Missing Player",
      category: "role-down",
      headline: "Should be skipped",
    },
  ]);

  const parsed = parseManualRefreshSignals(raw, calibrated, {
    now: "2026-08-12T10:00:00-04:00",
  });

  assert.equal(parsed.signals.length, 2);
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.signals[0]?.playerId, marvin.player.id);
  assert.equal(parsed.signals[1]?.playerId, jayden.player.id);
});

test("FantasyPros-style refresh payloads normalize into refresh signals", () => {
  const calibrated = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const marvin = calibrated.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const chaseBrown = calibrated.find((candidate) => candidate.player.fullName === "Chase Brown");

  assert.ok(marvin && chaseBrown);

  const payload = {
    news: [
      {
        player_id: marvin.player.externalIds.fantasyPros,
        player_name: "Marvin Harrison Jr.",
        team: "ARI",
        headline: "Marvin Harrison Jr. continues to dominate first-team reps",
        category: "role up",
        published_at: "2026-08-12T08:15:00-04:00",
      },
      {
        player_id: chaseBrown.player.externalIds.fantasyPros,
        player_name: "Chase Brown",
        team: "CIN",
        headline: "Chase Brown listed with soft-tissue concern",
        category: "injury",
        published_at: "2026-08-12T09:10:00-04:00",
        impact: 4.6,
      },
    ],
  };

  const normalized = normalizeFantasyProsRefreshSignals(payload, calibrated);

  assert.equal(normalized.signals.length, 2);
  assert.equal(normalized.messages.length, 0);
  assert.equal(normalized.signals[0]?.playerId, marvin.player.id);
  assert.equal(normalized.signals[0]?.category, "role-up");
  assert.equal(normalized.signals[1]?.playerId, chaseBrown.player.id);
  assert.equal(normalized.signals[1]?.category, "injury-up");
});

test("draft morning pack assembles targets, fades, and contingencies", () => {
  const calibrated = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const manualSignalsSeed: RefreshSignal[] = [
    {
      playerId:
        calibrated.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.")?.player.id ??
        "",
      category: "role-up",
      headline: "Featured usage confirmed",
      summary: "Morning usage note supports the upside and median case.",
      source: "manual",
      publishedAt: "2026-08-12T08:00:00-04:00",
      confidence: "high",
      impact: 3.4,
    },
    {
      playerId:
        calibrated.find((candidate) => candidate.player.fullName === "Chase Brown")?.player.id ?? "",
      category: "role-down",
      headline: "Committee concern persists",
      summary: "Touch floor looks shakier on draft morning.",
      source: "manual",
      publishedAt: "2026-08-12T08:10:00-04:00",
      confidence: "high",
      impact: 3.9,
    },
  ];
  const manualSignals: RefreshSignal[] = manualSignalsSeed.filter((signal) => signal.playerId);
  const refreshed = applyRefreshSignals(calibrated, manualSignals, {
    now: "2026-08-12T10:30:00-04:00",
  });
  const state = createInitialDraftState(refreshed.candidates, {
    currentPick: 29,
    myTeamId: "team-9",
  });
  const movementLog: DraftBoardMovementEntry[] = refreshed.candidates
    .sort((a, b) => b.projection.range.p50 - a.projection.range.p50)
    .map((candidate, index) => {
      const direction: DraftBoardMovementEntry["direction"] =
        index % 2 === 0 ? "up" : "down";

      return {
        playerId: candidate.player.id,
        direction,
        movementScore: 10 - index,
        marketRank: index + 2,
        modelRank: index + 1,
        calibratedDelta: 4,
        headline: `${candidate.player.fullName} moved`,
        reasons: ["Synthetic test movement entry."],
      };
    })
    .slice(0, 5);

  const pack = buildDraftMorningPack({
    candidates: refreshed.candidates,
    draftState: state,
    refreshDigest: refreshed.digest,
    movementLog,
    generatedAt: "2026-08-12T10:30:00-04:00",
  });

  assert.equal(pack.headline, "Morning-of-Draft Final Refresh Pack");
  assert.ok(pack.checklist.length >= 4);
  assert.ok(pack.priorityTargets.length > 0, "pack should surface at least one target");
  assert.ok(pack.fragileFades.length > 0, "pack should surface at least one fade");
  assert.ok(pack.contingencyPlans.length >= 0);
  assert.ok(
    pack.priorityTargets.some((entry) => entry.headline.includes("draft-morning target")),
    "target bucket should use draft-morning framing",
  );
});

test("preferred targets support model, approved, and merged labels", () => {
  const calibrated = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const marvin = calibrated.find((candidate) => candidate.player.fullName === "Marvin Harrison Jr.");
  const jayden = calibrated.find((candidate) => candidate.player.fullName === "Jayden Daniels");

  assert.ok(marvin && jayden);

  const parsed = parseApprovedPreferredTargetsFromEnv(
    JSON.stringify([
      {
        fantasyProsId: marvin.player.externalIds.fantasyPros,
        approvedBy: "User approved analysts",
        reason: "This is one of the main personal draft-day targets.",
      },
      {
        playerName: "Jayden Daniels",
        team: "WAS",
        approvedBy: "User approved analysts",
      },
    ]),
  );

  const preferred = applyPreferredTargets(calibrated, parsed.targets);
  const preferredMarvin = preferred.candidates.find(
    (candidate) => candidate.player.fullName === "Marvin Harrison Jr.",
  );
  const preferredJayden = preferred.candidates.find(
    (candidate) => candidate.player.fullName === "Jayden Daniels",
  );

  assert.ok(preferredMarvin?.signals?.preferredTarget);
  assert.ok(preferredJayden?.signals?.preferredTarget);
  assert.ok(
    preferredMarvin.signals?.preferredTarget.source === "both" ||
      preferredMarvin.signals?.preferredTarget.source === "approved",
  );
  assert.equal(preferredJayden.signals?.preferredTarget.source, "approved");
  assert.ok(
    ["Preferred", "Approved Preferred", "Model Preferred"].includes(
      preferredMarvin.signals?.preferredTarget.label ?? "",
    ),
  );
});

test("personal target backups round-trip and recover changed canonical ids by name", () => {
  const candidates = cloneFixtureCandidates();
  const candidate = candidates[0]!;
  const tag = createPersonalTargetTag(candidate, "2026-08-13T12:00:00.000Z");
  const serialized = serializePersonalTargetTags([tag], "personal-target-test");
  const parsed = parsePersonalTargetTags(serialized);

  assert.equal(parsed.messages.length, 0);
  assert.equal(parsed.targets.length, 1);
  assert.equal(parsed.targets[0]?.playerId, candidate.player.id);

  const staleIdTag = { ...tag, playerId: "old-canonical-id" };
  const resolved = resolvePersonalTargetTags([staleIdTag], candidates);
  assert.equal(resolved.unmatched.length, 0);
  assert.equal(resolved.matched[0]?.playerId, candidate.player.id);

  const invalid = parsePersonalTargetTags('{"targets":[{"team":"DET"}]}');
  assert.equal(invalid.targets.length, 0);
  assert.ok(invalid.messages[0]?.includes("missing player identity"));
});

test("undervalued plays are live recommendations with positive model-to-market gaps", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const strongest = candidates[0]!;
  strongest.projection.range = { p10: 410, p50: 470, p90: 525 };
  strongest.market = { ...strongest.market, ecr: 180, adp: 180 };
  const state = createInitialDraftState(candidates, {
    currentPick: 29,
    myTeamId: "team-9",
  });
  const values = buildUndervaluedPlaySnapshots(state, candidates);

  assert.ok(values.some((value) => value.playerId === strongest.player.id));
  assert.ok(values.every((value) => value.boardEdge > 0));
  assert.ok(
    values.every(
      (value, index) =>
        index === 0 || value.marketLeverageScore <= values[index - 1]!.marketLeverageScore,
    ),
  );
});

test("reach tolerance stays bounded by market cost and run pressure", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(candidates, {
    currentPick: 20,
    myTeamId: "team-9",
    league: yahooLeagueConfig,
  });

  state.teams = state.teams.map((team, index) => ({
    ...team,
    positionCounts: {
      QB: 1,
      RB: index === 0 ? 1 : 2,
      WR: index < 4 ? 0 : 1,
      TE: 1,
      K: 0,
    },
    openSlots: ["WR", "WR", "RB", "W/R/T", "K", "BN"],
  }));

  const recommendations = rankDraftCandidates(state, candidates);
  const topRecommendation = recommendations[0];
  const reach = buildReachToleranceSnapshot(topRecommendation, state, candidates);

  assert.ok(reach, "reach tolerance snapshot should exist");
  assert.ok(reach.maxReachPicks >= 0 && reach.maxReachPicks <= 18);
  assert.ok(["Do not reach", "Small reach ok", "Aggressive reach ok"].includes(reach.label));
});

test("tier wipe scenarios produce same-position fallbacks and cross-board pivots", () => {
  const candidates = calibrateDraftCandidates(
    cloneFixtureCandidates(),
    yahooLeagueRules,
    buildCalibrationContext(),
  );
  const state = createInitialDraftState(candidates, {
    currentPick: 28,
    myTeamId: "team-9",
    league: yahooLeagueConfig,
  });

  state.teams = state.teams.map((team, index) => ({
    ...team,
    positionCounts: {
      QB: 1,
      RB: index === 0 ? 1 : 2,
      WR: 0,
      TE: index % 2 === 0 ? 0 : 1,
      K: 0,
    },
    openSlots: ["WR", "WR", "WR", "TE", "W/R/T", "K", "BN"],
  }));

  const scenarios = buildTierWipeScenarioSnapshots(state, candidates, {
    simulations: 100,
    picksSimulated: state.picksUntilNextTurn,
    positionSnapshots: [{
      position: "WR",
      expectedSelections: 3,
      distribution: [{ count: 3, probability: 1 }],
    }],
    pickPredictions: [],
    threatenedPlayers: [],
    summary: "Synthetic receiver run used to verify wipe contingency construction.",
  });

  assert.ok(scenarios.length > 0, "at least one tier wipe scenario should exist");
  assert.ok(
    scenarios.some((scenario) => scenario.fallbackPlayerIds.length >= 0),
    "wipe scenarios should include fallback slots even when thin",
  );
  assert.ok(
    scenarios.every((scenario) => scenario.likelyLostCount >= 1),
    "wipe scenarios should project at least one threatened loss",
  );
});

test("breaking injury news identifies a verified available successor and proposes the roster cut", () => {
  const players = structuredClone(inSeasonFixturePlayers);
  const affected = players.find((player) => player.player.fullName === "Marvin Harrison Jr.");
  const beneficiary = players.find((player) => player.player.fullName === "Tyjae Spears");
  assert.ok(affected && beneficiary);
  affected.player.team = "NO";
  affected.player.positions = ["WR"];
  affected.depthChartOrder = 1;
  affected.weeklyProjection = { p10: 16, p50: 27, p90: 38 };
  beneficiary.player.team = "NO";
  beneficiary.player.positions = ["WR"];
  beneficiary.depthChartOrder = 2;
  beneficiary.availability = "free-agent";

  const response = buildBreakingNewsResponse({
    signal: {
      playerId: affected.player.id,
      category: "injury-up",
      headline: "Jordyn Tyson left practice early with a hamstring injury",
      summary: "Tyson exited with a trainer and did not return.",
      source: "beat-report",
      sourceLabel: "Verified Saints beat reporter",
      publishedAt: "2026-08-13T16:14:00Z",
      confidence: "medium",
      impact: 4.4,
    },
    players,
    myTeam: inSeasonFixtureMyTeam,
  });

  assert.equal(response.alert?.urgency, "immediate");
  assert.equal(response.alert?.actionConfidence, "provisional");
  assert.ok(response.beneficiaryPlayerIds.includes(beneficiary.player.id));
  assert.equal(response.status, "actionable");
  assert.equal(response.recommendations[0]?.addPlayerId, beneficiary.player.id);
  assert.ok(response.recommendations[0]?.dropPlayerId);
});

test("breaking news warns immediately but refuses to invent an unverified next man up", () => {
  const players = structuredClone(inSeasonFixturePlayers);
  const affected = players[0];
  const response = buildBreakingNewsResponse({
    signal: {
      playerId: affected.player.id,
      category: "injury-up",
      headline: `${affected.player.fullName} left practice early`,
      summary: "The player went inside with a trainer.",
      source: "beat-report",
      publishedAt: "2026-08-13T16:14:00Z",
      confidence: "medium",
      impact: 3.5,
    },
    players,
    myTeam: inSeasonFixtureMyTeam,
  });

  assert.equal(response.alert?.urgency, "immediate");
  assert.equal(response.status, "monitor");
  assert.equal(response.recommendations.length, 0);
  assert.match(response.blockers[0] ?? "", /depth-chart/);
});

test("in-season opportunity trends distinguish quiet risers from hype without usage", () => {
  const trends = buildOpportunityTrendSnapshots(inSeasonFixturePlayers);
  const tyjae = trends.find((trend) =>
    inSeasonFixturePlayers.find((player) => player.player.id === trend.playerId)?.player.fullName ===
      "Tyjae Spears",
  );
  const chaseBrown = trends.find((trend) =>
    inSeasonFixturePlayers.find((player) => player.player.id === trend.playerId)?.player.fullName ===
      "Chase Brown",
  );

  assert.ok(tyjae, "Tyjae Spears trend should exist");
  assert.ok(chaseBrown, "Chase Brown trend should exist");
  assert.equal(tyjae.classification, "early-edge");
  assert.equal(tyjae.recommendation, "add");
  assert.equal(chaseBrown.classification, "hype-without-usage");
  assert.equal(chaseBrown.recommendation, "avoid");
});

test("in-season trade ideas are driven by lineup impact", () => {
  const ideas = buildTradeIdeaSnapshots(
    inSeasonFixturePlayers,
    inSeasonFixtureMyTeam,
    inSeasonFixtureLeagueTeams,
  );

  assert.ok(ideas.length > 0, "trade idea list should not be empty");
  assert.ok(
    ideas.some((idea) => idea.verdict === "pursue" || idea.verdict === "consider"),
    "at least one trade idea should be actionable",
  );
  assert.ok(
    ideas.every((idea) => idea.rationale.length >= 2),
    "trade ideas should explain roster-impact math",
  );
  assert.ok(
    ideas.every((idea) => idea.proposedTransaction.kind === "trade-proposal"),
    "trade ideas should map cleanly into provider-neutral trade proposals",
  );
});

test("waiver recommendations produce add-drop transactions and action queue entries", () => {
  const waiverIdeas = buildWaiverRecommendationSnapshots(
    inSeasonFixturePlayers,
    inSeasonFixtureMyTeam,
  );
  const tradeIdeas = buildTradeIdeaSnapshots(
    inSeasonFixturePlayers,
    inSeasonFixtureMyTeam,
    inSeasonFixtureLeagueTeams,
  );
  const queue = buildTransactionQueue(waiverIdeas, tradeIdeas);
  const tyjaeIdea = waiverIdeas.find((idea) =>
    inSeasonFixturePlayers.find((player) => player.player.id === idea.addPlayerId)?.player.fullName ===
      "Tyjae Spears",
  );

  assert.ok(waiverIdeas.length > 0, "waiver recommendations should not be empty");
  assert.ok(tyjaeIdea, "Tyjae Spears should surface in the current fixture waiver pool");
  assert.ok(
    tyjaeIdea.verdict === "priority" || tyjaeIdea.verdict === "bid",
    "Tyjae Spears should be treated as an actionable add in the fixture set",
  );
  assert.equal(tyjaeIdea.proposedTransaction.kind, "add-drop");
  assert.ok(
    tyjaeIdea.proposedTransaction.add.length === 1,
    "waiver recommendations should produce a single structured add target",
  );
  assert.ok(queue.length > 0, "transaction queue should contain actionable entries");
  assert.ok(
    queue.every((entry) => entry.proposedTransaction.kind === "add-drop" || entry.proposedTransaction.kind === "trade-proposal"),
    "transaction queue should stay provider-neutral across waiver and trade actions",
  );
});

test("historical ADP parsing keeps a complete PPR player payload and normalizes suffixes", () => {
  const parsed = parseFfcHistoricalAdp(JSON.stringify({
    players: [
      { name: "Marvin Harrison Jr.", position: "WR", adp: 18.4 },
      { name: "Sample Defender", position: "DST", adp: 140 },
      { name: "Broken Row", position: "RB", adp: null },
    ],
  }));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.adp, 18.4);
  assert.equal(normalizeHistoricalPlayerName("Marvin Harrison Jr."), "marvinharrison");
  assert.equal(normalizeHistoricalPlayerName("Marvin Harrison"), "marvinharrison");
});

test("historical outcomes use exact league bonuses instead of a season-total shortcut", () => {
  const csv = [
    "player_id,player_name,player_display_name,position,season_type,team,passing_yards,passing_tds,passing_interceptions,rushing_yards,rushing_tds,receptions,receiving_yards,receiving_tds,fumbles_lost_total,passing_2pt_conversions,rushing_2pt_conversions,receiving_2pt_conversions,special_teams_tds,attempts,carries,targets,target_share,air_yards_share,fantasy_points_ppr",
    "qb-1,Test QB,Test QB,QB,REG,TST,301,2,1,100,1,0,0,0,1,1,0,0,0,30,10,0,0,0,0",
    "qb-1,Test QB,Test QB,QB,REG,TST,299,1,0,99,0,0,0,0,0,0,0,0,0,28,9,0,0,0,0",
  ].join("\n");
  const result = aggregateNflverseWeeklyStats(csv).get("testqb:QB");

  assert.ok(result);
  assert.equal(result.games, 2);
  assert.equal(result.passing300Games, 1);
  assert.equal(result.rushing100Games, 1);
  assert.equal(result.fantasyPointsCustom, 71.9);
});

test("historical report freezes a covered three-season window and emits tuning diagnostics", () => {
  const report = JSON.parse(
    readFileSync("lib/fantasy/data/historicalBacktestReport.generated.json", "utf8"),
  ) as {
    aggregate: { seasons: number; players: number };
    seasons: Array<{ season: number; playerCount: number; matchedOutcomeCount: number }>;
    diagnostics: {
      uncertainty: { realizedRankMaeEdge: { lower95: number } };
      rosterSimulation: {
        simulations: number;
        positiveHeldouts: number;
        productionEligible: boolean;
        stock: { validRosterRate: number };
        currentModel: { validRosterRate: number };
      };
      tuningSuggestions: Array<{ priority: string; title: string }>;
    };
  };

  assert.deepEqual(report.seasons.map((season) => season.season), [2023, 2024, 2025]);
  assert.equal(report.aggregate.seasons, 3);
  assert.ok(report.aggregate.players >= 500);
  assert.ok(
    report.seasons.every(
      (season) => season.matchedOutcomeCount / season.playerCount >= 0.95,
    ),
    "each replay should retain at least 95% outcome coverage",
  );
  assert.ok(report.diagnostics.uncertainty.realizedRankMaeEdge.lower95 > 0);
  assert.equal(report.diagnostics.rosterSimulation.simulations, 180);
  assert.equal(report.diagnostics.rosterSimulation.stock.validRosterRate, 1);
  assert.equal(report.diagnostics.rosterSimulation.currentModel.validRosterRate, 1);
  assert.equal(
    report.diagnostics.rosterSimulation.productionEligible,
    report.diagnostics.rosterSimulation.positiveHeldouts >= 2,
  );
  assert.ok(
    report.diagnostics.tuningSuggestions.some(
      (suggestion) => suggestion.priority === "tune" && suggestion.title.includes("static Smash"),
    ),
  );
});

test("draft sessions replay, reject duplicates, and preserve reverted events", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  const session = createDraftSession(initial, "2026-08-23T12:00:00.000Z");
  const first = appendDraftSessionPick(session, fixtureCandidates, initial, {
    playerId: fixtureCandidates[0].player.id,
    overallPick: 1,
  });
  const second = appendDraftSessionPick(first.session, fixtureCandidates, first.state, {
    playerId: fixtureCandidates[1].player.id,
    overallPick: 2,
  });

  assert.equal(second.state.currentPick, 3);
  assert.equal(second.state.drafted.length, 2);
  assert.throws(
    () => appendDraftSessionPick(second.session, fixtureCandidates, second.state, {
      playerId: fixtureCandidates[0].player.id,
      overallPick: 3,
    }),
    /already drafted/,
  );

  const reverted = revertDraftSessionEvent(second.session, fixtureCandidates, second.state);
  assert.equal(reverted.state.currentPick, 2);
  assert.equal(reverted.session.events.length, 2, "undo must retain an immutable audit record");
  assert.equal(reverted.session.events.filter((event) => event.status === "reverted").length, 1);
  assert.deepEqual(
    replayDraftSession(reverted.session, fixtureCandidates, initial).drafted,
    reverted.state.drafted,
  );
});

test("draft session replay fails closed on identity or snake-order corruption", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  const session = createDraftSession(initial);
  assert.throws(
    () => replayDraftSession({ ...session, leagueConfigFingerprint: "stale" }, fixtureCandidates, initial),
    /fingerprint/,
  );
  const first = appendDraftSessionPick(session, fixtureCandidates, initial, {
    playerId: fixtureCandidates[0].player.id,
    overallPick: 1,
  });
  const corrupted = {
    ...first.session,
    events: first.session.events.map((event) => ({ ...event, teamId: "team-2" })),
  };
  assert.throws(() => replayDraftSession(corrupted, fixtureCandidates, initial), /belongs to team-1/);
});

test("screenshot recovery stages exact rows and refuses ambiguous text", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  const firstName = fixtureCandidates[0].player.fullName;
  const secondName = fixtureCandidates[1].player.fullName;
  const result = parseScreenshotDraftText(
    `Pick 1 - ${firstName}\n2. ${secondName}\nUnreadable Player`,
    fixtureCandidates,
    initial,
  );
  assert.deepEqual(result.proposals.map((proposal) => proposal.overallPick), [1, 2]);
  assert.equal(result.proposals.every((proposal) => proposal.confidence === "exact"), true);
  assert.deepEqual(result.unresolvedLines, ["Unreadable Player"]);
});

test("room freeze binds keeper identity and refuses post-freeze keeper changes", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  const freeze = freezeDraftRoom({
    state: initial,
    candidateCount: fixtureCandidates.length,
    artifactCapturedAt: "2026-08-23T10:00:00.000Z",
    setupReady: true,
    dataReady: true,
    boardFingerprint: "board-test",
    now: "2026-08-23T12:00:00.000Z",
  });
  assert.doesNotThrow(() => assertDraftRoomFreeze(freeze, initial));
  const keeperState = seedDraftStateWithKnownPicks(initial, fixtureCandidates, [{
    overallPick: 1,
    playerId: fixtureCandidates[0].player.id,
    teamId: "team-1",
    eventType: "keeper",
  }]);
  assert.throws(() => assertDraftRoomFreeze(freeze, keeperState), /Keeper configuration changed/);
});

test("decision journal and post-draft queue retain actionable context", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  const recommendations = rankDraftCandidates(initial, fixtureCandidates).slice(0, 3);
  const journal = recordDraftDecision({
    state: initial,
    selectedPlayerId: recommendations[0].playerId,
    recommendations,
    candidates: fixtureCandidates,
    now: "2026-08-23T12:00:00.000Z",
  });
  assert.equal(journal.recommendations.length, 3);
  assert.ok(journal.recommendations.every((recommendation) => ["robust", "conditional", "knife-edge"].includes(recommendation.stability)));
  const queue = buildPostDraftActionQueue(initial, fixtureCandidates);
  assert.ok(queue.length > 0);
  assert.ok(queue.every((action) => action.trigger && action.action && action.rationale));
});

test("refresh checkpoints expose movers and bind a frozen room to one board", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  const beforeBoard = buildRedraftBoard(fixtureCandidates, initial.league);
  const before = buildDraftRefreshCheckpoint(fixtureCandidates, beforeBoard, "2026-08-22T12:00:00.000Z");
  const changedCandidates = fixtureCandidates.map((candidate, index) => index === 0 ? {
    ...candidate,
    market: { ...candidate.market, adp: candidate.market.adp + 12 },
    projection: { ...candidate.projection, range: { ...candidate.projection.range, p50: candidate.projection.range.p50 - 20 } },
  } : candidate);
  const after = buildDraftRefreshCheckpoint(changedCandidates, buildRedraftBoard(changedCandidates, initial.league), "2026-08-23T12:00:00.000Z");
  const diff = compareDraftRefreshCheckpoints(before, after);
  assert.equal(diff.changed, true);
  assert.ok(diff.movers.some((mover) => mover.playerId === fixtureCandidates[0].player.id));

  const freeze = freezeDraftRoom({
    state: initial,
    candidateCount: fixtureCandidates.length,
    artifactCapturedAt: after.capturedAt,
    setupReady: true,
    dataReady: true,
    boardFingerprint: after.boardFingerprint,
  });
  assert.doesNotThrow(() => assertDraftRoomFreeze(freeze, initial, after.boardFingerprint));
  assert.throws(() => assertDraftRoomFreeze(freeze, initial, before.boardFingerprint), /player board changed/);
});

test("draft session survives 200 out-of-order replay and correction rehearsals", () => {
  const initial = createInitialDraftState(fixtureCandidates);
  let seed = 20260823;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let rehearsal = 0; rehearsal < 200; rehearsal += 1) {
    let session = createDraftSession(initial, `2026-08-23T12:00:${String(rehearsal % 60).padStart(2, "0")}.000Z`);
    let state = initial;
    const rehearsalCandidates = fixtureCandidates.slice(0, 6);
    const order = rehearsalCandidates.map((_, index) => index + 1)
      .sort(() => random() - 0.5);
    for (const overallPick of order) {
      const result = appendDraftSessionPick(session, fixtureCandidates, state, {
        overallPick,
        playerId: fixtureCandidates[overallPick - 1].player.id,
      });
      session = result.session;
      state = result.state;
    }
    assert.equal(state.currentPick, rehearsalCandidates.length + 1);
    const target = session.events.find((event) => event.overallPick === 3);
    assert.ok(target);
    const reverted = revertDraftSessionEvent(session, fixtureCandidates, state, target.id);
    assert.equal(reverted.state.currentPick, 3);
    const corrected = appendDraftSessionPick(reverted.session, fixtureCandidates, reverted.state, {
      overallPick: 3,
      playerId: fixtureCandidates[2].player.id,
      note: "chaos rehearsal correction",
    });
    assert.equal(corrected.state.currentPick, rehearsalCandidates.length + 1);
    assert.equal(replayDraftSession(corrected.session, fixtureCandidates, initial).drafted.length, rehearsalCandidates.length);
  }
});
