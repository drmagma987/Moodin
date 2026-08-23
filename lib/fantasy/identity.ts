import type {
  CanonicalPlayer,
  ExternalPlayerIds,
  ProviderPlayerRecord,
} from "@/lib/fantasy/types";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function bestIdentityKey(record: ProviderPlayerRecord) {
  const ids = record.externalIds ?? {};
  return (
    ids.fantasyPros ??
    ids.yahoo ??
    ids.sleeper ??
    ids.nflverse ??
    ids.tank01 ??
    `${normalizeName(record.fullName)}:${record.team}:${record.positions.join("/")}`
  );
}

function mergeExternalIds(
  existing: ExternalPlayerIds,
  incoming?: ExternalPlayerIds,
): ExternalPlayerIds {
  return {
    fantasyPros: incoming?.fantasyPros ?? existing.fantasyPros,
    yahoo: incoming?.yahoo ?? existing.yahoo,
    sleeper: incoming?.sleeper ?? existing.sleeper,
    nflverse: incoming?.nflverse ?? existing.nflverse,
    tank01: incoming?.tank01 ?? existing.tank01,
  };
}

export function buildCanonicalPlayers(records: ProviderPlayerRecord[]) {
  const canonical = new Map<string, CanonicalPlayer>();

  for (const record of records) {
    const key = bestIdentityKey(record);
    const existing = canonical.get(key);

    if (!existing) {
      canonical.set(key, {
        id: key,
        fullName: record.fullName,
        team: record.team,
        positions: record.positions,
        rookie: record.rookie ?? false,
        age: record.age,
        externalIds: record.externalIds ?? {},
        sources: [record.provider],
      });
      continue;
    }

    existing.externalIds = mergeExternalIds(existing.externalIds, record.externalIds);
    existing.sources = Array.from(new Set([...existing.sources, record.provider]));
    existing.rookie = existing.rookie || Boolean(record.rookie);
    existing.age = existing.age ?? record.age;
  }

  return Array.from(canonical.values());
}
