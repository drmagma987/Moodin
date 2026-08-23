import type {
  DraftCandidate,
  ProviderPlayerRecord,
  RefreshSignal,
  RefreshSignalCategory,
  RefreshSourceType,
} from "@/lib/fantasy/types";

type RefreshLookupIndex = {
  byCanonicalId: Map<string, string>;
  byFantasyProsId: Map<string, string>;
  byYahooId: Map<string, string>;
  bySleeperId: Map<string, string>;
  byNormalizedNameTeam: Map<string, string>;
};

type ManualRefreshSignalInput = {
  playerId?: string;
  fantasyProsId?: string;
  yahooId?: string;
  sleeperId?: string;
  playerName?: string;
  team?: string;
  category: RefreshSignalCategory;
  headline: string;
  summary?: string;
  source?: RefreshSourceType;
  publishedAt?: string;
  confidence?: "high" | "medium" | "low";
  impact?: number;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function categoryFromFantasyProsTag(tag: string | undefined): RefreshSignalCategory | null {
  if (!tag) {
    return null;
  }

  const value = tag.toLowerCase();
  if (value.includes("injur") || value.includes("questionable") || value.includes("doubtful")) {
    return "injury-up";
  }
  if (value.includes("healthy") || value.includes("cleared")) {
    return "injury-down";
  }
  if (value.includes("depth chart rise") || value.includes("promoted")) {
    return "depth-chart-up";
  }
  if (value.includes("depth chart drop") || value.includes("demoted")) {
    return "depth-chart-down";
  }
  if (value.includes("holdout") || value.includes("contract")) {
    return "holdout-risk";
  }
  if (value.includes("role up") || value.includes("featured") || value.includes("starter")) {
    return "role-up";
  }
  if (value.includes("role down") || value.includes("committee") || value.includes("backup")) {
    return "role-down";
  }
  if (value.includes("steam") || value.includes("riser")) {
    return "adp-steam";
  }
  if (value.includes("slide") || value.includes("faller")) {
    return "adp-slide";
  }
  if (value.includes("offense up")) {
    return "offense-up";
  }
  if (value.includes("offense down")) {
    return "offense-down";
  }
  if (value.includes("buzz")) {
    return value.includes("down") ? "camp-buzz-down" : "camp-buzz-up";
  }

  return null;
}

function defaultImpactForCategory(category: RefreshSignalCategory) {
  switch (category) {
    case "injury-up":
    case "holdout-risk":
      return 4.2;
    case "role-up":
    case "role-down":
    case "depth-chart-up":
    case "depth-chart-down":
      return 3.3;
    case "offense-up":
    case "offense-down":
      return 2.4;
    case "adp-steam":
    case "adp-slide":
      return 1.6;
    case "camp-buzz-up":
    case "camp-buzz-down":
    case "injury-down":
    default:
      return 2;
  }
}

function lookupKeyFromNameTeam(playerName: string | undefined, team: string | undefined) {
  if (!playerName) {
    return null;
  }

  return `${normalizeName(playerName)}|${(team ?? "").trim().toUpperCase()}`;
}

export function buildRefreshLookupIndex(candidates: DraftCandidate[]): RefreshLookupIndex {
  const byCanonicalId = new Map<string, string>();
  const byFantasyProsId = new Map<string, string>();
  const byYahooId = new Map<string, string>();
  const bySleeperId = new Map<string, string>();
  const byNormalizedNameTeam = new Map<string, string>();

  for (const candidate of candidates) {
    byCanonicalId.set(candidate.player.id, candidate.player.id);
    if (candidate.player.externalIds.fantasyPros) {
      byFantasyProsId.set(candidate.player.externalIds.fantasyPros, candidate.player.id);
    }
    if (candidate.player.externalIds.yahoo) {
      byYahooId.set(candidate.player.externalIds.yahoo, candidate.player.id);
    }
    if (candidate.player.externalIds.sleeper) {
      bySleeperId.set(candidate.player.externalIds.sleeper, candidate.player.id);
    }
    byNormalizedNameTeam.set(
      `${normalizeName(candidate.player.fullName)}|${candidate.player.team.toUpperCase()}`,
      candidate.player.id,
    );
    byNormalizedNameTeam.set(`${normalizeName(candidate.player.fullName)}|`, candidate.player.id);
  }

  return {
    byCanonicalId,
    byFantasyProsId,
    byYahooId,
    bySleeperId,
    byNormalizedNameTeam,
  };
}

function resolveRefreshPlayerId(
  input: Partial<ManualRefreshSignalInput>,
  lookup: RefreshLookupIndex,
) {
  const fromCanonical = input.playerId ? lookup.byCanonicalId.get(input.playerId) : undefined;
  if (fromCanonical) {
    return fromCanonical;
  }

  const fromFantasyPros = input.fantasyProsId
    ? lookup.byFantasyProsId.get(input.fantasyProsId)
    : undefined;
  if (fromFantasyPros) {
    return fromFantasyPros;
  }

  const fromYahoo = input.yahooId ? lookup.byYahooId.get(input.yahooId) : undefined;
  if (fromYahoo) {
    return fromYahoo;
  }

  const fromSleeper = input.sleeperId ? lookup.bySleeperId.get(input.sleeperId) : undefined;
  if (fromSleeper) {
    return fromSleeper;
  }

  const key = lookupKeyFromNameTeam(input.playerName, input.team);
  if (key) {
    return lookup.byNormalizedNameTeam.get(key) ?? undefined;
  }

  return undefined;
}

export function parseManualRefreshSignals(
  raw: string,
  candidates: DraftCandidate[],
  options?: {
    defaultSource?: RefreshSourceType;
    now?: string;
  },
) {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Manual refresh import must be a JSON array.");
  }

  const lookup = buildRefreshLookupIndex(candidates);
  const signals: RefreshSignal[] = [];
  const messages: string[] = [];
  const now = options?.now ?? new Date().toISOString();

  for (const [index, item] of parsed.entries()) {
    const record = asRecord(item);
    if (!record) {
      messages.push(`Row ${index + 1} skipped: expected an object.`);
      continue;
    }

    const category = readString(record.category) as RefreshSignalCategory | undefined;
    const headline = readString(record.headline);
    if (!category || !headline) {
      messages.push(`Row ${index + 1} skipped: missing category or headline.`);
      continue;
    }

    const playerId = resolveRefreshPlayerId(
      {
        playerId: readString(record.playerId),
        fantasyProsId: readString(record.fantasyProsId),
        yahooId: readString(record.yahooId),
        sleeperId: readString(record.sleeperId),
        playerName: readString(record.playerName, record.fullName, record.name),
        team: readString(record.team),
      },
      lookup,
    );

    if (!playerId) {
      messages.push(`Row ${index + 1} skipped: could not match player.`);
      continue;
    }

    signals.push({
      playerId,
      category,
      headline,
      summary: readString(record.summary) ?? headline,
      source: (readString(record.source) as RefreshSourceType | undefined) ?? options?.defaultSource ?? "manual",
      publishedAt: readString(record.publishedAt) ?? now,
      confidence: (readString(record.confidence) as RefreshSignal["confidence"] | undefined) ?? "medium",
      impact: readNumber(record.impact) ?? defaultImpactForCategory(category),
    });
  }

  return {
    signals,
    messages,
  };
}

