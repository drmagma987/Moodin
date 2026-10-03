import type { PlayerAppearance } from '../game/teams/types';

export interface CuratedWorldCupAppearance {
  year: number;
  teamCode: string;
  playerId: string;
  playerName: string;
  priority: number;
  appearance: PlayerAppearance;
  /** Official tournament photography used to keep this edition-specific. */
  evidenceUrl: string;
}

// These are deliberately tournament-edition records rather than timeless
// player skins. The same footballer can therefore age, grow a beard, change
// colour/style, or add/remove a headband without leaking that look into a
// different World Cup. Shapes are broad, original sprite descriptors—not
// traced faces or copied game likenesses.
export const CURATED_WORLD_CUP_APPEARANCES: CuratedWorldCupAppearance[] = [
  // Archive-ready classics. They become visible if 2002/2006 teams pass the
  // playable rating gate in a future data update.
  { year: 2002, teamCode: 'BRA', playerId: 'P-62722', playerName: 'Ronaldo', priority: 100, appearance: { skinTone: '#9b633f', hairColor: '#17120f', hairStyle: 'front-tuft', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/tribute-ronaldo-fenomeno-brazil-moments-goal-stats-videos' },
  { year: 2006, teamCode: 'ENG', playerId: 'P-81049', playerName: 'David Beckham', priority: 100, appearance: { skinTone: '#d8ad8c', hairColor: '#9a744b', hairStyle: 'spiked', facialHair: 'stubble' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2006germany' },
  { year: 2006, teamCode: 'FRA', playerId: 'P-56430', playerName: 'Zinedine Zidane', priority: 99, appearance: { skinTone: '#c99069', hairColor: '#2a201b', hairStyle: 'shaved', facialHair: 'stubble' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2006germany' },
  { year: 2006, teamCode: 'FRA', playerId: 'P-51395', playerName: 'Thierry Henry', priority: 96, appearance: { skinTone: '#7d4d32', hairColor: '#17120f', hairStyle: 'shaved', facialHair: 'goatee' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/photos-air-controllers' },

  // South Africa 2010.
  { year: 2010, teamCode: 'ARG', playerId: 'P-14758', playerName: 'Lionel Messi', priority: 100, appearance: { skinTone: '#d2a07d', hairColor: '#2a211d', hairStyle: 'long-loose', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/articles/lionel-messi-argentina-photos' },
  { year: 2010, teamCode: 'URY', playerId: 'P-86087', playerName: 'Diego Forlán', priority: 99, appearance: { skinTone: '#d2a17b', hairColor: '#b99154', hairStyle: 'long-loose', facialHair: 'stubble', headbandColor: '#16191c' }, evidenceUrl: 'https://www.fifa.com/en/articles/diego-forlan-goal-uruguay-germany-2010' },
  { year: 2010, teamCode: 'PRT', playerId: 'P-70442', playerName: 'Cristiano Ronaldo', priority: 98, appearance: { skinTone: '#c58d69', hairColor: '#241b18', hairStyle: 'spiked', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2010south-africa' },
  { year: 2010, teamCode: 'FRA', playerId: 'P-51395', playerName: 'Thierry Henry', priority: 97, appearance: { skinTone: '#7d4d32', hairColor: '#17120f', hairStyle: 'shaved', facialHair: 'goatee' }, evidenceUrl: 'https://www.fifa.com/fr/articles/france-afrique-du-sud-2010' },
  { year: 2010, teamCode: 'CIV', playerId: 'P-99466', playerName: 'Didier Drogba', priority: 96, appearance: { skinTone: '#6e402b', hairColor: '#17120f', hairStyle: 'long-tied', facialHair: 'goatee', headbandColor: '#111418' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2010south-africa' },
  { year: 2010, teamCode: 'NLD', playerId: 'P-23705', playerName: 'Arjen Robben', priority: 95, appearance: { skinTone: '#dfb18e', hairColor: '#8c6b49', hairStyle: 'shaved', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2010south-africa' },
  { year: 2010, teamCode: 'ESP', playerId: 'P-56330', playerName: 'Andrés Iniesta', priority: 94, appearance: { skinTone: '#d8aa87', hairColor: '#3b2c24', hairStyle: 'buzz', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2010south-africa' },

  // Brazil 2014.
  { year: 2014, teamCode: 'ARG', playerId: 'P-14758', playerName: 'Lionel Messi', priority: 100, appearance: { skinTone: '#d2a07d', hairColor: '#2a211d', hairStyle: 'short', facialHair: 'stubble' }, evidenceUrl: 'https://www.fifa.com/en/articles/lionel-messi-argentina-photos' },
  { year: 2014, teamCode: 'BRA', playerId: 'P-87008', playerName: 'Neymar', priority: 99, appearance: { skinTone: '#ad744f', hairColor: '#b99655', hairStyle: 'mohawk', facialHair: 'stubble' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/neymar-all-goals-watch' },
  { year: 2014, teamCode: 'COL', playerId: 'P-89392', playerName: 'James Rodríguez', priority: 98, appearance: { skinTone: '#c78f6b', hairColor: '#2a211d', hairStyle: 'short', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2014brazil' },
  { year: 2014, teamCode: 'HRV', playerId: 'P-29491', playerName: 'Luka Modrić', priority: 97, appearance: { skinTone: '#d8aa88', hairColor: '#8e704c', hairStyle: 'long-loose', facialHair: 'stubble', headbandColor: '#202326' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2014brazil' },
  { year: 2014, teamCode: 'PRT', playerId: 'P-70442', playerName: 'Cristiano Ronaldo', priority: 96, appearance: { skinTone: '#c58d69', hairColor: '#241b18', hairStyle: 'short', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2014brazil' },
  { year: 2014, teamCode: 'FRA', playerId: 'P-17509', playerName: 'Paul Pogba', priority: 95, appearance: { skinTone: '#70422d', hairColor: '#1b1512', hairStyle: 'mohawk', facialHair: 'none' }, evidenceUrl: 'https://inside.fifa.com/tournaments/mens/worldcup/2018russia/news/2806-pogba-feature-2972717' },
  { year: 2014, teamCode: 'NLD', playerId: 'P-23705', playerName: 'Arjen Robben', priority: 94, appearance: { skinTone: '#dfb18e', hairColor: '#8c6b49', hairStyle: 'shaved', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/photos-air-controllers' },

  // Russia 2018.
  { year: 2018, teamCode: 'HRV', playerId: 'P-29491', playerName: 'Luka Modrić', priority: 100, appearance: { skinTone: '#d8aa88', hairColor: '#8e704c', hairStyle: 'long-loose', facialHair: 'stubble', headbandColor: '#202326' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/luka-modric-magical-moments-with-croatia' },
  { year: 2018, teamCode: 'ARG', playerId: 'P-14758', playerName: 'Lionel Messi', priority: 99, appearance: { skinTone: '#d2a07d', hairColor: '#2a211d', hairStyle: 'short', facialHair: 'beard' }, evidenceUrl: 'https://www.fifa.com/en/articles/lionel-messi-argentina-photos' },
  { year: 2018, teamCode: 'PRT', playerId: 'P-70442', playerName: 'Cristiano Ronaldo', priority: 98, appearance: { skinTone: '#c58d69', hairColor: '#241b18', hairStyle: 'short', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/ja/tournaments/mens/worldcup/articles/cristiano-ronaldo-oldest-hat-trick-scorer-ja' },
  { year: 2018, teamCode: 'BRA', playerId: 'P-87008', playerName: 'Neymar', priority: 97, appearance: { skinTone: '#ad744f', hairColor: '#8f744b', hairStyle: 'curly-volume', facialHair: 'beard' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/photos-air-controllers' },
  { year: 2018, teamCode: 'EGY', playerId: 'P-75890', playerName: 'Mohamed Salah', priority: 96, appearance: { skinTone: '#a96f4c', hairColor: '#211815', hairStyle: 'curly-volume', facialHair: 'beard' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2018russia' },
  { year: 2018, teamCode: 'FRA', playerId: 'P-17509', playerName: 'Paul Pogba', priority: 95, appearance: { skinTone: '#70422d', hairColor: '#8d6a35', hairStyle: 'mohawk', facialHair: 'goatee' }, evidenceUrl: 'https://inside.fifa.com/tournaments/mens/worldcup/2018russia/news/2806-pogba-feature-2972717' },
  { year: 2018, teamCode: 'FRA', playerId: 'P-64077', playerName: 'Kylian Mbappé', priority: 94, appearance: { skinTone: '#7b4a32', hairColor: '#1a1412', hairStyle: 'buzz', facialHair: 'none' }, evidenceUrl: 'https://inside.fifa.com/tournaments/mens/worldcup/2018russia/news/worldcupathome-france-croatia-russia-2018-3072767' },
  { year: 2018, teamCode: 'FRA', playerId: 'P-90908', playerName: 'Antoine Griezmann', priority: 93, appearance: { skinTone: '#d7a985', hairColor: '#b89a67', hairStyle: 'short', facialHair: 'stubble' }, evidenceUrl: 'https://inside.fifa.com/en/tournaments/mens/worldcup/2018russia/news/will-world-cup-stars-shine-at-the-best' },
  { year: 2018, teamCode: 'KOR', playerId: 'P-77335', playerName: 'Heung-min Son', priority: 92, appearance: { skinTone: '#c99876', hairColor: '#211915', hairStyle: 'short', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/2018russia' },

  // Qatar 2022.
  { year: 2022, teamCode: 'ARG', playerId: 'P-14758', playerName: 'Lionel Messi', priority: 100, appearance: { skinTone: '#d2a07d', hairColor: '#2a211d', hairStyle: 'short', facialHair: 'beard' }, evidenceUrl: 'https://www.fifa.com/en/articles/lionel-messi-argentina-photos' },
  { year: 2022, teamCode: 'FRA', playerId: 'P-64077', playerName: 'Kylian Mbappé', priority: 99, appearance: { skinTone: '#7b4a32', hairColor: '#1a1412', hairStyle: 'buzz', facialHair: 'none' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022' },
  { year: 2022, teamCode: 'HRV', playerId: 'P-29491', playerName: 'Luka Modrić', priority: 98, appearance: { skinTone: '#d8aa88', hairColor: '#8e704c', hairStyle: 'long-loose', facialHair: 'stubble', headbandColor: '#202326' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/articles/luka-modric-magical-moments-with-croatia' },
  { year: 2022, teamCode: 'BRA', playerId: 'P-87008', playerName: 'Neymar', priority: 97, appearance: { skinTone: '#ad744f', hairColor: '#b89b64', hairStyle: 'curly-short', facialHair: 'beard' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/neymar-all-goals-watch' },
  { year: 2022, teamCode: 'PRT', playerId: 'P-70442', playerName: 'Cristiano Ronaldo', priority: 96, appearance: { skinTone: '#c58d69', hairColor: '#241b18', hairStyle: 'short', facialHair: 'stubble' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022' },
  { year: 2022, teamCode: 'FRA', playerId: 'P-90908', playerName: 'Antoine Griezmann', priority: 95, appearance: { skinTone: '#d7a985', hairColor: '#d7c39b', hairStyle: 'short', facialHair: 'stubble' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022' },
  { year: 2022, teamCode: 'KOR', playerId: 'P-77335', playerName: 'Heung-min Son', priority: 94, appearance: { skinTone: '#c99876', hairColor: '#211915', hairStyle: 'short', facialHair: 'none', faceMaskColor: '#111418' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022' },
  { year: 2022, teamCode: 'WAL', playerId: 'P-63927', playerName: 'Gareth Bale', priority: 93, appearance: { skinTone: '#d5a582', hairColor: '#5d4636', hairStyle: 'long-tied', facialHair: 'beard' }, evidenceUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022' },
];

const APPEARANCE_BY_EDITION_PLAYER = new Map(
  CURATED_WORLD_CUP_APPEARANCES.map((profile) => [
    `${profile.year}:${profile.teamCode}:${profile.playerId}`,
    profile,
  ]),
);

export function getCuratedWorldCupAppearance(
  year: number,
  teamCode: string,
  playerId: string,
): CuratedWorldCupAppearance | undefined {
  return APPEARANCE_BY_EDITION_PLAYER.get(`${year}:${teamCode}:${playerId}`);
}
