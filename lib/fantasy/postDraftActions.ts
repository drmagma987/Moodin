import { scoreProjectionSnapshot } from "@/lib/fantasy/scoring";
import type { DraftCandidate, DraftState, PlayerPosition } from "@/lib/fantasy/types";

export type PostDraftAction = {
  id: string;
  priority: "protect" | "monitor" | "contingency";
  title: string;
  trigger: string;
  action: string;
  rationale: string;
};

function primaryPosition(candidate: DraftCandidate): PlayerPosition {
  return candidate.player.positions[0] ?? "WR";
}

function projectedPoints(candidate: DraftCandidate, state: DraftState) {
  return scoreProjectionSnapshot(candidate.projection, state.league.scoring).exact;
}

export function buildPostDraftActionQueue(state: DraftState, candidates: DraftCandidate[]): PostDraftAction[] {
  const byId = new Map(candidates.map((candidate) => [candidate.player.id, candidate] as const));
  const myTeam = state.teams.find((team) => team.teamId === state.myTeamId);
  if (!myTeam) return [];
  const roster = [...myTeam.starters, ...myTeam.bench].map((id) => byId.get(id)).filter((item): item is DraftCandidate => Boolean(item));
  const bench = myTeam.bench.map((id) => byId.get(id)).filter((item): item is DraftCandidate => Boolean(item));
  const weakestBench = [...bench].sort((a, b) => projectedPoints(a, state) - projectedPoints(b, state))[0];
  const available = candidates
    .filter((candidate) => state.availablePlayerIds.includes(candidate.player.id))
    .filter((candidate) => ["RB", "WR", "TE"].includes(primaryPosition(candidate)))
    .sort((a, b) => projectedPoints(b, state) - projectedPoints(a, state));

  const actions: PostDraftAction[] = [];
  for (const player of [...bench].sort((a, b) => projectedPoints(b, state) - projectedPoints(a, state)).slice(0, 2)) {
    actions.push({
      id: `protect-${player.player.id}`,
      priority: "protect",
      title: `Do not panic-drop ${player.player.fullName}`,
      trigger: "Reconsider only after two weeks of weak role evidence or a confirmed depth-chart loss.",
      action: "Hold while the original upside thesis remains intact.",
      rationale: `${player.player.fullName} is one of the strongest bench investments on this roster by projected league value.`,
    });
  }

  for (const player of available.slice(0, 3)) {
    const position = primaryPosition(player);
    const trigger = position === "RB"
      ? "Act if first-team touches, goal-line work, or an injury creates a clear workload path."
      : position === "WR"
        ? "Act if route participation and targets establish a weekly role."
        : "Act if route participation or red-zone usage moves into starter territory.";
    actions.push({
      id: `watch-${player.player.id}`,
      priority: "monitor",
      title: `Watch ${player.player.fullName}`,
      trigger,
      action: weakestBench ? `If the trigger clears, compare directly with ${weakestBench.player.fullName} as the current churn point.` : "If the trigger clears, make room through the weakest replaceable slot.",
      rationale: `${player.player.fullName} is among the best undrafted ${position} options remaining by this league's scoring model.`,
    });
  }

  const rbCount = roster.filter((player) => primaryPosition(player) === "RB").length;
  if (rbCount < 5) {
    actions.push({
      id: "contingency-rb-depth",
      priority: "contingency",
      title: "Protect the RB contingency layer",
      trigger: "Any available back earns a defined second role or high-value touches.",
      action: "Prioritize the emerging RB over a redundant low-ceiling bench profile.",
      rationale: `The drafted roster has ${rbCount} running backs, leaving less injury and role-change insulation than the two-flex format rewards.`,
    });
  }
  return actions.slice(0, 6);
}
