import type { Metadata } from "next";
import { Toaster } from "sonner";

import { BRGymAppShell } from "@/components/brgym/app-shell";
import { BRGymProvider } from "@/components/brgym/provider";

export const viewport = {
  themeColor: "#050816",
  colorScheme: "dark",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "BR Gym",
  description: "Mobile-first local workout tracker for fast lifting sessions.",
  appleWebApp: {
    capable: true,
    title: "BR Gym",
    statusBarStyle: "black-translucent",
  },
  manifest: "/brgym/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brgym/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brgym/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brgym/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/brgym/icon-192.png"],
  },
};

export default function BRGymLayout({ children }: { children: React.ReactNode }) {
  return (
    <BRGymProvider>
      <Toaster position="top-center" richColors theme="dark" />
      <BRGymAppShell>{children}</BRGymAppShell>
    </BRGymProvider>
  );
}
