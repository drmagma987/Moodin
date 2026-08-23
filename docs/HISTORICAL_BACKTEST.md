# Fantasy Draft Historical Backtest

The historical model lab replays the 2023–2025 preseason draft rooms with the current model architecture and H-Town Heroes scoring. This is the primary validation window; older seasons are reserved for targeted stress tests rather than equal-weight tuning evidence.

## Run it

```bash
npm run fantasy:historical-backtest
```

The command refreshes `lib/fantasy/data/historicalBacktestReport.generated.json`. The report is visible at `/fantasy-football/backtest`.

## Time-machine contract

For season `Y`, the model may use:

- archived preseason FantasyPros full-PPR ECR for season `Y`;
- Fantasy Football Calculator's historical 10-team PPR ADP for season `Y`;
- nflverse weekly player data from season `Y - 1`;
- the league's exact custom scoring and roster demand.

Season `Y` nflverse data is loaded only after the board is frozen and is used solely to grade the predictions. The replay disables qualitative context so current news and current player notes cannot leak backward.

## Outcome views

- **Realized:** exact custom-scoring season totals, including 6-point passing touchdowns and counted 300/100-yard weekly bonuses.
- **Availability adjusted:** 17-game pace for players with a recorded stat in at least six games. This is an availability sensitivity test, not a claim that every absence was injury-related.
- **VOR outcome:** player points relative to the replacement demand implied by the league's 10 teams, starters, and two flex positions.

The headline comparison includes Spearman rank correlation, mean absolute rank error, top-48 hits, and head-to-head wins when model and stock differ by at least six ranks. Diagnostics also report position and draft-range performance using equal-weight season averages, plus a deterministic 2,000-sample bootstrap interval for the model's rank-MAE edge.

## Tuning policy

The generated report turns repeated results into `keep`, `tune`, `shadow`, and `data` suggestions. It does not mutate production weights. A production change should require a football rationale, cross-season support, and a fresh shadow/pressure test; a change that only improves the historical answer key is rejected as overfit.

The roster gate runs 12-round snake drafts from every slot in the canonical 10-team league with stock-driven opponents and starter requirements. Candidate middle-round authority factors are trained on two seasons and evaluated on the third, rotating every season through the held-out role. A factor must improve at least two of three held-out roster outcomes before it can enter live shadow testing.

## Draft-call semantics

- `Target` is the strongest static positive label on the preseason board.
- `Smash Now` exists only in the live room. It requires a supported Target-quality profile, at least three VOR stars, a meaningful fall past direct ADP, low make-it-back or tier-survival probability, and a non-blocked roster fit.
- The rounds 4–10 value pocket is a context queue. It does not multiply production ranks unless a future leave-one-season-out roster test clears the promotion gate.

## Interpretation limits

This is a reconstruction using today's architecture, not the code that existed in those summers. The general board replay remains directional rather than proof. Rookie WRs now have a separate 2016–2025 time-machine dataset and seven-season expanding-window gate documented in `docs/ROOKIE_WR_VALIDATION.md`. That lane failed its predictive thresholds and remains shadow-only; historical season-yard markets are still unavailable and are never synthesized.

## Public sources

- FantasyPros archived PPR rankings: `https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php?year=YYYY`
- Fantasy Football Calculator historical ADP API: `https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=10&year=YYYY`
- nflverse weekly player stats: `https://github.com/nflverse/nflverse-data/releases/tag/stats_player`
