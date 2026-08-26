export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export type ExternalPlayerIds = Partial<{
  fantasyPros: string;
  yahoo: string;
  sleeper: string;
  nflverse: string;
  tank01: string;
}>;

export type ProviderName =
  | "fantasypros"
  | "fantasy-football-calculator"
  | "nflverse"
  | "sleeper"
  | "rotoballer"
  | "tank01"
  | "the-odds-api"
  | "win-with-odds"
  | "yahoo-browser"
  | "yahoo-api"
  | "manual"
  | "fixture";

export type SourceTier =
  | "CORE"
  | "SUPPLEMENTAL"
  | "FALLBACK"
  | "EXPERIMENTAL"
  | "CONDITIONAL"
  | "REMOVE";

export type DraftFocus = "balanced" | "structural" | "upside";

export type DraftBoardMode = "working" | "draft-week" | "final";

export type StatProjection = Partial<{
  passingYards: number;
  passing300Games: number;
  passingTouchdowns: number;
  interceptions: number;
  rushingYards: number;
  rushing100Games: number;
  rushingTouchdowns: number;
  receptions: number;
  receivingYards: number;
  receiving100Games: number;
  receivingTouchdowns: number;
  returnTouchdowns: number;
  fumblesLost: number;
  offensiveFumbleReturnTouchdowns: number;
  twoPointConversions: number;
  fieldGoals0to19: number;
  fieldGoals20to29: number;
  fieldGoals30to39: number;
  fieldGoals40to49: number;
  fieldGoals50Plus: number;
  pointAfterMakes: number;
  pointAfterMisses: number;
  defensiveSacks: number;
  defensiveInterceptions: number;
  defensiveFumbleRecoveries: number;
  defensiveTouchdowns: number;
  defensiveSafeties: number;
  blockedKicks: number;
  kickReturnTouchdowns: number;
  puntReturnTouchdowns: number;
  extraPointReturns: number;
  pointsAllowed: number;
}>;

export type FantasyScoringRules = {
  passingYardsPerPoint: number;
  passingTouchdownPoints: number;
  interceptionPoints: number;
  rushingYardsPerPoint: number;
  rushingTouchdownPoints: number;
  receptionPoints: number;
  receivingYardsPerPoint: number;
  receivingTouchdownPoints: number;
  returnTouchdownPoints: number;
  fumbleLostPoints: number;
  offensiveFumbleReturnTouchdownPoints: number;
  twoPointConversionPoints: number;
  kickerPoints: {
    fieldGoals0to19: number;
    fieldGoals20to29: number;
    fieldGoals30to39: number;
    fieldGoals40to49: number;
    fieldGoals50Plus: number;
    pointAfterMakes: number;
    pointAfterMisses: number;
  };
  defenseSpecialTeamsPoints: {
    sack: number;
    interception: number;
    fumbleRecovery: number;
    touchdown: number;
    safety: number;
    blockedKick: number;
    kickOrPuntReturnTouchdown: number;
    extraPointReturn: number;
  };
  pointsAllowed: Array<{
    min: number;
    max: number | null;
    points: number;
  }>;
  yardageBonuses?: Partial<{
    passing300: number;
    rushing100: number;
    receiving100: number;
  }>;
};

export type LeagueConfig = {
  id: string;
  name: string;
  teams: number;
  rosterSlots: string[];
  flexSlots: string[];
  benchSlots: number;
  irSlots: number;
  faabBudget: number | null;
  scoringType: string;
  waiverDays: number;
  waiverType: string;
  playoffTeams: number;
  playoffWeeks: number[];
  keeperLeague?: boolean;
  scoring: FantasyScoringRules;
};

export type PlayerRange = {
  p10: number;
  p50: number;
  p90: number;
};

export type ProjectionSnapshot = {
  season: number;
  provider: ProviderName;
  scoringType: string;
  asOf: string;
  playerId: string;
  stats: StatProjection;
  range: PlayerRange;
};

export type MarketSnapshot = {
  adp: number;
  ecr: number;
  tier: number;
  expertStdDev?: number;
  adpSource?: "direct" | "rank-proxy" | "unknown";
  adpProvider?: "fantasypros" | "fantasy-football-calculator" | "manual";
  ecrProvider?: "fantasypros" | "yahoo-editorial" | "manual";
  yahooRank?: number;
};

export type CanonicalPlayer = {
  id: string;
  fullName: string;
  team: string;
  positions: PlayerPosition[];
  rookie: boolean;
  age?: number;
  externalIds: ExternalPlayerIds;
  sources: ProviderName[];
};

export type ProviderPlayerRecord = {
  provider: ProviderName;
  providerPlayerId: string;
  fullName: string;
  team: string;
  positions: PlayerPosition[];
  rookie?: boolean;
  age?: number;
  externalIds?: ExternalPlayerIds;
};

