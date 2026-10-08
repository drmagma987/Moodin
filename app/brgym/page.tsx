"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, BellRing, CalendarDays, ChevronRight, Dumbbell, Flame } from "lucide-react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { getNextWorkoutCategory } from "@/lib/brgym/logic";
import { getBRGymPushSubscription } from "@/lib/brgym/push-client";

export default function BRGymHomePage() {
  const { data, hydrated, updateSettings } = useBRGym();

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading BR Gym…</div>;
  }

  const activeTrainingProfile = data.settings.activeTrainingProfile;
  const profileSessions = data.sessions.filter((session) => (session.trainingProfile ?? "vaughn") === activeTrainingProfile);
  const profileTemplates = data.templates.filter((template) => (template.trainingProfile ?? (template.isDefault ? "vaughn" : "custom")) === activeTrainingProfile);
  const nextCategory = getNextWorkoutCategory(profileSessions);
  const activeWorkout = (data.activeWorkout?.trainingProfile ?? "vaughn") === activeTrainingProfile ? data.activeWorkout : null;
  const recentSession = profileSessions[0];
  const activeProfile = data.equipmentProfiles.find(
    (profile) => profile.id === data.settings.activeEquipmentProfileId,
  );
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
  const nextPlanEntry = activeTrainingProfile === "vaughn" ? data.trainingPlan?.entries.find((entry) => {
    const liftDone = entry.kind === "lift" && data.sessions.some((session) => session.planEntryId === entry.id);
    return entry.date >= todayKey && !entry.runLog && !liftDone;
  }) : undefined;
  const timedRunIsNext = nextPlanEntry?.kind === "run" && Boolean(nextPlanEntry.timedSections?.length);
  const plannedRunIsNext = nextPlanEntry?.kind === "run" || nextPlanEntry?.kind === "race";
  const nextActionHref = timedRunIsNext
    ? `/brgym/run/${nextPlanEntry.id}`
    : plannedRunIsNext
      ? "/brgym/plan"
      : activeWorkout
        ? `/brgym/workout/${activeWorkout.id}`
        : nextPlanEntry
          ? "/brgym/plan"
          : "/brgym/workout";
  const nextActionLabel = timedRunIsNext
    ? "Start run"
    : plannedRunIsNext
      ? "Open run"
      : activeWorkout
        ? "Resume lift"
        : nextPlanEntry
          ? "Start lift"
          : "Start";

  return (
    <div className="space-y-7">
      <section className="brgym-hero p-6">
        <p className="brgym-kicker relative z-10">
          {nextPlanEntry ? "Next on your plan" : "Next likely day"}
        </p>
        <div className="relative z-10 mt-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="max-w-[16rem] text-4xl font-semibold leading-[.96] tracking-[-0.05em] text-white">{nextPlanEntry?.title ?? nextCategory}</h2>
            <p className="mt-2 text-sm text-slate-300">
              {nextPlanEntry
                ? new Date(`${nextPlanEntry.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : <>Active setup: <span className="font-medium text-white">{activeProfile?.name}</span></>}
            </p>
          </div>
          <Link
            className="brgym-primary-orb flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-white"
            href={nextActionHref}
            aria-label={nextActionLabel}
          >
            <ArrowUpRight className="h-6 w-6" />
          </Link>
        </div>
      </section>

      <section className="brgym-card rounded-[28px] border p-5">
        <div className="flex items-start gap-4">
          <div className="brgym-status-orb shrink-0"><BellRing className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="brgym-kicker">Accountability</p>
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.14em] text-orange-200"><Flame className="h-3.5 w-3.5" /> Twice daily</span>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-white">Your plan should tap you on the shoulder.</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Morning and evening reminders name today’s workout. If life changes, move it deliberately in Plan.
            </p>
            {typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" ? (
              <Link className="mt-4 inline-flex text-sm font-semibold text-[#ff6a84]" href="/brgym/settings">Reminders active · Manage times</Link>
            ) : (
              <button
                className="brgym-button mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-white"
                onClick={async () => {
                  if (!("Notification" in window)) {
                    toast.error("Notifications are not supported on this device");
                    return;
                  }
                  const permission = await Notification.requestPermission();
                  if (permission !== "granted") {
                    toast.error("Allow notifications to turn on accountability reminders");
                    return;
                  }
                  try {
                    await getBRGymPushSubscription();
                    updateSettings({ accountabilityRemindersEnabled: true });
                    toast.success("Twice-daily workout reminders are on");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not enable reminders");
                  }
                }}
                type="button"
              >
                Enable workout reminders
              </button>
            )}
          </div>
        </div>
      </section>

      {activeWorkout && plannedRunIsNext ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50">
          <p className="font-medium">You also have an unfinished {activeWorkout.workoutName} lift.</p>
          <Link className="mt-2 inline-block text-amber-100 underline underline-offset-4" href={`/brgym/workout/${activeWorkout.id}`}>
            Resume that lift
          </Link>
        </section>
      ) : null}

      <section className="grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-4">
        <div className="px-3 first:pl-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Templates</p>
          <p className="mt-2 text-2xl font-semibold text-white">{profileTemplates.length}</p>
        </div>
        <div className="px-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sessions</p>
          <p className="mt-2 text-2xl font-semibold text-white">{profileSessions.length}</p>
        </div>
        <div className="px-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Setup</p>
          <p className="mt-2 truncate text-sm font-semibold text-white">{activeProfile?.name ?? "—"}</p>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <p className="brgym-kicker">Shortcuts</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Keep moving.</h3>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          {[
            { href: "/brgym/workout", label: "Start a workout", detail: "Quick start or customize", icon: Dumbbell },
            { href: "/brgym/plan", label: "Training plan", detail: "See what is coming next", icon: CalendarDays },
            { href: "/brgym/progress", label: "Progress & PRs", detail: "View trends from logged sets", icon: BarChart3 },
          ].map(({ href, label, detail, icon: Icon }) => (
            <Link key={href} className="flex items-center gap-3 border-b border-white/10 p-4 last:border-0" href={href}>
              <span className="rounded-xl border border-white/10 p-2.5"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-white">{label}</span>
                <span className="mt-1 block text-xs text-slate-500">{detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 pt-5">
        <p className="brgym-kicker">Latest session</p>
        {recentSession ? (
          <Link className="mt-3 flex items-center justify-between gap-3" href="/brgym/history">
            <div>
              <p className="text-lg font-medium text-white">{recentSession.workoutName}</p>
              <p className="mt-1 text-sm text-slate-400">{new Date(recentSession.date).toLocaleDateString()} • {recentSession.exerciseLogs.length} exercises</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </Link>
        ) : (
          <p className="mt-3 text-sm text-slate-300">
            No history yet. Start with the default Push template and build from there.
          </p>
        )}
      </section>
    </div>
  );
}
