import { buildTierPivotSnapshots, rankDraftCandidates } from "@/lib/fantasy/draft";
import type {
  DraftCandidate,
  DraftMorningPack,
  DraftState,
  DraftBoardMovementEntry,
  RefreshDigest,
} from "@/lib/fantasy/types";

function buildChecklist() {
  return [
    {
      label: "Run final rebuild",
      timing: "Morning of draft",
      summary:
        "Refresh projections, market movement, and any manual draft-week notes once so the board starts from a coherent snapshot.",
    },
    {
      label: "Review late watchlist",
      timing: "After rebuild",
      summary:
        "Only inspect players with real refresh pressure, not every small blurb that appeared overnight.",
    },
    {
      label: "Freeze the top board",
      timing: "At least 1 hour before draft",
      summary:
        "Lock the core ranking and conviction buckets so you are drafting from a plan instead of reacting live.",
    },
    {
      label: "Keep a small contingency map",
      timing: "Before first live pick",
      summary:
        "Have pivots ready for your next two swings so a tier break does not force panic decisions.",
    },
  ] as const;
}

function candidateById(playerId: string, candidates: DraftCandidate[]) {
  return candidates.find((candidate) => candidate.player.id === playerId) ?? null;
}

function toPriorityEntry(
  playerId: string,
  headline: string,
  summary: string,
) {
  return {
    playerId,
    headline,
    summary,
  };
}

export function buildDraftMorningPack(input: {
  candidates: DraftCandidate[];
  draftState: DraftState;
  refreshDigest: RefreshDigest;
  movementLog: DraftBoardMovementEntry[];
  generatedAt?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const recommendations = rankDraftCandidates(input.draftState, input.candidates);
  const topRecommendations = recommendations.slice(0, 12);
  const convictionTargets = topRecommendations
    .map((recommendation) => {
      const candidate = candidateById(recommendation.playerId, input.candidates);
      if (!candidate?.signals) {
        return null;
      }
      if (
        candidate.signals.dossier.stance !== "priority-target" &&
        candidate.signals.dossier.stance !== "pocket-value"
      ) {
        return null;
      }

      return toPriorityEntry(
        candidate.player.id,
        `${candidate.player.fullName} is a draft-morning target`,
        `${candidate.signals.dossier.summary} ${
          recommendation.explanation.runRisk === "high"
            ? "The tier pressure says this may need to happen on the current turn."
            : "The board still likes the price if the room gives you a small window."
        }`,
      );
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 5);
  const fallbackRecommendation = topRecommendations[0];
  const fallbackCandidate = fallbackRecommendation
    ? candidateById(fallbackRecommendation.playerId, input.candidates)
    : null;
  const priorityTargets =
    convictionTargets.length > 0
      ? convictionTargets
      : fallbackCandidate && fallbackRecommendation
        ? [
            toPriorityEntry(
              fallbackCandidate.player.id,
              `${fallbackCandidate.player.fullName} is the best available draft-morning target`,
              `No player cleared the full conviction threshold in this snapshot. This is the board's best structural option, not permission to ignore price discipline. ${fallbackRecommendation.explanation.structuralCase}`,
            ),
          ]
        : [];

  const fragileFades = topRecommendations
    .map((recommendation) => {
      const candidate = candidateById(recommendation.playerId, input.candidates);
      if (!candidate?.signals) {
        return null;
      }
      if (
        candidate.signals.dossier.stance !== "fragile-bet" &&
        candidate.signals.dossier.stance !== "market-trap" &&
        candidate.signals.refresh?.status !== "falling"
      ) {
        return null;
      }

      return toPriorityEntry(
        candidate.player.id,
        `${candidate.player.fullName} needs discipline at cost`,
        `${candidate.signals.dossier.summary} ${
          candidate.signals.refresh?.status === "falling"
            ? candidate.signals.refresh.summary
            : candidate.signals.dossier.usagePlan
        }`,
      );
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 5);

  const contingencyPlans = buildTierPivotSnapshots(input.draftState, input.candidates)
    .map((plan) => {
      const trigger = candidateById(plan.triggerPlayerId, input.candidates);
      if (!trigger) {
        return null;
      }

      return toPriorityEntry(
        trigger.player.id,
        `${trigger.player.fullName} is a hinge point for ${plan.position}`,
        plan.summary,
      );
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 4);

  return {
    generatedAt,
    headline: "Morning-of-Draft Final Refresh Pack",
    summary:
      "Use this pack on the morning of the draft to confirm late movers, lock your conviction buckets, and freeze the board before the room starts pushing you around.",
    freezeWindow:
      "Recommended freeze window: finalize the board on draft morning, then only allow meaningful injury, holdout, or depth-chart shocks inside the final hour.",
    checklist: [...buildChecklist()],
    priorityTargets,
    fragileFades,
    contingencyPlans,
    watchlist: input.refreshDigest.watchlist.slice(0, 5),
    keyMovers: input.movementLog.slice(0, 5),
  } satisfies DraftMorningPack;
}
