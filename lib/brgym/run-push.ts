export interface RunPushEvent {
  delaySeconds: number;
  title: string;
  body: string;
}

export interface RunPushStep {
  label: string;
  seconds: number;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function describeStep(step: RunPushStep) {
  return `${step.label} • ${formatSeconds(step.seconds)}`;
}

export function buildRunPushEvents(steps: RunPushStep[], elapsedSeconds: number): RunPushEvent[] {
  const totalSeconds = steps.reduce((total, step) => total + step.seconds, 0);
  const boundedElapsed = Math.min(Math.max(Math.floor(elapsedSeconds), 0), totalSeconds);
  const events: RunPushEvent[] = [];
  let boundary = 0;

  for (let index = 0; index < steps.length; index += 1) {
    boundary += steps[index].seconds;
    if (boundary <= boundedElapsed) continue;

    const delaySeconds = boundary - boundedElapsed;
    const nextStep = steps[index + 1];
    const followingStep = steps[index + 2];

    if (nextStep) {
      events.push({
        delaySeconds,
        title: `NOW — ${describeStep(nextStep)}`,
        body: followingStep ? `NEXT — ${describeStep(followingStep)}` : "Final section — finish strong.",
      });
    } else {
      events.push({
        delaySeconds,
        title: "Run timer complete",
        body: "Cooldown finished. Nice work — log your run when you’re ready.",
      });
    }
  }

  return events;
}