export type AdvancedResearchSource =
  | "nflverse-pbp"
  | "nflverse-players"
  | "nfl-draft-tracker"
  | "college-football-data"
  | "sportsdataverse-cfbfastr"
  | "sleeper-depth-chart"
  | "win-with-odds"
  | "manager-reviewed";

export type QbAdvancedResearchInput = {
  lane: "qb";
  playerId?: string;
  playerName: string;
  season: number;
  dropbacks: number;
  designedRushShare?: number;
  scrambleRate?: number;
  epaPerDropback?: number;
  cpoe?: number;
  passingTouchdownRate?: number;
  sources: AdvancedResearchSource[];
};

export type RookieAdvancedResearchInput = {
  lane: "rookie";
  playerId?: string;
  playerName: string;
  position: "RB" | "WR" | "TE";
  draftPick?: number;
  collegeDominator?: number;
  breakoutAge?: number;
  breakoutQualified?: boolean;
  collegeTargetShare?: number;
  collegeScrimmageYardsShare?: number;
  collegeTouchdownShare?: number;
  collegeBestSeasonYardsShare?: number;
  collegeFinalSeasonYardsShare?: number;
  collegeRushAttempts?: number;
  collegeRushingYardsPerCarry?: number;
  collegeRushingExplosiveRate?: number;
  collegeRushingStuffAvoidanceRate?: number;
  collegeRushingTeamYpcDelta?: number;
  collegeTargets?: number;
  collegeCatchRate?: number;
  collegeReceivingYardsPerTarget?: number;
  collegeReceivingExplosiveRate?: number;
  collegeReceivingTeamYptDelta?: number;
  collegeTargetEpaPerTarget?: number;
  collegeTargetSuccessRate?: number;
  collegeTargetFirstDownRate?: number;
  collegeRedZoneTargetShare?: number;
  collegeScoringOpportunityTargetShare?: number;
  collegeSeasons?: number[];
  teamSituationScore?: number;
  teamSituationNotes?: string[];
  sources: AdvancedResearchSource[];
};

export type AdvancedResearchInput = QbAdvancedResearchInput | RookieAdvancedResearchInput;

export type AdvancedResearchComponent = {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  source: AdvancedResearchSource | "missing";
  summary: string;
};

export type AdvancedResearchSnapshot = {
  lane: "qb" | "rookie-rb" | "rookie-wr" | "rookie-te";
  status: "backtest-ready" | "partial" | "insufficient";
  rankingImpact: "none" | "production";
  researchScore: number | null;
  coverage: number;
  components: AdvancedResearchComponent[];
  blockers: string[];
  summary: string;
};

export type CandidateRookieWrOpportunitySnapshot = {
  modelVersion: string;
  mode: "shadow" | "production";
  deploymentScope: "proxy-only-shadow" | "market-trusted" | "validated-production";
  marketMedian: number;
  opportunityMedian: number;
  medianDelta: number;
  marketTargetsPerGame: number;
  opportunityTargetsPerGame: number;
  targetVolumeDeltaPercent: number;
  activationEligible: boolean;
  breakoutEligible: boolean;
  summary: string;
};

export type DraftCandidate = {
  player: CanonicalPlayer;
  projection: ProjectionSnapshot;
  market: MarketSnapshot;
  context?: PlayerContextSnapshot;
  seasonMarket?: CandidateSeasonMarketSnapshot;
  vegas?: CandidateVegasSnapshot;
  advancedResearch?: AdvancedResearchSnapshot;
  rookieWrOpportunity?: CandidateRookieWrOpportunitySnapshot;
  signals?: ProjectionSignalSnapshot;
};

export type PlayerCurrentRole =
  | "locked-starter"
  | "projected-starter"
  | "competition"
  | "backup"
  | "unknown";

export type PlayerHealthStatus = "healthy" | "recovering" | "active-concern" | "unknown";
export type PlayerTrackRecord = "established" | "limited-sample" | "rookie" | "unknown";
export type PlayerRoleContinuity =
  | "stable"
  | "promoted"
  | "team-change"
  | "scheme-change"
  | "unknown";
export type PlayerEnvironment = "strong" | "neutral" | "weak" | "uncertain";

export type QualitativeContextSignal =
  | "role-secure"
  | "role-competition"
  | "role-expansion"
  | "team-change"
  | "environment-strong"
  | "environment-weak"
  | "established-production"
  | "limited-sample"
  | "health-recovering"
  | "health-active-concern"
  | "upside"
  | "efficiency-concern"
  | "volume-support"
  | "analyst-upper-tier"
  | "analyst-draftable-tier"
  | "analyst-target";

export type QualitativeEvidenceRecord = {
  source: string;
  sourceUrl: string;
  publishedAt: string | null;
  capturedAt: string;
  kind: "player-outlook" | "analyst-ranking" | "analyst-target";
  signals: QualitativeContextSignal[];
  summary: string;
  sourceTextHash: string;
  rank?: number;
  injuryStatus?: string;
  injuryDetail?: string;
  estimatedReturn?: string;
};

