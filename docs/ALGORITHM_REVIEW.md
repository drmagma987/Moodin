# Fantasy Draft Algorithm Review

Last updated: August 13, 2026

## Product model

The tool has two connected engines with different jobs.

### 1. Pre-draft board

The pre-draft layer answers:

- What is our league-specific rank?
- What does the market cost today?
- Is the player a value at that cost?
- Did the model, the manager, or both tag the player as a target?
- How strong is the underlying evidence?

Price, preference, and uncertainty are independent. A volatile player can still be a value. A stable player can still be overpriced. A personal favorite never changes the projection or rank.

### 2. Live draft engine

The live layer answers:

- What does our roster need now?
- What do the teams picking before us still need?
- How many players at each position are likely to go before the next turn?
- What is the probability the current tier survives?
- What is the probability a specific player makes it back?
- What do we lose by waiting, measured through VONA and the next-best portfolio?

Every recorded pick updates availability, team rosters, open starter/flex slots, opponent demand, wrap simulations, run pressure, and recommendations.

## Input audit

| Input | Job | Reliability | Treatment |
| --- | --- | --- | --- |
| FantasyPros public overall PPR ECR | full player universe and consensus rank | strong for coverage and consensus, not a projection | core; requires coverage gate |
| Fantasy Football Calculator 10-team PPR ADP | current acquisition price | strong public market sample, but not Yahoo-room-specific | core price input; direct ADP labeled separately |
| FantasyPros private projections | raw stat projections | useful but currently only 34 players | supplemental overlay only |
| Public rank-derived projection estimates | fill projection gaps | modeled, not observed | fallback; lower evidence confidence |
| Yahoo custom scoring rules | exact point translation | strong when league settings are current | authoritative league input |
| nflverse actual usage | prior workload and production | strong historical truth, backward-looking | role prior, never current-depth-chart truth |
| ffopportunity expected points | efficiency/regression context | strong historical diagnostic | bounded regression input |
| Win With Odds season estimates | independent volume cross-check | useful but derived | capped supplemental blend |
| Sleeper adds/drops | momentum | useful activity signal, weak player-quality signal | small refresh input only |
| qualitative context snapshot | role/health/environment claims | useful but date-sensitive | bounded adjustment with provenance |
| manual refresh inputs | late news and manager knowledge | only as reliable as the entry | explicit, visible override |
| personal/model target tags | draft preference | intentional, not predictive | display and tie-break context; never projection truth |

The nflverse identity crosswalk now joins public-board players to historical usage by normalized name plus exact position, and refuses ambiguous matches. It preserves canonical player IDs and rookie flags.

## Calculation audit

### Static board

1. Translate raw stats through the exact Yahoo scoring rules.
2. Build downside, median, and ceiling projections.
3. Apply bounded role, expected-opportunity, regression, scoring-profile, and freshness adjustments.
4. Derive replacement levels from required starters plus flex allocation. Shared flex jobs are allocated in expected market-acquisition order; our projections then measure value above that independent baseline. This prevents an optimistic position projection from creating more starter jobs for the same position.
5. Produce a structural rank from VOR, stability, role security, and projection range.
6. Anchor the acquisition rank to overall ADP/ECR so raw cross-position points cannot elevate one-starter positions unrealistically.

### Stable advanced usage

- WR/TE opportunity now uses formal WOPR (`1.5 × target share + 0.7 × air-yards share`) instead of touchdowns inside the role score. Touchdown outcomes remain in the separate expected-TD/regression layer.
- The stable-opportunity score is standardized as a true Z-score within each position, then bounded before it reaches the projection. A WR is never standardized against an RB or QB.
- RB opportunity favors targets and receptions over raw carries and excludes prior touchdowns. Play-level ffopportunity expected points and expected touchdowns represent location-adjusted high-value work.
- Age adds only a bounded uncertainty/fragility increment beginning at RB 25 and WR 29. It does not apply a second median projection penalty because current projection markets already price age.
- TPRR and route participation remain unavailable rather than being approximated from snaps. True receptions-plus-inside-the-10 HVT remains unavailable as a standalone count; the model uses the more complete play-level expected-points signal until a current, full-coverage location feed is proven.
- Z-scores are diagnostic opportunity standardizers, not fantasy points and not a replacement for league-specific VOR.

Walk-forward validation trained the stable-usage/TD-regression/age specification on the 2021→2022, 2022→2023, and 2023→2024 transitions, then held out 2024→2025. Against a prior-PPG regression baseline, holdout MAE improved 4.5% for RBs (63 samples), 6.4% for WRs (109), and 4.2% for TEs (62). This supports keeping the bounded veteran usage layer. It does not activate the separately gated rookie or QB research lanes, which still require their own five-season market-baseline tests.

