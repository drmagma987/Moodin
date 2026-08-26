# Status

Last updated: August 25, 2026

## Simplified news workflow

- Deprioritized automatic breaking-news discovery and notification interception.
- Added a manual Sleeper quick-intake path: paste a notification, resolve the player/category, apply it to the board immediately, and ask the local Yahoo extension for a fresh inventory scan.
- Made RotoWire the default passive source with a 10-minute cache/check cadence.
- Removed FantasyPros news from the active request path; its adapter remains isolated for future validation.

## Rolling news slice

- Added configurable RSS/Atom and JSON ingestion for official injury reports, team reports, verified beat writers, and fantasy-news aggregators.
- Added conservative player resolution, actionable-language classification, source-trust confidence, expiry windows, provenance, duplicate suppression, and inspectable rejection diagnostics.
- Pre-draft news now loads once when the board opens instead of polling during a draft. The intended workflow is a morning injury/camp-buzz refresh and then a stable draft board.
- FantasyPros news is disabled by default after the configured key returned HTTP 429 from both documented endpoints; it remains available behind `FANTASYPROS_NEWS_ENABLED=true` for future validation.
- Added the first event-driven in-season response engine: actionable news creates an immediate warning, requires verified depth-chart order and league availability before naming a beneficiary, applies bounded provisional opportunity, and reuses the waiver engine to propose an add/drop only when it improves the roster.
- Sleeper is now explicitly assigned to injury/practice confirmation, depth-chart context, and trending-market reaction. Its documented API does not expose the app's breaking-news notification stream.
- Upgraded the existing Yahoo Chrome extension from draft-only snapshots to a user-initiated league inventory scan:
  - captures My Team, linked league rosters, and paginated available QB/RB/WR/TE pages
  - emits a strict `league-inventory` envelope with coverage diagnostics
  - maps Yahoo ownership into in-season `my-roster`, `league-rostered`, and `free-agent` state
  - blocks add/drop output when the inventory is partial, missing a position, or older than 15 minutes
  - composes validated Yahoo inventory directly with the breaking-news response engine
- Added the operational local news loop:
  - pasted Sleeper notifications are the immediate trigger, while RotoWire and configured feeds provide background context
  - `/api/fantasy/breaking-news` emits a deduplicated actionable alert feed with a 10-minute upstream cache
  - the Chrome bridge checks passive sources every 10 minutes; a pasted alert bypasses that timer and immediately requests a fresh Yahoo inventory scan from the last open league tab
  - notifications remain warning/proposal handoffs only; the extension never submits an add, drop, draft pick, or trade

## Completed in this kickoff

- Read and distilled the project spec into living documentation.
- Added provider-neutral fantasy domain types.
- Added exact scoring helpers for Yahoo-style custom scoring.
- Added canonical-player crosswalk scaffolding.
- Added fixture-backed draft candidates and Yahoo-like draft-state mocks.
- Added a first draft-value heuristic with make-it-back and VONA framing.
- Added a dedicated kickoff UI route at `/fantasy-football`.
- Added a FantasyPros integration scaffold with env-based live fetch support and automatic fixture fallback.
- Replaced the sample league config with the actual Yahoo `H-Town Heroes` keeper-league roster, waiver, playoff, and scoring settings from the corrected exported PDF.
- Added a Yahoo draft-event contract and importer path so future browser extraction can feed the War Room without changing draft-engine code.

## Still blocked or pending

- Live FantasyPros authentication and endpoint inspection need real credentials in this repo.
- The FantasyPros scaffold is wired, but live endpoint normalization still needs validation against a real API response.
- nflverse hands-on ingestion testing needs either Python tooling or network-enabled setup work.
- Sleeper endpoint smoke tests are still pending live HTTP verification from this workspace.
- RotoBaller rights review is incomplete beyond public terms and general site policy.
- Tank01 free-tier validation is still pending.
- Yahoo browser extraction and deep-link feasibility are not yet prototyped.

## Recent model progress

