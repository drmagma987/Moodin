import databaseJson from './world-cup-database.generated.json' with { type: 'json' };

export type VifaRatingSource =
  | 'fifa-model-derived'
  | 'fifa-model-interpolated'
  | 'fifa-model-nearest-derived'
  | 'fifa-18-published-gk-adapter'
  | 'fifa-18-published'
  | 'fifa-22-published-gk-adapter'
  | 'fifa-22-published'
  | 'fc-26-published-gk-adapter'
  | 'fc-26-published'
  | 'vifa-tournament-estimate'
  | 'vifa-manual'
  | 'unavailable';

export type VifaIdentityMatchMethod =
  | 'birth-date'
  | 'birth-date-and-name'
  | 'name';

export interface HistoricalPlayerRecord {
  playerId: string;
  name: string;
  shirtNumber: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  overall: number | null;
  ratings: [number, number, number, number, number, number] | null;
  sourceGoalkeeperRatings: [number, number, number, number, number, number] | null;
  ratingSource: VifaRatingSource;
  sourcePlayerId: string | null;
  matchConfidence: number | null;
  ratingCoverage: number | null;
  ratingEdition: number | null;
  identityMatchMethod: VifaIdentityMatchMethod | null;
  estimationEvidence: {
    method: 'team-role-65-tournament-role-35-plus-tournament-usage';
    appearances: number;
    starts: number;
    goals: number;
    teamMatches: number;
    teamRoleSampleSize: number;
    tournamentRoleSampleSize: number;
  } | null;
}

export interface HistoricalTeamRecord {
  teamId: string;
  name: string;
  code: string;
  performance: string;
  squad: HistoricalPlayerRecord[];
  playable: boolean;
  ratedByRole: Record<HistoricalPlayerRecord['position'], number>;
  startingXiPlayerIds: string[];
}

export interface HistoricalTournamentRecord {
  year: number;
  name: string;
  teams: HistoricalTeamRecord[];
}

export interface VifaWorldCupDatabase {
  schemaVersion: number;
  tournaments: HistoricalTournamentRecord[];
}

export const VIFA_WORLD_CUP_DATABASE = databaseJson as VifaWorldCupDatabase;

export function getVifaWorldCupTournament(
  year: number,
): HistoricalTournamentRecord | undefined {
  return VIFA_WORLD_CUP_DATABASE.tournaments.find(
    (tournament) => tournament.year === year,
  );
}

export function getVifaHistoricalTeam(
  year: number,
  teamCode: string,
): HistoricalTeamRecord | undefined {
  return getVifaWorldCupTournament(year)?.teams.find(
    (team) => team.code === teamCode.toUpperCase(),
  );
}

export function getPlayableVifaHistoricalTeams(
  year: number,
): HistoricalTeamRecord[] {
  return getVifaWorldCupTournament(year)?.teams.filter((team) => team.playable) ?? [];
}

export function getVifaHistoricalStartingXi(
  year: number,
  teamCode: string,
): HistoricalPlayerRecord[] {
  const team = getVifaHistoricalTeam(year, teamCode);
  if (!team?.playable) return [];
  const selectedIds = new Set(team.startingXiPlayerIds);
  return team.squad.filter((player) => selectedIds.has(player.playerId));
}
