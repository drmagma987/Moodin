"use client";

import { useEffect } from "react";

export function BRGymPwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/brgym-sw.js").catch(() => undefined);
  }, []);

  return null;
}
