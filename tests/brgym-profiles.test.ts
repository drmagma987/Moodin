import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS, DEFAULT_TEMPLATES } from "@/lib/brgym/defaults";

const laurenTemplates = DEFAULT_TEMPLATES.filter((template) => template.trainingProfile === "lauren");
const vaughnTemplates = DEFAULT_TEMPLATES.filter((template) => template.trainingProfile === "vaughn");

test("defaults existing users to Vaughn while exposing three profile modes", () => {
  assert.equal(DEFAULT_SETTINGS.activeTrainingProfile, "vaughn");
  assert.ok(vaughnTemplates.length >= 5);
  assert.equal(DEFAULT_TEMPLATES.some((template) => template.trainingProfile === "custom"), false);
});

test("Lauren preset matches the supplied push, pull, legs, and core splits", () => {
  assert.deepEqual(laurenTemplates.map((template) => template.id), [
    "lauren-push",
    "lauren-pull",
    "lauren-legs",
    "lauren-core",
  ]);
  assert.deepEqual(laurenTemplates.map((template) => template.exercises.map((exercise) => exercise.name)), [
    ["Dumbbell incline bench press", "Cable tricep pushdown with rope", "Dumbbell shoulder press", "Dumbbell lateral raise"],
    ["Dumbbell bent-over row", "Cable single arm lat pulldown", "Dumbbell curl", "Dumbbell hammer curl"],
    ["Barbell squat", "Dumbbell Romanian deadlift", "Dumbbell sumo squat", "Dumbbell standing calf raise"],
    ["Dead bug", "Heel taps", "Bird dog"],
  ]);
});

test("Lauren set and rep targets retain the screenshot exceptions", () => {
  const allExercises = laurenTemplates.flatMap((template) => template.exercises);
  for (const exercise of allExercises) assert.equal(exercise.targetSets, 3);
  const calfRaise = allExercises.find((exercise) => exercise.name === "Dumbbell standing calf raise");
  assert.equal(calfRaise?.repMin, 15);
  assert.equal(calfRaise?.repMax, 15);
  assert.equal(allExercises.find((exercise) => exercise.name === "Dead bug")?.repMin, 10);
  assert.equal(allExercises.find((exercise) => exercise.name === "Dead bug")?.repMax, 10);
});
