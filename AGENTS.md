# AGENTS.md

Project handoff notes for future Codex sessions working on Moodin.

## Project Overview

Moodin is a mobile-first, head-to-head football draft game built with Next.js App Router, React, TypeScript, Tailwind CSS, Firebase Auth, and Firestore.

The core loop is:

1. Create or join a multiplayer room.
2. Both players ready up.
3. Draft a team.
4. Review recap and lock strategies.
5. Watch the simulated game.
6. Continue a best-of-3 series with keepers, free agency, retool drafts, and retirement.

The app is multiplayer-first. Firestore room state is the source of truth. Avoid adding localStorage/local-only game state for multiplayer flow unless it is only a convenience preference, like audio mute state.

## Key Commands

Use these before handing off changes:

```bash
npm run lint
npx tsc --noEmit
```

Common deploy flow:

```bash
git add <specific files>
git commit -m "<clear message>"
git push
```

The user currently prefers targeted `git add` commands instead of `git add .`.

## Important Files

- `app/page.tsx`: landing page, create/join room flow.
- `app/room/[roomId]/page.tsx`: lobby, ready-up, automatic draft start.
- `app/draft/page.tsx`: draft board, scouting tokens, roster panels, filters, starter locks.
- `app/recap/page.tsx`: draft recap, team ratings, strategy locking, sim kickoff.
- `app/results/page.tsx`: game results, score reveal, box score, series continuation/rematch.
- `app/series/page.tsx`: between-game keeper/free-agency flow.
- `components/background-audio.tsx`: persistent music toggle and mp3 playback.
- `components/room-sync-notice.tsx`: shared notice explaining refresh/back-button safety.
- `lib/firebase.ts`: Firebase initialization from `NEXT_PUBLIC_FIREBASE_*` env vars.
- `lib/room.ts`: Firestore room schema and multiplayer-safe room transactions.
- `lib/series.ts`: keeper aging, free agency pool logic, retirement rules, series messaging.
- `lib/sim.ts`: team profiles, strategy modifiers, drive events, game simulation, player stat generation.
- `lib/game/prospects.ts`: draft class generation, combine metrics, hidden attributes, projected rounds.
- `lib/game/playerRatings.ts`: rating helpers and IQ labels.
- `lib/game/scouting.ts`: scouting-token range logic.
- `lib/game/types.ts`: shared football/player types.

## Current Gameplay Systems

### Multiplayer State

Room state lives in Firestore under `rooms/{roomId}`.

Important room fields include:

- `status`: `lobby`, `draft`, `recap`, `results`, or `betweenGames`.
- `seriesGameNumber`, `seriesWinsA`, `seriesWinsB`, `seriesWinner`.
- `teamA`, `teamB`, `draftedIds`, `pickNumber`, `totalDraftPicks`.
- `keepersA/B`, `keepersLockedA/B`.
- `carriedPlayersA/B`.
- `freeAgencyPool`, `freeAgencyChoiceA/B`, `freeAgencyLockedA/B`.
- `scoutTokensA/B`, `scoutingA/B`.

Navigation should remain status-driven using `getRoomStatusHref(...)`.

### Draft

Game 1 is a full draft to 10 players per team: 8 starters plus 2 bench players.

Games 2 and 3 are shorter retool drafts:

- Keep 3 players.
- Sign 1 free agent.
- Draft until rosters reach 10 players while starter requirements are enforced.

Starter requirements:

- `QB: 1`
- `RB: 1`
- `WR: 2`
- `TE: 1`
- `DL: 1`
- `LB: 1`
- `SEC: 1`

Draft cards intentionally show combine/scouting information, not exact hidden ratings:

- height
- weight
- 40 time
- bench
- vertical
- IQ label
- projected round
- private scouting ranges when unlocked

### Scouting Tokens

Each user gets private scouting tokens per draft:

- Game 1: 8 tokens.
- Games 2 and 3: 5 tokens.

Scoutable attributes:

- speed
- skill, stored internally as `technical`
- power

IQ is always visible and cannot be scouted.

Token behavior:

- first token on an attribute reveals a width-10 range
- second token tightens to width-3
- ranges are private to the side that scouted

### Player Model

Players have hidden/true core ratings:

- `speedRating`
- `technicalRating`
- `powerRating`
- `iqRating`

`trueGrade` is a derived blended overall and should generally remain a hidden summary value.

Visible scouting metrics are directional, not exact 1:1 mappings.

### Series Flow

Best-of-3 series:

- First to 2 wins wins the series.
- After Game 1 and non-terminal Game 2, go to keeper phase.
- Then free agency.
- Then retool draft.

Career stages:

- `Rook`
- `Prime`
- `Unc`

`Unc` is the final playable year. After an `Unc` season, the player retires.

Some rookies jump directly from `Rook` to `Unc` between games to create churn.

### Free Agency

Free agency is intentionally short:

- pool of about 4-6 players
- each player secretly chooses 1 target
- contested signing uses series-state tiebreak rules
- losing side gets a replacement/consolation pick

Free agents show automatic scouting-style ranges because they have existing game data.

### Sim And Strategy

Strategies:

- Offense: `Balanced`, `Pass Heavy`, `Run Heavy`
- Defense: `Balanced`, `Pressure`, `Coverage`

Strategy should matter as a multiplier on roster identity, not as a magic override.

The sim currently uses lightweight drive events:

- explosive gains
- pressure stalls/sacks
- turnovers
- red-zone/scoring finishes
- line-by-line quarter highlights
- correlated player/team box score stats

## UX Principles

- Keep the app mobile-first.
- Avoid long management screens.
- Drafting should remain the main event.
- Between-game flow should be fast: keepers, one FA decision, then draft.
- Avoid surprise audio. Music must stay muted by default.
- Keep opponent scouting/ratings hidden where appropriate.
- Use clear waiting/locked states in multiplayer.

## Firebase / Deployment Notes

Firebase config should come from env vars:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Do not hardcode Firebase keys in source.

Deployment target is Vercel.

After env changes in Vercel, redeploy.

## Current Progress Log

Use this section for intermittent progress notes between chat windows. Prefer dated bullets with the gameplay problem, the user-facing change, and any verification that passed.

### 2026-04-19

- Added or maintained a persistent background music system.
- Replaced procedural music with `public/we-are-charlie-kirk.mp3`.
- Music defaults to muted and persists through route changes via the root layout.
- Updated music toggle to show a larger text toggle on the landing page and compact icon toggle on later screens.
- Added a back-button safety pass using `components/room-sync-notice.tsx`.
- Home create/join navigation uses `router.replace(...)` to reduce accidental back-outs.
- Added room sync notices on multiplayer screens.
- Tightened between-game flow:
  - Game 1-to-Game 2 copy uses 3 keepers.
  - Keeper cards no longer duplicate last-game stats.
  - Free-agent cards show last-game stat context where available.
  - Increased rookie-to-`Unc` churn.
  - Retool drafts use fewer scouting tokens.
  - Starter-fill enforcement is handled in the Firestore draft transaction.
- Rebalanced prospect IQ/technical variation and team rating formulas so categories are less predictably pass/secondary-skewed.
- Added private scouting-token system:
  - private per-side ranges
  - speed/skill/power scout buttons
  - IQ always visible
  - recap payoff notes for real scouted steals/busts.
