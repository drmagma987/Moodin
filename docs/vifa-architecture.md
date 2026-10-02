# VIFA integration notes

Related living documents:

- [`vifa-roadmap.md`](./vifa-roadmap.md) tracks implementation milestones and
  acceptance checks.
- [`vifa-mod-design.md`](./vifa-mod-design.md) holds controller, roster, and
  arcade-physics proposals that still need testing.

VIFA currently embeds the client-side game engine from
[`modelence/open-soccer`](https://github.com/modelence/open-soccer) at upstream
commit `e82cd43bc83498b0fd51b3530fe38fb15308888c`.

## Current integration

- Upstream is retained as the Git submodule at `vendor/open-soccer`.
- The Moodin route is `/vifa`.
- `lib/vifa/game/` is the Moodin-owned engine fork used by the route. The
  submodule remains an untouched upstream reference for comparisons and updates.
- `lib/vifa/mods.ts` is the first explicit VIFA mod layer. It owns match-level
  tuning and the second local player's bindings.
- `components/vifa/vifa-game.tsx` is the Next.js client adapter around the
  VIFA engine, team data, settings, and game UI.
- Gameplay is still fully client-side. CPU, practice, and same-keyboard
  two-player modes are available; no live game state is sent to a server yet.

## Best first mod seams

- `lib/vifa/mods.ts`: VIFA-level rules, feature flags, and controller mappings.
- `lib/vifa/game/constants.ts`: field, match timing,
  movement, ball physics, and other global tuning.
- `lib/vifa/game/teams/`: clubs/nations, formations, kits,
  rosters, and ratings.
- `lib/vifa/game/ratings.ts`: how player attributes affect
  movement, shooting, passing, dribbling, tackling, and duels.
- `lib/vifa/game/engine.ts`: authoritative simulation,
  input, possession, AI, and rules.
- `lib/vifa/game/render.ts`: complete Canvas2D presentation and the broadcast
  camera. This remains the guaranteed fallback picture.
- `lib/vifa/game/render-pixi.ts`: optional transparent PixiJS/WebGL enhancement
  layer. It consumes the same read-only `Scene` snapshot and adds projected
  light, soft depth shadows, motion accents, airborne-ball cues, and net-impact
  effects without participating in simulation.
- `components/vifa/vifa-game.tsx`: VIFA branding, menus, HUD, key bindings, and
  the React shell around the engine.

## Multiplayer path

The engine still owns mutable match state inside one `PitchKickGame` class, but
it now advances through an authoritative 30 Hz fixed-step clock. Browser
`requestAnimationFrame` only schedules ticks and rendering; it no longer supplies
the gameplay timestep. For internet play, avoid syncing canvas or React state.
The durable approach is:

1. Extract a deterministic simulation core that accepts player commands and a
   fixed timestep without touching DOM APIs.
2. Represent each input as a compact command containing match ID, player side,
   input bits, sequence number, and simulation tick.
3. Run the authoritative match loop on a low-latency stateful game server using
   WebSockets. Firebase/Firestore can own identity, rooms, invites, and results,
   but it is not a good fit for per-frame football simulation traffic.
4. Predict the local controlled player immediately, buffer recent inputs, and
   reconcile against server snapshots. Interpolate remote players and the ball.
5. Add reconnect, input validation, tick drift handling, and replayable match
   logs before exposing public matchmaking.

The local two-player and deterministic-runtime milestones are now complete. The
remaining practical order is same-machine loopback networking, prediction and
reconciliation, private room codes, then internet hosting and latency testing.
The detailed checklist lives in `docs/vifa-roadmap.md`.

## Deterministic runtime

- `lib/vifa/game/determinism.ts` defines the 30 Hz tick, compact input bitmasks,
  replay-log schema, seeded random generator, snapshot schema, and digest helper.
- The browser records one explicit Player 1/Player 2 command frame per tick.
- Kick scatter, deflections, and cosmetic player phase seeding use the match's
  seeded random stream instead of `Math.random()`.
- `PitchKickGame.advanceTick(frame)` is the headless/server/replay entry point.
- `PitchKickGame.exportReplay()` returns the seed and complete command stream.
- `PitchKickGame.exportSnapshot()` returns a serializable authoritative state
  snapshot for comparison and future server reconciliation.
- `npm run vifa:test` replays commands through fresh real-engine instances and
  verifies byte-stable snapshot equality. It also rejects out-of-order ticks.
- `PitchKickGame.exportTelemetry()` exposes deterministic per-side possession,
  passing, shooting, tackling, save, and turnover counters for balance suites.

## Gameplay balance foundation

- Both local players now have the same first-time input buffer, assisted pass
  reception, goalkeeper rush, switch scoring, containment, and teammate shape.
- Local multiplayer keeps AI pressure and containment but leaves the actual
  tackle to the two people playing; CPU matches retain teammate auto-tackles.
- Attribute-to-physics curves are deliberately wider. Pace, passing weight and
  error, shooting, dribbling, defending, physical duels, and goalkeeper quality
  now have bounded but plainly visible gameplay effects.
- CPU finishing uses the human shooting model, and CPU possession includes
  circulation and wide crossing decisions instead of only central dribbling.
- Lofted passes are contestable while still giving their intended receiver a
  small read-of-flight advantage.

The renderer may still use wall-clock time for purely visual crowd/net effects;
those values never feed back into the authoritative match simulation.

## Progressive 2.5D rendering

The React host stacks a transparent PixiJS canvas over the existing Canvas2D
match canvas. `PitchKickGame` sends the same scene snapshot to both renderers.
This is intentional: WebGL setup is asynchronous and may fail on constrained
devices, while the base renderer must remain immediately playable. The Pixi
layer therefore fails closed and never owns input, physics, camera state, or
authoritative timing.

New GPU effects should stay presentation-only and should derive their placement
from `projection.ts`. Avoid introducing a second animation/game clock or a
physics package into the visual layer. If a future pass replaces base artwork
with Pixi objects, migrate one render layer at a time while retaining Canvas2D
as the fallback until mobile performance and visual parity are verified.

## Local multiplayer controls

- Player 1: arrow keys, `E` sprint, `D` shoot/tackle, `S` short pass, `A` long
  pass/slide, `W` through pass, `Q` switch.
- Player 2: `I/J/K/L` movement, right Shift sprint, `O` shoot/tackle, `U` short
  pass, `P` long pass/slide, `Y` through pass, `H` switch, semicolon contain.
- The lime marker is Player 1 and the orange marker is Player 2.

## Licensing checkpoint

The downloaded upstream repository did not contain a `LICENSE` file at the
commit above, even though its README describes the project as open source.
Before a public VIFA deployment or distribution, confirm the intended license
with the upstream maintainer and preserve whatever attribution/terms they
provide.
