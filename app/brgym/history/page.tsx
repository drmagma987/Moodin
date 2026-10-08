"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EXERCISE_LIBRARY, STRUGGLE_LABELS } from "@/lib/brgym/defaults";
import { buildExerciseLogSummary } from "@/lib/brgym/logic";
import type { DifficultyRating, ExerciseTemplate, WorkoutSession } from "@/lib/brgym/types";

function cloneSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    discomfortFlags: { ...session.discomfortFlags },
    exerciseLogs: session.exerciseLogs.map((log) => ({
      ...log,
      sets: log.sets.map((set) => ({ ...set })),
    })),
    recommendations: [...session.recommendations],
  };
}

function toLocalDateTimeValue(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getLogTemplate(log: WorkoutSession["exerciseLogs"][number]): ExerciseTemplate {
  return {
    id: log.exerciseId,
    name: log.exerciseName,
    movementPattern: log.movementPattern,
    exerciseType: log.exerciseType,
    targetSets: log.targetSets ?? log.sets.length,
    repMin: log.repMin ?? 8,
    repMax: log.repMax ?? 12,
    equipment: ["bodyweight"],
    progressionIncrement: log.progressionIncrement ?? 0,
    notes: "",
    sensitivityFlags: { knee: false, lowerBack: false, shoulder: false },
  };
}

export default function BRGymHistoryPage() {
  const { data, hydrated, updateWorkoutSession } = useBRGym();
  const [editingSession, setEditingSession] = useState<WorkoutSession | null>(null);
  const visibleSessions = data.sessions.filter((session) => (session.trainingProfile ?? "vaughn") === data.settings.activeTrainingProfile);

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading history…</div>;
  }

  function updateEditingSession(updater: (session: WorkoutSession) => WorkoutSession) {
    setEditingSession((current) => current ? updater(current) : current);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold text-white">Workout history</h2>
        <p className="mt-2 text-sm text-slate-300">
          Correct saved details here. Templates stay unchanged, while future progression immediately uses the corrected history.
        </p>
      </section>

      <datalist id="brgym-exercise-names">
        {Object.keys(EXERCISE_LIBRARY).map((name) => <option key={name} value={name} />)}
      </datalist>

      {visibleSessions.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">No saved workouts yet.</div>
      ) : visibleSessions.map((session) => {
        const isEditing = editingSession?.id === session.id;
        const visibleSession = isEditing ? editingSession : session;
        return (
          <article key={session.id} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            {isEditing ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Editing saved workout</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">Corrections update future targets</h3>
                  </div>
                  <Button aria-label="Cancel editing" onClick={() => setEditingSession(null)} size="sm" variant="secondary"><X className="h-4 w-4" /></Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                    Workout name
                    <Input onChange={(event) => updateEditingSession((current) => ({ ...current, workoutName: event.target.value }))} value={visibleSession.workoutName} />
                  </label>
                  <label className="space-y-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                    Date and time
                    <Input
                      onChange={(event) => {
                        const nextDate = new Date(event.target.value);
                        if (!Number.isNaN(nextDate.getTime())) updateEditingSession((current) => ({ ...current, date: nextDate.toISOString() }));
                      }}
                      type="datetime-local"
                      value={toLocalDateTimeValue(visibleSession.date)}
                    />
                  </label>
                </div>

                {visibleSession.exerciseLogs.map((log, logIndex) => (
                  <section key={`${log.exerciseId}-${logIndex}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1 space-y-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Exercise
                        <Input
                          list="brgym-exercise-names"
                          onChange={(event) => updateEditingSession((current) => ({
                            ...current,
                            exerciseLogs: current.exerciseLogs.map((candidate, index) => index === logIndex ? { ...candidate, exerciseName: event.target.value } : candidate),
                          }))}
                          value={log.exerciseName}
                        />
                      </label>
                      <Button
                        aria-label={`Remove ${log.exerciseName}`}
                        onClick={() => updateEditingSession((current) => ({ ...current, exerciseLogs: current.exerciseLogs.filter((_, index) => index !== logIndex) }))}
                        size="sm"
                        variant="destructive"
                      ><Trash2 className="h-4 w-4" /></Button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {log.sets.map((set, setIndex) => (
                        <div key={set.setNumber} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2">
                          <span className="pb-3 text-sm text-slate-400">{setIndex + 1}</span>
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            Weight ({set.enteredUnit})
                            <Input
                              inputMode="decimal"
                              onChange={(event) => updateEditingSession((current) => ({
                                ...current,
                                exerciseLogs: current.exerciseLogs.map((candidate, index) => index === logIndex ? {
                                  ...candidate,
                                  sets: candidate.sets.map((candidateSet, index) => index === setIndex ? { ...candidateSet, enteredWeight: Number(event.target.value || "0") } : candidateSet),
                                } : candidate),
                              }))}
                              value={set.enteredWeight}
                            />
                          </label>
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                            Reps
                            <Input
                              inputMode="numeric"
                              onChange={(event) => updateEditingSession((current) => ({
                                ...current,
                                exerciseLogs: current.exerciseLogs.map((candidate, index) => index === logIndex ? {
                                  ...candidate,
                                  sets: candidate.sets.map((candidateSet, index) => index === setIndex ? { ...candidateSet, reps: Number(event.target.value || "0") } : candidateSet),
                                } : candidate),
                              }))}
                              value={set.reps}
                            />
                          </label>
                          <Button
                            aria-label={`Remove set ${setIndex + 1}`}
                            onClick={() => updateEditingSession((current) => ({
                              ...current,
                              exerciseLogs: current.exerciseLogs.map((candidate, index) => index === logIndex ? { ...candidate, sets: candidate.sets.filter((_, index) => index !== setIndex) } : candidate),
                            }))}
                            size="sm"
                            variant="secondary"
                          ><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Difficulty
                        <Select
                          onChange={(event) => updateEditingSession((current) => ({
                            ...current,
                            exerciseLogs: current.exerciseLogs.map((candidate, index) => index === logIndex ? { ...candidate, struggleRating: Number(event.target.value) as DifficultyRating } : candidate),
                          }))}
                          value={log.struggleRating}
                        >
                          {([1, 2, 3, 4, 5] as const).map((rating) => <option key={rating} value={rating}>{rating} — {STRUGGLE_LABELS[rating]}</option>)}
                        </Select>
                      </label>
                      <label className="space-y-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                        Exercise notes
                        <Input
                          onChange={(event) => updateEditingSession((current) => ({
                            ...current,
                            exerciseLogs: current.exerciseLogs.map((candidate, index) => index === logIndex ? { ...candidate, notes: event.target.value } : candidate),
                          }))}
                          value={log.notes}
                        />
                      </label>
                    </div>
                  </section>
                ))}

                <label className="block space-y-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                  Workout notes
                  <Textarea onChange={(event) => updateEditingSession((current) => ({ ...current, notes: event.target.value }))} value={visibleSession.notes} />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={() => setEditingSession(null)} variant="secondary">Cancel</Button>
                  <Button onClick={() => {
                    if (updateWorkoutSession(visibleSession)) {
                      setEditingSession(null);
                      toast.success("Workout corrections saved", { description: "Future targets now use the corrected history." });
                    } else {
                      toast.error("Keep a workout name and at least one valid exercise set.");
                    }
                  }}><Save className="mr-2 h-4 w-4" /> Save changes</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{session.workoutName}</p>
                    <p className="mt-1 text-sm text-slate-300">{session.category} • {session.equipmentProfileName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">{new Date(session.date).toLocaleString()}</p>
                    <Button className="mt-2" onClick={() => setEditingSession(cloneSession(session))} size="sm" variant="secondary"><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {session.exerciseLogs.map((log, index) => (
                    <div key={`${log.exerciseId}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-white">{log.exerciseName}</p>
                          <p className="mt-1 text-sm text-slate-300">{buildExerciseLogSummary(getLogTemplate(log), log.sets)}</p>
                        </div>
                        <Link className="text-sm text-cyan-300" href={`/brgym/exercises/${log.exerciseId}`}>Exercise</Link>
                      </div>
                      <p className="mt-2 text-sm text-cyan-100">{log.recommendation}</p>
                    </div>
                  ))}
                </div>
                {session.notes ? <p className="mt-4 text-sm text-slate-300">Notes: {session.notes}</p> : null}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
