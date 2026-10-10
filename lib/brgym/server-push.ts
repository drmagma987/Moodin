import webPush, { type PushSubscription } from "web-push";

export const RUN_PUSH_TOPIC = "brgym-run-cues";

export interface QueuedRunPush {
  channel: "run" | "reminder" | "rest";
  scheduleToken: string;
  subscription: PushSubscription;
  title: string;
  body: string;
  targetUrl: string;
}

export function getVapidConfig() {
  const publicKey = process.env.BRGYM_VAPID_PUBLIC_KEY;
  const privateKey = process.env.BRGYM_VAPID_PRIVATE_KEY;
  const subject = process.env.BRGYM_VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export async function deliverRunPush(message: QueuedRunPush) {
  const config = getVapidConfig();
  if (!config) throw new Error("BR Gym VAPID keys are not configured");

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  try {
    await webPush.sendNotification(
      message.subscription,
      JSON.stringify({
        channel: message.channel,
        scheduleToken: message.scheduleToken,
        title: message.title,
        body: message.body,
        targetUrl: message.targetUrl,
      }),
      { TTL: 300, urgency: "high" },
    );
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error
      ? Number(error.statusCode)
      : 0;
    if (statusCode === 404 || statusCode === 410) return;
    throw error;
  }
}
