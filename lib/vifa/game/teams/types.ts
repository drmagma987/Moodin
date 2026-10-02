// Country squad data model. Each nation lives in its own small file under
// this folder and exports a single `TeamData`. The engine is team-agnostic:
// it takes two `TeamData` (home + away) and builds the match from them.

export interface Vec {
  x: number;
  y: number;
}

export interface Kit {
  shirt: string;
  sleeve: string;
  outline: string;
  /** Shorts colour (real home-kit shorts). Falls back to `sleeve` if omitted. */
  shorts?: string;
}

/** FIFA / EA FC-style face attributes. Values are normalized to integer 1-99
 *  ratings as team data is loaded; the engine never interprets them in-frame. */
export interface IndividualStats {
  readonly pac: number; // Pace        → movement / sprint speed
  readonly sho: number; // Shooting    → shot power + accuracy
  readonly pas: number; // Passing     → pass accuracy + weight
  readonly dri: number; // Dribbling   → close control + agility on the ball
  readonly def: number; // Defending   → tackle reach + success
  readonly phy: number; // Physicality → duels / shielding / strength
}

/** Compact tuple form used in the per-team data files to keep them tiny:
 *  [PAC, SHO, PAS, DRI, DEF, PHY]. */
export type RatingTuple = [number, number, number, number, number, number];

export type SquadRole = 'GK' | 'DF' | 'MF' | 'ST';

/** Role from squad index: 0 = GK, 1-4 = DF, 5-8 = MF, 9-10 = ST. */
export function roleForIndex(i: number): SquadRole {
  return i === 0 ? 'GK' : i <= 4 ? 'DF' : i <= 8 ? 'MF' : 'ST';
}

// Role weightings for the overall, loosely following EA's outfield model
// (and a goalkeeper-specific blend that leans on DEF/PHY which we use to
// store reflex/handling for keepers).
const OVR_WEIGHTS: Record<SquadRole, RatingTuple> = {
  //         PAC   SHO   PAS   DRI   DEF   PHY
  GK: [0.05, 0.0, 0.1, 0.05, 0.45, 0.35],
  DF: [0.15, 0.03, 0.12, 0.1, 0.4, 0.2],
  MF: [0.12, 0.15, 0.27, 0.23, 0.13, 0.1],
  ST: [0.2, 0.32, 0.13, 0.22, 0.03, 0.1],
};

/** Per-role baseline used when a player has no explicit ratings yet (teams not
 *  rated in this pass). Tuned so an unrated squad is a competent but beatable
 *  ~70-rated side — clearly weaker than the hand-rated top contenders. */
const ROLE_DEFAULT: Record<SquadRole, RatingTuple> = {
  //         PAC  SHO  PAS  DRI  DEF  PHY
  GK: [56, 28, 52, 46, 54, 68],
  DF: [70, 44, 62, 62, 73, 75],
  MF: [72, 64, 73, 72, 63, 70],
  ST: [78, 75, 67, 76, 40, 72],
};

function normalizeRating(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.round(value)));
}

function normalizeTuple(tuple: RatingTuple): RatingTuple {
  return tuple.map(normalizeRating) as RatingTuple;
}

function computeOvr(role: SquadRole, t: RatingTuple): number {
  const w = OVR_WEIGHTS[role];
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += t[i] * w[i];
  return Math.round(sum);
}

/** Build named, validated attributes from compact roster authoring data. */
export function makeIndividualStats(
  role: SquadRole,
  tuple?: RatingTuple,
): IndividualStats {
  const t = normalizeTuple(tuple ?? ROLE_DEFAULT[role]);
  return Object.freeze({
    pac: t[0],
    sho: t[1],
    pas: t[2],
    dri: t[3],
    def: t[4],
    phy: t[5],
  });
}

export function computeOverallRating(
  role: SquadRole,
  stats: IndividualStats,
): number {
  return computeOvr(role, [
    stats.pac,
    stats.sho,
    stats.pas,
    stats.dri,
    stats.def,
    stats.phy,
  ]);
}

export interface SquadPlayer {
  /** Shirt number, shown on the jersey + broadcast lower-third. */
  num: number;
  /** Surname, shown in the broadcast lower-third. */
  name: string;
  /** Formation position as a fraction of the field, attacking RIGHT. */
  pos: Vec;
  /** Tactical role used by the engine. Do not infer this from lineup size. */
  role: SquadRole;
  /** This specific player's six face attributes. */
  individualStats: IndividualStats;
  /** Role-weighted display value; gameplay uses the six attributes directly. */
  overallRating: number;
}

export interface TeamData {
  name: string;
  /** 3-letter code for the scoreboard. */
  abbr: string;
  /** Display formation, e.g. "4-3-3". */
  formation: string;
  /** Primary kit colour used for UI accents (bars, badges). */
  color: string;
  /** Legible colour to draw on top of `color`. */
  textColor: string;
  /** Outfield kit (home / primary). */
  kit: Kit;
  /** Outfield away (change) kit, worn when this team is the visitor. */
  awayKit: Kit;
  /** Goalkeeper kit (distinct, like real football). */
  gkKit: Kit;
  /** Index of the player who takes the kickoff (usually the central striker). */
  kickoffFwd: number;
  /** Matchday lineup; index 0 is always the goalkeeper. */
  players: SquadPlayer[];
}

/** Pairs a name/number roster with a shared formation position template so
 *  each country file stays tiny. An optional `r` tuple gives the player real
 *  FIFA-style ratings; omitted players fall back to a role baseline. */
export function buildSquad(
  formation: Vec[],
  roster: { num: number; name: string; r?: RatingTuple; role?: SquadRole }[],
): SquadPlayer[] {
  if (formation.length < roster.length) {
    throw new Error('Formation does not contain a position for every player');
  }

  return roster.map((entry, i) => {
    const role = entry.role ?? roleForIndex(i);
    const individualStats = makeIndividualStats(role, entry.r);
    return {
      num: entry.num,
      name: entry.name,
      pos: formation[i],
      role,
      individualStats,
      overallRating: computeOverallRating(role, individualStats),
    };
  });
}
