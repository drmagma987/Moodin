import { parseCsv } from "@/lib/fantasy/csv";
import type { DraftCandidate, PlayerPosition } from "@/lib/fantasy/types";

const NFLVERSE_PLAYERS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv";

export type NflversePlayerProfile = {
  gsisId: string;
  displayName: string;
  position: PlayerPosition;
  latestTeam: string;
  rookieSeason: number | null;
  draftYear: number | null;
  draftRound: number | null;
  draftPick: number | null;
  draftTeam: string | null;
  college: string | null;
  height: number | null;
  weight: number | null;
  birthDate: string | null;
};

function numberOrNull(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positionOrNull(value: string | undefined): PlayerPosition | null {
  const position = value?.trim().toUpperCase();
  return position && ["QB", "RB", "WR", "TE", "K"].includes(position)
    ? position as PlayerPosition
    : null;
}

export function normalizeNflversePlayerName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function parseNflversePlayersCsv(csv: string) {
  const profiles: NflversePlayerProfile[] = [];
  for (const row of parseCsv(csv)) {
    const gsisId = row.gsis_id?.trim();
    const displayName = row.display_name?.trim();
    const position = positionOrNull(row.position);
    if (!gsisId || !displayName || !position) continue;
    profiles.push({
      gsisId,
      displayName,
      position,
      latestTeam: row.latest_team?.trim() || "FA",
      rookieSeason: numberOrNull(row.rookie_season),
      draftYear: numberOrNull(row.draft_year),
      draftRound: numberOrNull(row.draft_round),
      draftPick: numberOrNull(row.draft_pick),
      draftTeam: row.draft_team?.trim() || null,
      college: row.college_name?.trim() || null,
      height: numberOrNull(row.height),
      weight: numberOrNull(row.weight),
      birthDate: row.birth_date?.trim() || null,
    });
  }
  return profiles;
}

function ageOnDate(birthDate: string | null, asOf: Date) {
  if (!birthDate) return undefined;
  const born = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return undefined;
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = asOf.getUTCMonth() < born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() && asOf.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function enrichCandidatesWithNflverseProfiles(
  candidates: DraftCandidate[],
  profiles: NflversePlayerProfile[],
  asOf = new Date("2026-09-01T00:00:00Z"),
) {
  const profilesByName = new Map<string, NflversePlayerProfile[]>();
  for (const profile of profiles) {
    const key = normalizeNflversePlayerName(profile.displayName);
    profilesByName.set(key, [...(profilesByName.get(key) ?? []), profile]);
  }
  let appliedCount = 0;
  const enriched = candidates.map((candidate) => {
    if (candidate.player.externalIds.nflverse) return candidate;
    const position = candidate.player.positions[0];
    const matches = (profilesByName.get(normalizeNflversePlayerName(candidate.player.fullName)) ?? [])
      .filter((profile) => profile.position === position);
    if (matches.length !== 1) return candidate;
    const profile = matches[0];
    appliedCount += 1;
    return {
      ...candidate,
      player: {
        ...candidate.player,
        age: candidate.player.age ?? ageOnDate(profile.birthDate, asOf),
        externalIds: { ...candidate.player.externalIds, nflverse: profile.gsisId },
        sources: [...new Set([...candidate.player.sources, "nflverse" as const])],
      },
    } satisfies DraftCandidate;
  });
  return { candidates: enriched, appliedCount };
}

export async function fetchNflversePlayerProfiles() {
  // The canonical player file exceeds Next's per-item data-cache limit.
  // Avoid a slow, doomed cache write on the command-center request path.
  const response = await fetch(NFLVERSE_PLAYERS_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`nflverse players request failed (${response.status} ${response.statusText}).`);
  }
  const profiles = parseNflversePlayersCsv(await response.text());
  if (profiles.length === 0) throw new Error("nflverse players feed contained no usable profiles.");
  return profiles;
}
