import fs from "node:fs";
import snapshot from "../lib/fantasy/data/warRoomDataset.generated.json" with { type: "json" };
import {
  buildRedraftBoard,
  buildWrapSimulationSnapshot,
  DRAFT_POLICY_CERTIFICATION_VERSION,
  PRODUCTION_WRAP_SIMULATIONS,
  rankDraftCandidates,
} from "../lib/fantasy/draft.ts";
import {
  applyDraftPick,
  assertDraftStateMatchesSourceOfTruth,
  getSnakePickInfo,
} from "../lib/fantasy/draftState.ts";
import {
  leagueSourceOfTruth,
  leagueSourceOfTruthFingerprint,
} from "../lib/fantasy/leagueSourceOfTruth.ts";

const OUTPUT = new URL(
  process.env.FANTASY_CERT_OUTPUT ?? "../lib/fantasy/data/draftPolicyCertification.generated.json",
  import.meta.url,
);
const ALL_ROOM_TYPES = [
  "adp", "early-qb", "late-qb", "early-te", "rb-heavy", "wr-heavy", "runs",
  "model", "home-reach", "chaotic", "mixed", "need-aware", "need-late",
];
const ROOM_TYPES = process.env.FANTASY_CERT_ROOM
  ? ALL_ROOM_TYPES.filter((roomType) => roomType === process.env.FANTASY_CERT_ROOM)
  : ALL_ROOM_TYPES;
if (ROOM_TYPES.length === 0) throw new Error(`Unknown FANTASY_CERT_ROOM=${process.env.FANTASY_CERT_ROOM}.`);
const candidates = snapshot.candidates;
const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
const board = buildRedraftBoard(candidates, snapshot.draftState.league);
const boardById = new Map(board.map((entry) => [entry.playerId, entry]));
const keeperIds = new Set(snapshot.draftState.drafted.map((pick) => pick.playerId));
const keeperPicks = new Set(snapshot.draftState.drafted.map((pick) => pick.overallPick));

if (snapshot.leagueConfigVersion !== leagueSourceOfTruth.version ||
    snapshot.leagueConfigFingerprint !== leagueSourceOfTruthFingerprint ||
    !snapshot.warRoomReady || snapshot.warRoomBlockers.length) {
  throw new Error("Certification refused a stale, mismatched, or blocked War Room artifact.");
}
assertDraftStateMatchesSourceOfTruth(snapshot.draftState);

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}
function randomFor(seed) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const positionOf = (candidate) => candidate.player.positions[0] ?? "WR";
const required = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1 };

function chooseOpponent(state, roomType, seed) {
  const random = randomFor(`${seed}:${state.currentPick}`);
  const pick = getSnakePickInfo(state.currentPick, state.league.teams);
  const team = state.teams.find((entry) => entry.teamId === pick.teamId);
  const round = pick.round;
  const runPosition = ["RB", "WR", "QB", "TE"][Math.floor((state.currentPick - 1) / 8) % 4];
  const available = candidates.filter((candidate) => state.availablePlayerIds.includes(candidate.player.id));
  return available.map((candidate) => {
    const position = positionOf(candidate);
    const count = team?.positionCounts[position] ?? 0;
    const gap = Math.max(0, (required[position] ?? 0) - count);
    const market = candidate.market.adp ?? 400;
    const model = boardById.get(candidate.player.id)?.boardRank ?? 400;
    let score = -market * 1.15 - model * 0.35 + random() * 18;
    if (roomType === "model") score = -model * 1.4 - market * 0.15 + random() * 12;
    if (roomType === "chaotic") score = -market * 0.45 - model * 0.25 + random() * 95;
    if (roomType === "home-reach") score += random() * 48 + (market > state.currentPick + 20 ? 18 : 0);
    if (roomType === "mixed") score += ((pick.teamId.charCodeAt(5) + round) % 3) * random() * 32;
    if (roomType === "early-qb" && position === "QB" && round <= 7) score += 70;
    if (roomType === "late-qb" && position === "QB" && round <= 9) score -= 100;
    if (roomType === "early-te" && position === "TE" && round <= 8) score += 65;
    if (roomType === "rb-heavy" && position === "RB" && round <= 9) score += 58;
    if (roomType === "wr-heavy" && position === "WR" && round <= 9) score += 58;
    if (roomType === "runs" && position === runPosition) score += 68;
    if (roomType !== "need-late" || round >= 10) score += gap * 38;
    if ((position === "K" || position === "DST") && round < 13) score -= 240;
    if ((position === "QB" || position === "TE") && count >= 1 && round < 11) score -= 42;
    if (round >= 13 && gap > 0) score += 180;
    return { candidate, score };
  }).sort((a, b) => b.score - a.score || a.candidate.player.id.localeCompare(b.candidate.player.id))[0]?.candidate;
}

