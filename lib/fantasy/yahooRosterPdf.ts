import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import type { InSeasonPlayerSnapshot, InSeasonTeamSnapshot, PlayerPosition } from "@/lib/fantasy/types";
import type { YahooLeagueInventorySnapshot, YahooSnapshotPlayer } from "@/lib/fantasy/yahooBridge";

export type YahooPdfTextLine = {
  page: number;
  column: "left" | "right";
  y: number;
  text: string;
};

export type YahooRosterPdfTeamPreview = {
  teamId: string;
  teamName: string;
  players: Array<{
    playerId: string;
    playerName: string;
    rosterStatusLabel: string | null;
  }>;
  rosterRows: number;
};

export type YahooRosterPdfPreview = {
  capturedAt: string;
  teams: YahooRosterPdfTeamPreview[];
  matchedPlayers: number;
  detectedTeams: number;
  duplicatePlayerNames: string[];
  unmatchedRosterRows: number;
  unmatchedRows: Array<{ teamId: string; teamName: string; page: number; text: string }>;
  ambiguousRows: Array<{ teamId: string; teamName: string; page: number; text: string; candidates: string[] }>;
  ownershipChanges: Array<{
    playerId: string;
    playerName: string;
    fromTeamId: string | null;
    fromTeamName: string | null;
    toTeamId: string | null;
    toTeamName: string | null;
  }>;
  warnings: string[];
  blockers: string[];
  ready: boolean;
};

type PdfJsTextItem = {
  str: string;
  transform: number[];
  width: number;
};

export async function extractYahooRosterPdfLines(file: File): Promise<YahooPdfTextLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: YahooPdfTextLine[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const textItems = content.items.filter((item) => "str" in item && item.str.trim().length > 0) as PdfJsTextItem[];
    const items = textItems.map((item) => ({
        text: item.str.trim(),
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: item.width ?? 0,
        column: (item.transform[4] ?? 0) < viewport.width / 2 ? "left" as const : "right" as const,
      }));

    for (const column of ["left", "right"] as const) {
      const groups: Array<{ y: number; items: typeof items }> = [];
      for (const item of items.filter((entry) => entry.column === column).sort((a, b) => b.y - a.y || a.x - b.x)) {
        const group = groups.find((entry) => Math.abs(entry.y - item.y) <= 2);
        if (group) group.items.push(item);
        else groups.push({ y: item.y, items: [item] });
      }
      for (const group of groups) {
        lines.push({
          page: pageNumber,
          column,
          y: group.y,
          text: group.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
        });
      }
    }
  }

  return lines;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasRosterSlot(line: string) {
  return /^\s*(QB|RB|WR|TE|K|BN|IR|W\/R\/T)\b/i.test(line);
}

function statusFromLine(line: string) {
  const statuses = line.match(/\b(IR|PUP|NFI|O|Q|D|SUSP|CEL)\b/gi) ?? [];
  return statuses.length > 0 ? statuses.join(" ").toUpperCase() : null;
}

function containsNormalized(haystack: string, needle: string) {
  return haystack === needle || haystack.startsWith(`${needle} `) || haystack.endsWith(` ${needle}`) || haystack.includes(` ${needle} `);
}

