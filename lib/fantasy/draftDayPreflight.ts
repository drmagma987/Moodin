export const DRAFT_DAY_LATENCY_BUDGETS = {
  recommendationMs: 750,
  rankingMs: 250,
} as const;

export function evaluateDraftDayLatency(input: {
  recommendationMs: number;
  rankingMs: number;
}) {
  const failures: string[] = [];
  if (input.recommendationMs > DRAFT_DAY_LATENCY_BUDGETS.recommendationMs) {
    failures.push(
      `recommendation exceeded ${DRAFT_DAY_LATENCY_BUDGETS.recommendationMs}ms (${input.recommendationMs.toFixed(1)}ms)`,
    );
  }
  if (input.rankingMs > DRAFT_DAY_LATENCY_BUDGETS.rankingMs) {
    failures.push(
      `ranking exceeded ${DRAFT_DAY_LATENCY_BUDGETS.rankingMs}ms (${input.rankingMs.toFixed(1)}ms)`,
    );
  }
  return {
    passed: failures.length === 0,
    failures,
  };
}

function calendarDay(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function evaluateArtifactFreshness(input: {
  capturedAt: string;
  now?: Date;
  timeZone?: string;
}) {
  const now = input.now ?? new Date();
  const captured = new Date(input.capturedAt);
  const ageHours = Number(((now.getTime() - captured.getTime()) / 3_600_000).toFixed(1));
  const timeZone = input.timeZone ?? "America/New_York";
  return {
    validTimestamp: !Number.isNaN(captured.getTime()),
    sameCalendarDay:
      calendarDay(captured, timeZone) !== null &&
      calendarDay(captured, timeZone) === calendarDay(now, timeZone),
    ageHours,
    timeZone,
  };
}