export type CandidateQualitativeContextSnapshot = {
  capturedAt: string;
  sourceCount: number;
  evidence: QualitativeEvidenceRecord[];
  agreements: string[];
  conflicts: string[];
  summary: string;
};

export type PlayerContextSnapshot = {
  currentRole: PlayerCurrentRole;
  healthStatus: PlayerHealthStatus;
  trackRecord: PlayerTrackRecord;
  roleContinuity: PlayerRoleContinuity;
  environment: PlayerEnvironment;
  source: "manager-reviewed" | "manual-import" | "qualitative-snapshot" | "sleeper-depth-chart" | "inferred-default";
  asOf: string;
  notes: string[];
  qualitative?: CandidateQualitativeContextSnapshot;
};

export type CandidateSituationAssessment = {
  certainty: "high" | "medium" | "low";
  reviewed: boolean;
  summary: string;
  strengths: string[];
  questions: string[];
};

export type SeasonMarketProjectionStats = StatProjection &
  Partial<{
    passingAttempts: number;
    completions: number;
    rushingAttempts: number;
    fumbles: number;
    sourcePprPoints: number;
  }>;

export type SeasonMarketProjectionAdjustment = {
  stat: keyof StatProjection;
  sourceProjection: number;
  previousProjection: number;
  adjustedProjection: number;
};

export type CandidateSeasonMarketSnapshot = {
  provider: "win-with-odds";
  context: "standard" | "expanded-role-or-health-rebound";
  sourceRank: number;
  sourcePosition: PlayerPosition;
  sourcePprPoints: number | null;
  blendWeight: number;
  projectionDelta: number;
  stats: SeasonMarketProjectionStats;
  adjustments: SeasonMarketProjectionAdjustment[];
  summary: string;
};

export type VegasProjectionAdjustment = {
  stat: keyof StatProjection;
  market: string;
  perGameLine: number;
  bookmakerCount: number;
  seasonEquivalent: number;
  previousProjection: number;
  adjustedProjection: number;
};

export type CandidateVegasSnapshot = {
  status: "applied" | "no-match" | "unavailable";
  eventId: string | null;
  opponent: string | null;
  commenceTime: string | null;
  bookmakerCount: number;
  marketCount: number;
  projectionDelta: number;
  adjustments: VegasProjectionAdjustment[];
  summary: string;
};

export type ProjectionSignalSnapshot = {
  sourceCount: number;
  evidenceConfidence: CandidateEvidenceConfidenceSnapshot;
  situation: CandidateSituationAssessment;
  qualitativeAdjustment: CandidateQualitativeAdjustmentSnapshot;
  calibratedFromExact: number;
  projectionDisagreement: number;
  opportunityScore: number | null;
  opportunityLabel: string;
  sleeperTrend: "add" | "drop" | "steady";
  momentumScore: number;
  outlierTag:
    | "aligned"
    | "projection-over-market"
    | "market-over-projection"
    | "role-fragile";
  outlierScore: number;
  expectedOpportunity: CandidateExpectedOpportunitySnapshot;
  roleSecurity: CandidateRoleSecuritySnapshot;
  scoringProfile: CandidateScoringProfileSnapshot;
  regression: CandidateRegressionSnapshot;
  advancedUsage: CandidateAdvancedUsageSnapshot;
  robustness: ProjectionRobustnessSnapshot;
  dossier: CandidateConvictionDossier;
  refresh?: CandidateRefreshSnapshot;
  preferredTarget?: PreferredTargetSnapshot;
  seasonMarket?: CandidateSeasonMarketSnapshot;
  vegas?: CandidateVegasSnapshot;
  notes: string[];
};

export type CandidateAdvancedUsageSnapshot = {
  wopr: number | null;
  opportunityZScore: number | null;
  ageFragilityPoints: number;
  routeMetricsStatus: "available" | "unavailable";
  highValueTouchStatus: "available" | "covered-by-expected-points" | "unavailable";
  summary: string;
  evidence: string[];
};

export type CandidateQualitativeAdjustmentSnapshot = {
  direction: "up" | "down" | "none";
  percentDelta: number;
  pointsDelta: number;
  applied: boolean;
  drivers: string[];
  summary: string;
};

export type EvidenceConfidenceLevel = "high" | "medium" | "low";

export type EvidenceConfidenceDimension = {
  score: number;
  level: EvidenceConfidenceLevel;
  summary: string;
  drivers: string[];
};

export type CandidateEvidenceConfidenceSnapshot = {
  projection: EvidenceConfidenceDimension;
  role: EvidenceConfidenceDimension;
  robustness: EvidenceConfidenceDimension;
  price: EvidenceConfidenceDimension;
  identity: "verified" | "partial" | "unresolved";
  blockers: string[];
};

export type PreferredTargetSource = "model" | "approved" | "both";

