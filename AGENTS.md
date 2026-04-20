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

Game 1 is a full draft.

Games 2 and 3 are shorter retool drafts:

- Keep 3 players.
- Sign 1 free agent.
- Draft until rosters reach the retool target while starter requirements are enforced.

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

## Ongoing Maintenance Notes

Future Codex sessions should update this file when they make meaningful feature, architecture, deployment, or gameplay-balance changes.

Prefer adding dated bullets under `Current Progress Log` rather than rewriting the whole file.

Before final responses after code changes, usually run:

```bash
npm run lint
npx tsc --noEmit
```

If checks cannot be run, say so clearly.
