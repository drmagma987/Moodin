import {
  buildPickWindowSnapshot,
  buildWrapSimulationSnapshot,
  rankDraftCandidates,
} from "@/lib/fantasy/draft";
import { getSnakePickInfo } from "@/lib/fantasy/draftState";
import type {
  CandidateRecommendation,
  DraftCandidate,
  DraftPlanRule,
  DraftPlanSnapshot,
  DraftPlanTarget,
  DraftState,
  PlayerPosition,
  WrapSimulationSnapshot,
} from "@/lib/fantasy/types";

const FLEX_ELIGIBLE: PlayerPosition[] = ["RB", "WR", "TE"];

function countLeagueSlots(state: DraftState, slot: string) {
  return state.league.rosterSlots.filter((candidate) => candidate === slot).length;
}

function playerPosition(candidate: DraftCandidate) {
  return candidate.player.positions[0] ?? "WR";
}

function targetLabel(candidate: DraftCandidate, recommendation: CandidateRecommendation) {
  const position = playerPosition(candidate);
  const signals = candidate.signals;

  if (signals?.preferredTarget) {
    return signals.preferredTarget.label;
  }
  if (
    position === "RB" &&
    (signals?.roleSecurity.label === "secure" || signals?.expectedOpportunity.label === "strong")
  ) {
    return "Workload RB";
  }
  if (position === "WR" && recommendation.explanation.boardEdge >= 3) {
    return "WR value pocket";
  }
  if (
    (position === "QB" || position === "TE") &&
    recommendation.explanation.positionalLeverageScore >= 8 &&
    recommendation.explanation.medianTierEdge >= 10
  ) {
    return "Measured onesie leverage";
  }
  if (signals?.dossier.stance === "priority-target") {
    return "Conviction target";
  }
  if (recommendation.explanation.upsideDelta >= 45) {
    return "Ceiling swing";
  }

  return "Best live fit";
}

function targetSummary(candidate: DraftCandidate, recommendation: CandidateRecommendation) {
  const position = playerPosition(candidate);
  const reasons: string[] = [];

  if (recommendation.explanation.boardEdge >= 3) {
    reasons.push(`${recommendation.explanation.boardEdge} spots ahead of market`);
  }
  if (candidate.signals?.roleSecurity.label === "secure") {
    reasons.push("secure role");
  }
  if (candidate.signals?.expectedOpportunity.label === "strong") {
    reasons.push("strong expected workload");
  }
  if (recommendation.explanation.runRisk === "high") {
    reasons.push(`high ${position} run risk`);
  }
  if (
    (position === "QB" || position === "TE") &&
    recommendation.explanation.positionalLeverageScore >= 8
  ) {
    reasons.push(
      `${recommendation.explanation.medianTierEdge.toFixed(1)}-point positional tier edge`,
    );
  }
  if (candidate.signals?.dossier.stance === "priority-target") {
    reasons.push("high model conviction");
  }

  return reasons.length > 0
    ? `${position}: ${reasons.slice(0, 2).join("; ")}.`
    : `${position}: our board #${recommendation.explanation.ourBoardRank}, market #${recommendation.explanation.marketRank}.`;
}

function buildTargets(
  state: DraftState,
  pool: DraftCandidate[],
  recommendations: CandidateRecommendation[],
  wrapSimulation: WrapSimulationSnapshot,
) {
  const candidateById = new Map(pool.map((candidate) => [candidate.player.id, candidate] as const));
  const targets: DraftPlanTarget[] = [];
  const usedLabels = new Set<string>();

  for (const recommendation of recommendations.slice(0, 16)) {
    const candidate = candidateById.get(recommendation.playerId);
    if (!candidate) {
      continue;
    }

    const label = targetLabel(candidate, recommendation);
    const isTopThree = recommendations.slice(0, 3).some((entry) => entry.playerId === recommendation.playerId);
    if (!isTopThree && usedLabels.has(label)) {
      continue;
    }

    const window = buildPickWindowSnapshot(recommendation, state, pool, wrapSimulation);
    targets.push({
      playerId: recommendation.playerId,
      label,
      timing: window?.urgency ?? "can-wait",
      summary: targetSummary(candidate, recommendation),
    });
    usedLabels.add(label);

    if (targets.length === 4) {
      break;
    }
  }

  return targets;
}

