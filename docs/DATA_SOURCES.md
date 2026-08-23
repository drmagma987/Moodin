# Data Sources

Last updated: August 23, 2026

This document is the source-value gate. No provider stays in production without a clear job.

## Production snapshot policy

The command center serves `lib/fantasy/data/warRoomDataset.generated.json` so draft-day rendering cannot be blocked by a slow public host. Refresh it with `npm run fantasy:snapshot`. The refresh runs the complete live pipeline and refuses to overwrite the production board unless it is live, draft-ready, contains at least 250 players, and matches the canonical league version and fingerprint. Set `FANTASY_LIVE_REQUEST_REFRESH=true` only for diagnostics; it deliberately restores request-time remote loading.

## Preferred source ownership

| Data concept | Preferred source | Fallbacks | Notes |
| --- | --- | --- | --- |
| Overall PPR rankings | FantasyPros public consensus | none | Full public pool is required; limited position feeds cannot define board coverage |
| Overall PPR ADP | Fantasy Football Calculator 10-team PPR | FantasyPros rank proxy | Human mock-draft sample, validated as overall pick cost rather than positional rank |
| Draft projections | FantasyPros private projections | public rank-derived estimates, Win With Odds | Limited private coverage may overlay projections but cannot shrink the player universe |
| Weekly and ROS projections | FantasyPros | future only if proven | Keep simple early |
| Historical usage and stats | nflverse | none | Actual-performance truth layer |
| Opportunity and snap context | nflverse | none | Best complement to projections |
| Weekly player-prop consensus | The Odds API | none | Server-only, quota-aware check on projected per-game stat rates |
| Preseason season-long props | Win With Odds public CSV | First Down Studio manual validation | Top-300 only, 25% blend; derived projection source rather than direct-line provenance for every cell |
| Market momentum | Sleeper | none | Adds/drops only, not player quality |
| Qualitative signals | RotoBaller | FantasyPros news | Use only after rights review |
| Live NFL state | Tank01 | nflverse postgame | Experimental only |
| League state | Yahoo browser provider | Yahoo API, manual, fixtures | Yahoo remains authoritative |
| Canonical player identity | Internal model | provider IDs | Internal crosswalk owns final identity |
| QB EPA/CPOE/rush decomposition | nflverse play-by-play | reviewed import | Research-only until backtested; derive designed runs separately from scrambles |
| WR/TE WOPR | nflverse target share + air-yards share | none | Stable usage input; standardized only within position |
| Expected TD/high-value opportunity | ffopportunity play-level model | nflverse volume heuristic | Prefer location-aware expected points to an incomplete HVT proxy |
| Routes/TPRR/route participation | no approved current full-coverage source | historical FTN participation research | Withheld from production rather than inferred from snaps |
| Rookie college efficiency and opportunity | SportsDataverse cfbfastR releases | reviewed import | Keyless 2020–2025 ESPN-derived play-by-play; sample-shrunk per-carry/per-target efficiency plus separate best/final-season workload shares |
| Rookie NFL draft slot | nflverse players | College Football Data draft endpoint | Secondary input for RBs, not a production substitute |
| Historical rookie WR role path | nflverse opening depth charts | none | Coverage/gating input only; not a target-share bonus |
| Historical rookie WR market baseline | Fantasy Football Calculator final preseason PPR ADP | exact draft pick proxy when absent | Used only in leakage-safe validation; direct ADP is identified explicitly |
| Rookie WR year-one outcome | nflverse weekly player stats | none | Custom PPR plus game-level 100-yard bonuses; joined after predictions freeze |

## Source-value rubric

For every provider, record:

- unique useful fields
- overlap percentage
- latency advantage
- observed reliability
- maintenance burden
- API cost
- rate limits
- licensing constraints
- concrete decision-impact examples
- classification: `CORE`, `SUPPLEMENTAL`, `FALLBACK`, `EXPERIMENTAL`, `CONDITIONAL`, or `REMOVE`

## Current assessments

| Provider | Tier | Why keep it | Main caution |
| --- | --- | --- | --- |
| FantasyPros | CORE | full public PPR consensus plus a limited private projection overlay | private position responses are incomplete and their `rank_ave` values are not overall ADP |
| Fantasy Football Calculator | CORE | current 10-team overall PPR ADP from human mocks | coverage ends near the normal draftable range; deeper players retain explicit rank proxies |
| Win With Odds | SUPPLEMENTAL | full 2026 season stat projections derived from sportsbook props | deeper rows become modeled roster-depth estimates, so only top 300 are blended |
| nflverse | CORE | open actual-usage backbone | not designed as a live Sunday feed |
| ffopportunity | CORE regression input | public play-level expected yards, TDs, and fantasy points | backward-looking and model-derived; bounded rather than treated as truth |
| Sleeper | SUPPLEMENTAL | clean market-behavior signal | does not replace league state or projections |
| RotoBaller | CONDITIONAL | qualitative context if legally usable | terms and feed boundaries must be respected |
| Tank01 | EXPERIMENTAL | possible live-state edge | remove if latency edge is trivial |
| Yahoo browser provider | CORE path | best practical near-term league sync | DOM extraction reliability must be proven |
| SportsDataverse cfbfastR | SUPPLEMENTAL | keyless college play-by-play supports reproducible rookie production and target shares | ESPN-derived identity and play attribution still require coverage auditing |

