import type { Metadata } from "next";
import { BackgroundAudio } from "@/components/background-audio";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moodin",
  description: "Head-to-head draft battles with quick series play.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <BackgroundAudio />
      </body>
    </html>
  );
}
