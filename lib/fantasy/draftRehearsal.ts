import { getSnakePickInfo } from "@/lib/fantasy/draftState";
import {
  appendDraftSessionPick,
  createDraftSession,
  replayDraftSession,
  type DraftSession,
} from "@/lib/fantasy/draftSession";
import type { DraftCandidate, DraftState, PlayerPosition } from "@/lib/fantasy/types";

export type DraftRehearsalScenarioId =
  | "normal-room"
  | "rb-avalanche"
  | "onesie-run"
  | "target-wipe"
  | "heavy-keepers";

export type DraftRehearsalInputMode = "manual" | "auto-sync" | "recovery";

export type DraftRehearsalScenario = {
  id: DraftRehearsalScenarioId;
  title: string;
  summary: string;
  syntheticKeepers: boolean;
};

export type DraftRehearsalMetrics = {
  startedAt: string;
  completedAt: string | null;
  manualEntries: number;
  autoEntries: number;
  recoveredEntries: number;
  mismatches: number;
  rejectedEvents: number;
  recoveryDrills: number;
  reloadRecoveries: number;
  userPicks: number;
  recommendationDeviations: number;
  entryLatencyMs: number[];
  recommendationLatencyMs: number[];
};

export type DraftRehearsalQueueEntry = {
  overallPick: number;
  playerId: string;
  playerName: string;
  teamId: string;
};

export const draftRehearsalScenarios: DraftRehearsalScenario[] = [
  { id: "normal-room", title: "Normal room", summary: "Market-shaped drafting with modest roster-need pressure.", syntheticKeepers: false },
  { id: "rb-avalanche", title: "RB avalanche", summary: "Opponents aggressively pull running backs ahead of market.", syntheticKeepers: false },
  { id: "onesie-run", title: "QB/TE run", summary: "Quarterbacks and tight ends disappear earlier than expected.", syntheticKeepers: false },
  { id: "target-wipe", title: "Target wipe", summary: "The room attacks the top of the available market board with little mercy.", syntheticKeepers: false },
  { id: "heavy-keepers", title: "Heavy keeper room", summary: "Synthetic opponent keepers consume early selections before live practice begins.", syntheticKeepers: true },
];

export function createDraftRehearsalMetrics(now = new Date().toISOString()): DraftRehearsalMetrics {
  return {
    startedAt: now,
    completedAt: null,
    manualEntries: 0,
    autoEntries: 0,
    recoveredEntries: 0,
    mismatches: 0,
    rejectedEvents: 0,
    recoveryDrills: 0,
    reloadRecoveries: 0,
    userPicks: 0,
    recommendationDeviations: 0,
    entryLatencyMs: [],
    recommendationLatencyMs: [],
  };
}

