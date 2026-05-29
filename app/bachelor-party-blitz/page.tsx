import Script from "next/script";

import { BachelorPartyGame } from "./BachelorPartyGame";

interface BachelorPartyBlitzPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BachelorPartyBlitzPage({ searchParams }: BachelorPartyBlitzPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const debugValue = resolvedSearchParams?.debug;
  const debugBill = Array.isArray(debugValue) ? debugValue.includes("bill") : debugValue === "bill";

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
      />

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

      <BachelorPartyGame debugBill={debugBill} />
    </>
  );
}