### Signal model

The old `Risk` verdict was invalid because its dossier compared raw overall projected-point rank with overall ECR. That structurally favored quarterbacks and classified most RB/WR profiles as fragile.

The replacement signal has three independent dimensions:

- **Value:** strong value, value, at cost, or early versus ADP.
- **Target:** model, yours, both, or none.
- **Evidence:** strong, usable, or limited, plus a separate rising/falling/volatile alert.

The draft-day value label is intentionally stricter than raw model rank. `Value` or `Strong value` requires a meaningful structural rank edge, positive value over replacement, and confirmation from the direct ADP comparison. `Early` requires the inverse agreement. If those measures disagree—or the difference is noise—the label is `At cost`.

Current public FantasyPros PPR position projections are applied to the top rows exposed by each public table and rescored with the league's Yahoo settings. Deeper fallback curves are calibrated to those current projections and public value-over-last-starter tables rather than extrapolated from our own board order.

The underlying dossier now compares projection and market ranks within position. Overall acquisition decisions remain the responsibility of the redraft board.

Categorical dossier stances are research copy only. They no longer add bonuses or penalties to the static board, opponent simulations, live recommendations, or conditional portfolio scoring; those calculations use continuous evidence inputs instead.

### Advanced QB and rookie research lane

Advanced QB and rookie profiles are attached after projection calibration and target tagging. They are display-only and cannot change projections, board ranks, recommendations, or simulations.

- QB research separates designed-rush share from scramble rate and pairs that rushing baseline with EPA/dropback, CPOE, touchdown-rate sustainability, and sample size.
- Rookie RB research weights college production 35%, reviewed NFL situation 30%, season rushing-yard market 25%, and draft capital 10%. College production requires scrimmage-yard share, touchdown share, and target share; missing inputs reduce coverage instead of transferring weight to draft capital.
- Rookie WR/TE research retains age-adjusted production, breakout age, situation, market yardage, and a larger—but still non-determinative—draft-capital component.
- College shares pool the available 2020–2025 `cfbfastR` play history without a recency multiplier. QB rushing cannot move even the shadow board until equal-season multi-year designed-run and scramble evidence is present.
- Experimental changes are made to football-stat projections and then rescored under the league settings. Six-point passing TDs and full PPR therefore affect the result directly; 300/100-yard bonuses require projected qualifying-game counts and are never inferred from season yard totals.
- Situation and Vegas inputs are confirmation/coverage gates in the rookie shadow calculation, not a second adjustment, because they already inform the base projection. Draft capital never drives the shadow change.
- A lane cannot influence production rankings unless a held-out backtest covers at least five seasons, meets its sample floor, improves PPG MAE against an ADP/market baseline by at least 5%, and improves hit-rate classification by at least three percentage points.

### Live calculations

For each pick state, the engine:

1. Rebuilds every team’s roster counts and open starter/flex slots.
2. Simulates the picks before the manager’s next turn with roster need, market price, VOR, scarcity, and bounded uncertainty.
3. Measures expected selections by position.
4. Counts upcoming teams with exact starter gaps and flex gaps.
5. Calculates tier-survival and player make-it-back probabilities.
6. Calculates VONA: value now minus expected value available next turn.
7. Reranks recommendations from roster need, structural value, run pressure, tier cliffs, market value, and evidence.

Optional past-draft history can calibrate each opponent's tendency to take fallen value, follow market, or reach for need. A team requires at least eight matched historical picks; otherwise simulations use the explicit neutral 40% value / 30% market / 30% need prior.

## Guardrails

- Do not run trusted recommendations on a truncated player pool.
- Do not treat positional rank as overall ADP.
- Do not let target tags alter projections.
- Do not collapse uncertainty into a universal fade label.
- Do not call model probabilities sportsbook odds.
- Do not treat saved setup text as applied league state until names, slots, and keepers are resolved to canonical teams and players.

## Remaining setup dependency

The league-intake screen currently preserves the supplied team names, order, slot, and keeper text. Once the final league list is provided, it still needs a validated resolution pass that maps:

- ordered team names to `team-1` through `team-12`
- the manager’s exact slot to `myTeamId`
- each keeper name to a canonical player ID
- keeper round cost to the correct consumed pick

That resolution should produce a reviewable receipt before mutating draft state. It should not guess silently when a player or team name is ambiguous.
