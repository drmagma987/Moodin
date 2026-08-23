import type { InSeasonPlayerSnapshot, PlayerPosition } from "@/lib/fantasy/types";
import type { YahooLeagueInventorySnapshot, YahooSnapshotPlayer } from "@/lib/fantasy/yahooBridge";

const REQUIRED_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE"];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function inventoryPlayerKey(player: YahooSnapshotPlayer) {
  return `${normalizeName(player.fullName)}|${(player.nflTeam ?? "").toUpperCase()}`;
}

export function applyYahooLeagueInventory(
  players: InSeasonPlayerSnapshot[],
  inventory: YahooLeagueInventorySnapshot,
  options?: { now?: string; maxAgeMinutes?: number },
) {
  const now = new Date(options?.now ?? new Date().toISOString());
  const ageMinutes = Math.max(0, (now.getTime() - new Date(inventory.completedAt).getTime()) / 60_000);
  const maxAgeMinutes = options?.maxAgeMinutes ?? 15;
  const byYahooId = new Map(inventory.players.map((player) => [player.providerPlayerId, player] as const));
  const byNameTeam = new Map(inventory.players.map((player) => [inventoryPlayerKey(player), player] as const));
  let matchedCount = 0;
  const nextPlayers = players.map((player) => {
    const yahooId = player.player.externalIds.yahoo;
    const matched = (yahooId ? byYahooId.get(yahooId) : undefined)
      ?? byNameTeam.get(`${normalizeName(player.player.fullName)}|${player.player.team.toUpperCase()}`);
    if (!matched) return player;
    matchedCount += 1;
    return {
      ...player,
      availability: matched.availability === "available"
        ? "free-agent"
        : matched.availability === "rostered" && matched.fantasyTeamId === inventory.myTeamId
          ? "my-roster"
          : matched.availability === "rostered"
            ? "league-rostered"
            : player.availability,
      rosterTeamId: matched.availability === "rostered" ? matched.fantasyTeamId : null,
    } satisfies InSeasonPlayerSnapshot;
  });
  const missingPositions = REQUIRED_POSITIONS.filter((position) => !inventory.coverage.availablePositions.includes(position));
  const blockers = [
    ...(inventory.coverage.partial ? ["Yahoo reported a partial inventory scan."] : []),
    ...(inventory.coverage.myRosterCaptured ? [] : ["The manager roster was not captured."]),
    ...(missingPositions.length > 0 ? [`Available-player coverage is missing ${missingPositions.join(", ")}.`] : []),
    ...(ageMinutes > maxAgeMinutes ? [`Yahoo inventory is stale (${Math.round(ageMinutes)} minutes old).`] : []),
    ...inventory.coverage.errors,
  ];
  return {
    players: nextPlayers,
    matchedCount,
    ageMinutes: Number(ageMinutes.toFixed(1)),
    transactionReady: blockers.length === 0,
    blockers,
  };
}
