import { send } from "@vercel/queue";
import type { PushSubscription } from "web-push";

import { deliverRunPush, RUN_PUSH_TOPIC, type QueuedRunPush } from "@/lib/brgym/server-push";

export const runtime = "nodejs";

interface ScheduleRequest {
  scheduleToken?: unknown;
  subscription?: unknown;
  targetUrl?: unknown;
  events?: unknown;
}

interface CandidateEvent {
  delaySeconds?: unknown;
  title?: unknown;
  body?: unknown;
}

function validSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const subscription = value as Partial<PushSubscription>;
  return typeof subscription.endpoint === "string"
    && subscription.endpoint.startsWith("https://")
    && !!subscription.keys
    && typeof subscription.keys.p256dh === "string"
    && typeof subscription.keys.auth === "string";
}

export async function POST(request: Request) {
  let body: ScheduleRequest;
  try {
    body = await request.json() as ScheduleRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scheduleToken = typeof body.scheduleToken === "string" ? body.scheduleToken : "";
  const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl : "";
  const candidates = Array.isArray(body.events) ? body.events as CandidateEvent[] : [];
  if (!/^[a-zA-Z0-9_-]{20,100}$/.test(scheduleToken)
    || !validSubscription(body.subscription)
    || !targetUrl.startsWith("/brgym/run/")
    || candidates.length < 1
    || candidates.length > 50) {
    return Response.json({ error: "Invalid run schedule" }, { status: 400 });
  }

  const events = candidates.map((candidate) => ({
    delaySeconds: Number(candidate.delaySeconds),
    title: typeof candidate.title === "string" ? candidate.title.trim() : "",
    body: typeof candidate.body === "string" ? candidate.body.trim() : "",
  }));
  if (events.some((event) => !Number.isInteger(event.delaySeconds)
    || event.delaySeconds < 1
    || event.delaySeconds > 4 * 60 * 60
    || event.title.length < 1
    || event.title.length > 100
    || event.body.length < 1
    || event.body.length > 180)) {
    return Response.json({ error: "Invalid notification event" }, { status: 400 });
  }

  const subscription = body.subscription;
  const messages = await Promise.all(events.map((event, index) => {
    const message: QueuedRunPush = {
      scheduleToken,
      subscription,
      title: event.title,
      body: event.body,
      targetUrl,
    };
    if (process.env.NODE_ENV !== "production") {
      const timer = setTimeout(() => {
        void deliverRunPush(message).catch((error) => console.error("Local BR Gym push failed", error));
      }, event.delaySeconds * 1000);
      timer.unref();
      return Promise.resolve({ messageId: `local-${scheduleToken}-${index}` });
    }
    return send(RUN_PUSH_TOPIC, message, {
      delaySeconds: event.delaySeconds,
      retentionSeconds: Math.max(3600, event.delaySeconds + 3600),
      idempotencyKey: `${scheduleToken}-${index}-${event.delaySeconds}`,
    });
  }));

  return Response.json({ scheduled: messages.length });
}
