import type { DraftCandidate, DraftState } from "@/lib/fantasy/types";

export type ScreenshotDraftProposal = {
  overallPick: number;
  playerId: string;
  playerName: string;
  sourceLine: string;
  confidence: "exact" | "review";
};

export type ScreenshotDraftRecovery = {
  proposals: ScreenshotDraftProposal[];
  unresolvedLines: string[];
  warnings: string[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseScreenshotDraftText(
  text: string,
  candidates: DraftCandidate[],
  state: DraftState,
): ScreenshotDraftRecovery {
  const proposals: ScreenshotDraftProposal[] = [];
  const unresolvedLines: string[] = [];
  const warnings: string[] = [];
  const usedPlayers = new Set(state.drafted.map((pick) => pick.playerId));
  const usedPicks = new Set(state.drafted.map((pick) => pick.overallPick));
  let inferredPick = state.currentPick;
  const searchable = candidates
    .filter((candidate) => !usedPlayers.has(candidate.player.id))
    .map((candidate) => ({ candidate, normalizedName: normalize(candidate.player.fullName) }))
    .sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const normalizedLine = normalize(line);
    const matches = searchable.filter(({ normalizedName }) => normalizedLine.includes(normalizedName));
    if (matches.length !== 1) {
      unresolvedLines.push(line);
      continue;
    }
    const explicitPick = line.match(/(?:^|\b)(?:pick\s*)?#?(\d{1,3})(?:\b|[.)-])/i);
    const overallPick = explicitPick ? Number.parseInt(explicitPick[1], 10) : inferredPick;
    while (usedPicks.has(inferredPick)) inferredPick += 1;
    if (usedPicks.has(overallPick)) {
      warnings.push(`${line}: Pick ${overallPick} is already occupied.`);
      continue;
    }
    if (usedPlayers.has(matches[0].candidate.player.id)) {
      warnings.push(`${line}: ${matches[0].candidate.player.fullName} is already drafted.`);
      continue;
    }
    proposals.push({
      overallPick,
      playerId: matches[0].candidate.player.id,
      playerName: matches[0].candidate.player.fullName,
      sourceLine: line,
      confidence: explicitPick ? "exact" : "review",
    });
    usedPicks.add(overallPick);
    usedPlayers.add(matches[0].candidate.player.id);
    inferredPick = Math.max(inferredPick, overallPick + 1);
  }
  if (proposals.some((proposal) => proposal.confidence === "review")) {
    warnings.push("Some rows had no explicit pick number. Review their inferred order before applying.");
  }
  return { proposals: proposals.sort((a, b) => a.overallPick - b.overallPick), unresolvedLines, warnings };
}
