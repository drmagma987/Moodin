import Link from "next/link";
import { ChevronRight, ClipboardList, Dumbbell, Settings, SlidersHorizontal } from "lucide-react";

const links = [
  { href: "/brgym/history", label: "Workout history", detail: "Review completed sessions", icon: ClipboardList },
  { href: "/brgym/templates", label: "Workout templates", detail: "Edit lifts, sets, and reps", icon: Dumbbell },
  { href: "/brgym/equipment", label: "Gym equipment", detail: "Manage your available setups", icon: SlidersHorizontal },
  { href: "/brgym/settings", label: "Settings & backup", detail: "Timers, sound, import, and export", icon: Settings },
];

export default function BRGymMorePage() {
  return (
    <div className="space-y-4">
      <div className="px-1">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">More</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Manage BR Gym</h2>
      </div>
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
        {links.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} className="flex items-center gap-3 border-b border-white/10 p-4 last:border-b-0" href={href}>
            <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-200"><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-white">{label}</span>
              <span className="mt-1 block text-sm text-slate-400">{detail}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}
