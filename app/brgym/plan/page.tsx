"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Dumbbell, Flag, Footprints, Timer } from "lucide-react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RunLog, TrainingPlanEntry } from "@/lib/brgym/types";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPlanDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isLiftComplete(entry: TrainingPlanEntry, sessionPlanEntryIds: Set<string>) {
  return entry.kind === "lift" && sessionPlanEntryIds.has(entry.id);
}

export default function BRGymPlanPage() {
  const router = useRouter();
  const { data, hydrated, clearRunLog, saveRunLog, startWorkout } = useBRGym();
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [showFullPlan, setShowFullPlan] = useState(false);
  const [runDraft, setRunDraft] = useState({
    distanceMiles: "",
    totalMinutes: "",
    intervalPaces: "",
    averageHeartRate: "",
    difficulty: "",
    notes: "",
  });

  const completedLiftIds = useMemo(
    () => new Set(data.sessions.map((session) => session.planEntryId).filter((id): id is string => Boolean(id))),
    [data.sessions],
  );

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading your program…</div>;
  }

  const plan = data.trainingPlan;
  if (!plan) {
    return (
      <Card>
        <CardContent>
          <h2 className="text-2xl font-semibold text-white">No active program</h2>
          <p className="mt-2 text-sm text-slate-300">Import a BR Gym backup or create workout templates to get started.</p>
        </CardContent>
      </Card>
    );
  }

  const today = localDateKey();
  const completedCount = plan.entries.filter(
    (entry) => Boolean(entry.runLog) || isLiftComplete(entry, completedLiftIds),
  ).length;
  const visibleEntries = showFullPlan
    ? plan.entries
    : plan.entries.filter((entry) => entry.date >= today).slice(0, 8);

  function openRunLog(entry: TrainingPlanEntry) {
    setEditingRunId(entry.id);
    setRunDraft({
      distanceMiles: entry.runLog ? `${entry.runLog.distanceMiles}` : "",
      totalMinutes: entry.runLog ? `${entry.runLog.totalMinutes}` : "",
      intervalPaces: entry.runLog?.intervalPaces ?? "",
      averageHeartRate: entry.runLog?.averageHeartRate ? `${entry.runLog.averageHeartRate}` : "",
      difficulty: entry.runLog ? `${entry.runLog.difficulty}` : "",
      notes: entry.runLog?.notes ?? "",
    });
  }

  function submitRunLog(entry: TrainingPlanEntry) {
    const distanceMiles = Number(runDraft.distanceMiles);
    const totalMinutes = Number(runDraft.totalMinutes);
    const difficulty = Number(runDraft.difficulty);
    const averageHeartRate = runDraft.averageHeartRate ? Number(runDraft.averageHeartRate) : null;
    if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) {
      toast.error("Enter the distance you ran");
      return;
    }
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
      toast.error("Enter your total time in minutes");
      return;
    }
    if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
      toast.error("Difficulty must be from 1 to 10");
      return;
    }
    const log: RunLog = {
      completedAt: new Date().toISOString(),
      distanceMiles,
      totalMinutes,
      intervalPaces: runDraft.intervalPaces.trim(),
      averageHeartRate:
        averageHeartRate !== null && Number.isFinite(averageHeartRate) ? averageHeartRate : null,
      difficulty,
      notes: runDraft.notes.trim(),
    };
    saveRunLog(entry.id, log);
    setEditingRunId(null);
    toast.success(`${entry.title} saved`);
  }

  return (
    <div className="space-y-4">
      <Card className="border-cyan-400/20 bg-cyan-400/8">
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Your active program</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{plan.name}</h2>
              <p className="mt-2 text-sm text-slate-300">
                {formatPlanDate(plan.startDate)} through {formatPlanDate(plan.endDate)}
              </p>
            </div>
            <Badge variant="cyan">{completedCount}/{plan.entries.length}</Badge>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            Running is the competitive priority through race day. Keep lower-body lifting controlled once the endurance runs reach 2.75 miles.
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {visibleEntries.map((entry) => {
          const liftComplete = isLiftComplete(entry, completedLiftIds);
          const complete = liftComplete || Boolean(entry.runLog);
          const isToday = entry.date === today;
          const isPast = entry.date < today;
          const icon = entry.kind === "lift" ? Dumbbell : entry.kind === "race" ? Flag : Footprints;
          const Icon = icon;

          return (
            <Card
              key={entry.id}
              className={isToday ? "border-cyan-400/50 bg-cyan-400/10" : complete ? "border-emerald-400/20" : ""}
            >
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-2xl p-3 ${complete ? "bg-emerald-400/15 text-emerald-200" : "bg-white/8 text-cyan-200"}`}>
                      {complete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{entry.title}</h3>
                        {entry.optional ? <Badge variant="warning">Optional</Badge> : null}
                        {isToday ? <Badge variant="cyan">Today</Badge> : null}
                        {complete ? <Badge variant="success">Done</Badge> : null}
                        {isPast && !complete ? <Badge variant="warning">Not logged</Badge> : null}
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatPlanDate(entry.date)}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-6 text-slate-200">{entry.details}</p>

                {entry.kind === "lift" && entry.templateId ? (
                  <Button
                    className="w-full"
                    disabled={Boolean(data.activeWorkout && data.activeWorkout.planEntryId !== entry.id)}
                    onClick={() => {
                      if (data.activeWorkout?.planEntryId === entry.id) {
                        router.push(`/brgym/workout/${data.activeWorkout.id}`);
                        return;
                      }
                      const template = data.templates.find((candidate) => candidate.id === entry.templateId);
                      if (!template) {
                        toast.error("This workout template is missing");
                        return;
                      }
                      const workoutId = startWorkout({
                        templateId: template.id,
                        equipmentProfileId: data.settings.activeEquipmentProfileId,
                        discomfortFlags: { knee: false, lowerBack: false, shoulder: false },
                        categoryOverride: template.category,
                        planEntryId: entry.id,
                      });
                      router.push(`/brgym/workout/${workoutId}`);
                    }}
                    variant={complete ? "secondary" : "default"}
                  >
                    {data.activeWorkout?.planEntryId === entry.id
                      ? "Resume this lift"
                      : complete
                        ? "Repeat workout"
                        : "Start this lift"}
                  </Button>
                ) : null}

                {entry.kind !== "lift" && editingRunId !== entry.id ? (
                  <div className="space-y-3">
                    {entry.runLog ? (
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
                        <p className="font-semibold">
                          {entry.runLog.distanceMiles} mi in {entry.runLog.totalMinutes} min • Difficulty {entry.runLog.difficulty}/10
                        </p>
                        {entry.runLog.averageHeartRate ? <p className="mt-1">Average HR: {entry.runLog.averageHeartRate} bpm</p> : null}
                        {entry.runLog.intervalPaces ? <p className="mt-1">Splits: {entry.runLog.intervalPaces}</p> : null}
                      </div>
                    ) : null}
                    <div className={entry.timedSections?.length ? "grid grid-cols-2 gap-2" : ""}>
                      {entry.timedSections?.length ? (
                        <Button className="w-full" onClick={() => router.push(`/brgym/run/${entry.id}`)}>
                          <Timer className="mr-2 h-4 w-4" /> Start timer
                        </Button>
                      ) : null}
                      <Button className="w-full" onClick={() => openRunLog(entry)} variant="secondary">
                        {entry.runLog ? "Edit log" : "Log run"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {entry.kind !== "lift" && editingRunId === entry.id ? (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                        Distance (mi)
                        <Input className="mt-2" inputMode="decimal" onChange={(event) => setRunDraft((current) => ({ ...current, distanceMiles: event.target.value }))} value={runDraft.distanceMiles} />
                      </label>
                      <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                        Total minutes
                        <Input className="mt-2" inputMode="decimal" onChange={(event) => setRunDraft((current) => ({ ...current, totalMinutes: event.target.value }))} value={runDraft.totalMinutes} />
                      </label>
                      <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                        Average HR
                        <Input className="mt-2" inputMode="numeric" onChange={(event) => setRunDraft((current) => ({ ...current, averageHeartRate: event.target.value }))} value={runDraft.averageHeartRate} />
                      </label>
                      <label className="text-xs uppercase tracking-[0.14em] text-slate-400">
                        Difficulty 1-10
                        <Input className="mt-2" inputMode="numeric" onChange={(event) => setRunDraft((current) => ({ ...current, difficulty: event.target.value }))} value={runDraft.difficulty} />
                      </label>
                    </div>
                    <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
                      Interval paces / splits
                      <Input className="mt-2" onChange={(event) => setRunDraft((current) => ({ ...current, intervalPaces: event.target.value }))} placeholder="8:14, 8:09, 8:18…" value={runDraft.intervalPaces} />
                    </label>
                    <label className="block text-xs uppercase tracking-[0.14em] text-slate-400">
                      Notes
                      <Textarea className="mt-2" onChange={(event) => setRunDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="How did it feel?" value={runDraft.notes} />
                    </label>
                    <Button className="w-full" onClick={() => submitRunLog(entry)}>Save run</Button>
                    <Button className="w-full" onClick={() => setEditingRunId(null)} variant="secondary">Cancel</Button>
                    {entry.runLog ? (
                      <Button
                        className="w-full"
                        onClick={() => {
                          clearRunLog(entry.id);
                          setEditingRunId(null);
                        }}
                        variant="destructive"
                      >
                        Clear run log
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button className="w-full" onClick={() => setShowFullPlan((current) => !current)} variant="secondary">
        {showFullPlan ? "Show upcoming only" : `Show full plan (${plan.entries.length} sessions)`}
      </Button>

      <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-500">
        <ChevronDown className="h-4 w-4" /> Race day is Friday, November 27
      </div>
    </div>
  );
}