export type PreferredTargetSnapshot = {
  source: PreferredTargetSource;
  label: "Model Preferred" | "Approved Preferred" | "Preferred";
  summary: string;
  reasons: string[];
  approvedBy?: string;
};

export type RefreshSignalCategory =
  | "injury-up"
  | "injury-down"
  | "role-up"
  | "role-down"
  | "camp-buzz-up"
  | "camp-buzz-down"
  | "adp-steam"
  | "adp-slide"
  | "depth-chart-up"
  | "depth-chart-down"
  | "holdout-risk"
  | "offense-up"
  | "offense-down";

export type RefreshSourceType =
  | "fantasypros-news"
  | "fantasypros-injury"
  | "official-injury"
  | "team-report"
  | "fantasy-news"
  | "sleeper-market"
  | "beat-report"
  | "manual";

export type RefreshSignal = {
  playerId: string;
  category: RefreshSignalCategory;
  headline: string;
  summary: string;
  source: RefreshSourceType;
  publishedAt: string;
  confidence: "high" | "medium" | "low";
  impact: number;
  externalId?: string;
  fingerprint?: string;
  sourceId?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  expiresAt?: string;
  ingestedAt?: string;
};

export type FantasyNewsFeedFormat = "rss" | "json";

export type FantasyNewsSourceKind =
  | "official-injury"
  | "team-report"
  | "beat-writer"
  | "fantasy-news";

export type FantasyNewsSourceTrust = "primary" | "verified" | "aggregator" | "unknown";

export type FantasyNewsFeedConfig = {
  id: string;
  label: string;
  url: string;
  format: FantasyNewsFeedFormat;
  sourceKind: FantasyNewsSourceKind;
  trust: FantasyNewsSourceTrust;
};

export type FantasyNewsIngestionIssue = {
  sourceId: string;
  headline?: string;
  reason: "invalid" | "unmatched-player" | "ambiguous-player" | "unclassified" | "stale" | "duplicate" | "fetch-failed";
  detail: string;
};

export type FantasyNewsIngestionReport = {
  enabled: boolean;
  generatedAt: string;
  feedCount: number;
  fetchedItemCount: number;
  appliedSignalCount: number;
  signals: RefreshSignal[];
  issues: FantasyNewsIngestionIssue[];
};

export type CandidateRefreshAdjustment = {
  label: string;
  delta: number;
  reason: string;
};

export type CandidateRefreshSnapshot = {
  status: "steady" | "rising" | "falling" | "volatile";
  freshnessScore: number;
  netImpact: number;
  confidencePenalty: number;
  lastUpdatedAt: string | null;
  adjustments: CandidateRefreshAdjustment[];
  headlines: string[];
  summary: string;
};

export type RefreshWatchlistEntry = {
  playerId: string;
  status: CandidateRefreshSnapshot["status"];
  freshnessScore: number;
  netImpact: number;
  headline: string;
  summary: string;
};

export type RefreshDigest = {
  generatedAt: string;
  sourceCount: number;
  appliedSignalCount: number;
  summary: string;
  watchlist: RefreshWatchlistEntry[];
};

export type DraftMorningChecklistItem = {
  label: string;
  timing: string;
  summary: string;
};

export type DraftMorningPriorityEntry = {
  playerId: string;
  headline: string;
  summary: string;
};

export type DraftMorningPack = {
  generatedAt: string;
  headline: string;
  summary: string;
  freezeWindow: string;
  checklist: DraftMorningChecklistItem[];
  priorityTargets: DraftMorningPriorityEntry[];
  fragileFades: DraftMorningPriorityEntry[];
  contingencyPlans: DraftMorningPriorityEntry[];
  watchlist: RefreshWatchlistEntry[];
  keyMovers: DraftBoardMovementEntry[];
};

export type InSeasonAvailability =
  | "my-roster"
  | "league-rostered"
  | "free-agent"
  | "trade-target";

export type TransactionPlayerRef = {
  playerId?: string;
  yahooPlayerId?: string;
  fullName: string;
  team?: string;
  positions?: PlayerPosition[];
};

export type ProposedTransaction =
  | {
      kind: "add-drop";
      add: TransactionPlayerRef[];
      drop: TransactionPlayerRef[];
      rationale?: string;
    }
  | {
      kind: "trade-proposal";
      send: TransactionPlayerRef[];
      receive: TransactionPlayerRef[];
      counterpartyTeamId?: string;
      counterpartyTeamName?: string;
      rationale?: string;
    };

export type UsageWindowSnapshot = {
  games: number;
  snapShare: number;
  routeParticipation: number;
  carriesPerGame: number;
  targetsPerGame: number;
  targetShare: number;
  airYardsShare: number;
  redZoneTouchesPerGame: number;
  fantasyPointsPerGame: number;
};

export type Tank01LivePlayerSnapshot = {
  gameStatus: "live" | "pregame" | "final";
  updatedAt: string;
  rushingAttempts: number;
  targets: number;
  receptions: number;
  rushingYards: number;
  receivingYards: number;
  touchdowns: number;
};

