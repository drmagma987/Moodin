"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Clock3, Send } from "lucide-react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getBRGymPushSubscription, setServiceWorkerPushToken } from "@/lib/brgym/push-client";
import {
  clearAccountabilityScheduleReceipt,
  readAccountabilityScheduleReceipt,
  REMINDER_REFRESH_EVENT,
  type AccountabilityScheduleReceipt,
} from "@/lib/brgym/accountability";

export default function BRGymSettingsPage() {
  const { data, hydrated, exportAllData, importAllData, resetAllData, updateSettings } = useBRGym();
  const [message, setMessage] = useState<string | null>(null);
  const [reminderReceipt, setReminderReceipt] = useState<AccountabilityScheduleReceipt | null>(null);
  const [testingPush, setTestingPush] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const updateReceipt = () => setReminderReceipt(readAccountabilityScheduleReceipt());
    updateReceipt();
    window.addEventListener(`${REMINDER_REFRESH_EVENT}:status`, updateReceipt);
    return () => window.removeEventListener(`${REMINDER_REFRESH_EVENT}:status`, updateReceipt);
  }, []);

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
        <h2 className="text-2xl font-semibold text-white">Settings</h2>
        <p className="mt-2 text-sm text-slate-300">
          Recommendations are based on logged performance and are not medical advice.
        </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="brgym-status-orb shrink-0"><BellRing className="h-4 w-4" /></div>
            <div>
              <p className="brgym-kicker">Accountability</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Twice-daily workout reminders</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">BR Gym names the workout on today’s calendar in the morning and checks back in that evening.</p>
            </div>
          </div>
          <label className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            <span className="text-sm text-slate-100">Accountability reminders</span>
            <Switch
              checked={data.settings.accountabilityRemindersEnabled}
              onChange={async (event) => {
                const enabled = event.target.checked;
                if (!enabled) {
                  updateSettings({ accountabilityRemindersEnabled: false });
                  await setServiceWorkerPushToken("reminder", null);
                  clearAccountabilityScheduleReceipt();
                  setReminderReceipt(null);
                  return;
                }
                if (!("Notification" in window)) {
                  toast.error("Notifications are not supported on this device");
                  return;
                }
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                  toast.error("Notification permission is required");
                  return;
                }
                try {
                  await getBRGymPushSubscription();
                  updateSettings({ accountabilityRemindersEnabled: true });
                  toast.success("Accountability reminders enabled");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not enable reminders");
                }
              }}
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs uppercase tracking-[.14em] text-slate-400">
              <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Morning</span>
              <Input className="mt-2" type="time" value={data.settings.morningReminderTime} onChange={(event) => updateSettings({ morningReminderTime: event.target.value })} />
            </label>
            <label className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs uppercase tracking-[.14em] text-slate-400">
              <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Evening</span>
              <Input className="mt-2" type="time" value={data.settings.eveningReminderTime} onChange={(event) => updateSettings({ eveningReminderTime: event.target.value })} />
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">Reminder schedules refresh whenever you move a planned workout.</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 rounded-full p-1.5 ${reminderReceipt?.eventCount ? "bg-emerald-400/12 text-emerald-200" : "bg-amber-400/12 text-amber-200"}`}>
                {reminderReceipt?.eventCount ? <CheckCircle2 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{reminderReceipt?.eventCount ? `${reminderReceipt.eventCount} reminders confirmed` : "No confirmed reminder schedule"}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {reminderReceipt?.nextEventAt
                    ? `Next: ${new Date(reminderReceipt.nextEventAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : "Repair the subscription below to verify server-to-phone delivery."}
                </p>
              </div>
            </div>
            <Button
              className="mt-3 w-full"
              disabled={testingPush}
              onClick={async () => {
                if (!("Notification" in window)) {
                  toast.error("Notifications are not supported on this device");
                  return;
                }
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                  toast.error("Notification permission is required");
                  return;
                }
                setTestingPush(true);
                try {
                  const subscription = await getBRGymPushSubscription({ refreshExisting: true });
                  const response = await fetch("/api/brgym/push/schedule", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      channel: "test",
                      scheduleToken: crypto.randomUUID().replaceAll("-", ""),
                      subscription: subscription.toJSON(),
                      targetUrl: "/brgym/settings",
                      events: [{ delaySeconds: 2, title: "BR Gym notifications work", body: "Your 8:00 AM reminders are ready." }],
                    }),
                  });
                  if (!response.ok) throw new Error("The server could not queue the test notification");
                  clearAccountabilityScheduleReceipt();
                  setReminderReceipt(null);
                  window.dispatchEvent(new Event(REMINDER_REFRESH_EVENT));
                  toast.success("Test push queued", { description: "It should arrive in a few seconds." });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not test notifications");
                } finally {
                  setTestingPush(false);
                }
              }}
              size="sm"
              variant="secondary"
            >
              <Send className="mr-2 h-4 w-4" /> {testingPush ? "Repairing…" : "Repair & send test push"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
        <h3 className="text-lg font-semibold text-white">Rest timer</h3>
        <label className="mt-4 block rounded-2xl border border-white/10 bg-white/5 p-3">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Default seconds</span>
          <Input
            className="mt-2 border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus:border-none"
            inputMode="numeric"
            onChange={(event) =>
              updateSettings({ defaultRestSeconds: Math.max(Number(event.target.value || "0"), 30) })
            }
            value={data.settings.defaultRestSeconds}
          />
        </label>
        <label className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <span className="text-sm text-slate-100">Mute timer sounds</span>
          <Switch
            checked={data.settings.timerSoundMuted}
            onChange={(event) => updateSettings({ timerSoundMuted: event.target.checked })}
          />
        </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
        <h3 className="text-lg font-semibold text-white">Backup and restore</h3>
        <div className="mt-4 space-y-3">
          <Button
            className="w-full"
            onClick={() => {
              const payload = exportAllData();
              const blob = new Blob([payload], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `br-gym-export-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
              setMessage("Exported all BR Gym local data as JSON.");
              toast.success("Export complete");
            }}
            size="lg"
          >
            Export all data
          </Button>
          <Button
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            size="lg"
            variant="secondary"
          >
            Import data from JSON
          </Button>
          <input
            ref={fileInputRef}
            accept="application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              const text = await file.text();
              const result = importAllData(text);
              setMessage(result.message);
              if (result.ok) {
                toast.success(result.message);
              } else {
                toast.error(result.message);
              }
              event.target.value = "";
            }}
            type="file"
          />
          <Button
            className="w-full"
            onClick={() => {
              const confirmed = window.confirm("Reset all BR Gym local data? This cannot be undone.");
              if (!confirmed) {
                return;
              }
              resetAllData();
              setMessage("All BR Gym local data was reset.");
              toast.success("Local BR Gym data reset");
            }}
            size="lg"
            variant="destructive"
          >
            Reset all local data
          </Button>
        </div>
        {message ? <p className="mt-4 text-sm text-cyan-100">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
