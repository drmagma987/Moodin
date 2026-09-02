"use client";

import { useEffect, useRef } from "react";
import { MoonStar, Pause, Play, RotateCcw, SkipForward, TimerReset } from "lucide-react";

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

export function RestTimer() {
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
    <Card className="border-cyan-400/25 bg-slate-900/80 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">Rest timer</p>
            <p className="text-4xl font-semibold tracking-tight text-white">{formatSeconds(timer.secondsLeft)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={timer.isRunning ? "cyan" : "default"}>
              {timer.isRunning ? "Running" : "Ready"}
            </Badge>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right text-xs text-slate-300">
              <p>Auto-starts on</p>
              <p className="font-semibold text-white">Log Set</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Button onClick={pauseTimer} size="lg" variant="secondary">
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button onClick={resumeTimer} size="lg">
            <Play className="mr-2 h-4 w-4" />
            Resume
          </Button>
          <Button onClick={resetTimer} size="lg" variant="secondary">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button className="px-2" onClick={skipTimer} size="lg" variant="secondary">
            <SkipForward className="mr-2 h-4 w-4" />
            Skip
          </Button>
          <Button className="px-2" onClick={() => adjustTimer(30)} size="lg" variant="secondary">
            <TimerReset className="mr-2 h-4 w-4" />
            +30s
          </Button>
          <Button className="px-2" onClick={() => adjustTimer(-30)} size="lg" variant="secondary">
            <MoonStar className="mr-2 h-4 w-4" />
            -30s
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
