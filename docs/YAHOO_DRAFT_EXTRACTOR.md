# Yahoo Draft Extractor Contract

Last updated: August 12, 2026

## Goal

Define the smallest reliable draft-event payload that a Yahoo browser extractor should emit so the War Room can stay in sync without custom per-page logic in the UI.

## Priority use case

Live Yahoo draft synchronization during an active draft.

The first implementation should focus only on:

- current overall pick
- round
- pick in round
- team slot
- drafted player
- timestamp

Do not block on lineup, waivers, or full roster extraction.

## Canonical event shape

Each extracted pick should normalize to one object:

```json
{
  "overallPick": 1,
  "round": 1,
  "pickInRound": 1,
  "teamId": "team-1",
  "teamLabel": "Team 1",
  "playerName": "Jahmyr Gibbs",
  "yahooPlayerId": "40059",
  "team": "DET",
  "position": "RB",
  "pickedAt": "2026-08-12T20:15:00-04:00"
}
```

## Field rules

- `overallPick`
  - Required when available.
  - Must be the absolute draft pick number, not just pick in round.
- `round`
  - Optional but preferred.
- `pickInRound`
  - Optional but preferred.
- `teamId`
  - Preferred local slot identifier such as `team-1`, `team-2`, and so on.
  - This can be derived later if the extractor only knows slot order.
- `teamLabel`
  - Optional human-facing slot label from Yahoo if visible.
- `playerName`
  - Required.
- `yahooPlayerId`
  - Strongly preferred.
  - This is the best bridge into canonical player mapping.
- `team`
  - Optional NFL team abbreviation.
- `position`
  - Optional Yahoo position label.
- `pickedAt`
  - Optional ISO timestamp.

## Accepted import payloads

The current importer supports:

1. Array of events

```json
[
  {
    "overallPick": 1,
    "teamId": "team-1",
    "playerName": "Jahmyr Gibbs",
    "yahooPlayerId": "40059"
  }
]
```

2. Object with `events`

```json
{
  "events": [
    {
      "overallPick": 1,
      "teamId": "team-1",
      "playerName": "Jahmyr Gibbs"
    }
  ]
}
```

## Extractor phases

### Phase 1

- Manual paste of JSON from a browser-side script into the War Room
- No continuous sync
- No assumptions about team names

### Phase 2

- Repeated extraction snapshots
- Deduplicate already-applied picks
- Detect current pick and team on the clock

### Phase 3

- Stable browser provider on the Mac mini
- Background sync and health checks
- Explicit stale-session warnings

## Browser-script requirements

- Never attempt to bypass authentication
- Read only what Yahoo already renders to the signed-in user
- Prefer stable visible identifiers and links over fragile styling hooks
- Preserve raw Yahoo player IDs when visible in links or page data
- Emit JSON only
- Keep extraction deterministic and minimal

## Integration target in this repo

The importer currently lives in:

- [`lib/fantasy/yahooDraft.ts`](/Users/vaughnjackson/moodin/lib/fantasy/yahooDraft.ts)
- [`components/fantasy/manual-draft-war-room.tsx`](/Users/vaughnjackson/moodin/components/fantasy/manual-draft-war-room.tsx)

Any browser extractor should target that contract rather than writing directly into UI state.
