import type { DraftCandidate } from "@/lib/fantasy/types";

export type PersonalTargetTag = {
  playerId: string;
  playerName: string;
  team: string;
  addedAt: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function createPersonalTargetTag(
  candidate: DraftCandidate,
  addedAt = new Date().toISOString(),
): PersonalTargetTag {
  return {
    playerId: candidate.player.id,
    playerName: candidate.player.fullName,
    team: candidate.player.team,
    addedAt,
  };
}

export function parsePersonalTargetTags(value: string | unknown) {
  const messages: string[] = [];
  let parsed: unknown;

  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return { targets: [] as PersonalTargetTag[], messages: ["Target backup is not valid JSON."] };
  }

  const root = asRecord(parsed);
  const rows = Array.isArray(parsed) ? parsed : root && Array.isArray(root.targets) ? root.targets : null;
  if (!rows) {
    return {
      targets: [] as PersonalTargetTag[],
      messages: ["Target backup must be an array or an object with a targets array."],
    };
  }

  const targets: PersonalTargetTag[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const record = asRecord(row);
    const playerId = record ? readString(record.playerId) : null;
    const playerName = record ? readString(record.playerName) : null;
    if (!record || (!playerId && !playerName)) {
      messages.push(`Target row ${index + 1} skipped: missing player identity.`);
      continue;
    }

    const identity = playerId ?? `${normalizeName(playerName!)}|${readString(record.team) ?? ""}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    targets.push({
      playerId: playerId ?? "",
      playerName: playerName ?? playerId!,
      team: readString(record.team) ?? "",
      addedAt: readString(record.addedAt) ?? new Date(0).toISOString(),
    });
  }

  return { targets, messages };
}

export function resolvePersonalTargetTags(
  targets: PersonalTargetTag[],
  candidates: DraftCandidate[],
) {
  const matched: PersonalTargetTag[] = [];
  const unmatched: PersonalTargetTag[] = [];

  for (const target of targets) {
    const candidate =
      candidates.find((item) => target.playerId && item.player.id === target.playerId) ??
      candidates.find(
        (item) =>
          normalizeName(item.player.fullName) === normalizeName(target.playerName) &&
          (!target.team || item.player.team.toUpperCase() === target.team.toUpperCase()),
      );
    if (!candidate) {
      unmatched.push(target);
      continue;
    }
    matched.push(createPersonalTargetTag(candidate, target.addedAt));
  }

  return { matched, unmatched };
}

export function serializePersonalTargetTags(targets: PersonalTargetTag[], leagueId: string) {
  return JSON.stringify(
    {
      version: 1,
      leagueId,
      exportedAt: new Date().toISOString(),
      targets,
    },
    null,
    2,
  );
}