- Production now opens from a dated, coverage-checked local board snapshot instead of waiting on remote CSV hosts. Run `npm run fantasy:snapshot` during draft-week refreshes; the publisher refuses fixture or sub-250-player output. The August 13 snapshot contains 438 PPR-ranked players and direct or rank-derived ADP for every candidate, including 209 verified direct overall ADPs.
- The final exact-board audit has Josh Allen #29 at ADP 27.4, Trey McBride #28 at ADP 34.6, and Brock Bowers #41 at ADP 40.7; all three are `At cost`. Across direct-ADP players through pick 180, 21 of 26 TEs, 52 of 85 WRs, and 35 of 66 RBs are at cost, confirming that the earlier position-wide label skew is gone.
- Request-time Monte Carlo work moved after hydration and now evaluates the 120 players relevant to the next draft window. The production route improved from returning zero bytes after 20-45 seconds to HTTP 200 in 0.64 seconds locally; the 48-run live wrap model completes in about one second.
- A separate 300-room keeper-aware stress audit completed every tested roster strategy with a 100% valid-starter rate. Model-balanced led narrowly, so the assistant remains responsive to live value rather than forcing an opening script.
- The Draft Call pressure harness now runs 2,440 deterministic mocks after every material board refresh: 120 from each of 12 slots plus 1,000 in the personalized keeper room. The first run maintained 100% valid-starter completion, zero missing calls, and zero elite VOR ratings below the absolute-value floor. It also caught and repaired a percentile-only VOR inflation bug before release. Run it with `npm run fantasy:pressure-test`.
- Separated pre-draft value from live draft urgency. The board now displays our rank, direct ADP delta, model/user/both target attribution, evidence quality, and freshness independently instead of collapsing those concepts into `Risk`.
- Removed categorical dossier stances from board, opponent-simulation, live-recommendation, and conditional-portfolio scores; continuous projection, role, robustness, price, and refresh inputs now drive those calculations.
- Expanded the draft room with the manager roster, position counts, upcoming-team starter/flex gaps, expected position selections, tier-survival probability, player make-it-back probability, and run pressure.
- Corrected live pressure semantics: tier survival is clamped to 0–100%, and a large tier cliff no longer becomes high run risk without modeled demand or depletion probability.
- Added `docs/ALGORITHM_REVIEW.md` with the full two-engine strategy, input reliability audit, calculation flow, guardrails, and remaining validated keeper-resolution dependency.
- Repaired the live draft-data backbone after the private FantasyPros response contracted to 34 players: the board now requires the full public FantasyPros PPR consensus pool, overlays current Fantasy Football Calculator overall 10-team PPR ADP, and uses the private response only for matched projections.
- Added a visible data-integrity gate. The August 13 live run passed with 430 ranked players and 209 verified overall ADPs; truncated pools now show a blocked warning instead of a misleading live badge.
- Corrected FantasyPros PPR projection normalization to read `rec_rec` and `points_ppr`, and stopped treating total fumbles as fumbles lost.
- Anchored static board ranks to acquisition cost and removed the incomplete-pool replacement fallback. After the projection and replacement-level recalibration, the verified live run places Josh Allen at #30 and Trey McBride at #35 instead of #5 and #9.
- Recalibrated draft-day labels after the live position audit: shared flex replacement demand now follows expected market-acquisition order, current public FantasyPros projection rows are rescored with the league settings, and `Value`/`Early` labels require agreement between structural model edge, direct ADP, and value over replacement. This removed the position-wide TE/WR/RB labeling bias.
- Added a research-only QB and rookie metrics lane with zero rank impact. QB profiles separate designed runs, scrambles, EPA/dropback, CPOE, and touchdown sustainability. Rookie RB profiles prioritize college production (35%), reviewed NFL situation (30%), and season rushing-yard market (25%), with draft capital limited to 10%. Historical activation requires five held-out seasons, sufficient samples, at least 5% MAE improvement over the market baseline, and a three-point hit-rate lift.
- Generated and integrated a keyless 192-player 2026 rookie college snapshot from SportsDataverse `cfbfastR` 2020–2025 play-by-play plus nflverse identity, covering older prospects' COVID-era eligibility. Career production is pooled without recency weighting. The shadow layer now adjusts projected football stats and rescores them under the exact league rules; it does not infer weekly yardage bonuses from season totals, and incomplete QB rushing histories remain at zero movement. The live board retains its existing bonus approximation until game-count inputs are available, so this research change does not move production ranks.
- Incorporated the net-neutral framework's validated advanced-usage pieces: formal WR/TE WOPR, within-position Z-score standardization, target/reception-heavy RB opportunity, play-level expected TD regression, and bounded age fragility without a duplicate median penalty. Fixed the canonical nflverse crosswalk so 343 of 430 live candidates receive historical usage. Route-based TPRR/participation and standalone inside-the-10 HVT remain visibly withheld until full-coverage feeds exist. The live audit kept Josh Allen #28, Trey McBride #29, and Brock Bowers #41 with mixed—not position-wide—value labels.
- Completed the draft-readiness workflow: official order/team/keeper text now resolves through an atomic canonical receipt, keeper costs consume the correct snake picks, live tracking skips keeper slots, saved state is rebuilt against the current pool, Undo preserves keepers, and full Yahoo snapshots can recover missed picks atomically. Weekly nflverse history now projects explicit 300/100-yard qualifying-game counts for exact bonus scoring. A 2025 held-out validation improved advanced-usage MAE 4.5% RB, 6.4% WR, and 4.2% TE versus prior-PPG regression; QB/rookie research remains separately gated.
- Added the live shadow-board/data phase: nflverse player identity now recognizes 57 current rookies without mutating production identity, nflverse season stats populate partial passing evidence for 46 QBs, and the pre-draft board exposes 103 research profiles in a separate Shadow view. Profiles with missing critical evidence show blockers but receive zero shadow movement; the verified production board remained byte-for-byte unchanged.
- Upgraded the dedicated rookie-WR activation pipeline to component/residual v2: targets/game, catch rate, yards/target, TD/target, and rushing points are now modeled separately across 217 player-seasons and seven expanding-window holdouts. NFL opportunity alone improved MAE from 2.827 to 2.743 and Spearman from 0.565 to 0.623. College target-quality features (EPA, success, first downs, scoring-area share, explosiveness, and teammate-relative YPT) did not improve the combined challenger or rare WR3 PR-AUC, so the generated production gate remains fail-closed.
- Repaired public rank-derived receiver stat lines by scaling their scoring components proportionally instead of subtracting only receiving yards. The refreshed 440-player board moved Makai Lemon from an impossible 65.8-catch/142.8-yard line to a coherent roughly 59-catch, 577-yard, 4.6-TD line after his 775-yard season-market correction.
- Added nested rookie-WR model selection and direct/proxy ADP segmentation. The earlier opportunity-only edge did not survive nested selection: selected MAE regressed 1.0%, Spearman fell 0.012, direct-ADP opportunity MAE regressed 5.0%, and zero of seven selected holdouts improved. Opportunity did improve the proxy-ADP ablation by 5.4% MAE and +0.105 Spearman, so the serialized ±8% target-volume model is visible only as a proxy-priced shadow comparison; direct ADP is explicitly trusted and production ranks remain unchanged.

