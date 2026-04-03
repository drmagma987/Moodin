"use client";

import { useEffect, useRef, useState } from "react";

const MUSIC_SRC = "/we-are-charlie-kirk.mp3";

export function BackgroundAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("moodinMusicMuted") !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem("moodinMusicMuted", String(muted));
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = muted;
    audio.volume = 0.45;

    if (muted) {
      return;
    }

    void audio.play().catch(() => {
      // Playback can still be blocked until the user interacts again.
    });
  }, [muted]);

  return (
    <>
      <audio ref={audioRef} src={MUSIC_SRC} loop muted={muted} preload="auto" />
      <button
        type="button"
        onClick={() => setMuted((current) => !current)}
        className="fixed bottom-4 right-4 z-50 rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-medium text-slate-950 shadow-sm backdrop-blur hover:bg-gray-50"
        aria-pressed={!muted}
      >
        {muted ? "Music Off" : "Music On"}
      </button>
    </>
  );
}
