import { buildCanonicalPlayers } from "@/lib/fantasy/identity";
import { scoreStatProjection, yahooLeagueConfig } from "@/lib/fantasy/scoring";
import type {
  DraftCandidate,
  MarketSnapshot,
  PlayerPosition,
  ProjectionSnapshot,
  ProviderPlayerRecord,
  StatProjection,
} from "@/lib/fantasy/types";

const FANTASYPROS_API_BASE = "https://api.fantasypros.com/public/v2/json";
const DRAFT_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

class FantasyProsConfigError extends Error {}
class FantasyProsResponseError extends Error {}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFantasyProsApiKey() {
  const apiKey = process.env.FANTASYPROS_API_KEY?.trim();
  if (!apiKey) {
    throw new FantasyProsConfigError("Missing FANTASYPROS_API_KEY.");
  }
  return apiKey;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
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

function normalizePositionList(input: unknown): PlayerPosition[] {
  if (!Array.isArray(input)) {
    const single = readString(input);
    return single && DRAFT_POSITIONS.includes(single as PlayerPosition)
      ? [single as PlayerPosition]
      : [];
  }

  return input
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      const record = asRecord(entry);
      return readString(record?.name, record?.position, record?.position_id);
    })
    .filter((position): position is PlayerPosition =>
      Boolean(position && DRAFT_POSITIONS.includes(position as PlayerPosition)),
    );
}

async function fetchFantasyProsJson<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
) {
  const apiKey = getFantasyProsApiKey();
  const url = new URL(`${FANTASYPROS_API_BASE}${path}`);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const snippet = (await response.text()).slice(0, 200);
    if (response.status === 429 && attempt < 2) {
      await wait(700 * (attempt + 1));
      continue;
    }

    throw new FantasyProsResponseError(
      `FantasyPros request failed (${response.status} ${response.statusText}): ${snippet}`,
    );
  }

  throw new FantasyProsResponseError("FantasyPros request failed after retries.");
}

function normalizePlayerRecord(item: unknown): ProviderPlayerRecord | null {
  const record = asRecord(item);
  if (!record) {
    return null;
  }

  const fantasyProsId = readString(
    record.player_id,
    record.id,
    record.fpid,
    record.playerId,
  );
  const fullName = readString(
    record.player_name,
    record.name,
    record.full_name,
    record.playerName,
  );
  const team = readString(
    record.player_team_id,
    record.team_id,
    record.team,
    record.player_team,
  );
  const positions = normalizePositionList(
    record.positions ??
      record.player_positions ??
      record.fantasy_positions ??
      record.player_position_id ??
      record.position_id ??
      record.position,
  );

  if (!fantasyProsId || !fullName || !team || positions.length === 0) {
    return null;
  }

  return {
    provider: "fantasypros",
    providerPlayerId: fantasyProsId,
    fullName,
    team,
    positions,
    rookie: Boolean(record.is_rookie ?? record.rookie),
    age: readNumber(record.age),
    externalIds: {
      fantasyPros: fantasyProsId,
      yahoo: readString(record.yahoo_id, record.player_yahoo_id, record.yahooPlayerId),
      sleeper: readString(record.sleeper_id, record.sleeperPlayerId),
      nflverse: readString(record.gsis_id, record.nflverse_id),
    },
  };
}

export function extractFantasyProsStats(record: Record<string, unknown>): StatProjection {
  const statsRecord = asRecord(record.stats) ?? record;

  return {
    passingYards: readNumber(
      statsRecord.pass_yds,
      statsRecord.passing_yds,
      statsRecord.pass_yards,
      statsRecord.passYards,
    ),
    passingTouchdowns: readNumber(
      statsRecord.pass_td,
      statsRecord.passing_td,
      statsRecord.pass_tds,
      statsRecord.passTouchdowns,
    ),
    interceptions: readNumber(
      statsRecord.pass_int,
      statsRecord.pass_ints,
      statsRecord.interceptions,
      statsRecord.ints,
      statsRecord.passInt,
    ),
    rushingYards: readNumber(
      statsRecord.rush_yds,
      statsRecord.rushing_yds,
      statsRecord.rush_yards,
      statsRecord.rushYards,
    ),
    rushingTouchdowns: readNumber(
      statsRecord.rush_td,
      statsRecord.rushing_td,
      statsRecord.rush_tds,
      statsRecord.rushTouchdowns,
    ),
    receptions: readNumber(
      statsRecord.rec_rec,
      statsRecord.rec,
      statsRecord.receptions,
      statsRecord.catches,
    ),
    receivingYards: readNumber(
      statsRecord.rec_yds,
      statsRecord.receiving_yds,
      statsRecord.rec_yards,
      statsRecord.receivingYards,
    ),
    receivingTouchdowns: readNumber(
      statsRecord.rec_td,
      statsRecord.receiving_td,
      statsRecord.rec_tds,
      statsRecord.receivingTouchdowns,
    ),
    fumblesLost: readNumber(
      statsRecord.fum_lost,
      statsRecord.fumbles_lost,
      statsRecord.fumblesLost,
    ),
    twoPointConversions: readNumber(
      statsRecord.two_pt,
      statsRecord["2pt_tds"],
      statsRecord.two_point_conversions,
      statsRecord.twoPointConversions,
    ),
  };
}

