import assert from "node:assert/strict";
import test from "node:test";

import { substitutePlanLift } from "@/lib/brgym/plan-rotation";
import type { TrainingPlanEntry, WorkoutTemplate } from "@/lib/brgym/types";

const entries: TrainingPlanEntry[] = [
  { id: "pull-1", date: "2026-10-12", kind: "lift", title: "Pull", details: "Pull day", templateId: "pull", trainingProfile: "vaughn" },
  { id: "push-1", date: "2026-10-14", kind: "lift", title: "Push", details: "Push day", templateId: "push", trainingProfile: "vaughn" },
  { id: "legs-1", date: "2026-10-17", kind: "lift", title: "Legs", details: "Leg day", templateId: "legs", trainingProfile: "vaughn" },
];

const pushTemplate = {
  id: "push",
  name: "Push",
  category: "Push",
  exercises: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trainingProfile: "vaughn",
} satisfies WorkoutTemplate;

test("swaps a substituted lift with its next scheduled occurrence", () => {
  const result = substitutePlanLift({
    entries,
    entryId: "pull-1",
    template: pushTemplate,
    activeTrainingProfile: "vaughn",
  });

  assert.deepEqual(result.map((entry) => entry.templateId), ["push", "pull", "legs"]);
  assert.deepEqual(result.map((entry) => entry.title), ["Push", "Pull", "Legs"]);
  assert.deepEqual(result.map((entry) => entry.details), ["Push day", "Pull day", "Leg day"]);
});

test("does not displace completed or other-profile lifts", () => {
  const result = substitutePlanLift({
    entries: [
      entries[0],
      { ...entries[1], trainingProfile: "lauren" },
      entries[2],
    ],
    entryId: "pull-1",
    template: pushTemplate,
    activeTrainingProfile: "vaughn",
    completedEntryIds: new Set(["legs-1"]),
  });

  assert.equal(result[0].templateId, "push");
  assert.equal(result[1].templateId, "push");
  assert.equal(result[2].templateId, "legs");
});
