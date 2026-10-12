import type { TrainingPlanEntry, TrainingProfileId } from "@/lib/brgym/types";

export const REMINDER_SCHEDULE_KEY = "brgym-reminder-schedule-v2";
export const LEGACY_REMINDER_SCHEDULE_KEY = "brgym-reminder-schedule-v1";
export const REMINDER_REFRESH_EVENT = "brgym:refresh-reminders";
const SCHEDULE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 1000;

export interface AccountabilityScheduleReceipt {
  signature: string;
  scheduleToken: string;
  scheduledAt: number;
  nextEventAt: number | null;
  eventCount: number;
}

export interface AccountabilityReminderEvent {
  at: number;
  delaySeconds: number;
  title: string;
  body: string;
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime();
}

export function buildAccountabilitySchedule(input: {
  entries: TrainingPlanEntry[];
  completedEntryIds: Set<string>;
  activeTrainingProfile: TrainingProfileId;
  morningReminderTime: string;
  eveningReminderTime: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const horizon = now + SCHEDULE_HORIZON_MS;
  const entries = input.entries.filter(
    (entry) => (entry.trainingProfile ?? "vaughn") === input.activeTrainingProfile
      && !input.completedEntryIds.has(entry.id),
  );
  const events = entries.flatMap((entry) => [
    {
      at: localDateTime(entry.date, input.morningReminderTime),
      title: `${entry.title} is on today`,
      body: `Make the plan real. ${entry.details}`,
    },
    {
      at: localDateTime(entry.date, input.eveningReminderTime),
      title: `Still time for ${entry.title}`,
      body: "Start now, or intentionally move it on your BR Gym calendar.",
    },
  ])
    .filter((event) => event.at > now && event.at <= horizon)
    .sort((a, b) => a.at - b.at)
    .map((event) => ({
      ...event,
      delaySeconds: Math.max(1, Math.ceil((event.at - now) / 1000)),
      body: event.body.slice(0, 180),
    }));

  const signature = JSON.stringify({
    version: 2,
    profile: input.activeTrainingProfile,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    morning: input.morningReminderTime,
    evening: input.eveningReminderTime,
    events: events.map(({ at, title }) => ({ at, title })),
  });

  return { events, signature };
}

export function readAccountabilityScheduleReceipt(): AccountabilityScheduleReceipt | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(REMINDER_SCHEDULE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<AccountabilityScheduleReceipt>;
    if (typeof parsed.signature !== "string"
      || typeof parsed.scheduleToken !== "string"
      || typeof parsed.scheduledAt !== "number"
      || typeof parsed.eventCount !== "number"
      || (parsed.nextEventAt !== null && typeof parsed.nextEventAt !== "number")) return null;
    return parsed as AccountabilityScheduleReceipt;
  } catch {
    return null;
  }
}

export function clearAccountabilityScheduleReceipt() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REMINDER_SCHEDULE_KEY);
  window.localStorage.removeItem(LEGACY_REMINDER_SCHEDULE_KEY);
}
