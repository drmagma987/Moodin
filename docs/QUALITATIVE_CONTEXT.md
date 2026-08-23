# Qualitative Player Context

## Purpose

The 2026 preseason snapshot adds player-specific role, health, continuity, environment, and analyst-context evidence to the projection model. It complements quantitative projections; it does not replace them.

## Snapshot

- Captured: August 12, 2026
- Players: 269
- Players with at least two sources: 165
- Stored artifact: `lib/fantasy/data/qualitative-context-2026-08-12.json`

Sources used:

- FantasyPros 2026 PPR draft notes
- RotoWire 2026 player outlooks and current injury labels
- NFL.com 2026 positional tier rankings
- Yahoo/Justin Boone top-300 PDF as a consensus-board reference
- The user-supplied r/fantasyfootball top-144 guide for explicit target sentiment

## Safety Rules

- Raw third-party write-ups are not committed. The artifact stores short generated paraphrases, bounded claim tags, source URL/date, and a source-text hash.
- Manager-reviewed and manual-import context overrides automated qualitative inference.
- Rankings and analyst targets cannot set health, role, or continuity fields.
- Player-outlook claims can fill missing context fields but disagreements remain explicit conflicts.
- A source count can include an analyst ranking. Projection changes require player-outlook evidence, and stronger corroboration rules count independent outlook sources rather than every source attached to a player.
- Missing injury language does not imply that a player is healthy.
- An injury with an estimated return within seven days remains visible but receives no projection penalty. Active and longer recovery items remain bounded inputs rather than automatic fades.
- Qualitative projection movement is capped between -5% and +3%. Analyst rankings and target lists never move projected points directly.
- `target` and `discount` decisions require the adjusted bespoke board to disagree with market cost. A negative note alone does not create a discount when the player remains a model value.
- A qualitative snapshot is static evidence. Draft-week news belongs in the existing refresh layer.

## Impact Board

The Fantasy Football route compares the same calibrated board with and without this snapshot. It reports projection and rank movement, the evidence that caused it, and a bounded action label. Only sourced players whose market rank and adjusted model rank both fall inside a 20-round draft pool are eligible, and configured personal keepers are excluded.

This board isolates what the qualitative research changed. It does not claim that the qualitative note caused the player’s entire model-versus-market gap. For example, a quarterback can already sit well below consensus because the league is 1QB; a limited-sample note may only move that existing valuation a few spots.

## Refreshing

This is intentionally a one-time snapshot. The research cache under `tmp/fantasy-context/` is ignored. Re-running `node scripts/fantasy/build-qualitative-context.mjs` requires newly downloaded source pages and should only be done after reviewing source access and attribution requirements.
