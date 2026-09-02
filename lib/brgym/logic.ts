import {
  CATEGORY_SEQUENCE,
  DEFAULT_EQUIPMENT_PROFILES,
  EXERCISE_LIBRARY,
  EXERCISE_SUBSTITUTIONS,
  STRUGGLE_LABELS,
} from "@/lib/brgym/defaults";
import type {
  DifficultyRating,
  EquipmentProfile,
  ExerciseLog,
  ExerciseTemplate,
  RecommendationResult,
  SensitivityFlags,
  SetLog,
  WeightUnit,
  WorkoutCategory,
  WorkoutSession,
} from "@/lib/brgym/types";

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function lbToKg(value: number): number {
  return roundToOneDecimal(value / 2.20462);
}

export function kgToLb(value: number): number {
  return roundToOneDecimal(value * 2.20462);
}

export function normalizeWeight(value: number, unit: WeightUnit): { lb: number; kg: number } {
  if (unit === "lb") {
    return { lb: value, kg: lbToKg(value) };
  }
  return { lb: kgToLb(value), kg: value };
}

export function formatWeight(value: number, unit: WeightUnit, equipmentProfile?: EquipmentProfile): string {
  if (unit === "kg" || equipmentProfile?.primaryUnit === "kg") {
    const kg = unit === "kg" ? value : lbToKg(value);
    return `${roundToOneDecimal(kg)} kg / ${roundToOneDecimal(kgToLb(kg))} lb`;
  }
  return `${roundToOneDecimal(value)} lb`;
}

export function getEquipmentProfile(profileId: string): EquipmentProfile {
  return (
    DEFAULT_EQUIPMENT_PROFILES.find((profile) => profile.id === profileId) ??
    DEFAULT_EQUIPMENT_PROFILES[0]
  );
}

export function isExerciseSupported(exercise: ExerciseTemplate, profile: EquipmentProfile): boolean {
  if (exercise.equipment.includes("bodyweight")) {
    return true;
  }
  return exercise.equipment.some((required) => profile.supportedEquipment.includes(required));
}

export function getSubstitutionOptions(
  exercise: ExerciseTemplate,
  profile: EquipmentProfile,
  discomfortFlags?: SensitivityFlags,
): string[] {
  const namedOptions = EXERCISE_SUBSTITUTIONS[exercise.name] ?? [];
  return namedOptions.filter((optionName) => {
    const option = EXERCISE_LIBRARY[optionName];
    if (!option) {
      return false;
    }
    if (!isExerciseSupported(option, profile)) {
      return false;
    }
    if (discomfortFlags?.shoulder && option.sensitivityFlags.shoulder && option.movementPattern === "overhead press") {
      return false;
    }
    if (discomfortFlags?.lowerBack && option.sensitivityFlags.lowerBack && option.movementPattern === "hinge") {
      return false;
    }
    return true;
  });
}

export function applyReplacementByName(name: string): ExerciseTemplate | null {
  const replacement = EXERCISE_LIBRARY[name];
  return replacement ? { ...replacement } : null;
}

export function getNextWorkoutCategory(sessions: WorkoutSession[]): WorkoutCategory {
  const lastCategory = sessions[0]?.category;
  if (!lastCategory) {
    return "Push";
  }
  const index = CATEGORY_SEQUENCE.indexOf(lastCategory);
  if (index === -1) {
    return "Push";
  }
  return CATEGORY_SEQUENCE[(index + 1) % CATEGORY_SEQUENCE.length];
}

function isSimilarExercise(a: ExerciseTemplate, log: ExerciseLog): boolean {
  return (
    a.name === log.exerciseName ||
    (a.movementPattern === log.movementPattern &&
      (a.exerciseType === log.exerciseType ||
        (a.exerciseType === "dumbbell" && log.exerciseType === "dumbbell") ||
        (a.exerciseType === "bodyweight" && log.exerciseType === "bodyweight")))
  );
}

export function getRelevantExerciseLogs(
  sessions: WorkoutSession[],
  exercise: ExerciseTemplate,
): ExerciseLog[] {
  const logs = sessions.flatMap((session) => session.exerciseLogs);
  const exact = logs.filter((log) => log.exerciseName === exercise.name);
  if (exact.length > 0) {
    return exact.slice(0, 3);
  }
  return logs.filter((log) => isSimilarExercise(exercise, log)).slice(0, 3);
}