## Public-doc findings captured in this kickoff

- FantasyPros public docs show API-key authentication and endpoint families for projections, consensus rankings, players, news, injuries, and player points.
- FantasyPros support docs updated on July 20, 2026 describe free, premium, and commercial API access tiers.
- Sleeper docs describe the API as read-only and recommend staying under 1000 calls per minute.
- Sleeper trending endpoints support add and drop lookback windows and ask for attribution when using trending data.
- nflreadpy exposes player stats, rosters, snap counts, injuries, depth charts, fantasy-player IDs, and fantasy-opportunity loaders.
- RotoBaller terms emphasize personal non-commercial use and tighter restrictions around licensed feed content.

## Overlap matrix

| Need | FantasyPros | nflverse | Sleeper | RotoBaller | Tank01 | Yahoo |
| --- | --- | --- | --- | --- | --- | --- |
| Draft projections | high | none | none | none | none | none |
| Weekly projections | high | none | none | none | low | none |
| Historical usage | low | high | none | none | low | none |
| Market momentum | low | none | high | low | none | none |
| Qualitative context | medium | none | low | high | low | none |
| Live NFL state | low | low | none | low | high | none |
| Actual league state | none | none | none | none | none | high |

## Recommendations

- Keep FantasyPros, nflverse, and Yahoo league state as the core stack.
- Keep Sleeper because it adds a differentiated, low-cost signal.
- Do not operationalize RotoBaller extraction beyond small experiments until rights and value are clearer.
- Test Tank01 quickly; remove it if it does not materially improve live detection or ID mapping.

## Rolling news ingestion

The War Room now has a conservative, provider-neutral RSS/Atom and JSON ingestion path. Pre-draft uses one morning load when the board opens; it does not continuously poll during a draft. FantasyPros news is disabled by default and can be explicitly restored with `FANTASYPROS_NEWS_ENABLED=true`. Configure credential-free HTTPS sources through `FANTASY_NEWS_FEEDS_JSON`.

Example configuration:

```json
[
  {
    "id": "verified-beat-feed",
    "label": "Verified local beat reports",
    "url": "https://example.com/nfl.xml",
    "format": "rss",
    "sourceKind": "beat-writer",
    "trust": "verified"
  },
  {
    "id": "injury-provider",
    "label": "Official injury feed",
    "url": "https://example.com/injuries.json",
    "format": "json",
    "sourceKind": "official-injury",
    "trust": "primary"
  }
]
```

Safety rules:

- Direct provider IDs win; exact player name and team is the fallback; story-text matching is accepted only when exactly one board player is named.
- Only explicit injury, recovery, role, depth-chart, holdout, or camp phrases create a ranking signal. Ambiguous blurbs stay in diagnostics.
- Feed trust controls confidence. Unknown sources remain low confidence.
- Items expire by source type. Exact duplicates are suppressed, and same-player injury reports inside an 18-hour window collapse to the strongest current signal before the projection refresh layer runs.
- Feed failures do not block the board. The UI keeps the checked snapshot and displays a feed error state.

This is an ingestion seam, not a license to scrape arbitrary sites. Prefer official feeds, licensed APIs, team feeds, and author-provided RSS endpoints. FantasyPros access is governed by its API terms; use this personal integration within the access granted to the configured key.

## Breaking-news operating model

In-season breaking news is a separate event-driven product:

1. A low-latency news source emits an injury, absence, role-loss, depth-chart, or holdout event.
2. The app immediately warns the manager even if the downstream roster recommendation is still provisional.
3. Sleeper player metadata supplies injury status, practice participation, and depth-chart order; Sleeper trending adds/drops measures market reaction.
4. Yahoo league state determines whether a verified next player up is actually available and which manager roster slot is expendable.
5. The waiver engine applies a bounded short-term opportunity transfer, compares the beneficiary with the weakest safe cut, and proposes an add/drop only when the roster improves.

Sleeper's documented public API does not expose its app notification/news stream. It is therefore a valuable confirmation, depth-chart, and market source—not the primary trigger for alerts. Its full player map should be refreshed only daily per Sleeper's API guidance; filtered player responses and trending endpoints can support narrower checks.

The first operational trigger is the official RotoWire NFL RSS feed. The local breaking-news endpoint checks it alongside any configured feeds and caches upstream work for 60 seconds. The Chrome bridge wakes once per minute, suppresses everything present on its first successful baseline, and warns only for a newly observed actionable item. This is near-real-time polling, not a guaranteed push SLA: delivery remains bounded by the publisher's posting cadence, feed update latency, the browser being open, and the local Moodin service being healthy.

RotoWire provides the trigger headline and link; it does not by itself prove a successor or transaction. Sleeper depth-chart/practice fields provide confirmation context, and a fresh complete Yahoo inventory remains mandatory before the app may label an add/drop proposal transaction-ready.

## Draft-board integrity gate

The draft assistant is ready only when all of these checks pass:

- at least 220 ranked players
- at least 25 QB, 60 RB, 80 WR, and 25 TE
- at least 120 players with verified overall ADP
- finite positive ECR and ADP values for every candidate

The current August 13 live run passed with 430 FantasyPros PPR ranks and 209 matched Fantasy Football Calculator ADPs. A failed gate is rendered prominently as blocked; it may not silently masquerade as a live recommendation board.
