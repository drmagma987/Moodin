import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "../lib/fantasy/leagueSourceOfTruth.ts";

const { getDraftLabDataset } = await import("../lib/fantasy/draftLab.ts");
const dataset = await getDraftLabDataset("working");
const requiredCandidatePositions = Object.entries(leagueSourceOfTruth.lineup)
  .filter(([position, count]) => !["BN", "IR", "FLEX", "DST"].includes(position) && Number(count) > 0)
  .map(([position]) => position);
const candidatePositions = new Set(dataset.candidates.map((candidate) => candidate.player.positions[0]));
const missingRequiredCandidatePositions = requiredCandidatePositions.filter((position) => !candidatePositions.has(position));
if (
  !dataset.warRoomReady ||
  dataset.warRoomBlockers.length > 0 ||
  dataset.sourceStatus.mode !== "live" ||
  dataset.candidates.length < 250 ||
  dataset.leagueConfigVersion !== leagueSourceOfTruth.version ||
  dataset.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint ||
  dataset.draftState.leagueConfigVersion !== leagueSourceOfTruth.version ||
  dataset.draftState.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint ||
  missingRequiredCandidatePositions.length > 0
) {
  throw new Error(
    `Refusing to publish an incomplete or mismatched war-room artifact (${dataset.sourceStatus.mode}, ${dataset.candidates.length} players, ready=${dataset.warRoomReady}, missing positions=${missingRequiredCandidatePositions.join(",") || "none"}).`,
  );
}

const snapshot = {
  capturedAt: new Date().toISOString(),
  ...dataset,
};

const output = resolve("lib/fantasy/data/warRoomDataset.generated.json");
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(
  `Published ${snapshot.candidates.length} players to ${output} at ${snapshot.capturedAt}.`,
);
