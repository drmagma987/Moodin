import { access, readFile } from "node:fs/promises";
import {
  assertCanonicalLeagueSourceOfTruth,
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "./leagueSourceOfTruth.ts";

const forbiddenArtifacts = [
  "data/draftBoardSnapshot.generated.json",
  "data/historicalBacktest.generated.json",
];

const requiredArtifacts = [
  "data/warRoomDataset.generated.json",
  "data/historicalBacktestReport.generated.json",
];

async function exists(path) {
  try {
    await access(new URL(path, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

assertCanonicalLeagueSourceOfTruth();

const errors = [];
const stock = JSON.parse(
  await readFile(new URL("./data/stockPprPool.generated.json", import.meta.url), "utf8"),
);
if (stock.leagueConfigVersion !== leagueSourceOfTruth.version) {
  errors.push(`stock pool version ${stock.leagueConfigVersion ?? "missing"}`);
}
if (stock.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
  errors.push(`stock pool fingerprint ${stock.leagueConfigFingerprint ?? "missing"}`);
}
if (stock.teamCount !== leagueSourceOfTruth.teams) {
  errors.push(`stock pool team count ${stock.teamCount}`);
}
if (stock.season !== leagueSourceOfTruth.season) {
  errors.push(`stock pool season ${stock.season}`);
}

const markedKeepers = stock.players
  .filter((player) => player.availability === "my-keeper")
  .map((player) => player.name)
  .sort();
const canonicalKeepers = [...leagueSourceOfTruth.keepers.myDeclaredPlayers].sort();
if (markedKeepers.join("|") !== canonicalKeepers.join("|")) {
  errors.push(`stock pool keepers ${markedKeepers.join(", ") || "none"}`);
}

for (const path of forbiddenArtifacts) {
  if (await exists(path)) errors.push(`obsolete artifact still exists: ${path}`);
}

for (const path of requiredArtifacts) {
  if (!(await exists(path))) errors.push(`required derived artifact is missing: ${path}`);
}

if (await exists(requiredArtifacts[0])) {
  const warRoom = JSON.parse(
    await readFile(new URL(requiredArtifacts[0], import.meta.url), "utf8"),
  );
  if (warRoom.leagueConfigVersion !== leagueSourceOfTruth.version) {
    errors.push(`war-room version ${warRoom.leagueConfigVersion ?? "missing"}`);
  }
  if (warRoom.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    errors.push(`war-room fingerprint ${warRoom.leagueConfigFingerprint ?? "missing"}`);
  }
  if (!warRoom.warRoomReady || (warRoom.warRoomBlockers?.length ?? 0) > 0) {
    errors.push(`war room is blocked: ${warRoom.warRoomBlockers?.join("; ") || "not ready"}`);
  }
  if (warRoom.draftState?.leagueConfigVersion !== leagueSourceOfTruth.version) {
    errors.push(`draft-state version ${warRoom.draftState?.leagueConfigVersion ?? "missing"}`);
  }
  if (warRoom.draftState?.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    errors.push(`draft-state fingerprint ${warRoom.draftState?.leagueConfigFingerprint ?? "missing"}`);
  }
  if (warRoom.draftState?.myTeamId !== `team-${leagueSourceOfTruth.draft.mySlot}`) {
    errors.push(`draft-state manager ${warRoom.draftState?.myTeamId ?? "missing"}`);
  }
  const requiredCandidatePositions = Object.entries(leagueSourceOfTruth.lineup)
    .filter(([position, count]) => !["BN", "IR", "FLEX", "DST"].includes(position) && Number(count) > 0)
    .map(([position]) => position);
  const candidatePositions = new Set(
    (warRoom.candidates ?? []).map((candidate) => candidate.player?.positions?.[0]),
  );
  const missingRequiredCandidatePositions = requiredCandidatePositions.filter(
    (position) => !candidatePositions.has(position),
  );
  if (missingRequiredCandidatePositions.length > 0) {
    errors.push(`war-room candidate pool cannot fill ${missingRequiredCandidatePositions.join(", ")}`);
  }
}

if (await exists(requiredArtifacts[1])) {
  const backtest = JSON.parse(
    await readFile(new URL(requiredArtifacts[1], import.meta.url), "utf8"),
  );
  if (backtest.leagueConfigVersion !== leagueSourceOfTruth.version) {
    errors.push(`backtest version ${backtest.leagueConfigVersion ?? "missing"}`);
  }
  if (backtest.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint) {
    errors.push(`backtest fingerprint ${backtest.leagueConfigFingerprint ?? "missing"}`);
  }
  if (backtest.league?.teams !== leagueSourceOfTruth.teams) {
    errors.push(`backtest teams ${backtest.league?.teams ?? "missing"}`);
  }
}

if (errors.length > 0) {
  throw new Error(
    `League integrity validation failed for ${leagueSourceOfTruth.version} (${leagueSourceOfTruthFingerprint}): ${errors.join("; ")}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  leagueConfigVersion: leagueSourceOfTruth.version,
  leagueConfigFingerprint: leagueSourceOfTruthFingerprint,
  teams: leagueSourceOfTruth.teams,
  mySlot: leagueSourceOfTruth.draft.mySlot,
  keeperRange: `${leagueSourceOfTruth.keepers.minimumPerTeam}-${leagueSourceOfTruth.keepers.maximumPerTeam}`,
  myKeepers: canonicalKeepers,
}));
