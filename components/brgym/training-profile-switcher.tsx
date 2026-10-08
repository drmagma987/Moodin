"use client";

import { useBRGym } from "@/components/brgym/provider";
import type { TrainingProfileId } from "@/lib/brgym/types";

const profiles: Array<{ id: TrainingProfileId; label: string }> = [
  { id: "lauren", label: "Lauren" },
  { id: "vaughn", label: "Vaughn" },
  { id: "custom", label: "Custom" },
];

export function TrainingProfileSwitcher() {
  const { data, hydrated, updateSettings } = useBRGym();
  if (!hydrated) return <div className="mb-5 h-11 animate-pulse rounded-2xl bg-white/5" />;

  return (
    <div aria-label="Training profile" className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.06] bg-black/15 p-1 shadow-[inset_3px_3px_9px_rgba(0,0,0,.25)]" role="group">
      {profiles.map((profile) => {
        const active = data.settings.activeTrainingProfile === profile.id;
        return (
          <button
            aria-pressed={active}
            className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition ${active ? "brgym-nav-active text-white" : "text-neutral-500 hover:text-white"}`}
            key={profile.id}
            onClick={() => updateSettings({ activeTrainingProfile: profile.id })}
            type="button"
          >
            {profile.label}
          </button>
        );
      })}
    </div>
  );
}
