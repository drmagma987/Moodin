import { fixtureCandidates, fixtureRefreshSignals } from "@/lib/fantasy/fixtures";
import { buildRedraftBoard } from "@/lib/fantasy/draft";
import {
  createInitialDraftState,
  seedDraftStateWithKnownPicks,
} from "@/lib/fantasy/draftState";
import { buildDraftMorningPack } from "@/lib/fantasy/draftMorning";
import { buildMarketDisagreementBoard } from "@/lib/fantasy/marketDisagreement";
import { buildContextImpactBoard } from "@/lib/fantasy/contextImpact";
import { buildDraftStressTestBoard } from "@/lib/fantasy/draftStressTest";
import { fetchFantasyProsProjectionCandidates, isFantasyProsConfigError } from "@/lib/fantasy/fantasypros";
import { fetchFantasyProsPublicDraftCandidates } from "@/lib/fantasy/fantasyprosPublic";
import {
  applyFantasyProsPublicProjections,
  fetchFantasyProsPublicProjections,
} from "@/lib/fantasy/fantasyprosPublicProjections";
import {
  applyFantasyFootballCalculatorAdp,
  fetchFantasyFootballCalculatorAdp,
} from "@/lib/fantasy/fantasyFootballCalculator";
import {
  assessDraftDataQuality,
  type DraftDataQualitySnapshot,
} from "@/lib/fantasy/draftDataQuality";
import { activeNflSeasonForDate, fetchSeasonAwareEvidence } from "@/lib/fantasy/seasonEvidence";
import {
  applyPreferredTargets,
  parseApprovedPreferredTargetsFromEnv,
} from "@/lib/fantasy/preferredTargets";
import { readManualRefreshSignalsFromEnv } from "@/lib/fantasy/refreshFeed";
import { applyRefreshSignals } from "@/lib/fantasy/refresh";
import { scoreStatProjection, yahooLeagueConfig } from "@/lib/fantasy/scoring";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "@/lib/fantasy/leagueSourceOfTruth";
import { calibrateDraftCandidates } from "@/lib/fantasy/projectionCalibration";
import { fetchSleeperMarketSignals } from "@/lib/fantasy/sleeper";
import { applyPlayerContexts, removeQualitativeContexts } from "@/lib/fantasy/playerContext";
import { qualitativeContextSnapshotMeta } from "@/lib/fantasy/qualitativeContext";
import {
  applySeasonMarketToCandidates,
  fetchSeasonMarketFeed,
} from "@/lib/fantasy/seasonMarket";
import { applyYahooBaselineToDraftCandidates, yahooCurrentPprBaselineMeta } from "@/lib/fantasy/yahooRanks";
import {
  applyAdvancedResearchSnapshots,
  buildAutomaticAdvancedResearchInputs,
  mergeAdvancedResearchInputs,
  readAdvancedResearchInputsFromEnv,
} from "@/lib/fantasy/advancedResearch";
import {
  enrichCandidatesWithNflverseProfiles,
  fetchNflversePlayerProfiles,
} from "@/lib/fantasy/nflversePlayers";
import { collegeResearchInputs, collegeResearchMeta } from "@/lib/fantasy/collegeResearch";
import { advancedUsageValidation } from "@/lib/fantasy/data/advancedUsageValidation.generated";
import { rookieWrValidation } from "@/lib/fantasy/data/rookieWrValidation.generated";
import { applyValidatedRookieWrModel } from "@/lib/fantasy/rookieWrModel";
import {
  applyVegasPropsToCandidates,
  fetchVegasPlayerProps,
  OddsApiConfigError,
} from "@/lib/fantasy/vegasProps";
import type {
  DraftBoardMode,
  DraftBoardMovementEntry,
  DraftBoardSnapshotPlan,
  DraftCandidate,
  DraftMorningPack,
  MarketDisagreementBoard,
  ContextImpactBoard,
  DraftStressTestBoard,
  RefreshDigest,
  DraftState,
} from "@/lib/fantasy/types";

export type DraftLabSourceStatus = {
  provider: "fantasypros" | "fantasy-football-calculator" | "nflverse" | "sportsdataverse" | "sleeper" | "manual" | "yahoo-editorial" | "the-odds-api" | "win-with-odds";
  mode: "live" | "fixture" | "supplemental" | "unavailable";
  checkedAt: string;
  message: string;
};

export type DraftLabDataset = {
  modelVersion: string;
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  warRoomReady: boolean;
  warRoomBlockers: string[];
  candidates: DraftCandidate[];
  draftState: DraftState;
  sourceStatus: DraftLabSourceStatus;
  sourceBreakdown: DraftLabSourceStatus[];
  dataQuality: DraftDataQualitySnapshot;
  scenarioNotes: string[];
  boardPlan: DraftBoardSnapshotPlan;
  movementLog: DraftBoardMovementEntry[];
  refreshDigest: RefreshDigest;
  draftMorningPack: DraftMorningPack | null;
  marketDisagreementBoard: MarketDisagreementBoard;
  contextImpactBoard: ContextImpactBoard;
  draftStressTestBoard: DraftStressTestBoard;
};

type PrimaryDraftSourceResult = {
  candidates: DraftCandidate[];
  sourceStatus: DraftLabSourceStatus;
  sourceBreakdown: DraftLabSourceStatus[];
  scenarioNotes: string[];
  dataQuality: DraftDataQualitySnapshot;
};

