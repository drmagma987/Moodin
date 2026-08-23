# Yahoo Capabilities

Last updated: August 13, 2026

## Chrome extension proof status

Working and deterministic:

- loadable Manifest V3 structure and referenced files
- narrow Yahoo Fantasy and localhost permissions
- league/team/page classification
- Yahoo player IDs, names, NFL team/position, and available/rostered status
- provider-neutral snapshot envelope
- user-initiated league inventory scan across My Team, Managers/team roster pages, and paginated available QB/RB/WR/TE lists
- freshness and coverage gates before Yahoo inventory can drive an add/drop recommendation
- strict localhost API validation and preview
- sanitized HTML fixture coverage

Provisional:

- semantic live-draft selectors for current pick, current team, and pick rows

Unavailable in the inspected league:

- a live draft room (the league is configured for an offline draft)
- validated pick history and on-clock state

Unsupported by design:

- initiating draft picks
- add/drop submission
- trade submission
- any hidden endpoint or authentication bypass

## Authoritative role

Yahoo is the source of truth for:

- league settings
- scoring
- draft board
- rosters
- free agents
- waivers
- FAAB
- standings

## Acquisition strategy

1. `YahooBrowserProvider`
2. `YahooOfficialApiProvider`
3. `ManualImportProvider`
4. `FixtureProvider`

## What to prioritize next

- validate the inventory scan against the live authenticated 2026 league after reloading extension v0.3.0
- feed the saved inventory into the in-season player dataset
- trigger a fresh scan when a breaking-news alert names a potential beneficiary
- retain manual Yahoo completion for adds/drops until a stable official write path exists

## Browser Use vs deterministic browser provider

- Deterministic provider: the recurring data pipe for structured state.
- Browser Use: recon, testing deep links, and occasional human-approved recovery actions.

## Current status

- Mock draft fixtures exist in code now.
- Official Yahoo API is not wired in this repo.
- Deep-link transaction support is still unverified.
- Yahoo DOM extraction now supports roster and availability capture as well as the earlier draft-state scaffold.
- A manual Yahoo draft-event import path is now wired in the War Room, so browser extraction can target a stable JSON contract before full live sync exists.
- A first browser-provider scaffold now exists:
  - URL inspection and action-handoff planning in [`lib/fantasy/yahooBridge.ts`](/Users/vaughnjackson/moodin/lib/fantasy/yahooBridge.ts)
  - a local validation route at [`app/api/fantasy/yahoo-extension/route.ts`](/Users/vaughnjackson/moodin/app/api/fantasy/yahoo-extension/route.ts)
  - a draft-only Chrome extension scaffold in [`tools/yahoo-draft-extension/README.md`](/Users/vaughnjackson/moodin/tools/yahoo-draft-extension/README.md)
- Example user-provided URLs now confirm:
  - player-list pages are heavily query-parameter driven
  - available-player filtering can be represented in URL state
  - league-scoped numeric team pages such as `/f1/{leagueId}/{teamPageId}` are a real roster-homepage pattern
