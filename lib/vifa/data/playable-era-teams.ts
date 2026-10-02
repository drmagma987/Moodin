import { VIFA_WORLD_CUP_DATABASE } from './world-cup-database';
import { TEAMS } from '../game/teams';
import type { Kit, TeamData } from '../game/teams/types';
import {
  buildSevenASideTeam,
  makeSelectableSquadPlayer,
  pickBalancedSeven,
  type SelectableSquadPlayer,
} from '../game/seven-a-side';

export interface VifaEraTeamOption {
  id: string;
  year: number;
  tournamentName: string;
  team: TeamData;
  squad: SelectableSquadPlayer[];
}

const CURRENT_NAME_ALIASES: Record<string, string> = {
  'cote d ivoire': 'ivory coast',
  'korea republic': 'south korea',
  'united states': 'usa',
};

function normalizeName(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return CURRENT_NAME_ALIASES[normalized] ?? normalized;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackStyle(teamName: string): Pick<
  TeamData,
  'color' | 'textColor' | 'kit' | 'awayKit' | 'gkKit'
> {
  const hue = hashString(teamName) % 360;
  const color = `hsl(${hue} 58% 35%)`;
  const outline = `hsl(${hue} 65% 17%)`;
  const kit: Kit = {
    shirt: color,
    sleeve: `hsl(${hue} 60% 27%)`,
    outline,
    shorts: '#f4f4f2',
  };
  return {
    color,
    textColor: '#ffffff',
    kit,
    awayKit: {
      shirt: '#f5f5f1',
      sleeve: '#deded8',
      outline,
      shorts: '#f5f5f1',
    },
    gkKit: {
      shirt: '#d7e64b',
      sleeve: '#adbd2e',
      outline: '#59630f',
    },
  };
}

function teamStyle(teamName: string) {
  const current = TEAMS.find(
    (team) => normalizeName(team.name) === normalizeName(teamName),
  );
  if (!current) return fallbackStyle(teamName);
  return {
    color: current.color,
    textColor: current.textColor,
    kit: current.kit,
    awayKit: current.awayKit,
    gkKit: current.gkKit,
  };
}

export function buildPlayableEraTeamOptions(): VifaEraTeamOption[] {
  return VIFA_WORLD_CUP_DATABASE.tournaments.flatMap((tournament) => (
    tournament.teams
      .filter((team) => team.playable)
      .map((team) => {
        const squad = team.squad
          .filter((player) => player.ratings)
          .map((player) => makeSelectableSquadPlayer({
            id: player.playerId,
            num: player.shirtNumber,
            name: player.name,
            role: player.position === 'FW' ? 'ST' : player.position,
            ratings: player.ratings!,
          }));
        const style = teamStyle(team.name);
        const shell = {
          name: team.name,
          abbr: team.code,
          ...style,
        };
        return {
          id: `${tournament.year}-${team.code}`,
          year: tournament.year,
          tournamentName: tournament.name,
          team: buildSevenASideTeam(shell, squad, pickBalancedSeven(squad)),
          squad,
        };
      })
  ));
}