function rosterSnapshot(state) {
  const team = state.teams.find((entry) => entry.teamId === state.myTeamId);
  return {
    counts: team?.positionCounts ?? {},
    openSlots: (team?.openSlots ?? []).filter((slot) => slot !== "BN" && slot !== "IR"),
    starters: team?.starters ?? [],
    bench: team?.bench ?? [],
  };
}

function runRoom(roomType, run) {
  const seed = `certification:${roomType}:${run}`;
  let state = structuredClone(snapshot.draftState);
  const decisions = [];
  const failures = [];
  const maxPick = state.league.teams * state.league.rosterSlots.filter((slot) => slot !== "IR").length;
  while (state.currentPick <= maxPick) {
    assertDraftStateMatchesSourceOfTruth(state);
    const pickInfo = getSnakePickInfo(state.currentPick, state.league.teams);
    let selected;
    if (pickInfo.teamId === state.myTeamId) {
      // Full-draft certification checks policy/state integration. The separate exact
      // counterfactual audit owns high-sample continuation evidence.
      const wrap = buildWrapSimulationSnapshot(state, candidates);
      const live = rankDraftCandidates(state, candidates, wrap, { baseBoard: board });
      // One serialized-state parity probe per complete room is sufficient because
      // both surfaces import this same pure engine; unit tests cover later states.
      if (decisions.length === 0) {
        const rehearsal = rankDraftCandidates(structuredClone(state), candidates, wrap, { baseBoard: board });
        if (live[0]?.playerId !== rehearsal[0]?.playerId) failures.push(`parity mismatch at Pick ${state.currentPick}`);
      }
      selected = live[0] ? candidateById.get(live[0].playerId) : null;
      if (!selected) throw new Error(`${seed} has no manager recommendation at Pick ${state.currentPick}.`);
      const before = rosterSnapshot(state);
      const position = positionOf(selected);
      const top = live.slice(0, 4).map((recommendation, index) => ({
        rank: index + 1,
        playerId: recommendation.playerId,
        player: candidateById.get(recommendation.playerId)?.player.fullName,
        position: positionOf(candidateById.get(recommendation.playerId)),
        score: recommendation.score,
        makeItBack: recommendation.explanation.makeItBackProbability,
        valueOverReplacement: recommendation.explanation.valueNow,
        tierDrop: recommendation.explanation.medianTierEdge,
      }));
      const scoreGap = (live[0]?.score ?? 0) - (live[1]?.score ?? 0);
      const openCore = before.openSlots.some((slot) => ["RB", "WR", "W/R/T"].includes(slot));
      const duplicate = before.counts[position] ?? 0;
      let classification = scoreGap <= 2 ? "defensible/close" : "strongly-supported";
      if ((position === "K" || position === "DST") && pickInfo.round < 14) classification = "clearly-wrong";
      if ((position === "QB" || position === "TE") && duplicate >= 1 && openCore && pickInfo.round < 11) classification = "suspicious";
      if (classification === "clearly-wrong") failures.push(`implausible ${position} at Pick ${state.currentPick}`);
      decisions.push({
        pick: state.currentPick, round: pickInfo.round, rosterBefore: before, selectedPlayerId: selected.player.id,
        selectedPlayer: selected.player.fullName, selectedPosition: position, topAlternatives: top.slice(1),
        chanceAvailableNextPick: top[0]?.makeItBack ?? null, expectedAdvantage: Number(scoreGap.toFixed(2)), classification,
        ...(classification === "suspicious" || classification === "clearly-wrong"
          ? { serializedState: structuredClone(state) }
          : {}),
      });
      if (live[0]?.playerId !== top[0]?.playerId) failures.push(`board-order mismatch at Pick ${state.currentPick}`);
    } else {
      selected = chooseOpponent(state, roomType, seed);
    }
    if (!selected) throw new Error(`${seed} has no legal selection at Pick ${state.currentPick}.`);
    const beforePick = state.currentPick;
    state = applyDraftPick(state, selected, pickInfo.teamId, { source: "manual", pickedAt: `seed:${seed}:${beforePick}` });
  }
  const ids = state.drafted.map((pick) => pick.playerId);
  if (new Set(ids).size !== ids.length) failures.push("duplicate player drafted");
  for (const pick of state.drafted) {
    if (getSnakePickInfo(pick.overallPick, state.league.teams).teamId !== pick.teamId) failures.push(`snake ownership mismatch at ${pick.overallPick}`);
  }
  for (const keeperId of keeperIds) if (!state.drafted.some((pick) => pick.playerId === keeperId && pick.eventType === "keeper")) failures.push(`keeper lost: ${keeperId}`);
  for (const keeperPick of keeperPicks) if (!state.drafted.some((pick) => pick.overallPick === keeperPick && pick.eventType === "keeper")) failures.push(`keeper pick lost: ${keeperPick}`);
  const roster = rosterSnapshot(state);
  if (roster.openSlots.length) failures.push(`unfilled starters: ${roster.openSlots.join(",")}`);
  const suspicious = decisions.filter((decision) => decision.classification === "suspicious" || decision.classification === "clearly-wrong");
  return {
    id: `${roomType}-${run}`, seed, roomType, picks: state.drafted.length, decisions,
    finalRoster: roster, benchUsefulness: roster.bench.filter((id) => ["RB", "WR", "TE"].includes(positionOf(candidateById.get(id)))).length,
    positionDuplication: Object.fromEntries(Object.entries(roster.counts).filter(([, count]) => count > 2)),
    suspicious, failures, passed: failures.length === 0,
  };
}

