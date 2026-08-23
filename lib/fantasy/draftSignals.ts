import type { DraftCandidate } from "@/lib/fantasy/types";

export type DraftValueLabel = "Strong value" | "Value" | "At cost" | "Early vs ADP";
export type DraftTargetAttribution = "both" | "user" | "model" | "none";
export type DraftEvidenceLabel = "Strong" | "Usable" | "Limited";
export type DraftActionLabel = "Avoid" | "Pass" | "Fair" | "Target" | "Smash";
export type LiveDraftActionLabel = Exclude<DraftActionLabel, "Smash"> | "Smash Now";

export type DraftBoardSignal = {
  valueLabel: DraftValueLabel;
  valueDeltaVsAdp: number;
  boardEdge: number;
  modelEdge: number;
  targetAttribution: DraftTargetAttribution;
  modelTarget: boolean;
  userTarget: boolean;
  evidenceLabel: DraftEvidenceLabel;
  evidenceScore: number;
  alert: "rising" | "falling" | "volatile" | "none";
};

export type DraftQuickScore = {
  vorStars: 1 | 2 | 3 | 4 | 5;
  cliffStars: 1 | 2 | 3 | 4 | 5;
  action: DraftActionLabel;
  valueOverReplacement: number;
  cliffDrop: number;
};

export type LiveDraftCall = {
  action: LiveDraftActionLabel;
  dynamic: boolean;
  priceFall: number;
  requiredFall: number;
  urgent: boolean;
  summary: string;
};

type DraftBoardSignalEntry = {
  boardRank: number;
  boardEdge: number;
  structuralRank: number;
  marketRank: number;
  valueOverReplacement: number;
};

