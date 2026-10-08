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
  WorkoutProgressionPlan,
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
  if (log.exerciseName.toLowerCase().includes("pull-up")) {
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
        : undefined;

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

function createTargetSet(
  setNumber: number,
  weight: number,
  unit: WeightUnit,
  reps: number,
  bandResistance?: string | null,
): SetLog {
  const normalized = normalizeWeight(weight, unit);
  return {
    setNumber,
    reps,
    enteredWeight: weight,
    enteredUnit: unit,
    normalizedWeightLb: normalized.lb,
    normalizedWeightKg: normalized.kg,
    bandResistance: bandResistance ?? null,
  };
}

function getPreviousSet(log: ExerciseLog, setNumber: number): SetLog | null {
  return (
    log.sets.find((set) => set.setNumber === setNumber) ??
    log.sets[Math.min(setNumber - 1, log.sets.length - 1)] ??
    null
  );
}

function getProgressionWeight(
  previousSet: SetLog,
  exercise: ExerciseTemplate,
  profile: EquipmentProfile,
  direction: "up" | "down",
): { value: number; unit: WeightUnit } {
  const increment = Math.max(exercise.progressionIncrement, 0);
  const previousLb = previousSet.normalizedWeightLb;
  const targetLb = Math.max(
    previousLb + (direction === "up" ? increment : -increment),
    0,
  );
  const options = exercise.exerciseType === "cable"
    ? profile.cableWeights
    : exercise.exerciseType === "dumbbell" || exercise.exerciseType === "mixed"
      ? profile.dumbbellWeights
      : undefined;
  if (options?.length) {
    const previousInProfileUnit = profile.primaryUnit === "kg" ? previousSet.normalizedWeightKg : previousSet.normalizedWeightLb;
    const targetInProfileUnit = profile.primaryUnit === "kg" ? lbToKg(targetLb) : targetLb;
    const directional = direction === "up"
      ? [...options].sort((a, b) => a - b).find((option) => option >= targetInProfileUnit && option > previousInProfileUnit)
      : [...options].sort((a, b) => b - a).find((option) => option <= targetInProfileUnit && option < previousInProfileUnit);
    if (directional !== undefined) {
      return { value: directional, unit: profile.primaryUnit };
    }
  }
  const rounded = roundToAvailableWeight(targetLb, exercise, profile, 3);
  return {
    value: rounded?.value ?? (profile.primaryUnit === "kg" ? lbToKg(targetLb) : targetLb),
    unit: rounded?.unit ?? profile.primaryUnit,
  };
}

export function buildNextWorkoutProgression(
  sessions: WorkoutSession[],
  exercise: ExerciseTemplate,
  profile: EquipmentProfile,
): WorkoutProgressionPlan {
  const logs = sessions
    .flatMap((session) => session.exerciseLogs)
    .filter((log) => log.exerciseName === exercise.name)
    .slice(0, 3);
  const previous = logs[0];
  const isWeighted = exercise.progressionIncrement > 0 && exercise.exerciseType !== "bodyweight";

  if (!previous || previous.sets.length === 0) {
    return {
      kind: "first-session",
      summary: `First session: start at ${exercise.repMin} reps and choose a clean working weight.`,
      sets: Array.from({ length: exercise.targetSets }, (_, index) =>
        createTargetSet(
          index + 1,
          0,
          profile.primaryUnit,
          exercise.repMin,
          exercise.defaultBandAssistance ?? null,
        ),
      ),
    };
  }

  const plannedPreviousSets = Array.from({ length: exercise.targetSets }, (_, index) =>
    getPreviousSet(previous, index + 1),
  ).filter((set): set is SetLog => Boolean(set));
  const allAtCeiling =
    previous.sets.length >= exercise.targetSets &&
    plannedPreviousSets.length === exercise.targetSets &&
    plannedPreviousSets.every((set) => set.reps >= exercise.repMax);
  const weakestReps = Math.min(...plannedPreviousSets.map((set) => set.reps));
  const repeatedHardSessions = logs.slice(0, 2).length === 2 && logs.slice(0, 2).every((log) => log.struggleRating >= 4);

  if (repeatedHardSessions && isWeighted) {
    return {
      kind: "deload",
      summary: `Two hard sessions in a row: step down one increment and rebuild from ${exercise.repMin} reps.`,
      sets: plannedPreviousSets.map((set, index) => {
        const target = getProgressionWeight(set, exercise, profile, "down");
        return createTargetSet(index + 1, target.value, target.unit, exercise.repMin, set.bandResistance);
      }),
    };
  }

  if (previous.struggleRating >= 4) {
    return {
      kind: "hold",
      summary: "Last session was very hard. Repeat those numbers before progressing.",
      sets: plannedPreviousSets.map((set, index) => ({ ...set, setNumber: index + 1 })),
    };
  }

  if (allAtCeiling && isWeighted) {
    return {
      kind: "load-progress",
      summary: `Rep ceiling cleared: increase the load and reset to ${exercise.repMin} reps.`,
      sets: plannedPreviousSets.map((set, index) => {
        const target = getProgressionWeight(set, exercise, profile, "up");
        return createTargetSet(index + 1, target.value, target.unit, exercise.repMin, set.bandResistance);
      }),
    };
  }

  if (allAtCeiling) {
    return {
      kind: "hold",
      summary: exercise.name.toLowerCase().includes("pull-up")
        ? "Rep ceiling cleared. Keep the reps and reduce assistance when you are ready."
        : "Rep ceiling cleared. Hold this target until you choose a harder variation.",
      sets: plannedPreviousSets.map((set, index) => ({ ...set, setNumber: index + 1 })),
    };
  }

  const targets = plannedPreviousSets.map((set, index) =>
    createTargetSet(
      index + 1,
      set.enteredWeight,
      set.enteredUnit,
      set.reps === weakestReps ? Math.min(Math.max(set.reps, exercise.repMin) + 1, exercise.repMax) : Math.min(set.reps, exercise.repMax),
      set.bandResistance,
    ),
  );
  const progressed = targets.some((set, index) => set.reps > plannedPreviousSets[index].reps);

  return {
    kind: progressed ? "rep-progress" : "carry-forward",
    summary: progressed
      ? "Keep the same load and add one rep to the lowest sets."
      : "Carry forward the last completed numbers.",
    sets: targets,
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

  if (lastLog.exerciseName.toLowerCase().includes("pull-up")) {
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