export type InSeasonPlayerSnapshot = {
  player: CanonicalPlayer;
  availability: InSeasonAvailability;
  rosterTeamId: string | null;
  weeklyProjection: PlayerRange;
  rosProjection: PlayerRange;
  baselineUsage: UsageWindowSnapshot;
  recentUsage: UsageWindowSnapshot;
  marketTrend: "add" | "drop" | "steady";
  marketTrendCount: number;
  depthChartOrder?: number;
  injuryStatus?: string | null;
  practiceParticipation?: string | null;
  liveStats?: Tank01LivePlayerSnapshot;
};

export type BreakingNewsAlert = {
  id: string;
  affectedPlayerId: string;
  urgency: "immediate" | "monitor";
  actionConfidence: "confirmed" | "provisional" | "insufficient";
  headline: string;
  summary: string;
  sourceLabel: string;
  sourceUrl?: string;
  publishedAt: string;
};

export type BreakingNewsResponse = {
  status: "actionable" | "monitor" | "unmatched" | "no-available-beneficiary" | "no-roster-upgrade";
  alert: BreakingNewsAlert | null;
  beneficiaryPlayerIds: string[];
  recommendations: WaiverRecommendationSnapshot[];
  blockers: string[];
};

export type OpportunityTrendSnapshot = {
  playerId: string;
  classification:
    | "early-edge"
    | "market-awakening"
    | "hype-without-usage"
    | "role-collapse"
    | "steady";
  opportunityScore: number;
  marketScore: number;
  recommendation: "add" | "watch" | "trade-for" | "hold" | "avoid";
  summary: string;
  signals: string[];
};

export type InSeasonTeamSnapshot = {
  teamId: string;
  name: string;
  playerIds: string[];
};

export type TradeIdeaSnapshot = {
  targetPlayerId: string;
  givePlayerId: string;
  counterpartyTeamId: string;
  counterpartyTeamName: string;
  verdict: "pursue" | "consider" | "pass";
  starterDelta: number;
  playoffUpsideDelta: number;
  riskDelta: number;
  summary: string;
  rationale: string[];
  proposedTransaction: ProposedTransaction;
};

export type FaabRangeSnapshot = {
  percentLow: number;
  percentHigh: number;
  bidLow: number | null;
  bidHigh: number | null;
  label: string;
};

export type WaiverRecommendationSnapshot = {
  addPlayerId: string;
  dropPlayerId: string | null;
  verdict: "priority" | "bid" | "watch" | "pass";
  starterDelta: number;
  weeklyDelta: number;
  playoffUpsideDelta: number;
  riskDelta: number;
  faabRange: FaabRangeSnapshot | null;
  summary: string;
  rationale: string[];
  proposedTransaction: ProposedTransaction;
};

export type TransactionQueueEntry = {
  id: string;
  kind: "waiver" | "trade";
  priority: "immediate" | "this-week" | "monitor";
  title: string;
  summary: string;
  proposedTransaction: ProposedTransaction;
  faabRange: FaabRangeSnapshot | null;
};

export type Tank01ProviderStatus = {
  configured: boolean;
  liveReady: boolean;
  message: string;
};

export type InSeasonCommandCenterDataset = {
  players: InSeasonPlayerSnapshot[];
  myTeam: InSeasonTeamSnapshot;
  leagueTeams: InSeasonTeamSnapshot[];
  opportunityTrends: OpportunityTrendSnapshot[];
  tradeIdeas: TradeIdeaSnapshot[];
  waiverRecommendations: WaiverRecommendationSnapshot[];
  actionQueue: TransactionQueueEntry[];
  tank01Status: Tank01ProviderStatus;
  scenarioNotes: string[];
};

export type ProjectionScenarioSnapshot = {
  label: "downside" | "base" | "ceiling";
  points: number;
  deltaFromMedian: number;
  summary: string;
  drivers: string[];
};

export type ProjectionRobustnessSnapshot = {
  fragility: "stable" | "balanced" | "fragile";
  fragilityScore: number;
  volatilityScore: number;
  medianStickiness: number;
  floorGap: number;
  ceilingGap: number;
  downside: ProjectionScenarioSnapshot;
  base: ProjectionScenarioSnapshot;
  ceiling: ProjectionScenarioSnapshot;
};

export type CandidateRegressionSnapshot = {
  direction: "positive" | "negative" | "neutral" | "none";
  regressionScore: number;
  adjustedMedianDelta: number;
  stabilityImpact: number;
  actualSeasonScore: number | null;
  expectedOpportunityPoints: number | null;
  summary: string;
  luckDrivers: string[];
};

