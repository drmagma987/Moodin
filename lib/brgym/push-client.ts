"use client";

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function getBRGymPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this device");
  }
  const configResponse = await fetch("/api/brgym/push/config", { cache: "no-store" });
  if (!configResponse.ok) throw new Error("Server push is not configured yet");
  const config = await configResponse.json() as { publicKey?: string };
  if (!config.publicKey) throw new Error("Server push is not configured yet");

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey),
  });
}

export async function setServiceWorkerPushToken(channel: "run" | "reminder", token: string | null) {
  const registration = await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller ?? registration.active;
  worker?.postMessage({
    type: channel === "run" ? "BRGYM_SET_RUN_PUSH_TOKEN" : "BRGYM_SET_REMINDER_PUSH_TOKEN",
    token,
  });
}
