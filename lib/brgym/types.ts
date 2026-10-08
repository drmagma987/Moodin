export type WorkoutCategory =
  | "Push"
  | "Pull"
  | "Legs / Lower Back"
  | "Shoulders / Posture"
  | "Full Body"
  | "Custom";

export type TrainingProfileId = "vaughn" | "lauren" | "custom";

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
  | "kettlebell"
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
  | "kettlebell"
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
  trainingProfile?: TrainingProfileId;
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
  targetSets?: number;
  repMin?: number;
  repMax?: number;
  progressionIncrement?: number;
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
  planEntryId?: string | null;
  trainingProfile?: TrainingProfileId;
}

export interface UserSettings {
  defaultRestSeconds: number;
  timerSoundMuted: boolean;
  activeEquipmentProfileId: string;
  preferredTheme: "system" | "dark";
  activeTrainingProfile: TrainingProfileId;
  accountabilityRemindersEnabled: boolean;
  morningReminderTime: string;
  eveningReminderTime: string;
}

export interface ActiveExerciseDraft extends ExerciseTemplate {
  completedSets: SetLog[];
  plannedSets?: SetLog[];
  progressionSummary?: string;
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
  planEntryId?: string | null;
  trainingProfile?: TrainingProfileId;
}

export interface RunLog {
  completedAt: string;
  distanceMiles: number;
  totalMinutes: number;
  intervalPaces: string;
  averageHeartRate?: number | null;
  difficulty: number;
  notes: string;
}

export interface RunIntervalStep {
  id: string;
  label: string;
  seconds: number;
  effort: "easy" | "fast" | "steady" | "recovery";
  cue?: string;
}

export interface TrainingPlanEntry {
  id: string;
  date: string;
  kind: "lift" | "run" | "race";
  title: string;
  details: string;
  templateId?: string | null;
  optional?: boolean;
  runLog?: RunLog | null;
  timedSections?: RunIntervalStep[];
}

export interface TrainingPlan {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  entries: TrainingPlanEntry[];
}

export interface RecommendationResult {
  recommendation: string;
  suggestedWeight?: number | null;
  suggestedUnit?: WeightUnit | null;
  explanation?: string;
}

export interface WorkoutProgressionPlan {
  sets: SetLog[];
  summary: string;
  kind: "first-session" | "carry-forward" | "rep-progress" | "load-progress" | "hold" | "deload";
}

export interface BRGymData {
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  equipmentProfiles: EquipmentProfile[];
  settings: UserSettings;
  activeWorkout: ActiveWorkoutDraft | null;
  trainingPlan: TrainingPlan | null;
}
