"use client";

import { useEffect } from "react";

import { useBRGym } from "@/components/brgym/provider";
import { getBRGymPushSubscription, setServiceWorkerPushToken } from "@/lib/brgym/push-client";

const REMINDER_SIGNATURE_KEY = "brgym-reminder-schedule-v1";

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export function AccountabilityReminders() {
  const { data, hydrated } = useBRGym();
  const settings = data.settings;
  const entries = data.trainingPlan?.entries;

  useEffect(() => {
    if (!hydrated || !settings.accountabilityRemindersEnabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const planEntries = (entries ?? []).filter(
      (entry) => (entry.trainingProfile ?? "vaughn") === settings.activeTrainingProfile,
    );

    const completedEntryIds = new Set([
      ...data.sessions.map((session) => session.planEntryId).filter(Boolean),
      ...planEntries.filter((entry) => entry.runLog).map((entry) => entry.id),
    ]);
    const now = Date.now();
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    const upcoming = planEntries.filter((entry) => {
      const evening = localDateTime(entry.date, settings.eveningReminderTime).getTime();
      return !completedEntryIds.has(entry.id) && evening > now && evening <= horizon;
    });
    const signature = JSON.stringify({
      morning: settings.morningReminderTime,
      evening: settings.eveningReminderTime,
      entries: upcoming.map(({ id, date, title }) => ({ id, date, title })),
    });
    if (window.localStorage.getItem(REMINDER_SIGNATURE_KEY) === signature) return;

    void (async () => {
      try {
        const subscription = await getBRGymPushSubscription();
        const scheduleToken = crypto.randomUUID().replace(/-/g, "");
        const events = upcoming.flatMap((entry) => [
          {
            at: localDateTime(entry.date, settings.morningReminderTime).getTime(),
            title: `${entry.title} is on today`,
            body: `Make the plan real. ${entry.details}`,
          },
          {
            at: localDateTime(entry.date, settings.eveningReminderTime).getTime(),
            title: `Still time for ${entry.title}`,
            body: "Start now, or intentionally move it on your BR Gym calendar.",
          },
        ]).filter((event) => event.at > now).map((event) => ({
          delaySeconds: Math.max(1, Math.ceil((event.at - now) / 1000)),
          title: event.title,
          body: event.body.slice(0, 180),
        }));

        await setServiceWorkerPushToken("reminder", scheduleToken);
        if (events.length) {
          const response = await fetch("/api/brgym/push/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channel: "reminder",
              scheduleToken,
              subscription: subscription.toJSON(),
              targetUrl: "/brgym/plan",
              events,
            }),
          });
          if (!response.ok) throw new Error("Reminder schedule failed");
        }
        window.localStorage.setItem(REMINDER_SIGNATURE_KEY, signature);
      } catch {
        window.localStorage.removeItem(REMINDER_SIGNATURE_KEY);
      }
    })();
  }, [data.sessions, entries, hydrated, settings.accountabilityRemindersEnabled, settings.activeTrainingProfile, settings.eveningReminderTime, settings.morningReminderTime]);

  return null;
}
