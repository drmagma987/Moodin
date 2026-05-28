"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const MUSIC_SRC = "/we-are-charlie-kirk.mp3";

export function BackgroundAudio() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("moodinMusicMuted") !== "false";
  });
  const onGamePage = pathname === "/bachelor-party-blitz";
  const onIntroScreen = pathname === "/";

  useEffect(() => {
    window.localStorage.setItem("moodinMusicMuted", String(muted));
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || onGamePage) return;

    audio.muted = muted;
    audio.volume = 0.45;

    if (muted) return;

    void audio.play().catch(() => {
      // Playback can still be blocked until the user interacts again.
    });
  }, [muted, onGamePage]);

  if (onGamePage) return null;

  return (
    <>
      <audio ref={audioRef} src={MUSIC_SRC} loop muted={muted} preload="auto" />
      <button
        type="button"
        onClick={() => setMuted((current) => !current)}
        className={
          onIntroScreen
            ? "fixed bottom-4 right-4 z-50 rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-medium text-slate-950 shadow-sm backdrop-blur hover:bg-gray-50"
            : "fixed right-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-lg text-slate-950 shadow-sm backdrop-blur hover:bg-gray-50"
        }
        aria-pressed={!muted}
        aria-label={muted ? "Turn music on" : "Turn music off"}
        title={muted ? "Music Off" : "Music On"}
      >
        {onIntroScreen ? (muted ? "Music Off" : "Music On") : muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