export function describePerformance(log: ExerciseLog | undefined): string {
  if (!log) {
    return "No prior log yet.";
  }
  if (log.exerciseName === "Pull-up / assisted pull-up") {
    const setSummary = log.sets.map((set) => `${set.reps}`).join("/");
    const assistance = log.sets[0]?.bandResistance ? ` with ${log.sets[0].bandResistance} assistance` : "";
    return `${new Date(log.date).toLocaleDateString()}: ${setSummary} reps${assistance}, ${STRUGGLE_LABELS[log.struggleRating]}.`;
  }
  const setSummary = log.sets.map((set) => set.reps).join("/");
  const topSet = log.sets[0];
  const weightText = topSet ? formatWeight(topSet.enteredWeight, topSet.enteredUnit) : "bodyweight";
  return `${new Date(log.date).toLocaleDateString()}: ${weightText} for ${setSummary}, ${STRUGGLE_LABELS[log.struggleRating]}.`;
}

function getAverageWeight(log: ExerciseLog): number | null {
  const weights = log.sets
    .map((set) => set.normalizedWeightLb)
    .filter((weight) => Number.isFinite(weight) && weight > 0);
  if (weights.length === 0) {
    return null;
  }
  return weights.reduce((sum, value) => sum + value, 0) / weights.length;
}

function roundToAvailableWeight(
  targetWeightLb: number,
  exercise: ExerciseTemplate,
  profile: EquipmentProfile,
  struggleRating: DifficultyRating,
): { value: number; unit: WeightUnit; explanation: string } | null {
  const unit = profile.primaryUnit;
  const targetInProfileUnit = unit === "kg" ? lbToKg(targetWeightLb) : targetWeightLb;
  const options =
    exercise.exerciseType === "cable"
      ? profile.cableWeights
      : exercise.exerciseType === "dumbbell" || exercise.exerciseType === "mixed"
        ? profile.dumbbellWeights
        : profile.dumbbellWeights;

  if (!options || options.length === 0) {
    return {
      value: roundToOneDecimal(targetInProfileUnit),
      unit,
      explanation: "Using the closest manual entry for this setup.",
    };
  }

  let chosen = options[0];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const distance = Math.abs(option - targetInProfileUnit);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      chosen = option;
    }
  }

  if (struggleRating >= 4) {
    const conservativeOption = [...options].reverse().find((option) => option <= chosen);
    if (conservativeOption !== undefined) {
      chosen = conservativeOption;
    }
  }

  return {
    value: chosen,
    unit,
    explanation:
      unit === "kg"
        ? `Closest available ${profile.name} weight to ${roundToOneDecimal(targetWeightLb)} lb.`
        : `Closest available ${profile.name} weight in pounds.`,
  };
}