function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds / 1000}s.`)), milliseconds);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

const PERSONAL_DRAFT_SLOT = leagueSourceOfTruth.draft.mySlot;
const PERSONAL_TEAM_ID = `team-${PERSONAL_DRAFT_SLOT}`;
const PERSONAL_KEEPER_NAMES = [...leagueSourceOfTruth.keepers.myDeclaredPlayers];
const RELEASED_ROSTER_ANCHORS = [...leagueSourceOfTruth.departedTeams.releasedRosterAnchors];
const ROSTER_CONSTRUCTION_MODEL_VERSION = "2026.08-positional-leverage-v1";

function personalPickForRound(round: number) {
  const pickInRound = round % 2 === 1
    ? PERSONAL_DRAFT_SLOT
    : yahooLeagueConfig.teams - PERSONAL_DRAFT_SLOT + 1;
  return (round - 1) * yahooLeagueConfig.teams + pickInRound;
}

export function getBoardPlan(mode: DraftBoardMode): DraftBoardSnapshotPlan {
  switch (mode) {
    case "draft-week":
      return {
        mode,
        title: "Draft-Week Board",
        badge: "Refresh Heavier",
        summary:
          "This stage is for the final major recalibration window, where injuries, camp role changes, and market movement should meaningfully reshape tiers.",
        goal:
          "Pressure-test the board against the most realistic pre-draft environment without locking it too early.",
        refreshPolicy:
          "Run a full source refresh in the final 5 to 7 days before the draft, then inspect meaningful movers rather than every small headline.",
        locked: false,
        focus: "structural",
        steps: [
          {
            label: "Full refresh",
            timing: "5-7 days before draft",
            summary:
              "Rebuild projections, market data, injuries, and momentum in one pass so tiers reflect the current room.",
          },
          {
            label: "Mover review",
            timing: "same day",
            summary:
              "Review names whose confidence, role prior, or outlier tag changed enough to alter draft decisions.",
          },
          {
            label: "Scenario pass",
            timing: "draft week",
            summary:
              "Pressure-test your slot and keeper build against likely runs before the board is frozen.",
          },
        ],
      };
    case "final":
      return {
        mode,
        title: "Final Board",
        badge: "Lock Before Draft",
        summary:
          "This is the version you actually draft from: one last refresh, one last delta review, then freeze the board.",
        goal:
          "Minimize last-minute noise while still catching real injury, role, or ADP shocks right before the draft.",
        refreshPolicy:
          "Run a final full rebuild in the last 24 hours, then do one short delta check 1 to 3 hours before draft time.",
        locked: true,
        focus: "balanced",
        steps: [
          {
            label: "Final rebuild",
            timing: "within 24 hours",
            summary:
              "Refresh every core source and generate the final draftable ranking set and contingency map.",
          },
          {
            label: "Delta check",
            timing: "1-3 hours before draft",
            summary:
              "Only apply meaningful changes such as injuries, surprise role shifts, holdouts, and dramatic ADP movement.",
          },
          {
            label: "Freeze board",
            timing: "draft day",
            summary:
              "Lock the board and rely on the prebuilt pivots instead of constantly reinterpreting every headline.",
          },
        ],
      };
    case "working":
    default:
      return {
        mode: "working",
        title: "Working Board",
        badge: "Stable For Testing",
        summary:
          "This stage is for logic tuning, tier shaping, and pressure testing without chasing every single camp update.",
        goal:
          "Improve the board engine and slot-specific strategy before the final refresh window begins.",
        refreshPolicy:
          "Refresh lightly between now and draft week so strategy testing stays stable while still allowing occasional logic checks.",
        locked: false,
        focus: "balanced",
        steps: [
          {
            label: "Light refreshes",
            timing: "between now and draft week",
            summary:
              "Refresh selectively to test board logic, not to react to every small piece of camp noise.",
          },
          {
            label: "Pressure testing",
            timing: "ongoing",
            summary:
              "Run slot, keeper, and tier-break scenarios to identify where the board still feels fragile.",
          },
          {
            label: "Promotion gate",
            timing: "before draft week",
            summary:
              "Move to draft-week mode once the logic feels stable enough that only real news should cause big changes.",
          },
        ],
      };
  }
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildPersonalizedDraftState(
  candidates: DraftCandidate[],
  options: { strictPersonalKeepers?: boolean } = {},
) {
  const initialState = createInitialDraftState(candidates, {
    currentPick: 1,
    myTeamId: PERSONAL_TEAM_ID,
  });
  const keeperPicks = PERSONAL_KEEPER_NAMES.map((_, index) => personalPickForRound(index + 1));
  const seededKeepers = PERSONAL_KEEPER_NAMES.map((name, index) => {
    const candidate = candidates.find(
      (item) => normalizeName(item.player.fullName) === normalizeName(name),
    );
    if (!candidate) {
      return null;
    }

    return {
      overallPick: keeperPicks[index] ?? 13 + index,
      playerId: candidate.player.id,
      teamId: PERSONAL_TEAM_ID,
      source: "manual" as const,
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (
    options.strictPersonalKeepers !== false &&
    seededKeepers.length !== PERSONAL_KEEPER_NAMES.length
  ) {
    const matchedIds = new Set(seededKeepers.map((keeper) => keeper.playerId));
    const missing = PERSONAL_KEEPER_NAMES.filter((name) => {
      const candidate = candidates.find(
        (item) => normalizeName(item.player.fullName) === normalizeName(name),
      );
      return !candidate || !matchedIds.has(candidate.player.id);
    });
    throw new Error(
      `War-room initialization refused: canonical keeper${missing.length === 1 ? "" : "s"} ${missing.join(" and ")} missing from the live candidate pool.`,
    );
  }

  return seedDraftStateWithKnownPicks(initialState, candidates, seededKeepers, {
    // Picks 1-34 are not known merely because our first selectable turn is 35.
    // Start at Pick 1 so availability and opponent rosters cannot be fabricated.
    currentPick: 1,
  });
}

function buildDraftState(
  candidates: DraftCandidate[],
  boardPlan: DraftBoardSnapshotPlan,
  options: { strictPersonalKeepers?: boolean } = {},
): DraftState {
  const baseState = buildPersonalizedDraftState(candidates, options);
  return {
    ...baseState,
    focus: boardPlan.focus,
  };
}

function buildMovementLog(candidates: DraftCandidate[]): DraftBoardMovementEntry[] {
  const redraftBoardById = new Map(
    buildRedraftBoard(candidates, yahooLeagueConfig).map((entry) => [entry.playerId, entry] as const),
  );

  return candidates
    .map((candidate) => {
      const redraftBoardEntry = redraftBoardById.get(candidate.player.id);
      if (!redraftBoardEntry) {
        return null;
      }

      const position = candidate.player.positions[0] ?? "WR";
      const exactScore = scoreStatProjection(candidate.projection.stats, yahooLeagueConfig.scoring);
      const calibratedDelta = Number((candidate.projection.range.p50 - exactScore).toFixed(2));
      const marketRank = redraftBoardEntry.marketRank;
      const modelRank = redraftBoardEntry.boardRank;
      const rankDelta = marketRank - modelRank;
      const movementScore = Number(
        (Math.abs(rankDelta) * 2.1 + Math.abs(calibratedDelta) * 0.12).toFixed(2),
      );
      const direction = rankDelta >= 0 ? "up" : "down";
      const reasons: string[] = [];

      if (Math.abs(calibratedDelta) >= 4) {
        reasons.push(
          `${calibratedDelta > 0 ? "Calibrated median raised" : "Calibrated median lowered"} by ${Math.abs(calibratedDelta).toFixed(1)} points.`,
        );
      }
      if (candidate.signals?.opportunityLabel && candidate.signals.opportunityLabel !== "No prior") {
        reasons.push(`${candidate.signals.opportunityLabel} from nflverse role prior.`);
      }
      if (candidate.signals?.sleeperTrend && candidate.signals.sleeperTrend !== "steady") {
        reasons.push(
          `Sleeper trend is ${candidate.signals.sleeperTrend}, adding market momentum context.`,
        );
      }
      if (
        candidate.signals?.outlierTag &&
        candidate.signals.outlierTag !== "aligned"
      ) {
        reasons.push(
          candidate.signals.outlierTag === "projection-over-market"
            ? "Model is more aggressive than consensus market pricing."
            : candidate.signals.outlierTag === "market-over-projection"
              ? "Consensus market is stronger than the projection stack."
              : "Role fragility is capping confidence despite draft cost.",
        );
      }
      reasons.push(
        `${position} is valued against the first projected non-starter after required lineup and flex spots are allocated from this board.`,
      );
      reasons.push(
        `Next-round positional leverage contributes ${redraftBoardEntry.positionalLeverage.score.toFixed(1)} board points from a ${redraftBoardEntry.positionalLeverage.medianTierEdge.toFixed(1)}-point median tier edge.`,
      );

      const headline =
        direction === "up"
          ? `${candidate.player.fullName} is climbing versus standard market rank`
          : `${candidate.player.fullName} is cooling once the board accounts for redraft utility`;

      return {
        playerId: candidate.player.id,
        direction,
        movementScore,
        marketRank,
        modelRank,
        calibratedDelta,
        headline,
        reasons,
      } satisfies DraftBoardMovementEntry;
    })
    .filter((entry): entry is DraftBoardMovementEntry => entry !== null)
    .filter((entry) => entry.marketRank !== entry.modelRank || Math.abs(entry.calibratedDelta) >= 4)
    .sort((a, b) => b.movementScore - a.movementScore)
    .slice(0, 8);
}

function buildDraftMorningPackForMode(
  mode: DraftBoardMode,
  candidates: DraftCandidate[],
  draftState: DraftState,
  refreshDigest: RefreshDigest,
  movementLog: DraftBoardMovementEntry[],
) {
  if (mode !== "final") {
    return null;
  }

  return buildDraftMorningPack({
    candidates,
    draftState,
    refreshDigest,
    movementLog,
    generatedAt: new Date().toISOString(),
  });
}

function normalizePlayerName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function overlayPrivateFantasyProsProjections(
  baseCandidates: DraftCandidate[],
  privateCandidates: Array<Pick<DraftCandidate, "player" | "projection">>,
) {
  const privateById = new Map(
    privateCandidates
      .filter((candidate) => candidate.player.externalIds.fantasyPros)
      .map((candidate) => [candidate.player.externalIds.fantasyPros!, candidate] as const),
  );
  const privateByName = new Map(
    privateCandidates.map((candidate) => [normalizePlayerName(candidate.player.fullName), candidate] as const),
  );
  let appliedCount = 0;

  const candidates = baseCandidates.map((candidate) => {
    const privateCandidate =
      (candidate.player.externalIds.fantasyPros
        ? privateById.get(candidate.player.externalIds.fantasyPros)
        : undefined) ?? privateByName.get(normalizePlayerName(candidate.player.fullName));
    if (!privateCandidate) return candidate;

    const exactYahooPoints = scoreStatProjection(
      privateCandidate.projection.stats,
      yahooLeagueConfig.scoring,
    );
    if (!Number.isFinite(exactYahooPoints) || exactYahooPoints <= 0) return candidate;

    appliedCount += 1;
    const downsideSpread = Math.max(
      18,
      privateCandidate.projection.range.p50 - privateCandidate.projection.range.p10,
    );
    const upsideSpread = Math.max(
      18,
      privateCandidate.projection.range.p90 - privateCandidate.projection.range.p50,
    );
    return {
      ...candidate,
      projection: {
        ...privateCandidate.projection,
        scoringType: "YAHOO-CUSTOM",
        range: {
          p10: Number(Math.max(0, exactYahooPoints - downsideSpread).toFixed(2)),
          p50: exactYahooPoints,
          p90: Number((exactYahooPoints + upsideSpread).toFixed(2)),
        },
      },
    } satisfies DraftCandidate;
  });

  return { candidates, appliedCount };
}

async function loadPrimaryDraftSource(): Promise<PrimaryDraftSourceResult> {
  const [publicResult, publicProjectionResult, adpResult, privateResult] = await Promise.allSettled([
    withTimeout(fetchFantasyProsPublicDraftCandidates(), 12_000, "FantasyPros public rankings"),
    withTimeout(fetchFantasyProsPublicProjections(), 8_000, "FantasyPros public projections"),
    withTimeout(fetchFantasyFootballCalculatorAdp(), 8_000, "Fantasy Football Calculator ADP"),
    withTimeout(fetchFantasyProsProjectionCandidates(), 5_000, "FantasyPros private projections"),
  ]);

  if (publicResult.status === "rejected") {
    throw new Error(
      `Full public FantasyPros PPR rankings failed: ${
        publicResult.reason instanceof Error ? publicResult.reason.message : "unknown error"
      }`,
    );
  }

  let candidates = publicResult.value.candidates;
  let verifiedAdpCount = publicResult.value.directAdpCount;
  const sourceBreakdown: DraftLabSourceStatus[] = [
    {
      provider: "fantasypros",
      mode: "live",
      checkedAt: new Date().toISOString(),
      message: `Loaded the complete public FantasyPros PPR consensus pool with ${candidates.length} players.`,
    },
  ];

  let publicProjectionCount = 0;
  if (publicProjectionResult.status === "fulfilled") {
    const applied = applyFantasyProsPublicProjections(candidates, publicProjectionResult.value);
    candidates = applied.candidates;
    publicProjectionCount = applied.appliedCount;
    sourceBreakdown.push({
      provider: "fantasypros",
      mode: "live",
      checkedAt: new Date().toISOString(),
      message: `Applied the current public FantasyPros PPR stat projections to ${applied.appliedCount} publicly exposed top-position rows before Yahoo custom scoring.`,
    });
  } else {
    sourceBreakdown.push({
      provider: "fantasypros",
      mode: "unavailable",
      checkedAt: new Date().toISOString(),
      message: `Full public FantasyPros projections unavailable: ${publicProjectionResult.reason instanceof Error ? publicProjectionResult.reason.message : "unknown error"}`,
    });
  }

  if (adpResult.status === "fulfilled") {
    const applied = applyFantasyFootballCalculatorAdp(candidates, adpResult.value);
    candidates = applied.candidates;
    verifiedAdpCount = applied.appliedCount;
    sourceBreakdown.push({
      provider: "fantasy-football-calculator",
      mode: "live",
      checkedAt: new Date().toISOString(),
      message: `Matched verified ${yahooLeagueConfig.teams}-team PPR ADP to ${applied.appliedCount} players from ${adpResult.value.totalDrafts} human mock drafts (${adpResult.value.startDate ?? "unknown"} through ${adpResult.value.endDate ?? "unknown"}).`,
    });
  } else {
    sourceBreakdown.push({
      provider: "fantasy-football-calculator",
      mode: "unavailable",
      checkedAt: new Date().toISOString(),
      message: `Verified overall PPR ADP unavailable: ${adpResult.reason instanceof Error ? adpResult.reason.message : "unknown error"}`,
    });
  }

  let privateProjectionCount = 0;
  if (privateResult.status === "fulfilled") {
    const overlaid = overlayPrivateFantasyProsProjections(candidates, privateResult.value);
    candidates = overlaid.candidates;
    privateProjectionCount = overlaid.appliedCount;
    sourceBreakdown.push({
      provider: "fantasypros",
      mode: privateProjectionCount > 0 ? "supplemental" : "unavailable",
      checkedAt: new Date().toISOString(),
      message: `Used the limited private FantasyPros response only as a Yahoo-scored projection overlay for ${privateProjectionCount} matched players; it did not define rankings or player-pool coverage.`,
    });
  } else {
    sourceBreakdown.push({
      provider: "fantasypros",
      mode: "unavailable",
      checkedAt: new Date().toISOString(),
      message: `Private FantasyPros projection overlay unavailable: ${privateResult.reason instanceof Error ? privateResult.reason.message : "unknown error"}`,
    });
  }

  const dataQuality = assessDraftDataQuality(candidates);
  if (dataQuality.candidateCount < 220) {
    throw new Error(`Public draft-pool coverage failed validation. ${dataQuality.summary}`);
  }

  return {
    candidates,
    dataQuality,
    sourceStatus: {
      provider: "fantasypros",
      mode: dataQuality.status === "ready" ? "live" : "unavailable",
      checkedAt: new Date().toISOString(),
      message: `${dataQuality.summary} Public projection overlays: ${publicProjectionCount}. Private overlays: ${privateProjectionCount}.`,
    },
    sourceBreakdown,
    scenarioNotes: [
      `The board skeleton comes from ${candidates.length} current public overall PPR ranks, never from a limited premium response.`,
      `${verifiedAdpCount} players currently carry verified overall ${yahooLeagueConfig.teams}-team PPR ADP; unmatched players retain an explicitly labeled rank proxy.`,
      "Private FantasyPros data may improve matched projections but cannot replace or shrink the public player universe.",
    ],
  };
}

export async function getDraftLabDataset(mode: DraftBoardMode = "working"): Promise<DraftLabDataset> {
  const boardPlan = getBoardPlan(mode);
  try {
    const [primarySource, seasonEvidence, sleeperResult, seasonMarketResult, vegasResult, playerProfilesResult] = await Promise.all([
      loadPrimaryDraftSource(),
      withTimeout(fetchSeasonAwareEvidence(), 10_000, "season evidence").catch((error) => {
        const activeSeason = activeNflSeasonForDate();
        return {
          activeSeason,
          priorSeason: activeSeason - 1,
          currentWeeks: 0,
          currentWeight: 0,
          nflverseByPlayerId: undefined,
          ffOpportunityByPlayerId: undefined,
          priorNflverseAvailable: false,
          currentNflverseAvailable: false,
          priorFfOpportunityAvailable: false,
          currentFfOpportunityAvailable: false,
          summary: "Historical usage timed out; projection/market board remains active without role priors.",
          errors: [error instanceof Error ? error.message : "season evidence unavailable"],
        };
      }),
      withTimeout(fetchSleeperMarketSignals(), 6_000, "Sleeper signals").then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      ),
      withTimeout(fetchSeasonMarketFeed(), 6_000, "season market").then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      ),
      withTimeout(fetchVegasPlayerProps(), 6_000, "Vegas props").then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      ),
      withTimeout(fetchNflversePlayerProfiles(), 6_000, "nflverse player identity").then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      ),
    ]);
    const identityEnriched = playerProfilesResult.ok
      ? enrichCandidatesWithNflverseProfiles(primarySource.candidates, playerProfilesResult.value)
      : { candidates: primarySource.candidates, appliedCount: 0 };
    const seasonMarketApplied = seasonMarketResult.ok
      ? applySeasonMarketToCandidates(
          identityEnriched.candidates,
          seasonMarketResult.value,
          yahooLeagueConfig.scoring,
        )
      : { candidates: identityEnriched.candidates, appliedCount: 0 };
    const vegasApplied = vegasResult.ok
      ? applyVegasPropsToCandidates(
          seasonMarketApplied.candidates,
          vegasResult.value,
          yahooLeagueConfig.scoring,
          {
            preseason: seasonEvidence.currentWeeks === 0,
            seasonWeek: seasonEvidence.currentWeeks,
          },
        )
      : { candidates: seasonMarketApplied.candidates, appliedCount: 0 };
    const yahooBlended = applyYahooBaselineToDraftCandidates(vegasApplied.candidates);
    const currentRookieNames = playerProfilesResult.ok
      ? playerProfilesResult.value
          .filter((profile) => profile.rookieSeason === seasonEvidence.activeSeason || profile.draftYear === seasonEvidence.activeSeason)
          .map((profile) => profile.displayName)
      : [];
    const contextApplied = applyPlayerContexts(yahooBlended.candidates, undefined, {
      rookieNames: currentRookieNames,
      sleeperPlayers: sleeperResult.ok ? sleeperResult.value.players.values() : [],
    });
    const calibrationEvidence = {
      nflverseByPlayerId: seasonEvidence.nflverseByPlayerId,
      ffOpportunityByPlayerId: seasonEvidence.ffOpportunityByPlayerId,
      sleeperTrendsByPlayerId: sleeperResult.ok ? sleeperResult.value.trends : undefined,
    };
    const baselineCandidates = calibrateDraftCandidates(
      removeQualitativeContexts(contextApplied.candidates),
      yahooLeagueConfig.scoring,
      { ...calibrationEvidence, useQualitativeContext: false },
    );
    const calibratedCandidates = calibrateDraftCandidates(
      contextApplied.candidates,
      yahooLeagueConfig.scoring,
      calibrationEvidence,
    );
    const manualRefresh = readManualRefreshSignalsFromEnv(calibratedCandidates);
    const refreshed = applyRefreshSignals(calibratedCandidates, manualRefresh.signals);
    const refreshedBaseline = applyRefreshSignals(baselineCandidates, manualRefresh.signals);
    const preferredTargetConfig = parseApprovedPreferredTargetsFromEnv();
    const preferredTargetsApplied = applyPreferredTargets(
      refreshed.candidates,
      preferredTargetConfig.targets,
    );
    const advancedResearchConfig = readAdvancedResearchInputsFromEnv();
    const automaticResearch = playerProfilesResult.ok
      ? buildAutomaticAdvancedResearchInputs({
          candidates: preferredTargetsApplied.candidates,
          playerProfiles: playerProfilesResult.value,
          nflverseStats: seasonEvidence.nflverseByPlayerId,
          activeSeason: seasonEvidence.activeSeason,
          evidenceSeason: seasonEvidence.currentWeeks > 0 ? seasonEvidence.activeSeason : seasonEvidence.priorSeason,
        })
      : { inputs: [], rookieCount: 0, qbCount: 0 };
    const automaticWithCollege = mergeAdvancedResearchInputs(
      automaticResearch.inputs,
      collegeResearchInputs,
    );
    const mergedResearchInputs = mergeAdvancedResearchInputs(
      automaticWithCollege,
      advancedResearchConfig.inputs,
    );
    const advancedResearchApplied = applyAdvancedResearchSnapshots(
      preferredTargetsApplied.candidates,
      mergedResearchInputs,
    );
    const rookieWrIntegrated = applyValidatedRookieWrModel(
      advancedResearchApplied.candidates,
      yahooLeagueConfig,
    );
    const candidates = rookieWrIntegrated.candidates;
    const baselineWithPreferredTargets = applyPreferredTargets(
      refreshedBaseline.candidates,
      preferredTargetConfig.targets,
    ).candidates;
    if (candidates.length === 0) {
      throw new Error("FantasyPros returned zero draft candidates.");
    }

    const sourceBreakdown: DraftLabSourceStatus[] = [
      ...primarySource.sourceBreakdown,
      {
        provider: "win-with-odds",
        mode: seasonMarketResult.ok && seasonMarketApplied.appliedCount > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message:
          seasonMarketResult.ok && seasonMarketApplied.appliedCount > 0
            ? `Blended the public Win With Odds 2026 Vegas-derived season projections into ${seasonMarketApplied.appliedCount} top-300 players at 25% weight (${seasonMarketResult.value.rowCount} usable source rows).`
            : `Season-long Vegas-derived projections unavailable: ${seasonMarketResult.ok ? "no top-300 players matched" : seasonMarketResult.error instanceof Error ? seasonMarketResult.error.message : "unknown error"}`,
      },
      {
        provider: "yahoo-editorial",
        mode: yahooBlended.appliedCount > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message:
          yahooBlended.appliedCount > 0
            ? `Retained Yahoo's captured top-${yahooCurrentPprBaselineMeta.coverage} list as an independent sanity check for ${yahooBlended.appliedCount} early-board players; it does not mutate ECR or ADP.`
            : "No Yahoo v0 baseline players matched the current candidate pool.",
      },
      {
        provider: "nflverse",
        mode: seasonEvidence.nflverseByPlayerId ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: seasonEvidence.nflverseByPlayerId
          ? `Applied season-aware nflverse role priors. ${seasonEvidence.summary} Held-out 2025 advanced-usage MAE improved ${advancedUsageValidation.reports.map((report) => `${report.position} ${(report.maeImprovement * 100).toFixed(1)}%`).join(", ")} versus a prior-PPG baseline; this validates the bounded usage layer, not the separately gated rookie/QB research lanes.`
          : `nflverse role priors unavailable: ${seasonEvidence.errors.join("; ")}`,
      },
      {
        provider: "sportsdataverse",
        mode: collegeResearchInputs.length > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: collegeResearchInputs.length > 0
          ? `Attached ${collegeResearchMeta.recordCount} keyless SportsDataverse college-production profiles from ${collegeResearchMeta.evidenceSeasons.join("-")} with no recency weighting; unmatched records remain inert.`
          : `College-production snapshot unavailable.${collegeResearchMeta.errors.length > 0 ? ` ${collegeResearchMeta.errors.join(" ")}` : ""}`,
      },
      {
        provider: "nflverse",
        mode: seasonEvidence.ffOpportunityByPlayerId ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: seasonEvidence.ffOpportunityByPlayerId
          ? `Applied season-aware ffopportunity expected points and weekly consistency to ${seasonEvidence.ffOpportunityByPlayerId.size} player priors. ${seasonEvidence.summary}`
          : `ffopportunity prior unavailable: ${seasonEvidence.errors.join("; ")}`,
      },
      {
        provider: "the-odds-api",
        mode: vegasResult.ok ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: vegasResult.ok
          ? `Applied quota-aware consensus player props to ${vegasApplied.appliedCount} players across ${vegasResult.value.eventCount} NFL events (${vegasResult.value.markets.length} requested markets; ${vegasResult.value.quotaRemaining ?? "unknown"} credits remaining).`
          : vegasResult.error instanceof OddsApiConfigError
            ? "Set THE_ODDS_API_KEY to enable weekly Vegas player-prop calibration."
            : `Vegas player props unavailable: ${vegasResult.error instanceof Error ? vegasResult.error.message : "unknown error"}`,
      },
      {
        provider: "sleeper",
        mode: sleeperResult.ok ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: sleeperResult.ok
          ? `Applied Sleeper market activity signals from active player metadata and trending adds/drops.`
          : `Sleeper market signals unavailable: ${
              sleeperResult.error instanceof Error
                ? sleeperResult.error.message
                : "unknown error"
            }`,
      },
      {
        provider: "fantasypros",
        mode: manualRefresh.signals.length > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message:
          manualRefresh.signals.length > 0
            ? `Applied ${manualRefresh.signals.length} locally supplied refresh signals through FANTASY_REFRESH_SIGNALS_JSON.`
            : "No local manual refresh signals supplied.",
      },
      {
        provider: "manual",
        mode:
          preferredTargetConfig.targets.length > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message:
          preferredTargetConfig.targets.length > 0
            ? `Applied ${preferredTargetConfig.targets.length} approved preferred-target tag${
                preferredTargetConfig.targets.length === 1 ? "" : "s"
              } through FANTASY_PREFERRED_TARGETS_JSON.`
            : "No approved preferred-target tags supplied.",
      },
      {
        provider: "sportsdataverse",
        mode: rookieWrIntegrated.activationEligible ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: rookieWrIntegrated.activationEligible
          ? `Rookie-WR validation cleared its production gate across ${rookieWrValidation.samples} forward holdout seasons; mode ${rookieWrIntegrated.mode} applied to ${rookieWrIntegrated.appliedCount} players.`
          : `Rookie-WR production adjustment remains blocked after ${rookieWrValidation.samples} forward holdout player-seasons: ${rookieWrValidation.blockers.join(" ")}`,
      },
      {
        provider: "nflverse",
        mode: playerProfilesResult.ok ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: playerProfilesResult.ok
          ? `Matched ${identityEnriched.appliedCount} canonical nflverse IDs, ${automaticResearch.rookieCount} current rookies, and ${automaticResearch.qbCount} quarterback research profiles without changing rookie flags.`
          : `nflverse player identity unavailable: ${playerProfilesResult.error instanceof Error ? playerProfilesResult.error.message : "unknown error"}`,
      },
      {
        provider: "manual",
        mode: advancedResearchApplied.appliedCount > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message: advancedResearchApplied.appliedCount > 0
          ? `Attached ${advancedResearchApplied.appliedCount} research-only QB/rookie profile${advancedResearchApplied.appliedCount === 1 ? "" : "s"}; these have zero projection or ranking impact.${advancedResearchConfig.errors.length > 0 ? ` ${advancedResearchConfig.errors.join(" ")}` : ""}`
          : `No valid research-only QB/rookie records supplied through FANTASY_ADVANCED_RESEARCH_JSON.${advancedResearchConfig.errors.length > 0 ? ` ${advancedResearchConfig.errors.join(" ")}` : ""}`,
      },
      {
        provider: "manual",
        mode: contextApplied.reviewedCount + contextApplied.importedCount + contextApplied.qualitativeCount > 0 ? "supplemental" : "unavailable",
        checkedAt: new Date().toISOString(),
        message:
          contextApplied.reviewedCount + contextApplied.importedCount + contextApplied.qualitativeCount > 0
            ? `Applied ${contextApplied.reviewedCount} manager-reviewed, ${contextApplied.importedCount} imported, and ${contextApplied.qualitativeCount} source-backed player-context record${contextApplied.reviewedCount + contextApplied.importedCount + contextApplied.qualitativeCount === 1 ? "" : "s"}.`
            : "No reviewed player-context records matched the current board.",
      },
    ];

    const draftState = buildDraftState(candidates, boardPlan);
    const movementLog = buildMovementLog(candidates);
    const marketDisagreementBoard = buildMarketDisagreementBoard(candidates, yahooLeagueConfig);
    const contextImpactBoard = buildContextImpactBoard(
      baselineWithPreferredTargets,
      candidates,
      yahooLeagueConfig,
      { excludePlayerNames: PERSONAL_KEEPER_NAMES },
    );
    // The command center does not render the full stress-test artifact. Keep the
    // request-time diagnostic bounded; the 300-room audit runs in verification.
    const draftStressTestBoard = buildDraftStressTestBoard(candidates, draftState, {
      simulations: 60,
      trackedPlayerLimit: 120,
    });

    return {
      modelVersion: ROSTER_CONSTRUCTION_MODEL_VERSION,
      leagueConfigVersion: leagueSourceOfTruth.version,
      leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
      warRoomReady: true,
      warRoomBlockers: [],
      candidates,
      draftState,
      dataQuality: primarySource.dataQuality,
      sourceStatus: {
        ...primarySource.sourceStatus,
        message: `${primarySource.sourceStatus.message} Board mode: ${boardPlan.title}.`,
      },
      sourceBreakdown,
      scenarioNotes: [
        `Roster-construction model ${ROSTER_CONSTRUCTION_MODEL_VERSION} is active.`,
        `Personalized to a second-last snake slot assumption: ${PERSONAL_TEAM_ID} in a ${yahooLeagueConfig.teams}-team room.`,
        `Seeded with ${PERSONAL_KEEPER_NAMES.length} declared keeper${PERSONAL_KEEPER_NAMES.length === 1 ? "" : "s"} already consumed on your roster: ${PERSONAL_KEEPER_NAMES.join(" and ")}.`,
        `The room starts at Pick 1 until actual picks are recorded or recovered; your first selectable turn is overall Pick ${personalPickForRound(3)} after keeper costs.`,
        `${RELEASED_ROSTER_ANCHORS.join(" and ")} anchor the two departed rosters; their players remain in the draft pool unless a retained team explicitly declares one as a keeper.`,
        "League-wide opponent keepers are still unknown, so your roster context is sharper than the room-wide keeper context for now.",
        "Managers may keep 0-3 players. Unused keeper slots become live picks, so the model treats unknown slots as conservative market/need selections until actual keeper identities are supplied.",
        "Positional premiums are projection-derived: replacement value, flex access, next-round tier separation, downside protection, VONA, and conditional legal-lineup scoring all contribute; no player receives an automatic elite-TE or elite-QB bonus.",
        yahooBlended.appliedCount > 0
          ? `Yahoo v0 comparison baseline is active for ${yahooBlended.appliedCount} players from the captured top-${yahooCurrentPprBaselineMeta.coverage} early-board list.`
          : "Yahoo v0 comparison baseline was not applied because no current candidates matched the captured Yahoo top-25 early-board list.",
        seasonMarketApplied.appliedCount > 0
          ? `Season-long Vegas-derived stat projections are active for ${seasonMarketApplied.appliedCount} players at a conservative 25% weight; deeper source rows are excluded from the blend.`
          : "Season-long Vegas-derived projections were unavailable, so the board retained its existing projection stack.",
        `The one-time qualitative snapshot covers ${qualitativeContextSnapshotMeta.playerCount} players (${qualitativeContextSnapshotMeta.multiSourcePlayerCount} multi-source) as of ${qualitativeContextSnapshotMeta.capturedAt.slice(0, 10)}; ${contextApplied.qualitativeCount} source-backed records matched this board.`,
        ...primarySource.scenarioNotes,
        ...(manualRefresh.signals.length > 0
          ? [
              `Manual refresh import is active with ${manualRefresh.signals.length} signal${
                manualRefresh.signals.length === 1 ? "" : "s"
              }, so this board includes your local draft-week overrides.`,
            ]
          : []),
        ...(preferredTargetConfig.targets.length > 0
          ? [
              `Approved preferred-target overlay is active with ${preferredTargetConfig.targets.length} tag${
                preferredTargetConfig.targets.length === 1 ? "" : "s"
              }, kept separate from the recommendation engine.`,
            ]
          : []),
        ...(advancedResearchApplied.appliedCount > 0
          ? [rookieWrIntegrated.appliedCount > 0
              ? `Validated rookie-WR research is active for ${rookieWrIntegrated.appliedCount} players; all other advanced research lanes remain shadow-only.`
              : `Advanced QB/rookie research is visible for ${advancedResearchApplied.appliedCount} players but remains excluded from production ranks. Rookie-WR validation covered ${rookieWrValidation.samples} forward holdout player-seasons and failed closed.`]
          : []),
      ],
      boardPlan,
      movementLog,
      marketDisagreementBoard,
      contextImpactBoard,
      draftStressTestBoard,
      refreshDigest: refreshed.digest,
      draftMorningPack: buildDraftMorningPackForMode(
        mode,
        candidates,
        draftState,
        refreshed.digest,
        movementLog,
      ),
    };
  } catch (error) {
    const fallbackReason = isFantasyProsConfigError(error)
      ? "Set FANTASYPROS_API_KEY to enable the private FantasyPros path; public fallback also failed, so the board dropped to fixtures."
      : `Using fixtures because both FantasyPros live paths failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`;

    if (mode === "final") {
      throw new Error(
        `War-room final mode refused fixture fallback under ${leagueSourceOfTruth.version} (${leagueSourceOfTruthFingerprint}). ${fallbackReason}`,
      );
    }

    const fixtureContexts = applyPlayerContexts(fixtureCandidates, []);
    const calibratedFixtureBaseline = calibrateDraftCandidates(
      removeQualitativeContexts(fixtureContexts.candidates),
      yahooLeagueConfig.scoring,
      { useQualitativeContext: false },
    );
    const calibratedFixtureBase = calibrateDraftCandidates(
      fixtureContexts.candidates,
      yahooLeagueConfig.scoring,
    );
    const manualRefresh = readManualRefreshSignalsFromEnv(calibratedFixtureBase);
    const refreshedFixtures = applyRefreshSignals(calibratedFixtureBase, [
      ...fixtureRefreshSignals,
      ...manualRefresh.signals,
    ]);
    const refreshedFixtureBaseline = applyRefreshSignals(calibratedFixtureBaseline, [
      ...fixtureRefreshSignals,
      ...manualRefresh.signals,
    ]);
    const preferredTargetConfig = parseApprovedPreferredTargetsFromEnv();
    const calibratedFixtures = applyPreferredTargets(
      refreshedFixtures.candidates,
      preferredTargetConfig.targets,
    );
    const advancedResearchConfig = readAdvancedResearchInputsFromEnv();
    const advancedResearchFixtures = applyAdvancedResearchSnapshots(
      calibratedFixtures.candidates,
      advancedResearchConfig.inputs,
    );
    const rookieWrFixtureIntegration = applyValidatedRookieWrModel(
      advancedResearchFixtures.candidates,
      yahooLeagueConfig,
    );
    const baselineFixtures = applyPreferredTargets(
      refreshedFixtureBaseline.candidates,
      preferredTargetConfig.targets,
    ).candidates;

    const draftState = buildDraftState(rookieWrFixtureIntegration.candidates, boardPlan, {
      strictPersonalKeepers: false,
    });
    const movementLog = buildMovementLog(rookieWrFixtureIntegration.candidates);
    const marketDisagreementBoard = buildMarketDisagreementBoard(
      rookieWrFixtureIntegration.candidates,
      yahooLeagueConfig,
    );
    const contextImpactBoard = buildContextImpactBoard(
      baselineFixtures,
      rookieWrFixtureIntegration.candidates,
      yahooLeagueConfig,
    );
    const draftStressTestBoard = buildDraftStressTestBoard(
      rookieWrFixtureIntegration.candidates,
      draftState,
      { simulations: 80 },
    );

    return {
      modelVersion: ROSTER_CONSTRUCTION_MODEL_VERSION,
      leagueConfigVersion: leagueSourceOfTruth.version,
      leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
      warRoomReady: false,
      warRoomBlockers: [
        "Live draft sources are unavailable, so fixture data cannot be used for real-time draft decisions.",
        "Canonical personal keepers are not guaranteed to exist in the tiny fixture candidate pool.",
      ],
      candidates: rookieWrFixtureIntegration.candidates,
      draftState,
      dataQuality: assessDraftDataQuality(rookieWrFixtureIntegration.candidates),
      sourceStatus: {
        provider: "fantasypros",
        mode: "fixture",
        checkedAt: new Date().toISOString(),
        message: fallbackReason,
      },
      sourceBreakdown: [
        {
          provider: "fantasypros",
          mode: "fixture",
          checkedAt: new Date().toISOString(),
          message: fallbackReason,
        },
      ],
      scenarioNotes: [
        `Roster-construction model ${ROSTER_CONSTRUCTION_MODEL_VERSION} is active in diagnostic fallback mode.`,
        "The board fell back to fixtures because the live FantasyPros request was unavailable.",
        `Your ${yahooLeagueConfig.teams}-team second-last slot assumption is still applied in fallback mode.`,
        "Your named keepers are not present in the tiny fixture pool, so fallback cannot fully mirror the live keeper board.",
        "Fallback ranks still use projection-derived positional leverage and legal-lineup utility; the small fixture pool makes those scarcity receipts diagnostic rather than draft-ready.",
        "Fixture mode now also simulates late-cycle refresh signals so the board can still pressure-test injury, role, and buzz handling.",
        ...(manualRefresh.signals.length > 0
          ? [
              `Manual refresh import added ${manualRefresh.signals.length} extra signal${
                manualRefresh.signals.length === 1 ? "" : "s"
              } on top of the fixture refresh simulation.`,
            ]
          : []),
        ...(preferredTargetConfig.targets.length > 0
          ? [
              `Approved preferred-target overlay added ${preferredTargetConfig.targets.length} manual tag${
                preferredTargetConfig.targets.length === 1 ? "" : "s"
              } in fallback mode as well.`,
            ]
          : []),
        ...(advancedResearchFixtures.appliedCount > 0
          ? [`Attached ${advancedResearchFixtures.appliedCount} research-only QB/rookie profiles in fixture mode with zero rank impact.`]
          : []),
      ],
      boardPlan,
      movementLog,
      marketDisagreementBoard,
      contextImpactBoard,
      draftStressTestBoard,
      refreshDigest: refreshedFixtures.digest,
      draftMorningPack: buildDraftMorningPackForMode(
        mode,
        rookieWrFixtureIntegration.candidates,
        draftState,
        refreshedFixtures.digest,
        movementLog,
      ),
    };
  }
}
