"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Dumbbell, Ellipsis, House, Sparkles } from "lucide-react";

import { AccountabilityReminders } from "@/components/brgym/accountability-reminders";
import { BRGymPwaRegistration } from "@/components/brgym/pwa-registration";
import { TrainingProfileSwitcher } from "@/components/brgym/training-profile-switcher";

const navItems = [
  { href: "/brgym", label: "Today", icon: House },
  { href: "/brgym/plan", label: "Plan", icon: CalendarDays },
  { href: "/brgym/workout", label: "Train", icon: Dumbbell },
  { href: "/brgym/progress", label: "Progress", icon: BarChart3 },
  { href: "/brgym/more", label: "More", icon: Ellipsis },
];

function getSectionLabel(pathname: string): string {
  if (pathname.startsWith("/brgym/workout/")) return "Workout in progress";
  if (pathname.startsWith("/brgym/run/")) return "Run in progress";
  if (pathname.startsWith("/brgym/progress")) return "Training progress";
  if (pathname.startsWith("/brgym/plan")) return "Training plan";
  if (pathname.startsWith("/brgym/workout")) return "Start training";
  if (pathname.startsWith("/brgym/more")) return "Settings & tools";
  if (pathname.startsWith("/brgym/history")) return "Workout history";
  if (pathname.startsWith("/brgym/templates")) return "Workout templates";
  if (pathname.startsWith("/brgym/equipment")) return "Gym equipment";
  if (pathname.startsWith("/brgym/settings")) return "App settings";
  return "Personal training log";
}

export function BRGymAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inSession = pathname.startsWith("/brgym/workout/") || pathname.startsWith("/brgym/run/");

  return (
    <div className="brgym-theme min-h-screen text-neutral-100">
      <AccountabilityReminders />
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className={`brgym-topbar ${inSession ? "mb-3" : "mb-5"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="brgym-logo overflow-hidden rounded-2xl bg-black">
                <Image
                  alt="BR Gym logo"
                  className={inSession ? "h-10 w-10 object-cover grayscale" : "h-12 w-12 object-cover grayscale"}
                  height={inSession ? 40 : 48}
                  priority
                  src="/brgym/logo.jpg"
                  width={inSession ? 40 : 48}
                />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-white">BR Gym</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-neutral-500">{getSectionLabel(pathname)}</p>
              </div>
            </div>
            <div className="brgym-status-orb" aria-hidden="true"><Sparkles className="h-4 w-4" /></div>
          </div>
        </header>
        {!inSession ? <TrainingProfileSwitcher /> : null}
        <div className={inSession ? "hidden" : ""}><BRGymPwaRegistration /></div>
        <main className="flex-1">{children}</main>
      </div>

      <nav className="brgym-dock fixed inset-x-3 bottom-3 z-20 mx-auto max-w-[31rem] px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/brgym"
              ? pathname === item.href
              : item.href === "/brgym/workout"
                ? pathname.startsWith("/brgym/workout") || pathname.startsWith("/brgym/run")
                : item.href === "/brgym/more"
                  ? ["/brgym/more", "/brgym/history", "/brgym/templates", "/brgym/equipment", "/brgym/settings"].some((route) => pathname.startsWith(route))
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[10px] font-semibold transition ${
                  active ? "brgym-nav-active text-white" : "text-neutral-500 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
