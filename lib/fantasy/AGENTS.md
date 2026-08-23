# Fantasy workspace integrity

Before analyzing, refreshing, or operating the predraft or live war-room tools:

1. Read `leagueSourceOfTruth.ts`. It is the only authority for league facts.
2. Run `node validateLeagueIntegrity.mjs` and stop if it fails.
3. Treat generated files as derived artifacts, never as league-rule authorities.
4. Do not repeat team counts, keeper rules, draft slots, lineup settings, scoring settings, or named keeper lists in a new source file. Import the canonical module.
5. Increment the canonical version whenever an actual league fact changes, then regenerate every versioned artifact before declaring the war room ready.

Final/real-time draft operation must fail closed when live sources, canonical keepers, configuration version, fingerprint, or saved draft-state identity do not match.
