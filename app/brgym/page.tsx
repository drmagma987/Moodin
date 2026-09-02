"use client";

import Link from "next/link";

import { useBRGym } from "@/components/brgym/provider";
import { getNextWorkoutCategory } from "@/lib/brgym/logic";

export default function BRGymHomePage() {
  const { data, hydrated } = useBRGym();

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading BR Gym…</div>;
  }

  const nextCategory = getNextWorkoutCategory(data.sessions);
  const activeWorkout = data.activeWorkout;
  const recentSession = data.sessions[0];
  const activeProfile = data.equipmentProfiles.find(
    (profile) => profile.id === data.settings.activeEquipmentProfileId,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/6 p-5">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Next likely day</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold text-white">{nextCategory}</h2>
            <p className="mt-2 text-sm text-slate-300">
              Active setup: <span className="font-medium text-white">{activeProfile?.name}</span>
            </p>
          </div>
          <Link
            className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950"
            href={activeWorkout ? `/brgym/workout/${activeWorkout.id}` : "/brgym/workout"}
          >
            {activeWorkout ? "Resume" : "Start"}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Saved workouts</p>
          <p className="mt-2 text-3xl font-semibold text-white">{data.templates.length}</p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Completed sessions</p>
          <p className="mt-2 text-3xl font-semibold text-white">{data.sessions.length}</p>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Quick access</h3>
          <Link className="text-sm text-cyan-300" href="/brgym/settings">
            Settings
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link className="rounded-2xl bg-white/8 px-4 py-4 text-sm text-slate-100" href="/brgym/workout">
            Start workout
          </Link>
          <Link className="rounded-2xl bg-white/8 px-4 py-4 text-sm text-slate-100" href="/brgym/history">
            View history
          </Link>
          <Link className="rounded-2xl bg-white/8 px-4 py-4 text-sm text-slate-100" href="/brgym/templates">
            Edit templates
          </Link>
          <Link className="rounded-2xl bg-white/8 px-4 py-4 text-sm text-slate-100" href="/brgym/equipment">
            Gym setups
          </Link>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">Latest session</h3>
        {recentSession ? (
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>
              <span className="font-medium text-white">{recentSession.workoutName}</span> at{" "}
              {recentSession.equipmentProfileName}
            </p>
            <p>{new Date(recentSession.date).toLocaleString()}</p>
            <p>{recentSession.exerciseLogs.length} logged exercises</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-300">
            No history yet. Start with the default Push template and build from there.
          </p>
        )}
      </section>
    </div>
  );
}
