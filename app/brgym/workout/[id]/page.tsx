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
  const extraSetCount = extraSetCounts[selectedExercise.id] ?? 0;
  const visibleSetCount = Math.max(
    selectedExercise.targetSets + extraSetCount,
    selectedExercise.completedSets.length,
  );
  const visibleSetNumbers = Array.from({ length: visibleSetCount }, (_, index) => index + 1);
  const completedExerciseCount = activeWorkout.exercises.filter((exercise) => exercise.completedSets.length > 0).length;

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

      <RestTimer />

      <Card className="sticky top-3 z-10 border-cyan-400/20 bg-slate-950/92 backdrop-blur">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current lift</p>
              <h3 className="mt-1 text-xl font-semibold text-white">{selectedExercise.name}</h3>
            </div>
            <Link className="text-sm text-cyan-300" href={`/brgym/exercises/${selectedExercise.id}`}>
              History
            </Link>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-400">Choose lift</span>
            <div className="relative">
              <Select
                className="h-14 appearance-none pr-10 text-base"
                onChange={(event) => setSelectedExerciseIdOverride(event.target.value)}
                value={selectedExercise.id}
              >
                {activeWorkout.exercises.map((exercise, index) => (
                  <option key={exercise.id} value={exercise.id}>
                    {index + 1}. {exercise.name}
                  </option>
                ))}
              </Select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            </div>
          </label>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Rep target</p>
              <p className="mt-1 font-medium text-white">
                {selectedExercise.repMin}-{selectedExercise.repMax} reps
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sets on screen</p>
              <p className="mt-1 font-medium text-white">{visibleSetCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Previous relevant performance</p>
              <p className="mt-2 text-sm text-slate-200">{describePerformance(previousLog)}</p>
            </div>
            {selectedExercise.selectedReplacementName ? (
              <Badge variant="warning">Swap: {selectedExercise.selectedReplacementName}</Badge>
            ) : null}
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Suggested today</p>
            <p className="mt-2 text-slate-100">{suggestion.recommendation}</p>
            {suggestion.suggestedWeight ? (
              <p className="mt-2 font-medium text-white">
                Start near{" "}
                {formatWeight(
                  suggestion.suggestedWeight,
                  suggestion.suggestedUnit ?? profile.primaryUnit,
                  profile,
                )}
              </p>
            ) : null}
            {suggestion.explanation ? <p className="mt-2 text-cyan-100/90">{suggestion.explanation}</p> : null}
          </div>

          {unsupported ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
              <p className="text-sm font-medium text-amber-100">Equipment missing for this setup.</p>
              <p className="mt-1 text-sm text-amber-50/90">Pick a swap before you log this lift.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedExercise.replacementOptions ?? []).map((option) => (
                  <Button
                    key={option}
                    onClick={() => replaceExercise(selectedExercise.id, option)}
                    size="sm"
                    variant="secondary"
                  >
                    Use {option}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        {visibleSetNumbers.map((setNumber) => {
          const completedSet = getCompletedSet(selectedExercise, setNumber);
          const previousSet = getLastTimeSet(previousLog, setNumber);
          const setInput = getSetDraftValue(
            draftInputs,
            selectedExercise,
            setNumber,
          );

          return (
            <Card key={`${selectedExercise.id}-${setNumber}`}>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      Set {setNumber}
                      {setNumber > selectedExercise.targetSets ? " • Extra" : ""}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      Last time:{" "}
                      {previousSet
                        ? selectedExercise.name === "Pull-up / assisted pull-up"
                          ? `${previousSet.reps} reps${previousSet.bandResistance ? `, ${previousSet.bandResistance}` : ""}`
                          : `${formatWeight(previousSet.enteredWeight, previousSet.enteredUnit, profile)} x ${previousSet.reps}`
                        : "No set logged"}
                    </p>
                  </div>
                  {completedSet ? <Badge variant="success">Logged</Badge> : <Badge>Open</Badge>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {profile.primaryUnit === "kg" ? "Weight (kg)" : "Weight (lb)"}
                    </span>
                    <Input
                      className="mt-2 border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus:border-none"
                      inputMode="decimal"
                      onChange={(event) =>
                        setDraftInputs((current) => ({
                          ...current,
                          [selectedExercise.id]: {
                            ...(current[selectedExercise.id] ?? {}),
                            [setNumber]: { ...setInput, weight: event.target.value },
                          },
                        }))
                      }
                      placeholder={suggestion.suggestedWeight ? `${suggestion.suggestedWeight}` : "0"}
                      value={setInput.weight}
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Last:{" "}
                      <span className="font-medium text-slate-200">
                        {previousSet
                          ? selectedExercise.name === "Pull-up / assisted pull-up"
                            ? previousSet.bandResistance ?? "Bodyweight"
                            : formatWeight(previousSet.enteredWeight, previousSet.enteredUnit, profile)
                          : "No log"}
                      </span>
                    </p>
                  </label>
                  <label className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Reps</span>
                    <Input
                      className="mt-2 border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus:border-none"
                      inputMode="numeric"
                      onChange={(event) =>
                        setDraftInputs((current) => ({
                          ...current,
                          [selectedExercise.id]: {
                            ...(current[selectedExercise.id] ?? {}),
                            [setNumber]: { ...setInput, reps: event.target.value },
                          },
                        }))
                      }
                      placeholder={`${selectedExercise.repMin}`}
                      value={setInput.reps}
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Last:{" "}
                      <span className="font-medium text-slate-200">
                        {previousSet ? `${previousSet.reps} reps` : "No log"}
                      </span>
                    </p>
                  </label>
                </div>

                {selectedExercise.name === "Pull-up / assisted pull-up" ? (
                  <label className="block rounded-2xl border border-white/10 bg-white/5 p-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Band assistance</span>
                    <Select
                      className="mt-2"
                      onChange={(event) =>
                        setDraftInputs((current) => ({
                          ...current,
                          [selectedExercise.id]: {
                            ...(current[selectedExercise.id] ?? {}),
                            [setNumber]: { ...setInput, band: event.target.value },
                          },
                        }))
                      }
                      value={setInput.band}
                    >
                      <option value="">No band</option>
                      {BAND_ASSISTANCE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}

                <Button
                  className="w-full"
                  onClick={() => {
                    const reps = Number(setInput.reps);
                    const weight = Number(setInput.weight || "0");
                    if (!Number.isFinite(reps) || reps <= 0) {
                      toast.error(`Enter reps for Set ${setNumber}`);
                      return;
                    }
                    const normalized = normalizeWeight(weight, profile.primaryUnit);
                    const setLog: SetLog = {
                      setNumber,
                      reps,
                      enteredWeight: weight,
                      enteredUnit: profile.primaryUnit,
                      normalizedWeightLb: normalized.lb,
                      normalizedWeightKg: normalized.kg,
                      bandResistance:
                        selectedExercise.name === "Pull-up / assisted pull-up" ? setInput.band || null : null,
                    };
                    logSet(selectedExercise.id, setLog);
                    setDraftInputs((current) => ({
                      ...current,
                      [selectedExercise.id]: {
                        ...(current[selectedExercise.id] ?? {}),
                        [setNumber]: {
                          ...setInput,
                          weight: `${weight}`,
                          reps: `${reps}`,
                        },
                      },
                    }));
                    toast.success(`Set ${setNumber} logged for ${selectedExercise.name}`);
                  }}
                  size="lg"
                >
                  {completedSet ? `Update Set ${setNumber}` : `Log Set ${setNumber}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}

        <Button
          className="w-full"
          onClick={() =>
            setExtraSetCounts((current) => ({
              ...current,
              [selectedExercise.id]: (current[selectedExercise.id] ?? 0) + 1,
            }))
          }
          size="lg"
          variant="secondary"
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Set
        </Button>
      </section>

      <Card>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Struggle rating</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {([1, 2, 3, 4, 5] as const).map((rating) => (
                <button
                  key={rating}
                  className={`rounded-2xl border px-3 py-3 text-left text-sm ${
                    selectedExercise.struggleRating === rating
                      ? "border-cyan-400 bg-cyan-400/12 text-white"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                  onClick={() => setExerciseStruggle(selectedExercise.id, rating)}
                  type="button"
                >
                  {rating} • {STRUGGLE_LABELS[rating]}
                </button>
              ))}
            </div>
          </div>

          <label className="block rounded-2xl border border-white/10 bg-white/5 p-3">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Lift notes</span>
            <Textarea
              className="mt-2 border-none bg-transparent px-0 py-0 shadow-none focus:border-none"
              onChange={(event) => setExerciseNotes(selectedExercise.id, event.target.value)}
              placeholder="Optional notes for this lift"
              value={selectedExercise.notes}
            />
          </label>

          {postRecommendation ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-100">Next-time recommendation</p>
              <p className="mt-2 text-white">{postRecommendation.recommendation}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <label className="block rounded-[28px] border border-white/10 bg-white/5 p-5">
        <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Session notes</span>
        <Textarea
          className="mt-2 border-none bg-transparent px-0 py-0 shadow-none focus:border-none"
          onChange={(event) => setWorkoutNotes(event.target.value)}
          placeholder="Optional full workout notes"
          value={activeWorkout.notes}
        />
      </label>
    </div>
  );
}
