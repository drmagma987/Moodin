"use client";

import { useEffect } from "react";
import Script from "next/script";

import { BachelorPartyGame } from "./BachelorPartyGame";

export default function BachelorPartyBlitzPage() {
  useEffect(() => {
    const googleapis = document.createElement("link");
    googleapis.rel = "preconnect";
    googleapis.href = "https://fonts.googleapis.com";

    const gstatic = document.createElement("link");
    gstatic.rel = "preconnect";
    gstatic.href = "https://fonts.gstatic.com";
    gstatic.crossOrigin = "anonymous";

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";

    document.head.append(googleapis, gstatic, stylesheet);

    return () => {
      googleapis.remove();
      gstatic.remove();
      stylesheet.remove();
    };
  }, []);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/particles.js/2.0.0/particles.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://unpkg.com/splitting/dist/splitting.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"
        strategy="afterInteractive"
      />

      <BachelorPartyGame />
    </>
  );
}
