export type WorkoutCategory =
  | "Push"
  | "Pull"
  | "Legs / Lower Back"
  | "Shoulders / Posture"
  | "Full Body"
  | "Custom";

export type EquipmentKind =
  | "dumbbells"
  | "adjustable dumbbells"
  | "barbell"
  | "cable"
  | "functional trainer"
  | "squat rack"
  | "adjustable bench"
  | "flat bench"
  | "pull-up bar"
  | "hex bar"
  | "battle ropes"
  | "bodyweight"
  | "bands";

export type ExerciseType =
  | "dumbbell"
  | "barbell"
  | "cable"
  | "bodyweight"
  | "banded"
  | "machine"
  | "hexbar"
  | "mixed";

export type WeightUnit = "lb" | "kg";

export type DifficultyRating = 1 | 2 | 3 | 4 | 5;

export interface SensitivityFlags {
  knee: boolean;
  lowerBack: boolean;
  shoulder: boolean;
}

export interface ExerciseTemplate {
  id: string;
  name: string;
  targetSets: number;
  repMin: number;
  repMax: number;
  equipment: EquipmentKind[];
  movementPattern: string;
  progressionIncrement: number;
  notes: string;
  sensitivityFlags: SensitivityFlags;
  exerciseType: ExerciseType;
  defaultBandAssistance?: string | null;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  category: WorkoutCategory;
  exercises: ExerciseTemplate[];
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
}

export interface EquipmentProfile {
  id: string;
  name: string;
  description: string;
  supportedEquipment: EquipmentKind[];
  primaryUnit: WeightUnit;
  dumbbellWeights?: number[];
  cableWeights?: number[];
}

export interface SetLog {
  setNumber: number;
  reps: number;
  enteredWeight: number;
  enteredUnit: WeightUnit;
  normalizedWeightLb: number;
  normalizedWeightKg: number;
  bandResistance?: string | null;
}

export interface ExerciseLog {
  exerciseId: string;
  exerciseName: string;
  movementPattern: string;
  equipmentProfileId: string;
  equipmentProfileName: string;
  exerciseType: ExerciseType;
  date: string;
  sets: SetLog[];
  struggleRating: DifficultyRating;
  notes: string;
  recommendation: string;
}

export interface WorkoutSession {
  id: string;
  templateId?: string | null;
  workoutName: string;
  category: WorkoutCategory;
  date: string;
  equipmentProfileId: string;
  equipmentProfileName: string;
  discomfortFlags: SensitivityFlags;
  exerciseLogs: ExerciseLog[];
  recommendations: string[];
  notes: string;
}

export interface UserSettings {
  defaultRestSeconds: number;
  timerSoundMuted: boolean;
  activeEquipmentProfileId: string;
  preferredTheme: "system" | "dark";
}

export interface ActiveExerciseDraft extends ExerciseTemplate {
  completedSets: SetLog[];
  struggleRating?: DifficultyRating;
  notes: string;
  replacementOptions?: string[];
  selectedReplacementName?: string | null;
}

export interface ActiveWorkoutDraft {
  id: string;
  templateId?: string | null;
  workoutName: string;
  category: WorkoutCategory;
  startedAt: string;
  equipmentProfileId: string;
  discomfortFlags: SensitivityFlags;
  exercises: ActiveExerciseDraft[];
  notes: string;
}

export interface RecommendationResult {
  recommendation: string;
  suggestedWeight?: number | null;
  suggestedUnit?: WeightUnit | null;
  explanation?: string;
}

export interface BRGymData {
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  equipmentProfiles: EquipmentProfile[];
  settings: UserSettings;
  activeWorkout: ActiveWorkoutDraft | null;
}
