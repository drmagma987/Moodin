# Fantasy Football Supertool Product Spec

Last updated: August 12, 2026

## Mission

Continuously recommend the highest-value fantasy-football action for the user's exact Yahoo league while minimizing manual research and repetitive transaction work.

## Immediate scope

1. Foundation
2. Pre-Draft Lab
3. Live Draft War Room

## Product principles

- Math first, LLM second.
- Yahoo league state is authoritative, but acquisition is interchangeable.
- Every important data concept has one preferred source and explicit fallbacks.
- Qualitative evidence can support or contradict structured signals, but never silently replace them.
- The UI should stay simple even when the engine is complex.

## Phase map

1. Phase 0: source reconnaissance, provider triage, schemas, Yahoo feasibility, documentation.
2. Phase 1: scoring, player identity, projections, VOR, tiers, upside, simulation primitives.
3. Phase 2: draft engine, roster state, VONA, make-it-back, recommendations.
4. Phase 3: live Yahoo-connected War Room.
5. Phase 4: midseason lineup, waiver, and market engines.
6. Phase 5: news, automation, Discord, FAAB, transaction handoff.
7. Phase 6: trades, postseason evaluation, source-value calibration.

## What this repository now contains

- Provider-neutral TypeScript domain models.
- Custom scoring primitives for Yahoo-style league scoring.
- Canonical player identity scaffolding.
- Mock draft-state and provider fixtures.
- A first deterministic draft-value ranking heuristic.
- Living documentation for providers, architecture, Yahoo paths, and local hosting.
