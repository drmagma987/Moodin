import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountabilitySchedule } from "@/lib/brgym/accountability";
import type { TrainingPlanEntry } from "@/lib/brgym/types";

const entries: TrainingPlanEntry[] = [
  { id: "today-run", date: "2026-10-10", kind: "run", title: "Easy run", details: "Run easy.", trainingProfile: "vaughn" },
  { id: "tomorrow-lift", date: "2026-10-11", kind: "lift", title: "Push", details: "Three sets.", trainingProfile: "vaughn" },
  { id: "lauren-run", date: "2026-10-10", kind: "run", title: "Lauren run", details: "Run/walk.", trainingProfile: "lauren" },
];

test("schedules the active profile's morning and evening reminders", () => {
  const now = new Date("2026-10-10T07:00:00").getTime();
  const result = buildAccountabilitySchedule({
    entries,
    completedEntryIds: new Set(),
    activeTrainingProfile: "vaughn",
    morningReminderTime: "08:00",
    eveningReminderTime: "17:30",
    now,
  });

  assert.deepEqual(result.events.map((event) => [event.title, event.delaySeconds]), [
    ["Easy run is on today", 60 * 60],
    ["Still time for Easy run", 10.5 * 60 * 60],
    ["Push is on today", 25 * 60 * 60],
    ["Still time for Push", 34.5 * 60 * 60],
  ]);
});

test("drops completed entries and morning reminders that already passed", () => {
  const now = new Date("2026-10-10T09:00:00").getTime();
  const result = buildAccountabilitySchedule({
    entries,
    completedEntryIds: new Set(["tomorrow-lift"]),
    activeTrainingProfile: "vaughn",
    morningReminderTime: "08:00",
    eveningReminderTime: "17:30",
    now,
  });

  assert.deepEqual(result.events.map((event) => event.title), ["Still time for Easy run"]);
});
