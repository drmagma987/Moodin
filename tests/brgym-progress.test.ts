import assert from "node:assert/strict";
import test from "node:test";

import { buildBRGymProgress } from "@/lib/brgym/progress";
import { normalizeWeight } from "@/lib/brgym/logic";
import type { WorkoutSession } from "@/lib/brgym/types";

function session(id: string, date: string, weight: number, reps: number): WorkoutSession {
  const normalized = normalizeWeight(weight, "lb");
  return {
    id,
    workoutName: "Push",
    category: "Push",
    date,
    equipmentProfileId: "apartment-gym",
    equipmentProfileName: "Apartment Gym",
    discomfortFlags: { knee: false, lowerBack: false, shoulder: false },
    notes: "",
    recommendations: [],
    exerciseLogs: [{
      exerciseId: "bench",
      exerciseName: "Bench Press",
      movementPattern: "horizontal press",
      equipmentProfileId: "apartment-gym",
      equipmentProfileName: "Apartment Gym",
      exerciseType: "barbell",
      date,
      struggleRating: 3,
      notes: "",
      recommendation: "",
      sets: [{
        setNumber: 1,
        reps,
        enteredWeight: weight,
        enteredUnit: "lb",
        normalizedWeightLb: normalized.lb,
        normalizedWeightKg: normalized.kg,
      }],
    }],
  };
}

test("builds a chronological exercise series and detects later PRs", () => {
  const progress = buildBRGymProgress([
    session("new", "2026-10-07T12:00:00.000Z", 105, 8),
    session("old", "2026-10-01T12:00:00.000Z", 100, 8),
  ]);

  assert.equal(progress.totalSessions, 2);
  assert.equal(progress.totalSets, 2);
  assert.deepEqual(progress.series[0].points.map((point) => point.sessionId), ["old", "new"]);
  assert.equal(progress.records.length, 1);
  assert.equal(progress.records[0].exerciseName, "Bench Press");
  assert.equal(progress.records[0].detail, "105 lb × 8");
});

test("uses best-set reps for bodyweight movements", () => {
  const workout = session("bodyweight", "2026-10-07T12:00:00.000Z", 0, 14);
  workout.exerciseLogs[0].exerciseName = "Push-ups";
  workout.exerciseLogs[0].exerciseType = "bodyweight";
  workout.exerciseLogs[0].sets.push({
    ...workout.exerciseLogs[0].sets[0],
    setNumber: 2,
    reps: 12,
  });

  const progress = buildBRGymProgress([workout]);
  assert.equal(progress.series[0].metric, "Best set reps");
  assert.equal(progress.series[0].points[0].value, 14);
});
