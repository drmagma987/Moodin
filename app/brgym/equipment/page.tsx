"use client";

import { useBRGym } from "@/components/brgym/provider";
import { formatWeight } from "@/lib/brgym/logic";

export default function BRGymEquipmentPage() {
  const { data, hydrated, setActiveEquipmentProfile } = useBRGym();

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading equipment profiles…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold text-white">Equipment profiles</h2>
        <p className="mt-2 text-sm text-slate-300">Pick the active gym setup before you start a workout.</p>
      </section>

      {data.equipmentProfiles.map((profile) => {
        const active = data.settings.activeEquipmentProfileId === profile.id;

        return (
          <article key={profile.id} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{profile.name}</h3>
                <p className="mt-1 text-sm text-slate-300">{profile.description}</p>
              </div>
              <button
                className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                  active ? "bg-cyan-400 text-slate-950" : "bg-white/10 text-slate-100"
                }`}
                onClick={() => setActiveEquipmentProfile(profile.id)}
                type="button"
              >
                {active ? "Active" : "Set active"}
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Supported equipment</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.supportedEquipment.map((item) => (
                  <span key={item} className="rounded-full bg-white/8 px-3 py-2 text-xs text-slate-100">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {profile.dumbbellWeights ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Available dumbbell weights</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.dumbbellWeights.map((weight) => (
                    <span key={weight} className="rounded-full bg-white/8 px-3 py-2 text-xs text-slate-100">
                      {formatWeight(weight, profile.primaryUnit, profile)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
