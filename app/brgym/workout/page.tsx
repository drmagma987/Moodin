"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Play, Settings2 } from "lucide-react";

import { useBRGym } from "@/components/brgym/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { getNextWorkoutCategory } from "@/lib/brgym/logic";
import type { SensitivityFlags, WorkoutCategory } from "@/lib/brgym/types";

const categories: WorkoutCategory[] = [
  "Push",
  "Pull",
  "Legs / Lower Back",
  "Shoulders / Posture",
  "Full Body",
  "Custom",
];

export default function BRGymWorkoutStartPage() {
  const router = useRouter();
  const { data, hydrated, startWorkout, setActiveEquipmentProfile } = useBRGym();
  const nextCategory = useMemo(() => getNextWorkoutCategory(data.sessions), [data.sessions]);

  const [selectedCategoryOverride, setSelectedCategoryOverride] = useState<WorkoutCategory | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedProfileIdOverride, setSelectedProfileIdOverride] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [discomfortFlags, setDiscomfortFlags] = useState<SensitivityFlags>({
    knee: false,
    lowerBack: false,
    shoulder: false,
  });

  const selectedCategory = selectedCategoryOverride ?? nextCategory;
  const selectedProfileId = selectedProfileIdOverride ?? data.settings.activeEquipmentProfileId;
  const templates = data.templates.filter((template) => template.category === selectedCategory);
  const selectedTemplateIdSafe = selectedTemplateId || templates[0]?.id || data.templates[0]?.id || "";
  const quickStartTemplate =
    data.templates.find((template) => template.category === nextCategory) ?? data.templates[0];
  const lastCompletedSession = data.sessions[0] ?? null;
  const selectedProfile =
    data.equipmentProfiles.find((profile) => profile.id === selectedProfileId) ?? data.equipmentProfiles[0];

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading workout setup…</div>;
  }

  function handleStartWorkout(options?: {
    templateId?: string;
    category?: WorkoutCategory;
    equipmentProfileId?: string;
    discomfort?: SensitivityFlags;
  }) {
    const profileId = options?.equipmentProfileId ?? selectedProfileId;
    const templateId = options?.templateId ?? selectedTemplateIdSafe;
    const category = options?.category ?? selectedCategory;
    const discomfort = options?.discomfort ?? discomfortFlags;

    setActiveEquipmentProfile(profileId);
    const workoutId = startWorkout({
      templateId,
      equipmentProfileId: profileId,
      discomfortFlags: discomfort,
      categoryOverride: category,
    });
    router.push(`/brgym/workout/${workoutId}`);
  }

  return (
    <div className="space-y-4">
      <Card className="border-cyan-400/20 bg-cyan-400/8">
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Quick start</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{quickStartTemplate.name}</h2>
              <p className="mt-2 text-sm text-slate-300">
                Pick up where you likely left off with your current gym setup.
              </p>
            </div>
            <Badge variant="cyan">{nextCategory}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Workout template</p>
              <p className="mt-1 font-medium text-white">{quickStartTemplate.name}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Gym setup</p>
              <p className="mt-1 font-medium text-white">{selectedProfile.name}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Last completed workout</p>
            <p className="mt-1 font-medium text-white">
              {lastCompletedSession
                ? `${lastCompletedSession.workoutName} on ${new Date(lastCompletedSession.date).toLocaleDateString()}`
                : "No workout history yet"}
            </p>
          </div>

          <Button
            className="w-full"
            onClick={() =>
              handleStartWorkout({
                templateId: quickStartTemplate.id,
                category: quickStartTemplate.category,
                equipmentProfileId: data.settings.activeEquipmentProfileId,
                discomfort: { knee: false, lowerBack: false, shoulder: false },
              })
            }
            size="lg"
          >
            <Play className="mr-2 h-5 w-5" />
            Quick start this workout
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Customize today</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Adjust for injuries, gym, or workout choice</h3>
            </div>
            <Button
              onClick={() => setShowCustomize((current) => !current)}
              size="sm"
              variant="secondary"
            >
              <Settings2 className="mr-2 h-4 w-4" />
              {showCustomize ? "Hide" : "Open"}
            </Button>
          </div>

          <p className="text-sm text-slate-300">
            Use this if today is not a straight continuation from your last session.
          </p>

          {showCustomize ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="text-base font-semibold text-white">1. Choose day type</h4>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      className={`rounded-2xl px-3 py-3 text-sm ${
                        selectedCategory === category
                          ? "bg-cyan-400 font-semibold text-slate-950"
                          : "bg-white/8 text-slate-200"
                      }`}
                      onClick={() => {
                        setSelectedCategoryOverride(category);
                        const firstMatch = data.templates.find((template) => template.category === category);
                        setSelectedTemplateId(firstMatch?.id ?? "");
                      }}
                      type="button"
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-base font-semibold text-white">2. Pick workout</h4>
                  <Badge>{templates.length} options</Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left ${
                        selectedTemplateIdSafe === template.id
                          ? "border-cyan-400 bg-cyan-400/12"
                          : "border-white/10 bg-white/5"
                      }`}
                      onClick={() => setSelectedTemplateId(template.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{template.name}</p>
                          <p className="mt-1 text-sm text-slate-300">{template.exercises.length} exercises</p>
                        </div>
                        {template.isDefault ? <Badge>Default</Badge> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="text-base font-semibold text-white">3. Active gym setup</h4>
                <div className="mt-3 space-y-3">
                  {data.equipmentProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left ${
                        selectedProfileId === profile.id
                          ? "border-cyan-400 bg-cyan-400/12"
                          : "border-white/10 bg-white/5"
                      }`}
                      onClick={() => setSelectedProfileIdOverride(profile.id)}
                      type="button"
                    >
                      <p className="font-semibold text-white">{profile.name}</p>
                      <p className="mt-1 text-sm text-slate-300">{profile.description}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-white">4. Today’s discomfort toggles</h4>
                    <p className="mt-1 text-sm text-slate-300">Practical guidance only. This is not medical advice.</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </div>
                <div className="mt-4 space-y-3">
                  {([
                    ["knee", "Knee discomfort today"],
                    ["lowerBack", "Lower-back discomfort today"],
                    ["shoulder", "Shoulder discomfort today"],
                  ] as const).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                    >
                      <span className="text-sm text-slate-100">{label}</span>
                      <Switch
                        checked={discomfortFlags[key]}
                        onChange={(event) =>
                          setDiscomfortFlags((current) => ({ ...current, [key]: event.target.checked }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>

              {selectedTemplateIdSafe ? (
                <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Setup support preview</p>
                  <div className="mt-3 space-y-2">
                    {(data.templates.find((template) => template.id === selectedTemplateIdSafe)?.exercises ?? []).map(
                      (exercise) => {
                        const supported =
                          exercise.equipment.includes("bodyweight") ||
                          exercise.equipment.some((item) => selectedProfile.supportedEquipment.includes(item));
                        return (
                          <div
                            key={exercise.id}
                            className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-3 text-sm"
                          >
                            <span className="text-slate-100">{exercise.name}</span>
                            <span className={supported ? "text-emerald-300" : "text-amber-300"}>
                              {supported ? "Supported" : "Swap likely"}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </section>
              ) : null}

              <Button className="w-full" onClick={() => handleStartWorkout()} size="lg">
                Start customized workout
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
