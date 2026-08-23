import type { DraftCandidate, PlayerPosition } from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";

const FFC_PPR_ADP_URL =
  `https://fantasyfootballcalculator.com/api/v1/adp/ppr?position=all&teams=${leagueSourceOfTruth.teams}&year=${leagueSourceOfTruth.season}`;
const DRAFT_POSITIONS: PlayerPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const MINIMUM_ADP_ROWS = 150;

export type FantasyFootballCalculatorAdpRow = {
  playerId: string;
  name: string;
  position: PlayerPosition;
  team: string;
  adp: number;
  timesDrafted: number;
  standardDeviation: number | null;
};

export type FantasyFootballCalculatorAdpSource = {
  rows: FantasyFootballCalculatorAdpRow[];
  totalDrafts: number;
  startDate: string | null;
  endDate: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePosition(value: unknown): PlayerPosition | null {
  const position = readString(value)?.toUpperCase().replace("DEF", "DST").replace("PK", "K");
  return position && DRAFT_POSITIONS.includes(position as PlayerPosition)
    ? (position as PlayerPosition)
    : null;
}

export function parseFantasyFootballCalculatorAdp(
  payload: unknown,
): FantasyFootballCalculatorAdpSource {
  const root = asRecord(payload);
  const meta = asRecord(root?.meta);
  const players = Array.isArray(root?.players) ? root.players : [];
  const rows: FantasyFootballCalculatorAdpRow[] = [];

  for (const item of players) {
    const record = asRecord(item);
    const playerId = readNumber(record?.player_id);
    const name = readString(record?.name);
    const position = normalizePosition(record?.position);
    const team = readString(record?.team);
    const adp = readNumber(record?.adp);
    if (!record || playerId === null || !name || !position || !team || adp === null || adp <= 0) {
      continue;
    }
    rows.push({
      playerId: String(playerId),
      name,
      position,
      team,
      adp,
      timesDrafted: readNumber(record.times_drafted) ?? 0,
      standardDeviation: readNumber(record.stdev),
    });
  }

  if (rows.length < MINIMUM_ADP_ROWS) {
    throw new Error(
      `Fantasy Football Calculator returned only ${rows.length} usable PPR ADP rows; expected at least ${MINIMUM_ADP_ROWS}.`,
    );
  }

  return {
    rows,
    totalDrafts: readNumber(meta?.total_drafts) ?? 0,
    startDate: readString(meta?.start_date),
    endDate: readString(meta?.end_date),
  };
}

export function applyFantasyFootballCalculatorAdp(
  candidates: DraftCandidate[],
  source: FantasyFootballCalculatorAdpSource,
) {
  const byIdentity = new Map<string, FantasyFootballCalculatorAdpRow>(
    source.rows.map((row) => [
      `${normalizeName(row.name)}|${row.team.toUpperCase()}|${row.position}`,
      row,
    ] as const),
  );
  const byNameAndPosition = new Map<string, FantasyFootballCalculatorAdpRow>(
    source.rows.map((row) => [`${normalizeName(row.name)}|${row.position}`, row] as const),
  );
  let appliedCount = 0;

  const nextCandidates = candidates.map((candidate) => {
    const position = candidate.player.positions[0] ?? "WR";
    const identity = `${normalizeName(candidate.player.fullName)}|${candidate.player.team.toUpperCase()}|${position}`;
    const fallbackIdentity = `${normalizeName(candidate.player.fullName)}|${position}`;
    const row = byIdentity.get(identity) ?? byNameAndPosition.get(fallbackIdentity);
    if (!row) return candidate;
    appliedCount += 1;
    return {
      ...candidate,
      market: {
        ...candidate.market,
        adp: row.adp,
        adpSource: "direct",
        adpProvider: "fantasy-football-calculator",
      },
    } satisfies DraftCandidate;
  });

  return {
    candidates: nextCandidates,
    appliedCount,
    unmatchedCount: Math.max(0, source.rows.length - appliedCount),
  };
}

export async function fetchFantasyFootballCalculatorAdp() {
  const response = await fetch(FFC_PPR_ADP_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Fantasy Football Calculator PPR ADP request failed (${response.status} ${response.statusText}).`,
    );
  }
  return parseFantasyFootballCalculatorAdp(await response.json());
}