- Added a projection robustness layer with downside/base/ceiling scenarios, fragility scoring, and conviction dossiers.
- Added an expected-opportunity layer so the bespoke board can compare projected medians against a cleaner workload-driven fantasy baseline instead of only raw prior scoring.
- Added a role-security / competition-pressure layer so committee-risk and target-competition profiles take a small trust penalty while concentrated roles get a small stability bump.
- Added a live Draft Plan layer that turns league format, current round, roster construction, and model recommendations into phase-specific checkpoints, patient one-starter guidance, upside-bench rules, and a model-backed target queue.
- Added keyless ffopportunity ingestion from the official weekly nflverse-derived release, replacing coarse expected-points estimates with play-level expected yards, touchdowns, fantasy points, and weekly consistency when available while retaining the existing heuristic fallback.
- Added automatic NFL-season evidence rollover: completed-season data remains the preseason prior, partial current-season workloads are annualized and blended from 18% after Week 1 toward a capped 90% after Week 10, and missing current-season releases fall back without breaking the board.
- Added a server-only The Odds API provider for weekly NFL player props. It de-vigs over/under prices, builds cross-book consensus lines, applies capped per-game-rate adjustments to raw 2026 stat projections, tracks quota usage, and remains disabled unless `THE_ODDS_API_KEY` is configured.
- Added a keyless Win With Odds season-market provider using its intended public CSV export. Top-300 QB/RB/WR/TE stat lines are blended into the raw projection stack at 25% with per-stat caps, source provenance, and explicit separation from direct sportsbook-line claims.
- Added an actionable Market Disagreement Board that separates supported targets, price-sensitive avoids, and unresolved model-versus-season-market conflicts, with consensus/model ranks, Yahoo points, acquisition windows, evidence, and cautions.
- Added full-season role-context correction: when season-market attempts/receptions and yardage clearly imply a starter workload missing from the baseline, the projection blend increases from 25% to 65% with an explicit `expanded-role-or-health-rebound` label instead of allowing prior injury or backup usage to dominate.
- Market disagreements with that inferred context and low confidence now route to `contested` rather than issuing a false-precision target or avoid until explicit health/depth-chart evidence is available.
- Replaced the legacy single confidence heuristic with Evidence Confidence v2: projection (35%), role/availability (30%), robustness (20%), and price (15%). Identity is now an evidence gate, source freshness remains board metadata, and rank-based ADP proxies lower price confidence without contaminating player projection confidence.
- Reframed those confidence dimensions as non-combined evidence diagnostics and added structured player context for current role, health, track record, continuity, and environment. Reviewed Lamar Jackson and Malik Willis contexts establish the intended distinction between healthy elite continuity and a promoted limited-sample starter in an uncertain environment.
- Added a one-time 2026 qualitative context snapshot covering 269 players, including 165 with multiple sources:
  - normalized public FantasyPros, RotoWire, NFL.com, and user-supplied Reddit analysis into short attributed claim tags without retaining raw write-ups
  - stores source URL/date and source-text hashes, preserves cross-source agreement/conflict, and surfaces provenance in the War Room
  - manager/manual context remains authoritative; rankings and target sentiment cannot overwrite role or health facts
  - current injury evidence can mark recovery or active concern, while absence of injury language never implies healthy