- Began next-version post-playtest draft UX pass:
  - Prospect cards no longer draft on whole-card tap, reducing accidental mobile picks while scouting/tagging.
  - Added explicit per-player `Draft` button with disabled labels for waiting, completed drafts, and roster-rule blocks.
  - Waiting players can still read, tag, and scout the board instead of seeing every prospect grayed out.
  - Added quick card context for build fit, position market scarcity, and private scouting status.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Continued post-playtest sim/results tuning:
  - Results page now hides final score, game winner, series totals, box scores, and next-step actions until the animated game reveal completes.
  - Live in-game score still updates during the reveal for suspense.
  - `Draftable` filter now temporarily shows the full board while waiting on the other drafter, then resumes when it is the user's turn.
  - Visible `TEC`/Technical labels changed to `SKL`/Skill while preserving the internal `technicalRating` model.
  - Sim scoring pace raised toward a 31-28 style game.
  - Offensive totals are normalized from the simulated score before player stats are distributed, with primary QBs receiving essentially all team passing output.
  - Quarter bullets were rewritten as sports-ticker highlights for scores, big plays, turnovers, and clutch stops.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Added a first-pass visual sim engine:
  - Each quarter highlight now carries possession, event type, start/end yard lines, and yardage metadata.
  - Results page renders a rudimentary football field with a moving possession dot and drive arrow as highlights reveal.
  - The visual field is intentionally drive/event based, not full 11-player animation yet.
  - Existing text timeline, live score reveal, and box-score flow remain intact.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Tuned sim reveal pacing:
  - Highlight reveal timing is now slower so users can read and digest each drive result.
  - Scoring plays hold longer than normal events.
  - TD and FG events trigger a full-screen `TD/FG Team!` callout before the reveal continues.
  - Final reveal waits for any active scoring callout to finish.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Added explicit fumble support:
  - Turnover events now resolve as interceptions or fumbles instead of generic turnovers only.
  - Offensive box scores track fumbles lost.
  - Defensive box scores track forced fumbles and fumble recoveries.
  - Pressure defense increases strip-sack style fumbles; run-heavy offense exposes more ball-carrier fumbles; Coverage remains more interception-skewed.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Added broadcast/drama pass:
  - Sim highlights now include drive summaries and close-game metadata.
  - Results field view includes a mini scoreboard, win-probability meter, one-score-finish banner, and post-game MVP award.
  - Turnovers trigger full-screen `PICK`, `FUMBLE`, or `STRIP SACK` callouts.
  - Close fourth-quarter moments reveal more slowly.
  - Strategy selectors now explain pros/cons and show matchup counter hints.
  - Draft note buttons are labeled `Target` and `Fade` instead of emoji-only buttons.
  - Free-agency resolution adds a short offer-envelope suspense reveal before showing the result.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Fixed recap simulation stall:
  - Firestore rejected sim highlights with `eventDetail: undefined`; non-turnover highlights now omit that field.
  - Sim finalization is deterministic and no longer depends on only the host client running it.
  - `finalizeSeriesGame` preserves the already-stored result if a second client races to finalize.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Follow-up recap stall fix:
  - The quarter merge step was reintroducing `eventDetail: undefined`; merged highlights now omit unset details too.
  - `finalizeSeriesGame` sanitizes sim results before writing to Firestore as a defensive guard.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Upgraded the results simulation reveal:
  - Sim highlights now represent individual plays within drives instead of only drive outcomes.
  - Play events include believable quarter clocks, player-credit copy, yardage movement, sacks, scoring plays, and turnover details.
  - The results field view now has a pronounced top scoreboard with quarter/time and score as the primary live display.
  - Removed duplicate live score cards below/inside the field view.
  - Added halftime and final scoreboard holds, including a `Team Wins!` final display before post-game actions unlock.
  - Verified with `npm run lint` and `npx tsc --noEmit`.

### 2026-04-20

- Improved the results simulation field view:
  - Individual plays now animate with a football marker instead of a generic dot.
  - Passes and sacks use dashed arced arrows; runs and other grounded plays use solid straight arrows.
  - Endzones are fixed to Team A on the left and Team B on the right, with possession direction shown in the field.
  - Win probability is more conservative early and only reaches extreme values later in the game.
  - Play-by-play logs now call out possession changes, including explicit turnover handoffs.
  - Average generated play count per drive was reduced by about 15% while keeping 15-minute quarters.
- Added halftime adjustments:
  - Recap now simulates only the first half before sending players to results.
  - Results pauses at halftime and lets each player secretly switch offense and defense strategy.
  - Once both halftime plans are locked, quarters 3-4 simulate from the actual halftime score and the full result is finalized.
  - First-half and second-half player/team stats are merged for the final box score.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Added a halftime locker-room read:
  - Results derives a one-sentence, side-specific first-half assessment from visible score, turnovers, sacks, explosives, and scoring patterns.
  - The assessment appears once the halftime reveal completes so players can make a more informed adjustment without exposing hidden strategy choices.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Tuned sim reveal pacing after halftime was added:
  - Normal plays, scoring holds, close moments, halftime, and final scoreboard holds were shortened to make the game feel more like a brisk RedZone-style reveal.
  - Scoring and turnover callouts still keep their dramatic overlay timing.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Repaired halftime and field animation behavior:
  - Room state now stores first-half and second-half sim results separately so halftime can resume into Q3 instead of replaying Q1.
  - Both players can keep selecting halftime adjustments independently until their own side locks.
  - The field view no longer shows drive summaries that spoil the drive result.
  - Football laces now move as part of the football, and play arrows use steadier sizing with black positive-yard arrows, red negative-yard arrows, dashed passes, and solid runs/sacks.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Refreshed the landing page branding:
  - Added `public/moodinlogo.png` from the supplied Moodin crest.
  - Reworked the home screen around the logo with a stronger mobile-first create/join room panel.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Shortened draft roster size:
  - New full drafts now use 20 total picks, giving each team 8 starters and 2 bench players.
  - Retool drafts continue targeting the same 10-player roster size.
  - Prospect projected rounds now cap at 10 to match the shorter draft board.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Expanded scouting from 3 lanes to 4:
  - Speed and Power remain combine-proxy scouting categories.
  - Skill now represents current football polish and uses the existing technical rating under the hood.
  - Potential was added as a derived film/upside grade influenced by true grade, position traits, archetype, and career stage.
  - Draft cards now group scouting buttons into Testing and Film sections.
  - Free-agent projected reports include Potential, and recap exposes Potential in the team breakdown.
  - Legacy `technical` scouting reports still display/tighten as Skill for active rooms.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Repaired play-by-play simulation reveal pacing:
  - Sim highlights now carry drive identity and down/distance context.
  - Quarter merging alternates full drives instead of individual snaps, preventing possession from flipping every update.
  - Punt drives now include an explicit punt snap before the next possession.
  - Results reveal uses a 1.5-second normal-play cadence, keeps important-play holds, animates the football from snap point to result, and shows a recent rolling play log.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Overhauled sim possession realism:
  - Results now resumes from Q3 whenever both stored halves exist, avoiding Q1-Q2 replay after halftime locks.
  - The sim now generates sequential possessions instead of independent per-team drive lists, so punts, turnovers, scores, and next field position are correlated.
  - Punt outcomes include returns/touchbacks, field goals can miss based on distance, and punt sequences show a third-down stop followed by one fourth-down punt.
  - Normal play reveal cadence moved to 2 seconds, and generated games target a longer 55-70ish visible-play flow.
  - Field arrows now use SVG marker arrowheads attached to the line while the football animates separately.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Continued halftime/sim tuning:
  - Halftime timeline keys no longer depend on full Firestore result serialization, preventing strategy-lock room updates from restarting the Q1-Q2 reveal for the other player.
  - Halftime reveal completion now persists while waiting for both strategy locks, so the second half starts from Q3 once both sides are locked.
  - Scoring was raised toward a more arcade pace with more scoring-range drives, stronger touchdown odds, and more possessions.
  - Minor-gain plays reveal faster than explosive, scoring, turnover, and missed-kick events.
  - Results rating rebuild now weights the best same-position players as starters, including WR1/WR2 ordering.
  - Missed FGs now trigger a dramatic callout, punt animations end at the post-return/touchback field position, and arrowheads were reduced in size.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Hardened halftime lock finalization:
  - `saveHalftimeStrategy` now runs as a Firestore transaction and returns the confirmed room state after applying the player's lock.
  - The locking client immediately starts/finalizes Q3-Q4 if that confirmed state has both halftime strategies locked, instead of relying only on a later subscription snapshot.
  - The existing snapshot-based second-half finalizer remains as a guarded fallback to avoid duplicate finalization.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Added coin toss kickoff flow:
  - After both recap strategies lock, Firestore creates a coin toss with a random caller.
  - The selected caller chooses heads/tails, the toss resolves, and the winner chooses receive or defer.
  - Opening and second-half possession are stored in room state and passed into the Q1 and Q3 simulations.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Tightened sim chain/late-game rules:
  - Drive highlights now insert realistic setup downs before field goals, punts, and fourth-down attempts so down/distance and yard line context align more closely with the actual spot.
  - Stop drives are constrained to avoid accidental hidden first downs before punts.
  - The score bug and play log now show ball position in `1st & 10 at VJ 35` style.
  - Tied games automatically continue into sudden-death overtime with random first possession and first score wins.
  - Late fourth-quarter teams down multiple scores are more likely to go for it on fourth down near midfield/opponent territory, with dramatic conversion/turnover-on-downs overlays.
  - Prospect generation now stores a hidden potential ceiling, and series aging lets high-potential players break out in Prime while Rook-to-`Unc` jumps still retain a meaningful portion of that upside.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Added the Diaz halftime show overlay:
  - Copied the supplied GIF into `public/diaztablegif.gif`.
  - Results field view now overlays the looping GIF and caption only while the room is in halftime adjustment mode.
  - The overlay is pointer-events-free and disappears before second-half simulation resumes.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Updated the results play log ordering:
  - Quarter play-log cards and their visible plays now render newest-first below the simulator.
  - The most recently revealed play stays closest to the field view as the simulation advances.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Validated and repaired sim down/distance continuity:
  - Added a one-off simulation consistency harness over 9,000 generated game variants and 703,792 plays.
  - Fixed punt-drive setup so continued drives visibly earn conversions and final punt setup plays cannot accidentally reset down/distance.
  - The harness found zero remaining down/distance mismatches, possession skips, punt handoff mismatches, or fourth-down continuation errors.
  - Verified with `npm run lint` and `npx tsc --noEmit`.
