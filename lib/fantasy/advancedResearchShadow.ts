import { buildRedraftBoard } from "@/lib/fantasy/draft";
import { scoreStatProjection } from "@/lib/fantasy/scoring";
import { rookieWrValidation } from "@/lib/fantasy/data/rookieWrValidation.generated";
import type {
  AdvancedResearchComponent,
  DraftCandidate,
  LeagueConfig,
  StatProjection,
} from "@/lib/fantasy/types";

export type AdvancedResearchShadowEntry = {
  playerId: string;
  currentRank: number;
  shadowRank: number;
  movement: number;
  currentMedian: number;
  shadowMedian: number;
  medianDelta: number;
  appliedPercent: number;
  status: "complete-profile" | "partial-profile";
  productionEligible: false;
  explanation: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function componentDirection(component: AdvancedResearchComponent | undefined) {
  return component?.score === null || component?.score === undefined
    ? 0
    : clamp((component.score - 50) / 50, -1, 1);
}

function scaleStat(stats: StatProjection, key: keyof StatProjection, percent: number) {
  const value = stats[key];
  if (value === undefined) return;
  stats[key] = Number((value * (1 + percent)).toFixed(3));
}

export function buildAdvancedResearchAdjustedStats(
  candidate: DraftCandidate,
  options?: {
    rookieWrAdjustment?: {
      efficiencyWeight: number;
      opportunityWeight: number;
      maxPercent: number;
    };
  },
) {
  const research = candidate.advancedResearch!;
  const stats = { ...candidate.projection.stats };

  if (research.lane === "qb") {
    const passing = componentDirection(
      research.components.find((component) => component.key === "passing-efficiency"),
    );
    const touchdownRegression = componentDirection(
      research.components.find((component) => component.key === "td-regression"),
    );
    const rushing = componentDirection(
      research.components.find((component) => component.key === "rushing-baseline"),
    );
    scaleStat(stats, "passingYards", passing * 0.025 * research.coverage);
    scaleStat(stats, "passingTouchdowns", touchdownRegression * 0.03 * research.coverage);
    scaleStat(stats, "rushingYards", rushing * 0.05 * research.coverage);
    scaleStat(stats, "rushingTouchdowns", rushing * 0.035 * research.coverage);
    return stats;
  }

  // Per-opportunity efficiency is the primary novel signal. College workload is
  // deliberately secondary so talented committee players are not treated as weak
  // prospects merely because they shared touches. Situation, market projections,
  // and draft capital confirm the profile but are not double-applied here.
  const efficiency = componentDirection(
    research.components.find((component) => component.key === "college-efficiency"),
  );
  const opportunity = componentDirection(
    research.components.find((component) => component.key === "college-opportunity"),
  );
  const rookieWrAdjustment = options?.rookieWrAdjustment ?? rookieWrValidation.selectedAdjustment;
  const cap = research.lane === "rookie-rb"
    ? 0.04
    : research.lane === "rookie-wr"
      ? rookieWrAdjustment.maxPercent
      : 0.03;
  const efficiencyWeight = research.lane === "rookie-wr"
    ? rookieWrAdjustment.efficiencyWeight
    : 0.8;
  const percent = (
    efficiency * efficiencyWeight
    + opportunity * (1 - efficiencyWeight)
  ) * cap * research.coverage;
  if (research.lane === "rookie-rb") {
    scaleStat(stats, "rushingYards", percent);
    scaleStat(stats, "rushingTouchdowns", percent * 0.75);
    scaleStat(stats, "receptions", percent * 0.7);
    scaleStat(stats, "receivingYards", percent * 0.7);
    scaleStat(stats, "receivingTouchdowns", percent * 0.5);
  } else {
    scaleStat(stats, "receptions", percent);
    scaleStat(stats, "receivingYards", percent);
    scaleStat(stats, "receivingTouchdowns", percent * 0.75);
  }
  return stats;
}

function scoringLabel(league: LeagueConfig) {
  const rules = league.scoring;
  return `${rules.passingTouchdownPoints}-pt pass TD, ${rules.receptionPoints}-PPR, +${rules.yardageBonuses?.passing300 ?? 0} per 300-yard passing game`;
}

export function buildAdvancedResearchShadowBoard(
  candidates: DraftCandidate[],
  league: LeagueConfig,
) {
  const currentBoard = buildRedraftBoard(candidates, league);
  const currentById = new Map(currentBoard.map((entry) => [entry.playerId, entry]));
  const percentById = new Map<string, number>();

  const shadowCandidates = candidates.map((candidate) => {
    const research = candidate.advancedResearch;
    if (!research || research.researchScore === null) return candidate;
    if (research.status !== "backtest-ready") {
      percentById.set(candidate.player.id, 0);
      return candidate;
    }

    const stats = buildAdvancedResearchAdjustedStats(candidate);
    const currentPoints = scoreStatProjection(candidate.projection.stats, league.scoring, {
      explicitMilestoneGamesOnly: true,
    });
    const adjustedPoints = scoreStatProjection(stats, league.scoring, {
      explicitMilestoneGamesOnly: true,
    });
    const delta = Number((adjustedPoints - currentPoints).toFixed(2));
    const percent = currentPoints > 0 ? delta / currentPoints : 0;
    percentById.set(candidate.player.id, percent);
    return {
      ...candidate,
      projection: {
        ...candidate.projection,
        stats,
        range: {
          p10: Number((candidate.projection.range.p10 + delta * 0.75).toFixed(2)),
          p50: Number((candidate.projection.range.p50 + delta).toFixed(2)),
          p90: Number((candidate.projection.range.p90 + delta * 1.25).toFixed(2)),
        },
      },
    } satisfies DraftCandidate;
  });

  const shadowBoard = buildRedraftBoard(shadowCandidates, league);
  const shadowById = new Map(shadowBoard.map((entry) => [entry.playerId, entry]));
  const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
  const shadowCandidateById = new Map(shadowCandidates.map((candidate) => [candidate.player.id, candidate]));

  return [...percentById].flatMap(([playerId, appliedPercent]) => {
    const current = currentById.get(playerId);
    const shadow = shadowById.get(playerId);
    const candidate = candidateById.get(playerId);
    const shadowCandidate = shadowCandidateById.get(playerId);
    if (!current || !shadow || !candidate || !shadowCandidate || !candidate.advancedResearch) return [];
    const movement = current.boardRank - shadow.boardRank;
    const medianDelta = shadowCandidate.projection.range.p50 - candidate.projection.range.p50;
    return [{
      playerId,
      currentRank: current.boardRank,
      shadowRank: shadow.boardRank,
      movement,
      currentMedian: candidate.projection.range.p50,
      shadowMedian: shadowCandidate.projection.range.p50,
      medianDelta: Number(medianDelta.toFixed(2)),
      appliedPercent: Number(appliedPercent.toFixed(4)),
      status: candidate.advancedResearch.status === "backtest-ready" ? "complete-profile" : "partial-profile",
      productionEligible: false as const,
      explanation: candidate.advancedResearch.status === "backtest-ready"
        ? `Experimental stat-line adjustment rescored under ${scoringLabel(league)}. Milestone bonuses require explicit projected qualifying-game counts; none are inferred from season totals.`
        : "No shadow adjustment is applied because critical research evidence is missing.",
    }];
  }).sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement) || a.currentRank - b.currentRank);
}
