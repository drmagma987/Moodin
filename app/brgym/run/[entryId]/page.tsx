"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, ChevronRight, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SavedRunTimer {
  startedAt: number | null;
  pausedElapsed: number;
  isRunning: boolean;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function playCue(frequency = 880) {
  const AudioContextClass = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.65);
  oscillator.onended = () => void context.close();
}

async function showRunNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "/brgym/icon-192.png",
      badge: "/brgym/icon-192.png",
      tag: "brgym-run-cue",
    });
  } catch {
    // Sound, vibration, and the live screen remain available if notifications fail.
  }
}

export default function GuidedRunPage() {
  const params = useParams<{ entryId: string }>();
  const { data, hydrated } = useBRGym();
  const entry = data.trainingPlan?.entries.find((candidate) => candidate.id === params.entryId);
  const steps = useMemo(() => entry?.timedSections ?? [], [entry?.timedSections]);
  const storageKey = `brgym-run-timer-${params.entryId}`;
  const [timer, setTimer] = useState<SavedRunTimer>({ startedAt: null, pausedElapsed: 0, isRunning: false });
  const [elapsed, setElapsed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const lastStepIndex = useRef<number | null>(null);
  const completionNotified = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) setTimer(JSON.parse(saved) as SavedRunTimer);
      } catch {
        // Start fresh if a partial local timer cannot be restored.
      }
      setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
      setLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey, JSON.stringify(timer));
  }, [loaded, storageKey, timer]);

  useEffect(() => {
    const update = () => {
      setElapsed(
        timer.isRunning && timer.startedAt
          ? Math.max(Math.floor((Date.now() - timer.startedAt) / 1000), 0)
          : timer.pausedElapsed,
      );
    };
    update();
    if (!timer.isRunning) return;
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [timer]);

  const totalSeconds = steps.reduce((total, step) => total + step.seconds, 0);
  let elapsedBeforeStep = 0;
  let stepIndex = steps.length;
  for (let index = 0; index < steps.length; index += 1) {
    if (elapsed < elapsedBeforeStep + steps[index].seconds) {
      stepIndex = index;
      break;
    }
    elapsedBeforeStep += steps[index].seconds;
  }
  const currentStep = steps[stepIndex] ?? null;
  const complete = steps.length > 0 && elapsed >= totalSeconds;
  const stepSecondsLeft = currentStep ? Math.max(elapsedBeforeStep + currentStep.seconds - elapsed, 0) : 0;

  useEffect(() => {
    if (!loaded || !timer.isRunning || !currentStep) return;
    if (lastStepIndex.current === null) {
      lastStepIndex.current = stepIndex;
      return;
    }
    if (lastStepIndex.current !== stepIndex) {
      playCue(currentStep.effort === "fast" ? 1040 : 760);
      navigator.vibrate?.([180, 80, 180]);
      void showRunNotification(currentStep.label, currentStep.cue ?? "Your next interval starts now.");
      lastStepIndex.current = stepIndex;
    }
  }, [currentStep, loaded, stepIndex, timer.isRunning]);

  useEffect(() => {
    if (!complete || completionNotified.current) return;
    completionNotified.current = true;
    const timeout = window.setTimeout(() => {
      setTimer((current) => ({ ...current, startedAt: null, pausedElapsed: totalSeconds, isRunning: false }));
      playCue(1180);
      navigator.vibrate?.([220, 100, 220, 100, 220]);
      void showRunNotification("Run timer complete", "Cooldown finished. Nice work — log your run when you’re ready.");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [complete, totalSeconds]);

  useEffect(() => {
    async function syncWakeLock() {
      if (!("wakeLock" in navigator)) return;
      if (timer.isRunning && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          wakeLockRef.current = null;
        }
      } else if (!timer.isRunning && wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }
    void syncWakeLock();
    return () => {
      if (wakeLockRef.current) void wakeLockRef.current.release();
      wakeLockRef.current = null;
    };
  }, [timer.isRunning]);

  if (!hydrated || !loaded) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading run timer…</div>;
  }

  if (!entry || steps.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-semibold text-white">No guided timer for this run</h2>
          <Link className="block rounded-2xl bg-cyan-400 p-4 text-center font-semibold text-slate-950" href="/brgym/plan">Back to plan</Link>
        </CardContent>
      </Card>
    );
  }

  function setElapsedSeconds(nextElapsed: number, running: boolean) {
    const bounded = Math.min(Math.max(nextElapsed, 0), totalSeconds);
    setTimer({
      startedAt: running && bounded < totalSeconds ? Date.now() - bounded * 1000 : null,
      pausedElapsed: bounded,
      isRunning: running && bounded < totalSeconds,
    });
    setElapsed(bounded);
    if (bounded < totalSeconds) completionNotified.current = false;
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      toast.error("Notifications are not supported on this device");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      toast.success("Run cues enabled");
      void showRunNotification("BR Gym run cues are on", "You’ll get a cue when each timed section changes.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Guided run</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{entry.title}</h2>
        </div>
        <Badge variant="cyan">{formatSeconds(totalSeconds)}</Badge>
      </div>

      <Card className="sticky top-3 z-10 border-cyan-400/35 bg-slate-950/95 shadow-2xl backdrop-blur">
        <CardContent className="space-y-4 p-4">
          {complete ? (
            <div className="py-4 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Timer complete</p>
              <p className="mt-2 text-4xl font-semibold text-white">Nice work.</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Now • {stepIndex + 1} of {steps.length}</p>
                  <h3 className="mt-1 text-xl font-semibold text-white">{currentStep?.label}</h3>
                  <p className="mt-1 text-sm text-slate-300">{currentStep?.cue}</p>
                </div>
                <p className="tabular-nums text-4xl font-semibold text-white">{formatSeconds(stepSecondsLeft)}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${Math.min((elapsed / totalSeconds) * 100, 100)}%` }} />
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => {
                playCue(660);
                if (timer.isRunning) setElapsedSeconds(elapsed, false);
                else setElapsedSeconds(elapsed, true);
              }}
              size="lg"
            >
              {timer.isRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {elapsed === 0 && !timer.isRunning ? "Start" : timer.isRunning ? "Pause" : "Resume"}
            </Button>
            <Button onClick={() => setElapsedSeconds(elapsedBeforeStep + (currentStep?.seconds ?? 0), timer.isRunning)} size="lg" variant="secondary" disabled={complete}>
              <SkipForward className="mr-2 h-4 w-4" /> Skip
            </Button>
            <Button onClick={() => { lastStepIndex.current = null; setElapsedSeconds(0, false); }} size="lg" variant="secondary">
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
        <Button className="w-full" onClick={enableNotifications} variant="secondary">
          <Bell className="mr-2 h-4 w-4" /> Enable section notifications
        </Button>
      ) : notificationPermission === "granted" ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          <BellRing className="h-4 w-4" /> Section notifications are on
        </div>
      ) : null}

      <Card>
        <CardContent>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Workout sequence</p>
          <div className="mt-3 space-y-2">
            {steps.map((step, index) => (
              <div key={step.id} className={`flex items-center justify-between rounded-2xl px-3 py-3 text-sm ${index === stepIndex && !complete ? "bg-cyan-400/12 text-white" : index < stepIndex || complete ? "text-slate-500" : "bg-white/5 text-slate-200"}`}>
                <div className="flex items-center gap-2"><span className="w-5 text-center">{index < stepIndex || complete ? "✓" : index + 1}</span><span>{step.label}</span></div>
                <span className="tabular-nums">{formatSeconds(step.seconds)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Link className="flex items-center justify-center rounded-2xl bg-white/8 p-4 text-sm font-medium text-white" href="/brgym/plan">
        Back to plan and log run <ChevronRight className="ml-2 h-4 w-4" />
      </Link>
    </div>
  );
}
