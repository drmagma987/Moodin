"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  applyReplacementByName,
  buildNextWorkoutProgression,
  createId,
  getEquipmentProfile,
  getPostExerciseRecommendation,
  getSubstitutionOptions,
  normalizeWeight,
} from "@/lib/brgym/logic";
import { STORAGE_KEY, getDefaultData } from "@/lib/brgym/storage";
import type {
  ActiveWorkoutDraft,
  BRGymData,
  DifficultyRating,
  ExerciseTemplate,
  RunLog,
  SensitivityFlags,
  SetLog,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/brgym/types";

function mergeTrainingPlan(
  current: BRGymData["trainingPlan"],
  saved: BRGymData["trainingPlan"] | undefined,
): BRGymData["trainingPlan"] {
  if (!current) {
    return saved ?? null;
  }
  if (!saved || saved.id !== current.id) {
    return current;
  }
  const savedEntries = new Map(saved.entries.map((entry) => [entry.id, entry]));
  return {
    ...current,
    entries: current.entries.map((entry) => ({
      ...entry,
      runLog: savedEntries.get(entry.id)?.runLog ?? entry.runLog ?? null,
    })),
  };
}

interface StartWorkoutInput {
  templateId: string;
  equipmentProfileId: string;
  discomfortFlags: SensitivityFlags;
  categoryOverride?: WorkoutTemplate["category"];
  planEntryId?: string;
}

interface BRGymContextValue {
  data: BRGymData;
  hydrated: boolean;
  timer: {
    secondsLeft: number;
    isRunning: boolean;
    endsAt: number | null;
  };
  startWorkout: (input: StartWorkoutInput) => string;
  logSet: (exerciseId: string, set: SetLog) => void;
  setExerciseStruggle: (exerciseId: string, value: DifficultyRating) => void;
  setExerciseNotes: (exerciseId: string, notes: string) => void;
  setWorkoutNotes: (notes: string) => void;
  saveRunLog: (entryId: string, log: RunLog) => void;
  clearRunLog: (entryId: string) => void;
  reschedulePlanEntry: (entryId: string, date: string) => void;
  saveWorkout: () => WorkoutSession | null;
  updateWorkoutSession: (session: WorkoutSession) => boolean;
  discardWorkout: () => void;
  setActiveEquipmentProfile: (profileId: string) => void;
  saveTemplate: (template: WorkoutTemplate) => void;
  duplicateTemplate: (templateId: string) => void;
  deleteTemplate: (templateId: string) => void;
  replaceExercise: (exerciseId: string, replacementName: string) => void;
  updateSettings: (partial: Partial<BRGymData["settings"]>) => void;
  importAllData: (payload: string) => { ok: boolean; message: string };
  exportAllData: () => string;
  resetAllData: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  skipTimer: () => void;
  adjustTimer: (deltaSeconds: number) => void;
  tickTimer: () => void;
}

function cloneTemplateExercise(exercise: ExerciseTemplate): ExerciseTemplate {
  return { ...exercise, sensitivityFlags: { ...exercise.sensitivityFlags } };
}

type BRGymStore = BRGymData & {
  hydrated: boolean;
  timer: {
    secondsLeft: number;
    isRunning: boolean;
    endsAt: number | null;
  };
  markHydrated: () => void;
} & Omit<BRGymContextValue, "data" | "hydrated" | "timer">;

function toSerializableData(state: BRGymStore): BRGymData {
  return {
    templates: state.templates,
    sessions: state.sessions,
    equipmentProfiles: state.equipmentProfiles,
    settings: state.settings,
    activeWorkout: state.activeWorkout,
    trainingPlan: state.trainingPlan,
  };
}

const initialData = getDefaultData();

const useBRGymStore = create<BRGymStore>()(
  persist(
    (set, get) => ({
      ...initialData,
      hydrated: false,
      timer: {
        secondsLeft: initialData.settings.defaultRestSeconds,
        isRunning: false,
        endsAt: null,
      },
      markHydrated() {
        set({ hydrated: true });
      },
      startWorkout(input) {
        const template = get().templates.find((candidate) => candidate.id === input.templateId);
        if (!template) {
          throw new Error("Workout template not found");
        }
        const profile = getEquipmentProfile(input.equipmentProfileId);
        const nextWorkout: ActiveWorkoutDraft = {
          id: createId("workout"),
          templateId: template.id,
          workoutName: template.name,
          category: input.categoryOverride ?? template.category,
          startedAt: new Date().toISOString(),
          equipmentProfileId: profile.id,
          discomfortFlags: input.discomfortFlags,
          notes: "",
          planEntryId: input.planEntryId ?? null,
          trainingProfile: get().settings.activeTrainingProfile,
          exercises: template.exercises.map((exercise) => {
            const progression = buildNextWorkoutProgression(
              get().sessions.filter((session) => (session.trainingProfile ?? "vaughn") === get().settings.activeTrainingProfile),
              exercise,
              profile,
            );
            return {
              ...cloneTemplateExercise(exercise),
              completedSets: [],
              plannedSets: progression.sets,
              progressionSummary: progression.summary,
              notes: "",
              replacementOptions: getSubstitutionOptions(exercise, profile, input.discomfortFlags),
              selectedReplacementName: null,
            };
          }),
        };
        set((current) => ({
          activeWorkout: nextWorkout,
          settings: { ...current.settings, activeEquipmentProfileId: profile.id },
          timer: {
            ...current.timer,
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
            endsAt: null,
          },
        }));
        return nextWorkout.id;
      },
      logSet(exerciseId, setLog) {
        set((current) => {
          if (!current.activeWorkout) {
            return current;
          }
          return {
            ...current,
            activeWorkout: {
              ...current.activeWorkout,
              exercises: current.activeWorkout.exercises.map((exercise) =>
                exercise.id === exerciseId
                  ? {
                      ...exercise,
                      completedSets: [...exercise.completedSets.filter((set) => set.setNumber !== setLog.setNumber), setLog]
                        .sort((a, b) => a.setNumber - b.setNumber),
                    }
                  : exercise,
              ),
            },
            timer: {
              secondsLeft: current.settings.defaultRestSeconds,
              isRunning: true,
              endsAt: Date.now() + current.settings.defaultRestSeconds * 1000,
            },
          };
        });
      },
      setExerciseStruggle(exerciseId, value) {
        set((current) => {
          if (!current.activeWorkout) {
            return current;
          }
          return {
            ...current,
            activeWorkout: {
              ...current.activeWorkout,
              exercises: current.activeWorkout.exercises.map((exercise) =>
                exercise.id === exerciseId ? { ...exercise, struggleRating: value } : exercise,
              ),
            },
          };
        });
      },
      setExerciseNotes(exerciseId, notes) {
        set((current) => {
          if (!current.activeWorkout) {
            return current;
          }
          return {
            ...current,
            activeWorkout: {
              ...current.activeWorkout,
              exercises: current.activeWorkout.exercises.map((exercise) =>
                exercise.id === exerciseId ? { ...exercise, notes } : exercise,
              ),
            },
          };
        });
      },
      setWorkoutNotes(notes) {
        set((current) => ({
          activeWorkout: current.activeWorkout ? { ...current.activeWorkout, notes } : null,
        }));
      },
      saveRunLog(entryId, log) {
        set((current) => ({
          trainingPlan: current.trainingPlan
            ? {
                ...current.trainingPlan,
                entries: current.trainingPlan.entries.map((entry) =>
                  entry.id === entryId ? { ...entry, runLog: log } : entry,
                ),
              }
            : null,
        }));
      },
      clearRunLog(entryId) {
        set((current) => ({
          trainingPlan: current.trainingPlan
            ? {
                ...current.trainingPlan,
                entries: current.trainingPlan.entries.map((entry) =>
                  entry.id === entryId ? { ...entry, runLog: null } : entry,
                ),
              }
            : null,
        }));
      },
      reschedulePlanEntry(entryId, date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        set((current) => {
          if (!current.trainingPlan) return current;
          const entries = current.trainingPlan.entries
            .map((entry) => entry.id === entryId ? { ...entry, date } : entry)
            .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
          return {
            trainingPlan: {
              ...current.trainingPlan,
              entries,
              startDate: entries[0]?.date ?? current.trainingPlan.startDate,
              endDate: entries.at(-1)?.date ?? current.trainingPlan.endDate,
            },
          };
        });
      },
      saveWorkout() {
        const activeWorkout = get().activeWorkout;
        if (!activeWorkout) {
          return null;
        }
        const profile = getEquipmentProfile(activeWorkout.equipmentProfileId);
        const exerciseLogs = activeWorkout.exercises
          .filter((exercise) => exercise.completedSets.length > 0 && exercise.struggleRating)
          .map((exercise) => {
            const recommendation = getPostExerciseRecommendation(
              exercise,
              exercise.completedSets,
              exercise.struggleRating as DifficultyRating,
              profile,
              activeWorkout.discomfortFlags,
            ).recommendation;
            return {
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              movementPattern: exercise.movementPattern,
              equipmentProfileId: profile.id,
              equipmentProfileName: profile.name,
              exerciseType: exercise.exerciseType,
              date: new Date().toISOString(),
              sets: exercise.completedSets,
              struggleRating: exercise.struggleRating as DifficultyRating,
              notes: exercise.notes,
              recommendation,
              targetSets: exercise.targetSets,
              repMin: exercise.repMin,
              repMax: exercise.repMax,
              progressionIncrement: exercise.progressionIncrement,
            };
          });
        if (exerciseLogs.length === 0) {
          return null;
        }
        const session: WorkoutSession = {
          id: activeWorkout.id,
          templateId: activeWorkout.templateId,
          workoutName: activeWorkout.workoutName,
          category: activeWorkout.category,
          date: new Date().toISOString(),
          equipmentProfileId: profile.id,
          equipmentProfileName: profile.name,
          discomfortFlags: activeWorkout.discomfortFlags,
          exerciseLogs,
          recommendations: exerciseLogs.map((log) => `${log.exerciseName}: ${log.recommendation}`),
          notes: activeWorkout.notes,
          planEntryId: activeWorkout.planEntryId ?? null,
          trainingProfile: activeWorkout.trainingProfile ?? "vaughn",
        };
        set((current) => ({
          sessions: [session, ...current.sessions],
          activeWorkout: null,
          timer: {
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
            endsAt: null,
          },
        }));
        return session;
      },
      updateWorkoutSession(session) {
        const profile =
          get().equipmentProfiles.find((candidate) => candidate.id === session.equipmentProfileId) ??
          getEquipmentProfile(session.equipmentProfileId);
        const exerciseLogs = session.exerciseLogs
          .map((log) => {
            const knownExercise = applyReplacementByName(log.exerciseName);
            const exercise: ExerciseTemplate = knownExercise ?? {
              id: log.exerciseId,
              name: log.exerciseName.trim(),
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
            const sets = log.sets
              .filter((set) => Number.isFinite(set.reps) && set.reps > 0 && Number.isFinite(set.enteredWeight))
              .map((set, index) => {
                const normalized = normalizeWeight(Math.max(set.enteredWeight, 0), set.enteredUnit);
                return {
                  ...set,
                  setNumber: index + 1,
                  enteredWeight: Math.max(set.enteredWeight, 0),
                  normalizedWeightLb: normalized.lb,
                  normalizedWeightKg: normalized.kg,
                };
              });
            if (!exercise.name || sets.length === 0) return null;
            const recommendation = getPostExerciseRecommendation(
              exercise,
              sets,
              log.struggleRating,
              profile,
              session.discomfortFlags,
            ).recommendation;
            return {
              ...log,
              exerciseId: knownExercise?.id ?? log.exerciseId,
              exerciseName: exercise.name,
              movementPattern: exercise.movementPattern,
              exerciseType: exercise.exerciseType,
              equipmentProfileId: profile.id,
              equipmentProfileName: profile.name,
              date: session.date,
              sets,
              recommendation,
              targetSets: exercise.targetSets,
              repMin: exercise.repMin,
              repMax: exercise.repMax,
              progressionIncrement: exercise.progressionIncrement,
            };
          })
          .filter((log): log is NonNullable<typeof log> => Boolean(log));
        if (!session.workoutName.trim() || !Number.isFinite(new Date(session.date).getTime()) || exerciseLogs.length === 0) {
          return false;
        }
        const nextSession: WorkoutSession = {
          ...session,
          workoutName: session.workoutName.trim(),
          exerciseLogs,
          recommendations: exerciseLogs.map((log) => `${log.exerciseName}: ${log.recommendation}`),
        };
        set((current) => ({
          sessions: current.sessions
            .map((candidate) => candidate.id === nextSession.id ? nextSession : candidate)
            .sort((a, b) => b.date.localeCompare(a.date)),
        }));
        return true;
      },
      discardWorkout() {
        set((current) => ({
          activeWorkout: null,
          timer: {
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
            endsAt: null,
          },
        }));
      },
      setActiveEquipmentProfile(profileId) {
        set((current) => ({
          settings: { ...current.settings, activeEquipmentProfileId: profileId },
        }));
      },
      saveTemplate(template) {
        set((current) => {
          const exists = current.templates.some((candidate) => candidate.id === template.id);
          return {
            templates: exists
              ? current.templates.map((candidate) =>
                  candidate.id === template.id
                    ? { ...template, updatedAt: new Date().toISOString() }
                    : candidate,
                )
              : [
                  {
                    ...template,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                  ...current.templates,
                ],
          };
        });
      },
      duplicateTemplate(templateId) {
        set((current) => {
          const found = current.templates.find((template) => template.id === templateId);
          if (!found) {
            return current;
          }
          const duplicated: WorkoutTemplate = {
            ...found,
            id: createId("template"),
            name: `${found.name} Copy`,
            exercises: found.exercises.map(cloneTemplateExercise),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDefault: false,
            trainingProfile: "custom",
          };
          return { templates: [duplicated, ...current.templates] };
        });
      },
      deleteTemplate(templateId) {
        set((current) => ({
          templates: current.templates.filter(
            (template) => template.id !== templateId || template.isDefault,
          ),
        }));
      },
      replaceExercise(exerciseId, replacementName) {
        set((current) => {
          if (!current.activeWorkout) {
            return current;
          }
          const replacement = applyReplacementByName(replacementName);
          if (!replacement) {
            return current;
          }
          return {
            activeWorkout: {
              ...current.activeWorkout,
              exercises: current.activeWorkout.exercises.map((exercise) =>
                exercise.id === exerciseId
                  ? {
                      ...cloneTemplateExercise(replacement),
                      id: exercise.id,
                      completedSets: exercise.completedSets,
                      notes: exercise.notes,
                      struggleRating: exercise.struggleRating,
                      replacementOptions: exercise.replacementOptions,
                      selectedReplacementName: replacementName,
                    }
                  : exercise,
              ),
            },
          };
        });
      },
      updateSettings(partial) {
        set((current) => ({
          settings: { ...current.settings, ...partial },
          timer: current.timer.isRunning
            ? current.timer
            : {
                ...current.timer,
                secondsLeft: partial.defaultRestSeconds ?? current.settings.defaultRestSeconds,
              },
        }));
      },
      importAllData(payload) {
        try {
          const parsed = JSON.parse(payload) as BRGymData;
          if (!Array.isArray(parsed.templates) || !Array.isArray(parsed.sessions) || !parsed.settings) {
            return { ok: false, message: "That file does not look like a BR Gym export." };
          }
          set({
            ...initialData,
            ...parsed,
            sessions: parsed.sessions.map((session) => ({ ...session, trainingProfile: session.trainingProfile ?? "vaughn" })).sort((a, b) => (a.date < b.date ? 1 : -1)),
            templates: parsed.templates.map((template) => ({ ...template, trainingProfile: template.trainingProfile ?? (template.isDefault ? "vaughn" : "custom") })),
            settings: { ...initialData.settings, ...parsed.settings },
            timer: {
              secondsLeft: parsed.settings.defaultRestSeconds,
              isRunning: false,
              endsAt: null,
            },
          });
          return { ok: true, message: "Import complete." };
        } catch {
          return { ok: false, message: "Import failed. Check that the JSON is valid." };
        }
      },
      exportAllData() {
        return JSON.stringify(toSerializableData(get()), null, 2);
      },
      resetAllData() {
        set({
          ...initialData,
          hydrated: true,
          timer: {
            secondsLeft: initialData.settings.defaultRestSeconds,
            isRunning: false,
            endsAt: null,
          },
        });
      },
      pauseTimer() {
        set((current) => ({
          timer: {
            secondsLeft: current.timer.endsAt
              ? Math.max(Math.ceil((current.timer.endsAt - Date.now()) / 1000), 0)
              : current.timer.secondsLeft,
            isRunning: false,
            endsAt: null,
          },
        }));
      },
      resumeTimer() {
        set((current) => ({
          timer: {
            ...current.timer,
            isRunning: current.timer.secondsLeft > 0,
            endsAt:
              current.timer.secondsLeft > 0 ? Date.now() + current.timer.secondsLeft * 1000 : null,
          },
        }));
      },
      resetTimer() {
        set((current) => ({
          timer: {
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
            endsAt: null,
          },
        }));
      },
      skipTimer() {
        set({ timer: { secondsLeft: 0, isRunning: false, endsAt: null } });
      },
      adjustTimer(deltaSeconds) {
        set((current) => {
          const secondsLeft = Math.max(current.timer.secondsLeft + deltaSeconds, 0);
          return {
            timer: {
              secondsLeft,
              isRunning: current.timer.isRunning && secondsLeft > 0,
              endsAt:
                current.timer.isRunning && secondsLeft > 0
                  ? (current.timer.endsAt ?? Date.now() + current.timer.secondsLeft * 1000) +
                    deltaSeconds * 1000
                  : null,
            },
          };
        });
      },
      tickTimer() {
        const current = get();
        if (!current.timer.isRunning) {
          return;
        }
        const secondsLeft = current.timer.endsAt
          ? Math.max(Math.ceil((current.timer.endsAt - Date.now()) / 1000), 0)
          : Math.max(current.timer.secondsLeft - 1, 0);
        if (secondsLeft === 0) {
          set({ timer: { secondsLeft: 0, isRunning: false, endsAt: null } });
          return;
        }
        set({
          timer: {
            ...current.timer,
            secondsLeft,
            endsAt: current.timer.endsAt ?? Date.now() + secondsLeft * 1000,
          },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ...toSerializableData(state), timer: state.timer }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<BRGymStore>;
        const defaultTemplateIds = new Set(current.templates.map((template) => template.id));
        const savedTemplates = saved.templates ?? [];
        const customTemplates = (saved.templates ?? []).filter(
          (template) => !defaultTemplateIds.has(template.id),
        ).map((template) => ({ ...template, trainingProfile: template.trainingProfile ?? "custom" as const }));
        const defaultTemplates = current.templates.map((template) => {
          const savedVersion = savedTemplates.find((candidate) => candidate.id === template.id);
          return savedVersion && savedVersion.updatedAt > template.updatedAt ? savedVersion : template;
        });
        const savedTimer = saved.timer;
        const secondsLeft = savedTimer?.endsAt
          ? Math.max(Math.ceil((savedTimer.endsAt - Date.now()) / 1000), 0)
          : savedTimer?.secondsLeft ?? current.settings.defaultRestSeconds;
        return {
          ...current,
          ...saved,
          templates: [...defaultTemplates, ...customTemplates],
          sessions: (saved.sessions ?? current.sessions).map((session) => ({ ...session, trainingProfile: session.trainingProfile ?? "vaughn" })),
          settings: { ...current.settings, ...(saved.settings ?? {}) },
          trainingPlan: mergeTrainingPlan(current.trainingPlan, saved.trainingPlan),
          timer: {
            secondsLeft,
            isRunning: Boolean(savedTimer?.isRunning && secondsLeft > 0),
            endsAt: savedTimer?.isRunning && secondsLeft > 0 ? savedTimer.endsAt ?? null : null,
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
      skipHydration: true,
    },
  ),
);

export function BRGymProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void Promise.resolve(useBRGymStore.persist.rehydrate()).finally(() => {
      useBRGymStore.getState().markHydrated();
    });
  }, []);

  return children;
}

export function useBRGym() {
  const state = useBRGymStore();
  return {
    data: toSerializableData(state),
    hydrated: state.hydrated,
    timer: state.timer,
    startWorkout: state.startWorkout,
    logSet: state.logSet,
    setExerciseStruggle: state.setExerciseStruggle,
    setExerciseNotes: state.setExerciseNotes,
    setWorkoutNotes: state.setWorkoutNotes,
    saveRunLog: state.saveRunLog,
    clearRunLog: state.clearRunLog,
    reschedulePlanEntry: state.reschedulePlanEntry,
    saveWorkout: state.saveWorkout,
    updateWorkoutSession: state.updateWorkoutSession,
    discardWorkout: state.discardWorkout,
    setActiveEquipmentProfile: state.setActiveEquipmentProfile,
    saveTemplate: state.saveTemplate,
    duplicateTemplate: state.duplicateTemplate,
    deleteTemplate: state.deleteTemplate,
    replaceExercise: state.replaceExercise,
    updateSettings: state.updateSettings,
    importAllData: state.importAllData,
    exportAllData: state.exportAllData,
    resetAllData: state.resetAllData,
    pauseTimer: state.pauseTimer,
    resumeTimer: state.resumeTimer,
    resetTimer: state.resetTimer,
    skipTimer: state.skipTimer,
    adjustTimer: state.adjustTimer,
    tickTimer: state.tickTimer,
  };
}
