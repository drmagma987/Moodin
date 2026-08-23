# Rookie WR Validation and Production Gate

Last updated: August 14, 2026

## Result

The rookie-WR lane is fully wired but not active in production. Version 3 added nested lane selection: every outer holdout chooses its research lane and ridge penalty using only earlier seasons. This removes the hindsight involved in noticing that opportunity-only looked best after viewing all holdouts.

- nested market MAE: 2.843 PPG
- nested selected-model MAE: 2.872 PPG (1.0% worse)
- nested rank lift: -0.012 Spearman
- holdouts with lower selected-model MAE: 0 of 7
- direct-ADP opportunity MAE: 5.0% worse; rank lift -0.056
- proxy-ADP opportunity MAE: 5.4% better; rank lift +0.105
- nested WR3 precision-recall AUC lift: -0.011

The conclusion is narrower and more useful: opportunity is not allowed to overrule real preseason ADP, but it may help where ADP is only a draft-pick proxy. That proxy-only result was discovered during this analysis, so it remains a visible shadow hypothesis rather than a production promotion. Direct-ADP rookies explicitly retain their market projection. Raw classification accuracy remains excluded because only 24 of 217 holdout rookies were WR3 hits.

## Time-machine design

The generator reconstructs rookie classes from 2016–2025. Classes from 2016–2018 supply initial training history; every 2019–2025 class is predicted only from earlier classes.

Inputs available before each NFL season:

- SportsDataverse `cfbfastR` college play-by-play from 2014 through the year before the rookie season
- nflverse identity, birth date, NFL draft team, and exact draft pick
- Fantasy Football Calculator final preseason 10-team PPR ADP
- nflverse opening depth chart for NFL roster and role-path evidence

Outcome data is joined only after predictions are frozen:

- nflverse regular-season weekly PPR scoring
- the league's two-point 100-yard receiving bonus applied game by game
- each season's 36th-highest qualifying WR PPG as the WR3 threshold

The market baseline separately predicts targets per game, catch rate, yards per target, receiving touchdowns per target, and rushing points per game from preseason ADP and exact draft pick. Research models residuals in two independent lanes:

- NFL opportunity: top-three depth path, depth order, college opportunity, and breakout result
- target quality: college target EPA, success rate, first-down rate, yards per target, catch rate, explosiveness, teammate-relative YPT, and scoring-area target share

The report includes market, opportunity-only, target-quality-only, full, and nested-selected results plus direct-ADP/proxy-ADP segments. It serializes the final opportunity target model so the War Room can show a bounded market-versus-opportunity comparison. The model changes target volume only, never a generic talent percentage, and is capped at ±8%. Historical season-yard markets are not synthesized.

## Reproduce

The generator requires Python with `pandas`, `pyarrow`, and `numpy`. It downloads and caches public source files outside the repository.

```bash
python3 -m pip install -r scripts/requirements-fantasy-research.txt
npm run fantasy:rookie-wr-validation
```

It writes `lib/fantasy/data/rookieWrValidation.generated.ts`. Production behavior is controlled by:

```bash
FANTASY_ROOKIE_WR_MODEL_MODE=shadow
```

Accepted modes are `off`, `shadow`, and `production`. Even `production` cannot change a projection unless the generated report clears every activation gate. This is the rollback and fail-closed boundary.

## Next research iteration

Do not combine every available signal by default. Version 3 says the next production candidate is specifically a proxy-ADP opportunity correction, and it needs a new untouched rookie class or a newly recovered historical preseason market before activation. Direct-ADP rookies should continue to trust the market. The ceiling/hit model still needs genuinely distinct evidence such as routes, targets per route, or separation/coverage context.
