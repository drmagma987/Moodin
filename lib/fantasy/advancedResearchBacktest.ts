export type AdvancedResearchBacktestRow = {
  playerId: string;
  season: number;
  lane: "qb" | "rookie-rb" | "rookie-wr" | "rookie-te";
  actualPpg: number;
  marketBaselinePpg: number;
  researchModelPpg: number;
  hitThresholdPpg: number;
};

export type AdvancedResearchBacktestReport = {
  lane: AdvancedResearchBacktestRow["lane"];
  samples: number;
  seasons: number[];
  marketMae: number;
  researchMae: number;
  maeImprovement: number;
  marketHitAccuracy: number;
  researchHitAccuracy: number;
  hitAccuracyLift: number;
  activationEligible: boolean;
  blockers: string[];
};

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function accuracy(rows: AdvancedResearchBacktestRow[], key: "marketBaselinePpg" | "researchModelPpg") {
  return mean(rows.map((row) =>
    (row[key] >= row.hitThresholdPpg) === (row.actualPpg >= row.hitThresholdPpg) ? 1 : 0,
  ));
}

export function evaluateAdvancedResearchBacktest(
  lane: AdvancedResearchBacktestRow["lane"],
  rows: AdvancedResearchBacktestRow[],
  options?: { minSamples?: number; minSeasons?: number; minMaeImprovement?: number; minHitLift?: number },
) {
  const laneRows = rows.filter((row) => row.lane === lane);
  const seasons = [...new Set(laneRows.map((row) => row.season))].sort();
  const marketMae = mean(laneRows.map((row) => Math.abs(row.marketBaselinePpg - row.actualPpg)));
  const researchMae = mean(laneRows.map((row) => Math.abs(row.researchModelPpg - row.actualPpg)));
  const maeImprovement = marketMae === 0 ? 0 : (marketMae - researchMae) / marketMae;
  const marketHitAccuracy = accuracy(laneRows, "marketBaselinePpg");
  const researchHitAccuracy = accuracy(laneRows, "researchModelPpg");
  const hitAccuracyLift = researchHitAccuracy - marketHitAccuracy;
  const minSamples = options?.minSamples ?? (lane === "qb" ? 120 : 150);
  const minSeasons = options?.minSeasons ?? 5;
  const minMaeImprovement = options?.minMaeImprovement ?? 0.05;
  const minHitLift = options?.minHitLift ?? 0.03;
  const blockers = [
    ...(laneRows.length < minSamples ? [`Needs ${minSamples - laneRows.length} more out-of-sample player seasons.`] : []),
    ...(seasons.length < minSeasons ? [`Needs ${minSeasons - seasons.length} more held-out seasons.`] : []),
    ...(maeImprovement < minMaeImprovement ? [`MAE improvement ${(maeImprovement * 100).toFixed(1)}% is below the ${(minMaeImprovement * 100).toFixed(1)}% threshold.`] : []),
    ...(hitAccuracyLift < minHitLift ? [`Hit-rate lift ${(hitAccuracyLift * 100).toFixed(1)} points is below the ${(minHitLift * 100).toFixed(1)}-point threshold.`] : []),
  ];
  return {
    lane,
    samples: laneRows.length,
    seasons,
    marketMae: Number(marketMae.toFixed(3)),
    researchMae: Number(researchMae.toFixed(3)),
    maeImprovement: Number(maeImprovement.toFixed(4)),
    marketHitAccuracy: Number(marketHitAccuracy.toFixed(4)),
    researchHitAccuracy: Number(researchHitAccuracy.toFixed(4)),
    hitAccuracyLift: Number(hitAccuracyLift.toFixed(4)),
    activationEligible: blockers.length === 0,
    blockers,
  } satisfies AdvancedResearchBacktestReport;
}
