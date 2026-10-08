import type { WorkoutSession } from "@/lib/brgym/types";

export interface ExerciseProgressPoint {
  sessionId: string;
  date: string;
  value: number;
  weightLb: number;
  reps: number;
}

export interface ExerciseProgressSeries {
  exerciseName: string;
  metric: "Estimated 1RM" | "Best set reps";
  unit: "lb" | "reps";
  points: ExerciseProgressPoint[];
}

export interface PersonalRecord {
  id: string;
  exerciseName: string;
  date: string;
  metric: ExerciseProgressSeries["metric"];
  value: number;
  unit: ExerciseProgressSeries["unit"];
  detail: string;
}

export interface BRGymProgress {
  totalSessions: number;
  totalSets: number;
  totalVolumeLb: number;
  series: ExerciseProgressSeries[];
  records: PersonalRecord[];
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function estimatedOneRepMax(weightLb: number, reps: number): number {
  return weightLb * (1 + reps / 30);
}

export function buildBRGymProgress(sessions: WorkoutSession[]): BRGymProgress {
  const chronological = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const seriesByExercise = new Map<string, ExerciseProgressSeries>();
  let totalSets = 0;
  let totalVolumeLb = 0;

  for (const session of chronological) {
    for (const log of session.exerciseLogs) {
      totalSets += log.sets.length;
      totalVolumeLb += log.sets.reduce(
        (sum, set) => sum + Math.max(set.normalizedWeightLb, 0) * Math.max(set.reps, 0),
        0,
      );
      const weightedSets = log.sets.filter((set) => set.normalizedWeightLb > 0 && set.reps > 0);
      const usesWeight = weightedSets.length > 0;
      const bestSet = usesWeight
        ? weightedSets.reduce((best, set) =>
            estimatedOneRepMax(set.normalizedWeightLb, set.reps) > estimatedOneRepMax(best.normalizedWeightLb, best.reps)
              ? set
              : best,
          )
        : log.sets.reduce((best, set) => set.reps > best.reps ? set : best, log.sets[0]);
      if (!bestSet) continue;

      const metric: ExerciseProgressSeries["metric"] = usesWeight ? "Estimated 1RM" : "Best set reps";
      const unit: ExerciseProgressSeries["unit"] = usesWeight ? "lb" : "reps";
      const value = usesWeight
        ? roundToOne(estimatedOneRepMax(bestSet.normalizedWeightLb, bestSet.reps))
        : bestSet.reps;
      const current = seriesByExercise.get(log.exerciseName);
      const point: ExerciseProgressPoint = {
        sessionId: session.id,
        date: session.date,
        value,
        weightLb: roundToOne(bestSet.normalizedWeightLb),
        reps: bestSet.reps,
      };
      if (current) {
        current.points.push(point);
      } else {
        seriesByExercise.set(log.exerciseName, {
          exerciseName: log.exerciseName,
          metric,
          unit,
          points: [point],
        });
      }
    }
  }

  const series = [...seriesByExercise.values()].sort((a, b) =>
    b.points.length - a.points.length || a.exerciseName.localeCompare(b.exerciseName),
  );
  const records: PersonalRecord[] = [];
  for (const exerciseSeries of series) {
    let best = exerciseSeries.points[0]?.value ?? 0;
    for (const point of exerciseSeries.points.slice(1)) {
      if (point.value <= best) continue;
      best = point.value;
      records.push({
        id: `${exerciseSeries.exerciseName}-${point.sessionId}-${point.date}`,
        exerciseName: exerciseSeries.exerciseName,
        date: point.date,
        metric: exerciseSeries.metric,
        value: point.value,
        unit: exerciseSeries.unit,
        detail: exerciseSeries.unit === "lb"
          ? `${point.weightLb} lb × ${point.reps}`
          : `${point.reps} reps`,
      });
    }
  }

  return {
    totalSessions: sessions.length,
    totalSets,
    totalVolumeLb: Math.round(totalVolumeLb),
    series,
    records: records.sort((a, b) => b.date.localeCompare(a.date)),
  };
}
