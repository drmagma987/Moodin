# Moodin + Fantasy Football Supertool Kickoff

This repository currently holds two tracks of work:

- Moodin and its side routes
- the kickoff foundation for a fantasy-football decision platform

The new fantasy-football effort starts with architecture, source ownership, scoring, player identity, and draft valuation primitives before live provider integrations.

## New kickoff route

Open [`/fantasy-football`](/Users/vaughnjackson/moodin/app/fantasy-football/page.tsx) to see the current kickoff slice.

It includes:

- provider ownership and fallback mapping
- a fixture-backed draft recommendation demo
- custom Yahoo-style scoring examples
- project status and documentation entry points

## Core fantasy files

- [`lib/fantasy/types.ts`](/Users/vaughnjackson/moodin/lib/fantasy/types.ts)
- [`lib/fantasy/scoring.ts`](/Users/vaughnjackson/moodin/lib/fantasy/scoring.ts)
- [`lib/fantasy/identity.ts`](/Users/vaughnjackson/moodin/lib/fantasy/identity.ts)
- [`lib/fantasy/draft.ts`](/Users/vaughnjackson/moodin/lib/fantasy/draft.ts)
- [`lib/fantasy/providers.ts`](/Users/vaughnjackson/moodin/lib/fantasy/providers.ts)
- [`lib/fantasy/fixtures.ts`](/Users/vaughnjackson/moodin/lib/fantasy/fixtures.ts)

## Living docs

- [`docs/PRODUCT_SPEC.md`](/Users/vaughnjackson/moodin/docs/PRODUCT_SPEC.md)
- [`docs/ARCHITECTURE.md`](/Users/vaughnjackson/moodin/docs/ARCHITECTURE.md)
- [`docs/REFERENCE_REPOS.md`](/Users/vaughnjackson/moodin/docs/REFERENCE_REPOS.md)
- [`docs/DATA_SOURCES.md`](/Users/vaughnjackson/moodin/docs/DATA_SOURCES.md)
- [`docs/DECISION_LOGIC.md`](/Users/vaughnjackson/moodin/docs/DECISION_LOGIC.md)
- [`docs/YAHOO_CAPABILITIES.md`](/Users/vaughnjackson/moodin/docs/YAHOO_CAPABILITIES.md)
- [`docs/LOCAL_HOSTING.md`](/Users/vaughnjackson/moodin/docs/LOCAL_HOSTING.md)
- [`docs/DECISIONS.md`](/Users/vaughnjackson/moodin/docs/DECISIONS.md)
- [`docs/STATUS.md`](/Users/vaughnjackson/moodin/docs/STATUS.md)

## Getting Started

Run the dev server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Validation

Before handing off code changes, run:

```bash
npm run lint
npx tsc --noEmit
```

## Notes

- External provider authentication is not wired in this kickoff pass.
- Yahoo remains the target league authority even though the current implementation is fixture-backed.
- Set `FANTASYPROS_API_KEY` to let the kickoff route attempt live FantasyPros draft data before falling back to fixtures.
