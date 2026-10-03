// Core engine-domain types shared across the simulation and renderer.
// (Team data types — TeamData, Kit — live in ./teams/types.)

import type { IndividualStats, PlayerAppearance } from './teams/types';

export type Vec = { x: number; y: number };
export type Team = 'home' | 'away';
export type Role = 'GK' | 'DF' | 'MF' | 'ST';

export interface PlayerPhysicsScalars {
  readonly cachedPaceMultiplier: number;
  readonly cachedAccelerationMultiplier: number;
  readonly cachedShotPowerMultiplier: number;
  readonly cachedShotSpreadMultiplier: number;
  readonly cachedShotChargeRate: number;
  readonly cachedPassPowerMultiplier: number;
  readonly cachedPassSpreadMultiplier: number;
  readonly cachedPassChargeRate: number;
  readonly cachedDribbleSpeedMultiplier: number;
  readonly cachedDribbleAccelerationMultiplier: number;
  readonly cachedBallControlRadius: number;
  readonly cachedTackleRadius: number;
  readonly cachedStandingTackleRadius: number;
  readonly cachedSlideTackleRadius: number;
  readonly cachedContainTackleRadius: number;
  readonly cachedAiTackleRadius: number;
  readonly cachedPhysicalDuelOffset: number;
  /** Goalkeeper-only quality scalars. Outfielders retain harmless baselines. */
  readonly cachedKeeperReachMultiplier: number;
  readonly cachedKeeperPositionMultiplier: number;
  readonly cachedKeeperCatchMultiplier: number;
  readonly cachedKeeperReactionMultiplier: number;
}

export interface TeamTelemetry {
  possessionTicks: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  tacklesAttempted: number;
  tacklesWon: number;
  saves: number;
  turnoversWon: number;
}

export interface MatchTelemetry {
  home: TeamTelemetry;
  away: TeamTelemetry;
}

export interface Player extends PlayerPhysicsScalars {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  team: Team;
  /** Formation anchor in field coordinates. */
  anchor: Vec;
  facing: Vec;
  /** Run-cycle phase, advanced by distance travelled. */
  animPhase: number;
  /** > 0 while playing the kick pose. */
  kickTimer: number;
  hair: string;
  skin: string;
  /** Renderer-only identity and featured-player cosmetics. */
  appearance: PlayerAppearance;
  isGK: boolean;
  role: Role;
  /** Shirt number, shown on the back of the jersey. */
  num: number;
  /** Surname, shown in the FIFA-style selected-player indicator. */
  name: string;
  /** Immutable profile data. Physics code reads only the flat cached scalars. */
  individualStats: IndividualStats;
  /** Role-weighted display value; not used as a catch-all gameplay modifier. */
  overallRating: number;
  /** > 0 while playing the goal-celebration pose (arms raised). */
  celebrating?: boolean;
  /** > 0 while a keeper is playing the dive/save pose (full-body lay-out). */
  diveTimer?: number;
  /** Direction of the current dive along the goal mouth (world-y sign). */
  diveDir?: number;
  /** Lockout so a keeper doesn't re-trigger a dive every frame. */
  diveCooldown?: number;
  /** > 0 while playing the grounded sliding-tackle pose (full-body lay-out). */
  slideTimer?: number;
  /** Direction the slide is committed along, in field coordinates. */
  slideDir?: Vec;
  /** True while this player is holding the ball overhead for a throw-in. */
  throwing?: boolean;
}

/** Compatibility name for renderer and engine call sites. */
export type PlayerEntity = Player;

export interface HudState {
  homeScore: number;
  awayScore: number;
  /** In-game match seconds elapsed (counts UP, 0 -> 5400 = 90:00). */
  clock: number;
  message: string;
  possession: Team | 'none';
  /** Active player per side, for the bottom-corner broadcast lower-thirds. */
  homePlayer: { num: number; name: string } | null;
  awayPlayer: { num: number; name: string } | null;
  /** 0..1 charge of the in-progress home kick, or null when not charging. */
  charge: number | null;
  /** 0..1 charge of the local second player's kick, or null when inactive. */
  awayCharge: number | null;
}

export type StateListener = (s: HudState) => void;