export function readManualRefreshSignalsFromEnv(
  candidates: DraftCandidate[],
  envValue = process.env.FANTASY_REFRESH_SIGNALS_JSON,
) {
  if (!envValue?.trim()) {
    return {
      signals: [] as RefreshSignal[],
      messages: [] as string[],
    };
  }

  return parseManualRefreshSignals(envValue, candidates, {
    defaultSource: "manual",
  });
}

export function normalizeFantasyProsRefreshSignals(
  payload: unknown,
  candidates: DraftCandidate[],
) {
  const lookup = buildRefreshLookupIndex(candidates);
  const root = asRecord(payload);
  const rows = Array.isArray(root?.players)
    ? root?.players
    : Array.isArray(root?.news)
      ? root?.news
      : Array.isArray(payload)
        ? payload
        : [];
  const signals: RefreshSignal[] = [];
  const messages: string[] = [];

  for (const [index, row] of rows.entries()) {
    const record = asRecord(row);
    if (!record) {
      messages.push(`FantasyPros row ${index + 1} skipped: not an object.`);
      continue;
    }

    const headline = readString(record.headline, record.title, record.news_title);
    const summary =
      readString(record.summary, record.description, record.news, record.body) ?? headline;
    const playerName = readString(record.player_name, record.name, record.playerName);
    const team = readString(record.team, record.player_team_id, record.team_id);
    const playerId = resolveRefreshPlayerId(
      {
        fantasyProsId: readString(record.player_id, record.id, record.fpid),
        playerName,
        team,
      },
      lookup,
    );
    const category = categoryFromFantasyProsTag(
      readString(record.tag, record.type, record.news_type, record.category),
    );

    if (!playerId || !headline || !category) {
      messages.push(`FantasyPros row ${index + 1} skipped: missing player match, headline, or category.`);
      continue;
    }

    signals.push({
      playerId,
      category,
      headline,
      summary: summary ?? headline,
      source:
        category === "injury-up" || category === "injury-down"
          ? "fantasypros-injury"
          : "fantasypros-news",
      publishedAt: readString(record.published_at, record.updated_at, record.date) ?? new Date().toISOString(),
      confidence: "medium",
      impact: readNumber(record.impact, record.weight) ?? defaultImpactForCategory(category),
    });
  }

  return {
    signals,
    messages,
  };
}

export function candidateRecordsToRefreshLookup(records: ProviderPlayerRecord[]) {
  const draftCandidates = records.map((record) => ({
    player: {
      id: record.externalIds?.fantasyPros ?? record.providerPlayerId,
      fullName: record.fullName,
      team: record.team,
      positions: record.positions,
      rookie: record.rookie ?? false,
      age: record.age,
      externalIds: record.externalIds ?? {},
      sources: [record.provider],
    },
    projection: {
      season: 2026,
      provider: "fixture" as const,
      scoringType: "NONE",
      asOf: new Date().toISOString(),
      playerId: record.providerPlayerId,
      stats: {},
      range: { p10: 0, p50: 0, p90: 0 },
    },
    market: {
      adp: 999,
      ecr: 999,
      tier: 99,
    },
  }));

  return buildRefreshLookupIndex(draftCandidates);
}
