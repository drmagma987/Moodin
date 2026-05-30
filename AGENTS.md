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
