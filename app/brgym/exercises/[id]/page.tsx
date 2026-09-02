"use client";

import { useParams } from "next/navigation";

import { useBRGym } from "@/components/brgym/provider";
import { describePerformance } from "@/lib/brgym/logic";

export default function BRGymExerciseHistoryPage() {
  const params = useParams<{ id: string }>();
  const { data, hydrated } = useBRGym();

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading exercise history…</div>;
  }

  const logs = data.sessions.flatMap((session) => session.exerciseLogs).filter((log) => log.exerciseId === params.id);
  const title = logs[0]?.exerciseName ?? "Exercise";

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">Last {logs.length} logged entries for this exercise.</p>
      </section>

      {logs.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          No exercise-specific history yet.
        </div>
      ) : (
        logs.map((log, index) => (
          <article key={`${log.date}-${index}`} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {new Date(log.date).toLocaleString()}
            </p>
            <p className="mt-3 text-sm text-slate-200">{describePerformance(log)}</p>
            <p className="mt-3 text-sm text-cyan-100">{log.recommendation}</p>
            {log.notes ? <p className="mt-3 text-sm text-slate-300">Notes: {log.notes}</p> : null}
          </article>
        ))
      )}
    </div>
  );
}