function estimateProjectionRange(
  medianPoints: number,
  position: PlayerPosition,
  expertStdDev?: number,
) {
  const baseSpreadByPosition: Record<PlayerPosition, number> = {
    QB: 28,
    RB: 36,
    WR: 34,
    TE: 26,
    K: 18,
    DST: 16,
  };
  const spread = Math.max(baseSpreadByPosition[position], (expertStdDev ?? 0) * 5.2);

  return {
    p10: Number(Math.max(0, medianPoints - spread).toFixed(2)),
    p50: Number(medianPoints.toFixed(2)),
    p90: Number((medianPoints + spread * 1.12).toFixed(2)),
  };
}

function normalizeProjectionSnapshot(
  item: unknown,
  marketByPlayerId: Map<string, MarketSnapshot>,
  playerPositionById: Map<string, PlayerPosition>,
): ProjectionSnapshot | null {
  const record = asRecord(item);
  if (!record) {
    return null;
  }

  const playerId = readString(record.player_id, record.id, record.fpid);
  if (!playerId) {
    return null;
  }

  const position = playerPositionById.get(playerId);
  if (!position) {
    return null;
  }

  const stats = extractFantasyProsStats(record);
  const medianPoints =
    readNumber(
      record.points_ppr,
      record.projected_points,
      record.points,
      record.fantasy_points,
      asRecord(record.stats)?.points_ppr,
      asRecord(record.stats)?.points_half,
      asRecord(record.stats)?.points,
    ) ?? scoreStatProjection(stats, yahooLeagueConfig.scoring);

  return {
    season: readNumber(record.season) ?? 2026,
    provider: "fantasypros",
    scoringType: "PPR",
    asOf: new Date().toISOString(),
    playerId,
    stats,
    range: estimateProjectionRange(
      medianPoints,
      position,
      marketByPlayerId.get(playerId)?.expertStdDev,
    ),
  };
}

async function fetchFantasyProsProjections() {
  const responses = [];
  for (const position of DRAFT_POSITIONS) {
    responses.push(
      await fetchFantasyProsJson<{ players?: unknown[] }>("/nfl/2026/projections", {
        week: 0,
        position,
        scoring: "PPR",
        limit: 100,
      }),
    );
    await wait(180);
  }

  return responses.flatMap((response) => response.players ?? []);
}

export async function fetchFantasyProsProjectionCandidates() {
  const projectionRows = await fetchFantasyProsProjections();
  const projectionPlayerRecords = projectionRows
    .map(normalizePlayerRecord)
    .filter((record): record is ProviderPlayerRecord => record !== null);

  const playerPositionById = new Map<string, PlayerPosition>();
  for (const record of projectionPlayerRecords) {
    playerPositionById.set(record.providerPlayerId, record.positions[0] ?? "WR");
  }

  const emptyMarketByPlayerId = new Map<string, MarketSnapshot>();
  const projectionByPlayerId = new Map<string, ProjectionSnapshot>();
  for (const row of projectionRows) {
    const projection = normalizeProjectionSnapshot(row, emptyMarketByPlayerId, playerPositionById);
    if (projection) {
      projectionByPlayerId.set(projection.playerId, projection);
    }
  }

  const canonicalPlayers = buildCanonicalPlayers(projectionPlayerRecords);

  return canonicalPlayers
    .map((player) => {
      const fantasyProsId = player.externalIds.fantasyPros;
      if (!fantasyProsId) {
        return null;
      }

      const projection = projectionByPlayerId.get(fantasyProsId);
      if (!projection) {
        return null;
      }

      return {
        player,
        projection,
      };
    })
    .filter((candidate): candidate is { player: DraftCandidate["player"]; projection: ProjectionSnapshot } => candidate !== null);
}

// Backward-compatible name for older callers. This response is deliberately a
// projection overlay, not a rankings/ADP candidate pool.
export const fetchFantasyProsDraftCandidates = fetchFantasyProsProjectionCandidates;

export function isFantasyProsConfigError(error: unknown) {
  return error instanceof FantasyProsConfigError;
}
