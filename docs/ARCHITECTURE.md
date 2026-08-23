# Architecture

Last updated: August 12, 2026

## Top-level flow

```text
Providers
  -> normalization
  -> canonical player model
  -> derived features
  -> decision engines
  -> UI / alerts / Yahoo handoff
```

## Layers

### Structured fact layer

- FantasyPros projections, ECR, ADP, tiers, news, injuries
- nflverse stats, snaps, opportunity, rosters, depth charts
- Sleeper trending adds and drops
- Yahoo league state
- Optional Tank01 live state

### Context layer

- RotoBaller
- beat writers
- coach comments
- other qualitative reporting that can be classified into explicit signal types

### Decision layer

- scoring
- VOR / replacement
- upside distributions
- VONA / make-it-back
- lineup / waiver / FAAB / trade engines

### Execution layer

- Yahoo official API when available
- Yahoo browser provider
- deep-link handoff
- manual fallback

## Repo structure added in this kickoff

```text
app/fantasy-football/page.tsx
lib/fantasy/types.ts
lib/fantasy/scoring.ts
lib/fantasy/identity.ts
lib/fantasy/draft.ts
lib/fantasy/providers.ts
lib/fantasy/fixtures.ts
docs/*.md
```

## Design decisions

- Keep ingestion and valuation separate from the Next.js UI.
- Keep provider-specific identifiers at the edge and canonical IDs inside the core.
- Use fixtures before live integrations so the valuation engine can be tested locally.
- Treat Yahoo state acquisition as a provider interface, not as a direct UI dependency.
