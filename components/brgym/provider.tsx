"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  applyReplacementByName,
  createId,
  getEquipmentProfile,
  getPostExerciseRecommendation,
  getSubstitutionOptions,
} from "@/lib/brgym/logic";
import { STORAGE_KEY, getDefaultData } from "@/lib/brgym/storage";
import type {
  ActiveWorkoutDraft,
  BRGymData,
  DifficultyRating,
  ExerciseTemplate,
  SensitivityFlags,
  SetLog,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/brgym/types";

interface StartWorkoutInput {
  templateId: string;
  equipmentProfileId: string;
  discomfortFlags: SensitivityFlags;
  categoryOverride?: WorkoutTemplate["category"];
}

interface BRGymContextValue {
  data: BRGymData;
  hydrated: boolean;
  timer: {
    secondsLeft: number;
    isRunning: boolean;
  };
  startWorkout: (input: StartWorkoutInput) => string;
  logSet: (exerciseId: string, set: SetLog) => void;
  setExerciseStruggle: (exerciseId: string, value: DifficultyRating) => void;
  setExerciseNotes: (exerciseId: string, notes: string) => void;
  setWorkoutNotes: (notes: string) => void;
  saveWorkout: () => WorkoutSession | null;
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
          exercises: template.exercises.map((exercise) => ({
            ...cloneTemplateExercise(exercise),
            completedSets: [],
            notes: "",
            replacementOptions: getSubstitutionOptions(exercise, profile, input.discomfortFlags),
            selectedReplacementName: null,
          })),
        };
        set((current) => ({
          activeWorkout: nextWorkout,
          settings: { ...current.settings, activeEquipmentProfileId: profile.id },
          timer: {
            ...current.timer,
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
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
            };
          });
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
        };
        set((current) => ({
          sessions: [session, ...current.sessions],
          activeWorkout: null,
          timer: {
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
          },
        }));
        return session;
      },
      discardWorkout() {
        set((current) => ({
          activeWorkout: null,
          timer: {
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
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
            sessions: [...parsed.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)),
            timer: {
              secondsLeft: parsed.settings.defaultRestSeconds,
              isRunning: false,
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
          },
        });
      },
      pauseTimer() {
        set((current) => ({ timer: { ...current.timer, isRunning: false } }));
      },
      resumeTimer() {
        set((current) => ({ timer: { ...current.timer, isRunning: true } }));
      },
      resetTimer() {
        set((current) => ({
          timer: {
            secondsLeft: current.settings.defaultRestSeconds,
            isRunning: false,
          },
        }));
      },
      skipTimer() {
        set((current) => ({ timer: { ...current.timer, secondsLeft: 0, isRunning: false } }));
      },
      adjustTimer(deltaSeconds) {
        set((current) => ({
          timer: {
            ...current.timer,
            secondsLeft: Math.max(current.timer.secondsLeft + deltaSeconds, 0),
          },
        }));
      },
      tickTimer() {
        const current = get();
        if (!current.timer.isRunning) {
          return;
        }
        if (current.timer.secondsLeft <= 1) {
          set({ timer: { secondsLeft: 0, isRunning: false } });
          return;
        }
        set({
          timer: {
            ...current.timer,
            secondsLeft: current.timer.secondsLeft - 1,
          },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => toSerializableData(state),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

export function BRGymProvider({ children }: { children: React.ReactNode }) {
  return children;
}

export function useBRGym() {
  const hydrated = useSyncExternalStore(
    useBRGymStore.subscribe,
    () => useBRGymStore.getState().hydrated,
    () => false,
  );
  const state = useBRGymStore();
  return {
    data: toSerializableData(state),
    hydrated,
    timer: state.timer,
    startWorkout: state.startWorkout,
    logSet: state.logSet,
    setExerciseStruggle: state.setExerciseStruggle,
    setExerciseNotes: state.setExerciseNotes,
    setWorkoutNotes: state.setWorkoutNotes,
    saveWorkout: state.saveWorkout,
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
