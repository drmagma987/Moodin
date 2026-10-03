import type { Kit } from '../game/teams/types';

export type WorldCupKitVariant = 'home' | 'away' | 'third';

export interface WorldCupKitOption {
  id: string;
  teamCode: string;
  year: number;
  variant: WorldCupKitVariant;
  label: string;
  kit: Kit;
  sourceUrl?: string;
  curated: boolean;
}

type EraKitFallback = { year: number; home: Kit; away: Kit };

const franceArchive = 'https://www.footballkitarchive.com/france-kits/';
const worldCupArchive = 'https://www.footballkitarchive.com/world-cup-kits-l308/';

function kit(
  teamCode: string,
  year: number,
  variant: WorldCupKitVariant,
  shirt: string,
  sleeve: string,
  outline: string,
  shorts: string,
  pattern: Kit['pattern'] = 'solid',
  accent?: string,
  secondaryAccent?: string,
  sourceUrl = worldCupArchive,
): WorldCupKitOption {
  return {
    id: `${teamCode}-${year}-${variant}`,
    teamCode,
    year,
    variant,
    label: `${year} ${variant[0].toUpperCase()}${variant.slice(1)}`,
    kit: { shirt, sleeve, outline, shorts, pattern, accent, secondaryAccent },
    sourceUrl,
    curated: true,
  };
}

/**
 * Original, logo-free approximations of selected tournament shirts. The
 * archive records only kits actually associated with a World Cup edition;
 * third entries are not synthesized when a nation did not have one.
 */
