import type { Metadata } from "next";
import { Toaster } from "sonner";

import { BRGymAppShell } from "@/components/brgym/app-shell";
import { BRGymProvider } from "@/components/brgym/provider";
import { BRGymPwaRegistration } from "@/components/brgym/pwa-registration";

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
      { url: "/brgym/logo.jpg", sizes: "512x512", type: "image/jpeg" },
      { url: "/brgym/logo.jpg", sizes: "192x192", type: "image/jpeg" },
    ],
    apple: [{ url: "/brgym/logo.jpg", sizes: "180x180", type: "image/jpeg" }],
    shortcut: ["/brgym/logo.jpg"],
  },
};

export default function BRGymLayout({ children }: { children: React.ReactNode }) {
  return (
    <BRGymProvider>
      <BRGymPwaRegistration />
      <Toaster position="top-center" richColors theme="dark" />
      <BRGymAppShell>{children}</BRGymAppShell>
    </BRGymProvider>
  );
}
