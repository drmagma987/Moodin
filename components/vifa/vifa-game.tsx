'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Check,
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
import { PLAYER_TWO_BINDINGS, VIFA_MODS } from '@/lib/vifa/mods';

type Phase = 'intro' | 'select' | 'playing';
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

  const homeOption = eraTeams.find((option) => option.id === homeSelectionId)
    ?? fallbackHome;
  const awayOption = eraTeams.find((option) => option.id === awaySelectionId)
    ?? fallbackAway;
  const home: TeamData = homeOption.team;
  const away: TeamData = awayOption.team;
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
    if (side === 'home') setHomeSelectionId(next.id);
    else setAwaySelectionId(next.id);
  }, [awayOption, homeOption, optionsForYear]);
  const cycleSelection = useCallback((side: 'home' | 'away', direction: number) => {
    const current = side === 'home' ? homeOption : awayOption;
    const yearOptions = optionsForYear(current.year);
    const index = Math.max(0, yearOptions.findIndex((option) => option.id === current.id));
    const next = yearOptions[wrap(index + direction, yearOptions.length)];
    if (side === 'home') setHomeSelectionId(next.id);
    else setAwaySelectionId(next.id);
  }, [awayOption, homeOption, optionsForYear]);
  const confirmActiveSelection = useCallback(() => {
    if (activeSide === 'home') setActiveSide('away');
    else setPhase('playing');
  }, [activeSide]);

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
        matchRealSeconds: VIFA_MODS.matchRealSeconds,
        enhancementCanvas: enhancementCanvasRef.current ?? undefined,
        seed: (selectionSeed(homeOption.id) ^ selectionSeed(awayOption.id) ^ gameKey) >>> 0,
      });
    } else {
      game = new PitchKickGame(canvasRef.current, setHud, home, away, {
        bindings,
        localMultiplayer: mode === 'local',
        awayBindings: PLAYER_TWO_BINDINGS,
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
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Enter')
        e.preventDefault();
      if (k === 'ArrowLeft') setIntroIdx((i) => Math.max(0, i - 1));
      else if (k === 'ArrowRight') setIntroIdx((i) => Math.min(2, i + 1));
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
    } else {
      setPhase('playing');
    }
  };

  const handleRestart = () => {
    setPhase('intro');
    setActiveSide('home');
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-night-950/92 backdrop-blur-sm animate-fade-in px-4">
            <span className="font-heading uppercase text-xs sm:text-sm tracking-[0.4em] text-night-300 mb-2">
              Kick Off
            </span>
            <h2 className="font-display text-5xl sm:text-7xl text-white tracking-wide mb-2 text-center">
              VIFA <span className="text-volt-500">KICK OFF</span>
            </h2>
            <p className="font-body text-night-300 text-base sm:text-lg mb-8 text-center">
              <span className="text-volt-400 font-semibold">← →</span> to choose
              · <span className="text-volt-400 font-semibold">Enter</span> or
              click to start
            </p>
            <div className="flex flex-col sm:flex-row items-stretch gap-4 sm:gap-5">
              <ModeCard
                title="PLAY MATCH"
                blurb="Full 11v11 against the CPU. Pick your nation and go."
                active={introIdx === 0}
                onHover={() => setIntroIdx(0)}
                onClick={() => startMode('match')}
              />
              <ModeCard
                title="LOCAL 2P"
                blurb="Two players, one keyboard, one shared match simulation. Player 2 uses IJKL."
                active={introIdx === 1}
                onHover={() => setIntroIdx(1)}
                onClick={() => startMode('local')}
              />
              <ModeCard
                title="PRACTICE"
                blurb="Free-form pitch with no clock. Learn the controls and rehearse passing and shooting."
                active={introIdx === 2}
                onHover={() => setIntroIdx(2)}
                onClick={() => startMode('practice')}
              />
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
                onTeamChange={setHomeSelectionId}
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
                onTeamChange={setAwaySelectionId}
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
        Current build: CPU, practice, and same-keyboard two-player play. Source
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
          onClose={closeSettings}
        />
      )}
    </div>
  );
}

function SettingsModal({
  bindings,
  onChange,
  onReset,
  onClose,
}: {
  bindings: KeyBindings;
  onChange: (next: KeyBindings) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  // The action currently waiting to capture its next keypress (null = idle).
  const [capturing, setCapturing] = useState<GameAction | null>(null);

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

  const isDefault = (Object.keys(DEFAULT_BINDINGS) as GameAction[]).every(
    (a) => bindings[a] === DEFAULT_BINDINGS[a],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] rounded-2xl bg-night-900 ring-1 ring-night-700 shadow-2xl shadow-black/60 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-night-900 border-b border-night-800">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-volt-400" />
            <h3 className="font-display text-2xl text-white tracking-wide">
              SETTINGS
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

        <div className="px-6 py-4">
          <p className="font-body text-sm text-night-300 mb-4">
            Click a key to rebind it, then press any key. Press{' '}
            <span className="text-volt-400">Esc</span> to cancel. Changes save
            automatically and the game stays paused while this is open.
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
        </div>

        <div className="sticky bottom-0 flex items-center justify-between px-6 py-4 bg-night-900 border-t border-night-800">
          <button
            onClick={onReset}
            disabled={isDefault}
            className="flex items-center gap-2 font-heading uppercase text-xs tracking-wider text-night-300 hover:text-volt-400 transition-colors disabled:opacity-40 disabled:hover:text-night-300"
          >
            <RotateCcw size={14} />
            Reset to defaults
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
  title,
  blurb,
  active,
  onHover,
  onClick,
}: {
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
      className={`group flex flex-col text-left w-72 sm:w-80 rounded-2xl p-6 transition-all duration-200 ${
        active
          ? 'ring-4 ring-volt-500 scale-105 shadow-xl shadow-black/40 bg-night-900'
          : 'ring-1 ring-night-700 opacity-80 hover:opacity-100 bg-night-900/70'
      }`}
    >
      <span
        className={`font-display text-3xl sm:text-4xl tracking-wide mb-3 ${
          active ? 'text-volt-500' : 'text-white'
        }`}
      >
        {title}
      </span>
      <span className="font-body text-sm text-night-300 leading-relaxed">
        {blurb}
      </span>
      <span
        className={`mt-5 font-heading uppercase text-xs tracking-[0.25em] transition-colors ${
          active ? 'text-volt-400' : 'text-night-500'
        }`}
      >
        {active ? '▶ Start' : 'Select'}
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
