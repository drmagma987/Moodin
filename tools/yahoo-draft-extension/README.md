# Moodin Yahoo League Bridge

Last updated: August 13, 2026

This is a read-only Manifest V3 Chrome extension for sending structured Yahoo Fantasy Football state from a page the user already opened to the local Moodin app.

It never reads or sends cookies, tokens, session identifiers, page storage, or unrelated page text. It does not click or submit draft picks, adds, drops, or trades.

## Install unpacked

1. Start Moodin with `npm run dev` and note its port.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select `/Users/vaughnjackson/moodin/tools/yahoo-draft-extension`.
6. Pin **Moodin Yahoo League Bridge** if you want its status popup visible.
7. Open the popup and set the endpoint to either:
   - `http://127.0.0.1:3000/api/fantasy/yahoo-extension`
   - `http://localhost:3000/api/fantasy/yahoo-extension`

Only localhost/loopback URLs with that exact API path are accepted. If Next.js chooses another port, enter that port in the popup.

After installing or reloading the extension, reload the Yahoo Fantasy tab once so the content scripts attach.

## Scan league inventory

1. Open any authenticated page inside the target Yahoo league.
2. Open the extension popup.
3. Select **Scan league inventory**.
4. Keep the Yahoo tab open while the scan reads:
   - your current roster
   - team roster pages linked from the league Managers page
   - paginated available QB, RB, WR, and TE lists using Yahoo's visible `status=A` filter
5. The popup reports the player count and whether coverage is complete or partial.

The scan is user-initiated and read-only. It uses the signed-in Yahoo page to fetch ordinary league pages, never reads cookies directly, and never submits a transaction. Moodin rejects stale or partial inventory before producing an add/drop recommendation.

## Pasted Sleeper alerts and passive news

The primary immediate path is now the **Sleeper quick intake** card on `/fantasy-football`. Paste a Sleeper notification and apply it. The board updates immediately, and the local Moodin page asks the extension to refresh Yahoo inventory without waiting for the background timer.

RotoWire remains a passive safety net. While Chrome and the local Moodin server are running, the extension checks Moodin's breaking-news endpoint every 10 minutes. The first successful check establishes a baseline without notifying for older stories. A newly observed actionable injury, absence, role-loss, depth-chart, or holdout report then:

1. triggers a Chrome warning with the source in the message
2. asks the last open Yahoo league tab for a fresh read-only league inventory scan
3. stores the structured roster/free-agent snapshot in Moodin for the recommendation engine

Use **Check breaking news** in the popup to run the same check immediately. Open the Yahoo league at least once after loading the extension so its background worker knows which authenticated tab may be rescanned. The Yahoo tab can be inactive, but it must remain open and the local Moodin server must remain available.

The watcher never adds or drops a player. It only warns and refreshes the evidence required for a proposal. A partial, stale, or position-incomplete Yahoo scan remains alert-only.

## Approved pages and permissions

The content script is limited to `https://football.fantasysports.yahoo.com/*`.

The background worker can POST only to the declared localhost origins. It also verifies that every incoming snapshot came from the approved Yahoo Fantasy origin.

`storage` keeps the configured localhost endpoint, the last structured envelope/bridge result, the last Yahoo tab ID, and a bounded set of already-seen alert IDs. `alarms` schedules the 10-minute passive check. `notifications` displays warnings. `activeTab` is used for the user-initiated scan; no permission allows transaction submission.

## Working deterministic extraction

Validated against the authenticated 2026 league pages on August 12, 2026:

- league ID from `/f1/{leagueId}/...`
- current user's team page ID from the visible **My Team** link
- page type from stable league routes
- player name and Yahoo player ID from `a[data-ys-playerid]` and `/nfl/players/{id}`
- NFL team and position from the visible player identity cell
- available status from the `Roster Status` column (`FA` on the inspected available-player page)
- rostered status from a league-scoped numeric team page
- user-initiated aggregate league inventory with explicit roster/free-agent ownership and coverage diagnostics

The extension emits a provider-neutral `state-snapshot`; Yahoo-specific IDs remain source identifiers rather than becoming app-domain IDs.

## Provisional and unavailable extraction

The inspected league uses an offline draft. `/f1/750909/draft` is **Draft Central Overview**, not a live draft room.

Therefore these remain unavailable until a real live room is open:

- current overall pick
- team on the clock
- draft pick history
- live-room available-player panel
- verified live-room URL and selectors

The extractor contains only narrow semantic hints (`data-test-id`, `data-testid`, or `data-ys-*`) for those fields and labels their confidence `provisional`. It does not fall back to generic class fragments or arbitrary table rows.

## Manual verification

1. Open an authenticated Yahoo league page.
2. Reload the page after loading/reloading the extension.
3. Open the Moodin extension popup.
4. Confirm it reports `Connected (200)` and the expected page type.
5. In Moodin, open `/fantasy-football` and use the Yahoo Bridge Console if you want to inspect or import a saved envelope manually.
6. Test these pages separately:
   - `/f1/{leagueId}/players?...status=A...` should report available players.
   - `/f1/{leagueId}/{teamId}` should report rostered players.
   - `/f1/{leagueId}/draft` should report `draft-overview`, not `draft-room`.

For a future live draft, save a sanitized HTML fixture containing only the draft-state markup, then add verified selectors and regression tests before changing `selectorConfidence` to `verified`.

## Troubleshooting

- **No snapshot yet:** reload the Yahoo tab after loading the unpacked extension.
- **Network error:** make sure Moodin is running on the popup's configured port.
- **HTTP 400:** the app rejected the envelope contract; inspect the service worker console and update the extension/app contracts together.
- **Wrong port:** Next.js may choose 3001 if 3000 is occupied; change the popup endpoint.
- **Extension changes not visible:** click **Reload** on `chrome://extensions`, then reload Yahoo.
- **Watcher reports an error:** confirm the local Moodin server is running at the configured endpoint. Chrome suspends extension service workers normally; the alarm wakes it for the next check.
- **Warning could not refresh Yahoo:** reopen the target league in Yahoo and run **Scan league inventory** once to replace the saved tab.
- **Live draft fields empty:** expected until a live draft room is open and its semantic markup is verified.
