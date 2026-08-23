import { scoreStatProjection } from "@/lib/fantasy/scoring";
import type {
  CandidateVegasSnapshot,
  DraftCandidate,
  FantasyScoringRules,
  StatProjection,
  VegasProjectionAdjustment,
} from "@/lib/fantasy/types";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const NFL_SPORT_KEY = "americanfootball_nfl";
const DEFAULT_MARKETS = [
  "player_pass_yds",
  "player_pass_tds",
  "player_pass_interceptions",
  "player_rush_yds",
  "player_rush_tds",
  "player_receptions",
  "player_reception_yds",
  "player_reception_tds",
] as const;

const MARKET_TO_STAT: Record<string, keyof StatProjection> = {
  player_pass_yds: "passingYards",
  player_pass_tds: "passingTouchdowns",
  player_pass_interceptions: "interceptions",
  player_rush_yds: "rushingYards",
  player_rush_tds: "rushingTouchdowns",
  player_receptions: "receptions",
  player_reception_yds: "receivingYards",
  player_reception_tds: "receivingTouchdowns",
};

type OddsApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type OddsApiOutcome = {
  name?: string;
  description?: string;
  price?: number;
  point?: number;
};

type OddsApiEventOdds = OddsApiEvent & {
  bookmakers?: Array<{
    key?: string;
    markets?: Array<{
      key?: string;
      outcomes?: OddsApiOutcome[];
    }>;
  }>;
};

export type VegasPlayerPropSnapshot = {
  playerName: string;
  eventId: string;
  opponent: string;
  commenceTime: string;
  lines: Partial<
    Record<
      keyof StatProjection,
      {
        market: string;
        point: number;
        bookmakerCount: number;
      }
    >
  >;
};

export type VegasPropsFeed = {
  players: Map<string, VegasPlayerPropSnapshot>;
  eventCount: number;
  requestCount: number;
  markets: string[];
  quotaRemaining: number | null;
  fetchedAt: string;
};

export class OddsApiConfigError extends Error {}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function impliedProbability(americanPrice: number) {
  return americanPrice > 0
    ? 100 / (americanPrice + 100)
    : Math.abs(americanPrice) / (Math.abs(americanPrice) + 100);
}

function fairPoint(over: OddsApiOutcome, under: OddsApiOutcome | undefined) {
  const point = over.point;
  if (typeof point !== "number") {
    return null;
  }
  if (
    typeof over.price !== "number" ||
    typeof under?.price !== "number"
  ) {
    return point;
  }

  const overProbability = impliedProbability(over.price);
  const underProbability = impliedProbability(under.price);
  const fairOverProbability = overProbability / (overProbability + underProbability);
  return point + Math.max(-0.15, Math.min(0.15, (fairOverProbability - 0.5) * 0.6));
}

export function normalizeOddsApiPlayerProps(events: OddsApiEventOdds[]) {
  const valuesByPlayer = new Map<
    string,
    {
      playerName: string;
      eventId: string;
      opponent: string;
      commenceTime: string;
      byStat: Map<keyof StatProjection, { market: string; values: number[]; books: Set<string> }>;
    }
  >();

  for (const event of events) {
    for (const bookmaker of event.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        const marketKey = market.key ?? "";
        const stat = MARKET_TO_STAT[marketKey];
        if (!stat) {
          continue;
        }

        const outcomes = market.outcomes ?? [];
        for (const over of outcomes.filter((outcome) => outcome.name === "Over")) {
          const playerName = over.description?.trim();
          if (!playerName) {
            continue;
          }
          const under = outcomes.find(
            (outcome) =>
              outcome.name === "Under" &&
              outcome.description === over.description &&
              outcome.point === over.point,
          );
          const point = fairPoint(over, under);
          if (point === null) {
            continue;
          }

          const key = normalizeName(playerName);
          const current = valuesByPlayer.get(key) ?? {
            playerName,
            eventId: event.id,
            opponent: `${event.away_team} at ${event.home_team}`,
            commenceTime: event.commence_time,
            byStat: new Map(),
          };
          const statValues = current.byStat.get(stat) ?? {
            market: marketKey,
            values: [],
            books: new Set<string>(),
          };
          statValues.values.push(point);
          statValues.books.add(bookmaker.key ?? "unknown");
          current.byStat.set(stat, statValues);
          valuesByPlayer.set(key, current);
        }
      }
    }
  }

  return new Map(
    [...valuesByPlayer.entries()].map(([key, value]) => [
      key,
      {
        playerName: value.playerName,
        eventId: value.eventId,
        opponent: value.opponent,
        commenceTime: value.commenceTime,
        lines: Object.fromEntries(
          [...value.byStat.entries()].map(([stat, snapshot]) => [
            stat,
            {
              market: snapshot.market,
              point: Number(median(snapshot.values).toFixed(3)),
              bookmakerCount: snapshot.books.size,
            },
          ]),
        ),
      } satisfies VegasPlayerPropSnapshot,
    ] as const),
  );
}

function configuredMarkets() {
  const configured = process.env.THE_ODDS_API_MARKETS?.split(",")
    .map((market) => market.trim())
    .filter((market) => market in MARKET_TO_STAT);
  return configured && configured.length > 0 ? configured : [...DEFAULT_MARKETS];
}

