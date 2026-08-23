# Yahoo Browser Provider

Last updated: August 12, 2026

## What is verified

Official Yahoo Help and public Yahoo Fantasy pages support these conclusions:

- Yahoo league state remains authoritative.
- Add/drop is initiated from the league-scoped Player List page.
- Trade proposals are initiated by selecting a team, then using Yahoo's Propose Trade flow.
- League-scoped URLs exist for player list, transactions, managers, and other research pages.
- Live drafts are officially supported in the Yahoo product, but the private live-draft room URL contract itself is still unverified in this repo.

### Authenticated DOM verification on August 12, 2026

The connected authenticated Chrome tab confirmed these page contracts directly:

- `/f1/750909` exposes league ID `750909` and a visible **My Team** link to team page `11`.
- `/f1/750909/players?...status=A...` renders player links with both `data-ys-playerid` and `/nfl/players/{id}`.
- The same player row exposes visible NFL team/position text and a `Roster Status` cell; inspected available rows used `FA`.
- `/f1/750909/11` renders the user's roster with the same player-ID/name/team/position markup.
- `/f1/750909/draft` is a stable **Draft Central Overview** page for this offline-draft league. It is not a live room.

No cookies, tokens, browser storage, or hidden endpoints were inspected.

### Live mock compatibility probe

An authenticated standard Yahoo mock confirmed the live-client URL family:

`/draftclient/f1/{draftRoomId}/{draftSlot}`

The inspected mock used room `8713897` and slot `4`. The extension successfully classified that page as `draft-room`, removed the `auth` query from the transmitted URL, and delivered an accepted localhost snapshot.

This is compatibility evidence only. Mock selectors must remain provisional until the real league draft opens because keeper state, preloaded picks, team identifiers, available-player panels, and pick-history markup may differ.

## Stable URL families

These are the current stable patterns we can safely treat as navigational:

- `https://football.fantasysports.yahoo.com/f1/{leagueId}`
- `https://football.fantasysports.yahoo.com/f1/{leagueId}/players`
- `https://football.fantasysports.yahoo.com/f1/{leagueId}/{teamPageId}`
- `https://football.fantasysports.yahoo.com/f1/{leagueId}/transactions`
- `https://football.fantasysports.yahoo.com/f1/{leagueId}/teams`
- `https://football.fantasysports.yahoo.com/f1/{leagueId}/playermatchups`

Observed parameterized fields on public pages:

- `players`: `pos`, `sort`, `sdir`, `status`, `eteam`, `fteam`, `stat1`, `jsenabled`
- `playermatchups`: `pos`, `status`, `tab`

Observed example classifications:

- `/f1/750909/players?...status=ALL&fteam=NONE...`
  - stable, parameterized player-list navigation
  - read context for all players
  - valid add/drop landing page, but not a verified one-click action URL
- `/f1/750909/players?...status=A&fteam=NONE...`
  - stable, parameterized player-list navigation
  - likely available-player filter state
  - good future add-candidate landing page for ProposedTransaction handoff
- `/f1/750909/11`
  - stable league-scoped team roster homepage
  - useful for roster review and manual drop-side work
  - direct trade or drop action URL semantics remain unverified

## Fragile or still unverified

- one-click add/drop URLs that preselect a specific player
- prefilled trade-proposal URLs
- stable private live-draft room URL pattern
- any Yahoo write path that bypasses the normal authenticated web flow

Treat these as unverified until the user supplies authenticated examples or an official Yahoo write contract is validated.

## Recommended acquisition architecture

### Draft-only MVP

1. Yahoo page in the user's authenticated Chrome session is authoritative.
2. A lightweight Chrome extension reads deterministic draft state from the DOM.
3. The extension emits structured envelopes to the local Moodin app.
4. Moodin maps Yahoo IDs and names into canonical player IDs.
5. The draft engine and War Room remain provider-agnostic.

### Why not browser automation first

- DOM extraction from an already-authenticated page is narrower and more deterministic.
- It avoids agent-style polling and click replay.
- Failures are easier to reason about: selector drift, stale page, or local bridge outage.

## Extension recommendation

Use a Chrome extension first, not a userscript and not a server-side browser bot.

The proof now lives in `tools/yahoo-draft-extension/` as a loadable Manifest V3 extension. Its working path emits a provider-neutral `state-snapshot`, restricts delivery to an explicitly configured localhost bridge URL, and keeps all Yahoo mutations unsupported.

The localhost API accepted a sanitized snapshot with HTTP 200 and rejected a secret-shaped extra `cookie` field with HTTP 400. This proves the transport and app-boundary validation without claiming the unpacked extension was installed in the user's browser.

### Chrome extension advantages

- runs inside the authenticated Yahoo tab
- can observe mutations and emit only structured state
- can message a local Moodin endpoint directly
- keeps Yahoo cookies and session handling entirely inside Chrome

### Userscript disadvantages

- weaker packaging and permissions story
- less durable install/update path
- more awkward local-app communication and versioning

### Manual paste bridge role

Keep the existing manual JSON paste path as a fallback and debugging tool even after the extension exists.

## Security model

- Yahoo credentials never leave the browser tab.
- The extension reads only visible/authenticated page state.
- The extension posts only normalized envelopes to `localhost`.
- The local app validates every envelope before doing anything with it.
- No hidden endpoints, cookie exfiltration, or session replay.

## Current scaffold in repo

- Bridge contract: [`lib/fantasy/yahooBridge.ts`](/Users/vaughnjackson/moodin/lib/fantasy/yahooBridge.ts)
- Local validation route: [`app/api/fantasy/yahoo-extension/route.ts`](/Users/vaughnjackson/moodin/app/api/fantasy/yahoo-extension/route.ts)
- Extension scaffold: [`tools/yahoo-draft-extension/README.md`](/Users/vaughnjackson/moodin/tools/yahoo-draft-extension/README.md)

## Next concrete step

Use a real authenticated Yahoo draft room and capture:

- exact draft-room URL
- DOM selectors for current pick, round, team on clock, and recent picks
- player link format that exposes Yahoo player IDs

Once those are known, tighten the extension to emit fully populated `YahooDraftRawEvent[]` objects instead of generic page probes.

## Follow Up When League Opens

- Capture the live draft-room URL after entering the real Yahoo draft.
- Capture one player-detail or add/drop flow URL after clicking a specific player.
- Capture one trade-flow URL after selecting another team and starting a proposal.
- Confirm whether team-roster pages expose stable player link URLs with Yahoo player IDs.
- Inspect whether the live draft DOM exposes stable text or attributes for:
  - current pick
  - round
  - team on the clock
  - recent picks
  - drafted player link targets
- If the Yahoo tab is already authenticated in Chrome, use that same session for extension-side selector validation instead of trying to recreate auth elsewhere.