export function parseYahooRosterPdfLines(
  lines: YahooPdfTextLine[],
  players: InSeasonPlayerSnapshot[],
  leagueTeams: InSeasonTeamSnapshot[],
  capturedAt = new Date().toISOString(),
): YahooRosterPdfPreview {
  const knownTeams = leagueTeams
    .flatMap((team) => [team.name, ...(team.aliases ?? [])].map((name) => ({
      ...team,
      normalized: normalize(name),
    })))
    .filter((team) => team.normalized.length > 0)
    .sort((a, b) => b.normalized.length - a.normalized.length);
  const knownPlayers = players
    .map((player) => ({ player, normalized: normalize(player.player.fullName) }))
    .filter((entry) => entry.normalized.length >= 4)
    .sort((a, b) => b.normalized.length - a.normalized.length);
  const previews = new Map<string, YahooRosterPdfTeamPreview>(
    leagueTeams.map((team) => [team.teamId, { teamId: team.teamId, teamName: team.name, players: [], rosterRows: 0 }]),
  );
  const currentTeamByColumn = new Map<YahooPdfTextLine["column"], string>();
  const seenPlayerOwners = new Map<string, string[]>();
  const detectedTeamIds = new Set<string>();
  const inferredTeamIds = new Set<string>();
  const unmatchedRows: YahooRosterPdfPreview["unmatchedRows"] = [];
  const ambiguousRows: YahooRosterPdfPreview["ambiguousRows"] = [];

  const orderedLines = [...lines].sort((a, b) =>
    a.page - b.page || a.column.localeCompare(b.column) || b.y - a.y,
  );

  // Yahoo team names are mutable. When a page/column block has no recognized
  // header, reconcile it only from a strong majority of its already-owned
  // player rows. This tolerates a rename and a few waiver moves without ever
  // guessing when two teams are plausible.
  const inferredTeamByBlock = new Map<string, string>();
  const blocks = new Map<string, YahooPdfTextLine[]>();
  for (const line of orderedLines) {
    const key = `${line.page}:${line.column}`;
    blocks.set(key, [...(blocks.get(key) ?? []), line]);
  }
  for (const [key, blockLines] of blocks) {
    const exactIds = new Set(blockLines.flatMap((line) => {
      const normalizedLine = normalize(line.text);
      const team = knownTeams.find((entry) => containsNormalized(normalizedLine, entry.normalized));
      return team ? [team.teamId] : [];
    }));
    if (exactIds.size === 1) {
      inferredTeamByBlock.set(key, [...exactIds][0]);
      continue;
    }
    if (exactIds.size > 1) continue;
    const ownerCounts = new Map<string, number>();
    let matchedRows = 0;
    for (const line of blockLines.filter((entry) => hasRosterSlot(entry.text))) {
      const normalizedLine = normalize(line.text);
      const matches = knownPlayers.filter((entry) => containsNormalized(normalizedLine, entry.normalized));
      if (matches.length !== 1) continue;
      matchedRows += 1;
      const owner = matches[0].player.rosterTeamId;
      if (owner) ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    }
    const ranked = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1]);
    const [leaderId, leaderCount] = ranked[0] ?? [];
    const runnerUpCount = ranked[1]?.[1] ?? 0;
    if (leaderId && leaderCount >= 8 && leaderCount >= runnerUpCount + 3 && leaderCount / Math.max(1, matchedRows) >= 0.6) {
      inferredTeamByBlock.set(key, leaderId);
      inferredTeamIds.add(leaderId);
    }
  }

  for (const line of orderedLines) {
    const inferredTeamId = inferredTeamByBlock.get(`${line.page}:${line.column}`);
    if (inferredTeamId) {
      currentTeamByColumn.set(line.column, inferredTeamId);
      detectedTeamIds.add(inferredTeamId);
    }
    const normalizedLine = normalize(line.text);
    if (!normalizedLine) continue;
    const team = knownTeams.find((entry) => containsNormalized(normalizedLine, entry.normalized));
    if (team) {
      currentTeamByColumn.set(line.column, team.teamId);
      detectedTeamIds.add(team.teamId);
      continue;
    }

    const currentTeamId = currentTeamByColumn.get(line.column);
    if (!currentTeamId) continue;
    const preview = previews.get(currentTeamId);
    if (!preview) continue;
    const rosterRow = hasRosterSlot(line.text);
    if (rosterRow) preview.rosterRows += 1;

    const matches = knownPlayers.filter((entry) => containsNormalized(normalizedLine, entry.normalized));
    if (matches.length === 0) {
      if (rosterRow) unmatchedRows.push({ teamId: currentTeamId, teamName: preview.teamName, page: line.page, text: line.text });
      continue;
    }
    if (matches.length > 1) {
      if (rosterRow) ambiguousRows.push({ teamId: currentTeamId, teamName: preview.teamName, page: line.page, text: line.text, candidates: matches.map((entry) => entry.player.player.fullName) });
      continue;
    }
    const player = matches[0];
    if (preview.players.some((entry) => entry.playerId === player.player.player.id)) continue;
    preview.players.push({
      playerId: player.player.player.id,
      playerName: player.player.player.fullName,
      rosterStatusLabel: statusFromLine(line.text),
    });
    const owners = seenPlayerOwners.get(player.player.player.id) ?? [];
    owners.push(currentTeamId);
    seenPlayerOwners.set(player.player.player.id, owners);
  }

  const teams = leagueTeams.map((team) => previews.get(team.teamId)!);
  const duplicatePlayerNames = [...seenPlayerOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1)
    .map(([playerId]) => players.find((player) => player.player.id === playerId)?.player.fullName ?? playerId);
  const unmatchedRosterRows = unmatchedRows.length + ambiguousRows.length;
  const teamNameById = new Map(leagueTeams.map((team) => [team.teamId, team.name] as const));
  const importedOwnerByPlayerId = new Map<string, string>();
  for (const team of teams) for (const player of team.players) importedOwnerByPlayerId.set(player.playerId, team.teamId);
  const ownershipChanges = players.flatMap((player) => {
    const fromTeamId = player.rosterTeamId;
    const toTeamId = importedOwnerByPlayerId.get(player.player.id) ?? null;
    if (fromTeamId === toTeamId) return [];
    return [{
      playerId: player.player.id,
      playerName: player.player.fullName,
      fromTeamId,
      fromTeamName: fromTeamId ? teamNameById.get(fromTeamId) ?? fromTeamId : null,
      toTeamId,
      toTeamName: toTeamId ? teamNameById.get(toTeamId) ?? toTeamId : null,
    }];
  });
  const suspiciousTeams = teams.filter((team) => team.players.length < 14 || team.players.length > 18);
  const blockers = [
    ...(detectedTeamIds.size === leagueSourceOfTruth.teams ? [] : [`Found ${detectedTeamIds.size}/${leagueSourceOfTruth.teams} league teams.`]),
    ...(duplicatePlayerNames.length === 0 ? [] : [`Duplicate players: ${duplicatePlayerNames.join(", ")}.`]),
    ...(unmatchedRosterRows === 0 ? [] : [`${unmatchedRosterRows} roster row${unmatchedRosterRows === 1 ? "" : "s"} could not be matched to a modeled player.`]),
    ...(ambiguousRows.length === 0 ? [] : [`${ambiguousRows.length} roster row${ambiguousRows.length === 1 ? " is" : "s are"} ambiguous.`]),
    ...(suspiciousTeams.length === 0 ? [] : [`Unexpected roster count for ${suspiciousTeams.map((team) => `${team.teamName} (${team.players.length})`).join(", ")}.`]),
  ];
  const matchedPlayers = teams.reduce((total, team) => total + team.players.length, 0);
  const warnings = [
    ...(matchedPlayers < 150 ? [`Only ${matchedPlayers} total players were matched; a normal ten-team export should be materially larger.`] : []),
    ...(inferredTeamIds.size > 0 ? [`Reconciled ${inferredTeamIds.size} renamed team block${inferredTeamIds.size === 1 ? "" : "s"} from a strong majority of existing player ownership. Review that team before applying.`] : []),
    ...teams.filter((team) => team.rosterRows === 0).map((team) => `${team.teamName} had no recognizable roster-slot rows.`),
  ];
  if (matchedPlayers < 140) blockers.push("The PDF is too incomplete to replace league ownership.");

  return {
    capturedAt,
    teams,
    matchedPlayers,
    detectedTeams: detectedTeamIds.size,
    duplicatePlayerNames,
    unmatchedRosterRows,
    unmatchedRows,
    ambiguousRows,
    ownershipChanges,
    warnings,
    blockers,
    ready: blockers.length === 0,
  };
}

