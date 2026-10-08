import { getVapidConfig } from "@/lib/brgym/server-push";

export const runtime = "nodejs";

export function GET() {
  const config = getVapidConfig();
  if (!config) {
    return Response.json({ enabled: false }, { status: 503 });
  }
  return Response.json({ enabled: true, publicKey: config.publicKey });
}