function buildWeightedRecommendation(
  lastLog: ExerciseLog,
  exercise: ExerciseTemplate,
  profile: EquipmentProfile,
  discomfortFlags?: SensitivityFlags,
): RecommendationResult {
  const reps = lastLog.sets.map((set) => set.reps);
  const struggle = lastLog.struggleRating;
  const minRep = Math.min(...reps);
  const maxRep = Math.max(...reps);
  const allAtTop = reps.every((rep) => rep >= exercise.repMax);
  const allInRange = reps.every((rep) => rep >= exercise.repMin && rep <= exercise.repMax);
  const allExactlyEight = reps.every((rep) => rep === exercise.repMin);
  const baseWeight = getAverageWeight(lastLog);

  if (baseWeight === null) {
    return {
      recommendation: "No weight history yet. Start with a clean working weight and log your first session.",
    };
  }

  let targetWeightLb = baseWeight;
  let recommendation = `Stay near ${formatWeight(baseWeight, "lb", profile)} next time.`;
  const explanation = "Based on your most recent log.";

  if (lastLog.exerciseName === "Pull-up / assisted pull-up") {
    if (struggle <= 3 && maxRep > minRep) {
      return {
        recommendation: "Reps moved well. Next time either add reps or use a little less assistance.",
        explanation: "Assisted pull-ups use simple rep and assistance guidance for now.",
      };
    }
    if (struggle >= 4) {
      return {
        recommendation: "Keep the same assistance next time and try to clean up reps before progressing.",
        explanation: "This stays conservative when pull-ups get grindy.",
      };
    }
  }

  if (allAtTop && struggle <= 3) {
    targetWeightLb = baseWeight + exercise.progressionIncrement;
    recommendation = "You earned an increase. Try the next available weight next time.";
  } else if (allAtTop && struggle === 4) {
    targetWeightLb = baseWeight + exercise.progressionIncrement / 2;
    recommendation = `A small increase is possible, but repeating ${formatWeight(baseWeight, "lb")} is also reasonable.`;
  } else if (allInRange && struggle <= 2) {
    targetWeightLb = baseWeight + exercise.progressionIncrement / 2;
    recommendation = `You can aim for more reps next time or take a small jump from ${formatWeight(baseWeight, "lb")}.`;
  } else if (allInRange && struggle <= 4) {
    recommendation = `Stay at ${formatWeight(baseWeight, "lb")} next time and aim for more reps before increasing.`;
  } else if (allExactlyEight && struggle === 4) {
    recommendation = `Keep ${formatWeight(baseWeight, "lb")} next time and push for 9-10 reps before increasing.`;
  } else if (minRep < exercise.repMin || struggle === 5) {
    recommendation = `Repeat ${formatWeight(baseWeight, "lb")} carefully or reduce the load a bit next time.`;
    targetWeightLb = Math.max(baseWeight - exercise.progressionIncrement / 2, 0);
  }

  if (discomfortFlags?.knee && (exercise.movementPattern === "squat" || exercise.movementPattern === "lunge")) {
    recommendation = `${recommendation} Knee discomfort toggle is on, so keep any load jump conservative today.`;
  }
  if (discomfortFlags?.lowerBack && exercise.movementPattern === "hinge") {
    recommendation = `${recommendation} Lower-back discomfort toggle is on, so avoid aggressive hinge progression.`;
  }
  if (discomfortFlags?.shoulder && (exercise.movementPattern === "overhead press" || exercise.movementPattern === "tricep extension")) {
    recommendation = `${recommendation} Shoulder discomfort toggle is on, so keep pressing progression conservative.`;
  }

  const rounded = roundToAvailableWeight(targetWeightLb, exercise, profile, struggle);

  return {
    recommendation,
    suggestedWeight: rounded?.value ?? null,
    suggestedUnit: rounded?.unit ?? profile.primaryUnit,
    explanation: rounded ? `${explanation} ${rounded.explanation}` : explanation,
  };
}

export function getRecommendationForExercise(
  sessions: WorkoutSession[],
  exercise: ExerciseTemplate,
  profile: EquipmentProfile,
  discomfortFlags?: SensitivityFlags,
): RecommendationResult {
  const logs = getRelevantExerciseLogs(sessions, exercise);
  const lastLog = logs[0];
  if (!lastLog) {
    return {
      recommendation: "Start with a clean, repeatable working weight and log today’s sets.",
      explanation: "No exact or similar history found yet.",
    };
  }
  return buildWeightedRecommendation(lastLog, exercise, profile, discomfortFlags);
}

export function getPostExerciseRecommendation(
  exercise: ExerciseTemplate,
  sets: SetLog[],
  struggleRating: DifficultyRating,
  profile: EquipmentProfile,
  discomfortFlags?: SensitivityFlags,
): RecommendationResult {
  const simulatedLog: ExerciseLog = {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    movementPattern: exercise.movementPattern,
    equipmentProfileId: profile.id,
    equipmentProfileName: profile.name,
    exerciseType: exercise.exerciseType,
    date: new Date().toISOString(),
    sets,
    struggleRating,
    notes: "",
    recommendation: "",
  };
  return buildWeightedRecommendation(simulatedLog, exercise, profile, discomfortFlags);
}

export function buildExerciseLogSummary(exercise: ExerciseTemplate, sets: SetLog[]): string {
  if (exercise.name === "Pull-up / assisted pull-up") {
    const reps = sets.map((set) => set.reps).join("/");
    const assistance = sets[0]?.bandResistance ? ` with ${sets[0].bandResistance} assistance` : "";
    return `${reps} reps${assistance}`;
  }
  const weight = sets[0] ? formatWeight(sets[0].enteredWeight, sets[0].enteredUnit) : "bodyweight";
  const reps = sets.map((set) => set.reps).join("/");
  return `${weight} for ${reps}`;
}
