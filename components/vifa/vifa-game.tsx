'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  Gamepad2,
  Keyboard,
  Settings,
  Smartphone,
  X,
} from 'lucide-react';
import {
  PitchKickGame,
  CANVAS_W,
  CANVAS_H,
  type HudState,
} from '@/lib/vifa/game/engine';
import type { VifaEraTeamOption } from '@/lib/vifa/data/playable-era-teams';
import type { TeamData } from '@/lib/vifa/game/teams';
import type { Kit } from '@/lib/vifa/game/teams/types';
import {
  getWorldCupKitArchive,
  type WorldCupKitOption,
} from '@/lib/vifa/data/world-cup-kits';
import {
  assignPlayersToFormation,
  buildSevenASideTeam,
  chooseCpuFormation,
  isCompleteSeven,
  pickBalancedSeven,
  SEVEN_ROLE_ORDER,
  type SelectableSquadPlayer,
  type SevenRole,
} from '@/lib/vifa/game/seven-a-side';
import {
  getSevenFormation,
  SEVEN_A_SIDE_FORMATIONS,
  type SevenFormationId,
} from '@/lib/vifa/game/teams/formations';
import {
  findCurrentOrNextMatch,
  type Match,
} from '@/lib/vifa/game/teams/schedule';
import {
  loadBindings,
  saveBindings,
  assignKey,
  codeLabel,
  controlsLegend,
  BINDING_GROUPS,
  DEFAULT_BINDINGS,
  type KeyBindings,
  type GameAction,
} from '@/lib/vifa/game/keybindings';
import {
  CONTROLLER_ACTION_LABELS,
  CONTROLLER_ACTION_HELP,
  CONTROLLER_ACTION_ORDER,
  DEFAULT_CONTROLLER_BINDINGS,
  assignControllerButton,
  connectedGamepads,
  controllerButtonLabel,
  loadControllerBindings,
  pressedButtonIndexes,
  saveControllerBindings,
  type ControllerAction,
  type ControllerBindings,
} from '@/lib/vifa/game/gamepad';
import { PLAYER_TWO_BINDINGS, VIFA_MODS } from '@/lib/vifa/mods';
import { INPUT_BITS } from '@/lib/vifa/game/determinism';
import { TOUCH_MOVE_MASK, touchDirectionBits } from '@/lib/vifa/game/touch';

type Phase = 'intro' | 'select' | 'squad' | 'playing';
type Mode = 'match' | 'local' | 'practice';