- Polished the results and landing-page UX:
  - Reduced play-arrow marker size on mobile while keeping the desktop arrowhead look intact.
  - Field-goal setup downs now use varied short gains/losses instead of repeated zero-yard placeholders before the kick.
  - Live win probability is now always rendered as whole-number percentages within a 1-99 style range.
  - Separated the landing-page player-name entry from the create/join room actions so it reads clearly as required for both paths.
  - Verified with `npm run lint` and `npx tsc --noEmit`.

## Ongoing Maintenance Notes

Future Codex sessions should update this file when they make meaningful feature, architecture, deployment, or gameplay-balance changes.

Prefer adding dated bullets under `Current Progress Log` rather than rewriting the whole file.

### 2026-05-28

- Began the `Jimmy's Bachelor Party Blitz` redesign in smaller implementation slices to avoid timeout risk.
- Loaded route-scoped CDN assets for GSAP, Particles.js, Splitting.js, Howler.js, and the Press Start 2P font on the bachelor-party page.
- Extended sponsor splash-card timing, added a named BR Studios image placeholder constant, and widened the end-screen name input to 11 characters with default `I LUV JIMMY`.
- Removed Cass from the active bachelor-party roster, made Katie the only warning-trigger dodge object with faster drops and `KP INBOUND - HIDE!` copy, and made Bill much rarer before the upcoming full Bill Mode redesign.
- Added a new presentation-only bachelor-party slice: Katie warning and `BACHELOR MODE` now render as DOM overlays ready for Splitting.js shatter text, Bachelor Mode applies subtle GSAP-driven screen breathing/hue cycling, and Particles.js runs behind the playfield during Bachelor Mode.
- Added the first audio/haptics slice for Bachelor Party Blitz: background music now has a route-local Howler placeholder hookup with automatic pause during Bill Mode, and navigator haptics now fire for normal catches, life loss, game over, and Bachelor Mode activation while staying quiet during ongoing Bachelor/Bill gameplay.
- Replaced the old Bill food/toilet timer mode with a standalone Bill mini-game overlay: catching Bill now pauses the normal board, runs the dialogue/chug sequence, transitions into the 4-second `BUST IT DOWN` door tap challenge, and resolves success/fail with score bonus or life loss before hard-cutting back to gameplay.
- Polished the new Bill mini-game presentation with GSAP-driven wine toss and chug staging, reactive door shake/crack buildup during the tap challenge, and stronger success/fail payoff visuals while preserving the rough-but-polished look.
- Added the remaining general-feel feedback pass to the live board: GSAP screen shake on life loss, catcher wobble feedback on successful catches, subtle object entry pop-in on spawn, and catch-burst particles around Jimmy when the player secures a good object.
- Added the real Bachelor Party Blitz background music asset at `public/music/background.mp3` and pointed the Howler music path at that public file instead of the earlier placeholder string.
- Smoothed the Bill Mode door flow for testing and playability:
  - dialogue and chug pacing are slower
  - drunk/sway effects wait until the beers are finished
  - a short `doorIntro` beat now separates the chug from the 4-second tap challenge
  - the door CTA explicitly tells players to tap fast to break it down
  - the door now uses direct pointer-down handling with calmer pre-countdown presentation
  - Verified with `npm run lint` and `npx tsc --noEmit` (`lint` still has the existing single-page font warning on the bachelor-party route).
- Expanded Bill Mode again:
  - added two post-chug story slides before the door sequence
  - increased the door timer from 4 seconds to 8 seconds
  - changed the door tap path to use a native `pointerdown` listener plus functional tap-state updates to address the tap counter stalling after the first press
  - Verified with `npm run lint` and `npx tsc --noEmit` (`lint` still has the existing single-page font warning on the bachelor-party route).

### 2026-05-29

- Added a rare glowing menorah bonus drop to `Jimmy's Bachelor Party Blitz`.
- Catching the menorah now restores 1 life only when the player is below the 8-life cap, while still awarding a small score bonus.
- Updated the bachelor-party splash instructions and kept the life cap explicit in the HUD-facing copy.
- Fixed the Bachelor Mode background-art layering bug:
  - the Angbeen artwork and Bachelor particles had been mounted under the opaque gameplay canvas
  - the Bachelor backdrop/flyby/particle layers now render above the canvas so they can actually appear during live play
- Tuned the latest Bachelor Party Blitz polish pass:
  - Bill Mode no longer pauses the background music
  - Katie warning drops now spawn fewer, more spread-out hazards with slightly calmer fall speed
  - the Bill Mode wine-glass intro visual is larger
  - the game-over screen now crops the end photo from the bottom and tightens spacing so the name input appears sooner on mobile
  - Verified with `npm run lint` and `npx tsc --noEmit` (`lint` still has the existing single-page font warning on the bachelor-party route).
- Updated the Bachelor Party route share preview:
  - copied the supplied portrait to `public/bachelor-party-blitz/share-preview.jpg`
  - wired the route Open Graph and Twitter metadata to use that image for iMessage/social link previews
- Added a lightweight Bachelor Party leaderboard:
  - game-over screen now lets players post their name and score to Firestore with one tap
  - posting reveals a scrollable leaderboard panel while keeping the `Play Again` button pinned at the bottom of the screen on mobile
- Expanded the Bachelor Party end-screen quotes:
  - the existing wrench quote now rotates randomly with `Mrs. Bodenstein is a Neanderthal with a 🍆`
- Adjusted the Bachelor Party end-screen layout again:
  - moved the leaderboard name field and post button into the main visible game-over stack while keeping the leaderboard box and `Play Again` anchored lower
- Updated the Bill Mode intro icon:
  - replaced the bearded-man emoji with a bald-man emoji
- Swapped the Bachelor Party leaderboard storage path:
  - leaderboard entries now persist inside a dedicated Firestore document under the existing `rooms` collection instead of a separate collection path
- Tightened the Bachelor Party end-screen spacing:
  - reduced the score-card number sizing and compacted the image, text, input, and buttons so the post flow fits more reliably on mobile without scrolling
- Retuned the Bachelor Party HUD and multiplier logic:
  - `BR Mult` now reads `BR Multiplier`
  - Bachelor Mode now temporarily adds `+1.0x` to the visible multiplier for standard catch/heal/mushroom scoring
  - Bill Mode door bonuses remain fixed and do not use the temporary Bachelor multiplier bonus
