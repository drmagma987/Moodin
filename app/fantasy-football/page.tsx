import { DraftCommandCenter } from "@/components/fantasy/draft-command-center";
import { getBoardPlan, getDraftLabDataset } from "@/lib/fantasy/draftLab";
import { warRoomArtifact } from "@/lib/fantasy/warRoomArtifact";
import type { DraftBoardMode } from "@/lib/fantasy/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOARD_MODES: DraftBoardMode[] = ["working", "draft-week", "final"];

type FantasyFootballPageProps = {
  searchParams?: Promise<{ board?: string }>;
};

export default async function FantasyFootballPage({ searchParams }: FantasyFootballPageProps) {
  const params = (await searchParams) ?? {};
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
  );
}
