# Fantasy draft-day runbook

This runbook is the operational path from the certified v5 policy to the real Yahoo draft. The preflight and rehearsal commands are read-only with respect to the live draft. No command submits a Yahoo transaction.

## Before the next manual rehearsal

1. Confirm the repository is on the intended fantasy checkpoint and preserve unrelated work.
2. Run the non-freezing automated preflight:

   ```bash
   npm run fantasy:draft-day-preflight
   ```

3. Treat `automated-ready-human-review-required` as the expected result. It verifies canonical identity, required position coverage, v5 evidence, candidate readiness, latency, a non-persisted manual-entry/reload probe, and the static Yahoo bridge contract. It does not claim that current news, keepers, draft order, or the signed-in Yahoo room have been reviewed.
4. Open Draft Rehearsal Mode and complete its visible scorecard:
   - two manual entries
   - one recovered pick
   - one reload recovery
   - one rejected duplicate/bad event
   - at least one recommendation refresh inside the latency budget

## Draft-morning refresh

Do this shortly before the draft, not days in advance.

1. Review same-day injuries, depth charts, role changes, holdouts, suspensions, and material ADP movement.
2. Confirm every league keeper, the official team order, Vaughn's slot, and the canonical league settings.
3. If any player or league input changed, regenerate the board:

   ```bash
   npm run fantasy:snapshot
   node lib/fantasy/validateLeagueIntegrity.mjs
   ```

4. Review the artifact diff and any blockers. Do not accept unexplained candidate-count, fingerprint, keeper, or required-position changes.
5. Run the strict same-day preflight:

   ```bash
   FANTASY_REQUIRE_SAME_DAY=1 npm run fantasy:draft-day-preflight
   ```

## Yahoo connection check

1. Start Moodin locally and open the fantasy command center.
2. Open the signed-in Yahoo league/draft page with the Moodin Yahoo League Bridge enabled.
3. Request one fresh read-only snapshot.
4. Confirm the league ID, manager team, draft room/slot when available, current pick, recent picks, and player coverage.
5. Reject stale, partial, ambiguous, or wrong-league snapshots. The manual-entry path is the fallback; the bridge must never guess or submit a pick.

## Human clock rehearsal

Practice these before the real room opens:

1. Enter a normal opponent pick manually under the real pick clock.
2. Simulate a positional run and explain aloud why the top recommendation beats the best alternative.
3. Attempt one duplicate or ambiguous entry and confirm it is rejected without advancing state.
4. Reload the page, restore the session, and verify the current pick, recent picks, roster, and top recommendation.
5. Practice extension loss: switch to manual entry, enter the missing pick, and confirm session health before continuing.

## Final freeze

Only after the same-day and human checks pass:

```bash
FANTASY_FINAL_FREEZE=1 npm run fantasy:draft-day-readiness
node lib/fantasy/validateLeagueIntegrity.mjs
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Review the generated final-freeze receipt before committing it. Do not rerun the expensive systematic matrix or 26-draft certification unless production policy, scoring, candidate generation, or certified continuation behavior changed.

## Live failure recovery

- Yahoo bridge unavailable: use manual entry; do not wait for automation while the clock runs.
- Duplicate or wrong player: reject the event and verify the pick number did not advance.
- Missed picks: use the reviewed full-snapshot reconciliation path only when rows are exact and complete.
- Bad local event: use the application Undo/revert path so the audit record remains intact. Do not edit local storage or reset Git during the draft.
- Reload mismatch: stop entry, compare the session health/current pick against Yahoo, then reconcile from an exact snapshot or the visible Yahoo pick log.
- Board/fingerprint/keeper mismatch: fail closed. Do not bypass the freeze guard.

## Evidence hygiene

Committed release evidence consists of the merged v5 matrix, its four current shards, the three v5 targeted regression reports, readiness receipt, policy-certification report, and permanent regression fixtures. Worker PID/status/log files and mixed-wrap discovery reports are local diagnostics and are ignored by Git.
