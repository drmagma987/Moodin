"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Pause, Play, RotateCcw, SkipForward, TimerReset } from "lucide-react";

import { useBRGym } from "@/components/brgym/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function playDing() {
  if (typeof window === "undefined") {
    return;
  }
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.5);
  oscillator.onended = () => {
    void context.close();
  };
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
  const previousSeconds = useRef(timer.secondsLeft);

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
        playDing();
      }
      if ("vibrate" in navigator) {
        navigator.vibrate?.(120);
      }
    }
    previousSeconds.current = timer.secondsLeft;
  }, [data.settings.timerSoundMuted, timer.secondsLeft]);

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
    <Card className="sticky top-3 z-10 border-cyan-400/30 bg-slate-950/95 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">{timer.isRunning ? "Resting" : "Next set"}</p>
            <p className="text-3xl font-semibold tracking-tight text-white tabular-nums">{formatSeconds(timer.secondsLeft)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={timer.isRunning ? "cyan" : "default"}>{timer.isRunning ? "Running" : "Ready"}</Badge>
            <Button onClick={timer.isRunning ? pauseTimer : resumeTimer} size="sm" variant="secondary">
              {timer.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="sr-only">{timer.isRunning ? "Pause" : "Resume"}</span>
            </Button>
          </div>
        </div>

        {children ? <div className="mt-4 border-t border-white/10 pt-4">{children}</div> : null}

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Button className="px-2" onClick={() => adjustTimer(30)} size="sm" variant="secondary">
            <TimerReset className="mr-1 h-4 w-4" /> +30s
          </Button>
          <Button className="px-2" onClick={skipTimer} size="sm" variant="secondary">
            <SkipForward className="mr-2 h-4 w-4" />
            Skip
          </Button>
          <Button className="px-2" onClick={resetTimer} size="sm" variant="secondary">
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
