"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const INSTALL_DISMISSED_KEY = "brgym-install-help-dismissed";

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export function BRGymPwaRegistration() {
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const initialStatusTimer = window.setTimeout(() => {
      const standalone = isStandalone();
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      setOnline(navigator.onLine);
      setInstalled(standalone);
      setShowIosHelp(
        isIos && !standalone && window.localStorage.getItem(INSTALL_DISMISSED_KEY) !== "true",
      );
    }, 0);

    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    function handleInstallPrompt(event: Event) {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
    }

    function handleInstalled() {
      installPromptRef.current = null;
      setCanInstall(false);
      setInstalled(true);
    }

    function handleControllerChange() {
      window.location.reload();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/brgym-sw.js", { scope: "/brgym/", updateViaCache: "none" })
        .then((registration) => {
          registrationRef.current = registration;
          if (registration.waiting && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          });
          return registration.update();
        })
        .catch(() => undefined);
    }

    return () => {
      window.clearTimeout(initialStatusTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (updateReady) {
    return (
      <aside className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-sm text-cyan-50">
        <span>A BR Gym update is ready.</span>
        <Button
          onClick={() => {
            registrationRef.current?.waiting?.postMessage({ type: "SKIP_WAITING" });
          }}
          size="sm"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Update
        </Button>
      </aside>
    );
  }

  if (!online) {
    return (
      <aside className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-50">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Offline mode — your workout and history still save on this device.</span>
      </aside>
    );
  }

  if (canInstall && !installed) {
    return (
      <aside className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-3 text-sm text-cyan-50">
        <span>Install BR Gym for quick access and offline workouts.</span>
        <Button
          onClick={async () => {
            const prompt = installPromptRef.current;
            if (!prompt) {
              return;
            }
            await prompt.prompt();
            await prompt.userChoice;
            installPromptRef.current = null;
            setCanInstall(false);
          }}
          size="sm"
        >
          <Download className="mr-2 h-4 w-4" />
          Install
        </Button>
      </aside>
    );
  }

  if (showIosHelp && !installed) {
    return (
      <aside className="relative mb-4 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4 pr-10 text-sm text-cyan-50">
        <button
          aria-label="Dismiss install instructions"
          className="absolute right-2 top-2 rounded-full p-2 text-cyan-100"
          onClick={() => {
            window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
            setShowIosHelp(false);
          }}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="font-semibold">Install BR Gym on this iPhone</p>
        <p className="mt-1 text-cyan-50/85">
          In Safari, tap <Share className="mx-1 inline h-4 w-4" /> Share, then “Add to Home Screen.”
        </p>
      </aside>
    );
  }

  return null;
}
