import type { PreferredSourceMap, ProviderAssessment } from "@/lib/fantasy/types";

export const preferredSourceMap: PreferredSourceMap = {
  draftProjections: {
    preferred: "fantasypros",
    fallback: ["win-with-odds"],
    rationale: "FantasyPros is the primary substrate; Win With Odds adds a conservative season-long Vegas-derived stat cross-check.",
  },
  weeklyUsage: {
    preferred: "nflverse",
    fallback: [],
    rationale: "Best fit for actual historical usage, snaps, opportunity, and player-stat baselines.",
  },
  marketMomentum: {
    preferred: "sleeper",
    fallback: [],
    rationale: "Trending adds and drops are differentiated market-behavior data, not raw player quality.",
  },
  qualitativeSignals: {
    preferred: "rotoballer",
    fallback: ["fantasypros"],
    rationale: "Use only as context after rights review; never as the scoring truth layer.",
  },
  liveNflState: {
    preferred: "tank01",
    fallback: ["nflverse"],
    rationale: "Experimental live-game source to keep only if latency meaningfully beats post-game data.",
  },
  leagueState: {
    preferred: "yahoo-browser",
    fallback: ["yahoo-api", "manual", "fixture"],
    rationale: "Yahoo is authoritative, but browser extraction is the most practical near-term acquisition path.",
  },
  playerIdentity: {
    preferred: "manual",
    fallback: ["fantasypros", "sleeper", "nflverse", "tank01"],
    rationale: "Internal canonical identity should own crosswalk resolution rather than deferring to any single provider.",
  },
};

export const providerAssessments: ProviderAssessment[] = [
  {
    provider: "fantasypros",
    tier: "CORE",
    uniqueUsefulFields: ["projections", "consensus rankings", "ADP", "tiers", "news", "injuries"],
    overlapNotes: "Overlaps with some news and injury sources but remains the strongest draft-first fantasy provider.",
    latencyNotes: "Needs credentialed verification in this repo before we can measure actual refresh behavior.",
    reliabilityNotes: "API appears formalized with stable endpoint families and API-key auth.",
    licensingNotes: "Personal non-commercial use appears supported; production or redistribution needs review.",
    keepDecision: "Keep as a core provider pending credential validation.",
  },
  {
    provider: "win-with-odds",
    tier: "SUPPLEMENTAL",
    uniqueUsefulFields: ["season-long Vegas-derived projections", "passing volume", "rushing volume", "receiving volume", "touchdowns"],
    overlapNotes: "Overlaps with baseline projections but adds an independent sportsbook-derived expectation layer.",
    latencyNotes: "Preseason snapshot source, not an in-season refresh feed.",
    reliabilityNotes: "Public CSV export is deterministic and the methodology is documented; deeper rows are more model-driven than market-driven.",
    licensingNotes: "Use the source's intended public download for personal analysis; do not redistribute the underlying table.",
    keepDecision: "Keep as a capped top-300 preseason projection input, not a sole source of truth.",
  },
  {
    provider: "nflverse",
    tier: "CORE",
    uniqueUsefulFields: ["play-by-play", "player stats", "snap counts", "depth charts", "injuries", "ff opportunity"],
    overlapNotes: "Minimal overlap with FantasyPros for historical usage; strong complement rather than duplication.",
    latencyNotes: "Best suited to historical and near-postgame analytics rather than instant live-state reaction.",
    reliabilityNotes: "Open ecosystem with transparent datasets and broad analytics adoption.",
    licensingNotes: "Generally permissive, but some downstream sourced subsets may have distinct limits.",
    keepDecision: "Keep as the structured actual-usage backbone.",
  },
  {
    provider: "sleeper",
    tier: "SUPPLEMENTAL",
    uniqueUsefulFields: ["trending adds", "trending drops", "free player metadata"],
    overlapNotes: "Adds market movement rather than replacing fantasy projections or league state.",
    latencyNotes: "Public trending endpoints look useful for short-window velocity signals.",
    reliabilityNotes: "Read-only API with simple access and no auth token requirement.",
    licensingNotes: "Trending embeds require attribution; endpoint usage should preserve Sleeper attribution.",
    keepDecision: "Keep as low-cost market-signal enrichment.",
  },
  {
    provider: "rotoballer",
    tier: "CONDITIONAL",
    uniqueUsefulFields: ["qualitative role analysis", "waiver theses", "injury implications"],
    overlapNotes: "High narrative overlap with other content sources; needs aggressive filtering.",
    latencyNotes: "Could surface forward-looking role context, but timeliness must be proven.",
    reliabilityNotes: "Useful as evidence, not truth. Content extraction needs careful auditability.",
    licensingNotes: "Terms emphasize personal non-commercial use and tighter restrictions around licensed feed content.",
    keepDecision: "Use only after feed rights and extraction boundaries are explicitly approved.",
  },
  {
    provider: "tank01",
    tier: "EXPERIMENTAL",
    uniqueUsefulFields: ["live game state", "live box scores", "possible current-season roster freshness"],
    overlapNotes: "Potential overlap with live-news feeds and nflverse postgame outputs.",
    latencyNotes: "This is the main reason to test it; if live latency gains are trivial, remove it.",
    reliabilityNotes: "Needs free-tier trial data before promotion.",
    licensingNotes: "API plan and free-tier restrictions still need hands-on validation.",
    keepDecision: "Do not make core until Sunday-live value is proven.",
  },
];
