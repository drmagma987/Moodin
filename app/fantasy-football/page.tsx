import { DraftCommandCenter } from "@/components/fantasy/draft-command-center";
import { InSeasonCommandCenter } from "@/components/fantasy/in-season-command-center";
import { getBoardPlan, getDraftLabDataset } from "@/lib/fantasy/draftLab";
import { getInSeasonCommandCenterDataset } from "@/lib/fantasy/inSeason";
import { warRoomArtifact } from "@/lib/fantasy/warRoomArtifact";
import type { DraftBoardMode } from "@/lib/fantasy/types";
import { leagueSourceOfTruth } from "@/lib/fantasy/leagueSourceOfTruth";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOARD_MODES: DraftBoardMode[] = ["working", "draft-week", "final"];

type FantasyFootballPageProps = {
  searchParams?: Promise<{ board?: string; view?: string }>;
};

export default async function FantasyFootballPage({ searchParams }: FantasyFootballPageProps) {
  const params = (await searchParams) ?? {};
  const view = params.view === "draft" ? "draft" : "season";
  const sectionTabs = (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[#06101d]/95 px-3 py-2 backdrop-blur sm:px-6">
      <nav className="mx-auto flex max-w-[1440px] gap-1 rounded-2xl border border-white/10 bg-black/25 p-1" aria-label="Fantasy football tools">
        <Link href="/fantasy-football" className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-black transition ${view === "season" ? "bg-emerald-400 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>Season Agent</Link>
        <Link href="/fantasy-football?view=draft" className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${view === "draft" ? "bg-cyan-400 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>Draft Archive <span className="rounded-full bg-black/15 px-2 py-0.5 text-[10px] uppercase">{leagueSourceOfTruth.season}</span></Link>
      </nav>
    </div>
  );

  if (view === "season") {
    return <>{sectionTabs}<InSeasonCommandCenter dataset={getInSeasonCommandCenterDataset()} /></>;
  }

  const boardMode = BOARD_MODES.includes(params.board as DraftBoardMode)
    ? (params.board as DraftBoardMode)
    : "working";
  const boardPlan = getBoardPlan(boardMode);
  const snapshot = warRoomArtifact;
  // Remote feeds are refreshed deliberately into a checked snapshot instead
  // of blocking draft-room rendering. The opt-in is useful for diagnostics;
  // the generated snapshot is the production-safe default.
  const liveDataset = process.env.FANTASY_LIVE_REQUEST_REFRESH === "true"
    ? await getDraftLabDataset(boardMode)
    : null;
  const candidates = liveDataset?.candidates ?? snapshot.candidates;
  const draftState = liveDataset?.draftState ?? snapshot.draftState;
  const sourceMode = liveDataset?.sourceStatus.mode ?? snapshot.sourceStatus.mode;
  const sourceMessage = liveDataset?.sourceStatus.message
    ?? `${snapshot.sourceStatus.message.replace(/ Board mode: .*?\.$/, "")} Snapshot checked ${snapshot.capturedAt.slice(0, 10)}. Board mode: ${boardPlan.title}.`;
  const dataQuality = liveDataset?.dataQuality ?? snapshot.dataQuality;

  return (
    <>
      {sectionTabs}
      <div className="border-b border-amber-300/15 bg-amber-300/[0.07] px-4 py-2 text-center text-xs font-bold text-amber-100">Draft workspace archived after the 2026 draft. Your board, history, rehearsal, and setup remain available here.</div>
      <DraftCommandCenter
        boardMode={boardMode}
        boardSummary={boardPlan.summary}
        candidates={candidates}
        initialDraftState={draftState}
        sourceMode={sourceMode}
        sourceMessage={sourceMessage}
        dataQuality={dataQuality}
        artifactCapturedAt={snapshot.capturedAt}
      />
    </>
  );
}
