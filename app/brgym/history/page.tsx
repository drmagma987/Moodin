"use client";

import Link from "next/link";

import { useBRGym } from "@/components/brgym/provider";
import { buildExerciseLogSummary } from "@/lib/brgym/logic";

export default function BRGymHistoryPage() {
  const { data, hydrated } = useBRGym();

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading history…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold text-white">Workout history</h2>
        <p className="mt-2 text-sm text-slate-300">Every saved session stays on-device in localStorage.</p>
      </section>

      {data.sessions.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          No saved workouts yet.
        </div>
      ) : (
        data.sessions.map((session) => (
          <article key={session.id} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-white">{session.workoutName}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {session.category} • {session.equipmentProfileName}
                </p>
              </div>
              <p className="text-xs text-slate-400">{new Date(session.date).toLocaleDateString()}</p>
            </div>
            <div className="mt-4 space-y-3">
              {session.exerciseLogs.map((log) => (
                <div key={log.exerciseId} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{log.exerciseName}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {buildExerciseLogSummary(
                          {
                            id: log.exerciseId,
                            name: log.exerciseName,
                            movementPattern: log.movementPattern,
                            exerciseType: log.exerciseType,
                            targetSets: log.sets.length,
                            repMin: 8,
                            repMax: 12,
                            equipment: ["bodyweight"],
                            progressionIncrement: 0,
                            notes: "",
                            sensitivityFlags: { knee: false, lowerBack: false, shoulder: false },
                          },
                          log.sets,
                        )}
                      </p>
                    </div>
                    <Link className="text-sm text-cyan-300" href={`/brgym/exercises/${log.exerciseId}`}>
                      Exercise
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-cyan-100">{log.recommendation}</p>
                </div>
              ))}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
