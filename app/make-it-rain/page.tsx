import type { Metadata } from "next";
import { Barlow_Condensed, Orbitron } from "next/font/google";

import { MakeItRainGame } from "./MakeItRainGame";

const bodyFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const displayFont = Orbitron({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Make It Rain",
  description: "Flick cash at the moving target and climb the leaderboard.",
  openGraph: {
    title: "Make It Rain",
    description: "Flick cash at the moving target and climb the leaderboard.",
    images: [
      {
        url: "/make-it-rain/target.jpg",
        alt: "Make It Rain target preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Make It Rain",
    description: "Flick cash at the moving target and climb the leaderboard.",
    images: ["/make-it-rain/target.jpg"],
  },
};

export default function MakeItRainPage() {
  return <MakeItRainGame bodyFontClassName={bodyFont.className} displayFontClassName={displayFont.className} />;
}