- Hardened Bachelor Party leaderboard auth:
  - leaderboard reads and writes now explicitly await anonymous Firebase auth before hitting Firestore
  - auth waits for a settled user token so mobile Safari/slow auth propagation is less likely to fail the post flow
  - Verified with `npm run lint` and `npx tsc --noEmit` (`lint` still has the existing single-page font warning on the bachelor-party route).

### 2026-05-30

- Added a fully isolated `Make It Rain` standalone route at `/make-it-rain` so beta testing stays off the live bachelor-party board.
- Built the new mini-game around 2D flick throwing, a left-right moving target with speed-up/fake-out behavior, capped 5x hit streak scoring, and a 3-miss game-over rule.
- Added a dedicated Firestore leaderboard helper/collection for `Make It Rain`, reusing the hardened anonymous-auth posting pattern without changing the existing bachelor-party leaderboard flow.
- Copied the supplied target image into `public/make-it-rain/target.jpg` as the placeholder target art.

Before final responses after code changes, usually run:

```bash
npm run lint
npx tsc --noEmit
```

If checks cannot be run, say so clearly.

### 2026-08-12

- Began the `Fantasy Football Supertool` kickoff as a separate foundation slice without replacing existing Moodin experiences.
- Added provider-neutral fantasy domain modules for scoring, canonical player identity, source ownership, fixtures, and first-pass draft valuation.
- Added a dedicated `/fantasy-football` route that demonstrates a fixture-backed War Room recommendation flow.
- Added living docs under `docs/` for architecture, data sources, decision logic, Yahoo capabilities, local hosting, and project status.
- Sharpened the fantasy draft engine beyond first-pass rankings:
  - added projection robustness scenarios with downside/base/ceiling paths, fragility scoring, and median stickiness signals
  - added player conviction dossiers that separate priority targets, pocket values, fragile bets, and market traps
  - added pick-window position-run modeling so tier survival and expected pre-wrap position picks influence recommendations
  - added a provider-neutral refresh signal layer for injuries, role changes, camp buzz, ADP movement, depth-chart changes, and holdout/offense context
  - added a manual draft-week override path through `FANTASY_REFRESH_SIGNALS_JSON` plus a FantasyPros-style refresh normalizer for future live news/injury feed hookup
  - added preferred-target labels that can come from the model, an approved analyst/user list, or both, while staying separate from the main recommendation engine
  - added live-draft reach guardrails and tier-wipe scenarios so the board can say how far you can justify reaching and what the pivot is if a mini-tier disappears before the wrap
  - began the in-season command-center foundation with provider-neutral usage snapshots, opportunity-trend classification, lineup-impact trade ideas, and a Tank01 RapidAPI-ready live-state seam
  - surfaced the new signals in the War Room with restrained UI additions focused on decision support
  - added executable TypeScript model tests via Node strip-types plus a local alias loader
  - Verified with `npx tsc --noEmit` and `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`.
- Added a FantasyPros provider scaffold with `FANTASYPROS_API_KEY` support, live-or-fixture draft-lab loading, and visible source-status messaging on the kickoff route.
- Corrected the Yahoo import after a demo PDF false start:
  - the actual `H-Town Heroes` league is a 14-team keeper format
  - roster is `QB, WR, WR, WR, RB, RB, TE, W/R/T, W/R/T, K, 6 BN, 1 IR`
  - scoring is full PPR with 6-point passing TDs, 300/100-yard bonuses, and kicker PAT-miss penalties
  - waivers are FAB with reverse-standings tiebreak and playoffs are 6 teams in Weeks 15-17
- Added a Yahoo draft-event importer and documented the extractor contract:
  - War Room now accepts pasted Yahoo-style JSON draft events
  - future browser extraction should emit one normalized event per pick instead of writing straight into UI state
- Upgraded the War Room from single-answer rankings into live market analysis:
  - draft recommendations now expose replacement baseline, PPR lift, bonus lift, and focus pressure directly in the UI
  - added a position-market panel that flags stable, thinning, and drying-up positions based on 14-team starter demand, flex pressure, available depth, and tier-drop cliffs
- Added dual-lens draft recommendations:
  - the War Room now separates best structural pick from best pure value pick when those answers diverge
  - recommendation explanations now explicitly surface board-discount/value-vs-market signals alongside roster-pressure signals
- Added pick-window guidance on top of the split recommendations:
  - structural and pure-value picks now each get a survive-the-wrap urgency read
  - the War Room now calls out when one side of the decision split is the player most likely to disappear before the next turn
- Tightened the projection backbone behind the War Room:
  - live FantasyPros candidate loads are now calibrated against FantasyPros market consensus instead of trusting only the raw stat-line point total
  - calibrated medians now blend exact custom-scoring output with ECR/ADP/tier neighborhood context and widen ranges using expert spread plus player/position volatility
- Added a true multi-source trust layer to the fantasy draft board:
  - official nflverse 2025 player stats now feed role and opportunity priors into projection calibration
  - official Sleeper player metadata and trending adds/drops now feed market-momentum signals
  - draft candidates now carry confidence, source count, role-prior, momentum, and disagreement notes so the board can explain which projections are sturdy versus fragile
- Added final-sharp board control layers:
  - the War Room now flags projection-over-market, market-over-projection, and role-fragile outliers instead of hiding disagreement inside a single rank
  - the draft engine now creates tier-break pivot plans so urgent structural targets have same-position fallbacks and cross-board alternatives before the next wrap
- Added staged draft-board workflow support:
  - the fantasy route now supports `working`, `draft-week`, and `final` board modes with distinct refresh policies and goals
  - personalized draft assumptions were updated to a 12-team room with a second-last slot, and the board now treats the first live swing as the post-keeper decision point
- Continued the Yahoo exploration track:
  - added provider-neutral `ProposedTransaction` types for future add/drop and trade recommendations
  - documented which Yahoo URL families appear stable versus still unverified for action handoff
  - added `lib/fantasy/yahooBridge.ts` to classify Yahoo URLs and build manual human-in-the-loop handoff plans
  - added `/api/fantasy/yahoo-extension` as a local validation endpoint for browser-extension envelopes
  - scaffolded `tools/yahoo-draft-extension/` for a lightweight draft-only Chrome extension that probes Yahoo pages and posts structured state to the local app
  - added a local Yahoo bridge console to the War Room so full extension envelopes can be pasted, previewed, staged into normalized draft-event JSON, or applied directly through the existing importer path
  - extended the bridge console with local persistence plus snapshot-to-snapshot comparison so stale envelopes, duplicate snapshots, and incremental picks are visible without leaving the route
  - verified with `npx tsc --noEmit` and `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`
  - follow-up when the 2026 league opens:
    - capture real draft-room, player-detail/add-drop, and trade-flow URLs
    - validate whether the authenticated Yahoo Chrome tab exposes stable player IDs and draft-state selectors
    - use that live session to tighten the extension from page-probe mode into populated draft-event extraction
