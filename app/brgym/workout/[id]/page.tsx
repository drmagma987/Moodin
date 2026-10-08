"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { RestTimer } from "@/components/brgym/rest-timer";
import { useBRGym } from "@/components/brgym/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BAND_ASSISTANCE_OPTIONS, STRUGGLE_LABELS } from "@/lib/brgym/defaults";
import {
  buildExerciseLogSummary,
  describePerformance,
  formatWeight,
  getEquipmentProfile,
  getPostExerciseRecommendation,
  getRecommendationForExercise,
  getRelevantExerciseLogs,
  isExerciseSupported,
  normalizeWeight,
} from "@/lib/brgym/logic";
import type { ActiveExerciseDraft, SetLog } from "@/lib/brgym/types";

interface SetDraftInput {
  weight: string;
  reps: string;
  band: string;
}

type ExerciseDraftInputMap = Record<number, SetDraftInput>;

function createDraftInput(weight = "", reps = "", band = ""): SetDraftInput {
  return { weight, reps, band };
}

function getLastTimeSet(log: ReturnType<typeof getRelevantExerciseLogs>[number] | undefined, setNumber: number) {
  return log?.sets.find((set) => set.setNumber === setNumber) ?? null;
}

function getCompletedSet(exercise: ActiveExerciseDraft, setNumber: number) {
  return exercise.completedSets.find((set) => set.setNumber === setNumber) ?? null;
}

function getPlannedSet(exercise: ActiveExerciseDraft, setNumber: number) {
  return exercise.plannedSets?.find((set) => set.setNumber === setNumber) ?? null;
}

function getSetDraftValue(
  inputs: Record<string, ExerciseDraftInputMap>,
  exercise: ActiveExerciseDraft,
  setNumber: number,
): SetDraftInput {
  const existing = inputs[exercise.id]?.[setNumber];
  if (existing) {
    return existing;
  }

  const completedSet = getCompletedSet(exercise, setNumber);
  if (completedSet) {
    return createDraftInput(
      `${completedSet.enteredWeight}`,
      `${completedSet.reps}`,
      completedSet.bandResistance ?? exercise.defaultBandAssistance ?? "",
    );
  }


  const plannedSet = getPlannedSet(exercise, setNumber);
  if (plannedSet) {
    return createDraftInput(
      plannedSet.enteredWeight > 0 ? `${plannedSet.enteredWeight}` : "",
      `${plannedSet.reps}`,
      plannedSet.bandResistance ?? exercise.defaultBandAssistance ?? "",
    );
  }

  return createDraftInput(
    "",
    "",
    exercise.defaultBandAssistance ?? "",
  );
}

