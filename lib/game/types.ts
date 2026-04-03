export type Position = "QB" | "RB" | "WR" | "TE" | "DL" | "LB" | "SEC";
export type CareerStage = "Rook" | "Prime" | "Unc";
export type AcquisitionType = "draft" | "keeper" | "freeAgency";

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
  weight: number;
  forty: number;
  bench: number;
  vertical: number;
  speedRating: number;
  technicalRating: number;
  powerRating: number;
  iqRating: number;
  projectedRound: number;
  trueGrade: number;
  careerStage?: CareerStage;
  acquisitionType?: AcquisitionType;
  seriesSourceSeed?: number | null;
  originalOverallPick?: number | null;
  freeAgencyTag?: string | null;
};

export type DraftedPlayer = Prospect & {
  overallPick: number;
};