- Completed the next two core fantasy build items:
  - added deterministic opponent wrap simulation to the draft engine so make-it-back, run pressure, position market, and wipe scenarios can be driven by simulated room behavior instead of only the original heuristic
  - surfaced wrap forecasts in the War Room with likely next-pick lanes and the most threatened targets before the next turn
  - added a provider-neutral in-season transaction engine with waiver/add-drop recommendations, FAAB-range guidance, structured transaction queue entries, and `ProposedTransaction` payloads on both waiver and trade ideas
  - expanded the `/fantasy-football` in-season section with Action Queue and Waiver Wire panels on top of the earlier opportunity and trade foundation
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Hardened the draft data substrate when the private FantasyPros feed proved unusable from this workspace:
  - corrected the FantasyPros scoring parameter from `HALF` to `PPR` so live requests line up with the actual Yahoo full-PPR league
  - reduced private FantasyPros request burstiness and added short 429 retries instead of firing the full ranking/projection fan-out at once
  - added `lib/fantasy/fantasyprosPublic.ts` so the draft lab can parse the public FantasyPros PPR consensus page and stay on a full board when the private API rate-limits
  - public fallback now keeps the downstream calibration/recommendation engine alive with direct embedded ADP where available and explicit rank-based market-cost proxies elsewhere, rather than dropping immediately to the tiny fixture pool
  - added model coverage for the public fallback parser and candidate builder
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Simplified the Yahoo comparison layer for baseline-board testing:
  - kept Yahoo as an explicit manual top-25 early-board overlay for v0 testing instead of building a brittle client-side article scraper around the August 10, 2026 Yahoo Sports full-PPR top-300 article
  - updated source-status messaging to describe this as a Yahoo editorial/comparison baseline rather than implying a live Yahoo browser-provider feed
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Rescoped the draft assistant back toward live usefulness:
  - added a true redraft-aware base board so QB and TE are valued through one-starter depth, replacement value, and position utility instead of raw season points alone
  - updated live recommendation copy to distinguish the current pick recommendation from the best market-value target, with explicit our-board rank vs market-rank context
  - movement log now compares market rank against the redraft-aware board instead of simple projection order
  - added model coverage proving an elite WR can outrank a higher raw-points QB in a normal 1QB redraft environment
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Added a first-pass veteran regression layer to the bespoke board:
  - added `lib/fantasy/regression.ts` to flag veteran RB/WR/TE profiles whose prior-year scoring appears to have run hot or cold relative to their underlying volume/opportunity
  - wired the regression signal into calibrated medians, robustness/stickiness, conviction notes, and the War Room signal strip without introducing another rankings source
  - added model coverage for positive regression, negative regression, and rookie skip behavior in v1
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Added a scoring-profile layer to sharpen the bespoke board without chasing more rankings inputs:
  - added `lib/fantasy/scoringProfile.ts` to classify projections as `volume-backed`, `balanced`, or `touchdown-fragile` from the same custom scoring rules plus nflverse priors already feeding calibration
  - wired the scoring-profile signal into calibrated medians, robustness, conviction dossiers, redraft-board scoring, and the War Room signal strip so TD-dependent profiles take a small fragility tax while volume-backed profiles get a small trust bump
  - added model coverage proving the layer separates volume-backed and touchdown-fragile profiles and that those tags influence downstream conviction
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Added the next two evidence layers to make the bespoke board more defensible without adding another rankings source:
  - added `lib/fantasy/opportunityMath.ts` plus `lib/fantasy/expectedOpportunity.ts` so the board can estimate a workload-driven fantasy baseline and compare it against both prior actual scoring and the current projected median
  - added `lib/fantasy/roleSecurity.ts` so the board can classify roles as `secure`, `balanced`, or `fragile` based on concentration, weekly usage, and committee-style pressure, with special skepticism toward low-target-share RB profiles
  - wired both layers into calibrated medians, robustness, conviction dossiers, redraft-board scoring, and the War Room signal strip so secure-volume profiles gain trust while thin committee bets lose trust
  - added model coverage proving the expected-opportunity and role-security layers separate secure-volume anchors from fragile workload bets
  - verified with `npx tsc --noEmit`, `node --experimental-strip-types --loader ./tests/ts-alias-loader.mjs --test ./tests/fantasy-model.test.ts`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Added a phase-aware Draft Plan layer to the Fantasy Football War Room:
  - converts live league format, round, and roster state into RB/WR foundation checkpoints, QB/TE patience, bench-upside guidance, and K/DST endgame discipline
  - surfaces a model-backed target queue without changing the underlying recommendation scores
  - treats outside strategy writing as qualitative guardrails while allowing board value and tier urgency to create explicit exceptions
- Expanded the keyless nflverse evidence path with ffopportunity:
  - directly downloads the official 2025 weekly CSV release without Python or an API key
  - aggregates play-level expected fantasy points, yards, touchdowns, and weekly consistency by GSIS player id
  - uses the richer evidence in expected-opportunity, veteran regression, robustness, and conviction while keeping bounded adjustments and the original nflverse heuristic as fallback
  - corrected Draft Plan specialist copy so the configured Yahoo league says K only and never implies a D/ST roster slot
- Added season-aware evidence transitions for the fantasy model:
  - detects the active NFL season with January-February still assigned to the season that began the prior calendar year
  - fetches both completed- and active-season nflverse/ffopportunity releases, annualizes partial current usage, and progressively shifts from 18% current weight after Week 1 to a 90% cap after Week 10
  - keeps completed-season evidence active when the new release has not posted and exposes the exact season mix in source status and each player xOpp read
- Added a key-protected Vegas projection seam through The Odds API:
  - keeps `THE_ODDS_API_KEY` server-only and fetches NFL player props one event at a time as required by the official API
  - supports passing yards/TDs/interceptions, rushing yards/TDs, receptions, and receiving yards/TDs
  - normalizes bookmaker juice into fair over/under lines, takes cross-book consensus, then applies modest season-equivalent raw-stat changes capped at 12% per category
  - caches requests for six hours, caps events, reports remaining quota, and surfaces player-level Vegas provenance in the War Room
- Added a keyless preseason season-market source through the public Win With Odds CSV export:
  - parses full-year passing, rushing, receiving, touchdown, interception, and supporting volume projections without scraping HTML
  - blends compatible top-300 QB/RB/WR/TE stats into the existing Yahoo-scored projection stack at 25%, with a 20% per-stat movement cap
  - retains attempts, completions, rushing attempts, source PPR points, rank, and update provenance for analysis while excluding generic fumbles from lost-fumble scoring
  - excludes the model-heavy deep tail and labels the source as Vegas-derived rather than claiming every cell is a directly bettable line
  - verified against 554 live usable source rows, with `npx tsc --noEmit`, all 32 fantasy model tests, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Added a Market Disagreement Board to turn the projection stack into actionable draft decisions:
  - separates supported targets, price-sensitive avoids, and contested model-versus-season-market assumptions
  - shows model and consensus rank, Yahoo projected points, season-market impact, likely round, acquisition window, evidence, and the main caution
  - limits output to realistic draft-pool costs, caps extreme rank-gap scoring, enforces two-player-per-position diversity, and removes QB3-level noise
  - verified against the live 424-player board plus all 33 fantasy model tests, TypeScript, and lint (still only the pre-existing bachelor-party custom-font warning)
- Added injury/role-discontinuity handling to the season projection stack:
  - position-specific volume checks detect when full-season attempts, receptions, and yardage imply a starter role or health rebound missing from the baseline
  - those profiles use a 65% corrective season-market weight instead of the ordinary 25% blend, with a bounded 70% per-stat cap
  - ambiguous causes are labeled `expanded-role-or-health-rebound` rather than guessed as injury versus promotion
  - low-confidence disagreement entries carrying that label route to `contested` instead of producing false-precision targets or avoids
- Replaced the misleading aggregate confidence grade with explicit evidence diagnostics and structured current-player context:
  - keeps projection evidence, role evidence, robustness, and price reliability separate instead of blending them into one recommendation input
  - adds reviewed role, health, track-record, continuity, and environment context, with manual JSON imports supported through `FANTASY_PLAYER_CONTEXT_JSON`
  - routes materially uncertain situations to the contested board instead of manufacturing a target or avoid
  - makes reviewed stable context authoritative over inferred injury/role-discontinuity flags, including distinct Lamar Jackson and Malik Willis test cases
  - treats identity as a verified/partial/unresolved evidence gate and keeps freshness in the separate live refresh layer
- Added a one-time qualitative player-context research snapshot:
  - covers 269 2026 draft players, with 165 receiving at least two sources across FantasyPros, RotoWire, NFL.com, and the user-supplied Reddit draft guide
  - commits only bounded claim tags, generated paraphrases, source URLs/dates, and source-text hashes rather than raw third-party write-ups
  - lets explicit player-outlook evidence fill missing role, health, track-record, continuity, and environment fields while preserving source disagreements
  - keeps manager/manual context authoritative and prevents analyst rankings or target sentiment from masquerading as health or role facts
- Turned the qualitative snapshot into an auditable, bounded model input:
  - added a before/after Context Impact Board that isolates projection, bespoke-rank, and action-label changes caused by qualitative evidence
  - capped qualitative projection corrections at -5%/+3%, requires actual player-outlook claims for movement, and keeps analyst rankings/target lists informational
  - limits action labels to realistic draft-pool players, excludes personal keepers, and requires an adjusted model-versus-market edge before assigning target or discount
  - manually audited the largest live movers and hardened the classifier against historical-role language, negated committee wording, established-player small samples, and imminent preseason returns
  - verified against the live 426-player public board; the final audited pass produced 14 material/context decisions before draft-week refresh inputs