export default function BRGymWorkoutLoggerPage() {
  const router = useRouter();
  const {
    data,
    hydrated,
    logSet,
    replaceExercise,
    saveWorkout,
    setExerciseNotes,
    setExerciseStruggle,
    setWorkoutNotes,
  } = useBRGym();

  const activeWorkout = data.activeWorkout;
  const profile = activeWorkout ? getEquipmentProfile(activeWorkout.equipmentProfileId) : null;
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [selectedExerciseIdOverride, setSelectedExerciseIdOverride] = useState<string | null>(null);
  const [draftInputs, setDraftInputs] = useState<Record<string, ExerciseDraftInputMap>>({});
  const [extraSetCounts, setExtraSetCounts] = useState<Record<string, number>>({});

  const savedSession = useMemo(
    () => data.sessions.find((session) => session.id === savedSessionId) ?? null,
    [data.sessions, savedSessionId],
  );

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading workout logger…</div>;
  }

  if (!activeWorkout && savedSession) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">Workout saved</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{savedSession.workoutName}</h2>
            <p className="mt-2 text-sm text-slate-300">
              {savedSession.exerciseLogs.length} exercises saved at {savedSession.equipmentProfileName}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold text-white">Summary</h3>
            <div className="mt-4 space-y-3">
              {savedSession.exerciseLogs.map((log) => (
                <div key={log.exerciseId} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-semibold text-white">{log.exerciseName}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {buildExerciseLogSummary(
                      {
                        id: log.exerciseId,
                        name: log.exerciseName,
                        movementPattern: log.movementPattern,
                        exerciseType: log.exerciseType,
                        targetSets: log.sets.length,
                        repMin: 8,
                        repMax: 12,
                        equipment: ["bodyweight"],
                        progressionIncrement: 0,
                        notes: "",
                        sensitivityFlags: { knee: false, lowerBack: false, shoulder: false },
                      },
                      log.sets,
                    )}
                  </p>
                  <p className="mt-2 text-sm text-cyan-100">{log.recommendation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Link className="rounded-[22px] bg-white/8 px-4 py-4 text-center text-sm text-slate-100" href="/brgym/history">
            View history
          </Link>
          <Link className="rounded-[22px] bg-cyan-400 px-4 py-4 text-center text-sm font-semibold text-slate-950" href="/brgym/workout">
            Start next workout
          </Link>
        </div>
      </div>
    );
  }

  if (!activeWorkout || !profile) {
    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          No active workout. Start one from the workout tab.
        </div>
        <Link className="rounded-[22px] bg-cyan-400 px-4 py-4 text-center text-sm font-semibold text-slate-950" href="/brgym/workout">
          Go to workout setup
        </Link>
      </div>
    );
  }

  const currentProfile = profile;

  const selectedExerciseId =
    selectedExerciseIdOverride &&
    activeWorkout.exercises.some((exercise) => exercise.id === selectedExerciseIdOverride)
      ? selectedExerciseIdOverride
      : activeWorkout.exercises[0].id;
  const selectedExercise =
    activeWorkout.exercises.find((exercise) => exercise.id === selectedExerciseId) ??
    activeWorkout.exercises[0];
  const relevantLogs = getRelevantExerciseLogs(data.sessions, selectedExercise);
  const previousLog = relevantLogs[0];
  const suggestion = getRecommendationForExercise(
    data.sessions,
    selectedExercise,
    profile,
    activeWorkout.discomfortFlags,
  );
  const postRecommendation =
    selectedExercise.completedSets.length > 0 && selectedExercise.struggleRating
      ? getPostExerciseRecommendation(
          selectedExercise,
          selectedExercise.completedSets,
          selectedExercise.struggleRating,
          profile,
          activeWorkout.discomfortFlags,
        )
      : null;
  const unsupported = !isExerciseSupported(selectedExercise, profile);
  const isAssistedPullUp = selectedExercise.name.toLowerCase().includes("pull-up");
  const extraSetCount = extraSetCounts[selectedExercise.id] ?? 0;
  const visibleSetCount = Math.max(
    selectedExercise.targetSets + extraSetCount,
    selectedExercise.completedSets.length,
  );
  const visibleSetNumbers = Array.from({ length: visibleSetCount }, (_, index) => index + 1);
  const completedExerciseCount = activeWorkout.exercises.filter((exercise) => exercise.completedSets.length > 0).length;
  const nextSetNumber = visibleSetNumbers.find((setNumber) => !getCompletedSet(selectedExercise, setNumber));
  const nextSetInput = nextSetNumber
    ? getSetDraftValue(draftInputs, selectedExercise, nextSetNumber)
    : null;
  const nextPreviousSet = nextSetNumber ? getLastTimeSet(previousLog, nextSetNumber) : null;
  const nextPlannedSet = nextSetNumber ? getPlannedSet(selectedExercise, nextSetNumber) : null;

  function updateSetInput(setNumber: number, partial: Partial<SetDraftInput>) {
    const currentValue = getSetDraftValue(draftInputs, selectedExercise, setNumber);
    setDraftInputs((current) => ({
      ...current,
      [selectedExercise.id]: {
        ...(current[selectedExercise.id] ?? {}),
        [setNumber]: { ...currentValue, ...partial },
      },
    }));
  }

  function submitSet(setNumber: number) {
    const setInput = getSetDraftValue(draftInputs, selectedExercise, setNumber);
    const reps = Number(setInput.reps);
    const weight = Number(setInput.weight || "0");
    if (!Number.isFinite(reps) || reps <= 0) {
      toast.error(`Enter reps for Set ${setNumber}`);
      return;
    }
    const normalized = normalizeWeight(weight, currentProfile.primaryUnit);
    const setLog: SetLog = {
      setNumber,
      reps,
      enteredWeight: weight,
      enteredUnit: currentProfile.primaryUnit,
      normalizedWeightLb: normalized.lb,
      normalizedWeightKg: normalized.kg,
      bandResistance:
        isAssistedPullUp ? setInput.band || null : null,
    };
    logSet(selectedExercise.id, setLog);
    updateSetInput(setNumber, { weight: `${weight}`, reps: `${reps}` });
    toast.success(`${selectedExercise.name} • Set ${setNumber} logged`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">{activeWorkout.category}</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{activeWorkout.workoutName}</h2>
              <p className="mt-2 text-sm text-slate-300">{profile.name}</p>
            </div>
            <Button
              onClick={() => {
                const missingRating = activeWorkout.exercises.find(
                  (exercise) => exercise.completedSets.length > 0 && !exercise.struggleRating,
                );
                if (missingRating) {
                  setSelectedExerciseIdOverride(missingRating.id);
                  toast.error(`Rate ${missingRating.name} before saving`);
                  return;
                }
                const session = saveWorkout();
                if (session) {
                  setSavedSessionId(session.id);
                  toast.success("Workout saved", {
                    description: `${session.exerciseLogs.length} exercises logged.`,
                  });
                  router.refresh();
                } else {
                  toast.error("Nothing to save yet");
                }
              }}
            >
              Save workout
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="cyan">{completedExerciseCount}/{activeWorkout.exercises.length} lifts started</Badge>
            <Badge>{data.settings.defaultRestSeconds / 60} min rest</Badge>
          </div>
        </CardContent>
      </Card>

      <RestTimer>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-white">{selectedExercise.name}</p>
              <p className="text-xs text-slate-400">
                {nextSetNumber ? `Set ${nextSetNumber} • target ${selectedExercise.repMin}-${selectedExercise.repMax} reps` : "All planned sets logged"}
              </p>
            </div>
            <label className="relative max-w-[9rem]">
              <Select
                aria-label="Choose lift"
                className="h-10 appearance-none truncate pr-8 text-xs"
                onChange={(event) => setSelectedExerciseIdOverride(event.target.value)}
                value={selectedExercise.id}
              >
                {activeWorkout.exercises.map((exercise, index) => (
                  <option key={exercise.id} value={exercise.id}>{index + 1}. {exercise.name}</option>
                ))}
              </Select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </label>
          </div>

          {selectedExercise.progressionSummary ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50">
              <span className="font-semibold">Today’s progression: </span>{selectedExercise.progressionSummary}
            </div>
          ) : null}

          {nextSetNumber && nextSetInput ? (
            <>
              <div className={`grid gap-2 ${isAssistedPullUp ? "grid-cols-1" : "grid-cols-2"}`}>
                {!isAssistedPullUp ? <label className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                    Weight ({profile.primaryUnit})
                  </span>
                  <Input
                    className="mt-1 border-none bg-transparent px-0 text-2xl font-semibold shadow-none"
                    inputMode="decimal"
                    onChange={(event) => updateSetInput(nextSetNumber, { weight: event.target.value })}
                    placeholder={nextPlannedSet?.enteredWeight ? `${nextPlannedSet.enteredWeight}` : suggestion.suggestedWeight ? `${suggestion.suggestedWeight}` : "0"}
                    value={nextSetInput.weight}
                  />
                  <p className="text-[11px] text-slate-400">
                    {nextPlannedSet?.enteredWeight ? `Today ${formatWeight(nextPlannedSet.enteredWeight, nextPlannedSet.enteredUnit, profile)}` : nextPreviousSet ? `Last ${formatWeight(nextPreviousSet.enteredWeight, nextPreviousSet.enteredUnit, profile)}` : "Choose a clean starting weight"}
                  </p>
                </label> : null}
                <label className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Reps</span>
                  <Input
                    className="mt-1 border-none bg-transparent px-0 text-2xl font-semibold shadow-none"
                    inputMode="numeric"
                    onChange={(event) => updateSetInput(nextSetNumber, { reps: event.target.value })}
                    placeholder={`${selectedExercise.repMin}-${selectedExercise.repMax}`}
                    value={nextSetInput.reps}
                  />
                  <p className="text-[11px] text-slate-400">{nextPlannedSet ? `Today ${nextPlannedSet.reps} • last ${nextPreviousSet?.reps ?? "—"}` : `Target ${selectedExercise.repMin}-${selectedExercise.repMax}`}</p>
                </label>
              </div>
              {isAssistedPullUp ? (
                <Select onChange={(event) => updateSetInput(nextSetNumber, { band: event.target.value })} value={nextSetInput.band}>
                  <option value="">No band</option>
                  {BAND_ASSISTANCE_OPTIONS.map((option) => <option key={option} value={option}>{option} assistance</option>)}
                </Select>
              ) : null}
              <Button className="w-full" onClick={() => submitSet(nextSetNumber)} size="lg">Log Set {nextSetNumber}</Button>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setExtraSetCounts((current) => ({ ...current, [selectedExercise.id]: (current[selectedExercise.id] ?? 0) + 1 }))} variant="secondary">
                <Plus className="mr-2 h-4 w-4" /> Add set
              </Button>
              <Button
                onClick={() => {
                  const currentIndex = activeWorkout.exercises.findIndex((exercise) => exercise.id === selectedExercise.id);
                  const nextExercise = activeWorkout.exercises.slice(currentIndex + 1).find((exercise) => exercise.completedSets.length < exercise.targetSets);
                  if (nextExercise) setSelectedExerciseIdOverride(nextExercise.id);
                }}
                disabled={!activeWorkout.exercises.some((exercise) => exercise.id !== selectedExercise.id && exercise.completedSets.length < exercise.targetSets)}
              >Next lift</Button>
            </div>
          )}
        </div>
      </RestTimer>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Set progress</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {visibleSetNumbers.map((setNumber) => {
                const completedSet = getCompletedSet(selectedExercise, setNumber);
                return (
                  <div key={setNumber} className={`rounded-2xl border p-3 text-center text-sm ${completedSet ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-400"}`}>
                    <p className="text-xs">Set {setNumber}</p>
                    <p className="mt-1 font-semibold">{completedSet ? `${completedSet.enteredWeight || "BW"} × ${completedSet.reps}` : "Open"}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm font-medium text-white">Guidance, history, and set edits</summary>
            <div className="mt-4 space-y-4 text-sm">
              <p className="text-slate-300">Last time: {describePerformance(previousLog)}</p>
              <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-50">
                <p>{suggestion.recommendation}</p>
                {suggestion.explanation ? <p className="mt-2 text-xs text-cyan-100/80">{suggestion.explanation}</p> : null}
              </div>
              {unsupported ? (
                <div className="rounded-2xl bg-amber-400/10 p-3 text-amber-50">
                  <p>Equipment missing. Choose a swap:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedExercise.replacementOptions ?? []).map((option) => <Button key={option} onClick={() => replaceExercise(selectedExercise.id, option)} size="sm" variant="secondary">{option}</Button>)}
                  </div>
                </div>
              ) : null}
              {visibleSetNumbers.map((setNumber) => {
                const setInput = getSetDraftValue(draftInputs, selectedExercise, setNumber);
                return (
                  <div key={setNumber} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2">
                    <span className="pb-3 text-slate-400">{setNumber}</span>
                    <Input aria-label={`Set ${setNumber} weight`} inputMode="decimal" onChange={(event) => updateSetInput(setNumber, { weight: event.target.value })} placeholder="Weight" value={setInput.weight} />
                    <Input aria-label={`Set ${setNumber} reps`} inputMode="numeric" onChange={(event) => updateSetInput(setNumber, { reps: event.target.value })} placeholder="Reps" value={setInput.reps} />
                    <Button onClick={() => submitSet(setNumber)} size="sm">Save</Button>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <Button onClick={() => setExtraSetCounts((current) => ({ ...current, [selectedExercise.id]: (current[selectedExercise.id] ?? 0) + 1 }))} size="sm" variant="secondary"><Plus className="mr-1 h-4 w-4" /> Add set</Button>
                <Link className="rounded-xl bg-white/8 px-3 py-2 text-xs text-cyan-200" href={`/brgym/exercises/${selectedExercise.id}`}>Exercise history</Link>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">How hard was this lift?</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as const).map((rating) => (
                <button
                  key={rating}
                  aria-label={STRUGGLE_LABELS[rating]}
                  className={`rounded-2xl border px-2 py-3 text-center text-sm ${
                    selectedExercise.struggleRating === rating
                      ? "border-cyan-400 bg-cyan-400/12 text-white"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                  onClick={() => setExerciseStruggle(selectedExercise.id, rating)}
                  type="button"
                >
                  <span className="block text-lg font-semibold">{rating}</span>
                  <span className="mt-1 block truncate text-[10px] text-slate-400">{rating === 1 ? "Easy" : rating === 3 ? "Clean" : rating === 5 ? "Failed" : rating === 2 ? "Solid" : "Hard"}</span>
                </button>
              ))}
            </div>
          </div>

          {postRecommendation ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-100">Next-time recommendation</p>
              <p className="mt-2 text-white">{postRecommendation.recommendation}</p>
            </div>
          ) : null}

          <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <summary className="cursor-pointer text-sm text-slate-200">Add optional notes</summary>
            <div className="mt-3 space-y-3">
              <Textarea onChange={(event) => setExerciseNotes(selectedExercise.id, event.target.value)} placeholder="Notes for this lift" value={selectedExercise.notes} />
              <Textarea onChange={(event) => setWorkoutNotes(event.target.value)} placeholder="Notes for the whole workout" value={activeWorkout.notes} />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