export type CandidateExpectedOpportunitySnapshot = {
  label: "strong" | "usable" | "thin" | "none";
  evidenceSource: "ffopportunity" | "nflverse-heuristic" | "none";
  expectedPoints: number | null;
  expectedPointsPerGame: number | null;
  gapVsActual: number | null;
  gapVsProjectionMedian: number | null;
  weeklyConsistencyScore: number | null;
  weeklyVolatility: number | null;
  evidenceSeasons: number[];
  currentSeasonWeeks: number;
  currentSeasonWeight: number;
  adjustedMedianDelta: number;
  stabilityImpact: number;
  summary: string;
  drivers: string[];
};

export type CandidateRoleSecuritySnapshot = {
  label: "secure" | "balanced" | "fragile" | "unknown";
  securityScore: number;
  competitionPressure: number;
  roleShare: number | null;
  adjustedMedianDelta: number;
  stabilityImpact: number;
  summary: string;
  drivers: string[];
};

export type CandidateScoringProfileSnapshot = {
  label: "volume-backed" | "balanced" | "touchdown-fragile";
  dependencyScore: number;
  adjustedMedianDelta: number;
  stabilityImpact: number;
  projectedTouchdownShare: number;
  priorTouchdownShare: number | null;
  summary: string;
  drivers: string[];
};

export type CandidateConvictionDossier = {
  stance:
    | "priority-target"
    | "pocket-value"
    | "fragile-bet"
    | "market-trap"
    | "neutral";
  convictionScore: number;
  summary: string;
  support: string[];
  whatHasToGoRight: string[];
  failureModes: string[];
  usagePlan: string;
};

export type TeamRosterState = {
  teamId: string;
  starters: string[];
  bench: string[];
  positionCounts: Partial<Record<PlayerPosition, number>>;
  openSlots: string[];
};

export type DraftPickEvent = {
  overallPick: number;
  round: number;
  pickInRound: number;
  teamId: string;
  playerId: string;
  pickedAt: string;
  source: ProviderName;
  eventType?: "live" | "keeper";
};

export type DraftState = {
  leagueConfigVersion: string;
  leagueConfigFingerprint: string;
  league: LeagueConfig;
  myTeamId: string;
  currentPick: number;
  picksUntilNextTurn: number;
  availablePlayerIds: string[];
  drafted: DraftPickEvent[];
  teams: TeamRosterState[];
  focus: DraftFocus;
};

export type DraftTurnMode = "pair-building" | "long-gap" | "standard";

export type DraftTurnContext = {
  mode: DraftTurnMode;
  currentPick: number;
  nextPick: number | null;
  livePicksBeforeNextTurn: number[];
  interveningTeamIds: string[];
  distinctInterveningTeams: number;
  sameTeamOwnsAllInterveningPicks: boolean;
  label: string;
  summary: string;
};

export type CandidateExplanation = {
  summary: string[];
  ourBoardRank: number;
  marketRank: number;
  boardEdge: number;
  ourBoardScore: number;
  marketLeverageScore: number;
  positionRank: number;
  positionUtilityMultiplier: number;
  onesiePenalty: number;
  positionalLeverageScore: number;
  medianTierEdge: number;
  floorTierEdge: number;
  ceilingTierEdge: number;
  positionalComparisonPlayerId: string | null;
  makeItBackProbability: number;
  valueNow: number;
  valueLater: number;
  vona: number;
  upsideDelta: number;
  scarcityBonus: number;
  replacementBaseline: number;
  pprLift: number;
  bonusLift: number;
  focusBonus: number;
  stabilityBonus: number;
  robustnessPenalty: number;
  tierPressureBonus: number;
  convictionBonus: number;
  refreshBonus: number;
  rawValueScore: number;
  structuralScore: number;
  valueGapVsMarket: number;
  tierSurvivalProbability: number;
  expectedPositionSelections: number;
  runRisk: "low" | "medium" | "high";
  fragilityScore: number;
  convictionScore: number;
  freshnessScore: number;
  valueCase: string;
  structuralCase: string;
};

export type CandidateRecommendation = {
  playerId: string;
  score: number;
  explanation: CandidateExplanation;
};

export type DraftRecommendationPolicyMode = "production" | "construction-ablation";
export type DraftCounterfactualEvaluationMode = "quick-preview" | "exact-production";

export type PositionMarketSnapshot = {
  position: PlayerPosition;
  label: string;
  availableCount: number;
  starterDemand: number;
  replacementBaseline: number;
  topAvailableName: string;
  topAvailableMedian: number;
  topTier: number;
  tierDrop: number;
  scarcityIndex: number;
  marketState: "stable" | "thinning" | "drying-up";
  runRisk: "low" | "medium" | "high";
  tierSurvivalProbability: number;
  expectedSelectionsBeforeNextTurn: number;
  summary: string;
};

export type PositionRunSnapshot = {
  position: PlayerPosition;
  runRisk: "low" | "medium" | "high";
  upcomingPickCount: number;
  teamsWithStarterNeed: number;
  teamsWithFlexNeed: number;
  urgentTeamIds: string[];
  expectedSelectionsBeforeNextTurn: number;
  tierPlayerCount: number;
  tierSurvivalProbability: number;
  cliffDrop: number;
  headline: string;
  summary: string;
};

