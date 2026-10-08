import type { MetadataRoute } from "next";

const manifest: MetadataRoute.Manifest = {
  id: "/brgym/",
  name: "BR Gym",
  short_name: "BR Gym",
  description: "Local-first gym tracker for quick mobile logging.",
  start_url: "/brgym/",
  scope: "/brgym/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#050505",
  theme_color: "#050505",
  categories: ["fitness", "health", "sports"],
  shortcuts: [
    {
      name: "Training plan",
      short_name: "Plan",
      description: "Open the dated BR Gym training plan.",
      url: "/brgym/plan",
      icons: [{ src: "/brgym/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Start workout",
      short_name: "Workout",
      description: "Start or resume a BR Gym workout.",
      url: "/brgym/workout",
      icons: [{ src: "/brgym/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Training progress",
      short_name: "Progress",
      description: "Review BR Gym strength trends and personal records.",
      url: "/brgym/progress",
      icons: [{ src: "/brgym/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    {
      name: "Workout history",
      short_name: "History",
      description: "Review saved BR Gym sessions.",
      url: "/brgym/history",
      icons: [{ src: "/brgym/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
  ],
  icons: [
    {
      src: "/brgym/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/brgym/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export const dynamic = "force-static";

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "application/manifest+json",
    },
  });
}