- Added a deterministic multi-draft strategy stress test:
  - corrected the personalized slot-11 snake sequence so the first live post-keeper turn is Pick 35, followed by Picks 38, 59, and 62
  - runs 300 complete keeper-aware mock drafts across balanced, WR-heavy, RB-pressure, and wait-on-QB/TE constructions
  - measures player survival at every personal turn, position mix, starter floor/median/ceiling, roster completion, and average construction
  - produces a Manager Draft Board with priority target, take-at-cost, discount-only, situation-watch, and pass instructions plus explicit acquisition picks
  - reserves K for the final round, never simulates D/ST, excludes personal keepers, and labels direct versus rank-proxy market cost
  - added deterministic coverage over a synthetic 240-player board, including keeper exclusion, exact turn order, complete starters, and K/DST guardrails
- Continued the Yahoo browser-provider proof with an authenticated Chrome inspection:
  - verified stable league ID, My Team ID, player IDs, player identity, and roster-status signals on league, available-player, and team-roster pages
  - confirmed the league uses an offline draft, so its Draft Central page cannot validate live-room state yet
  - rebuilt the extension as a loadable Manifest V3 read-only snapshot bridge with a localhost-only configuration/status popup
  - added a provider-neutral Yahoo state snapshot, strict app-boundary validation, and rejection of unrecognized or secret-shaped fields
  - added sanitized Yahoo HTML fixtures and deterministic DOM extraction tests
  - proved the sanitized extension-to-local-app POST path with HTTP 200 and confirmed forbidden extra fields receive HTTP 400
  - connected the extension to a live standard Yahoo mock, confirmed `/draftclient/f1/{draftRoomId}/{draftSlot}`, stripped its `auth` query before transmission, and kept all mock-derived selectors explicitly provisional pending the real league draft
- Reworked draft-day positional valuation after auditing the elite-TE path:
  - removed the hand-authored RB/WR/TE/QB utility multipliers, separate one-starter penalties, and elite-position bonuses from the base board
  - required starters are now filled from the projection pool and every league flex spot is allocated exactly once to the best remaining RB/WR/TE before replacement levels are calculated
  - all primary positions now use a neutral 1.00 VOR weight; current-roster need, make-it-back probability, VONA, tier survival, and live room state remain downstream decision inputs
  - updated War Room explanations and added regression coverage for lineup-derived TE replacement and single-allocation flex demand
  - the corrected live board moved Brock Bowers from model rank 39 to 26 while using TE13-level replacement rather than the previous TE39 baseline
  - verified with all 49 fantasy-model tests, `npx tsc --noEmit`, and `npm run lint` (still only the pre-existing bachelor-party custom-font warning)
- Added a conditional multi-pick portfolio layer to keep the corrected VOR board from becoming a generic rankings assistant:
  - when the user's team is on the clock, the War Room now forces each serious candidate at the current selection and simulates through the next two personal picks
  - candidates are compared in paired rooms using neutral market, board-value, roster-need, and sampled-outcome inputs, with a strong best-player-available override for materially fallen top-24 market players
  - the War Room shows path win rate, projected lineup floor/median/ceiling, edge versus the best alternative, and the most common exact pick continuation
  - candidate coverage includes the strongest live recommendations plus the best available RB, WR, TE, and QB so an elite onesie path cannot disappear merely because a flat board omits it from the first few names
  - added deterministic regression coverage for the exact slot-11 Pick 35/38/59 path sequence, unique simulated selections, and portfolio output
- Added a draft-day Target Board that separates subjective preference from objective value:
  - personal player stars are editable in the War Room, persist per league in browser localStorage, and can be copied/restored with versioned JSON
  - personal tags are display-only and do not alter projections, ranks, recommendation scores, or conditional Monte Carlo outcomes
  - the model independently labels the best live discounts from bespoke-board rank versus market rank and lets the user promote any value into the personal list
  - target tags appear on recommendation cards and the filtered player board, including off-board status after a player is selected

### 2026-08-13

- Rebuilt `/fantasy-football` around a focused pre-draft and draft-day command center instead of the previous long research-tile report.
- Added a searchable, filterable player board with browser-persisted favorites, three conviction levels, personal notes, compact model signals, and one-at-a-time research details.
- Added a streamlined live draft room with on-clock context, pick recommendations, fast player search, favorite visibility, recent picks, undo, and browser-persisted draft state.
- Added a league-intake workspace for the upcoming team names, official draft order, personal slot, and league-wide keepers, with readiness tracking and automatic local saving.
- Removed the unrelated global music control from the fantasy route so it cannot cover mobile board and draft controls.
- Kept the deeper research and midseason engines intact behind the new draft-first interface so they can be surfaced selectively later.
- Verified with `npm run lint` and `npx tsc --noEmit` (lint retains the existing bachelor-party single-page font warning).
- Repaired the Fantasy Football Supertool's silent data regression:
  - full public FantasyPros PPR consensus rankings now define the player universe instead of the truncated 34-player private response
  - current Fantasy Football Calculator 12-team PPR overall ADP is matched by player identity and kept separate from rank proxies
  - a hard data-quality gate requires full positional depth and verified overall ADP, with visible ready/blocked status in the command center
  - private FantasyPros projections remain a supplemental overlay only, with corrected `rec_rec`/PPR field normalization
  - acquisition ranks now combine lineup-derived structural value with verified market cost, and incomplete position pools can no longer manufacture VOR
  - the initial August 13 integrity audit passed with 430 ranks and 209 direct ADPs; the later projection and replacement-level recalibration settled Josh Allen at #30 and Trey McBride at #35 instead of #5 and #9
- Split the Fantasy Football Supertool into explicit pre-draft and live-engine decision layers:
  - replaced the overloaded `Risk` display with independent value-versus-ADP, model/user/both target attribution, evidence quality, and freshness alerts
  - changed conviction-dossier comparison to position-relative ranks so raw QB points no longer make nearly every RB/WR look fragile
  - surfaced the manager's current roster in the draft room
  - surfaced roster-aware live position pressure with upcoming starter/flex gaps, expected position selections, tier-survival probability, and run pressure
  - expanded recommendation cards with our rank, ADP delta, target ownership, make-it-back probability, and position-run expectations
  - documented the full input and strategy audit in `docs/ALGORITHM_REVIEW.md`, including the remaining validated keeper/team-resolution dependency
- Recalibrated position value labels after a live distribution audit:
  - public FantasyPros position projection rows are now parsed, translated through the exact Yahoo scoring, and used to calibrate deeper fallbacks
  - shared flex replacement jobs now follow expected market acquisition order instead of the model's own projected-point order, removing a circular TE value boost
  - `Value`, `Strong value`, and `Early vs ADP` now require agreement between structural model edge, the displayed direct ADP delta, and value over replacement
  - the verified top-120 audit now has 10 of 13 TEs at cost, three TE values, and no blanket TE strong-value classification; McBride and Bowers are both at cost
  - verified with `npm run lint`, `npx tsc --noEmit`, 58 fantasy-model tests, and the 430-player live-source audit (lint retains the existing bachelor-party single-page font warning)
- Added a gated advanced-metrics research lane without changing production rankings:
  - QB research now has a provider-neutral nflverse play-by-play aggregator for designed-rush share, scramble rate, EPA/dropback, CPOE, touchdown-rate sustainability, and sample size
  - rookie RB research weights college production 35%, reviewed NFL team situation 30%, season rushing-yard market 25%, and draft capital only 10%
  - missing college production, team situation, or yardage-market evidence reduces coverage and blocks backtest readiness instead of increasing draft-capital influence
  - research profiles attach after calibration with explicit `rankingImpact: none` and appear only inside player research details
  - added an out-of-sample activation report requiring five held-out seasons, lane-specific sample floors, 5% MAE improvement over market, and a three-point hit-rate lift before a lane is even eligible for production review
  - documented the contract and safeguards in `docs/ADVANCED_RESEARCH.md`