- Added a scoring-profile layer that distinguishes volume-backed projections from touchdown-fragile ones and feeds small median/stability adjustments into the bespoke board.
- Added tier survival and position-run pressure so pick windows now reason about what is likely to disappear before the next turn.

- Added a provider-neutral refresh layer for injury, role, camp, ADP, depth-chart, holdout, and offense-level signals.
- Added a manual draft-week override path through `FANTASY_REFRESH_SIGNALS_JSON`, so late local notes can flow into the same refresh engine without waiting on a full provider integration.
- Added a FantasyPros-style refresh normalizer so live news/injury payloads can be mapped into the same signal contract once real endpoint payloads are verified.
- Added the first Yahoo browser-provider exploration scaffold:
  - provider-neutral `ProposedTransaction` types for add/drop and trade ideas
  - Yahoo URL inspection and manual action-handoff planning
  - local `/api/fantasy/yahoo-extension` validation route
  - a lightweight Chrome extension scaffold for draft-room probes and local envelope posting
- Added a local Yahoo bridge console in the War Room:
  - full browser-extension envelopes can now be pasted into the fantasy route
  - the console previews Yahoo page classification, bridge metadata, and recent pick text
  - `draft-sync` envelopes can stage or apply normalized Yahoo draft events through the existing importer path
  - bridge snapshots now persist locally, compare against the previous saved envelope, and flag stale-likely or no-new-picks states while surfacing incremental picks

### 2026-08-25

- Standardized every opponent selection simulation on the same neutral blend of current market cost, board value, live roster construction, positional need, and bounded uncertainty.
- Removed the unused optional setup intake and legacy persisted fields; new setup and draft-state storage versions prevent those fields from returning.
- Made live pick windows keeper-aware and slot-specific: simulations now skip occupied future picks, classify one-team short turns as pair-building decisions, classify 12-plus-selection wraps as long-gap exit picks, and adjust urgency accordingly.

## Recommended next slice

1. Add real provider clients behind interfaces.
2. Import one actual league scoring config.
3. Replace fixture candidate data with FantasyPros-backed draft data.
4. Add a Yahoo draft event fixture parser and manual pick-entry workflow.
5. Build a Yahoo browser extractor against the new draft-event contract.
6. Expand the draft engine into a fuller room-wide neutral simulation.
