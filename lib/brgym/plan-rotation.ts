import { CATEGORY_SEQUENCE } from "@/lib/brgym/defaults";
import type {
  TrainingPlanEntry,
  TrainingProfileId,
  WorkoutSession,
  WorkoutTemplate,
} from "@/lib/brgym/types";

interface BuildRotatingPlanInput {
  entries: TrainingPlanEntry[];
  sessions: WorkoutSession[];
  templates: WorkoutTemplate[];
  activeTrainingProfile: TrainingProfileId;
  today: string;
}

export function buildRotatingPlanEntries({
  entries,
  sessions,
  templates,
  activeTrainingProfile,
  today,
}: BuildRotatingPlanInput): TrainingPlanEntry[] {
  const profileTemplates = templates.filter(
    (template) => (template.trainingProfile ?? (template.isDefault ? "vaughn" : "custom")) === activeTrainingProfile,
  );
  const templatesByCategory = new Map(profileTemplates.map((template) => [template.category, template]));
  const rotation = CATEGORY_SEQUENCE.filter((category) => templatesByCategory.has(category));
  if (rotation.length === 0) return entries;

  const latestSession = sessions
    .filter((session) => (session.trainingProfile ?? "vaughn") === activeTrainingProfile)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastIndex = latestSession ? rotation.indexOf(latestSession.category) : -1;
  let rotationIndex = lastIndex >= 0 ? (lastIndex + 1) % rotation.length : 0;
  const completedEntryIds = new Set(sessions.map((session) => session.planEntryId).filter(Boolean));

  return entries.map((entry) => {
    if (
      entry.kind !== "lift"
      || entry.date < today
      || completedEntryIds.has(entry.id)
      || (entry.trainingProfile ?? "vaughn") !== activeTrainingProfile
    ) {
      return entry;
    }
    const category = rotation[rotationIndex];
    const template = templatesByCategory.get(category);
    rotationIndex = (rotationIndex + 1) % rotation.length;
    if (!template) return entry;
    return {
      ...entry,
      title: template.name,
      templateId: template.id,
      details: `Next in your ${rotation.join(" → ")} rotation.`,
    };
  });
}
