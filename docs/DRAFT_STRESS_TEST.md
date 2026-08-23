# Draft Strategy Stress Test

## Purpose

The stress test converts the provider-neutral bespoke board into slot-specific draft instructions. It answers whether a player is likely to reach a future turn, whether an apparent value requires a reach, and which roster constructions perform best from the configured keeper state.

## Current Scenario

- 10 teams, canonical snake slot 9
- Jahmyr Gibbs kept at Pick 9
- Amon-Ra St. Brown kept at Pick 12
- First live selection: Pick 29, followed by 32, 49, 52, and the remaining slot-9 turn sequence
- 1,200 deterministic drafts across all ten slots plus 1,000 personalized keeper-room drafts across model-balanced, WR-heavy, RB-pressure, and wait-on-QB/TE strategies
- K reserved for the final round
- No D/ST because the configured Yahoo league has no D/ST roster slot

The known keeper picks consume the first two personal turns. Other managers' keepers are not yet known, so opponent teams currently draft from market cost, roster need, and bounded random variation.

## Outputs

- Strategy outcomes compare median starter season points, downside, ceiling, starter completion, and average position counts.
- Pick windows report the position mix and most common available targets at each personal turn.
- Player survival curves estimate availability at each personal pick.
- The Manager Draft Board classifies players as priority target, take at cost, discount only, situation watch, or pass.
- Acquisition instructions identify the latest acceptable turn rather than publishing another flat rank.
- The on-clock conditional path board forces each serious current candidate, simulates opponents through the next two personal turns, and compares the resulting three-pick portfolios with paired room and player-outcome samples.

## Determinism

The random stream is seeded by league, strategy, simulation index, and board size. The same candidate board and draft state produce the same output. This makes model changes testable instead of allowing random mock-draft noise to obscure regressions.

## Guardrails

- The simulator uses the existing redraft-aware board; it does not maintain a second valuation model.
- Replacement levels come from projected optimal league starters: required slots are filled first and each flex slot is allocated exactly once to the best remaining eligible projection.
- RB, WR, TE, and QB share the same base VOR calculation. Flex-eligible positions receive only a small lineup-path utility adjustment, while one-starter depth is represented by the replacement cutoff and measured depth penalties.
- QB and TE remain patient early but receive deadline pressure so every strategy completes required starters.
- Personal keepers are unavailable to all simulated teams and excluded from manager-board recommendations.
- K is filled in the final round and never enters skill-position acquisition windows.
- Direct ADP and rank-proxy market cost remain labeled separately. Proxy-based survival percentages are useful for relative testing, not exact room forecasts.
- If a model discount is unlikely to survive until an acceptable price, the board reports no acquisition window instead of recommending an early compromise.

## Next Calibration

When Yahoo opens, import the other teams' keepers and replace rank-proxy cost with stronger current ADP. Mock-draft results can then be compared with the simulated survival curves to tune opponent behavior without changing downstream draft logic.
