# Advanced QB and Rookie Research

Last updated: August 14, 2026

## Safety boundary

This layer is observational. `advancedResearch.rankingImpact` is always `none`; profiles are attached after calibration, so they cannot alter production projections, VOR, board rank, recommendations, or simulations.

The pre-draft player table includes a `Shadow` view. It shows current rank, hypothetical rank, metric coverage, and missing evidence. A partial profile receives exactly zero shadow adjustment; this prevents, for example, incomplete passing evidence from moving a rushing quarterback before designed-run and scramble splits arrive.

Current rookie identity comes from the nflverse players/draft file and is attached only to the research profile. It deliberately does not mutate the production `player.rookie` flag because the existing calibration layer would otherwise change the live board before the shadow evaluation is approved.

The shadow calculation begins with projected football stats and rescoring under the league configuration (full PPR, six-point passing touchdowns, and configured yardage bonuses). It does not multiply generic fantasy value. A season yardage total cannot establish how often a weekly threshold was crossed, so the shadow counts 300/100-yard bonuses only when a projection supplies explicit qualifying-game counts. The production board retains its prior one-bonus compatibility approximation until its feeds provide those counts, preventing this research rollout from silently changing live ranks.

## Rookie RB design

| Component | Weight | Required evidence |
| --- | ---: | --- |
| College efficiency | 35% | YPC, explosive rate, stuff avoidance, team-relative YPC, receiving efficiency |
| College opportunity | 20% | best-season share, final-season share, target share |
| NFL team situation | 20% | reviewed role/competition and offensive environment |
| Season rushing-yard market | 15% | matched Win With Odds market-derived season projection |
| Draft capital | 10% | exact NFL selection number |

Draft capital is intentionally secondary. College efficiency and NFL situation are the critical components. Vegas yardage improves opportunity confidence but is no longer required for a complete shadow profile; this keeps the talent lane usable when the public season market has not posted a rookie line.

The efficiency layer is designed to avoid treating a committee workload as a talent failure. Rushing grades use per-carry production, 10-yard explosive rate, positive-yardage/stuff avoidance, and performance relative to other rushers on the same team. Receiving grades use yards per target, catch rate, 20-yard explosive-target rate, and yards per target relative to teammates. Rates are shrunk toward neutral until carry/target samples stabilize. Opportunity remains separate and emphasizes best-season and final-season shares instead of only pooled career totals.

WR and TE profiles use the same separation: per-target receiving efficiency is the primary college signal, while best/final-season yardage share, target share, and breakout age describe opportunity and development. The public feed does not contain routes run, yards after contact, or missed tackles forced, so the model leaves those fields absent rather than approximating them.

Current NFL role evidence is joined from Sleeper for every board WR listed at depth-chart order 1–3. This marks a sourced path to a projected top-three role, never a guaranteed target share. The college generator resolves nflverse display-name aliases (for example, KC/Kevin Concepcion), and an observed college career with no 20% receiving-yard or dominator breakout is retained as negative evidence rather than mislabeled as missing data.

The August 14 coverage audit found 93 rostered board WRs with a Sleeper top-three depth path, including 12 current rookies. All 12 rookie profiles have complete college efficiency, opportunity, breakout-result, exact draft-capital, current-role, and Sleeper availability evidence. The latest live season-market refresh raised 11 of 12 top-three-path rookies to 100% research coverage; Zavion Thomas remains at 90% because no receiving-yard market matched. Missing lines are left absent rather than synthesized.

The market-yardage component represents expected opportunity and health, not inherent talent. It remains visibly attributed to its source.

The college snapshot is generated from the keyless SportsDataverse `cfbfastR` ESPN-derived play-by-play releases for 2020–2025 and nflverse player identity. This captures the COVID-era eligibility window for older prospects. Efficiency rates pool all available plays for sample stability; workload context preserves best-season and final-season shares. WR/TE profiles now also carry target EPA, target success, receiving first-down rate, red-zone target share, and scoring-opportunity target share. The reproducible generator is `scripts/build_college_research_snapshot.py`.

## QB design

- Designed-rush share: QB designed carries divided by non-scramble team rushing attempts.
- Scramble rate: QB scrambles divided by dropbacks.
- Passing efficiency: EPA per dropback and CPOE.
- Touchdown sustainability: distance from the regression prior, not an assumption that the prior is every player's true rate.
- Sample coverage: dropbacks prevent tiny samples from presenting as complete evidence.

The nflverse play-by-play parser is provider-neutral and accepts CSV input. It does not download full play-by-play files during a normal page request.

The normal nflverse player-season feed supplies passing EPA, CPOE, attempts, sacks, and touchdown rate for partial live QB profiles. Designed-run and scramble splits still require an equal-season, multi-year offline play-by-play enrichment before any QB shadow movement is allowed. A single recent season is not accepted as a complete rushing profile, and sample size affects confidence rather than directional player quality.

## Input contract

Research records may be supplied through `FANTASY_ADVANCED_RESEARCH_JSON`. Invalid records are skipped with a visible source-status message.

Example rookie RB record:

```json
[
  {
    "lane": "rookie",
    "playerName": "Example Rookie",
    "position": "RB",
    "draftPick": 75,
    "collegeScrimmageYardsShare": 0.34,
    "collegeTouchdownShare": 0.31,
    "collegeTargetShare": 0.12,
    "teamSituationScore": 78,
    "teamSituationNotes": ["Projected lead early-down role"],
    "sources": ["college-football-data", "nflverse-players", "manager-reviewed"]
  }
]
```

## Activation gate

Each lane is evaluated independently against an ADP/market-only PPG baseline using held-out seasons. Default requirements:

- at least five held-out seasons
- at least 150 rookie player-seasons or 120 QB player-seasons
- at least 5% lower mean absolute PPG error
- at least a three-percentage-point lift in threshold hit classification

Passing this report makes a lane eligible for review; it does not automatically activate ranking influence.

The rookie-WR implementation now uses nested component/residual validation over 217 out-of-sample player-seasons. Once each fold selected its lane only from earlier seasons, the challenger regressed MAE 1.0%, rank correlation 0.012, and direct-ADP MAE 2.2%; production remains blocked. A fixed opportunity ablation improved the proxy-ADP segment (5.4% MAE, +0.105 Spearman) but hurt direct ADP, so the War Room now trusts real ADP and shows bounded target-volume adjustments only as a proxy-priced shadow hypothesis. See `docs/ROOKIE_WR_VALIDATION.md`.