function stableRandom(seed: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function pickForRound(round: number, slot: number, teams: number) {
  const pickInRound = round % 2 === 1 ? slot : teams - slot + 1;
  return (round - 1) * teams + pickInRound;
}

function scenarioPositionBonus(scenario: DraftRehearsalScenarioId, position: PlayerPosition) {
  if (scenario === "rb-avalanche" && position === "RB") return 72;
  if (scenario === "onesie-run" && (position === "QB" || position === "TE")) return 68;
  if (scenario === "target-wipe" && ["RB", "WR", "TE"].includes(position)) return 22;
  return 0;
}

export function selectRehearsalOpponentPick(input: {
  state: DraftState;
  candidates: DraftCandidate[];
  scenario: DraftRehearsalScenarioId;
  seed: string;
}) {
  const pickInfo = getSnakePickInfo(input.state.currentPick, input.state.league.teams);
  const team = input.state.teams.find((item) => item.teamId === pickInfo.teamId);
  const available = new Set(input.state.availablePlayerIds);
  return input.candidates
    .filter((candidate) => available.has(candidate.player.id))
    .map((candidate) => {
      const position = primaryPosition(candidate);
      const exactNeed = team?.openSlots.includes(position) ?? false;
      const flexNeed = ["RB", "WR", "TE"].includes(position) && (team?.openSlots.includes("W/R/T") ?? false);
      const rosterNeed = exactNeed ? 52 : flexNeed ? 24 : 0;
      const specialistPenalty = (position === "K" || position === "DST") && input.state.currentPick < input.state.league.teams * 12 ? 160 : 0;
      const marketScore = 420 - Math.min(candidate.market.adp ?? 400, 400) * 2.25;
      const noise = stableRandom(`${input.seed}:${input.scenario}:${input.state.currentPick}:${candidate.player.id}`) * 34;
      return {
        candidate,
        score: marketScore + rosterNeed + scenarioPositionBonus(input.scenario, position) + noise - specialistPenalty,
      };
    })
    .sort((a, b) => b.score - a.score || a.candidate.player.id.localeCompare(b.candidate.player.id))[0]?.candidate ?? null;
}

export function createDraftRehearsalScenario(input: {
  initialState: DraftState;
  candidates: DraftCandidate[];
  scenario: DraftRehearsalScenarioId;
  seed: string;
}) {
  let session = createDraftSession(input.initialState);
  let state = replayDraftSession(session, input.candidates, input.initialState);
  const receipts: string[] = [];
  if (input.scenario === "heavy-keepers") {
    const keeperTeams = [1, 2, 3, 4];
    for (const slot of keeperTeams) {
      for (const round of [1, 2]) {
        const candidate = selectRehearsalOpponentPick({
          state,
          candidates: input.candidates,
          scenario: "target-wipe",
          seed: `${input.seed}:keeper:${slot}:${round}`,
        });
        if (!candidate) continue;
        const result = appendDraftSessionPick(session, input.candidates, state, {
          overallPick: pickForRound(round, slot, state.league.teams),
          playerId: candidate.player.id,
          eventType: "keeper",
          source: "manual",
          note: "Synthetic rehearsal keeper",
        });
        session = result.session;
        state = result.state;
        receipts.push(...result.receipts);
      }
    }
  }
  return { session, state, receipts };
}

export function buildDraftRehearsalQueue(input: {
  session: DraftSession;
  state: DraftState;
  candidates: DraftCandidate[];
  scenario: DraftRehearsalScenarioId;
  seed: string;
  count: number;
  stopAtManagerTurn?: boolean;
}) {
  let session = input.session;
  let state = input.state;
  const queue: DraftRehearsalQueueEntry[] = [];
  for (let index = 0; index < input.count; index += 1) {
    const info = getSnakePickInfo(state.currentPick, state.league.teams);
    if (input.stopAtManagerTurn && info.teamId === state.myTeamId) break;
    const candidate = selectRehearsalOpponentPick({
      state,
      candidates: input.candidates,
      scenario: input.scenario,
      seed: `${input.seed}:queue:${index}`,
    });
    if (!candidate) break;
    const overallPick = state.currentPick;
    const result = appendDraftSessionPick(session, input.candidates, state, {
      overallPick,
      playerId: candidate.player.id,
      source: "manual",
      note: "Simulated rehearsal pick",
    });
    queue.push({
      overallPick,
      playerId: candidate.player.id,
      playerName: candidate.player.fullName,
      teamId: info.teamId,
    });
    session = result.session;
    state = result.state;
  }
  return { queue, resultingSession: session, resultingState: state };
}

export function summarizeDraftRehearsal(metrics: DraftRehearsalMetrics) {
  const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const averageEntryMs = average(metrics.entryLatencyMs);
  const averageRecommendationMs = average(metrics.recommendationLatencyMs);
  const integrityScore = Math.max(0, 100 - metrics.mismatches * 8);
  const exercisedCoreRecovery = metrics.manualEntries >= 2
    && metrics.recoveredEntries >= 1
    && metrics.reloadRecoveries >= 1
    && metrics.rejectedEvents >= 1
    && metrics.recommendationLatencyMs.length >= 1;
  return {
    integrityScore,
    averageEntryMs,
    averageRecommendationMs,
    ready: exercisedCoreRecovery
      && integrityScore >= 90
      && averageEntryMs <= 4000
      && averageRecommendationMs <= 1000,
    summary: `${integrityScore}/100 operational integrity · ${(averageEntryMs / 1000).toFixed(1)}s average manual entry · ${averageRecommendationMs.toFixed(0)}ms advice refresh.`,
  };
}
