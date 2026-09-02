import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BR Gym",
    short_name: "BR Gym",
    description: "Local-first gym tracker for quick mobile logging.",
    start_url: "/brgym",
    display: "standalone",
    background_color: "#050816",
    theme_color: "#050816",
    icons: [
      {
        src: "/brgym/logo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/brgym/logo.jpg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
