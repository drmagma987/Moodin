"use client";

import { useMemo, useState } from "react";

import { useBRGym } from "@/components/brgym/provider";
import { EXERCISE_LIBRARY } from "@/lib/brgym/defaults";
import { createId } from "@/lib/brgym/logic";
import type { WorkoutCategory, WorkoutTemplate } from "@/lib/brgym/types";

const categoryOptions: WorkoutCategory[] = [
  "Push",
  "Pull",
  "Legs / Lower Back",
  "Shoulders / Posture",
  "Full Body",
  "Custom",
];

export default function BRGymTemplatesPage() {
  const { data, hydrated, deleteTemplate, duplicateTemplate, saveTemplate } = useBRGym();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WorkoutCategory>("Custom");
  const [selectedExerciseNames, setSelectedExerciseNames] = useState<string[]>(["Push-ups"]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const exerciseOptions = useMemo(() => Object.keys(EXERCISE_LIBRARY).sort(), []);

  function fillEditor(template: WorkoutTemplate) {
    setEditingTemplateId(template.id);
    setName(template.name);
    setCategory(template.category);
    setSelectedExerciseNames(template.exercises.map((exercise) => exercise.name));
  }

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading templates…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-semibold text-white">Saved templates</h2>
        <p className="mt-2 text-sm text-slate-300">Create, duplicate, or trim workout saves without touching the main site.</p>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">New custom template</h3>
        <label className="mt-4 block rounded-2xl border border-white/10 bg-white/5 p-3">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Template name</span>
          <input
            className="mt-2 w-full bg-transparent text-lg text-white outline-none"
            onChange={(event) => setName(event.target.value)}
            placeholder="Custom workout"
            value={name}
          />
        </label>

        <label className="mt-3 block rounded-2xl border border-white/10 bg-white/5 p-3">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Category</span>
          <select
            className="mt-2 w-full rounded-xl bg-slate-950/70 px-3 py-3 text-white outline-none"
            onChange={(event) => setCategory(event.target.value as WorkoutCategory)}
            value={category}
          >
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block rounded-2xl border border-white/10 bg-white/5 p-3">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Exercises</span>
          <select
            className="mt-2 min-h-40 w-full rounded-xl bg-slate-950/70 px-3 py-3 text-white outline-none"
            multiple
            onChange={(event) => {
              const values = Array.from(event.target.selectedOptions).map((option) => option.value);
              setSelectedExerciseNames(values);
            }}
            value={selectedExerciseNames}
          >
            {exerciseOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          className="mt-4 w-full rounded-[22px] bg-cyan-400 px-4 py-4 text-base font-semibold text-slate-950"
          onClick={() => {
            const template: WorkoutTemplate = {
              id: editingTemplateId ?? createId("template"),
              name: name || "Custom workout",
              category,
              exercises: selectedExerciseNames.map((exerciseName) => ({
                ...EXERCISE_LIBRARY[exerciseName],
                sensitivityFlags: { ...EXERCISE_LIBRARY[exerciseName].sensitivityFlags },
              })),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isDefault: false,
            };
            saveTemplate(template);
            setEditingTemplateId(null);
            setName("");
            setCategory("Custom");
            setSelectedExerciseNames(["Push-ups"]);
          }}
          type="button"
        >
          {editingTemplateId ? "Update template" : "Save template"}
        </button>
        {editingTemplateId ? (
          <button
            className="mt-3 w-full rounded-[22px] bg-white/10 px-4 py-4 text-base text-slate-100"
            onClick={() => {
              setEditingTemplateId(null);
              setName("");
              setCategory("Custom");
              setSelectedExerciseNames(["Push-ups"]);
            }}
            type="button"
          >
            Cancel edit
          </button>
        ) : null}
      </section>

      <section className="space-y-4">
        {data.templates.map((template) => (
          <article key={template.id} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                <p className="mt-1 text-sm text-slate-300">
                  {template.category} • {template.exercises.length} exercises
                </p>
              </div>
              {template.isDefault ? (
                <span className="rounded-full bg-white/8 px-2 py-1 text-[11px] text-slate-300">Default</span>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {template.exercises.map((exercise) => (
                <span key={`${template.id}-${exercise.id}`} className="rounded-full bg-white/8 px-3 py-2 text-xs text-slate-100">
                  {exercise.name}
                </span>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-100"
                onClick={() => fillEditor(template)}
                type="button"
              >
                Edit
              </button>
              <button
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-100"
                onClick={() => duplicateTemplate(template.id)}
                type="button"
              >
                Duplicate
              </button>
            </div>
            <button
              className="mt-3 w-full rounded-2xl bg-rose-500/80 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              disabled={template.isDefault}
              onClick={() => deleteTemplate(template.id)}
              type="button"
            >
              Delete
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
