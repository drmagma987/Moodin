export type Position = "QB" | "RB" | "WR" | "TE" | "DL" | "LB" | "SEC";

export type Archetype =
  | "Field General"
  | "Gunslinger"
  | "Dual Threat"
  | "Power Back"
  | "Elusive Back"
  | "Receiving Back"
  | "Deep Threat"
  | "Route Technician"
  | "YAC Specialist"
  | "Possession TE"
  | "Vertical Threat"
  | "Red Zone Target"
  | "Pass Rusher"
  | "Run Stopper"
  | "Coverage LB"
  | "Run Support"
  | "Playmaker"
  | "Lockdown"
  | "Ball Hawk";

export type Prospect = {
  id: string;
  name: string;
  position: Position;
  archetype: Archetype;
  height: number;
  forty: number;
  projectedRound: number;
  trueGrade: number;
};

export type DraftedPlayer = Prospect & {
  overallPick: number;
};