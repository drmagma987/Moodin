import assert from "node:assert/strict";
import test from "node:test";

import { buildRotatingPlanEntries } from "@/lib/brgym/plan-rotation";
import type { TrainingPlanEntry, WorkoutCategory, WorkoutSession, WorkoutTemplate } from "@/lib/brgym/types";

function template(id: string, name: string, category: WorkoutCategory): WorkoutTemplate {
  return {
    id,
    name,
    category,
    exercises: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isDefault: true,
    trainingProfile: "vaughn",
  };
}

const templates = [
  template("push", "Push", "Push"),
  template("pull", "Pull", "Pull"),
  template("legs", "Legs", "Legs / Lower Back"),
  template("shoulders", "Shoulders", "Shoulders / Posture"),
];

const entries: TrainingPlanEntry[] = [
  { id: "slot-1", date: "2026-10-14", kind: "lift", title: "Push", details: "Old static plan", templateId: "push" },
  { id: "run", date: "2026-10-15", kind: "run", title: "Run", details: "Easy" },
  { id: "slot-2", date: "2026-10-16", kind: "lift", title: "Legs", details: "Old static plan", templateId: "legs" },
  { id: "slot-3", date: "2026-10-18", kind: "lift", title: "Pull", details: "Old static plan", templateId: "pull" },
  { id: "slot-4", date: "2026-10-20", kind: "lift", title: "Push", details: "Old static plan", templateId: "push" },
];

function completedPush(): WorkoutSession {
  return {
    id: "completed-push",
    templateId: "push",
    workoutName: "Push",
    category: "Push",
    date: "2026-10-13T18:00:00.000Z",
    equipmentProfileId: "apartment-gym",
    equipmentProfileName: "Apartment Gym",
    discomfortFlags: { knee: false, lowerBack: false, shoulder: false },
    exerciseLogs: [],
    recommendations: [],
    notes: "",
    trainingProfile: "vaughn",
  };
}

test("future lift slots continuously follow the last completed split", () => {
  const result = buildRotatingPlanEntries({
    entries,
    sessions: [completedPush()],
    templates,
    activeTrainingProfile: "vaughn",
    today: "2026-10-14",
  });

  assert.deepEqual(result.filter((entry) => entry.kind === "lift").map((entry) => entry.title), [
    "Pull",
    "Legs",
    "Shoulders",
    "Push",
  ]);
  assert.equal(result.find((entry) => entry.id === "run")?.title, "Run");
});

test("completed and past lift slots stay unchanged", () => {
  const completed = { ...completedPush(), planEntryId: "slot-2" };
  const result = buildRotatingPlanEntries({
    entries,
    sessions: [completed],
    templates,
    activeTrainingProfile: "vaughn",
    today: "2026-10-16",
  });

  assert.equal(result[0].title, "Push");
  assert.equal(result[2].title, "Legs");
  assert.equal(result[4].title, "Legs");
});
