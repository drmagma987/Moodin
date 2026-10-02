# VIFA mod design notebook

This document holds product and gameplay proposals that still need hands-on
testing. Moving an item here does not make it a committed feature. Accepted work
should be promoted into [`vifa-roadmap.md`](./vifa-roadmap.md) with explicit
acceptance checks.

## Design principles

- A friend should be able to open a URL and play without installing a controller
  mapper, desktop client, or browser extension.
- Simulation-affecting inputs must become explicit per-tick VIFA commands so
  local play, replays, tests, and online play use the same path.
- Arcade mechanics should add readable decisions and memorable moments without
  turning normal football actions into traps.
- Mod data should be portable and validated rather than buried in rendering or
  menu code.

## Controller support: zero-install PowerA GameCube path

The target is PowerA's **GameCube Style Wired Controller for Nintendo Switch**.
The current official manual labels `L`, `R`, `ZL`, and `ZR` shoulder controls,
along with the GameCube face layout, left stick, C-stick, D-pad, and Switch
system buttons. The exact controller SKU still needs to be recorded when the
physical device is tested.

PowerA says its Switch wired controllers are designed for the Switch and may
connect to a PC with compatibility or missing-function issues. Therefore,
"zero-install" is the product goal—not an assumption that every browser/OS
combination already works. Our first implementation must inspect what the
browser actually reports and offer an in-browser calibration path.

### Proposed experience

1. Plug the USB controller into the computer.
2. Open VIFA in a supported browser.
3. Press any controller button when the controller check appears.
4. VIFA assigns the device to Player 1 or Player 2 and shows a short live input
   check.
5. If the controller ID and observed controls match our tested PowerA preset,
   VIFA applies it. Otherwise, the player completes a short in-browser
   calibration flow.

This uses the browser's native Gamepad API. A mapping app should not be required
when the target browser exposes the controller completely. The diagnostic view
must record controller ID, `mapping`, axes, buttons, and whether `ZL`/`ZR` arrive
as digital buttons, analog axes, or both.

### Proposed logical actions

The engine should consume actions—not raw button numbers:

| Action | PowerA GameCube-style proposal | Keyboard P1 |
| --- | --- | --- |
| Move | Left stick | Arrow keys |
| Sprint | `R` | `E` |
| Shoot / standing tackle | `B` | `D` |
| Short pass / contain | Large `A` | `S` |
| Long pass / slide | `X` | `A` |
| Through pass | `Y` | `W` |
| Switch player | `L` | `Q` |
| Power shot | `ZR` / detected right-Z control | Proposed dedicated key |
| Optional secondary modifier | `ZL` | TBD |
| Pause | `+` | Escape |

The labels shown in the UI should follow the detected preset. Internally, a
controller profile maps axes/buttons to logical actions, then the existing input
bitmask records them. No raw browser button index should leak into simulation
logic.

### Accessibility and failure handling

- Show connection and assignment state before kickoff.
- Include a live stick/dead-zone and button test.
- Ignore small stick noise with configurable dead zones.
- Detect disconnects and pause a local match safely.
- Allow keyboard fallback without restarting the match.
- Store custom mappings locally as a convenience setting; never make them the
  authoritative multiplayer state.
- Provide an in-browser remap wizard for nonstandard controllers.
- Do not rely on vibration; treat it as optional feedback where supported.

### Hardware/browser test matrix

Record real observations rather than guessed compatibility:

| Controller | Connection | OS | Browser | Reported mapping | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PowerA GameCube Style, SKU TBD | USB | TBD | Chrome | TBD | Not tested | Capture exact SKU and ZL/ZR behavior |
| Keyboard | Built in | macOS | Chrome | VIFA preset | Working | Current baseline |

## Rosters and team modding

### Proposed data boundary

A roster pack should be data that the simulation loads, not bespoke TypeScript
logic. A future validated format should cover:

- Pack metadata: stable ID, version, title, author, attribution, and compatible
  VIFA rules version.
- Competition/team identity: stable IDs, display names, colors, and optional
  legally usable art references.
- Player identity: stable ID, display name, number, preferred positions, foot,
  and goalkeeper flag.
- Gameplay ratings: pace, passing, shooting, control, defending, physical,
  goalkeeping, and any traits the engine actually supports.
- Team setup: starting eleven, bench, formation, roles, and default tactics.
- Balance metadata: rating scale, pack-wide normalization version, and validation
  warnings.

### Historical international roster direction

The intended content is playable historical squads from past men's World Cup
tournaments. Start with a small four-team historical international pack so the
schema and rating process remain testable. It should exercise:

- recognizable tactical and player identities derived from documented facts;
- substitutions and alternate formations;
- stable IDs across reloads and replays;
- validation failures for duplicate IDs, invalid lineups, and out-of-range
  ratings.

The initial data/art boundary is:

- Include player names, squad numbers, positions, appearances, goals, and other
  factual match/tournament statistics from documented sources.
- Derive gameplay ratings through a transparent VIFA methodology rather than
  copying another game's proprietary ratings.
- Use country names and original VIFA color treatments.
- Exclude player photographs, scanned faces, voice clips, signatures, official
  federation/competition logos, trophy art, copied kits, and sponsor marks.
