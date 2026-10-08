"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Award, BarChart3, Dumbbell } from "lucide-react";

import { useBRGym } from "@/components/brgym/provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { buildBRGymProgress, type ExerciseProgressPoint } from "@/lib/brgym/progress";

function formatMetric(value: number, unit: "lb" | "reps"): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

function ProgressChart({ points }: { points: ExerciseProgressPoint[] }) {
  const width = 320;
  const height = 150;
  const padX = 18;
  const padY = 18;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2),
    y: height - padY - ((point.value - min) / spread) * (height - padY * 2),
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  return (
    <svg aria-label="Exercise progress chart" className="h-44 w-full overflow-visible" role="img" viewBox={`0 0 ${width} ${height}`}>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} stroke="rgba(255,255,255,0.08)" strokeWidth="1" x1={padX} x2={width - padX} y1={height * ratio} y2={height * ratio} />
      ))}
      {points.length > 1 ? <path d={path} fill="none" stroke="#f5f5f5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null}
      {coordinates.map((point, index) => (
        <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} fill={index === coordinates.length - 1 ? "#f5f5f5" : "#050505"} r={index === coordinates.length - 1 ? 5 : 3.5} stroke="#f5f5f5" strokeWidth="2" />
      ))}
    </svg>
  );
}

export default function BRGymProgressPage() {
  const { data, hydrated } = useBRGym();
  const visibleSessions = useMemo(() => data.sessions.filter((session) => (session.trainingProfile ?? "vaughn") === data.settings.activeTrainingProfile), [data.sessions, data.settings.activeTrainingProfile]);
  const progress = useMemo(() => buildBRGymProgress(visibleSessions), [visibleSessions]);
  const [selectedExerciseOverride, setSelectedExerciseOverride] = useState<string | null>(null);
  const selectedExercise = progress.series.some((series) => series.exerciseName === selectedExerciseOverride)
    ? selectedExerciseOverride
    : progress.series[0]?.exerciseName ?? null;
  const selectedSeries = progress.series.find((series) => series.exerciseName === selectedExercise) ?? null;
  const firstPoint = selectedSeries?.points[0];
  const latestPoint = selectedSeries?.points.at(-1);
  const change = firstPoint && latestPoint ? latestPoint.value - firstPoint.value : 0;
  const ChangeIcon = change >= 0 ? ArrowUpRight : ArrowDownRight;

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading progress…</div>;
  }

  if (visibleSessions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="px-1">
          <p className="brgym-kicker">Progress</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Build your baseline.</h2>
          <p className="mt-2 text-sm text-slate-400">Your first saved workout starts the trend line and PR history.</p>
        </div>
        <Link className="block rounded-2xl bg-white px-4 py-4 text-center text-sm font-semibold text-black" href="/brgym/workout">Start a workout</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-1 pb-2">
        <p className="brgym-kicker">Progress</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">The work, in numbers.</h2>
        <p className="mt-2 text-sm text-slate-400">Strength estimates and records are calculated from your saved working sets.</p>
      </div>

      <section className="grid grid-cols-3 gap-2">
        {[
          ["Sessions", progress.totalSessions],
          ["Sets", progress.totalSets],
          ["PRs", progress.records.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="brgym-kicker">Exercise trend</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{selectedSeries?.exerciseName}</h3>
            </div>
            {selectedSeries ? <Badge>{selectedSeries.points.length} logs</Badge> : null}
          </div>
          <Select aria-label="Choose exercise" onChange={(event) => setSelectedExerciseOverride(event.target.value)} value={selectedExercise ?? ""}>
            {progress.series.map((series) => <option key={series.exerciseName} value={series.exerciseName}>{series.exerciseName}</option>)}
          </Select>
          {selectedSeries && latestPoint ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Current {selectedSeries.metric.toLowerCase()}</p>
                  <p className="mt-1 text-3xl font-semibold text-white">{formatMetric(latestPoint.value, selectedSeries.unit)}</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-sm font-medium text-white"><ChangeIcon className="h-4 w-4" /> {change >= 0 ? "+" : ""}{formatMetric(change, selectedSeries.unit)}</p>
                  <p className="mt-1 text-xs text-slate-500">from first log</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/50 px-2 py-3"><ProgressChart points={selectedSeries.points} /></div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{new Date(selectedSeries.points[0].date).toLocaleDateString()}</span>
                <span>{new Date(latestPoint.date).toLocaleDateString()}</span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="brgym-kicker">Personal records</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Recent breakthroughs</h3>
            </div>
            <Award className="h-5 w-5 text-white" />
          </div>
          {progress.records.length ? (
            <div className="mt-4 divide-y divide-white/10">
              {progress.records.slice(0, 8).map((record) => (
                <div key={record.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className="rounded-xl border border-white/15 p-2"><BarChart3 className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{record.exerciseName}</p>
                    <p className="mt-1 text-xs text-slate-500">{record.detail} • {new Date(record.date).toLocaleDateString()}</p>
                  </div>
                  <p className="text-sm font-semibold text-white">{formatMetric(record.value, record.unit)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
              <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-white" />
              Your first result sets the baseline. Beat it to create the first PR.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