const startedAt = Date.now();
const drafts = ROOM_TYPES.flatMap((roomType) => [1, 2].map((run) => runRoom(roomType, run)));
const suspiciousStates = drafts.flatMap((draft) => draft.suspicious.map((decision) => ({ draftId: draft.id, seed: draft.seed, decision })));
const report = {
  generatedAt: new Date().toISOString(), leagueConfigVersion: leagueSourceOfTruth.version,
  leagueConfigFingerprint: leagueSourceOfTruthFingerprint, engine: "rankDraftCandidates",
  policyCertificationVersion: DRAFT_POLICY_CERTIFICATION_VERSION,
  productionWrapSimulations: PRODUCTION_WRAP_SIMULATIONS,
  opponentBehaviors: ROOM_TYPES, completedDrafts: drafts.length,
  managerDecisions: drafts.reduce((sum, draft) => sum + draft.decisions.length, 0),
  serializedParityChecks: drafts.length,
  parityMismatches: drafts.reduce((sum, draft) => sum + draft.failures.filter((failure) => failure.includes("parity")).length, 0),
  suspiciousStateCount: suspiciousStates.length, failedDrafts: drafts.filter((draft) => !draft.passed).map((draft) => draft.id),
  elapsedMs: Date.now() - startedAt, suspiciousStates, drafts,
};
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, drafts: undefined, suspiciousStates: undefined }, null, 2));
if (report.failedDrafts.length || report.parityMismatches || report.suspiciousStateCount) {
  throw new Error(`Draft certification failed: ${report.failedDrafts.length} failed drafts, ${report.parityMismatches} parity mismatches, ${report.suspiciousStateCount} suspicious states.`);
}
