# Decision Logic

Last updated: August 25, 2026

## Core philosophy

Optimize for roster-improving utility, not generic fantasy points.

The product has two explicit phases: a pre-draft acquisition board and a live draft-state engine. The pre-draft layer owns value versus market, evidence, and target attribution. The live layer owns roster fit, opponent needs, run pressure, tier survival, make-it-back odds, and VONA.

## Draft value stack

1. Score raw projections with exact league rules.
2. Maintain P10, P50, and P90 outcomes.
3. Allocate required starters, then award every league flex spot to the highest projected remaining RB/WR/TE.
4. Estimate value over replacement from the first projected non-starter at each position.
5. Rank structural value, then anchor the acquisition board to verified overall ADP plus overall PPR ECR so one-starter positions cannot jump multiple rounds on raw points alone.
6. Estimate make-it-back probability using ADP, ECR, intervening roster needs, and simulated picks.
7. Compute VONA as value now minus expected next-pick value.
8. Preserve upside separately from median value.
9. Generate a short explanation from structured evidence.

If a position pool does not reach the league-derived replacement index, its VOR is zero rather than falling back to the last loaded player. This prevents incomplete data from manufacturing positional value.

## Conditional multi-pick layer

The live assistant does not stop at the base-board rank. When the user's team is on the clock, it forces each serious candidate into the current pick and simulates through the next two personal selections.

- Opponent selections use the same neutral blend of market cost, board value, live roster need, and bounded uncertainty in every simulation.
- Personal pick windows are built from exact unoccupied snake slots, so consumed keeper picks never become phantom selections.
- A short window controlled by one intervening team is treated as a pair-building pick; a 12-plus-selection window is treated as the last pick before a long gap and increases make-it-back and tier-survival urgency.
- Materially fallen top-24 market players trigger a strong best-player-available override so elite value does not unrealistically slide because a roster already has that position.
- Every candidate is tested against the same room seeds and sampled player outcomes.
- Follow-up selections maximize the projected lineup portfolio while retaining board edge, role evidence, floor, and roster construction.
- Outputs compare path win rate, lineup floor/median/ceiling, median edge versus the best alternative, and the most common exact pick sequence.

This layer answers “player now plus what later?” rather than treating a standalone rank as the final recommendation.

The conditional output now records its evaluation mode. `quick-preview` is the responsive browser comparison. `exact-production` calls the same live `rankDraftCandidates()` policy at every continuation and is reserved for offline validation until its state-independent calculations are cached. Both modes report median and downside regret, not only a winner percentage.

Construction penalties can be disabled through the explicit `construction-ablation` policy mode. This is a diagnostic control: if a roster-construction conclusion disappears when the penalty is removed, it was encoded rather than discovered. Release scenarios must show that strategically dominated branches still lose in paired roster outcomes under ablation.

The release suite also compares the live choice with two deliberately simpler policies: roster-constrained ADP and roster-constrained model-board order. Production may differ, but it cannot carry more than five projected median-regret points versus either baseline in the 2,000-room discovery cohort. Small exact-policy cohorts use a wider 15-point tolerance because they are integration checks rather than stable estimators.

## Personal targets and model values

The War Room keeps two concepts visibly separate:

- Personal targets are user-controlled draft-day stars stored in the current browser. They never change projections, board rank, recommendation score, or Monte Carlo results.
- Model values are available players whose live bespoke rank is meaningfully earlier than their market rank while retaining enough roster value to remain actionable. They update after every imported or manually recorded pick.

Target tags are stored per league in localStorage and can be copied/restored as a versioned JSON backup. Localhost therefore survives refreshes in the same browser profile and origin, while the backup is the portability path across ports, browsers, devices, or deployment origins.

## What the current heuristic does

- uses projection median and distribution spread
- derives replacement from the actual league lineup and current projection pool
- uses roster-need pressure for teams between picks
- treats RB, WR, TE, and QB VOR with the same 1.00 weight rather than hand-authored positional multipliers
- does not add separate QB/TE depth penalties or elite-position bonuses on top of VOR
- uses only a small position-neutral tier signal outside the lineup-derived board value
- outputs a simple ranked recommendation list
- uses a 55% market-cost anchor for verified overall ADP and a 45% ECR anchor when only a rank proxy exists

## Why this changed

The prior board assigned both flex slots independently to RB, WR, and TE when setting replacement depth, then attempted to compensate with hard-coded positional multipliers (1.52 RB, 1.74 WR, and 1.04 TE in this league). Those effects could partially cancel but were not empirically fitted and made elite-TE ranks overly sensitive to arbitrary constants.

The revised board allocates each flex spot exactly once from projected points. In the current league, that normally places TE replacement near the first non-starting tight end instead of TE39. Because lineup demand is already represented in the baseline, all primary positions receive a neutral VOR weight.

## What it does not do yet

- expert disagreement uncertainty modeling
- dynamic league-imported roster rules
- weekly lineup or waiver logic
