import type { RunIntervalStep, TrainingPlan, TrainingPlanEntry } from "@/lib/brgym/types";

function timedRepeats(
  repeatCount: number,
  workSeconds: number,
  recoverySeconds: number,
  workLabel: string,
  workCue: string,
): RunIntervalStep[] {
  const steps: RunIntervalStep[] = [
    {
      id: "warm-up",
      label: "Easy warm-up",
      seconds: 10 * 60,
      effort: "easy",
      cue: "Relaxed, conversational effort",
    },
  ];

  for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
    steps.push({
      id: `work-${repeat}`,
      label: `${workLabel} ${repeat} of ${repeatCount}`,
      seconds: workSeconds,
      effort: "fast",
      cue: workCue,
    });
    if (repeat < repeatCount) {
      steps.push({
        id: `recovery-${repeat}`,
        label: `Easy recovery ${repeat} of ${repeatCount - 1}`,
        seconds: recoverySeconds,
        effort: "recovery",
        cue: "Back off and get ready for the next rep",
      });
    }
  }

  steps.push({
    id: "cooldown",
    label: "Easy cooldown",
    seconds: 5 * 60,
    effort: "easy",
    cue: "Let your breathing settle",
  });
  return steps;
}

const weeklyRuns = [
  {
    weekStart: "2026-10-05",
    qualityDate: "2026-10-07",
    quality: "8-10 min easy, then 6 × 1:00 fast / 1:30 very easy, then 5-10 min easy. Fast reps: controlled 7/10 effort, roughly 8:00-8:20 pace.",
    enduranceDate: "2026-10-11",
    endurance: "2.0 miles at a genuinely conversational effort.",
  },
  {
    weekStart: "2026-10-12",
    qualityDate: "2026-10-13",
    quality: "5 × 2 min fast / 2 min easy, with an easy warm-up and cooldown.",
    enduranceDate: "2026-10-18",
    endurance: "2.25 miles at a genuinely conversational effort.",
  },
  {
    weekStart: "2026-10-19",
    qualityDate: "2026-10-20",
    quality: "4 × 3 min fast / 2 min easy, with an easy warm-up and cooldown.",
    enduranceDate: "2026-10-25",
    endurance: "2.5 miles at a genuinely conversational effort.",
  },
  {
    weekStart: "2026-10-26",
    qualityDate: "2026-10-27",
    quality: "3 × 5 min controlled hard / 3 min easy, with an easy warm-up and cooldown.",
    enduranceDate: "2026-11-01",
    endurance: "2.75 miles at a genuinely conversational effort.",
  },
  {
    weekStart: "2026-11-02",
    qualityDate: "2026-11-03",
    quality: "5 × 3 min at roughly 5K effort / 2 min easy, with an easy warm-up and cooldown.",
    enduranceDate: "2026-11-08",
    endurance: "3.1 miles at a genuinely conversational effort.",
    optionalDate: "2026-11-06",
  },
  {
    weekStart: "2026-11-09",
    qualityDate: "2026-11-10",
    quality: "2 × 8 min at roughly 5K effort / 4 min easy, with an easy warm-up and cooldown.",
    enduranceDate: "2026-11-15",
    endurance: "3.5 miles at a genuinely conversational effort.",
  },
  {
    weekStart: "2026-11-16",
    qualityDate: "2026-11-17",
    quality: "5K tune-up: 1 mile easy + 1.5 miles hard but controlled + easy cooldown.",
    enduranceDate: "2026-11-22",
    endurance: "3.0 miles at a genuinely conversational effort.",
    optionalDate: "2026-11-20",
  },
] as const;

function lift(id: string, date: string, title: string, templateId: string, details: string): TrainingPlanEntry {
  return { id, date, kind: "lift", title, templateId, details };
}

function run(
  id: string,
  date: string,
  title: string,
  details: string,
  optional = false,
  timedSections?: RunIntervalStep[],
): TrainingPlanEntry {
  return { id, date, kind: "run", title, details, optional, runLog: null, timedSections };
}

export function createBossEightWeekPlan(): TrainingPlan {
  const entries: TrainingPlanEntry[] = [
    run(
      "run-quality-2026-10-07",
      "2026-10-07",
      "Quality run",
      weeklyRuns[0].quality,
      false,
      timedRepeats(6, 60, 90, "Fast", "Quick and controlled — about 7/10 effort"),
    ),
    lift("lift-pull-2026-10-10", "2026-10-10", "Pull", "pull-default", "3 sets of 8-10 reps per exercise. Keep every rep controlled."),
    run("run-endurance-2026-10-11", "2026-10-11", "Endurance run", weeklyRuns[0].endurance),
  ];

  for (const week of weeklyRuns.slice(1)) {
    const monday = week.weekStart;
    const thursday = new Date(`${monday}T12:00:00`);
    thursday.setDate(thursday.getDate() + 3);
    const saturday = new Date(`${monday}T12:00:00`);
    saturday.setDate(saturday.getDate() + 5);
    const toDate = (date: Date) => date.toISOString().slice(0, 10);

    entries.push(
      lift(`lift-push-${monday}`, monday, "Push", "push-default", "3 sets of 8-10 reps per exercise."),
      run(
        `run-quality-${week.qualityDate}`,
        week.qualityDate,
        "Quality run",
        week.quality,
        false,
        week.qualityDate === "2026-10-13"
          ? timedRepeats(5, 120, 120, "Fast", "Controlled fast effort")
          : week.qualityDate === "2026-10-20"
            ? timedRepeats(4, 180, 120, "Fast", "Controlled fast effort")
            : week.qualityDate === "2026-10-27"
              ? timedRepeats(3, 300, 180, "Controlled hard", "Strong but repeatable")
              : week.qualityDate === "2026-11-03"
                ? timedRepeats(5, 180, 120, "5K effort", "Settle near 5K effort")
                : week.qualityDate === "2026-11-10"
                  ? timedRepeats(2, 480, 240, "5K effort", "Strong, even, and controlled")
                  : undefined,
      ),
      lift(
        `lift-legs-${toDate(thursday)}`,
        toDate(thursday),
        "Legs",
        "legs-default",
        "Keep these controlled while running is the competitive priority. Do not chase lower-body PRs.",
      ),
      lift(`lift-pull-${toDate(saturday)}`, toDate(saturday), "Pull", "pull-default", "3 sets of 8-10 reps per exercise."),
      run(`run-endurance-${week.enduranceDate}`, week.enduranceDate, "Endurance run", week.endurance),
    );

    if ("optionalDate" in week && week.optionalDate) {
      entries.push(
        run(
          `run-recovery-${week.optionalDate}`,
          week.optionalDate,
          "Optional recovery run",
          "1.5 miles very easy. Drop this first if lifting fatigue or soreness is building.",
          true,
        ),
      );
    }
  }

  entries.push(
    lift("lift-push-2026-11-23", "2026-11-23", "Taper Push", "push-default", "Keep normal movement quality but reduce total effort. Leave plenty in reserve."),
    run(
      "run-shakeout-2026-11-24",
      "2026-11-24",
      "Race-week shakeout",
      "1.25-1.5 miles easy, then 4 × 20-second relaxed strides with full easy recovery.",
    ),
    {
      id: "race-2026-11-27",
      date: "2026-11-27",
      kind: "race",
      title: "5K Race Day",
      details: "Race the full 3.1 miles. Start controlled, settle through the middle, and compete over the final mile.",
      runLog: null,
    },
  );

  return {
    id: "boss-5k-fall-2026",
    name: "Boss 5K + Strength — Fall 2026",
    startDate: "2026-10-07",
    endDate: "2026-11-27",
    entries: entries.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