export function buildYahooInventoryFromPdfPreview(
  preview: YahooRosterPdfPreview,
  players: InSeasonPlayerSnapshot[],
  myTeamId: string,
): YahooLeagueInventorySnapshot {
  if (!preview.ready) throw new Error(`Roster PDF is not safe to apply: ${preview.blockers.join(" ")}`);
  const ownerByPlayerId = new Map<string, { teamId: string; rosterStatusLabel: string | null }>();
  for (const team of preview.teams) {
    for (const player of team.players) ownerByPlayerId.set(player.playerId, { teamId: team.teamId, rosterStatusLabel: player.rosterStatusLabel });
  }
  const inventoryPlayers: YahooSnapshotPlayer[] = players.map((player) => {
    const owner = ownerByPlayerId.get(player.player.id);
    return {
      providerPlayerId: player.player.externalIds.yahoo ?? `pdf:${player.player.id}`,
      fullName: player.player.fullName,
      nflTeam: player.player.team,
      positions: player.player.positions,
      availability: owner ? "rostered" : "available",
      rosterStatusLabel: owner?.rosterStatusLabel ?? null,
      fantasyTeamId: owner?.teamId ?? null,
    };
  });
  const supportedPositions: PlayerPosition[] = ["QB", "RB", "WR", "TE"];
  return {
    schemaVersion: 1,
    source: "yahoo-roster-pdf",
    leagueId: leagueSourceOfTruth.leagueId.replace("yahoo-", ""),
    myTeamId,
    startedAt: preview.capturedAt,
    completedAt: preview.capturedAt,
    players: inventoryPlayers,
    coverage: {
      myRosterCaptured: preview.teams.some((team) => team.teamId === myTeamId && team.players.length >= 14),
      availablePositions: supportedPositions,
      teamRosterIds: preview.teams.map((team) => team.teamId),
      pagesFetched: 1,
      partial: false,
      errors: [],
    },
  };
}