export const CURATED_WORLD_CUP_KITS: WorldCupKitOption[] = [
  // France — deliberately deep because cross-era France was the motivating UX.
  kit('FRA', 1978, 'home', '#1752a3', '#1752a3', '#0b2b60', '#f4f4f1', 'shoulder-stripes', '#ffffff', '#d7193f', franceArchive),
  kit('FRA', 1978, 'away', '#f4f4f1', '#f4f4f1', '#1752a3', '#1752a3', 'shoulder-stripes', '#1752a3', '#d7193f', franceArchive),
  kit('FRA', 1978, 'third', '#2f8d46', '#f4f4f1', '#1b5b2d', '#f4f4f1', 'pinstripes', '#ffffff', undefined, franceArchive),
  kit('FRA', 1982, 'home', '#1854a8', '#1854a8', '#0a2d63', '#f4f4f1', 'shoulder-stripes', '#ffffff', '#d7193f', franceArchive),
  kit('FRA', 1982, 'away', '#f4f4f1', '#f4f4f1', '#1854a8', '#1854a8', 'shoulder-stripes', '#1854a8', '#d7193f', franceArchive),
  kit('FRA', 1986, 'home', '#1552a3', '#1552a3', '#082b61', '#f4f4f1', 'shoulder-stripes', '#ffffff', '#d7193f', franceArchive),
  kit('FRA', 1986, 'away', '#f4f4f1', '#f4f4f1', '#1552a3', '#1552a3', 'shoulder-stripes', '#1552a3', '#d7193f', franceArchive),
  kit('FRA', 1998, 'home', '#164f9f', '#164f9f', '#092953', '#f4f4f1', 'chest-band', '#d7193f', '#ffffff', franceArchive),
  kit('FRA', 1998, 'away', '#f3f3ef', '#f3f3ef', '#164f9f', '#164f9f', 'chest-band', '#d7193f', '#164f9f', franceArchive),
  kit('FRA', 2002, 'home', '#2058b2', '#2058b2', '#111f58', '#f4f4f1', 'shoulder-stripes', '#ffffff', '#d7193f', 'https://www.footballkitarchive.com/france-2002-home-kit-4726/'),
  kit('FRA', 2002, 'away', '#f5f5f2', '#f5f5f2', '#2058b2', '#2058b2', 'shoulder-stripes', '#2058b2', '#d7193f', franceArchive),
  kit('FRA', 2006, 'home', '#1d4f9e', '#1d4f9e', '#0a2858', '#ffffff', 'chest-band', '#d7193f', '#ffffff', franceArchive),
  kit('FRA', 2006, 'away', '#ffffff', '#ffffff', '#1d4f9e', '#1d4f9e', 'chest-band', '#d7193f', '#1d4f9e', franceArchive),
  kit('FRA', 2010, 'home', '#172f66', '#172f66', '#07162f', '#ffffff', 'shoulder-stripes', '#ffffff', '#d7193f', franceArchive),
  kit('FRA', 2010, 'away', '#f4f4f1', '#f4f4f1', '#172f66', '#f4f4f1', 'pinstripes', '#244d96', '#d7193f', franceArchive),
  kit('FRA', 2014, 'home', '#183f78', '#183f78', '#0a2346', '#183f78', 'solid', '#d5b85a', undefined, franceArchive),
  kit('FRA', 2014, 'away', '#f3f4f2', '#e8ebed', '#183f78', '#f3f4f2', 'pinstripes', '#b9c4d4', '#d7193f', franceArchive),
  kit('FRA', 2018, 'home', '#14294f', '#315f9f', '#07152b', '#f4f4f1', 'solid', '#d7193f', undefined, franceArchive),
  kit('FRA', 2018, 'away', '#f5f5f3', '#f5f5f3', '#14294f', '#14294f', 'pinstripes', '#c7d3e3', '#d7193f', franceArchive),
  kit('FRA', 2022, 'home', '#182544', '#182544', '#080f20', '#f4f4f1', 'solid', '#c7a85b', undefined, franceArchive),
  kit('FRA', 2022, 'away', '#f5f4ef', '#f5f4ef', '#182544', '#182544', 'pinstripes', '#a9b5c5', '#c7a85b', franceArchive),

  // A starter archive of other unmistakable World Cup designs.
  kit('ARG', 1986, 'home', '#75bce8', '#75bce8', '#183a68', '#111827', 'pinstripes', '#ffffff'),
  kit('ARG', 1986, 'away', '#1f3f91', '#1f3f91', '#0b1d4d', '#ffffff', 'solid', '#76bce8'),
  kit('ARG', 2014, 'home', '#7bc4ec', '#7bc4ec', '#1e4774', '#ffffff', 'pinstripes', '#ffffff'),
  kit('ARG', 2014, 'away', '#202d63', '#202d63', '#0b153a', '#202d63', 'solid', '#7bc4ec'),
  kit('ARG', 2022, 'home', '#73bee8', '#73bee8', '#183d69', '#ffffff', 'pinstripes', '#ffffff'),
  kit('ARG', 2022, 'away', '#4a2a83', '#3a216a', '#21113f', '#4a2a83', 'solid', '#8ed8df'),
  kit('BRA', 1970, 'home', '#f3cc26', '#f3cc26', '#176b3a', '#2456a6', 'solid', '#176b3a'),
  kit('BRA', 1994, 'home', '#f2cf2d', '#f2cf2d', '#176b3a', '#2456a6', 'solid', '#176b3a'),
  kit('BRA', 1994, 'away', '#2456a6', '#2456a6', '#102b62', '#ffffff', 'solid', '#f2cf2d'),
  kit('BRA', 2002, 'home', '#f4d42d', '#176b3a', '#176b3a', '#2456a6', 'solid', '#176b3a'),
  kit('BRA', 2002, 'away', '#2456a6', '#176b3a', '#102b62', '#ffffff', 'solid', '#f4d42d'),
  kit('DEU', 1990, 'home', '#f4f4f1', '#f4f4f1', '#191919', '#191919', 'chest-band', '#111111', '#d5a919'),
  kit('DEU', 1990, 'away', '#2e7c55', '#2e7c55', '#153b28', '#f4f4f1', 'solid', '#ffffff'),
  kit('DEU', 2014, 'home', '#f4f4f1', '#f4f4f1', '#171717', '#f4f4f1', 'chest-band', '#b5122b', '#e3b534'),
  kit('DEU', 2018, 'away', '#2d7564', '#2d7564', '#163c34', '#ffffff', 'checker', '#1f5c4d'),
  kit('ENG', 1966, 'home', '#f5f5f2', '#f5f5f2', '#b51235', '#f5f5f2', 'solid', '#b51235'),
  kit('ENG', 1990, 'home', '#f5f5f2', '#f5f5f2', '#173b72', '#173b72', 'shoulder-stripes', '#8eb7d8', '#b51235'),
  kit('ENG', 1990, 'third', '#79a8c8', '#79a8c8', '#173b72', '#173b72', 'shoulder-stripes', '#ffffff', '#b51235'),
  kit('ENG', 2002, 'home', '#f5f5f2', '#f5f5f2', '#b51235', '#f5f5f2', 'sash', '#b51235'),
  kit('ENG', 2002, 'away', '#b51235', '#9b0f2c', '#5d091b', '#b51235', 'solid', '#ffffff'),
  kit('HRV', 1998, 'home', '#f5f5f2', '#f5f5f2', '#b51235', '#ffffff', 'checker', '#d21f3c'),
  kit('HRV', 2018, 'home', '#f5f5f2', '#f5f5f2', '#b51235', '#ffffff', 'checker', '#d21f3c'),
  kit('HRV', 2018, 'away', '#182a66', '#182a66', '#091536', '#182a66', 'checker', '#161b2a', '#d21f3c'),
  kit('MEX', 1998, 'home', '#0d6b3f', '#0d6b3f', '#063b23', '#ffffff', 'chest-band', '#124d32', '#d9b35b'),
  kit('MEX', 2022, 'home', '#0d6b3f', '#0d6b3f', '#063b23', '#ffffff', 'solid', '#d7193f'),
  kit('MEX', 2022, 'away', '#efe5cf', '#efe5cf', '#7f1d2d', '#7f1d2d', 'checker', '#9f2337'),
  kit('NLD', 1974, 'home', '#ed6d1f', '#ed6d1f', '#8a310d', '#ffffff', 'solid', '#111111'),
  kit('NLD', 2014, 'home', '#ef741e', '#ef741e', '#8a310d', '#ffffff', 'solid', '#173f8b'),
  kit('NLD', 2014, 'away', '#173f8b', '#173f8b', '#091b45', '#173f8b', 'solid', '#ef741e'),
  kit('ESP', 2010, 'home', '#bd1734', '#bd1734', '#681024', '#173f8b', 'shoulder-stripes', '#e3bd3c'),
  kit('ESP', 2010, 'away', '#182d62', '#182d62', '#091630', '#ffffff', 'shoulder-stripes', '#e3bd3c'),
  kit('PRT', 2006, 'home', '#a9142e', '#a9142e', '#590a19', '#a9142e', 'split', '#176a44'),
  kit('PRT', 2006, 'away', '#f4f4f1', '#f4f4f1', '#176a44', '#f4f4f1', 'chest-band', '#a9142e', '#176a44'),
  kit('PRT', 2022, 'home', '#a9142e', '#176a44', '#590a19', '#176a44', 'split', '#176a44'),
  kit('PRT', 2022, 'away', '#efe7d6', '#efe7d6', '#176a44', '#efe7d6', 'chest-band', '#a9142e', '#176a44'),
];

export function getWorldCupKitArchive(
  teamCode: string,
  eraFallbacks: EraKitFallback[],
): WorldCupKitOption[] {
  const curated = CURATED_WORLD_CUP_KITS.filter((option) => option.teamCode === teamCode);
  const curatedIds = new Set(curated.map((option) => option.id));
  const fallback = eraFallbacks.flatMap(({ year, home, away }) => ([
    {
      id: `${teamCode}-${year}-home`,
      teamCode,
      year,
      variant: 'home' as const,
      label: `${year} Home`,
      kit: home,
      curated: false,
    },
    {
      id: `${teamCode}-${year}-away`,
      teamCode,
      year,
      variant: 'away' as const,
      label: `${year} Away`,
      kit: away,
      curated: false,
    },
  ])).filter((option) => !curatedIds.has(option.id));

  return [...curated, ...fallback].sort((a, b) => (
    b.year - a.year
    || ['home', 'away', 'third'].indexOf(a.variant) - ['home', 'away', 'third'].indexOf(b.variant)
  ));
}
