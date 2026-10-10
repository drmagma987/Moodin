"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, Pause, Play, RotateCcw, SkipForward, TimerReset } from "lucide-react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBRGymPushSubscription, setServiceWorkerPushToken } from "@/lib/brgym/push-client";

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function audioContextClass() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

function playDing(context: AudioContext) {
  const start = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.52, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.05);
  gain.connect(context.destination);

  [784, 1046.5].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.connect(gain);
    oscillator.start(start + index * 0.16);
    oscillator.stop(start + 0.72 + index * 0.16);
  });
}

export function RestTimer({ children }: { children?: ReactNode }) {
  const {
    data,
    timer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    skipTimer,
    adjustTimer,
    tickTimer,
  } = useBRGym();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pushGenerationRef = useRef(0);
  const pushScheduledRef = useRef(false);
  const previousSeconds = useRef(timer.secondsLeft);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  function unlockAudio() {
    if (data.settings.timerSoundMuted) return;
    const AudioContextClass = audioContextClass();
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
  }

  async function enableRestAlerts() {
    unlockAudio();
    if (!("Notification" in window)) {
      toast.error("Notifications are not supported on this device");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== "granted") {
      toast.error("Allow notifications to receive rest-complete alerts");
      return;
    }
    try {
      await getBRGymPushSubscription();
      toast.success("Rest sound and notifications are ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable rest notifications");
    }
  }

  function cancelRestPush() {
    pushGenerationRef.current += 1;
    pushScheduledRef.current = false;
    if ("serviceWorker" in navigator) void setServiceWorkerPushToken("rest", null).catch(() => undefined);
  }

  useEffect(() => {
    setNotificationPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  useEffect(() => {
    if (!timer.isRunning) {
      return;
    }
    const interval = window.setInterval(() => {
      tickTimer();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tickTimer, timer.isRunning]);

  useEffect(() => {
    function syncAfterBackground() {
      if (document.visibilityState === "visible") {
        tickTimer();
      }
    }
    document.addEventListener("visibilitychange", syncAfterBackground);
    return () => document.removeEventListener("visibilitychange", syncAfterBackground);
  }, [tickTimer]);

  useEffect(() => {
    if (previousSeconds.current > 0 && timer.secondsLeft === 0) {
      if (!data.settings.timerSoundMuted) {
        const context = audioContextRef.current;
        if (context) {
          void context.resume().then(() => playDing(context));
        }
      }
      if ("vibrate" in navigator) {
        navigator.vibrate?.([160, 90, 240]);
      }
      if (!pushScheduledRef.current && "Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
        void navigator.serviceWorker.ready.then((registration) => registration.showNotification("Rest complete", {
          body: "Your next set is ready.",
          icon: "/brgym/icon-192.png",
          badge: "/brgym/icon-192.png",
          tag: "brgym-rest-complete",
          data: { targetUrl: window.location.pathname },
        }));
      }
    }
    previousSeconds.current = timer.secondsLeft;
  }, [data.settings.timerSoundMuted, timer.secondsLeft]);

  useEffect(() => {
    const generation = pushGenerationRef.current + 1;
    pushGenerationRef.current = generation;
    pushScheduledRef.current = false;

    if (!data.activeWorkout) {
      if ("serviceWorker" in navigator) void setServiceWorkerPushToken("rest", null).catch(() => undefined);
      return;
    }
    if (!timer.isRunning || !timer.endsAt || !("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const scheduleToken = crypto.randomUUID().replaceAll("-", "");
    const delaySeconds = Math.max(Math.ceil((timer.endsAt - Date.now()) / 1000), 1);
    void (async () => {
      try {
        const subscription = await getBRGymPushSubscription();
        await setServiceWorkerPushToken("rest", scheduleToken);
        const response = await fetch("/api/brgym/push/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "rest",
            scheduleToken,
            subscription: subscription.toJSON(),
            targetUrl: window.location.pathname,
            events: [{ delaySeconds, title: "Rest complete", body: "Your next set is ready." }],
          }),
        });
        if (!response.ok) throw new Error("Rest push schedule failed");
        if (pushGenerationRef.current === generation) pushScheduledRef.current = true;
      } catch {
        if (pushGenerationRef.current === generation) {
          pushScheduledRef.current = false;
          await setServiceWorkerPushToken("rest", null).catch(() => undefined);
        }
      }
    })();
  }, [data.activeWorkout, timer.endsAt, timer.isRunning]);

  useEffect(() => {
    async function syncWakeLock() {
      if (!("wakeLock" in navigator)) {
        return;
      }
      if (timer.isRunning && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          wakeLockRef.current = null;
        }
      }
      if (!timer.isRunning && wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }
    void syncWakeLock();
    return () => {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [timer.isRunning]);

  return (
    <Card className="sticky top-3 z-10 border-cyan-400/30 bg-slate-950/95 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur" onPointerDownCapture={unlockAudio}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">{timer.isRunning ? "Resting" : "Next set"}</p>
            <p className="text-3xl font-semibold tracking-tight text-white tabular-nums">{formatSeconds(timer.secondsLeft)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={timer.isRunning ? "cyan" : "default"}>{timer.isRunning ? "Running" : "Ready"}</Badge>
            <Button onClick={timer.isRunning ? () => { cancelRestPush(); pauseTimer(); } : resumeTimer} size="sm" variant="secondary">
              {timer.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="sr-only">{timer.isRunning ? "Pause" : "Resume"}</span>
            </Button>
          </div>
        </div>

        {children ? <div className="mt-4 border-t border-white/10 pt-4">{children}</div> : null}

        {notificationPermission === "default" ? (
          <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-xs font-medium text-slate-200" onClick={() => void enableRestAlerts()} type="button">
            <BellRing className="h-3.5 w-3.5" /> Enable rest-complete notification
          </button>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Button className="px-2" onClick={() => adjustTimer(30)} size="sm" variant="secondary">
            <TimerReset className="mr-1 h-4 w-4" /> +30s
          </Button>
          <Button className="px-2" onClick={() => { cancelRestPush(); skipTimer(); }} size="sm" variant="secondary">
            <SkipForward className="mr-2 h-4 w-4" />
            Skip
          </Button>
          <Button className="px-2" onClick={() => { cancelRestPush(); resetTimer(); }} size="sm" variant="secondary">
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