const FEATURED_ACCENTS = [
  { name: 'Volt', value: '#c6ff2e' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Orange', value: '#fb923c' },
  { name: 'Pink', value: '#f472b6' },
  { name: 'Purple', value: '#c084fc' },
  { name: 'White', value: '#f8fafc' },
] as const;

const FEATURED_MARKERS = ['ring', 'diamond', 'burst'] as const;

function suggestedFeaturedPlayerId(
  squad: SelectableSquadPlayer[],
  lineupIds: string[],
): string | null {
  const lineup = new Set(lineupIds);
  return squad
    .filter((player) => lineup.has(player.id))
    .sort((a, b) => (
      (b.iconicPriority ?? 0) - (a.iconicPriority ?? 0)
      || b.overallRating - a.overallRating
    ))[0]?.id ?? null;
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function wrap(i: number, n: number) {
  return ((i % n) + n) % n;
}

function selectionSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function VifaGame({ eraTeams }: { eraTeams: VifaEraTeamOption[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enhancementCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PitchKickGame | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [mode, setMode] = useState<Mode>('match');
  const [introIdx, setIntroIdx] = useState(0);
  const [gameKey, setGameKey] = useState(0);
  const [bindings, setBindings] = useState<KeyBindings>(() => loadBindings());
  const [controllerBindings, setControllerBindings] = useState<ControllerBindings>(
    () => loadControllerBindings(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const touchHeldRef = useRef(0);
  const [touchEnvironment, setTouchEnvironment] = useState({
    capable: false,
    landscape: false,
  });

  useEffect(() => {
    const updateTouchEnvironment = () => {
      const previewTouch = new URLSearchParams(window.location.search).has(
        'touch-preview',
      );
      setTouchEnvironment({
        capable: previewTouch ||
          navigator.maxTouchPoints > 0 ||
          window.matchMedia('(pointer: coarse)').matches,
        landscape: window.innerWidth > window.innerHeight,
      });
    };
    updateTouchEnvironment();
    window.addEventListener('resize', updateTouchEnvironment);
    window.addEventListener('orientationchange', updateTouchEnvironment);
    return () => {
      window.removeEventListener('resize', updateTouchEnvironment);
      window.removeEventListener('orientationchange', updateTouchEnvironment);
    };
  }, []);

  // Default the team picker to the next/live World Cup 2026 fixture so the
  // matchup feels topical the moment you open the game.
  const initialMatch = useRef<Match | null>(findCurrentOrNextMatch()).current;
  const initialHome = initialMatch
    ? eraTeams.find(
        (option) => option.year === 2026 && option.team.abbr === initialMatch.home.abbr,
      )
    : undefined;
  const initialAway = initialMatch
    ? eraTeams.find(
        (option) => option.year === 2026 && option.team.abbr === initialMatch.away.abbr,
      )
    : undefined;
  const fallbackHome = initialHome
    ?? eraTeams.find((option) => option.year === 2026)
    ?? eraTeams[0];
  const fallbackAway = initialAway
    ?? eraTeams.find((option) => option.year === 2026 && option.id !== fallbackHome.id)
    ?? eraTeams.find((option) => option.id !== fallbackHome.id)
    ?? eraTeams[0];

  // Each side owns an independent year + team identity, enabling cross-era play.
  const [homeSelectionId, setHomeSelectionId] = useState(fallbackHome.id);
  const [awaySelectionId, setAwaySelectionId] = useState(fallbackAway.id);
  const [homeKitId, setHomeKitId] = useState(
    `${fallbackHome.team.abbr}-${fallbackHome.year}-home`,
  );
  const [awayKitId, setAwayKitId] = useState(
    `${fallbackAway.team.abbr}-${fallbackAway.year}-away`,
  );
  const [activeSide, setActiveSide] = useState<'home' | 'away'>('home');
  const [activeSquadSide, setActiveSquadSide] = useState<'home' | 'away'>('home');
  const [homeFormationId, setHomeFormationId] = useState<SevenFormationId>('2-2-2');
  const [awayFormationId, setAwayFormationId] = useState<SevenFormationId>('2-2-2');
  const fallbackHomeLineup = pickBalancedSeven(fallbackHome.squad);
  const fallbackAwayLineup = pickBalancedSeven(fallbackAway.squad);
  const [homeLineupIds, setHomeLineupIds] = useState<string[]>(() =>
    fallbackHomeLineup,
  );
  const [awayLineupIds, setAwayLineupIds] = useState<string[]>(() =>
    fallbackAwayLineup,
  );
  const [homeFeaturedPlayerId, setHomeFeaturedPlayerId] = useState<string | null>(() =>
    suggestedFeaturedPlayerId(fallbackHome.squad, fallbackHomeLineup),
  );
  const [awayFeaturedPlayerId, setAwayFeaturedPlayerId] = useState<string | null>(() =>
    suggestedFeaturedPlayerId(fallbackAway.squad, fallbackAwayLineup),
  );
  const [homeFeaturedAccentIndex, setHomeFeaturedAccentIndex] = useState(0);
  const [awayFeaturedAccentIndex, setAwayFeaturedAccentIndex] = useState(1);
  const [homeFeaturedMarkerIndex, setHomeFeaturedMarkerIndex] = useState(0);
  const [awayFeaturedMarkerIndex, setAwayFeaturedMarkerIndex] = useState(1);

  const homeOption = eraTeams.find((option) => option.id === homeSelectionId)
    ?? fallbackHome;
  const awayOption = eraTeams.find((option) => option.id === awaySelectionId)
    ?? fallbackAway;
  const homeKitOptions = useMemo(() => getWorldCupKitArchive(
    homeOption.team.abbr,
    eraTeams
      .filter((option) => option.team.abbr === homeOption.team.abbr)
      .map((option) => ({
        year: option.year,
        home: option.team.kit,
        away: option.team.awayKit,
      })),
  ), [eraTeams, homeOption.team.abbr]);
  const awayKitOptions = useMemo(() => getWorldCupKitArchive(
    awayOption.team.abbr,
    eraTeams
      .filter((option) => option.team.abbr === awayOption.team.abbr)
      .map((option) => ({
        year: option.year,
        home: option.team.kit,
        away: option.team.awayKit,
      })),
  ), [awayOption.team.abbr, eraTeams]);
  const homeKitOption = homeKitOptions.find((option) => option.id === homeKitId)
    ?? homeKitOptions.find((option) => option.year === homeOption.year && option.variant === 'home')
    ?? homeKitOptions[0];
  const awayKitOption = awayKitOptions.find((option) => option.id === awayKitId)
    ?? awayKitOptions.find((option) => option.year === awayOption.year && option.variant === 'away')
    ?? awayKitOptions[0];
  const homeLineupComplete = isCompleteSeven(homeOption.squad, homeLineupIds);
  const awayLineupComplete = isCompleteSeven(awayOption.squad, awayLineupIds);
  const home: TeamData = useMemo(
    () => buildSevenASideTeam(
      { ...homeOption.team, kit: homeKitOption.kit },
      homeOption.squad,
      homeLineupIds,
      homeFormationId,
      {
        playerId: homeFeaturedPlayerId,
        accent: FEATURED_ACCENTS[homeFeaturedAccentIndex].value,
        marker: FEATURED_MARKERS[homeFeaturedMarkerIndex],
      },
    ),
    [
      homeFeaturedAccentIndex,
      homeFeaturedMarkerIndex,
      homeFeaturedPlayerId,
      homeFormationId,
      homeLineupIds,
      homeOption,
      homeKitOption,
    ],
  );
  const away: TeamData = useMemo(
    () => buildSevenASideTeam(
      { ...awayOption.team, awayKit: awayKitOption.kit },
      awayOption.squad,
      awayLineupIds,
      awayFormationId,
      {
        playerId: awayFeaturedPlayerId,
        accent: FEATURED_ACCENTS[awayFeaturedAccentIndex].value,
        marker: FEATURED_MARKERS[awayFeaturedMarkerIndex],
      },
    ),
    [
      awayFeaturedAccentIndex,
      awayFeaturedMarkerIndex,
      awayFeaturedPlayerId,
      awayFormationId,
      awayLineupIds,
      awayOption,
      awayKitOption,
    ],
  );
  const availableYears = useMemo(
    () => [...new Set(eraTeams.map((option) => option.year))].sort((a, b) => b - a),
    [eraTeams],
  );

  const optionsForYear = useCallback(
    (year: number) => eraTeams.filter((option) => option.year === year),
    [eraTeams],
  );
  const setSelectionYear = useCallback((side: 'home' | 'away', year: number) => {
    const current = side === 'home' ? homeOption : awayOption;
    const yearOptions = optionsForYear(year);
    const sameNation = yearOptions.find(
      (option) => option.team.abbr === current.team.abbr
        || option.team.name === current.team.name,
    );
    const next = sameNation ?? yearOptions[0];
    if (!next) return;
    if (side === 'home') {
      const ids = pickBalancedSeven(next.squad, homeFormationId);
      setHomeSelectionId(next.id);
      setHomeKitId(`${next.team.abbr}-${next.year}-home`);
      setHomeLineupIds(ids);
      setHomeFeaturedPlayerId(suggestedFeaturedPlayerId(next.squad, ids));
    } else {
      const ids = pickBalancedSeven(next.squad, awayFormationId);
      setAwaySelectionId(next.id);
      setAwayKitId(`${next.team.abbr}-${next.year}-away`);
      setAwayLineupIds(ids);
      setAwayFeaturedPlayerId(suggestedFeaturedPlayerId(next.squad, ids));
    }
  }, [awayFormationId, awayOption, homeFormationId, homeOption, optionsForYear]);
  const cycleSelection = useCallback((side: 'home' | 'away', direction: number) => {
    const current = side === 'home' ? homeOption : awayOption;
    const yearOptions = optionsForYear(current.year);
    const index = Math.max(0, yearOptions.findIndex((option) => option.id === current.id));
    const next = yearOptions[wrap(index + direction, yearOptions.length)];
    if (side === 'home') {
      const ids = pickBalancedSeven(next.squad, homeFormationId);
      setHomeSelectionId(next.id);
      setHomeKitId(`${next.team.abbr}-${next.year}-home`);
      setHomeLineupIds(ids);
      setHomeFeaturedPlayerId(suggestedFeaturedPlayerId(next.squad, ids));
    } else {
      const ids = pickBalancedSeven(next.squad, awayFormationId);
      setAwaySelectionId(next.id);
      setAwayKitId(`${next.team.abbr}-${next.year}-away`);
      setAwayLineupIds(ids);
      setAwayFeaturedPlayerId(suggestedFeaturedPlayerId(next.squad, ids));
    }
  }, [awayFormationId, awayOption, homeFormationId, homeOption, optionsForYear]);
  const confirmActiveSelection = useCallback(() => {
    if (activeSide === 'home') setActiveSide('away');
    else {
      setActiveSquadSide('home');
      setPhase('squad');
    }
  }, [activeSide]);

  const setTeamSelection = useCallback((side: 'home' | 'away', id: string) => {
    const next = eraTeams.find((option) => option.id === id);
    if (!next) return;
    if (side === 'home') {
      const ids = pickBalancedSeven(next.squad, homeFormationId);
      setHomeSelectionId(id);
      setHomeKitId(`${next.team.abbr}-${next.year}-home`);
      setHomeLineupIds(ids);
      setHomeFeaturedPlayerId(suggestedFeaturedPlayerId(next.squad, ids));
    } else {
      const ids = pickBalancedSeven(next.squad, awayFormationId);
      setAwaySelectionId(id);
      setAwayKitId(`${next.team.abbr}-${next.year}-away`);
      setAwayLineupIds(ids);
      setAwayFeaturedPlayerId(suggestedFeaturedPlayerId(next.squad, ids));
    }
  }, [awayFormationId, eraTeams, homeFormationId]);

  const swapLineupPlayer = useCallback((
    side: 'home' | 'away',
    outgoingId: string,
    incomingId: string,
  ) => {
    const setLineup = side === 'home' ? setHomeLineupIds : setAwayLineupIds;
    setLineup((current) => current.map((id) => id === outgoingId ? incomingId : id));
    if (side === 'home') {
      setHomeFeaturedPlayerId((current) => current === outgoingId ? null : current);
    } else {
      setAwayFeaturedPlayerId((current) => current === outgoingId ? null : current);
    }
  }, []);

  const confirmSquad = useCallback(() => {
    const complete = activeSquadSide === 'home' ? homeLineupComplete : awayLineupComplete;
    if (!complete) return;
    if (mode === 'local' && activeSquadSide === 'home') {
      setActiveSquadSide('away');
      return;
    }
    if (mode === 'match') {
      const cpuFormation = chooseCpuFormation(
        awayOption.squad,
        homeFormationId,
        selectionSeed(`${homeOption.id}:${awayOption.id}:${gameKey}`),
      );
      setAwayFormationId(cpuFormation);
      const cpuIds = pickBalancedSeven(awayOption.squad, cpuFormation);
      setAwayLineupIds(cpuIds);
      setAwayFeaturedPlayerId(suggestedFeaturedPlayerId(awayOption.squad, cpuIds));
    }
    setPhase('playing');
  }, [
    activeSquadSide,
    awayLineupComplete,
    awayOption,
    gameKey,
    homeFormationId,
    homeLineupComplete,
    homeOption.id,
    mode,
  ]);

  const [hud, setHud] = useState<HudState>({
    homeScore: 0,
    awayScore: 0,
    clock: 0,
    message: '',
    possession: 'none',
    homePlayer: null,
    awayPlayer: null,
    charge: null,
    awayCharge: null,
  });

  // Boot the canvas game once the match phase begins.
  useEffect(() => {
    if (phase !== 'playing' || !canvasRef.current) return;
    let game: PitchKickGame;
    if (mode === 'practice') {
      // Free-form practice: a handful of home players + a lone away keeper.
      const pHome: TeamData = {
        ...home,
        players: home.players.slice(0, 5),
        kickoffFwd: 4,
      };
      const pAway: TeamData = {
        ...away,
        players: away.players.slice(0, 1),
        kickoffFwd: 0,
      };
      game = new PitchKickGame(canvasRef.current, setHud, pHome, pAway, {
        practice: true,
        bindings,
        controllerBindings,
        matchRealSeconds: VIFA_MODS.matchRealSeconds,
        enhancementCanvas: enhancementCanvasRef.current ?? undefined,
        seed: (selectionSeed(homeOption.id) ^ selectionSeed(awayOption.id) ^ gameKey) >>> 0,
      });
    } else {
      game = new PitchKickGame(canvasRef.current, setHud, home, away, {
        bindings,
        controllerBindings,
        localMultiplayer: mode === 'local',
        awayBindings: PLAYER_TWO_BINDINGS,
        awayControllerBindings: controllerBindings,
        matchRealSeconds: VIFA_MODS.matchRealSeconds,
        enhancementCanvas: enhancementCanvasRef.current ?? undefined,
        seed: (selectionSeed(homeOption.id) ^ selectionSeed(awayOption.id) ^ gameKey) >>> 0,
      });
    }
    gameRef.current = game;
    game.setTouchInput(touchHeldRef.current);
    game.setPaused(
      touchEnvironment.capable && !touchEnvironment.landscape,
    );
    game.start();
    return () => {
      touchHeldRef.current = 0;
      game.setTouchInput(0);
      game.stop();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, gameKey]);

  // FIFA-style keyboard navigation on the team-select screen.
  useEffect(() => {
    if (phase !== 'select' || settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement) return;
      const k = e.code;
      if (
        k === 'ArrowLeft' ||
        k === 'ArrowRight' ||
        k === 'Enter' ||
        k === 'KeyS' ||
        k === 'KeyD'
      ) {
        e.preventDefault();
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const dir = k === 'ArrowLeft' ? -1 : 1;
        cycleSelection(activeSide, dir);
      } else if (k === 'Enter' || k === 'KeyS' || k === 'KeyD') {
        confirmActiveSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, activeSide, settingsOpen, cycleSelection, confirmActiveSelection]);

  // Intro menu keyboard navigation (← → to choose, Enter to confirm).
  useEffect(() => {
    if (phase !== 'intro' || settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.code;
      if (
        k === 'ArrowLeft' ||
        k === 'ArrowRight' ||
        k === 'ArrowUp' ||
        k === 'ArrowDown' ||
        k === 'Enter'
      )
        e.preventDefault();
      if (k === 'ArrowLeft' || k === 'ArrowUp') {
        setIntroIdx((i) => Math.max(0, i - 1));
      } else if (k === 'ArrowRight' || k === 'ArrowDown') {
        setIntroIdx((i) => Math.min(2, i + 1));
      }
      else if (k === 'Enter')
        startMode(introIdx === 0 ? 'match' : introIdx === 1 ? 'local' : 'practice');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, introIdx, settingsOpen]);

  const startMode = (m: Mode) => {
    setMode(m);
    setPhase('select');
    setActiveSide('home');
    setActiveSquadSide('home');
  };

  const handleRestart = () => {
    touchHeldRef.current = 0;
    gameRef.current?.setTouchInput(0);
    setPhase('intro');
    setActiveSide('home');
    setActiveSquadSide('home');
  };
  const handleRematch = () => {
    // Re-mount the canvas game (the boot effect keys off gameKey) for a fresh
    // kickoff with the same teams.
    setGameKey((k) => k + 1);
  };

  const openSettings = () => {
    touchHeldRef.current = 0;
    gameRef.current?.setTouchInput(0);
    gameRef.current?.setPaused(true);
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    setSettingsOpen(false);
  };
  // Persist + push every binding change to the live engine immediately.
  const applyBindings = (next: KeyBindings) => {
    setBindings(next);
    saveBindings(next);
    gameRef.current?.setBindings(next);
  };
  const applyControllerBindings = (next: ControllerBindings) => {
    setControllerBindings(next);
    saveControllerBindings(next);
    gameRef.current?.setControllerBindings(next);
  };

  const setTouchMovement = useCallback((movementBits: number) => {
    const next =
      (touchHeldRef.current & ~TOUCH_MOVE_MASK) |
      (movementBits & TOUCH_MOVE_MASK);
    touchHeldRef.current = next;
    gameRef.current?.setTouchInput(next);
  }, []);

  const setTouchAction = useCallback((bit: number, down: boolean) => {
    const next = down
      ? touchHeldRef.current | bit
      : touchHeldRef.current & ~bit;
    touchHeldRef.current = next;
    gameRef.current?.setTouchInput(next);
  }, []);

  const touchLandscapePlaying =
    phase === 'playing' && touchEnvironment.capable && touchEnvironment.landscape;
  const touchPortraitPlaying =
    phase === 'playing' && touchEnvironment.capable && !touchEnvironment.landscape;

  useEffect(() => {
    if (touchLandscapePlaying) return;
    touchHeldRef.current = 0;
    gameRef.current?.setTouchInput(0);
  }, [touchLandscapePlaying]);

  useEffect(() => {
    gameRef.current?.setPaused(settingsOpen || touchPortraitPlaying);
  }, [gameKey, settingsOpen, touchPortraitPlaying]);

  return (
    <div className={`min-h-full flex flex-col bg-night-950 ${
      touchLandscapePlaying ? 'fixed inset-0 z-40 min-h-0 overflow-hidden' : ''
    }`}>
      {/* Brand bar — slim so the pitch gets the screen */}
      <header className={`w-full items-center justify-between px-4 py-2 animate-fade-in ${
        touchLandscapePlaying ? 'hidden' : 'flex'
      }`}>
        <div className="flex items-baseline gap-3">
          <span className="font-display text-2xl sm:text-3xl leading-none tracking-wide text-volt-500">
            VIFA <span className="text-white">LAB</span>
          </span>
          <span className="hidden md:inline font-heading uppercase text-[10px] tracking-[0.3em] text-night-300">
            Open Soccer prototype
          </span>
        </div>
        <div className="flex items-center gap-4">
          {phase === 'playing' && (
            <>
              <button
                onClick={handleRematch}
                className="flex items-center gap-2 font-heading uppercase text-xs tracking-wider text-night-300 hover:text-volt-400 transition-colors"
              >
                <RotateCcw size={15} />
                Rematch
              </button>
              <button
                onClick={handleRestart}
                className="flex items-center gap-2 font-heading uppercase text-xs tracking-wider text-night-300 hover:text-volt-400 transition-colors"
              >
                Menu
              </button>
            </>
          )}
          <button
            onClick={openSettings}
            aria-label="Settings"
            className="flex items-center gap-2 font-heading uppercase text-xs tracking-wider text-night-300 hover:text-volt-400 transition-colors"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Pitch — full-bleed width, height-capped so it stays on one screen */}
      <div
        className={`relative mx-auto overflow-hidden shadow-2xl animate-slide-up ${
          touchLandscapePlaying
            ? 'w-auto max-w-full border-0'
            : 'w-fit max-w-full border-y border-night-800'
        }`}
        style={touchLandscapePlaying ? {
          width: `min(100vw, calc(100dvh * ${CANVAS_W / CANVAS_H}))`,
          aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
        } : undefined}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`block ${
            touchLandscapePlaying
              ? 'h-full w-full max-w-none'
              : phase === 'playing'
              ? 'h-auto w-auto'
              : 'h-[620px] w-screen sm:h-auto sm:w-auto'
          }`}
          style={{
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            maxHeight: touchLandscapePlaying
              ? '100dvh'
              : 'calc(100vh - 168px)',
          }}
        />
        <canvas
          ref={enhancementCanvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 block h-full w-full"
        />

        {/* Practice badge replaces the scoreboard — no score/team display. */}
        {phase === 'playing' && mode === 'practice' && (
          <div className="absolute top-3 left-3 flex items-center h-9 px-3 rounded-md bg-volt-500 text-night-950 font-heading uppercase text-xs font-bold tracking-[0.25em] shadow-lg shadow-black/40 select-none animate-fade-in">
            Practice
          </div>
        )}

        {/* FIFA-style broadcast scoreboard. */}
        {phase === 'playing' && mode !== 'practice' && (
          <div className="absolute top-3 left-3 flex items-stretch h-9 rounded-md overflow-hidden shadow-lg shadow-black/40 font-heading select-none animate-fade-in text-sm">
            <span
              className="w-1.5 self-stretch"
              style={{ backgroundColor: home.color }}
            />
            <span className="flex items-center pl-2 pr-1.5 bg-night-950/95 text-white uppercase tracking-wider text-xs font-bold">
              {home.abbr}<small className="ml-1 text-[8px] text-volt-300">{String(homeOption.year).slice(2)}</small>
            </span>
            <span className="flex items-center px-2.5 bg-night-950/95 text-white text-base tabular-nums font-display">
              {hud.homeScore}
            </span>
            <span className="flex items-center bg-night-950/95 text-night-300 text-xs">
              –
            </span>
            <span className="flex items-center px-2.5 bg-night-950/95 text-white text-base tabular-nums font-display">
              {hud.awayScore}
            </span>
            <span className="flex items-center pl-1.5 pr-2 bg-night-950/95 text-white uppercase tracking-wider text-xs font-bold">
              {away.abbr}<small className="ml-1 text-[8px] text-volt-300">{String(awayOption.year).slice(2)}</small>
            </span>
            <span
              className="w-1.5 self-stretch"
              style={{ backgroundColor: away.color }}
            />
            <span className="flex items-center px-2.5 bg-volt-500 text-night-950 text-sm tabular-nums font-bold tracking-tight">
              {fmtTime(hud.clock)}
            </span>
          </div>
        )}

        {/* Broadcast lower-thirds. */}
        {phase === 'playing' && hud.homePlayer && (
          <PlayerNameTag
            side="left"
            color={home.color}
            textColor={home.textColor}
            num={hud.homePlayer.num}
            name={hud.homePlayer.name}
            charge={hud.charge}
          />
        )}
        {phase === 'playing' && hud.awayPlayer && (
          <PlayerNameTag
            side="right"
            color={away.color}
            textColor={away.textColor}
            num={hud.awayPlayer.num}
            name={hud.awayPlayer.name}
            charge={mode === 'local' ? hud.awayCharge : null}
          />
        )}

        {/* Centre message (GOAL etc.) */}
        {phase === 'playing' && hud.message && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              key={hud.message + hud.homeScore + hud.awayScore}
              className="font-display text-7xl sm:text-8xl text-volt-500 drop-shadow-[0_4px_0_rgba(0,0,0,0.6)] animate-pop tracking-wider text-center px-6"
            >
              {hud.message}
            </span>
          </div>
        )}

        {/* Intro / mode-select overlay */}
        {phase === 'intro' && (
          <div className="absolute inset-0 overflow-hidden bg-[#edf1ee] text-[#20282d] animate-fade-in">
            <div className="pointer-events-none absolute inset-0 opacity-70 [background:repeating-linear-gradient(165deg,transparent_0,transparent_16px,rgba(77,95,106,0.08)_17px,transparent_19px)]" />
            <div className="pointer-events-none absolute -left-20 top-[38%] h-52 w-[70%] -rotate-6 rounded-[50%] border-[18px] border-[#91d83e]/45" />
            <div className="pointer-events-none absolute -left-28 top-[43%] h-48 w-[75%] -rotate-6 rounded-[50%] border-[5px] border-[#15a9b4]/45" />
            <div className="pointer-events-none absolute -right-20 top-5 h-20 w-[65%] -skew-x-[28deg] bg-gradient-to-r from-transparent via-white/80 to-[#cad3d7]/60" />
            <div className="pointer-events-none absolute inset-x-0 bottom-14 h-2 bg-gradient-to-r from-[#16a6b3] via-[#93d43d] to-[#ca5d65]" />

            <div className="relative z-10 flex h-full flex-col px-5 pb-16 pt-5 sm:px-10 sm:pb-20 sm:pt-7">
              <div className="flex min-h-0 flex-1 items-center justify-center gap-5 sm:gap-10">
                <div className="relative hidden h-48 w-48 shrink-0 items-center justify-center sm:flex lg:h-60 lg:w-60">
                  <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_45deg,#87949b,#f8faf9,#36434a,#dfe6e3,#718088,#f8faf9)] shadow-[0_18px_30px_rgba(38,52,58,0.35)]" />
                  <div className="absolute inset-[12px] rounded-full bg-[#1d272c] ring-4 ring-[#b3d26a]" />
                  <div className="absolute inset-[28px] rounded-full bg-[radial-gradient(circle_at_35%_28%,#ffffff,#cbd3d2_55%,#7e8a8e)] shadow-inner" />
                  <span className="relative -rotate-6 text-7xl drop-shadow-[0_5px_2px_rgba(0,0,0,0.3)] lg:text-8xl" aria-hidden="true">
                    ⚽
                  </span>
                  <div className="absolute -left-14 top-3 h-2 w-24 -rotate-[28deg] bg-[#5c6b73]/60" />
                  <div className="absolute -right-20 top-12 h-1.5 w-28 -rotate-[12deg] bg-[#5c6b73]/45" />
                </div>

                <div className="flex w-full max-w-xl flex-col justify-center">
                  <div className="mb-4 flex items-end gap-3 border-b-2 border-[#aab5b9] pb-3 sm:mb-6">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#1f2b31] shadow-lg ring-4 ring-[#a7cb57] sm:hidden">
                      <span className="text-4xl" aria-hidden="true">⚽</span>
                    </div>
                    <div>
                      <span className="font-heading text-[10px] uppercase tracking-[0.4em] text-[#567078] sm:text-xs">
                        Open Soccer · 7-a-side
                      </span>
                      <h2 className="-skew-x-6 font-display text-5xl italic leading-[0.82] tracking-[-0.04em] text-[#2d383d] sm:text-7xl lg:text-8xl">
                        VIFA
                      </h2>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
              <ModeCard
                number="01"
                title="PLAY MATCH"
                blurb="Build your seven, choose a formation, and face the CPU."
                active={introIdx === 0}
                onHover={() => setIntroIdx(0)}
                onClick={() => startMode('match')}
              />
              <ModeCard
                number="02"
                title="LOCAL 2P"
                blurb="Two friends, two squads—controllers or one shared keyboard."
                active={introIdx === 1}
                onHover={() => setIntroIdx(1)}
                onClick={() => startMode('local')}
              />
              <ModeCard
                number="03"
                title="PRACTICE"
                blurb="No clock and no pressure. Learn movement, passing, and shooting."
                active={introIdx === 2}
                onHover={() => setIntroIdx(2)}
                onClick={() => startMode('practice')}
              />
                  </div>

                  <button
                    type="button"
                    onClick={openSettings}
                    className="mt-3 flex w-full items-center gap-3 border border-[#63841e] bg-[#263238] px-4 py-3 text-left shadow-[0_4px_10px_rgba(36,50,55,0.25)] transition-colors hover:bg-[#344249] sm:mt-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#9ed43d] text-[#202b30]">
                      <Gamepad2 size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block font-heading text-xs uppercase tracking-[0.15em] text-white sm:text-sm">
                        Using a controller? Start here
                      </b>
                      <span className="mt-0.5 block font-body text-[11px] leading-snug text-[#d9e1e1] sm:text-xs">
                        Click this box inside VIFA—not your computer settings—to test buttons and choose controls.
                      </span>
                    </span>
                    <span className="font-display text-xl text-[#a9dc49]" aria-hidden="true">▶</span>
                  </button>

                  <div className="mt-2 flex items-center gap-2 border border-[#8fa0a4] bg-white/75 px-3 py-2 text-[#344248]">
                    <Smartphone size={19} className="shrink-0 text-[#168f99]" />
                    <p className="font-body text-[11px] leading-snug sm:text-xs">
                      <b className="font-heading uppercase tracking-wider">Playing on iPhone?</b>{' '}
                      Choose a mode normally. At kickoff, turn the phone sideways and touch controls appear automatically.
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-between border-t border-[#aab5b9] bg-white/90 px-4 text-[#445158] shadow-[0_-4px_15px_rgba(50,70,75,0.12)] sm:h-16 sm:px-9">
                <div className="flex items-center gap-4 font-heading text-[10px] uppercase tracking-wider sm:text-xs">
                  <span className="flex items-center gap-1.5">
                    <b className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#87b63a] text-[#62891e]">↕</b>
                    Choose
                  </span>
                  <span className="flex items-center gap-1.5">
                    <b className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#16a6b3] px-1 text-[#167881]">A</b>
                    Enter / click to select
                  </span>
                </div>
                <button
                  type="button"
                  onClick={openSettings}
                  className="flex items-center gap-2 rounded border border-[#819496] bg-[#edf2ef] px-2 py-1 font-heading text-[9px] uppercase tracking-wider text-[#344248] hover:border-[#668c20] hover:text-[#668c20] sm:px-3 sm:text-xs"
                >
                  <Settings size={16} /> Controller setup &amp; help
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Team-select overlay */}
        {phase === 'select' && (
          <div className="absolute inset-0 flex flex-col items-center justify-start overflow-y-auto bg-[#edf1ee] px-4 py-4 text-[#273237] animate-fade-in sm:justify-center [background-image:radial-gradient(circle_at_10%_70%,rgba(145,216,62,0.22),transparent_30%),radial-gradient(circle_at_90%_20%,rgba(21,169,180,0.14),transparent_28%),repeating-linear-gradient(165deg,transparent_0,transparent_16px,rgba(77,95,106,0.07)_17px,transparent_19px)]">
            <div className="mb-2 border border-[#789c2a] bg-[#e3f1b5] px-3 py-1 font-heading text-[10px] uppercase tracking-[0.22em] text-[#4f6818] sm:text-xs">
              Step 1 of 2 · Teams &amp; jerseys
            </div>
            <div className="mb-2 h-1 w-40 bg-gradient-to-r from-[#16a6b3] via-[#91d83e] to-transparent" />
            <h2 className="mb-2 -skew-x-6 font-display text-3xl italic tracking-wide text-[#273237] sm:text-6xl">
              SELECT <span className="text-[#759d23]">TEAMS + KITS</span>
            </h2>
            <p className="mb-4 text-center font-body text-sm text-[#5c6c73] sm:text-lg">
              <span className="font-semibold text-[#6f9623]">← →</span> to choose
              ·{' '}
              <span className="font-semibold text-[#6f9623]">Enter / S / D</span>{' '}
              to confirm
            </p>
            <div className="mb-4 border border-[#7f969b] bg-white/75 px-4 py-1.5 font-heading text-[10px] uppercase tracking-[0.24em] text-[#4f656d] shadow-sm sm:text-xs">
              Squad era and World Cup jersey era are independent
            </div>
            <div className="grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1 sm:gap-10">
              <TeamCrest
                team={home}
                selectionId={homeOption.id}
                year={homeOption.year}
                years={availableYears}
                yearOptions={optionsForYear(homeOption.year)}
                kitOptions={homeKitOptions}
                kitId={homeKitOption.id}
                tag="YOU"
                active={activeSide === 'home'}
                locked={activeSide === 'away'}
                onYearChange={(year) => setSelectionYear('home', year)}
                onTeamChange={(id) => setTeamSelection('home', id)}
                onKitChange={setHomeKitId}
                onPrevious={() => cycleSelection('home', -1)}
                onNext={() => cycleSelection('home', 1)}
              />
              <div className="flex items-center font-display text-2xl text-[#829096] sm:text-5xl">
                VS
              </div>
              <TeamCrest
                team={away}
                selectionId={awayOption.id}
                year={awayOption.year}
                years={availableYears}
                yearOptions={optionsForYear(awayOption.year)}
                kitOptions={awayKitOptions}
                kitId={awayKitOption.id}
                tag={mode === 'local' ? 'PLAYER 2' : 'CPU'}
                active={activeSide === 'away'}
                locked={false}
                onYearChange={(year) => setSelectionYear('away', year)}
                onTeamChange={(id) => setTeamSelection('away', id)}
                onKitChange={setAwayKitId}
                onPrevious={() => cycleSelection('away', -1)}
                onNext={() => cycleSelection('away', 1)}
              />
            </div>
            <button
              type="button"
              onClick={confirmActiveSelection}
              className="mt-4 border border-[#5d781d] bg-gradient-to-r from-[#90b936] to-[#b8df62] px-6 py-2 font-heading text-sm uppercase tracking-[0.2em] text-[#26310d] shadow-[0_4px_10px_rgba(62,83,34,0.25)] transition-colors hover:brightness-105"
            >
              {activeSide === 'home'
                ? `Lock ${home.name} · Choose opponent`
                : mode === 'practice'
                  ? 'Continue · Pick practice players'
                  : 'Continue · Pick Starting VII'}
            </button>
          </div>
        )}

        {phase === 'squad' && (
          <SquadBuilder
            option={activeSquadSide === 'home' ? homeOption : awayOption}
            selectedIds={activeSquadSide === 'home' ? homeLineupIds : awayLineupIds}
            formationId={activeSquadSide === 'home' ? homeFormationId : awayFormationId}
            featuredPlayerId={activeSquadSide === 'home' ? homeFeaturedPlayerId : awayFeaturedPlayerId}
            featuredAccent={FEATURED_ACCENTS[
              activeSquadSide === 'home' ? homeFeaturedAccentIndex : awayFeaturedAccentIndex
            ]}
            featuredMarker={FEATURED_MARKERS[
              activeSquadSide === 'home' ? homeFeaturedMarkerIndex : awayFeaturedMarkerIndex
            ]}
            sideLabel={activeSquadSide === 'home'
              ? 'Player 1'
              : mode === 'local' ? 'Player 2' : 'CPU'}
            complete={activeSquadSide === 'home' ? homeLineupComplete : awayLineupComplete}
            onSwap={(outgoingId, incomingId) => {
              swapLineupPlayer(activeSquadSide, outgoingId, incomingId);
            }}
            onFormationChange={(formationId) => {
              if (activeSquadSide === 'home') setHomeFormationId(formationId);
              else setAwayFormationId(formationId);
            }}
            onAutoPick={() => {
              const formationId = activeSquadSide === 'home'
                ? homeFormationId
                : awayFormationId;
              const ids = pickBalancedSeven(
                activeSquadSide === 'home' ? homeOption.squad : awayOption.squad,
                formationId,
              );
              if (activeSquadSide === 'home') {
                setHomeLineupIds(ids);
                setHomeFeaturedPlayerId(suggestedFeaturedPlayerId(homeOption.squad, ids));
              } else {
                setAwayLineupIds(ids);
                setAwayFeaturedPlayerId(suggestedFeaturedPlayerId(awayOption.squad, ids));
              }
            }}
            onReset={() => {
              const squad = activeSquadSide === 'home' ? homeOption.squad : awayOption.squad;
              const ids = pickBalancedSeven(squad, '2-2-2');
              if (activeSquadSide === 'home') {
                setHomeFormationId('2-2-2');
                setHomeLineupIds(ids);
                setHomeFeaturedPlayerId(suggestedFeaturedPlayerId(squad, ids));
              } else {
                setAwayFormationId('2-2-2');
                setAwayLineupIds(ids);
                setAwayFeaturedPlayerId(suggestedFeaturedPlayerId(squad, ids));
              }
            }}
            onFeaturedPlayerChange={(playerId) => {
              if (activeSquadSide === 'home') setHomeFeaturedPlayerId(playerId);
              else setAwayFeaturedPlayerId(playerId);
            }}
            onCycleFeaturedAccent={() => {
              if (activeSquadSide === 'home') {
                setHomeFeaturedAccentIndex((index) => (index + 1) % FEATURED_ACCENTS.length);
              } else {
                setAwayFeaturedAccentIndex((index) => (index + 1) % FEATURED_ACCENTS.length);
              }
            }}
            onCycleFeaturedMarker={() => {
              if (activeSquadSide === 'home') {
                setHomeFeaturedMarkerIndex((index) => (index + 1) % FEATURED_MARKERS.length);
              } else {
                setAwayFeaturedMarkerIndex((index) => (index + 1) % FEATURED_MARKERS.length);
              }
            }}
            onConfirm={confirmSquad}
            confirmLabel={mode === 'local' && activeSquadSide === 'home'
              ? 'Lock squad · Player 2 next'
              : 'Lock squad · Kick off'}
          />
        )}

        {touchLandscapePlaying && !settingsOpen && (
          <TouchControls
            onMovement={setTouchMovement}
            onAction={setTouchAction}
            onMenu={handleRestart}
            onSettings={openSettings}
          />
        )}
      </div>

      {touchPortraitPlaying && !settingsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-night-950/95 px-8 text-center backdrop-blur-sm">
          <Smartphone size={52} className="mb-4 rotate-90 text-volt-400" />
          <h2 className="font-display text-3xl uppercase tracking-wide text-white">
            Turn your phone sideways
          </h2>
          <p className="mt-3 max-w-sm font-body text-sm leading-relaxed text-night-200">
            The match is paused—no time or action will pass. VIFA&apos;s joystick and action buttons appear automatically in landscape mode. Keep this webpage open and rotate your phone now. If the screen will not rotate, turn off Orientation Lock in iPhone Control Center.
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="mt-6 rounded-lg border border-night-600 px-5 py-2 font-heading text-xs uppercase tracking-wider text-night-200"
          >
            Return to menu
          </button>
        </div>
      )}

      {/* Controls legend */}
      <div className={`${touchLandscapePlaying ? 'hidden' : 'grid'} w-full px-4 mt-2 grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 animate-fade-in`}>
        {controlsLegend(bindings).map((c) => (
          <div
            key={c.label}
            className="flex flex-col items-center gap-0.5 bg-night-900 border border-night-800 rounded-lg py-1.5 px-2"
          >
            <kbd className="font-heading text-volt-400 text-sm tracking-wider">
              {c.keys}
            </kbd>
            <span className="font-body text-[10px] text-night-300 uppercase tracking-wide">
              {c.label}
            </span>
          </div>
        ))}
      </div>

      {mode === 'local' && phase === 'playing' && !touchLandscapePlaying && (
        <div className="mx-4 mt-2 grid grid-cols-2 gap-2 rounded-xl border border-orange-400/25 bg-orange-400/10 p-3 text-center font-heading text-sm text-orange-100 sm:grid-cols-8">
          <span><b>I J K L</b> Move</span>
          <span><b>Right Shift</b> Sprint</span>
          <span><b>O</b> Shoot / Tackle</span>
          <span><b>U</b> Short pass</span>
          <span><b>P</b> Long / Slide</span>
          <span><b>Y</b> Through / Rush GK</span>
          <span><b>;</b> Contain</span>
          <span><b>H</b> Switch</span>
        </div>
      )}

      <p className={`${touchLandscapePlaying ? 'hidden' : 'block'} mt-2 mb-3 px-4 text-xs text-night-300 font-body text-center max-w-3xl mx-auto`}>
        Tip: hold a pass/shot key to charge the power gauge, release to kick —
        a quick tap plays it soft. Defending: tap{' '}
        <span className="text-volt-400">{codeLabel(bindings.shot)}</span> for a
        standing tackle, hold{' '}
        <span className="text-volt-400">{codeLabel(bindings.contain)}</span> to
        contain and auto-poke, or just stay touch-tight — sustained contact
        wins the ball. Press{' '}
        <span className="text-volt-400">{codeLabel(bindings.switchPlayer)}</span>{' '}
        to jump to the hinted ▽ player.
      </p>

      <p className={`${touchLandscapePlaying ? 'hidden' : 'block'} mb-4 px-4 text-center text-xs text-night-400 font-body`}>
        Current build: CPU, practice, mobile touch controls, controller support,
        and local two-player play. Source
        adapted from{' '}
        <a
          href="https://github.com/modelence/open-soccer"
          target="_blank"
          rel="noreferrer"
          className="text-volt-400 underline underline-offset-4 hover:text-volt-300"
        >
          modelence/open-soccer
        </a>
        . Online head-to-head is the next architecture phase.
      </p>

      {settingsOpen && (
        <SettingsModal
          bindings={bindings}
          onChange={applyBindings}
          onReset={() => applyBindings({ ...DEFAULT_BINDINGS })}
          controllerBindings={controllerBindings}
          onControllerChange={applyControllerBindings}
          onControllerReset={() =>
            applyControllerBindings({ ...DEFAULT_CONTROLLER_BINDINGS })
          }
          onClose={closeSettings}
        />
      )}
    </div>
  );
}

function TouchControls({
  onMovement,
  onAction,
  onMenu,
  onSettings,
}: {
  onMovement: (bits: number) => void;
  onAction: (bit: number, down: boolean) => void;
  onMenu: () => void;
  onSettings: () => void;
}) {
  const stickPointer = useRef<number | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });

  useEffect(() => () => onMovement(0), [onMovement]);

  const updateStick = (element: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const radius = rect.width / 2;
    const rawX = (clientX - (rect.left + radius)) / radius;
    const rawY = (clientY - (rect.top + radius)) / radius;
    const magnitude = Math.hypot(rawX, rawY);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    setStick({ x, y });
    onMovement(touchDirectionBits(x, y));
  };

  const releaseStick = (pointerId: number) => {
    if (stickPointer.current !== pointerId) return;
    stickPointer.current = null;
    setStick({ x: 0, y: 0 });
    onMovement(0);
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] select-none overflow-hidden touch-none"
      aria-label="Mobile match controls"
    >
      <div className="pointer-events-auto absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-white/20 bg-night-950/75 px-3 py-1 font-heading text-[9px] uppercase tracking-[0.16em] text-white shadow-lg backdrop-blur-sm">
        Left thumb moves · Right thumb plays
      </div>

      <div
        className="pointer-events-auto absolute left-2 top-2 flex gap-1"
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
      >
        <button
          type="button"
          onClick={onMenu}
          className="rounded-md border border-white/20 bg-night-950/75 px-3 py-2 font-heading text-[9px] uppercase tracking-wider text-white backdrop-blur-sm"
        >
          Menu
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="flex items-center rounded-md border border-white/20 bg-night-950/75 px-2.5 py-2 text-white backdrop-blur-sm"
          aria-label="Open controls and help"
        >
          <Settings size={14} />
        </button>
      </div>

      <div
        className="absolute bottom-3 left-3"
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
      >
        <div
          role="application"
          aria-label="Movement joystick"
          className="pointer-events-auto relative h-[116px] w-[116px] touch-none rounded-full border-2 border-white/30 bg-night-950/45 shadow-[0_4px_18px_rgba(0,0,0,0.45)] backdrop-blur-[2px]"
          onPointerDown={(event) => {
            event.preventDefault();
            stickPointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateStick(event.currentTarget, event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (stickPointer.current !== event.pointerId) return;
            event.preventDefault();
            updateStick(event.currentTarget, event.clientX, event.clientY);
          }}
          onPointerUp={(event) => releaseStick(event.pointerId)}
          onPointerCancel={(event) => releaseStick(event.pointerId)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="pointer-events-none absolute inset-4 rounded-full border border-white/15" />
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/25 shadow-lg"
            style={{
              marginLeft: stick.x * 30,
              marginTop: stick.y * 30,
            }}
          >
            <span className="text-lg text-white/80">●</span>
          </span>
        </div>
        <div className="mt-1 text-center font-heading text-[9px] uppercase tracking-[0.18em] text-white/85">
          Move
        </div>
      </div>

      <div
        className="absolute bottom-2 right-2 flex items-end gap-2"
        style={{ paddingRight: 'env(safe-area-inset-right)' }}
      >
        <div className="flex flex-col gap-2 pb-1">
          <TouchActionButton label="Switch" bit={INPUT_BITS.switchPlayer} onAction={onAction} compact />
          <TouchActionButton label="Sprint" bit={INPUT_BITS.sprint} onAction={onAction} compact accent="lime" />
          <TouchActionButton label="Contain" bit={INPUT_BITS.contain} onAction={onAction} compact />
        </div>
        <div className="relative h-[148px] w-[174px]">
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            <TouchActionButton label="Through / GK" bit={INPUT_BITS.throughPass} onAction={onAction} />
          </div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <TouchActionButton label="Long / Slide" bit={INPUT_BITS.longPass} onAction={onAction} />
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <TouchActionButton label="Shoot / Tackle" bit={INPUT_BITS.shot} onAction={onAction} accent="orange" />
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            <TouchActionButton label="Pass" bit={INPUT_BITS.shortPass} onAction={onAction} accent="lime" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TouchActionButton({
  label,
  bit,
  onAction,
  compact = false,
  accent = 'plain',
}: {
  label: string;
  bit: number;
  onAction: (bit: number, down: boolean) => void;
  compact?: boolean;
  accent?: 'plain' | 'lime' | 'orange';
}) {
  const pointer = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => () => onAction(bit, false), [bit, onAction]);

  const release = (pointerId: number) => {
    if (pointer.current !== pointerId) return;
    pointer.current = null;
    setActive(false);
    onAction(bit, false);
  };

  const color = accent === 'lime'
    ? 'border-volt-300/70 bg-volt-500/65 text-night-950'
    : accent === 'orange'
      ? 'border-orange-200/70 bg-orange-500/70 text-white'
      : 'border-white/35 bg-night-950/65 text-white';

  return (
    <button
      type="button"
      className={`pointer-events-auto flex touch-none items-center justify-center border font-heading uppercase leading-tight shadow-[0_4px_14px_rgba(0,0,0,0.4)] backdrop-blur-[2px] ${
        compact
          ? 'h-9 min-w-[72px] rounded-full px-3 text-[9px] tracking-wider'
          : 'h-[58px] w-[58px] rounded-full px-1 text-[8px] tracking-wide'
      } ${color} ${active ? 'scale-90 brightness-125' : 'opacity-90'}`}
      onPointerDown={(event) => {
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setActive(true);
        onAction(bit, true);
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={label}
    >
      {label}
    </button>
  );
}

const ROLE_LABELS: Record<SevenRole, string> = {
  GK: 'Keeper',
  DF: 'Defense',
  MF: 'Midfield',
  ST: 'Attack',
};

function SelectionCount({
  label,
  count,
  limit,
}: {
  label: string;
  count: number;
  limit: number;
}) {
  const ready = count === limit;
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-heading text-[10px] uppercase tracking-wider sm:text-xs ${
        ready
          ? 'border-[#789c2a] bg-[#dff0ad] text-[#405a13]'
          : 'border-[#b36b4b] bg-[#f7e3d5] text-[#83442b]'
      }`}
    >
      {label} {count}/{limit}
    </span>
  );
}

function SquadBuilder({
  option,
  selectedIds,
  formationId,
  featuredPlayerId,
  featuredAccent,
  featuredMarker,
  sideLabel,
  complete,
  onSwap,
  onFormationChange,
  onAutoPick,
  onReset,
  onFeaturedPlayerChange,
  onCycleFeaturedAccent,
  onCycleFeaturedMarker,
  onConfirm,
  confirmLabel,
}: {
  option: VifaEraTeamOption;
  selectedIds: string[];
  formationId: SevenFormationId;
  featuredPlayerId: string | null;
  featuredAccent: (typeof FEATURED_ACCENTS)[number];
  featuredMarker: (typeof FEATURED_MARKERS)[number];
  sideLabel: string;
  complete: boolean;
  onSwap: (outgoingId: string, incomingId: string) => void;
  onFormationChange: (formationId: SevenFormationId) => void;
  onAutoPick: () => void;
  onReset: () => void;
  onFeaturedPlayerChange: (playerId: string) => void;
  onCycleFeaturedAccent: () => void;
  onCycleFeaturedMarker: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  const [swapPlayerId, setSwapPlayerId] = useState<string | null>(null);
  const selected = new Set(selectedIds);
  const selectedPlayers = option.squad.filter((player) => selected.has(player.id));
  const goalkeeperCount = selectedPlayers.filter((player) => player.role === 'GK').length;
  const outfieldCount = selectedPlayers.length - goalkeeperCount;
  const assignments = assignPlayersToFormation(option.squad, selectedIds, formationId);
  const formation = getSevenFormation(formationId);
  const featuredPlayer = option.squad.find((player) => player.id === featuredPlayerId) ?? null;
  const swapPlayer = option.squad.find((player) => player.id === swapPlayerId) ?? null;
  const swapAssignment = assignments.find(({ player }) => player.id === swapPlayerId) ?? null;
  const benchPlayers = option.squad
    .filter((player) => !selected.has(player.id))
    .sort((a, b) => (
      SEVEN_ROLE_ORDER.indexOf(a.role) - SEVEN_ROLE_ORDER.indexOf(b.role)
      || b.overallRating - a.overallRating
      || a.name.localeCompare(b.name)
    ));
  const teamFit = assignments.length === 7
    ? Math.round(assignments.reduce((total, assignment) => total + assignment.fitRating, 0) / 7)
    : null;

  const canSwapWith = (player: SelectableSquadPlayer) => (
    swapPlayer
      ? (swapPlayer.role === 'GK') === (player.role === 'GK')
      : false
  );

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#edf1ee] text-[#273237] animate-fade-in [background-image:radial-gradient(circle_at_5%_30%,rgba(145,216,62,0.18),transparent_26%),radial-gradient(circle_at_95%_15%,rgba(21,169,180,0.12),transparent_24%),repeating-linear-gradient(165deg,transparent_0,transparent_17px,rgba(77,95,106,0.055)_18px,transparent_20px)]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <div className="sticky top-0 z-20 -mx-3 -mt-3 mb-3 border-b border-[#aab5b9] bg-white/90 px-3 py-3 shadow-[0_4px_12px_rgba(60,75,80,0.12)] backdrop-blur sm:-mx-6 sm:-mt-5 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="font-heading text-[10px] uppercase tracking-[0.28em] text-[#657980] sm:text-xs">
                Step 2 of 2 · {sideLabel} · {option.year} World Cup
              </span>
              <h2 className="-skew-x-6 truncate font-display text-3xl italic tracking-wide text-[#273237] sm:text-5xl">
                BUILD <span className="text-[#759d23]">{option.team.abbr} VII</span>
              </h2>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => { onAutoPick(); setSwapPlayerId(null); }}
                className="border border-[#789c2a] bg-gradient-to-r from-[#dcec9c] to-white px-2.5 py-2 font-heading text-[9px] uppercase tracking-wider text-[#4f6818] shadow-sm transition-colors hover:brightness-105 sm:px-3 sm:text-xs"
              >
                Best VII
              </button>
              <button
                type="button"
                onClick={() => { onReset(); setSwapPlayerId(null); }}
                className="border border-[#8d9ca1] bg-white px-2.5 py-2 font-heading text-[9px] uppercase tracking-wider text-[#536269] shadow-sm transition-colors hover:border-[#789c2a] hover:text-[#5f8120] sm:px-3 sm:text-xs"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SelectionCount label="Keeper" count={goalkeeperCount} limit={1} />
            <SelectionCount label="Outfield" count={outfieldCount} limit={6} />
            {teamFit !== null ? (
              <span className="rounded-full border border-[#168f99] bg-[#d8f0f1] px-2.5 py-1 font-heading text-[10px] uppercase tracking-wider text-[#146d74] sm:text-xs">
                VII fit {teamFit}
              </span>
            ) : null}
          </div>
        </div>

        <p className="mb-3 border-l-4 border-[#8bb33a] bg-white/80 px-3 py-2 font-body text-sm text-[#45565d] shadow-sm sm:text-base">
          <b className="font-heading uppercase tracking-wide text-[#58781c]">Build your Starting VII:</b>{' '}
          tap a starter on the pitch, then tap a compatible bench player to swap them in. Goalkeepers swap with goalkeepers only.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Formation">
          {SEVEN_A_SIDE_FORMATIONS.map((formation) => {
            const active = formation.id === formationId;
            return (
              <button
                key={formation.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFormationChange(formation.id)}
                className={`border p-2.5 text-left shadow-sm transition-colors ${
                  active
                    ? 'border-[#789c2a] bg-gradient-to-r from-[#dcec9c] to-white'
                    : 'border-[#aab5b9] bg-white/80 hover:border-[#789c2a]'
                }`}
              >
                <span className={`block font-display text-2xl ${active ? 'text-[#668b20]' : 'text-[#3c484d]'}`}>
                  {formation.id}
                </span>
                <span className="block font-heading text-xs uppercase tracking-wider text-[#273237]">
                  {formation.name}
                </span>
                <span className="mt-1 block font-body text-[11px] leading-snug text-[#718087]">
                  {formation.identity}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 border border-[#9eaaae] bg-[#dbe2e2]/85 px-3 py-2 font-body text-sm text-[#53636a]">
          <span className="font-heading uppercase tracking-wider text-[#63871e]">
            {SEVEN_A_SIDE_FORMATIONS.find((formation) => formation.id === formationId)?.name} risk:{' '}
          </span>
          {SEVEN_A_SIDE_FORMATIONS.find((formation) => formation.id === formationId)?.tradeoff}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <section aria-labelledby="starting-vii-heading">
            <div className="mb-2 flex items-end justify-between">
              <div>
                <span className="font-heading text-[10px] uppercase tracking-[0.22em] text-[#687a81]">On the pitch</span>
                <h3 id="starting-vii-heading" className="font-display text-3xl tracking-wide text-[#273237]">Starting VII</h3>
              </div>
              <span className="font-heading text-xs uppercase tracking-wider text-[#63871e]">{formation.id} · Fit {teamFit ?? '—'}</span>
            </div>

            <div className="relative mx-auto aspect-[5/7] w-full max-w-[560px] overflow-hidden border-4 border-white bg-[#438744] shadow-[0_12px_25px_rgba(38,70,45,0.28)] [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0,rgba(255,255,255,0.025)_12.5%,rgba(0,0,0,0.035)_12.5%,rgba(0,0,0,0.035)_25%)]">
              <div className="pointer-events-none absolute inset-3 border-2 border-white/65" />
              <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px bg-white/65" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/65" />
              <div className="pointer-events-none absolute left-1/2 top-3 h-[18%] w-[52%] -translate-x-1/2 border-2 border-t-0 border-white/65" />
              <div className="pointer-events-none absolute bottom-3 left-1/2 h-[18%] w-[52%] -translate-x-1/2 border-2 border-b-0 border-white/65" />

              {assignments.map((assignment) => {
                const position = formation.positions[assignment.slotIndex];
                const left = Math.min(88, Math.max(12, position.y * 100));
                const top = Math.min(88, Math.max(12, 92 - position.x * 135));
                const active = swapPlayerId === assignment.player.id;
                const isFeatured = featuredPlayerId === assignment.player.id;
                return (
                  <button
                    key={assignment.player.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${assignment.player.name}, ${ROLE_LABELS[assignment.targetRole]}, fit ${assignment.fitRating}. ${active ? 'Selected for swap' : 'Select to swap'}`}
                    onClick={() => setSwapPlayerId(active ? null : assignment.player.id)}
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      ...(isFeatured
                        ? {
                            borderColor: featuredAccent.value,
                            boxShadow: `0 0 0 3px ${featuredAccent.value}80, 0 3px 8px rgba(0,0,0,0.35)`,
                          }
                        : {}),
                    }}
                    className={`absolute z-10 w-[82px] -translate-x-1/2 -translate-y-1/2 border px-1.5 py-1 text-center shadow-[0_3px_8px_rgba(0,0,0,0.35)] transition-all sm:w-[104px] sm:px-2 sm:py-1.5 ${
                      active
                        ? 'scale-110 border-[#273237] bg-[#dff0ad] ring-4 ring-[#dff0ad]/55'
                        : 'border-white/85 bg-white/95 hover:scale-105 hover:border-[#dff0ad]'
                    }`}
                  >
                    <span className="block truncate font-heading text-[9px] uppercase tracking-wide text-[#273237] sm:text-xs">
                      {isFeatured ? <span className="mr-1" style={{ color: featuredAccent.value }}>★</span> : null}
                      <span className="mr-1 text-[#718087]">#{assignment.player.num}</span>{assignment.player.name}
                    </span>
                    <span className="mt-0.5 flex items-center justify-center gap-1 font-heading text-[8px] uppercase text-[#5c6c73] sm:text-[10px]">
                      {ROLE_LABELS[assignment.targetRole]} · <b className="text-[#63871e]">{assignment.fitRating}</b>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="bench-heading" className="min-w-0">
            <div className={`mb-3 border px-3 py-2 ${swapPlayer ? 'border-[#789c2a] bg-[#e3f1b5]' : 'border-[#9eaaae] bg-white/80'}`}>
              <span className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#63747b]">Swap status</span>
              <p className="mt-0.5 font-body text-sm text-[#34444a]">
                {swapPlayer
                  ? <><b>{swapPlayer.name}</b> selected. Choose a highlighted bench player to replace them.</>
                  : 'Tap a player in your Starting VII to begin a swap.'}
              </p>
              {swapAssignment ? (
                <div className="mt-2 border-t border-[#789c2a]/35 pt-2">
                  <div className="grid grid-cols-6 gap-1">
                    {(['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as const).map((label, index) => (
                      <span key={label} className="text-center">
                        <span className="block font-heading text-[8px] text-[#718087]">{label}</span>
                        <span className="block font-heading text-xs text-[#273237]">{swapAssignment.player.ratings[index]}</span>
                      </span>
                    ))}
                  </div>
                  {swapPlayer?.appearance ? (
                    <p className="mt-2 font-body text-[11px] text-[#617178]">
                      Era look: {swapPlayer.appearance.hairStyle?.replace('-', ' ')} hair
                      {swapPlayer.appearance.headbandColor ? ' · headband' : ''}
                      {swapPlayer.appearance.faceMaskColor ? ' · protective mask' : ''}
                      {swapPlayer.appearance.facialHair && swapPlayer.appearance.facialHair !== 'none'
                        ? ` · ${swapPlayer.appearance.facialHair}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mb-3 border border-[#273237] bg-[#263238] p-3 text-white shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-heading text-[10px] uppercase tracking-[0.22em] text-[#a9d94c]">Featured player</span>
                  <p className="truncate font-display text-2xl tracking-wide">
                    {featuredPlayer ? featuredPlayer.name : 'Choose your star'}
                  </p>
                  <p className="font-body text-[11px] leading-snug text-[#d2dcde]">
                    Bright boots and a shape-coded pitch marker make your star easy to track.
                  </p>
                </div>
                {swapPlayer && swapPlayer.id !== featuredPlayerId ? (
                  <button
                    type="button"
                    onClick={() => onFeaturedPlayerChange(swapPlayer.id)}
                    className="shrink-0 border border-[#a9d94c] bg-[#a9d94c] px-2.5 py-2 font-heading text-[9px] uppercase tracking-wider text-[#26310d] hover:brightness-105"
                  >
                    Make featured
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCycleFeaturedAccent}
                  className="flex items-center justify-between border border-white/25 bg-white/10 px-2.5 py-2 text-left hover:border-[#a9d94c]"
                >
                  <span>
                    <span className="block font-heading text-[9px] uppercase tracking-wider text-[#aab8bb]">Boot + marker</span>
                    <span className="block font-heading text-xs uppercase">{featuredAccent.name}</span>
                  </span>
                  <span className="h-6 w-6 rounded-full border-2 border-white/70" style={{ backgroundColor: featuredAccent.value }} />
                </button>
                <button
                  type="button"
                  onClick={onCycleFeaturedMarker}
                  className="border border-white/25 bg-white/10 px-2.5 py-2 text-left hover:border-[#a9d94c]"
                >
                  <span className="block font-heading text-[9px] uppercase tracking-wider text-[#aab8bb]">Marker shape</span>
                  <span className="block font-heading text-xs uppercase">{featuredMarker}</span>
                </button>
              </div>
            </div>

            <div className="mb-2 flex items-end justify-between">
              <div>
                <span className="font-heading text-[10px] uppercase tracking-[0.22em] text-[#687a81]">Available replacements</span>
                <h3 id="bench-heading" className="font-display text-3xl tracking-wide text-[#273237]">Bench</h3>
              </div>
              <span className="font-heading text-xs uppercase tracking-wider text-[#687a81]">{benchPlayers.length} players</span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {benchPlayers.map((player) => {
                const compatible = canSwapWith(player);
                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={!compatible}
                    onClick={() => {
                      if (!swapPlayer) return;
                      onSwap(swapPlayer.id, player.id);
                      setSwapPlayerId(null);
                    }}
                    className={`border p-2.5 text-left shadow-sm transition-all ${
                      compatible
                        ? 'border-[#168f99] bg-white hover:border-[#789c2a] hover:bg-[#f2f8df]'
                        : 'cursor-default border-[#b7c0c3] bg-white/55 opacity-65'
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-heading text-sm uppercase tracking-wide text-[#273237]">
                          <span className="mr-1.5 text-[#738188]">#{player.num}</span>{player.name}
                        </span>
                        <span className="mt-0.5 block font-body text-[11px] text-[#6a797f]">
                          Natural {ROLE_LABELS[player.role]} · {compatible ? `Swap for ${swapPlayer?.name}` : swapPlayer ? 'Different position group' : 'Select a starter first'}
                        </span>
                      </span>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-xl ${compatible ? 'bg-[#a9d94c] text-[#27310f]' : 'bg-[#d7dfe0] text-[#273237]'}`}>
                        {player.overallRating}
                      </span>
                    </span>
                    <span className="mt-2 grid grid-cols-6 gap-1">
                      {(['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as const).map((label, index) => (
                        <span key={label} className="text-center">
                          <span className="block font-heading text-[8px] text-[#879399]">{label}</span>
                          <span className="block font-heading text-[11px] text-[#334046]">{player.ratings[index]}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 z-20 -mx-3 mt-4 flex items-center justify-between gap-3 border-t border-[#aab5b9] bg-white/92 px-3 py-3 shadow-[0_-4px_12px_rgba(60,75,80,0.1)] backdrop-blur sm:-mx-6 sm:px-6">
          <span className={`font-heading text-xs uppercase tracking-wider ${complete ? 'text-[#5f8120]' : 'text-[#9a5234]'}`}>
            {complete ? 'Starting VII ready' : 'Select 1 keeper + 6 outfielders'}
          </span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!complete}
            className="border border-[#5d781d] bg-gradient-to-r from-[#90b936] to-[#b8df62] px-4 py-2.5 font-heading text-xs uppercase tracking-[0.16em] text-[#26310d] shadow-sm transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#aeb8ba] disabled:bg-[#d4dbdc] disabled:text-[#8a969a] sm:px-6 sm:text-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({
  bindings,
  onChange,
  onReset,
  controllerBindings,
  onControllerChange,
  onControllerReset,
  onClose,
}: {
  bindings: KeyBindings;
  onChange: (next: KeyBindings) => void;
  onReset: () => void;
  controllerBindings: ControllerBindings;
  onControllerChange: (next: ControllerBindings) => void;
  onControllerReset: () => void;
  onClose: () => void;
}) {
  // The action currently waiting to capture its next keypress (null = idle).
  const [capturing, setCapturing] = useState<GameAction | null>(null);
  const [capturingController, setCapturingController] =
    useState<ControllerAction | null>(null);
  const [controllerStatus, setControllerStatus] = useState<{
    id: string;
    mapping: string;
    pressed: number[];
    count: number;
  } | null>(null);
  const previousControllerButtons = useRef(new Set<number>());

  // While capturing, the next keydown anywhere becomes the new binding.
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setCapturing(null);
        return;
      }
      onChange(assignKey(bindings, capturing, e.code));
      setCapturing(null);
    };
    // Capture phase so we intercept before the game's own listeners.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, bindings, onChange]);

  // Poll while settings is open so an unknown controller can identify itself
  // and bind raw button indexes without us needing the hardware in advance.
  useEffect(() => {
    let raf = 0;
    let lastStatus = '';
    const poll = () => {
      const gamepads = connectedGamepads();
      const gamepad = gamepads[0];
      if (!gamepad) {
        previousControllerButtons.current.clear();
        if (lastStatus !== 'none') {
          lastStatus = 'none';
          setControllerStatus(null);
        }
        raf = requestAnimationFrame(poll);
        return;
      }

      const pressed = pressedButtonIndexes(gamepad);
      const current = new Set(pressed);
      if (capturingController) {
        const fresh = pressed.find(
          (button) => !previousControllerButtons.current.has(button),
        );
        if (fresh !== undefined) {
          onControllerChange(
            assignControllerButton(controllerBindings, capturingController, fresh),
          );
          setCapturingController(null);
        }
      }
      previousControllerButtons.current = current;
      const signature = `${gamepad.id}|${gamepad.mapping}|${pressed.join(',')}|${gamepads.length}`;
      if (signature !== lastStatus) {
        lastStatus = signature;
        setControllerStatus({
          id: gamepad.id,
          mapping: gamepad.mapping || 'raw',
          pressed,
          count: gamepads.length,
        });
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [capturingController, controllerBindings, onControllerChange]);

  const isDefault = (Object.keys(DEFAULT_BINDINGS) as GameAction[]).every(
    (a) => bindings[a] === DEFAULT_BINDINGS[a],
  );
  const isControllerDefault = CONTROLLER_ACTION_ORDER.every(
    (action) => controllerBindings[action] === DEFAULT_CONTROLLER_BINDINGS[action],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-[#829296] bg-[#edf1ee] shadow-2xl shadow-black/60 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[#9ca9ad] bg-gradient-to-r from-[#d1d9db] via-white to-[#eaf2d9] px-6 py-4">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[#6e9423]" />
            <h3 className="-skew-x-6 font-display text-2xl italic tracking-wide text-[#273237]">
              CONTROLS &amp; HELP
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="text-[#607078] transition-colors hover:text-[#273237]"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto bg-[#182126] px-6 py-4">
          <div className="mb-5 rounded-xl border border-volt-500/25 bg-volt-500/5 px-4 py-3 font-body text-sm leading-relaxed text-night-200">
            <b className="text-white">You opened the correct VIFA screen.</b>{' '}
            This is part of the game webpage—it is not a computer-settings
            window. This screen changes on-pitch controls only.{' '}
            Use your mouse, trackpad, or keyboard to choose teams and build the
            squad. During the match, you can use touchscreen controls, a
            controller, keyboard, or a combination of them.
            Scroll through this page to see every action before you play.
          </div>

          <section className="mb-7 rounded-xl border border-[#16a6b3]/30 bg-[#16a6b3]/5 p-4">
            <div className="flex items-center gap-2">
              <Smartphone size={18} className="text-sky-300" />
              <h4 className="font-heading text-sm uppercase tracking-[0.22em] text-white">
                iPhone &amp; touchscreen
              </h4>
            </div>
            <ol className="mt-3 grid gap-2 font-body text-sm leading-relaxed text-night-200 sm:grid-cols-2">
              <li><b className="text-white">1. Choose the game normally.</b> Tap Play Match or Practice, then pick your team, squad, and formation.</li>
              <li><b className="text-white">2. Rotate at kickoff.</b> The match stays paused until the phone is sideways. If it stays upright, open iPhone Control Center and turn off Orientation Lock.</li>
              <li><b className="text-white">3. Left thumb moves.</b> Drag anywhere inside the circular joystick. Diagonal movement works too.</li>
              <li><b className="text-white">4. Right thumb acts.</b> Hold Sprint, passes, or Shoot to charge them; lift your thumb to release the kick.</li>
            </ol>
            <p className="mt-3 border-t border-sky-300/15 pt-3 font-body text-xs leading-relaxed text-night-300">
              The same buttons change jobs while defending: Shoot becomes Tackle, Long becomes Slide, Through becomes goalkeeper rush, and Contain helps you stay goal-side.
            </p>
          </section>

          <section className="mb-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Gamepad2 size={18} className="text-volt-400" />
                <h4 className="font-heading text-sm uppercase tracking-[0.22em] text-white">
                  Controller
                </h4>
              </div>
              <button
                onClick={onControllerReset}
                disabled={isControllerDefault}
                className="font-heading text-[10px] uppercase tracking-wider text-night-300 transition-colors hover:text-volt-400 disabled:opacity-40"
              >
                Restore recommended layout
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-sky-300/20 bg-sky-300/5 p-4">
              <h5 className="font-heading text-xs uppercase tracking-[0.18em] text-sky-200">
                First-time setup — four simple steps
              </h5>
              <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ['1', 'Plug it in', 'Connect the USB cable or pair the controller before starting a match.'],
                  ['2', 'Wake it up', 'Click this page once, then press any controller button. Browsers often hide controllers until that first press.'],
                  ['3', 'Test it', 'Look at “Live button test” below. A number should appear each time you press a button.'],
                  ['4', 'Use or customize', 'Keep the recommended layout, or click an action and press the button that feels natural to you.'],
                ].map(([step, title, copy]) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-300 font-display text-xs text-night-950">
                      {step}
                    </span>
                    <span>
                      <b className="block font-heading text-xs uppercase tracking-wider text-white">
                        {title}
                      </b>
                      <span className="mt-0.5 block font-body text-xs leading-relaxed text-night-300">
                        {copy}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className={`mb-4 rounded-xl border px-4 py-3 ${
              controllerStatus
                ? 'border-volt-500/30 bg-volt-500/10'
                : 'border-night-700 bg-night-950/60'
            }`}>
              {controllerStatus ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-heading text-xs uppercase tracking-wider text-volt-300">
                      Connected · Player 1
                    </span>
                    <span className="font-body text-xs text-night-300">
                      {controllerStatus.count > 1
                        ? `${controllerStatus.count} controllers detected`
                        : `${controllerStatus.mapping} mapping`}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-body text-xs text-night-200" title={controllerStatus.id}>
                    {controllerStatus.id}
                  </p>
                  <p className="mt-2 font-body text-xs text-night-400">
                    Live button test:{' '}
                    <span className="text-volt-300">
                      {controllerStatus.pressed.length
                        ? controllerStatus.pressed.join(', ')
                        : 'press any button to test'}
                    </span>
                  </p>
                </>
              ) : (
                <div>
                  <p className="font-heading text-xs uppercase tracking-wider text-orange-200">
                    No controller detected yet
                  </p>
                  <p className="mt-1 font-body text-sm leading-relaxed text-night-300">
                    That is okay. Plug it in, click anywhere on this VIFA page,
                    and press a controller button. You do not need to reload.
                    Keyboard controls remain available at the same time.
                  </p>
                </div>
              )}
            </div>

            <div className="mb-4 grid gap-2 rounded-lg bg-night-950/60 p-3 font-body text-xs leading-relaxed text-night-300 sm:grid-cols-2">
              <p>
                <b className="text-white">Movement never needs mapping:</b>{' '}
                use the left stick or D-pad. A small center dead zone prevents
                accidental drifting.
              </p>
              <p>
                <b className="text-white">Button names:</b> “Bottom face” means
                the lowest of the four main buttons, “Right face” means the one
                farthest right, and so on. The small number is only the name
                your browser gives that physical button.
              </p>
              <p>
                <b className="text-white">To change one:</b> click its green
                button below. When it says “Press button…”, press the physical
                controller button you want. Click it again to cancel.
              </p>
              <p>
                <b className="text-white">Nothing can be lost:</b> duplicate
                choices automatically swap, settings save in this browser, and
                “Restore recommended layout” undoes every controller change.
              </p>
            </div>

            <div className="mb-3 rounded-lg border border-volt-500/20 bg-volt-500/5 px-3 py-2 font-body text-xs leading-relaxed text-night-300">
              <b className="text-volt-300">Local two-player:</b> the first
              connected controller is Player 1 and the second is Player 2. If
              only one controller is connected, Player 2 can still use the
              second keyboard layout. This saved button layout applies to both
              controllers.
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {CONTROLLER_ACTION_ORDER.map((action) => (
                <div
                  key={action}
                  className="flex items-start justify-between gap-3 rounded-lg bg-night-950/60 px-3 py-3"
                >
                  <span className="min-w-0 font-body text-sm text-white">
                    <b className="block font-heading text-xs uppercase tracking-wider">
                      {CONTROLLER_ACTION_LABELS[action]}
                    </b>
                    <span className="mt-1 block text-xs leading-relaxed text-night-400">
                      {CONTROLLER_ACTION_HELP[action]}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      setCapturing(null);
                      setCapturingController((current) =>
                        current === action ? null : action,
                      );
                    }}
                    className={`min-w-[7.5rem] shrink-0 rounded-md px-3 py-2 font-heading text-xs tracking-wider transition-colors ${
                      capturingController === action
                        ? 'bg-volt-500 text-night-950 animate-pulse'
                        : 'bg-night-800 text-volt-400 hover:bg-night-700'
                    }`}
                  >
                    {capturingController === action
                      ? controllerStatus ? 'Press button…' : 'Connect pad…'
                      : controllerButtonLabel(controllerBindings[action])}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Keyboard size={18} className="text-volt-400" />
              <h4 className="font-heading text-sm uppercase tracking-[0.22em] text-white">
                Keyboard
              </h4>
            </div>
          <p className="font-body text-sm text-night-300 mb-4">
            Click a key to rebind it, then press any key. Press{' '}
            <span className="text-volt-400">Esc</span> to cancel. Changes save
            automatically and the game stays paused while this is open. The
            action names mean exactly the same thing as the controller
            explanations above.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 items-start">
            {BINDING_GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
              <h4 className="font-heading uppercase text-[11px] tracking-[0.25em] text-night-500 mb-2">
                {group.title}
              </h4>
              <div className="flex flex-col gap-1.5">
                {group.actions.map(({ action, label }) => (
                  <div
                    key={action}
                    className="flex items-center justify-between gap-3 rounded-lg bg-night-950/60 px-3 py-2"
                  >
                    <span className="font-body text-sm text-white">
                      {label}
                    </span>
                    <button
                      onClick={() =>
                        setCapturing((c) => (c === action ? null : action))
                      }
                      className={`min-w-[5rem] rounded-md px-3 py-1.5 font-heading text-sm tracking-wider transition-colors ${
                        capturing === action
                          ? 'bg-volt-500 text-night-950 animate-pulse'
                          : 'bg-night-800 text-volt-400 hover:bg-night-700'
                      }`}
                    >
                      {capturing === action
                        ? 'Press…'
                        : codeLabel(bindings[action])}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            ))}
          </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-[#9ca9ad] bg-gradient-to-r from-[#d1d9db] via-white to-[#eaf2d9] px-6 py-4">
          <button
            onClick={onReset}
            disabled={isDefault}
            className="flex items-center gap-2 font-heading text-xs uppercase tracking-wider text-[#56676e] transition-colors hover:text-[#668c20] disabled:opacity-40 disabled:hover:text-[#56676e]"
          >
            <RotateCcw size={14} />
            Reset keyboard defaults
          </button>
          <button
            onClick={onClose}
            className="border border-[#5d781d] bg-gradient-to-r from-[#90b936] to-[#b8df62] px-5 py-2 font-heading text-xs uppercase tracking-wider text-[#26310d] shadow-sm transition-colors hover:brightness-105"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  number,
  title,
  blurb,
  active,
  onHover,
  onClick,
}: {
  number: string;
  title: string;
  blurb: string;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <button
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      className={`group relative flex min-h-[66px] w-full items-center overflow-hidden border text-left transition-all duration-150 [clip-path:polygon(2%_0,100%_0,97%_100%,0_100%)] ${
        active
          ? 'z-10 -translate-x-1 border-[#6d872e] bg-gradient-to-r from-[#d9ec8c] via-[#f6f8df] to-white shadow-[0_5px_12px_rgba(65,83,48,0.28)] sm:-translate-x-3'
          : 'border-[#abb4b7] bg-gradient-to-r from-[#d7dcde] via-white to-white/60 hover:-translate-x-1 hover:border-[#7e969d]'
      }`}
    >
      <span
        className={`ml-3 mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-xs shadow-inner sm:ml-5 ${
          active
            ? 'border-[#70862f] bg-[radial-gradient(circle_at_35%_25%,#f9ff9a,#8bab31_58%,#50670e)] text-[#243006]'
            : 'border-[#6f777b] bg-[radial-gradient(circle_at_35%_25%,#ef9a9d,#9e2f3c_58%,#55151d)] text-white'
        }`}
      >
        {number}
      </span>
      <span className="min-w-0 flex-1 py-2 pr-3">
        <span className={`block -skew-x-6 font-display text-xl italic tracking-wide sm:text-2xl ${
          active ? 'text-[#202a2e]' : 'text-[#3d474c]'
        }`}>
          {title}
        </span>
        <span className="block truncate font-body text-[11px] text-[#607078] sm:text-xs">
          {blurb}
        </span>
      </span>
      <span className={`mr-5 text-2xl transition-transform ${
        active ? 'translate-x-0 text-[#719523]' : '-translate-x-2 text-[#9ca6aa]'
      }`} aria-hidden="true">
        ▶
      </span>
    </button>
  );
}

function TeamCrest({
  team,
  selectionId,
  year,
  years,
  yearOptions,
  kitOptions,
  kitId,
  tag,
  active,
  locked,
  onYearChange,
  onTeamChange,
  onKitChange,
  onPrevious,
  onNext,
}: {
  team: TeamData;
  selectionId: string;
  year: number;
  years: number[];
  yearOptions: VifaEraTeamOption[];
  kitOptions: WorldCupKitOption[];
  kitId: string;
  tag: string;
  active: boolean;
  locked: boolean;
  onYearChange: (year: number) => void;
  onTeamChange: (id: string) => void;
  onKitChange: (id: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const selectedKit = kitOptions.find((option) => option.id === kitId) ?? kitOptions[0];
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 sm:gap-3">
      <span
        className={`font-heading uppercase tracking-[0.3em] text-sm ${
          active ? 'text-[#6f9623]' : 'text-[#66777e]'
        }`}
      >
        {tag}
      </span>
      <div className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-[88px_1fr]">
        <label className="sr-only" htmlFor={`${tag}-era`}>{tag} era</label>
        <select
          id={`${tag}-era`}
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className="min-w-0 border border-[#9ba8ac] bg-white/85 px-2 py-1.5 font-heading text-xs text-[#273237] outline-none focus:border-[#7da32b]"
        >
          {years.map((availableYear) => (
            <option key={availableYear} value={availableYear}>{availableYear}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${tag}-team`}>{tag} team</label>
        <select
          id={`${tag}-team`}
          value={selectionId}
          onChange={(event) => onTeamChange(event.target.value)}
          className="min-w-0 border border-[#9ba8ac] bg-white/85 px-2 py-1.5 font-body text-xs text-[#273237] outline-none focus:border-[#7da32b]"
        >
          {yearOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.team.name}</option>
          ))}
        </select>
      </div>
      <label className="w-full">
        <span className="mb-1 block text-center font-heading text-[9px] uppercase tracking-[0.18em] text-[#60737a] sm:text-[10px]">
          World Cup jersey · any era
        </span>
        <select
          value={selectedKit.id}
          onChange={(event) => onKitChange(event.target.value)}
          className="w-full min-w-0 border border-[#789c2a] bg-[#f5f8ee] px-2 py-1.5 font-heading text-[10px] uppercase tracking-wider text-[#273237] outline-none focus:border-[#168f99] sm:text-xs"
          aria-label={`${tag} World Cup jersey`}
        >
          {kitOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onPrevious}
          aria-label={`Previous ${year} team`}
          className={`hidden shrink-0 transition-opacity sm:block ${
            active ? 'text-[#759d23] animate-pulse' : 'pointer-events-none text-transparent'
          }`}
        >
          <ChevronLeft size={32} />
        </button>
        <div
          className={`relative flex h-32 w-28 flex-col items-center justify-center overflow-hidden rounded-2xl transition-all sm:h-44 sm:w-40 ${
            active
              ? 'ring-4 ring-[#8bb33a] scale-105 shadow-xl shadow-[#526169]/30'
              : locked
                ? 'ring-2 ring-[#78982e]/60 opacity-90'
                : 'ring-1 ring-[#9eaaae] opacity-75'
          }`}
          style={{
            backgroundImage: `radial-gradient(circle at 50% 38%, ${team.color}38, rgba(255,255,255,0.94) 70%), linear-gradient(160deg, #f8faf8, #cbd4d5)`,
          }}
        >
          {locked && (
            <span className="absolute right-2 top-2 z-10 rounded-full bg-[#91bc38] p-1 text-[#26310d]">
              <Check size={18} strokeWidth={3} />
            </span>
          )}
          <KitJersey kit={selectedKit.kit} />
        </div>
        <button
          type="button"
          onClick={onNext}
          aria-label={`Next ${year} team`}
          className={`hidden shrink-0 transition-opacity sm:block ${
            active ? 'text-[#759d23] animate-pulse' : 'pointer-events-none text-transparent'
          }`}
        >
          <ChevronRight size={32} />
        </button>
      </div>
      <span className="font-heading text-center text-lg uppercase leading-tight tracking-wider text-[#273237] sm:text-2xl">
        {team.name}
      </span>
      <span className="font-heading text-[10px] uppercase tracking-[0.22em] text-[#6f9623] sm:text-xs">
        Squad {year} · Kit {selectedKit.year} {selectedKit.variant}
      </span>
    </div>
  );
}

/** A football shirt illustration drawn from the team's kit colours. */
function KitJersey({
  kit,
}: {
  kit: Kit;
}) {
  const shorts = kit.shorts ?? kit.sleeve;
  const clipId = `kit-${useId().replaceAll(':', '')}`;
  const accent = kit.accent ?? kit.outline;
  const secondary = kit.secondaryAccent ?? '#ffffff';
  return (
    <svg
      viewBox="0 0 200 236"
      className="w-32 h-40 sm:w-36 sm:h-44 drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M84 36 L58 44 L20 62 L31 104 L66 94 L64 166 L136 166 L134 94 L169 104 L180 62 L142 44 L116 36 Q100 56 84 36 Z" />
        </clipPath>
      </defs>
      <g stroke={kit.outline} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
        {/* shorts (drawn first so the shirt hem overlaps the waistband) */}
        <path
          d="M66 150 L134 150 L140 214 L108 214 L100 178 L92 214 L60 214 Z"
          fill={shorts}
        />
        {/* shirt body silhouette */}
        <path
          d="M84 36 L58 44 L20 62 L31 104 L66 94 L64 166 L136 166 L134 94 L169 104 L180 62 L142 44 L116 36 Q100 56 84 36 Z"
          fill={kit.shirt}
        />
        {/* left sleeve */}
        <path d="M58 44 L20 62 L31 104 L66 94 Z" fill={kit.sleeve} />
        {/* right sleeve */}
        <path d="M142 44 L180 62 L169 104 L134 94 Z" fill={kit.sleeve} />
      </g>
      <g clipPath={`url(#${clipId})`} pointerEvents="none">
        {kit.pattern === 'shoulder-stripes' ? (
          <>
            <path d="M50 47 L77 58" stroke={accent} strokeWidth="7" />
            <path d="M150 47 L123 58" stroke={accent} strokeWidth="7" />
            <path d="M55 55 L76 64" stroke={secondary} strokeWidth="3" />
            <path d="M145 55 L124 64" stroke={secondary} strokeWidth="3" />
          </>
        ) : null}
        {kit.pattern === 'chest-band' ? (
          <>
            <rect x="62" y="78" width="76" height="17" fill={accent} />
            <rect x="62" y="87" width="76" height="6" fill={secondary} />
          </>
        ) : null}
        {kit.pattern === 'pinstripes' ? (
          Array.from({ length: 6 }, (_, index) => (
            <path key={index} d={`M${72 + index * 11} 48 V166`} stroke={index % 2 ? secondary : accent} strokeWidth="2.4" opacity="0.82" />
          ))
        ) : null}
        {kit.pattern === 'hoops' ? (
          Array.from({ length: 4 }, (_, index) => (
            <rect key={index} x="60" y={62 + index * 25} width="80" height="10" fill={accent} />
          ))
        ) : null}
        {kit.pattern === 'sash' ? (
          <path d="M61 51 L78 43 L139 157 L121 166 Z" fill={accent} opacity="0.95" />
        ) : null}
        {kit.pattern === 'checker' ? (
          Array.from({ length: 12 }, (_, index) => {
            const column = index % 3;
            const row = Math.floor(index / 3);
            return <rect key={index} x={65 + column * 24} y={55 + row * 27} width="24" height="27" fill={(column + row) % 2 ? accent : secondary} opacity="0.92" />;
          })
        ) : null}
        {kit.pattern === 'split' ? (
          <path d="M100 36 H142 L180 62 L169 104 L134 94 L136 166 H100 Z" fill={accent} opacity="0.96" />
        ) : null}
      </g>
      <path d="M84 36 Q100 56 116 36" fill="none" stroke={kit.outline} strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

function PlayerNameTag({
  side,
  color,
  textColor,
  num,
  name,
  charge,
}: {
  side: 'left' | 'right';
  color: string;
  textColor: string;
  num: number;
  name: string;
  charge?: number | null;
}) {
  const showCharge = charge != null;
  return (
    <div
      className={`absolute bottom-3 ${
        side === 'left' ? 'left-3' : 'right-3'
      } rounded-md overflow-hidden shadow-lg shadow-black/40 bg-night-950/95 font-heading select-none animate-fade-in`}
    >
      <div className="flex items-stretch h-9">
        {side === 'left' && (
          <span
            className="w-1.5 self-stretch"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className="flex items-center px-2.5 text-sm tabular-nums font-display"
          style={{ backgroundColor: color, color: textColor }}
        >
          {num}
        </span>
        <span className="flex items-center px-3 text-white uppercase tracking-wider text-sm font-bold">
          {name}
        </span>
        {side === 'right' && (
          <span
            className="w-1.5 self-stretch"
            style={{ backgroundColor: color }}
          />
        )}
      </div>
      <div className="h-1 w-full bg-night-800">
        {showCharge && (
          <div
            className="h-full transition-[width] duration-75 ease-linear"
            style={{
              width: `${Math.round((charge as number) * 100)}%`,
              background:
                'linear-gradient(90deg,#39e639 0%,#ffe23a 55%,#ff8c1a 80%,#ff2e2e 100%)',
            }}
          />
        )}
      </div>
    </div>
  );
}
