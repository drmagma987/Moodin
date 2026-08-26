# Draft policy certification

## Evidence boundary

The live War Room, timed rehearsal, hero card, alternatives, and model-sorted remaining board all consume `rankDraftCandidates()` with the canonical `DraftState` and candidate pool. Responsive take-now comparisons are explicitly labeled quick previews. Release decisions use exact-production continuations from `fantasy:counterfactual-audit`; those continuations call the production policy again at every later manager pick and pair candidates with identical opponent/outcome seeds.

The simulations demonstrate comparative roster outcomes under the stated opponent model. They do not prove a player projection, injury outcome, or real-room availability probability. When exact samples cannot separate choices, the interface and audit must report an effective tie.

## Baselines and thresholds

- Constrained ADP: best market-ranked player that remains compatible with the roster and draft phase.
- Constrained model board: best overall model-ranked compatible player.
- Production: the same shared recommendation policy used by the real War Room.
- Golden decisions use 2,000 paired quick-preview discovery rooms per state and exact-production continuations for the release comparison.
- Production may trail either constrained baseline by at most the audit's declared regret tolerance. Dominated alternatives must have positive median regret.
- Eight exact continuations are an integration screen, not enough to distinguish a close call. The audit automatically escalates choices within 15 median-regret points to 32 paired exact-production continuations before certification.

## Encoded protections

League legality, canonical identity, keeper assignment, snake ownership, unique player availability, and artifact fingerprints are fail-closed constraints. The small explicit structural layer suppresses duplicate QB/TE/K while required starters remain open and adds deadline pressure for unfilled starters. Player preference, value, tier timing, and falling-elite exceptions remain evidence-driven.

Construction ablation sets those roster-construction penalties to zero while preserving projections, replacement math, opponent behavior, and paired seeds. If the corrected choice still wins downstream without the protection, the continuation supplies independent support; if not, the behavior must be described as an explicit safety preference rather than learned strategy.

## Adversarial suite

`npm run fantasy:certify-policy` completes 26 deterministic drafts: two seeds across ADP, early-QB, late-QB, early-TE, RB-heavy, WR-heavy, positional-run, model/value, home-reach, chaotic, mixed, need-aware, and need-late rooms. It records every manager recommendation, roster state, top alternatives, availability estimate, score gap, final roster, bench usefulness, duplication, and suspicious states.

Release requires zero illegal/incomplete rosters, duplicate players, keeper loss, snake mismatch, implausibly early specialists, unexplained backup onesies, model-board order mismatch, or live/rehearsal parity mismatch. Suspicious states are serialized in the generated report; clearly wrong states become permanent fixtures before correction.

## Failures discovered on 2026-08-26

1. The 447-player production artifact contained no kickers despite a required K slot. Root cause: the public source adapter filtered K. The failing state was saved, K scoring was added, and artifact publication/integrity now rejects any pool missing a required position.
2. A WR-heavy room drafted three kickers and left WR3 open. Root cause: filled-K redundancy and generic late starter completion pressure were too weak. The state was saved and the existing structural safeguards were corrected.
3. Three rooms promoted QB2 while core starters remained open. Root cause: the existing onesie penalty was too weak relative to late-board replacement scores. The states were saved and the generic open-core penalty was strengthened; no player or scenario name is encoded.
4. The eight-run screen accepted Breece Hall in the early-QB2 state, but 32 exact paired continuations favored the constrained ADP WR branch (3.7 versus 21.7 median regret, with lower downside regret). The state was saved. Construction ablation independently supported valuing the second/third required WR slots more strongly, so the lineup-derived exact-starter demand slope was corrected without encoding a player or fixture.

## Release commands

Run canonical integrity, fantasy unit/regression tests, pressure test, counterfactual audit, policy certification, TypeScript, lint, production build, and `git diff --check`. The generated report is an auditable artifact, not a league-rule authority.