export type WrapSimulationPositionProbability = {
  position: PlayerPosition;
  probability: number;
};

export type WrapSimulationCountOutcome = {
  count: number;
  probability: number;
};

export type OpponentPickPredictionSnapshot = {
  overallPick: number;
  teamId: string;
  likelyPlayerId: string | null;
  likelyPosition: PlayerPosition;
  confidence: number;
  positionProbabilities: WrapSimulationPositionProbability[];
  summary: string;
};

export type SimulatedPlayerLossSnapshot = {
  playerId: string;
  lossProbability: number;
  expectedPick: number | null;
  likelyTeamIds: string[];
  summary: string;
};

export type WrapSimulationPositionSnapshot = {
  position: PlayerPosition;
  expectedSelections: number;
  distribution: WrapSimulationCountOutcome[];
};

export type WrapSimulationSnapshot = {
  simulations: number;
  picksSimulated: number;
  positionSnapshots: WrapSimulationPositionSnapshot[];
  pickPredictions: OpponentPickPredictionSnapshot[];
  threatenedPlayers: SimulatedPlayerLossSnapshot[];
  summary: string;
};

export type DraftDecisionSnapshot = {
  structuralBest: CandidateRecommendation | null;
  valueBest: CandidateRecommendation | null;
  samePlayer: boolean;
  headline: string;
  summary: string;
};

export type ConditionalDraftPathPick = {
  overallPick: number;
  playerId: string;
  playerName: string;
  position: PlayerPosition;
};

export type ConditionalDraftPathSequence = {
  picks: ConditionalDraftPathPick[];
  probability: number;
};

export type ConditionalDraftPathOutcome = {
  initialPlayerId: string;
  initialPlayerName: string;
  initialPosition: PlayerPosition;
  simulations: number;
  winRate: number;
  medianLineupPoints: number;
  floorLineupPoints: number;
  ceilingLineupPoints: number;
  medianEdgeVsBestAlternative: number;
  medianRegret: number;
  downsideRegret: number;
  recommended: boolean;
  commonSequences: ConditionalDraftPathSequence[];
  summary: string;
};

export type ConditionalDraftPathBoard = {
  generatedAt: string;
  simulations: number;
  currentPick: number;
  futurePicks: number[];
  policyMode: DraftRecommendationPolicyMode;
  evaluationMode: DraftCounterfactualEvaluationMode;
  outcomes: ConditionalDraftPathOutcome[];
  summary: string;
};

export type DraftPlanRuleStatus = "attack" | "hold" | "satisfied";

export type DraftPlanRule = {
  id: "rb-foundation" | "wr-core" | "onesie-patience" | "bench-upside" | "endgame";
  label: string;
  status: DraftPlanRuleStatus;
  summary: string;
};

export type DraftPlanTarget = {
  playerId: string;
  label: string;
  timing: "now" | "soon" | "can-wait";
  summary: string;
};

export type DraftPlanSnapshot = {
  phase: "foundation" | "core" | "value" | "upside" | "endgame";
  round: number;
  headline: string;
  objective: string;
  rosterRead: string;
  formatRead: string;
  rules: DraftPlanRule[];
  targets: DraftPlanTarget[];
};

export type PickWindowSnapshot = {
  playerId: string;
  urgency: "now" | "soon" | "can-wait";
  survivalProbability: number;
  dropoffIfPassed: number;
  tierSurvivalProbability: number;
  expectedPositionSelections: number;
  runRisk: "low" | "medium" | "high";
  label: string;
  summary: string;
};

export type ReachToleranceSnapshot = {
  playerId: string;
  label: "Do not reach" | "Small reach ok" | "Aggressive reach ok";
  maxReachPicks: number;
  marketCost: number;
  runRisk: PickWindowSnapshot["runRisk"];
  valueBuffer: number;
  summary: string;
};

export type BoardOutlierSnapshot = {
  playerId: string;
  tag: ProjectionSignalSnapshot["outlierTag"];
  severity: "watch" | "strong";
  score: number;
  headline: string;
  summary: string;
};

export type UndervaluedPlaySnapshot = {
  playerId: string;
  label: "Major Discount" | "Strong Value" | "Model Value";
  ourBoardRank: number;
  marketRank: number;
  boardEdge: number;
  marketLeverageScore: number;
  summary: string;
};

export type TierPivotSnapshot = {
  position: PlayerPosition;
  triggerPlayerId: string;
  fallbackPlayerIds: string[];
  alternativePlayerId: string | null;
  urgency: PickWindowSnapshot["urgency"];
  summary: string;
};

export type TierWipeScenarioSnapshot = {
  position: PlayerPosition;
  threatenedPlayerIds: string[];
  likelyLostCount: number;
  dropoffAfterWipe: number;
  pivotPlayerId: string | null;
  fallbackPlayerIds: string[];
  summary: string;
};