- Describe tournament/year context factually; do not present VIFA as official,
  endorsed, sponsored, or affiliated.

The U.S. fantasy-sports decisions in *C.B.C. Distribution v. MLB Advanced
Media* and *Daniels v. FanDuel* support protection for certain uses of publicly
available player names and performance information. They are useful precedent,
but they arose in particular U.S. jurisdictions and fantasy/informational
contexts. A playable football simulation, international distribution,
trademarks, source-database terms, and visual likenesses present additional
questions. Treat names-and-facts-only as the working content rule and obtain a
focused legal review before public commercialization—not as an unlimited
clearance.

### Open roster questions

- Should ratings remain on the upstream scale or move to a documented VIFA
  scale?
- Are positions strict or should players carry proficiency by position?
- Do we want seasonal progression, or only static exhibition rosters initially?
- Which tactical attributes genuinely affect the current engine?
- Should roster packs be bundled at build time, loaded from a trusted server,
  or imported locally by a user?
- Which historical tournament and four teams should form the first pack?
- Which source supplies each factual field, and do its access/usage terms permit
  our ingestion method?

## Arcade physics: power-shot experiment

### Desired feel

The power shot should create a brief "I am going for it" moment: noticeably more
ball speed and spectacle, with enough wind-up and accuracy risk that a normal
shot remains the correct choice under pressure.

### Input candidates

1. **Dedicated `ZR`/right-Z button:** preferred for the PowerA GameCube-style
   controller. It is explicit, memorable, and keeps the large face buttons on
   normal football actions.
2. **`ZR` plus Shoot:** adds deliberate confirmation but may be less comfortable
   and unnecessarily complex for a casual player.
3. **Hold Shoot beyond the normal charge band:** useful as a generic-controller
   or keyboard fallback, but can punish players who simply hold too long.

Initial preference: prototype **press/hold `ZR` to wind up, release `ZR` to
shoot**. Give keyboard and generic controllers an explicit equivalent action.
Keep it feature-flagged until the real PowerA pad confirms reliable right-Z
events and casual playtesting confirms the smaller shoulder control is
comfortable.

### Proposed simulation behavior

- Require possession, a minimum wind-up window, and enough space to complete the
  animation.
- Reduce or lock steering during the final wind-up ticks.
- Apply a deterministic speed impulse above the normal shot ceiling.
- Widen the accuracy cone, especially when moving, off-balance, weak-footed, or
  pressured.
- Let shooting and technique ratings improve—but never eliminate—the risk.
- Give goalkeepers an earlier visual read while making the ball harder to stop
  if it is accurately placed.
- Make blocks and missed attempts meaningfully dangerous so the mechanic cannot
  be spammed.
- Put all tuning values in the VIFA mod configuration rather than scattering
  constants through the engine.

### Candidate tuning knobs

- Wind-up ticks.
- Minimum and maximum charge.
- Ball-speed multiplier and cap.
- Accuracy-cone multiplier.
- Movement/pressure/weak-foot penalties.
- Recovery ticks after release or interruption.
- Goalkeeper reaction and parry modifiers.
- Optional cooldown only if animation/risk does not sufficiently prevent spam.

### Determinism and testing requirements

- The power-shot request must be represented in the recorded input command.
- The server decides whether the input is legal and computes the outcome.
- Any scatter must use the match's seeded random stream.
- Headless scenarios should cover successful release, interruption, replay
  equality, moving accuracy, blocks, goalkeeper interaction, and spam attempts.
- Visual shake, trails, and sound can use local presentation timing but may not
  change the authoritative ball state.

## Questions to answer through playtesting

- Can a first-time player identify every required controller action in under a
  minute?
- Does a standard PowerA pad work in-browser without remapping on the target
  computers?
- Is a power shot exciting when it misses, or merely frustrating?
- Can defenders recognize and punish the wind-up?
- Do roster identities remain noticeable without one rating archetype becoming
  dominant?
- Does each mod remain replay-stable and safe for an authoritative server?

## Reference notes

- [PowerA GameCube Style Wired Controller product page](https://www.powera.com/p/nintendo/nintendo-switch/controllers/wired/wired-controller-for-nintendo-switch-gamecube/) identifies the wired Switch model, added left shoulder/system controls, and lack of rumble.
- [PowerA controller manual](https://www.powera.com/contentassets/5b77a56ea43b4d9bb4adeadcef47d5eb/powera-gamecube-style-wired-controller-for-nintendo-switch_user-manual_1625879336.pdf) labels the `L`, `R`, `ZL`, and `ZR` controls.
- [PowerA PC compatibility note](https://www.powera.com/product-support/nintendo-switch-and-switch-2-support/articles/does-the-nintendo-switch-wired-controller-work-with-pc/) warns that Switch wired controllers may connect to a PC without full functionality.
- [*C.B.C. Distribution & Marketing v. MLB Advanced Media*, 505 F.3d 818 (8th Cir. 2007)](https://app.midpage.ai/document/c-b-c-distribution-marketing-1384811) addresses names and playing information in paid fantasy baseball.
- [*Daniels v. FanDuel*, 109 N.E.3d 390 (Ind. 2018)](https://caselaw.findlaw.com/court/in-supreme-court/1959819.html) addresses Indiana's newsworthy/public-interest statutory exception for fantasy-sports uses.