export function buildDraftPlanSnapshot(
  state: DraftState,
  pool: DraftCandidate[],
  wrapSimulation = buildWrapSimulationSnapshot(state, pool),
): DraftPlanSnapshot {
  const round = getSnakePickInfo(state.currentPick, state.league.teams).round;
  const rosterRounds = state.league.rosterSlots.filter((slot) => slot !== "IR").length;
  const myTeam = state.teams.find((team) => team.teamId === state.myTeamId) ?? null;
  const counts = myTeam?.positionCounts ?? {};
  const rbCount = counts.RB ?? 0;
  const wrCount = counts.WR ?? 0;
  const qbCount = counts.QB ?? 0;
  const teCount = counts.TE ?? 0;
  const kCount = counts.K ?? 0;
  const dstCount = counts.DST ?? 0;
  const rbSlots = countLeagueSlots(state, "RB");
  const wrSlots = countLeagueSlots(state, "WR");
  const flexSlots = countLeagueSlots(state, "W/R/T");
  const qbSlots = countLeagueSlots(state, "QB");
  const teSlots = countLeagueSlots(state, "TE");
  const recommendations = rankDraftCandidates(state, pool, wrapSimulation);
  const topRecommendation = recommendations[0] ?? null;
  const topCandidate = pool.find((candidate) => candidate.player.id === topRecommendation?.playerId) ?? null;
  const topPosition = topCandidate ? playerPosition(topCandidate) : null;
  const topIsEliteOnesie = Boolean(
    topRecommendation &&
      (topPosition === "QB" || topPosition === "TE") &&
      topRecommendation.explanation.positionalLeverageScore >= 8 &&
      topRecommendation.explanation.medianTierEdge >= 10 &&
      (topRecommendation.explanation.boardEdge >= 0 || topRecommendation.explanation.runRisk === "high"),
  );

  const phase: DraftPlanSnapshot["phase"] =
    round <= 3
      ? "foundation"
      : round <= 6
        ? "core"
        : round <= 10
          ? "value"
          : round < Math.max(11, rosterRounds - 2)
            ? "upside"
            : "endgame";

  const phaseCopy: Record<
    DraftPlanSnapshot["phase"],
    Pick<DraftPlanSnapshot, "headline" | "objective">
  > = {
    foundation: {
      headline: "Build the weekly-volume foundation",
      objective: "Leave the opening with strong weekly volume. Take a onesie only when league-specific tier leverage and the conditional roster path justify the price.",
    },
    core: {
      headline: "Finish the starting core without chasing need",
      objective: "Use the middle rounds to deepen WR and RB, close any real starter gap, and keep leaning into model discounts.",
    },
    value: {
      headline: "Attack falling starters and asymmetric upside",
      objective: "The rigid opening structure is over. Let board edge, role quality, and tier pressure identify the best values.",
    },
    upside: {
      headline: "Draft paths to a league-winning outcome",
      objective: "Prefer contingent RB workloads, ascending receivers, and other ceiling cases over low-impact veteran depth.",
    },
    endgame: {
      headline: "Complete the roster at minimum opportunity cost",
      objective: "Fill required K/DST slots late and use every remaining bench spot on upside or direct roster insurance.",
    },
  };

  const rbTarget = Math.min(2, rbSlots);
  const wrCoreTarget = Math.max(wrSlots, Math.min(3, wrSlots + flexSlots));
  const rules: DraftPlanRule[] = [
    {
      id: "rb-foundation",
      label: `RB foundation (${rbCount}/${rbTarget})`,
      status: rbCount >= rbTarget ? "satisfied" : round <= 3 ? "attack" : "hold",
      summary:
        rbCount >= rbTarget
          ? "The opening RB checkpoint is covered; keep taking RB only when value or workload warrants it."
          : round <= 3
            ? "Prioritize a workload-backed RB when one is competitive with the best player available; do not force a bad price."
            : "The opening checkpoint was missed, so recover through value pockets and contingent workload rather than reaching.",
    },
    {
      id: "wr-core",
      label: `WR core (${wrCount}/${wrCoreTarget})`,
      status: wrCount >= wrCoreTarget ? "satisfied" : round <= 6 ? "attack" : "hold",
      summary:
        wrCount >= wrCoreTarget
          ? "The minimum receiver core is built, but this WR-heavy flex format still rewards useful depth."
          : round <= 6
            ? "Use the deep middle-round receiver pool to build weekly starts and flex strength."
            : "Keep hunting board discounts at WR; avoid filling the gap with low-ceiling volume alone.",
    },
    {
      id: "onesie-patience",
      label: `QB/TE patience (${qbCount} QB, ${teCount} TE)`,
      status:
        qbCount >= qbSlots && teCount >= teSlots
          ? "satisfied"
          : topIsEliteOnesie
            ? "attack"
            : round <= 6
              ? "hold"
              : "attack",
      summary:
        qbCount >= qbSlots && teCount >= teSlots
          ? "Both one-starter positions are covered; do not spend another meaningful pick on redundancy."
          : topIsEliteOnesie && topCandidate
            ? `${topCandidate.player.fullName} qualifies through a measured ${topRecommendation?.explanation.medianTierEdge.toFixed(1)}-point median tier edge and acceptable current price.`
            : round <= 6
              ? "Wait while replaceable QB/TE depth remains; the model will flag a projection-backed tier edge, run risk, or superior conditional roster path."
              : "Resolve any open QB/TE starter slot when the board offers fair value, without paying for a run after it happens.",
    },
    {
      id: "bench-upside",
      label: "Bench upside",
      status: phase === "upside" || phase === "endgame" ? "attack" : "hold",
      summary:
        phase === "upside" || phase === "endgame"
          ? "Favor contingent RB roles, ascending WRs, and direct handcuffs over low-ceiling bench points."
          : "Keep the bench flexible until the weekly core is established; avoid an early backup QB or TE.",
    },
    {
      id: "endgame",
      label:
        countLeagueSlots(state, "DST") > 0
          ? `K/DST endgame (${kCount} K, ${dstCount} DST)`
          : `K endgame (${kCount}/${countLeagueSlots(state, "K")})`,
      status: kCount > 0 && (dstCount > 0 || countLeagueSlots(state, "DST") === 0) ? "satisfied" : phase === "endgame" ? "attack" : "hold",
      summary:
        phase === "endgame"
          ? "Fill configured specialist slots now, ideally after the final meaningful RB/WR upside bet."
          : `Do not spend an early or middle-round pick on ${countLeagueSlots(state, "DST") > 0 ? "K/DST" : "K"} while skill-position upside remains.`,
    },
  ];

  const rosterPositions = [
    `${rbCount} RB`,
    `${wrCount} WR`,
    `${qbCount} QB`,
    `${teCount} TE`,
  ].join(" · ");

  return {
    phase,
    round,
    ...phaseCopy[phase],
    rosterRead: `${rosterPositions}. ${myTeam?.openSlots.length ?? 0} starter/flex slots remain open.`,
    formatRead: `${state.league.teams}-team, ${qbSlots}QB, ${wrSlots}WR, ${rbSlots}RB, ${teSlots}TE, ${flexSlots} flex. ${FLEX_ELIGIBLE.join("/")} depth carries extra utility.`,
    rules,
    targets: buildTargets(state, pool, recommendations, wrapSimulation),
  };
}
