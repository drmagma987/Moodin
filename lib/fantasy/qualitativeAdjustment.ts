import type {
  CandidateQualitativeAdjustmentSnapshot,
  DraftCandidate,
  QualitativeContextSignal,
} from "@/lib/fantasy/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sourceSupport(candidate: DraftCandidate, signal: QualitativeContextSignal) {
  return new Set(
    candidate.context?.qualitative?.evidence
      .filter((evidence) => evidence.kind === "player-outlook" && evidence.signals.includes(signal))
      .map((evidence) => evidence.source) ?? [],
  ).size;
}

function hasImminentReturn(candidate: DraftCandidate) {
  const estimatedReturn = candidate.context?.qualitative?.evidence.find((evidence) => evidence.estimatedReturn)?.estimatedReturn;
  if (!estimatedReturn || !candidate.context?.qualitative) return false;
  const [month, day, year] = estimatedReturn.split("/").map(Number);
  if (!month || !day || !year) return false;
  const days = (Date.UTC(year, month - 1, day) - Date.parse(candidate.context.qualitative.capturedAt)) / 86_400_000;
  return days >= 0 && days <= 7;
}

export function buildQualitativeAdjustment(
  candidate: DraftCandidate,
  baselineMedian: number,
  enabled = true,
): CandidateQualitativeAdjustmentSnapshot {
  const qualitative = candidate.context?.qualitative;
  if (!enabled || !qualitative || candidate.context?.source !== "qualitative-snapshot") {
    return {
      direction: "none",
      percentDelta: 0,
      pointsDelta: 0,
      applied: false,
      drivers: [],
      summary: qualitative
        ? "Qualitative evidence is visible, but it does not override manager-reviewed or manual context."
        : "No qualitative projection correction is available.",
    };
  }

  let percentDelta = 0;
  const drivers: string[] = [];
  const add = (delta: number, reason: string) => {
    percentDelta += delta;
    drivers.push(reason);
  };

  if (candidate.context.healthStatus === "active-concern") {
    add(-0.04, "A current source explicitly identifies an active availability concern.");
  } else if (candidate.context.healthStatus === "recovering") {
    if (hasImminentReturn(candidate)) {
      drivers.push("A current source lists a short-term recovery item with an imminent estimated return; no projection penalty was applied.");
    } else {
      add(-0.022, "A current source identifies an injury recovery item.");
    }
  }
  if (candidate.context.currentRole === "competition" && sourceSupport(candidate, "role-competition") > 0) {
    add(-0.018, "At least one player outlook identifies material role competition.");
  }
  if (
    candidate.context.trackRecord === "limited-sample" &&
    sourceSupport(candidate, "limited-sample") > 0 &&
    sourceSupport(candidate, "established-production") === 0
  ) {
    add(-0.008, "The relevant NFL production sample remains limited.");
  }
  if (candidate.context.environment === "weak" && sourceSupport(candidate, "environment-weak") > 0) {
    add(-0.007, "Player-specific analysis flags supporting-cast or offensive-environment risk.");
  }
  if (qualitative.conflicts.length > 0) {
    add(-0.005, "Conflicting qualitative claims widen the downside case.");
  }
  if (sourceSupport(candidate, "role-secure") >= 2) {
    add(0.012, "Multiple player outlooks corroborate a secure featured role.");
  }
  if (sourceSupport(candidate, "role-expansion") >= 1 && candidate.context.currentRole !== "competition") {
    add(0.009, "A player outlook identifies an expanding 2026 workload.");
  }
  if (sourceSupport(candidate, "environment-strong") >= 2) {
    add(0.006, "Multiple player outlooks support a favorable offensive environment.");
  }

  percentDelta = clamp(percentDelta, -0.05, 0.03);
  const pointsDelta = Number((baselineMedian * percentDelta).toFixed(2));
  const roundedPercent = Number((percentDelta * 100).toFixed(2));
  return {
    direction: pointsDelta > 0.05 ? "up" : pointsDelta < -0.05 ? "down" : "none",
    percentDelta: roundedPercent,
    pointsDelta,
    applied: Math.abs(pointsDelta) > 0.05,
    drivers: drivers.slice(0, 4),
    summary:
      Math.abs(pointsDelta) <= 0.05
        ? "The qualitative snapshot adds context but no projection change under the bounded rules."
        : `Qualitative context changes the median ${pointsDelta > 0 ? "+" : ""}${pointsDelta.toFixed(1)} points (${roundedPercent > 0 ? "+" : ""}${roundedPercent.toFixed(1)}%).`,
  };
}
