import type { TrainingPlanEntry, TrainingProfileId, WorkoutTemplate } from "@/lib/brgym/types";

interface SubstitutePlanLiftInput {
  entries: TrainingPlanEntry[];
  entryId: string;
  template: WorkoutTemplate;
  activeTrainingProfile: TrainingProfileId;
  completedEntryIds?: Set<string>;
}

export function substitutePlanLift({
  entries,
  entryId,
  template,
  activeTrainingProfile,
  completedEntryIds = new Set(),
}: SubstitutePlanLiftInput): TrainingPlanEntry[] {
  const targetIndex = entries.findIndex((entry) => entry.id === entryId);
  const target = entries[targetIndex];
  if (!target || target.kind !== "lift" || target.templateId === template.id) return entries;

  const eligibleFutureIndexes = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) =>
      index !== targetIndex
      && entry.kind === "lift"
      && (entry.trainingProfile ?? "vaughn") === activeTrainingProfile
      && !completedEntryIds.has(entry.id)
      && (entry.date > target.date || (entry.date === target.date && index > targetIndex)),
    );
  const displacedIndex = eligibleFutureIndexes.find(({ entry }) => entry.templateId === template.id)?.index
    ?? eligibleFutureIndexes[0]?.index;

  return entries.map((entry, index) => {
    if (index === targetIndex) {
      const displaced = displacedIndex === undefined ? null : entries[displacedIndex];
      return {
        ...entry,
        templateId: template.id,
        title: template.name,
        details: displaced?.templateId === template.id
          ? displaced.details
          : `Complete ${template.name} using its saved workout template.`,
      };
    }
    if (index === displacedIndex) {
      return { ...entry, templateId: target.templateId ?? null, title: target.title, details: target.details };
    }
    return entry;
  });
}
