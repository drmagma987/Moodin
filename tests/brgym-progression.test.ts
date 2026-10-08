import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EQUIPMENT_PROFILES, EXERCISE_LIBRARY } from "@/lib/brgym/defaults";
import { buildNextWorkoutProgression, normalizeWeight } from "@/lib/brgym/logic";
import type { DifficultyRating, WorkoutSession } from "@/lib/brgym/types";

const profile = DEFAULT_EQUIPMENT_PROFILES[0];
const exercise = EXERCISE_LIBRARY["Dumbbell floor press"];

function makeSession(id: string, reps: number[], weight: number, struggleRating: DifficultyRating): WorkoutSession {
  return {
    id,
    workoutName: "Push",
    category: "Push",
    date: `2026-10-0${id}.000Z`,
    equipmentProfileId: profile.id,
    equipmentProfileName: profile.name,
    discomfortFlags: { knee: false, lowerBack: false, shoulder: false },
    notes: "",
    recommendations: [],
    exerciseLogs: [{
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      movementPattern: exercise.movementPattern,
      equipmentProfileId: profile.id,
      equipmentProfileName: profile.name,
      exerciseType: exercise.exerciseType,
      date: `2026-10-0${id}.000Z`,
      struggleRating,
      notes: "",
      recommendation: "",
      sets: reps.map((value, index) => {
        const normalized = normalizeWeight(weight, "lb");
        return {
          setNumber: index + 1,
          reps: value,
          enteredWeight: weight,
          enteredUnit: "lb" as const,
          normalizedWeightLb: normalized.lb,
          normalizedWeightKg: normalized.kg,
        };
      }),
    }],
  };
}

test("seeds a first workout at the bottom of the rep range", () => {
  const plan = buildNextWorkoutProgression([], exercise, profile);
  assert.equal(plan.kind, "first-session");
  assert.deepEqual(plan.sets.map((set) => set.reps), [8, 8, 8]);
  assert.deepEqual(plan.sets.map((set) => set.enteredWeight), [0, 0, 0]);
});

test("keeps load and progresses only the lowest rep sets", () => {
  const plan = buildNextWorkoutProgression([makeSession("1", [10, 9, 8], 20, 3)], exercise, profile);
  assert.equal(plan.kind, "rep-progress");
  assert.deepEqual(plan.sets.map((set) => set.reps), [10, 9, 9]);
  assert.deepEqual(plan.sets.map((set) => set.enteredWeight), [20, 20, 20]);
});

test("moves to the next available equipment weight after clearing the rep ceiling", () => {
  const plan = buildNextWorkoutProgression([makeSession("1", [10, 10, 10], 20, 3)], exercise, profile);
  assert.equal(plan.kind, "load-progress");
  assert.deepEqual(plan.sets.map((set) => set.reps), [8, 8, 8]);
  assert.deepEqual(plan.sets.map((set) => set.enteredWeight), [25, 25, 25]);
});

test("holds after one hard session", () => {
  const plan = buildNextWorkoutProgression([makeSession("1", [9, 9, 8], 20, 4)], exercise, profile);
  assert.equal(plan.kind, "hold");
  assert.deepEqual(plan.sets.map((set) => set.reps), [9, 9, 8]);
  assert.deepEqual(plan.sets.map((set) => set.enteredWeight), [20, 20, 20]);
});

test("steps down after two consecutive hard sessions", () => {
  const plan = buildNextWorkoutProgression([
    makeSession("2", [8, 8, 8], 20, 4),
    makeSession("1", [8, 8, 8], 20, 5),
  ], exercise, profile);
  assert.equal(plan.kind, "deload");
  assert.deepEqual(plan.sets.map((set) => set.reps), [8, 8, 8]);
  assert.deepEqual(plan.sets.map((set) => set.enteredWeight), [15, 15, 15]);
});
