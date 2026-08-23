import type { PlayerPosition } from "@/lib/fantasy/types";

const SLEEPER_API_BASE = "https://api.sleeper.app/v1";
const DRAFT_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K"];

type SleeperPlayerRecord = {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string;
  fantasy_positions?: string[];
  position?: string;
  active?: boolean;
  depth_chart_order?: number | null;
  depth_chart_position?: number | null;
  injury_status?: string | null;
  practice_participation?: string | null;
};

type SleeperTrendRecord = {
  player_id?: string;
  count?: number;
};

type SleeperDirectionalTrendSnapshot = {
  playerId: string;
  trend: "add" | "drop";
  count: number;
};

export type SleeperTrendSnapshot = {
  playerId: string;
  trend: "add" | "drop" | "steady";
  count: number;
};

export type SleeperPlayerSnapshot = {
  playerId: string;
  fullName: string;
  team: string;
  position: PlayerPosition;
  depthChartOrder: number | null;
  injuryStatus: string | null;
  practiceParticipation: string | null;
};

function asPosition(input: string | undefined): PlayerPosition | null {
  if (!input) {
    return null;
  }

  return DRAFT_POSITIONS.includes(input as PlayerPosition) ? (input as PlayerPosition) : null;
}

async function fetchSleeperJson<T>(path: string) {
  const response = await fetch(`${SLEEPER_API_BASE}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Sleeper request failed (${response.status} ${response.statusText}).`);
  }

  return (await response.json()) as T;
}

async function fetchSleeperPlayersByPosition(position: PlayerPosition) {
  const data = await fetchSleeperJson<Record<string, SleeperPlayerRecord>>(
    `/players/nfl?position=${position}&active=true`,
  );

  return Object.values(data)
    .map((record) => {
      const playerId = record.player_id;
      const inferredPosition = asPosition(record.position ?? record.fantasy_positions?.[0]);
      const fullName =
        record.full_name ??
        [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
      const team = record.team ?? "";

      if (!playerId || !inferredPosition || !fullName || !team) {
        return null;
      }

      return {
        playerId,
        fullName,
        team,
        position: inferredPosition,
        depthChartOrder: record.depth_chart_order ?? record.depth_chart_position ?? null,
        injuryStatus: record.injury_status ?? null,
        practiceParticipation: record.practice_participation ?? null,
      } satisfies SleeperPlayerSnapshot;
    })
    .filter((record): record is SleeperPlayerSnapshot => record !== null);
}

async function fetchSleeperTrending(type: "add" | "drop", limit = 250) {
  const data = await fetchSleeperJson<SleeperTrendRecord[]>(
    `/players/nfl/trending/${type}?lookback_hours=48&limit=${limit}`,
  );

  return data
    .map((record) => {
      if (!record.player_id || typeof record.count !== "number") {
        return null;
      }

      return {
        playerId: record.player_id,
        trend: type,
        count: record.count,
      } satisfies SleeperDirectionalTrendSnapshot;
    })
    .filter((record): record is SleeperDirectionalTrendSnapshot => record !== null);
}

export async function fetchSleeperMarketSignals() {
  const [playerGroups, addTrends, dropTrends] = await Promise.all([
    Promise.all(DRAFT_POSITIONS.map((position) => fetchSleeperPlayersByPosition(position))),
    fetchSleeperTrending("add"),
    fetchSleeperTrending("drop"),
  ]);

  const players = new Map<string, SleeperPlayerSnapshot>();
  for (const group of playerGroups) {
    for (const player of group) {
      players.set(player.playerId, player);
    }
  }

  const trends = new Map<string, SleeperTrendSnapshot>();
  for (const trend of addTrends) {
    trends.set(trend.playerId, trend);
  }

  for (const trend of dropTrends) {
    const existing = trends.get(trend.playerId);
    if (!existing || trend.count > existing.count) {
      trends.set(trend.playerId, trend);
    }
  }

  return {
    players,
    trends,
  };
}
