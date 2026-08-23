import type { Tank01LivePlayerSnapshot, Tank01ProviderStatus } from "@/lib/fantasy/types";

const TANK01_API_BASE = "https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

class Tank01ConfigError extends Error {}
class Tank01ResponseError extends Error {}

function getTank01Config() {
  const apiKey = process.env.TANK01_RAPIDAPI_KEY?.trim();
  const host = process.env.TANK01_RAPIDAPI_HOST?.trim();

  if (!apiKey || !host) {
    throw new Tank01ConfigError(
      "Missing TANK01_RAPIDAPI_KEY or TANK01_RAPIDAPI_HOST.",
    );
  }

  return { apiKey, host };
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

  return 0;
}

function readString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return undefined;
}

async function fetchTank01Json<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
) {
  const { apiKey, host } = getTank01Config();
  const url = new URL(`${TANK01_API_BASE}${path}`);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": host,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 200);
    throw new Tank01ResponseError(
      `Tank01 request failed (${response.status} ${response.statusText}): ${snippet}`,
    );
  }

  return (await response.json()) as T;
}

export function getTank01ProviderStatus(): Tank01ProviderStatus {
  const configured = Boolean(
    process.env.TANK01_RAPIDAPI_KEY?.trim() && process.env.TANK01_RAPIDAPI_HOST?.trim(),
  );

  return {
    configured,
    liveReady: configured,
    message: configured
      ? "Tank01 RapidAPI credentials are configured and ready for in-season live-state experiments."
      : "Set TANK01_RAPIDAPI_KEY and TANK01_RAPIDAPI_HOST to enable Tank01 live in-game provider experiments.",
  };
}

export async function fetchTank01LivePlayerSnapshots() {
  const payload = await fetchTank01Json<unknown>("/getNFLPlayerStats", {
    week: "current",
  });
  const root = asRecord(payload);
  const body = Array.isArray(root?.body) ? root.body : [];
  const snapshots = new Map<string, Tank01LivePlayerSnapshot>();

  for (const row of body) {
    const record = asRecord(row);
    if (!record) {
      continue;
    }

    const playerId = readString(record.playerID, record.playerId, record.player_id);
    if (!playerId) {
      continue;
    }

    snapshots.set(playerId, {
      gameStatus:
        readString(record.gameStatus)?.toLowerCase() === "final"
          ? "final"
          : readString(record.gameStatus)?.toLowerCase() === "live"
            ? "live"
            : "pregame",
      updatedAt: readString(record.updated, record.lastUpdated) ?? new Date().toISOString(),
      rushingAttempts: readNumber(record.rushAttempts, record.carries),
      targets: readNumber(record.targets),
      receptions: readNumber(record.receptions),
      rushingYards: readNumber(record.rushYards, record.rushingYards),
      receivingYards: readNumber(record.receivingYards, record.recYards),
      touchdowns: readNumber(record.totalTD, record.touchdowns),
    });
  }

  return snapshots;
}

export function isTank01ConfigError(error: unknown) {
  return error instanceof Tank01ConfigError;
}
