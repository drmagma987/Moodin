# VIFA roadmap

This is the execution tracker for turning the current local VIFA prototype into
a moddable browser football game with private online multiplayer. Update the
checkboxes and dated progress log as slices land. Design exploration belongs in
[`vifa-mod-design.md`](./vifa-mod-design.md); engine boundaries and current
architecture belong in [`vifa-architecture.md`](./vifa-architecture.md).

## Status key

- `[x]` Complete and verified.
- `[ ]` Not started.
- `In progress` means a working slice exists but its acceptance checks are not
  all satisfied.
- `Research` means the direction is intentionally not committed yet.

## Current baseline

- [x] Upstream `modelence/open-soccer` pinned for comparison.
- [x] Moodin-owned VIFA engine fork under `lib/vifa/game`.
- [x] `/vifa` playable in CPU, practice, and same-keyboard local two-player
  modes.
- [x] Fixed 30 Hz authoritative simulation tick.
- [x] Seeded authoritative randomness.
- [x] Compact per-tick commands for both players.
- [x] Replay export and serializable snapshot export.
- [x] Headless replay determinism tests.
- [x] Deterministic match telemetry for possession, passing, shooting,
  tackling, saves, and turnovers.
- [x] Wider, bounded player-rating effects across pace, passing, shooting,
  dribbling, defending, physicality, and goalkeeping.
- [x] Progressive PixiJS/WebGL 2.5D presentation with Canvas2D fallback.
- [ ] Snapshot import/restore.
- [ ] Native browser gamepad support.
- [ ] Network transport or online rooms.

## Multiplayer delivery plan

### M1 — Same-machine network loopback

Goal: prove that two browser clients can control one authoritative match through
the same protocol that an internet server will use.

- [ ] Define a versioned wire protocol for join, input, acknowledgement,
  snapshot, clock-sync, error, and match-end messages.
- [ ] Add stable match, client, side, tick, and input-sequence identifiers.
- [ ] Add snapshot import/restore and a bounded replay/input buffer.
- [ ] Separate authoritative simulation ownership from canvas rendering so a
  server process does not require a visual canvas.
- [ ] Run one local authoritative match host behind a WebSocket transport.
- [ ] Connect two browser tabs as home and away clients.
- [ ] Log round-trip time, server tick, input lead, dropped messages, and
  snapshot digest without cluttering the normal HUD.
- [ ] Preserve keyboard local two-player as a fast offline mode.

Acceptance checks:

- Two tabs finish a full match while sending only commands and snapshots—not
  canvas or React state.
- The server's result is authoritative when a client deliberately submits a
  late, duplicated, or out-of-order command.
- A saved replay reproduces the server's final snapshot digest.

### M2 — Responsive network play

Goal: make loopback play feel immediate and remain stable under simulated home
internet conditions.

- [ ] Predict the local controlled player immediately.
- [ ] Reconcile predicted state against acknowledged server snapshots.
- [ ] Interpolate the remote team and ball between snapshots.
- [ ] Add a small adaptive input buffer and tick-drift correction.
- [ ] Test injected latency, jitter, packet loss, and brief disconnections.
- [ ] Define which events are safe to predict and which must wait for the server
  (goals, fouls, possession changes, match end).

Acceptance checks:

- Controls remain useful at the target latency budget chosen during testing.
- Reconciliation corrections are measured and visually tolerable.
- Both clients converge on the authoritative score, possession, clock, and
  final result after adverse-network tests.

### M3 — Private internet matches

Goal: let two invited people play a browser match without installing software.

- [ ] Choose and document a stateful WebSocket hosting target.
- [ ] Use Moodin/Firebase for identity, room code, invite, ready state, and
  durable result metadata—not per-tick simulation traffic.
- [ ] Create/join a private VIFA room and reserve home/away seats.
- [ ] Deploy the authoritative match service near the intended players.
- [ ] Add reconnect, abandonment, timeout, and rematch behavior.
- [ ] Keep public matchmaking out of scope until private matches are reliable.

Acceptance checks:

- A nontechnical player can open one URL, enter a room code, connect a
  controller, and play.
- Refresh/reconnect does not create a second player or corrupt the match.
- Server logs and replay data are sufficient to diagnose a disputed or desynced
  match.

### M4 — Hardening and public-play readiness

- [ ] Validate inputs, rate-limit clients, and reject impossible commands.
- [ ] Add server capacity limits and match lifecycle cleanup.
- [ ] Add version negotiation so mismatched clients cannot join a match.
- [ ] Add privacy/retention rules for replays and diagnostic logs.
- [ ] Confirm the upstream license before any public distribution or hosting.
- [ ] Evaluate public matchmaking only after private-play reliability targets
  are met.

## Parallel mod tracks

These can progress alongside networking as long as each change stays inside the
deterministic command/simulation boundary.

### Controller accessibility

- [ ] Add zero-install browser Gamepad API input.
- [ ] Add a one-screen controller check and a PowerA GameCube-style preset.
- [ ] Add a PowerA GameCube Style Wired Controller plug-in test matrix across
  the target computers and browsers; record the exact SKU and browser-reported
  mapping because PowerA does not guarantee full PC compatibility.
- [ ] Save optional remaps as a local convenience preference only.
- [ ] Ensure every gameplay action remains available on keyboard.

### Rosters and teams

- [ ] Define a validated VIFA roster/team schema independent of rendering.
- [ ] Separate identity, ratings, formation, tactics, and kit data.
- [ ] Add a first historical international roster pack using player names,
  positions, and factual performance data only.
- [ ] Add import validation and deterministic roster IDs.
- [ ] Keep player imagery/likenesses, federation and competition marks, official
  badges, and copied kit art out of the initial historical pack.
- [ ] Document the names-and-statistics legal basis, its jurisdiction/context
  limits, and the provenance/license of every data source before publishing.

### Arcade physics

- [x] Inventory the current shot, ball-flight, collision, goalkeeper, and
  ratings paths.
- [ ] Prototype a dedicated PowerA `ZR`/right-Z power shot behind a VIFA feature
  flag, with keyboard and generic-controller equivalents.
- [ ] Give the move a clear input, wind-up, risk, audiovisual telegraph, and
  deterministic outcome.
- [ ] Tune it as an occasional tactical choice rather than the best default
  shot.
- [ ] Add repeatable physics scenarios to the headless test suite.

## Immediate next slice

Build M1's protocol and local loopback harness first. In parallel, add a
read-only Gamepad API diagnostics panel that reports connected controller IDs,
mapping mode, axes, and pressed buttons. That lets us test the actual PowerA
GameCube-style hardware before committing button indices or requiring any
third-party mapper. The diagnostics should explicitly identify the reported
`ZL`/`ZR` controls and whether the browser exposes them as buttons or axes.

## Progress log

### 2026-10-02

- Completed the keyboard-playtest engine pass with local-player parity for
  buffered actions, receiving, goalkeeper rush, switching, containment, and
  teammate support.
- Widened the visible effect of individual ratings while keeping every curve
  bounded and role-specific; aligned CPU finishing with the human shot model.
- Added deterministic match telemetry so future balance changes can be tested
  against repeatable match and scenario evidence.
- Added a progressive PixiJS/WebGL layer for projected turf light, soft depth
  shadows, motion accents, airborne-ball cues, and net impact effects while
  retaining the complete Canvas2D renderer as a fail-safe fallback.
- Verified lint, TypeScript, both VIFA test suites, the production build, and a
  live Chrome match.

### 2026-10-01

- Established the deterministic 30 Hz command/replay foundation.
- Recorded the staged multiplayer plan from loopback through private internet
  rooms and hardening.
- Opened parallel design tracks for rosters, native controller support, and an
  optional arcade power-shot mechanic.
- Narrowed the controller target to PowerA's wired GameCube-style Switch pad,
  with its right-Z control reserved as the leading power-shot input.
- Reframed roster modding around historical international tournament squads
  using names and factual statistics while excluding official visual assets.
