import assert from "node:assert/strict";
import test from "node:test";

import { buildRunPushEvents } from "@/lib/brgym/run-push";

const steps = [
  { label: "Warm-up", seconds: 600 },
  { label: "Fast", seconds: 60 },
  { label: "Recovery", seconds: 90 },
  { label: "Cooldown", seconds: 300 },
];

test("schedules each transition and a completion push", () => {
  assert.deepEqual(buildRunPushEvents(steps, 0), [
    { delaySeconds: 600, title: "NOW — Fast • 1:00", body: "NEXT — Recovery • 1:30" },
    { delaySeconds: 660, title: "NOW — Recovery • 1:30", body: "NEXT — Cooldown • 5:00" },
    { delaySeconds: 750, title: "NOW — Cooldown • 5:00", body: "Final section — finish strong." },
    {
      delaySeconds: 1050,
      title: "Run timer complete",
      body: "Cooldown finished. Nice work — log your run when you’re ready.",
    },
  ]);
});

test("resuming only schedules boundaries still ahead", () => {
  assert.deepEqual(buildRunPushEvents(steps, 650).map((event) => event.delaySeconds), [10, 100, 400]);
});

test("a finished run schedules nothing", () => {
  assert.deepEqual(buildRunPushEvents(steps, 1050), []);
});