type DraftQuickScoreEntry = DraftBoardSignalEntry & {
  playerId: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function buildDraftBoardSignal(
  candidate: DraftCandidate,
  board: DraftBoardSignalEntry,
  userTarget: boolean,
): DraftBoardSignal {
  const valueDeltaVsAdp = Number((candidate.market.adp - board.boardRank).toFixed(1));
  // Structural classification uses normalized market rank from the same player
  // universe, while direct ADP must agree on the direction before the UI calls
  // someone a value or an early pick. This prevents either source from creating
  // a position-wide label by itself.
  const modelEdge = board.marketRank - board.structuralRank;
  const meaningfulEdge = Math.max(3, Math.ceil(board.marketRank * 0.08));
  const strongValue =
    modelEdge >= meaningfulEdge * 2 &&
    valueDeltaVsAdp >= 4 &&
    board.valueOverReplacement >= 25;
  const positiveValue =
    modelEdge >= meaningfulEdge &&
    valueDeltaVsAdp >= 2 &&
    board.valueOverReplacement >= 8;
  const earlyPrice = modelEdge <= -meaningfulEdge && valueDeltaVsAdp <= -2;
  const valueLabel: DraftValueLabel = strongValue
    ? "Strong value"
    : positiveValue
      ? "Value"
      : earlyPrice
        ? "Early vs ADP"
        : "At cost";

  const confidence = candidate.signals?.evidenceConfidence;
  const robustnessScore = 100 - (candidate.signals?.robustness.fragilityScore ?? 50);
  const evidenceScore = Math.round(
    clamp(
      confidence
        ? confidence.projection.score * 0.38 +
            confidence.role.score * 0.34 +
            confidence.robustness.score * 0.18 +
            confidence.price.score * 0.1
        : robustnessScore,
      0,
      100,
    ),
  );
  const evidenceLabel: DraftEvidenceLabel =
    evidenceScore >= 72 && robustnessScore >= 45
      ? "Strong"
      : evidenceScore >= 52
        ? "Usable"
        : "Limited";

  const modelTarget =
    (strongValue || positiveValue) &&
    evidenceLabel !== "Limited" &&
    candidate.signals?.roleSecurity.label !== "fragile";
  const targetAttribution: DraftTargetAttribution =
    modelTarget && userTarget
      ? "both"
      : userTarget
        ? "user"
        : modelTarget
          ? "model"
          : "none";

  const refreshStatus = candidate.signals?.refresh?.status;
  const alert =
    refreshStatus === "rising" || refreshStatus === "falling" || refreshStatus === "volatile"
      ? refreshStatus
      : "none";

  return {
    valueLabel,
    valueDeltaVsAdp,
    boardEdge: board.boardEdge,
    modelEdge,
    targetAttribution,
    modelTarget,
    userTarget,
    evidenceLabel,
    evidenceScore,
    alert,
  };
}

function starsFromPercentile(percentile: number): 1 | 2 | 3 | 4 | 5 {
  if (percentile >= 0.88) return 5;
  if (percentile >= 0.7) return 4;
  if (percentile >= 0.45) return 3;
  if (percentile >= 0.2) return 2;
  return 1;
}

function absoluteVorStars(valueOverReplacement: number): 1 | 2 | 3 | 4 | 5 {
  if (valueOverReplacement >= 50) return 5;
  if (valueOverReplacement >= 25) return 4;
  if (valueOverReplacement >= 10) return 3;
  if (valueOverReplacement > 0) return 2;
  return 1;
}

function cliffStars(cliffDrop: number): 1 | 2 | 3 | 4 | 5 {
  // Translate season-point cliffs to roughly 0.25/0.5/0.8/1.2 points per
  // game. This keeps QB and flex cliffs on the same readable scale.
  if (cliffDrop >= 20) return 5;
  if (cliffDrop >= 14) return 4;
  if (cliffDrop >= 9) return 3;
  if (cliffDrop >= 4) return 2;
  return 1;
}

function actionLabel(
  candidate: DraftCandidate,
  signal: DraftBoardSignal,
  vorStars: 1 | 2 | 3 | 4 | 5,
  tierCliffStars: 1 | 2 | 3 | 4 | 5,
): DraftActionLabel {
  const fragile = candidate.signals?.roleSecurity.label === "fragile";
  if (
    signal.valueLabel === "Early vs ADP" &&
    (signal.alert === "falling" || (signal.evidenceLabel === "Limited" && fragile))
  ) return "Avoid";
  if (signal.valueLabel === "Early vs ADP") return "Pass";
  if (
    vorStars >= 4 &&
    signal.evidenceLabel !== "Limited" &&
    (signal.valueLabel === "Strong value" || (signal.valueLabel === "Value" && tierCliffStars >= 4))
  ) return "Smash";
  if (
    vorStars >= 3 &&
    (signal.modelTarget || signal.valueLabel === "Value" || (tierCliffStars >= 4 && signal.evidenceLabel === "Strong"))
  ) return "Target";
  if (vorStars === 1) return "Pass";
  return "Fair";
}

export function buildDraftQuickScoreBoard(
  candidates: DraftCandidate[],
  board: DraftQuickScoreEntry[],
): Map<string, DraftQuickScore> {
  const candidateById = new Map(candidates.map((candidate) => [candidate.player.id, candidate]));
  const entriesByPosition = new Map<string, DraftQuickScoreEntry[]>();

  for (const entry of board) {
    const candidate = candidateById.get(entry.playerId);
    const position = candidate?.player.positions[0];
    if (!candidate || !position) continue;
    entriesByPosition.set(position, [...(entriesByPosition.get(position) ?? []), entry]);
  }

  const result = new Map<string, DraftQuickScore>();
  for (const [position, entries] of entriesByPosition) {
    const sortedVor = [...entries].sort((a, b) => a.valueOverReplacement - b.valueOverReplacement);
    const positionCandidates = candidates
      .filter((candidate) => candidate.player.positions[0] === position)
      .sort((a, b) => a.market.tier - b.market.tier || b.projection.range.p50 - a.projection.range.p50);
    const tierCliffs = new Map<number, number>();
    for (const tier of new Set(positionCandidates.map((candidate) => candidate.market.tier))) {
      const tierPlayers = positionCandidates.filter((candidate) => candidate.market.tier === tier);
      const tierTail = tierPlayers.at(-1);
      const nextTier = positionCandidates.find((candidate) => candidate.market.tier > tier);
      tierCliffs.set(
        tier,
        Number(Math.max(0, (tierTail?.projection.range.p50 ?? 0) - (nextTier?.projection.range.p50 ?? tierTail?.projection.range.p50 ?? 0)).toFixed(1)),
      );
    }

    for (const entry of entries) {
      const candidate = candidateById.get(entry.playerId);
      if (!candidate) continue;
      const index = sortedVor.findIndex((item) => item.playerId === entry.playerId);
      const percentile = sortedVor.length <= 1 ? 1 : index / (sortedVor.length - 1);
      const signal = buildDraftBoardSignal(candidate, entry, false);
      const cliffDrop = tierCliffs.get(candidate.market.tier) ?? 0;
      const vorStars = Math.min(
        starsFromPercentile(percentile),
        absoluteVorStars(entry.valueOverReplacement),
      ) as 1 | 2 | 3 | 4 | 5;
      const tierCliffStars = cliffStars(cliffDrop);
      result.set(entry.playerId, {
        // A player must clear both bars: dominance within his position and a
        // meaningful absolute advantage over the waiver baseline. This stops
        // the best member of a replacement-level tail from earning 4-5 stars.
        vorStars,
        cliffStars: tierCliffStars,
        action: actionLabel(candidate, signal, vorStars, tierCliffStars),
        valueOverReplacement: entry.valueOverReplacement,
        cliffDrop,
      });
    }
  }
  return result;
}

export function preDraftActionLabel(action: DraftActionLabel): LiveDraftActionLabel {
  // Historical testing found that the static Target lane separated while a
  // preseason Smash label did not. Smash is therefore reserved for a live,
  // observed price—not a stronger expression of preseason conviction.
  return action === "Smash" ? "Target" : action;
}

export function buildLiveDraftCall(args: {
  candidate: DraftCandidate;
  quickScore: DraftQuickScore;
  signal: DraftBoardSignal;
  currentPick: number;
  isMyTurn: boolean;
  makeItBackProbability: number;
  tierSurvivalProbability: number;
  rosterFit?: "need" | "open" | "blocked";
}): LiveDraftCall {
  const baseAction = preDraftActionLabel(args.quickScore.action);
  const priceFall = Number((args.currentPick - args.candidate.market.adp).toFixed(1));
  const requiredFall = args.candidate.market.adp <= 36
    ? 7
    : args.candidate.market.adp <= 120
      ? 6
      : 10;
  const urgent = args.makeItBackProbability <= 0.35 || args.tierSurvivalProbability <= 0.4;
  const supported =
    args.signal.evidenceLabel !== "Limited" &&
    args.candidate.signals?.roleSecurity.label !== "fragile" &&
    args.quickScore.vorStars >= 3;
  const targetQuality =
    baseAction === "Target" ||
    (args.signal.modelTarget && args.signal.valueLabel !== "Early vs ADP");
  const smashNow =
    args.isMyTurn &&
    targetQuality &&
    supported &&
    priceFall >= requiredFall &&
    urgent &&
    args.rosterFit !== "blocked";

  if (smashNow) {
    return {
      action: "Smash Now",
      dynamic: true,
      priceFall,
      requiredFall,
      urgent,
      summary: `${args.candidate.player.fullName} has fallen ${priceFall.toFixed(0)} picks past ADP, clears the evidence/VOR gates, and is unlikely to survive the next turn.`,
    };
  }

  return {
    action: baseAction,
    dynamic: false,
    priceFall,
    requiredFall,
    urgent,
    summary:
      baseAction === "Target"
        ? `${args.candidate.player.fullName} remains a target, but the live price and urgency gates do not justify a Smash Now call.`
        : `The live room does not strengthen the ${baseAction} preseason call.`,
  };
}
