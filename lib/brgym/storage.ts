import {
  createEmptyWorkout,
  DEFAULT_EQUIPMENT_PROFILES,
  DEFAULT_SETTINGS,
  DEFAULT_TEMPLATES,
} from "@/lib/brgym/defaults";
import type { BRGymData } from "@/lib/brgym/types";

export const STORAGE_KEY = "brgym-data-v1";

export function getDefaultData(): BRGymData {
  return {
    templates: DEFAULT_TEMPLATES.map((template) => ({
      ...template,
      exercises: template.exercises.map((exercise) => ({ ...exercise })),
    })),
    sessions: [],
    equipmentProfiles: DEFAULT_EQUIPMENT_PROFILES,
    settings: { ...DEFAULT_SETTINGS },
    activeWorkout: createEmptyWorkout(),
  };
}

export function loadData(): BRGymData {
  if (typeof window === "undefined") {
    return getDefaultData();
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return getDefaultData();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BRGymData>;
    const defaults = getDefaultData();
    return {
      templates: parsed.templates ?? defaults.templates,
      sessions: parsed.sessions ?? defaults.sessions,
      equipmentProfiles: parsed.equipmentProfiles ?? defaults.equipmentProfiles,
      settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
      activeWorkout: parsed.activeWorkout ?? defaults.activeWorkout,
    };
  } catch {
    return getDefaultData();
  }
}

export function saveData(data: BRGymData): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
