import { handleCallback } from "@vercel/queue";

import { deliverRunPush, type QueuedRunPush } from "@/lib/brgym/server-push";

export const runtime = "nodejs";

export const POST = handleCallback<QueuedRunPush>(async (message) => {
  await deliverRunPush(message);
});