export type DraftBoardRefreshStep = {
  label: string;
  timing: string;
  summary: string;
};

export type DraftBoardSnapshotPlan = {
  mode: DraftBoardMode;
  title: string;
  badge: string;
  summary: string;
  goal: string;
  refreshPolicy: string;
  locked: boolean;
  focus: DraftFocus;
  steps: DraftBoardRefreshStep[];
};

export type DraftBoardMovementEntry = {
  playerId: string;
  direction: "up" | "down";
  movementScore: number;
  marketRank: number;
  modelRank: number;
  calibratedDelta: number;
  headline: string;
  reasons: string[];
};

export type MarketDisagreementClassification = "target" | "avoid" | "contested";

export type MarketDisagreementEntry = {
  playerId: string;
  classification: MarketDisagreementClassification;
  disagreementScore: number;
  modelRank: number;
  consensusRank: number;
  rankEdge: number;
  projectedYahooPoints: number;
  seasonMarketDelta: number | null;
  seasonMarketRank: number | null;
  projectionEvidence: EvidenceConfidenceLevel;
  situationCertainty: CandidateSituationAssessment["certainty"];
  likelyRound: number;
  acquisitionWindow: string;
  headline: string;
  summary: string;
  evidence: string[];
  caution: string;
};

export type MarketDisagreementBoard = {
  generatedAt: string;
  summary: string;
  targets: MarketDisagreementEntry[];
  avoids: MarketDisagreementEntry[];
  contested: MarketDisagreementEntry[];
};

export type ContextImpactDecision = "target" | "avoid" | "discount" | "contested" | "hold";

export type ContextImpactEntry = {
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  beforeRank: number;
  afterRank: number;
  rankChange: number;
  beforePoints: number;
  afterPoints: number;
  pointsDelta: number;
  marketRank: number;
  marketEdge: number;
  decision: ContextImpactDecision;
  situationBefore: CandidateSituationAssessment["certainty"];
  situationAfter: CandidateSituationAssessment["certainty"];
  sourceCount: number;
  headline: string;
  reasons: string[];
  acquisitionGuidance: string;
};

export type ContextImpactBoard = {
  generatedAt: string;
  summary: string;
  materiallyChangedCount: number;
  risers: ContextImpactEntry[];
  fallers: ContextImpactEntry[];
  decisions: ContextImpactEntry[];
};

export type DraftStressStrategyId = "balanced" | "wr-heavy" | "rb-pressure" | "wait-onesie";

export type DraftStressStrategyOutcome = {
  id: DraftStressStrategyId;
  label: string;
  simulations: number;
  medianStarterPoints: number;
  medianStarterFloor: number;
  medianStarterCeiling: number;
  validStarterRate: number;
  averagePositionCounts: Partial<Record<PlayerPosition, number>>;
  compositeScore: number;
  recommended: boolean;
  summary: string;
};

export type DraftStressPickTarget = {
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  selectionRate: number;
  availabilityRate: number;
};

export type DraftStressPickWindow = {
  overallPick: number;
  round: number;
  pickInRound: number;
  positionMix: Partial<Record<PlayerPosition, number>>;
  topTargets: DraftStressPickTarget[];
};

export type ManagerDraftClassification =
  | "priority-target"
  | "take-at-cost"
  | "discount-only"
  | "situation-watch"
  | "pass";

export type ManagerDraftBoardEntry = {
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  classification: ManagerDraftClassification;
  boardRank: number;
  marketRank: number;
  boardEdge: number;
  marketCostQuality: "direct" | "proxy" | "unknown";
  recommendedPick: number | null;
  recommendedRound: number | null;
  nextPick: number | null;
  availabilityAtRecommendedPick: number;
  availabilityAtNextPick: number;
  draftedByUsRate: number;
  medianAcquisitionPick: number | null;
  instruction: string;
  reasons: string[];
};

export type ManagerDraftBoard = Record<ManagerDraftClassification, ManagerDraftBoardEntry[]>;

export type DraftStressTestBoard = {
  generatedAt: string;
  simulations: number;
  draftSlot: number;
  firstLivePick: number;
  keeperPlayerIds: string[];
  livePickNumbers: number[];
  summary: string;
  assumptions: string[];
  strategyOutcomes: DraftStressStrategyOutcome[];
  pickWindows: DraftStressPickWindow[];
  managerBoard: ManagerDraftBoard;
};

export type PreferredSourceMap = Record<
  string,
  {
    preferred: ProviderName;
    fallback: ProviderName[];
    rationale: string;
  }
>;

export type ProviderAssessment = {
  provider: ProviderName;
  tier: SourceTier;
  uniqueUsefulFields: string[];
  overlapNotes: string;
  latencyNotes: string;
  reliabilityNotes: string;
  licensingNotes: string;
  keepDecision: string;
};