async function oddsApiFetch<T>(path: string, apiKey: string) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `${ODDS_API_BASE}${path}${separator}apiKey=${encodeURIComponent(apiKey)}`,
    { next: { revalidate: 21_600 } },
  );
  if (!response.ok) {
    throw new Error(`The Odds API request failed (${response.status} ${response.statusText}).`);
  }
  return {
    value: (await response.json()) as T,
    quotaRemaining: Number(response.headers.get("x-requests-remaining")),
  };
}

export async function fetchVegasPlayerProps(): Promise<VegasPropsFeed> {
  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) {
    throw new OddsApiConfigError("Missing THE_ODDS_API_KEY.");
  }

  const markets = configuredMarkets();
  const maxEvents = Math.max(
    1,
    Math.min(18, Number(process.env.THE_ODDS_API_MAX_EVENTS ?? 16) || 16),
  );
  const eventsResponse = await oddsApiFetch<OddsApiEvent[]>(
    `/sports/${NFL_SPORT_KEY}/events?dateFormat=iso`,
    apiKey,
  );
  const now = Date.now();
  const events = eventsResponse.value
    .filter((event) => new Date(event.commence_time).getTime() >= now - 60 * 60 * 1000)
    .sort(
      (a, b) =>
        new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime(),
    )
    .slice(0, maxEvents);
  const eventOdds: OddsApiEventOdds[] = [];
  let quotaRemaining = eventsResponse.quotaRemaining;

  // Event props are only available one game at a time; sequential requests avoid bursts.
  for (const event of events) {
    const response = await oddsApiFetch<OddsApiEventOdds>(
      `/sports/${NFL_SPORT_KEY}/events/${event.id}/odds?regions=us&markets=${markets.join(",")}&oddsFormat=american&dateFormat=iso`,
      apiKey,
    );
    eventOdds.push(response.value);
    if (Number.isFinite(response.quotaRemaining)) {
      quotaRemaining = response.quotaRemaining;
    }
  }

  return {
    players: normalizeOddsApiPlayerProps(eventOdds),
    eventCount: events.length,
    requestCount: events.length + 1,
    markets,
    quotaRemaining: Number.isFinite(quotaRemaining) ? quotaRemaining : null,
    fetchedAt: new Date().toISOString(),
  };
}

function adjustmentWeight(options?: { seasonWeek?: number; preseason?: boolean }) {
  if (options?.preseason) {
    return 0.2;
  }
  const week = options?.seasonWeek ?? 1;
  return week <= 3 ? 0.18 : week <= 6 ? 0.14 : 0.1;
}

export function applyVegasPropsToCandidates(
  candidates: DraftCandidate[],
  feed: VegasPropsFeed,
  rules: FantasyScoringRules,
  options?: { seasonWeek?: number; preseason?: boolean; seasonGames?: number },
) {
  const weight = adjustmentWeight(options);
  const seasonGames = options?.seasonGames ?? 17;
  let appliedCount = 0;

  const adjustedCandidates = candidates.map((candidate) => {
    const prop = feed.players.get(normalizeName(candidate.player.fullName));
    if (!prop) {
      return candidate;
    }

    const stats: StatProjection = { ...candidate.projection.stats };
    const adjustments: VegasProjectionAdjustment[] = [];
    for (const [stat, line] of Object.entries(prop.lines) as Array<
      [keyof StatProjection, NonNullable<VegasPlayerPropSnapshot["lines"][keyof StatProjection]>]
    >) {
      const previousProjection = stats[stat];
      if (typeof previousProjection !== "number") {
        continue;
      }
      const seasonEquivalent = line.point * seasonGames;
      const maxChange = Math.max(1, Math.abs(previousProjection) * 0.12);
      const rawAdjustment = (seasonEquivalent - previousProjection) * weight;
      const adjustedProjection = Number(
        (previousProjection + Math.max(-maxChange, Math.min(maxChange, rawAdjustment))).toFixed(2),
      );
      stats[stat] = adjustedProjection;
      adjustments.push({
        stat,
        market: line.market,
        perGameLine: line.point,
        bookmakerCount: line.bookmakerCount,
        seasonEquivalent: Number(seasonEquivalent.toFixed(2)),
        previousProjection,
        adjustedProjection,
      });
    }

    if (adjustments.length === 0) {
      return candidate;
    }
    appliedCount += 1;
    const previousScore = scoreStatProjection(candidate.projection.stats, rules);
    const adjustedScore = scoreStatProjection(stats, rules);
    const projectionDelta = Number((adjustedScore - previousScore).toFixed(2));
    const vegas: CandidateVegasSnapshot = {
      status: "applied",
      eventId: prop.eventId,
      opponent: prop.opponent,
      commenceTime: prop.commenceTime,
      bookmakerCount: Math.max(...adjustments.map((adjustment) => adjustment.bookmakerCount)),
      marketCount: adjustments.length,
      projectionDelta,
      adjustments,
      summary: `${adjustments.length} consensus prop market${adjustments.length === 1 ? "" : "s"} moved the season-equivalent projection ${projectionDelta >= 0 ? "+" : ""}${projectionDelta.toFixed(1)} fantasy points within a 12% stat cap.`,
    };

    return {
      ...candidate,
      vegas,
      projection: {
        ...candidate.projection,
        stats,
      },
    } satisfies DraftCandidate;
  });

  return { candidates: adjustedCandidates, appliedCount };
}
