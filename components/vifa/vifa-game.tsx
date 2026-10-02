'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
  Gamepad2,
  Keyboard,
  Settings,
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

type Phase = 'intro' | 'select' | 'squad' | 'playing';
type Mode = 'match' | 'local' | 'practice';

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
  const [activeSide, setActiveSide] = useState<'home' | 'away'>('home');
  const [activeSquadSide, setActiveSquadSide] = useState<'home' | 'away'>('home');
  const [homeFormationId, setHomeFormationId] = useState<SevenFormationId>('2-2-2');
  const [awayFormationId, setAwayFormationId] = useState<SevenFormationId>('2-2-2');
  const [homeLineupIds, setHomeLineupIds] = useState<string[]>(() =>
    pickBalancedSeven(fallbackHome.squad),
  );
  const [awayLineupIds, setAwayLineupIds] = useState<string[]>(() =>
    pickBalancedSeven(fallbackAway.squad),
  );

  const homeOption = eraTeams.find((option) => option.id === homeSelectionId)
    ?? fallbackHome;
  const awayOption = eraTeams.find((option) => option.id === awaySelectionId)
    ?? fallbackAway;
  const homeLineupComplete = isCompleteSeven(homeOption.squad, homeLineupIds);
  const awayLineupComplete = isCompleteSeven(awayOption.squad, awayLineupIds);
  const home: TeamData = useMemo(
    () => buildSevenASideTeam(
      homeOption.team,
      homeOption.squad,
      homeLineupIds,
      homeFormationId,
    ),
    [homeFormationId, homeLineupIds, homeOption],
  );
  const away: TeamData = useMemo(
    () => buildSevenASideTeam(
      awayOption.team,
      awayOption.squad,
      awayLineupIds,
      awayFormationId,
    ),
    [awayFormationId, awayLineupIds, awayOption],
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
      setHomeSelectionId(next.id);
      setHomeLineupIds(pickBalancedSeven(next.squad, homeFormationId));
    } else {
      setAwaySelectionId(next.id);
      setAwayLineupIds(pickBalancedSeven(next.squad, awayFormationId));
    }
  }, [awayFormationId, awayOption, homeFormationId, homeOption, optionsForYear]);
  const cycleSelection = useCallback((side: 'home' | 'away', direction: number) => {
    const current = side === 'home' ? homeOption : awayOption;
    const yearOptions = optionsForYear(current.year);
    const index = Math.max(0, yearOptions.findIndex((option) => option.id === current.id));
    const next = yearOptions[wrap(index + direction, yearOptions.length)];
    if (side === 'home') {
      setHomeSelectionId(next.id);
      setHomeLineupIds(pickBalancedSeven(next.squad, homeFormationId));
    } else {
      setAwaySelectionId(next.id);
      setAwayLineupIds(pickBalancedSeven(next.squad, awayFormationId));
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
      setHomeSelectionId(id);
      setHomeLineupIds(pickBalancedSeven(next.squad, homeFormationId));
    } else {
      setAwaySelectionId(id);
      setAwayLineupIds(pickBalancedSeven(next.squad, awayFormationId));
    }
  }, [awayFormationId, eraTeams, homeFormationId]);

  const toggleLineupPlayer = useCallback((side: 'home' | 'away', player: SelectableSquadPlayer) => {
    const option = side === 'home' ? homeOption : awayOption;
    const setLineup = side === 'home' ? setHomeLineupIds : setAwayLineupIds;
    setLineup((current) => {
      if (current.includes(player.id)) {
        return current.filter((id) => id !== player.id);
      }
      const selected = new Set(current);
      const selectedPlayers = option.squad.filter((candidate) => selected.has(candidate.id));
      const roleCount = selectedPlayers.filter((candidate) => candidate.role === player.role).length;
      if (player.role === 'GK' && roleCount >= 1) return current;
      if (player.role !== 'GK' && selectedPlayers.filter((candidate) => candidate.role !== 'GK').length >= 6) {
        return current;
      }
      return [...current, player.id];
    });
  }, [awayOption, homeOption]);

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
      setAwayLineupIds(pickBalancedSeven(awayOption.squad, cpuFormation));
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
    game.start();
    return () => {
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
    if (m === 'match' || m === 'local') {
      setPhase('select');
      setActiveSide('home');
      setActiveSquadSide('home');
    } else {
      setPhase('playing');
    }
  };

  const handleRestart = () => {
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
    gameRef.current?.setPaused(true);
    setSettingsOpen(true);
  };
  const closeSettings = () => {
    setSettingsOpen(false);
    gameRef.current?.setPaused(false);
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

  return (
    <div className="min-h-full flex flex-col bg-night-950">
      {/* Brand bar — slim so the pitch gets the screen */}
      <header className="w-full flex items-center justify-between px-4 py-2 animate-fade-in">
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
      <div className="relative mx-auto w-fit max-w-full overflow-hidden border-y border-night-800 shadow-2xl animate-slide-up">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`block max-w-full ${
            phase === 'playing'
              ? 'h-auto w-auto'
              : 'h-[620px] w-screen sm:h-auto sm:w-auto'
          }`}
          style={{
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            maxHeight: 'calc(100vh - 168px)',
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
                        VIFA <span className="text-[#759d23]">2000</span>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-night-950/92 backdrop-blur-sm animate-fade-in px-4">
            <h2 className="font-display text-3xl sm:text-6xl text-white tracking-wide mb-2">
              SELECT <span className="text-volt-500">TEAMS</span>
            </h2>
            <p className="font-body text-night-300 text-sm sm:text-lg mb-4 text-center">
              <span className="text-volt-400 font-semibold">← →</span> to choose
              ·{' '}
              <span className="text-volt-400 font-semibold">Enter / S / D</span>{' '}
              to confirm
            </p>
            <div className="mb-4 rounded-full border border-volt-500/30 bg-volt-500/10 px-4 py-1.5 font-heading text-[10px] uppercase tracking-[0.24em] text-volt-300 sm:text-xs">
              Cross-era matchups enabled
            </div>
            <div className="grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1 sm:gap-10">
              <TeamCrest
                team={home}
                selectionId={homeOption.id}
                year={homeOption.year}
                years={availableYears}
                yearOptions={optionsForYear(homeOption.year)}
                tag="YOU"
                active={activeSide === 'home'}
                locked={activeSide === 'away'}
                onYearChange={(year) => setSelectionYear('home', year)}
                onTeamChange={(id) => setTeamSelection('home', id)}
                onPrevious={() => cycleSelection('home', -1)}
                onNext={() => cycleSelection('home', 1)}
              />
              <div className="flex items-center font-display text-2xl sm:text-5xl text-night-500">
                VS
              </div>
              <TeamCrest
                team={away}
                selectionId={awayOption.id}
                year={awayOption.year}
                years={availableYears}
                yearOptions={optionsForYear(awayOption.year)}
                tag={mode === 'local' ? 'PLAYER 2' : 'CPU'}
                active={activeSide === 'away'}
                locked={false}
                useAwayKit
                onYearChange={(year) => setSelectionYear('away', year)}
                onTeamChange={(id) => setTeamSelection('away', id)}
                onPrevious={() => cycleSelection('away', -1)}
                onNext={() => cycleSelection('away', 1)}
              />
            </div>
            <button
              type="button"
              onClick={confirmActiveSelection}
              className="mt-4 rounded-lg bg-volt-500 px-6 py-2 font-heading text-sm uppercase tracking-[0.2em] text-night-950 transition-colors hover:bg-volt-400"
            >
              {activeSide === 'home'
                ? `Lock ${home.name} ${homeOption.year}`
                : `Kick Off: ${home.name} ${homeOption.year} vs ${away.name} ${awayOption.year}`}
            </button>
          </div>
        )}

        {phase === 'squad' && (
          <SquadBuilder
            option={activeSquadSide === 'home' ? homeOption : awayOption}
            selectedIds={activeSquadSide === 'home' ? homeLineupIds : awayLineupIds}
            formationId={activeSquadSide === 'home' ? homeFormationId : awayFormationId}
            sideLabel={activeSquadSide === 'home'
              ? 'Player 1'
              : mode === 'local' ? 'Player 2' : 'CPU'}
            complete={activeSquadSide === 'home' ? homeLineupComplete : awayLineupComplete}
            onToggle={(player) => toggleLineupPlayer(activeSquadSide, player)}
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
              if (activeSquadSide === 'home') setHomeLineupIds(ids);
              else setAwayLineupIds(ids);
            }}
            onConfirm={confirmSquad}
            confirmLabel={mode === 'local' && activeSquadSide === 'home'
              ? 'Lock squad · Player 2 next'
              : 'Lock squad · Kick off'}
          />
        )}
      </div>

      {/* Controls legend */}
      <div className="w-full px-4 mt-2 grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 animate-fade-in">
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

      {mode === 'local' && phase === 'playing' && (
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

      <p className="mt-2 mb-3 px-4 text-xs text-night-300 font-body text-center max-w-3xl mx-auto">
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

      <p className="mb-4 px-4 text-center text-xs text-night-400 font-body">
        Current build: CPU, practice, controller support, and local two-player
        play. Source
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
          ? 'border-volt-500/40 bg-volt-500/10 text-volt-300'
          : 'border-orange-400/40 bg-orange-400/10 text-orange-200'
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
  sideLabel,
  complete,
  onToggle,
  onFormationChange,
  onAutoPick,
  onConfirm,
  confirmLabel,
}: {
  option: VifaEraTeamOption;
  selectedIds: string[];
  formationId: SevenFormationId;
  sideLabel: string;
  complete: boolean;
  onToggle: (player: SelectableSquadPlayer) => void;
  onFormationChange: (formationId: SevenFormationId) => void;
  onAutoPick: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  const selected = new Set(selectedIds);
  const selectedPlayers = option.squad.filter((player) => selected.has(player.id));
  const goalkeeperCount = selectedPlayers.filter((player) => player.role === 'GK').length;
  const outfieldCount = selectedPlayers.length - goalkeeperCount;
  const assignments = assignPlayersToFormation(option.squad, selectedIds, formationId);
  const assignmentByPlayer = new Map(
    assignments.map((assignment) => [assignment.player.id, assignment]),
  );

  return (
    <div className="absolute inset-0 overflow-y-auto bg-night-950/96 backdrop-blur-sm animate-fade-in">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <div className="sticky top-0 z-20 -mx-3 -mt-3 mb-3 border-b border-night-800 bg-night-950/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:-mt-5 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="font-heading text-[10px] uppercase tracking-[0.28em] text-volt-400 sm:text-xs">
                {sideLabel} · {option.year} World Cup
              </span>
              <h2 className="truncate font-display text-3xl tracking-wide text-white sm:text-5xl">
                BUILD <span className="text-volt-500">{option.team.abbr} 7</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onAutoPick}
              className="shrink-0 rounded-md border border-night-700 bg-night-900 px-3 py-2 font-heading text-[10px] uppercase tracking-wider text-night-200 transition-colors hover:border-volt-500 hover:text-volt-300 sm:text-xs"
            >
              Pick best 7
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SelectionCount label="Keeper" count={goalkeeperCount} limit={1} />
            <SelectionCount label="Outfield" count={outfieldCount} limit={6} />
          </div>
        </div>

        <p className="mb-3 font-body text-sm text-night-300 sm:text-base">
          Pick any six outfielders. VIFA fits them into your shape using their actual attributes—an attacker can play midfield, but only their passing, dribbling, defending, pace, and strength make it work.
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
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  active
                    ? 'border-volt-500 bg-volt-500/12'
                    : 'border-night-700 bg-night-900 hover:border-volt-500/50'
                }`}
              >
                <span className={`block font-display text-2xl ${active ? 'text-volt-400' : 'text-white'}`}>
                  {formation.id}
                </span>
                <span className="block font-heading text-xs uppercase tracking-wider text-white">
                  {formation.name}
                </span>
                <span className="mt-1 block font-body text-[11px] leading-snug text-night-400">
                  {formation.identity}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 rounded-xl border border-night-700 bg-night-900/80 px-3 py-2 font-body text-sm text-night-300">
          <span className="font-heading uppercase tracking-wider text-volt-300">
            {SEVEN_A_SIDE_FORMATIONS.find((formation) => formation.id === formationId)?.name} risk:{' '}
          </span>
          {SEVEN_A_SIDE_FORMATIONS.find((formation) => formation.id === formationId)?.tradeoff}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SEVEN_ROLE_ORDER.map((role) => {
            const roleFull = role === 'GK' ? goalkeeperCount >= 1 : outfieldCount >= 6;
            return (
              <section key={role} aria-labelledby={`squad-${role}`}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 id={`squad-${role}`} className="font-display text-xl tracking-wide text-white sm:text-2xl">
                    {ROLE_LABELS[role]}
                  </h3>
                  <span className="font-heading text-[10px] uppercase tracking-wider text-night-400">
                    Natural role
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {option.squad
                    .filter((player) => player.role === role)
                    .sort((a, b) => b.overallRating - a.overallRating || a.name.localeCompare(b.name))
                    .map((player) => {
                      const isSelected = selected.has(player.id);
                      const blocked = roleFull && !isSelected;
                      const stats = player.ratings;
                      const assignment = assignmentByPlayer.get(player.id);
                      return (
                        <button
                          key={player.id}
                          type="button"
                          aria-pressed={isSelected}
                          disabled={blocked}
                          onClick={() => onToggle(player)}
                          className={`rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? 'border-volt-500 bg-volt-500/12 shadow-[0_0_0_1px_rgba(184,255,44,0.25)]'
                              : blocked
                                ? 'cursor-not-allowed border-night-800 bg-night-900/45 opacity-45'
                                : 'border-night-700 bg-night-900 hover:border-volt-500/60'
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate font-heading text-sm uppercase tracking-wide text-white">
                                <span className="mr-1.5 text-night-400">#{player.num}</span>{player.name}
                              </span>
                              <span className="mt-0.5 block font-body text-[11px] text-night-400">
                                {assignment
                                  ? assignment.targetRole === player.role
                                    ? `Natural ${ROLE_LABELS[assignment.targetRole]} · Fit ${assignment.fitRating}`
                                    : `${ROLE_LABELS[player.role]} → ${ROLE_LABELS[assignment.targetRole]} · Fit ${assignment.fitRating}`
                                  : isSelected
                                    ? 'Complete the seven to calculate fit'
                                    : blocked ? 'Open a slot first' : 'Available'}
                              </span>
                            </span>
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-xl ${
                              isSelected ? 'bg-volt-500 text-night-950' : 'bg-night-800 text-white'
                            }`}>
                              {player.overallRating}
                            </span>
                          </span>
                          <span className="mt-2 grid grid-cols-6 gap-1">
                            {(['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as const).map((label, index) => (
                              <span key={label} className="text-center">
                                <span className="block font-heading text-[8px] text-night-500">{label}</span>
                                <span className="block font-heading text-[11px] text-night-100">{stats[index]}</span>
                              </span>
                            ))}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="sticky bottom-0 z-20 -mx-3 mt-4 flex items-center justify-between gap-3 border-t border-night-800 bg-night-950/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <span className={`font-heading text-xs uppercase tracking-wider ${complete ? 'text-volt-300' : 'text-orange-200'}`}>
            {complete ? '7/7 ready' : 'Fill every position'}
          </span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!complete}
            className="rounded-lg bg-volt-500 px-4 py-2.5 font-heading text-xs uppercase tracking-[0.16em] text-night-950 transition-colors hover:bg-volt-400 disabled:cursor-not-allowed disabled:bg-night-700 disabled:text-night-400 sm:px-6 sm:text-sm"
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
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-night-900 ring-1 ring-night-700 shadow-2xl shadow-black/60 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-night-900 border-b border-night-800">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-volt-400" />
            <h3 className="font-display text-2xl text-white tracking-wide">
              CONTROLS &amp; HELP
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="text-night-300 hover:text-white transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <div className="mb-5 rounded-xl border border-volt-500/25 bg-volt-500/5 px-4 py-3 font-body text-sm leading-relaxed text-night-200">
            <b className="text-white">You opened the correct VIFA screen.</b>{' '}
            This is part of the game webpage—it is not a computer-settings
            window. This screen changes on-pitch controls only.{' '}
            Use your mouse, trackpad, or keyboard to choose teams and build the
            squad. During the match, you can use a controller, keyboard, or both.
            Scroll through this page to see every action before you play.
          </div>

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

        <div className="sticky bottom-0 flex items-center justify-between px-6 py-4 bg-night-900 border-t border-night-800">
          <button
            onClick={onReset}
            disabled={isDefault}
            className="flex items-center gap-2 font-heading uppercase text-xs tracking-wider text-night-300 hover:text-volt-400 transition-colors disabled:opacity-40 disabled:hover:text-night-300"
          >
            <RotateCcw size={14} />
            Reset keyboard defaults
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-volt-500 px-5 py-2 font-heading uppercase text-xs tracking-wider text-night-950 hover:bg-volt-400 transition-colors"
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
  tag,
  active,
  locked,
  useAwayKit = false,
  onYearChange,
  onTeamChange,
  onPrevious,
  onNext,
}: {
  team: TeamData;
  selectionId: string;
  year: number;
  years: number[];
  yearOptions: VifaEraTeamOption[];
  tag: string;
  active: boolean;
  locked: boolean;
  useAwayKit?: boolean;
  onYearChange: (year: number) => void;
  onTeamChange: (id: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 sm:gap-3">
      <span
        className={`font-heading uppercase tracking-[0.3em] text-sm ${
          active ? 'text-volt-400' : 'text-night-300'
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
          className="min-w-0 rounded-md border border-night-700 bg-night-900 px-2 py-1.5 font-heading text-xs text-white outline-none focus:border-volt-500"
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
          className="min-w-0 rounded-md border border-night-700 bg-night-900 px-2 py-1.5 font-body text-xs text-white outline-none focus:border-volt-500"
        >
          {yearOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.team.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onPrevious}
          aria-label={`Previous ${year} team`}
          className={`hidden shrink-0 transition-opacity sm:block ${
            active ? 'text-volt-500 animate-pulse' : 'pointer-events-none text-transparent'
          }`}
        >
          <ChevronLeft size={32} />
        </button>
        <div
          className={`relative flex h-32 w-28 flex-col items-center justify-center overflow-hidden rounded-2xl transition-all sm:h-44 sm:w-40 ${
            active
              ? 'ring-4 ring-volt-500 scale-105 shadow-xl shadow-black/40'
              : locked
                ? 'ring-2 ring-volt-700/60 opacity-90'
                : 'ring-1 ring-night-700 opacity-70'
          }`}
          style={{
            backgroundImage: `radial-gradient(circle at 50% 38%, ${team.color}33, rgba(10,12,18,0.96) 72%), linear-gradient(160deg, #1b2030, #0c0f17)`,
          }}
        >
          {locked && (
            <span className="absolute top-2 right-2 bg-volt-500 text-night-950 rounded-full p-1 z-10">
              <Check size={18} strokeWidth={3} />
            </span>
          )}
          <KitJersey kit={useAwayKit ? team.awayKit : team.kit} />
        </div>
        <button
          type="button"
          onClick={onNext}
          aria-label={`Next ${year} team`}
          className={`hidden shrink-0 transition-opacity sm:block ${
            active ? 'text-volt-500 animate-pulse' : 'pointer-events-none text-transparent'
          }`}
        >
          <ChevronRight size={32} />
        </button>
      </div>
      <span className="font-heading text-center text-lg uppercase leading-tight tracking-wider text-white sm:text-2xl">
        {team.name}
      </span>
      <span className="font-heading text-[10px] uppercase tracking-[0.22em] text-volt-400 sm:text-xs">
        World Cup {year}
      </span>
    </div>
  );
}

/** A football shirt illustration drawn from the team's kit colours. */
function KitJersey({
  kit,
}: {
  kit: { shirt: string; sleeve: string; outline: string; shorts?: string };
}) {
  const shorts = kit.shorts ?? kit.sleeve;
  return (
    <svg
      viewBox="0 0 200 236"
      className="w-32 h-40 sm:w-36 sm:h-44 drop-shadow-[0_5px_8px_rgba(0,0,0,0.5)]"
      aria-hidden="true"
    >
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
        {/* collar */}
        <path d="M84 36 Q100 56 116 36" fill="none" strokeWidth={4} />
      </g>
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