- Activated the advanced-research shadow/data phase:
  - current nflverse player/draft identity recognizes 57 2026 rookies in the research lane while leaving the production `rookie` flag untouched
  - nflverse player-season EPA, CPOE, attempts, sacks, and touchdown rate create partial QB profiles; designed-run/scramble splits remain an explicitly missing offline enrichment
  - the pre-draft `Shadow` view compares current and hypothetical rank/median for 103 research profiles
  - incomplete critical profiles receive exactly zero shadow adjustment, preventing partial passing evidence from mispricing rushing QBs or draft capital/team context from standing in for missing college production
  - live verification confirmed the production board is unchanged; 62 fantasy-model tests, TypeScript, and lint passed apart from the existing bachelor-party font warning
- Completed the keyless college-data implementation for the advanced-research shadow:
  - generated 192 current-rookie RB/WR/TE records from SportsDataverse `cfbfastR` 2020–2025 play-by-play and nflverse identity with a reproducible offline script, covering older prospects' COVID-era eligibility
  - pooled all available college seasons without recency weighting and retained explicit evidence-season provenance
  - fixed canonical-id/name merging so college evidence joins the live player pool
  - replaced generic fantasy-point percentage changes with bounded football-stat adjustments rescored under the exact league scoring, including six-point passing TDs and full PPR
  - added explicit projected 300/100-yard game counts for strict research rescoring; the production board retains its prior approximation until feeds provide game counts so this rollout cannot silently move live ranks
  - kept all incomplete QB rushing profiles at zero shadow movement until equal-season multi-year designed-run and scramble evidence exists
- Incorporated the value-added net-neutral usage framework:
  - formalized WR/TE WOPR from nflverse target share and air-yards share and removed prior touchdowns from stable role scoring
  - replaced min/max opportunity scaling with bounded within-position Z-scores
  - shifted RB role scoring toward targets/receptions and retained ffopportunity's play-level expected TD/points model for high-value opportunity
  - added bounded RB/WR age fragility without applying a second median projection penalty
  - fixed normalized-name plus exact-position nflverse identity enrichment, covering 343 of 430 live players while preserving canonical IDs and rookie flags
  - left TPRR, route participation, and standalone inside-the-10 HVT unavailable instead of fabricating route/location proxies
  - live audit: Josh Allen #28, Trey McBride #29, Brock Bowers #41; top-120 signals remained position-diverse
- Finished the fantasy draft production-readiness pass:
  - canonical league setup applies exact team order, manager slot, keeper player IDs, snake-round costs, and a review receipt atomically
  - live picks skip keeper-consumed selections, persisted state rebuilds against the current candidate pool, Undo never removes keepers, and full Yahoo snapshots recover gaps atomically
  - weekly nflverse history supplies projected 300/100-yard qualifying-game counts so league bonuses apply per expected milestone game
  - opponent simulations use one neutral rule based on current market cost, board value, roster construction, and positional need
  - walk-forward validation trained on 2021→2024 transitions and held out 2024→2025, improving MAE 4.5% RB, 6.4% WR, and 4.2% TE versus prior-PPG regression; QB/rookie research remains separately gated
  - published a coverage-gated 438-player production snapshot with `npm run fantasy:snapshot`, preventing remote feeds from blocking the draft-room request
  - moved the 48-run wrap simulation after hydration and limited it to the top 120 relevant players; local production response improved from a 20-45 second timeout to HTTP 200 in 0.64 seconds
  - completed a separate 300-room keeper-aware audit with 100% valid-starter completion across all four tested opening strategies
  - added pressure-friendly quick reads to the pre-draft board: position-relative 1-5 VOR stars, scoring-normalized 1-5 tier-cliff stars, and a price/evidence action scale from Avoid through Smash
  - kept the dimensions independent so a large cliff cannot turn an overpriced player into a Smash; Avoid now requires an early price plus either a confirmed falling signal or both limited evidence and fragile role security
  - verified the action distribution across the top-180 ADP pool remained selective and position-diverse; 74 model tests, TypeScript, lint, and the production build passed apart from the existing unrelated font warning
  - added `npm run fantasy:pressure-test`, covering 1,440 mocks across all 12 slots plus 1,000 personalized keeper-room mocks; the first 2,440-draft run had 100% valid-starter completion, no missing Draft Calls, and no elite-star violations
  - the pressure test exposed and fixed percentile-only VOR inflation: 4-5 VOR stars now require both position-relative strength and an absolute advantage of at least 25 points over replacement
  - Draft Call now genuinely triangulates price/evidence, VOR, and tier cliff; one-star VOR defaults to Pass, while a high cliff can upgrade a supported value but cannot rescue an early or fragile price
  - added a reproducible 2024–2025 historical time-machine backtest using archived FantasyPros PPR ECR, complete Fantasy Football Calculator PPR ADP, prior-season nflverse evidence, exact H-Town Heroes scoring, and isolated outcome stats
  - added `/fantasy-football/backtest` with realized and availability-adjusted stock comparisons, disagreement win rates, quick-call calibration tables, and explicit reconstruction/rookie-data caveats
  - initial 374-player run showed a small directional model edge (0.522 vs 0.494 realized Spearman; 0.631 vs 0.608 availability-adjusted), while also exposing that `Smash` calls need further calibration rather than retrospective tuning
  - expanded the primary historical validation window to 2023–2025 using 2022 evidence for the added replay; all three seasons kept outcome data isolated until scoring
  - the 548-player three-season report improved to 0.541 vs 0.511 realized Spearman and 0.643 vs 0.622 availability-adjusted, with positive model correlation edges in both views in all three seasons
  - added equal-season position and draft-range diagnostics, action-label calibration, deterministic bootstrap uncertainty, and generated keep/tune/shadow/data recommendations without changing production rankings
  - cross-season tuning read: retain the core blend and selective `Target`; shadow stricter `Smash` gates; keep TE changes in shadow mode; do not tune rookie weights until comparable historical college/team/Vegas inputs exist
  - converted preseason `Smash` display into `Target`; `Smash Now` is live-only and requires an observed ADP fall, supported evidence, 3+ VOR stars, urgent make-it-back/tier risk, the user's turn, and usable roster fit
  - added a rounds 4–10 value-pocket queue that prioritizes supported model gaps, VOR, cliffs, RB/WR evidence, and live survival while explicitly leaving production ranks unchanged
  - added 216 historical roster simulations across three seasons, all 12 slots, stock/current/pocket strategies, and four candidate middle-round factors with leave-one-season-out selection
  - no stronger middle-round rank factor passed the held-out roster gate (0/3); the tool therefore uses the historical middle-round edge for context and urgency, not a rank multiplier

### 2026-08-13

- Simplified Fantasy Football Supertool news handling after product review:
  - manual Sleeper notification paste is now the immediate intake path
  - accepted alerts update the draft board and wake the Yahoo extension for a fresh inventory scan
  - RotoWire is a cached 10-minute background safety net
  - FantasyPros news and automated notification interception are no longer active workflow dependencies

- Added the first rolling news and injury ingestion layer for the Fantasy Football Supertool:
  - authenticated FantasyPros NFL news and injury adapters behind the documented endpoints
  - configurable credential-free RSS/Atom and JSON feeds for official reports, team sources, verified beat writers, and fantasy-news aggregators
  - conservative canonical-player matching, actionable-language classification, source trust, provenance, expiry, and cross-feed duplicate suppression
  - `/api/fantasy/news` plus five-minute and tab-visibility polling that layers signals over the checked board without blocking page render
  - safe error degradation; the configured FantasyPros key returned HTTP 429 during live contract inspection, so payload normalizers are fixture-tested and await a quota reset for final live validation
