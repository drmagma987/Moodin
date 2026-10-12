"use client";

import { useEffect, useState } from "react";

import { useBRGym } from "@/components/brgym/provider";
import { getBRGymPushSubscription, setServiceWorkerPushToken } from "@/lib/brgym/push-client";
import {
  buildAccountabilitySchedule,
  clearAccountabilityScheduleReceipt,
  LEGACY_REMINDER_SCHEDULE_KEY,
  readAccountabilityScheduleReceipt,
  REMINDER_REFRESH_EVENT,
  REMINDER_SCHEDULE_KEY,
  type AccountabilityScheduleReceipt,
} from "@/lib/brgym/accountability";

export function AccountabilityReminders() {
  const { data, hydrated } = useBRGym();
  const settings = data.settings;
  const entries = data.trainingPlan?.entries;
  const [refreshGeneration, setRefreshGeneration] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshGeneration((current) => current + 1);
    window.addEventListener(REMINDER_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REMINDER_REFRESH_EVENT, refresh);
  }, []);

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
    const { events, signature } = buildAccountabilitySchedule({
      entries: planEntries,
      completedEntryIds: new Set([...completedEntryIds].filter((id): id is string => typeof id === "string")),
      activeTrainingProfile: settings.activeTrainingProfile,
      morningReminderTime: settings.morningReminderTime,
      eveningReminderTime: settings.eveningReminderTime,
      now,
    });
    const currentReceipt = readAccountabilityScheduleReceipt();
    if (currentReceipt?.signature === signature && currentReceipt.nextEventAt !== null && currentReceipt.nextEventAt > now) return;

    void (async () => {
      try {
        const subscription = await getBRGymPushSubscription();
        const scheduleToken = crypto.randomUUID().replace(/-/g, "");

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
              events: events.map(({ delaySeconds, title, body }) => ({ delaySeconds, title, body })),
            }),
          });
          if (!response.ok) throw new Error("Reminder schedule failed");
          const result = await response.json() as { scheduled?: number };
          if (result.scheduled !== events.length) throw new Error("Reminder schedule was incomplete");
        }
        const receipt: AccountabilityScheduleReceipt = {
          signature,
          scheduleToken,
          scheduledAt: now,
          nextEventAt: events[0]?.at ?? null,
          eventCount: events.length,
        };
        window.localStorage.setItem(REMINDER_SCHEDULE_KEY, JSON.stringify(receipt));
        window.localStorage.removeItem(LEGACY_REMINDER_SCHEDULE_KEY);
        window.dispatchEvent(new Event(`${REMINDER_REFRESH_EVENT}:status`));
      } catch {
        clearAccountabilityScheduleReceipt();
        window.dispatchEvent(new Event(`${REMINDER_REFRESH_EVENT}:status`));
      }
    })();
  }, [data.sessions, entries, hydrated, refreshGeneration, settings.accountabilityRemindersEnabled, settings.activeTrainingProfile, settings.eveningReminderTime, settings.morningReminderTime]);

  return null;
}
