import { buildLiveDraftCall, type DraftBoardSignal, type DraftQuickScore, type LiveDraftCall } from "@/lib/fantasy/draftSignals";
import type { DraftCandidate, DraftState, WrapSimulationSnapshot } from "@/lib/fantasy/types";

type ValuePocketBoardEntry = {
  playerId: string;
  boardRank: number;
  marketRank: number;
  structuralRank: number;
};

export type ValuePocketEntry = {
  playerId: string;
  score: number;
  adp: number;
  modelEdge: number;
  makeItBackProbability: number;
  tierSurvivalProbability: number;
  liveCall: LiveDraftCall;
  headline: string;
  summary: string;
};

function estimateSurvival(
  candidate: DraftCandidate,
  state: DraftState,
  wrap: WrapSimulationSnapshot,
) {
  const threatened = wrap.threatenedPlayers.find((player) => player.playerId === candidate.player.id);
  if (threatened) return Math.max(0.03, Math.min(0.97, 1 - threatened.lossProbability));
  const nextPick = state.currentPick + state.picksUntilNextTurn + 1;
  const cushion = candidate.market.adp - nextPick;
  return Math.max(0.05, Math.min(0.95, 0.5 + cushion / 34));
}

export function buildMiddleRoundValuePocket(args: {
  candidates: DraftCandidate[];
  state: DraftState;
  board: ValuePocketBoardEntry[];
  signals: Map<string, DraftBoardSignal>;
  quickScores: Map<string, DraftQuickScore>;
  wrap: WrapSimulationSnapshot;
}): ValuePocketEntry[] {
  const available = new Set(args.state.availablePlayerIds);
  const boardById = new Map(args.board.map((entry) => [entry.playerId, entry]));
  const runByPosition = new Map(
    args.wrap.positionSnapshots.map((snapshot) => [snapshot.position, snapshot] as const),
  );
  const myTeam = args.state.teams.find((team) => team.teamId === args.state.myTeamId);

  return args.candidates
    .filter((candidate) => available.has(candidate.player.id))
    .filter((candidate) => candidate.market.adp >= 37 && candidate.market.adp <= 120)
    .flatMap((candidate) => {
      const board = boardById.get(candidate.player.id);
      const signal = args.signals.get(candidate.player.id);
      const quickScore = args.quickScores.get(candidate.player.id);
      const position = candidate.player.positions[0] ?? "WR";
      if (!board || !signal || !quickScore) return [];
      if (signal.evidenceLabel === "Limited" || candidate.signals?.roleSecurity.label === "fragile") return [];
      if (quickScore.vorStars < 3 || signal.modelEdge < 2) return [];
      if (position === "TE" && signal.valueDeltaVsAdp < 4) return [];

      const makeItBackProbability = estimateSurvival(candidate, args.state, args.wrap);
      const run = runByPosition.get(position);
      const tierSurvivalProbability = run
        ? Math.max(0.05, Math.min(0.95, 1 - run.expectedSelections / Math.max(1, args.state.picksUntilNextTurn + 1)))
        : makeItBackProbability;
      const positionCount = myTeam?.positionCounts[position] ?? 0;
      const rosterFit = position === "QB" || position === "TE"
        ? positionCount >= 2 ? "blocked" : positionCount === 0 ? "need" : "open"
        : positionCount < 2 ? "need" : "open";
      const liveCall = buildLiveDraftCall({
        candidate,
        quickScore,
        signal,
        currentPick: args.state.currentPick,
        isMyTurn: args.state.picksUntilNextTurn === 0,
        makeItBackProbability,
        tierSurvivalProbability,
        rosterFit,
      });
      const distanceToRoom = Math.abs(candidate.market.adp - args.state.currentPick);
      const middleRoundAuthority = position === "RB" || position === "WR" ? 4 : position === "QB" ? 1 : 0;
      const score = Number((
        signal.modelEdge * 1.25 +
        signal.valueDeltaVsAdp * 0.7 +
        quickScore.vorStars * 3 +
        quickScore.cliffStars * 1.5 +
        (100 - signal.evidenceScore) * -0.04 +
        middleRoundAuthority -
        Math.max(0, distanceToRoom - 30) * 0.12 +
        (liveCall.action === "Smash Now" ? 12 : 0)
      ).toFixed(2));

      return [{
        playerId: candidate.player.id,
        score,
        adp: candidate.market.adp,
        modelEdge: signal.modelEdge,
        makeItBackProbability,
        tierSurvivalProbability,
        liveCall,
        headline: liveCall.action === "Smash Now" ? "Smash Now" : `${position} value pocket`,
        summary: `${signal.modelEdge > 0 ? "+" : ""}${signal.modelEdge} model edge · ${quickScore.vorStars}★ VOR · ${Math.round(makeItBackProbability * 100)}% chance to make it back.`,
      } satisfies ValuePocketEntry];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