- Verified with `npm run lint`, `npx tsc --noEmit`, and targeted rolling-news tests (lint retains the existing bachelor-party single-page font warning).
- Split news behavior by season phase after product review:
  - pre-draft performs one morning news load and no longer continuously polls during the draft
  - FantasyPros news is disabled by default after repeated HTTP 429 responses
  - Sleeper is a confirmation/depth-chart/trending layer, not the breaking alert source because its documented API omits the app notification stream
  - added an event-driven breaking-news response engine that warns immediately, refuses to invent an unverified successor, checks free-agent availability, and proposes an add/drop only when the existing waiver math finds a roster upgrade
  - upgraded the Yahoo Chrome bridge to v0.3.0 with a user-initiated league inventory scan covering My Team, league roster ownership, and paginated available QB/RB/WR/TE players
  - added strict `league-inventory` validation plus freshness/coverage gates; partial or stale scans may support an alert but cannot produce an add/drop recommendation
  - added `/api/fantasy/breaking-news`; it now treats RotoWire as a 10-minute passive source rather than the immediate trigger
  - the Chrome bridge now runs a 10-minute background watcher, while pasted Sleeper alerts bypass the timer and request a fresh read-only Yahoo scan from the last open league tab
  - background alerts require the local Moodin service and an open Yahoo league tab; no browser code submits transactions

### 2026-08-14

- Rebuilt the 2026 rookie research snapshot from the official SportsDataverse 2020–2025 play-by-play releases.
- Separated college talent efficiency from workload opportunity for RB/WR/TE rookie profiles:
  - RB efficiency now uses YPC, explosive-run rate, stuff avoidance, same-team rushing baseline, and receiving efficiency.
  - WR/TE efficiency now uses yards per target, catch rate, explosive-target rate, and same-team receiving baseline.
  - Best-season, final-season, and target shares remain visible as opportunity evidence rather than a talent proxy.
- Added exact 2026 NFL draft capital for 50 matched fantasy rookies from the completed draft tracker.
- Kept all new rookie adjustments shadow-only pending the existing historical activation gate.
- Added a WR evidence-completeness pass for rostered players with a Sleeper WR1-WR3 depth path:
  - all 93 matched board WRs now receive sourced projected-role context without treating depth order as guaranteed target share
  - all 12 matched 2026 rookie WRs now have college efficiency, opportunity, breakout-result, exact draft-capital, and current-role evidence
  - fixed KC/Kevin Concepcion identity aliasing and distinguishes an observed non-breakout from genuinely missing breakout data
  - Makai Lemon now carries a 21.25 breakout age, Sleeper WR2 path, current Questionable designation, and a matched 775-yard season market; his research profile is at 100% coverage
- Finished the rookie-WR model activation plan without forcing an unsupported ranking change:
  - added a reproducible 2016–2025 historical builder using SportsDataverse college play-by-play, nflverse draft/depth/outcome data, and archived Fantasy Football Calculator ADP
  - produced 217 leakage-safe out-of-sample player-seasons across seven forward holdouts (2019–2025)
  - defined WR3 success from each season's 36th-highest custom-scoring PPG and applies receiving-yard bonuses game by game
  - the advanced challenger matched the market baseline at 2.873 MAE and 89.4% WR3 accuracy, so it failed the 5% MAE and 3-point hit-rate activation gates
  - added `off`/`shadow`/`production` plumbing that fails closed when validation is ineligible; the selected adjustment is 0% and current ranks remain unchanged
  - added the validation verdict to `/fantasy-football/backtest` and current Sleeper injury-status evidence to WR1-WR3 context
- Replaced the first rookie-WR nudge test with a component/residual v2 model:
  - separately predicts targets/game, catch rate, yards/target, TD/target, and rushing points/game
  - uses nested expanding-window ridge selection and reports Spearman, pairwise accuracy, precision, recall, F1, balanced accuracy, Brier score, and PR-AUC instead of relying on majority-class raw accuracy
  - opportunity-only evidence improved holdout MAE from 2.827 to 2.743 and Spearman from 0.565 to 0.623, but the full target-quality model failed the MAE/rank/PR-AUC production gate and remains at 0% production impact
  - added college target EPA, success, first-down rate, red-zone target share, and scoring-opportunity target share to every matched rookie WR/TE profile
- Repaired incoherent public rank-derived receiver projections by scaling receptions, yards, touchdowns, and rushing production proportionally to the fantasy-point target. Refreshed the 440-player snapshot under explicit production mode; the validation gate still failed closed, and Makai Lemon now has a coherent roughly 59-reception, 577-yard, 4.6-TD projection after the 775-yard season-market correction.
- Hardened rookie-WR validation again with nested lane/penalty selection, direct-versus-proxy ADP reporting, season-stability gates, and a serialized opportunity target model. The nested challenger regressed overall and against direct ADP, while the fixed opportunity ablation improved only proxy-priced rows. Production therefore remains blocked; the War Room withholds opportunity movement for direct-ADP rookies and shows a capped ±8% proxy-only target-volume shadow comparison.

### 2026-08-23

- Completed the August 20 canonical-league integration across the Fantasy Football Supertool:
  - replaced obsolete draft-board and backtest artifacts with fingerprinted `warRoomDataset.generated.json` and `historicalBacktestReport.generated.json` outputs
  - migrated the fantasy page, news APIs, backtest page, generators, pressure test, documentation, and tests to the canonical 10-team/slot-9 configuration
  - added configuration version/fingerprint identity to live and saved draft state; stale saved state is rejected instead of reconciled
  - regenerated a live 447-player war-room artifact and a 548-player three-season historical report
  - strengthened `validateLeagueIntegrity.mjs` to require current derived artifacts and reject obsolete or mismatched ones
  - verified 93/93 fantasy tests, 2,200 pressure-test simulations with 100% valid starter completion, TypeScript, lint, production build, and HTTP 200 smoke tests for both fantasy pages and APIs

### 2026-08-25

- Upgraded the Fantasy Football War Room for the canonical slot-9 turn geometry:
  - future simulations skip every keeper-consumed overall pick
  - one-team short turns are labeled and scored as pair-building picks
  - 12-plus live-selection wraps are labeled and scored as long-gap exit picks
  - the command center explains which mode is active and changes the conditional-path prompt accordingly

### 2026-08-26

- Added a production-policy counterfactual audit for the Fantasy Football War Room:
  - forced candidate branches now expose paired win rate, median regret, and downside regret
  - exact-production continuations call the same `rankDraftCandidates()` policy used by the live assistant
  - construction penalties can be ablated so release tests distinguish simulated learning from encoded roster heuristics
  - `npm run fantasy:counterfactual-audit` combines 10,000 penalty-free discovery rooms with exact-production integration branches and fails unless an early QB2 loses in every lane
  - the responsive browser path remains explicitly identified as a quick preview until exact-policy rollouts are optimized
  - cached replacement baselines reduced repeated live recommendation work by roughly 4x in the focused regression tests
  - expanded the release audit to five golden states and 10,000 total discovery rooms, with constrained ADP/model-board comparisons
  - the expanded gate discovered and corrected early TE2 preference and a missing-QB Round 11 deadline failure while preserving a falling-elite exception
  - added a 26-draft deterministic policy-certification suite spanning 13 opponent behaviors with full decision traces and live/rehearsal parity checks
  - certification found a missing-kicker source-data failure, three-kicker/WR3 completion failure, and unsupported backup-QB recommendations; permanent fixtures and shared-engine corrections now cover them
  - War Room artifact publication and canonical integrity fail closed when the candidate pool cannot fill a required lineup position

### 2026-08-29

- Completed the Fantasy Football Supertool v5 release-certification evidence pass without performing the draft-week final freeze:
  - unified production, live War Room, rehearsal, systematic audit, full-draft certification, and readiness on the same full-pool 16-simulation wrap policy
  - corrected TE-plus-flex depth handling, Round-3 multi-starter over-urgency, premature kicker timing, bench-only QB2/TE2 VONA, and suspicious-state serialization with generic policy rules and permanent regressions
  - cached positional replacement baselines once per simulated pick, reducing total recommendation latency from roughly 1.7–2.1 seconds to 26–37 ms while leaving the 16 simulations and scoring logic unchanged
  - passed all three targeted 32-sample regressions, all 32 systematic states, 26 adversarial drafts across 13 room types, 364 manager decisions, and five automated draft-day rehearsals with zero suspicious states or live/rehearsal parity mismatches
  - retained the current 2026-08-26 player artifact as a candidate freeze only; same-day player news, depth charts, ADP, keepers, draft order, and human rehearsals remain required before `FANTASY_FINAL_FREEZE=1`
