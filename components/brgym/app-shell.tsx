"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/brgym", label: "Home" },
  { href: "/brgym/workout", label: "Workout" },
  { href: "/brgym/history", label: "History" },
  { href: "/brgym/templates", label: "Templates" },
  { href: "/brgym/equipment", label: "Equipment" },
  { href: "/brgym/settings", label: "Settings" },
];

export function BRGymAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#0b1120_45%,#050816_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-28 pt-5">
        <header className="mb-5 rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-[0_10px_24px_rgba(0,0,0,0.25)]">
                <Image
                  alt="BR Gym logo"
                  className="h-14 w-14 object-cover"
                  height={56}
                  priority
                  src="/brgym/logo.jpg"
                  width={56}
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">BR Gym</p>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Local-first workout tracker</h1>
              </div>
            </div>
            <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
              PWA V1
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-2">
          {navItems.map((item) => {
            const active =
              item.href === "/brgym"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl px-2 py-3 text-center text-[11px] font-medium transition ${
                  active ? "bg-cyan-400 text-slate-950" : "bg-white/5 text-slate-300"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
