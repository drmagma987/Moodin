"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchMakeItRainLeaderboard,
  submitMakeItRainLeaderboardScore,
  type MakeItRainLeaderboardEntry,
} from "@/lib/makeItRainLeaderboard";

type ScreenState = "splash" | "playing" | "end";
type LeaderboardStatus = "idle" | "submitting" | "posted" | "error";

interface ArenaSize {
  width: number;
  height: number;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface BillState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
}

interface TargetState {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: number;
  speed: number;
  bobPhase: number;
  fakeOutTimer: number;
}

const MAX_MISSES = 3;
const MAX_MULTIPLIER = 5;
const BASE_POINTS = 100;
const BILL_WIDTH = 34;
const BILL_HEIGHT = 20;
const PERSONAL_BEST_KEY = "make_it_rain_best";
const DEFAULT_PLAYER_NAME = "BIG TIPPA";
const STREAK_MESSAGES = [
  "CLEAN HIT",
  "TARGET TAGGED",
  "RIGHT IN THE POCKET",
  "CASH CONNECTS",
  "SPORTSCENTER TOP PLAY",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function sanitizeLocalName(name: string) {
  const trimmed = name.toUpperCase().replace(/\s+/g, " ").trim();
  const cleaned = trimmed.replace(/[^A-Z0-9 !'.-]/g, "");
  return cleaned.slice(0, 11);
}

function buildTargetState(size: ArenaSize): TargetState {
  const width = clamp(size.width * 0.22, 92, 118);
  const height = width * 1.45;

  return {
    x: (size.width - width) / 2,
    y: clamp(size.height * 0.16, 96, 162),
    width,
    height,
    direction: Math.random() > 0.5 ? 1 : -1,
    speed: 165,
    bobPhase: Math.random() * Math.PI * 2,
    fakeOutTimer: randomBetween(0.9, 1.7),
  };
}

function getArenaPoint(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

interface MakeItRainGameProps {
  bodyFontClassName: string;
  displayFontClassName: string;
}

export function MakeItRainGame({ bodyFontClassName, displayFontClassName }: MakeItRainGameProps) {
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const calloutTimeoutRef = useRef<number | null>(null);
  const lastShotAtRef = useRef(0);
  const billIdRef = useRef(0);
  const targetRef = useRef<TargetState>(buildTargetState({ width: 390, height: 844 }));
  const billsRef = useRef<BillState[]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const hitsRef = useRef(0);
  const missesRef = useRef(0);

  const [screen, setScreen] = useState<ScreenState>("splash");
  const [arenaSize, setArenaSize] = useState<ArenaSize>({ width: 390, height: 844 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [bills, setBills] = useState<BillState[]>([]);
  const [target, setTarget] = useState<TargetState>(() => buildTargetState({ width: 390, height: 844 }));
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [bestMultiplier, setBestMultiplier] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [personalBest, setPersonalBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number.parseInt(window.localStorage.getItem(PERSONAL_BEST_KEY) || "0", 10) || 0;
  });
  const [isNewBest, setIsNewBest] = useState(false);
  const [playerName, setPlayerName] = useState(DEFAULT_PLAYER_NAME);
  const [leaderboardEntries, setLeaderboardEntries] = useState<MakeItRainLeaderboardEntry[]>([]);
  const [leaderboardStatus, setLeaderboardStatus] = useState<LeaderboardStatus>("idle");
  const [leaderboardError, setLeaderboardError] = useState("");
  const [callout, setCallout] = useState("WAIT FOR THE WHISTLE");

  const clearCalloutTimer = useCallback(() => {
    if (calloutTimeoutRef.current) {
      window.clearTimeout(calloutTimeoutRef.current);
      calloutTimeoutRef.current = null;
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const entries = await fetchMakeItRainLeaderboard();
      setLeaderboardEntries(entries);
    } catch (error) {
      console.error("[MakeItRain] Leaderboard load failed.", error);
    }
  }, []);

  const finishRun = useCallback((nextScore: number) => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameRef.current = null;
    setBills([]);
    billsRef.current = [];
    setFinalScore(nextScore);
    clearCalloutTimer();
    setCallout("FINAL BUZZER");

    let nextBest = nextScore;
    let newBest = false;

    if (typeof window !== "undefined") {
      const previousBest = Number.parseInt(window.localStorage.getItem(PERSONAL_BEST_KEY) || "0", 10) || 0;
      if (nextScore > previousBest) {
        window.localStorage.setItem(PERSONAL_BEST_KEY, String(nextScore));
        nextBest = nextScore;
        newBest = true;
      } else {
        nextBest = previousBest;
      }
    }

    setPersonalBest(nextBest);
    setIsNewBest(newBest);
    setLeaderboardStatus("idle");
    setLeaderboardError("");
    setScreen("end");
    void loadLeaderboard();
  }, [clearCalloutTimer, loadLeaderboard]);

  const triggerCallout = useCallback((message: string) => {
    clearCalloutTimer();
    setCallout(message);
    calloutTimeoutRef.current = window.setTimeout(() => {
      setCallout("FLICK FROM THE MONEY LINE");
      calloutTimeoutRef.current = null;
    }, 900);
  }, [clearCalloutTimer]);

  const registerMiss = useCallback(() => {
    comboRef.current = 0;
    setCombo(0);
    const nextMisses = missesRef.current + 1;
    missesRef.current = nextMisses;
    setMisses(nextMisses);
    triggerCallout(nextMisses >= MAX_MISSES ? "THAT ONE COST YOU" : "OFF THE MARK");

    if (nextMisses >= MAX_MISSES) {
      finishRun(scoreRef.current);
    }
  }, [finishRun, triggerCallout]);

  const registerHit = useCallback(() => {
    hitsRef.current += 1;
    setHits(hitsRef.current);

    const nextCombo = Math.min(comboRef.current + 1, MAX_MULTIPLIER);
    comboRef.current = nextCombo;
    setCombo(nextCombo);

    const awardedPoints = BASE_POINTS * nextCombo;
    scoreRef.current += awardedPoints;
    setScore(scoreRef.current);
    setBestMultiplier(current => Math.max(current, nextCombo));

    if (navigator.vibrate) {
      navigator.vibrate(35);
    }

    const message = STREAK_MESSAGES[Math.floor(Math.random() * STREAK_MESSAGES.length)];
    triggerCallout(`+${awardedPoints}  ${nextCombo}X  ${message}`);
  }, [triggerCallout]);

  const startGame = useCallback(() => {
    const nextTarget = buildTargetState(arenaSize);
    targetRef.current = nextTarget;
    billsRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    hitsRef.current = 0;
    missesRef.current = 0;
    lastShotAtRef.current = 0;
    lastFrameRef.current = null;
    setTarget(nextTarget);
    setBills([]);
    setScore(0);
    setCombo(0);
    setHits(0);
    setMisses(0);
    setBestMultiplier(0);
    setFinalScore(0);
    setIsNewBest(false);
    setLeaderboardStatus("idle");
    setLeaderboardError("");
    setDrag(null);
    clearCalloutTimer();
    setCallout("MONEY LINE IS LIVE");
    setScreen("playing");
  }, [arenaSize, clearCalloutTimer]);

  const handleLeaderboardPost = useCallback(async () => {
    if (leaderboardStatus === "submitting" || leaderboardStatus === "posted") return;

    setLeaderboardStatus("submitting");
    setLeaderboardError("");

    try {
      await submitMakeItRainLeaderboardScore(playerName, finalScore);
      const entries = await fetchMakeItRainLeaderboard();
      setLeaderboardEntries(entries);
      setLeaderboardStatus("posted");
    } catch (error) {
      console.error("[MakeItRain] Leaderboard submit failed.", error);
      const message = error instanceof Error ? error.message : String(error);
      setLeaderboardError(`Could not post right now. ${message}`);
      setLeaderboardStatus("error");
    }
  }, [finalScore, leaderboardStatus, playerName]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadLeaderboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadLeaderboard]);

  useEffect(() => () => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    clearCalloutTimer();
  }, [clearCalloutTimer]);

  useEffect(() => {
    const updateArena = () => {
      const arena = arenaRef.current;
      if (!arena) return;
      const rect = arena.getBoundingClientRect();
      const nextSize = {
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(560, Math.round(rect.height)),
      };
      setArenaSize(nextSize);
      const nextTarget = buildTargetState(nextSize);
      targetRef.current = nextTarget;
      setTarget(current => {
        if (screen === "playing") {
          return {
            ...current,
            width: nextTarget.width,
            height: nextTarget.height,
            y: clamp(current.y, 72, nextSize.height * 0.34),
            x: clamp(current.x, 12, nextSize.width - nextTarget.width - 12),
          };
        }

        return nextTarget;
      });
    };

    updateArena();
    window.addEventListener("resize", updateArena);
    return () => window.removeEventListener("resize", updateArena);
  }, [screen]);

  useEffect(() => {
    if (screen !== "playing") return;

    const step = (time: number) => {
      const previous = lastFrameRef.current ?? time;
      const dt = Math.min((time - previous) / 1000, 0.032);
      lastFrameRef.current = time;

      const currentTarget = targetRef.current;
      const paceBoost = Math.min(165, Math.floor(scoreRef.current / 450) * 18 + hitsRef.current * 2);
      let nextDirection = currentTarget.direction;
      let nextFakeOutTimer = currentTarget.fakeOutTimer - dt;
      let nextSpeed = 170 + paceBoost;

      if (nextFakeOutTimer <= 0) {
        if (Math.random() < 0.42) {
          nextDirection *= -1;
        }
        nextSpeed += randomBetween(18, 54);
        nextFakeOutTimer = randomBetween(0.75, 1.55);
      }

      let nextTargetX = currentTarget.x + nextDirection * nextSpeed * dt;
      const horizontalLimit = arenaSize.width - currentTarget.width - 12;

      if (nextTargetX <= 12) {
        nextTargetX = 12;
        nextDirection = 1;
      } else if (nextTargetX >= horizontalLimit) {
        nextTargetX = horizontalLimit;
        nextDirection = -1;
      }

      const nextTarget = {
        ...currentTarget,
        x: nextTargetX,
        y: clamp(
          arenaSize.height * 0.16 + Math.sin(time / 420 + currentTarget.bobPhase) * 14,
          88,
          arenaSize.height * 0.3,
        ),
        direction: nextDirection,
        speed: nextSpeed,
        fakeOutTimer: nextFakeOutTimer,
      };

      const activeBills: BillState[] = [];

      for (const bill of billsRef.current) {
        const vy = bill.vy + 940 * dt;
        const nextBill = {
          ...bill,
          x: bill.x + bill.vx * dt,
          y: bill.y + vy * dt,
          vy,
          rotation: bill.rotation + bill.spin * dt,
        };

        const billCenterX = nextBill.x + BILL_WIDTH / 2;
        const billCenterY = nextBill.y + BILL_HEIGHT / 2;
        const hitLeft = nextTarget.x + nextTarget.width * 0.18;
        const hitRight = nextTarget.x + nextTarget.width * 0.82;
        const hitTop = nextTarget.y + nextTarget.height * 0.1;
        const hitBottom = nextTarget.y + nextTarget.height * 0.94;
        const hitTarget = billCenterX >= hitLeft
          && billCenterX <= hitRight
          && billCenterY >= hitTop
          && billCenterY <= hitBottom;

        if (hitTarget) {
          registerHit();
          continue;
        }

        const isMiss = nextBill.x < -BILL_WIDTH
          || nextBill.x > arenaSize.width + BILL_WIDTH
          || nextBill.y < -BILL_HEIGHT * 3
          || nextBill.y > arenaSize.height + BILL_HEIGHT;

        if (isMiss) {
          registerMiss();
          continue;
        }

        activeBills.push(nextBill);
      }

      targetRef.current = nextTarget;
      billsRef.current = activeBills;
      setTarget(nextTarget);
      setBills(activeBills);

      if (screen === "playing") {
        animationFrameRef.current = window.requestAnimationFrame(step);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameRef.current = null;
    };
  }, [arenaSize.height, arenaSize.width, registerHit, registerMiss, screen]);

  const launchBill = useCallback((dragState: DragState) => {
    const dx = dragState.currentX - dragState.startX;
    const dy = dragState.currentY - dragState.startY;
    const distance = Math.hypot(dx, dy);
    const now = performance.now();

    if (distance < 24 || dy > -8) {
      return;
    }

    if (now - lastShotAtRef.current < 110) {
      return;
    }

    lastShotAtRef.current = now;

    const normalizedX = dx / distance;
    const normalizedY = dy / distance;
    const speed = clamp(distance * 4.9, 760, 1880);
    const launchY = arenaSize.height - 86;
    const launchX = arenaSize.width / 2 - BILL_WIDTH / 2;
    const bill: BillState = {
      id: billIdRef.current += 1,
      x: launchX,
      y: launchY,
      vx: normalizedX * speed,
      vy: normalizedY * speed,
      rotation: randomBetween(-14, 14),
      spin: randomBetween(-360, 360),
    };

    billsRef.current = [...billsRef.current, bill];
    setBills(billsRef.current);
  }, [arenaSize.height, arenaSize.width]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (screen !== "playing") return;
    const arena = arenaRef.current;
    if (!arena) return;

    const point = getArenaPoint(arena, event.clientX, event.clientY);
    if (point.y < arenaSize.height * 0.46) return;

    arena.setPointerCapture(event.pointerId);
    setDrag({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  }, [arenaSize.height, screen]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const arena = arenaRef.current;
    if (!arena) return;

    const point = getArenaPoint(arena, event.clientX, event.clientY);
    setDrag(current => current ? {
      ...current,
      currentX: point.x,
      currentY: point.y,
    } : null);
  }, [drag]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const arena = arenaRef.current;
    if (arena?.hasPointerCapture(event.pointerId)) {
      arena.releasePointerCapture(event.pointerId);
    }

    if (!drag) return;
    launchBill(drag);
    setDrag(null);
  }, [drag, launchBill]);

  return (
    <main className={`${bodyFontClassName} min-h-screen bg-[#050816] text-white`}>
      <div className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.32),_transparent_32%),radial-gradient(circle_at_80%_10%,_rgba(234,179,8,0.18),_transparent_24%),linear-gradient(180deg,_#071326_0%,_#050816_38%,_#09111c_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_60%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-4 pb-6 pt-4 sm:px-5">
          <header className="rounded-[2rem] border border-cyan-400/30 bg-slate-950/80 px-4 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.28em] text-cyan-300/80">BR SPORTS NETWORK</p>
                <h1 className={`${displayFontClassName} text-[1.95rem] font-black uppercase leading-none text-white`}>
                  Make It Rain
                </h1>
              </div>
              <Link
                href="/"
                className="rounded-full border border-slate-600 bg-slate-900/90 px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-slate-200"
              >
                Exit
              </Link>
            </div>
            <p className="mt-2 text-[0.88rem] uppercase tracking-[0.18em] text-slate-300">
              Flick cash. Tag the target. Three misses and the night is over.
            </p>
          </header>

          {screen === "splash" && (
            <section className="mt-4 flex flex-1 flex-col justify-between gap-4 rounded-[2.2rem] border border-yellow-400/20 bg-slate-950/78 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36)] backdrop-blur">
              <div className="rounded-[1.8rem] border border-slate-800 bg-[linear-gradient(180deg,rgba(11,18,32,0.9),rgba(8,13,24,0.96))] p-4">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.3em] text-yellow-300">Tonight&apos;s Event</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-3">
                    <div className="rounded-[1.6rem] border border-cyan-500/25 bg-slate-900/85 p-3">
                      <p className="text-[0.72rem] uppercase tracking-[0.24em] text-cyan-300">Rules</p>
                      <div className="mt-2 space-y-2 text-[1rem] font-semibold uppercase tracking-[0.05em] text-white">
                        <p>1. Flick from the lower half of the screen.</p>
                        <p>2. Every hit raises the multiplier up to 5x.</p>
                        <p>3. Anything that misses the target counts against you.</p>
                      </div>
                    </div>
                    <div className="rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <p className="text-[0.72rem] uppercase tracking-[0.22em] text-emerald-300">Broadcast Note</p>
                      <p className="mt-2 text-[1.05rem] font-bold uppercase leading-tight text-white">
                        Full 2D flick controls. Speed ramps up. Fake-outs start once the target gets hot.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[1.8rem] border border-fuchsia-400/25 bg-[#130f1f] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                    <div className="relative aspect-[4/5] w-full">
                      <Image
                        src="/make-it-rain/target.jpg"
                        alt="Make It Rain target"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 260px"
                        priority
                      />
                    </div>
                    <div className="border-t border-fuchsia-300/20 bg-slate-950/85 px-4 py-3">
                      <p className="text-[0.7rem] uppercase tracking-[0.24em] text-fuchsia-300">Moving Target</p>
                      <p className="mt-1 text-[1rem] font-black uppercase text-white">Left-right movement with speed spikes and fake-outs.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="rounded-[1.8rem] border border-slate-800 bg-slate-900/90 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[0.72rem] uppercase tracking-[0.22em] text-slate-400">Personal Best</p>
                      <p className={`${displayFontClassName} text-[2.2rem] font-black leading-none text-white`}>
                        {personalBest}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.72rem] uppercase tracking-[0.22em] text-slate-400">Leaderboard</p>
                      <p className="text-[1rem] font-bold uppercase text-cyan-300">
                        {leaderboardEntries.length > 0 ? `Top score ${leaderboardEntries[0]?.score}` : "Loading"}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startGame}
                  className="rounded-[1.6rem] border-4 border-yellow-300 bg-[#c8102e] px-6 py-4 text-[1rem] font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_40px_rgba(200,16,46,0.32)] active:scale-[0.99]"
                >
                  Start Broadcast
                </button>
              </div>
            </section>
          )}

          {screen === "playing" && (
            <section className="mt-4 flex flex-1 flex-col gap-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Score", value: score },
                  { label: "Streak", value: `${combo}x` },
                  { label: "Hits", value: hits },
                  { label: "Misses", value: `${misses}/${MAX_MISSES}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.4rem] border border-slate-700 bg-slate-950/85 px-2 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                    <p className="text-[0.64rem] uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
                    <p className={`${displayFontClassName} mt-1 text-[1.2rem] font-black uppercase text-white`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.7rem] border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-center text-[0.88rem] font-bold uppercase tracking-[0.16em] text-cyan-100">
                {callout}
              </div>

              <div
                ref={arenaRef}
                className="relative flex-1 overflow-hidden rounded-[2.4rem] border border-slate-700 bg-[linear-gradient(180deg,_rgba(9,15,28,0.96)_0%,_rgba(15,23,42,0.98)_32%,_rgba(34,12,32,0.98)_100%)] shadow-[0_28px_70px_rgba(0,0,0,0.42)]"
                style={{ minHeight: "66vh", touchAction: "none" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.22),_transparent_65%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-[13%] h-px bg-white/15" />
                <div className="pointer-events-none absolute inset-x-0 top-[35%] h-px bg-white/10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-16 h-px bg-yellow-300/50" />
                <div className="pointer-events-none absolute inset-x-6 bottom-0 h-24 rounded-t-[2rem] bg-[linear-gradient(180deg,_rgba(65,16,41,0)_0%,_rgba(99,17,52,0.45)_100%)]" />

                <div
                  className="pointer-events-none absolute z-20 overflow-hidden rounded-[1.25rem] border-2 border-fuchsia-300/70 bg-black/35 shadow-[0_18px_34px_rgba(0,0,0,0.38)]"
                  style={{
                    left: target.x,
                    top: target.y,
                    width: target.width,
                    height: target.height,
                    transform: `translateZ(0) scaleX(${target.direction < 0 ? -1 : 1})`,
                  }}
                >
                  <Image
                    src="/make-it-rain/target.jpg"
                    alt="Moving target"
                    fill
                    sizes="118px"
                    className="object-cover"
                  />
                </div>

                <div
                  className="pointer-events-none absolute z-10 rounded-full border border-fuchsia-300/80 bg-fuchsia-300/15 px-2 py-1 text-[0.58rem] font-black uppercase tracking-[0.18em] text-fuchsia-100"
                  style={{
                    left: clamp(target.x + target.width / 2 - 46, 10, arenaSize.width - 102),
                    top: Math.max(10, target.y - 28),
                  }}
                >
                  Target Live
                </div>

                {bills.map((bill) => (
                  <div
                    key={bill.id}
                    className="pointer-events-none absolute z-30 rounded-[0.45rem] border border-emerald-200/70 bg-[linear-gradient(135deg,_#d9f99d_0%,_#4ade80_40%,_#166534_100%)] shadow-[0_8px_18px_rgba(0,0,0,0.28)]"
                    style={{
                      left: bill.x,
                      top: bill.y,
                      width: BILL_WIDTH,
                      height: BILL_HEIGHT,
                      transform: `rotate(${bill.rotation}deg)`,
                    }}
                  >
                    <div className="flex h-full items-center justify-center text-[0.66rem] font-black uppercase tracking-[0.12em] text-emerald-950">
                      $
                    </div>
                  </div>
                ))}

                {drag && (
                  <>
                    <div
                      className="pointer-events-none absolute z-40 rounded-full border-2 border-yellow-300/80 bg-yellow-300/20"
                      style={{
                        left: drag.startX - 20,
                        top: drag.startY - 20,
                        width: 40,
                        height: 40,
                      }}
                    />
                    <svg className="pointer-events-none absolute inset-0 z-40 h-full w-full">
                      <line
                        x1={drag.startX}
                        y1={drag.startY}
                        x2={drag.currentX}
                        y2={drag.currentY}
                        stroke="rgba(250, 204, 21, 0.95)"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray="10 10"
                      />
                    </svg>
                  </>
                )}

                <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center">
                  <div className="rounded-full border border-yellow-300/60 bg-yellow-300/15 px-4 py-1 text-[0.64rem] font-black uppercase tracking-[0.22em] text-yellow-100">
                    Money Line
                  </div>
                  <div className="mt-2 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/75 bg-[#14532d] text-xl shadow-[0_16px_30px_rgba(0,0,0,0.38)]">
                    $
                  </div>
                </div>
              </div>
            </section>
          )}

          {screen === "end" && (
            <section className="mt-4 flex flex-1 flex-col gap-4 rounded-[2.2rem] border border-slate-700 bg-slate-950/86 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.4)] backdrop-blur">
              <div className="text-center">
                <p className="text-[0.76rem] uppercase tracking-[0.28em] text-red-300">Broadcast Over</p>
                <h2 className={`${displayFontClassName} mt-2 text-[2rem] font-black uppercase text-white`}>
                  Final Buzzer
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-[0.96fr_1.04fr]">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[1.7rem] border border-fuchsia-400/25 bg-[#130f1f] shadow-[0_16px_40px_rgba(0,0,0,0.34)]">
                    <div className="relative aspect-[4/5] w-full">
                      <Image
                        src="/make-it-rain/target.jpg"
                        alt="Make It Rain target"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 240px"
                      />
                    </div>
                    <div className="border-t border-fuchsia-300/20 bg-slate-950/85 px-4 py-3">
                      <p className="text-[0.72rem] uppercase tracking-[0.2em] text-fuchsia-300">Hit recap</p>
                      <p className="mt-1 text-[1rem] font-bold uppercase text-white">{hits} tags before the third miss.</p>
                    </div>
                  </div>

                  <div className="rounded-[1.7rem] border border-slate-700 bg-slate-900/90 p-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[0.72rem] uppercase tracking-[0.22em] text-slate-400">Final Score</p>
                        <p className={`${displayFontClassName} text-[2.35rem] font-black leading-none text-white`}>
                          {finalScore}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[0.72rem] uppercase tracking-[0.22em] text-slate-400">Best Streak</p>
                        <p className={`${displayFontClassName} text-[1.8rem] font-black leading-none text-yellow-300`}>
                          {bestMultiplier}x
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 h-px bg-slate-700" />
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-[0.72rem] uppercase tracking-[0.22em] text-slate-400">Personal Best</p>
                      <p className={`text-[1.5rem] font-black ${isNewBest ? "text-yellow-300" : "text-slate-200"}`}>
                        {personalBest}
                      </p>
                    </div>
                    {isNewBest && (
                      <p className="mt-2 text-[0.82rem] font-black uppercase tracking-[0.22em] text-yellow-300">
                        New high score on the night.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-[0.24em] text-slate-400">Your Name</p>
                    <input
                      type="text"
                      maxLength={11}
                      value={playerName}
                      onChange={(event) => setPlayerName(sanitizeLocalName(event.target.value))}
                      placeholder="BIG TIPPA"
                      className="w-full rounded-[1.25rem] border-2 border-slate-700 bg-slate-900 px-4 py-3 text-center text-[1rem] font-black uppercase tracking-[0.14em] text-white outline-none placeholder:text-slate-500 focus:border-yellow-300"
                      style={{ touchAction: "auto" }}
                    />
                    <button
                      type="button"
                      onClick={handleLeaderboardPost}
                      disabled={leaderboardStatus === "submitting" || leaderboardStatus === "posted"}
                      className={`w-full rounded-[1.35rem] border-4 px-4 py-3 text-[0.95rem] font-black uppercase tracking-[0.15em] text-white ${
                        leaderboardStatus === "posted"
                          ? "border-emerald-300 bg-emerald-700/70 text-emerald-100"
                          : leaderboardStatus === "submitting"
                            ? "border-slate-500 bg-slate-700 text-slate-200"
                            : "border-yellow-300 bg-[#c8102e] active:bg-[#a50d25]"
                      }`}
                      style={{ touchAction: "auto" }}
                    >
                      {leaderboardStatus === "submitting"
                        ? "Posting..."
                        : leaderboardStatus === "posted"
                          ? "Score Posted"
                          : "Post To Leaderboard"}
                    </button>
                    {leaderboardError && (
                      <p className="rounded-[1rem] border border-red-500/40 bg-red-950/40 px-3 py-2 text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-red-200">
                        {leaderboardError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="rounded-[1.7rem] border border-slate-700 bg-slate-900/92 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3)]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[0.72rem] font-black uppercase tracking-[0.24em] text-slate-300">Leaderboard</p>
                      <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                        Top {leaderboardEntries.length}
                      </p>
                    </div>
                    <div className="max-h-[19rem] overflow-y-auto rounded-[1.2rem] border border-slate-800 bg-slate-950/85">
                      <div className="divide-y divide-slate-800">
                        {leaderboardEntries.length === 0 && (
                          <p className="px-4 py-5 text-center text-[0.88rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Leaderboard is warming up.
                          </p>
                        )}

                        {leaderboardEntries.map((entry, index) => {
                          const isCurrentName = entry.name === playerName.trim().toUpperCase();
                          return (
                            <div
                              key={entry.id}
                              className={`flex items-center justify-between gap-3 px-4 py-3 ${isCurrentName ? "bg-yellow-400/10" : ""}`}
                            >
                              <div className="min-w-0">
                                <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-slate-500">
                                  #{index + 1}
                                </p>
                                <p className={`truncate text-[1rem] font-black uppercase ${isCurrentName ? "text-yellow-300" : "text-white"}`}>
                                  {entry.name}
                                </p>
                              </div>
                              <p className={`shrink-0 text-[1.1rem] font-black ${isCurrentName ? "text-yellow-300" : "text-cyan-300"}`}>
                                {entry.score}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={startGame}
                      className="rounded-[1.35rem] border-4 border-yellow-300 bg-[#c8102e] px-4 py-3 text-[0.94rem] font-black uppercase tracking-[0.14em] text-white active:scale-[0.99]"
                    >
                      Run It Back
                    </button>
                    <Link
                      href="/"
                      className="rounded-[1.35rem] border-2 border-slate-600 bg-slate-900 px-4 py-3 text-center text-[0.94rem] font-black uppercase tracking-[0.14em] text-slate-100"
                    >
                      Exit Broadcast
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
