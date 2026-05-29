"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

declare global {
  interface Window {
    gsap?: {
      fromTo: (...args: unknown[]) => { kill?: () => void } | undefined;
      to: (...args: unknown[]) => { kill?: () => void } | undefined;
      set: (...args: unknown[]) => void;
      timeline: (...args: unknown[]) => {
        fromTo: (...args: unknown[]) => unknown;
        to: (...args: unknown[]) => unknown;
        set: (...args: unknown[]) => unknown;
        kill?: () => void;
      };
    };
    Splitting?: (options?: { target?: Element | string; by?: string }) => unknown;
    particlesJS?: (tagId: string, params: Record<string, unknown>) => void;
    Howl?: new (options: {
      src: string[];
      loop?: boolean;
      volume?: number;
      html5?: boolean;
      preload?: boolean;
      onloaderror?: (id: number, error: unknown) => void;
      onplayerror?: (id: number, error: unknown) => void;
    }) => {
      play: () => number | undefined;
      pause: () => void;
      stop: () => void;
      unload: () => void;
      playing: () => boolean;
    };
    pJSDom?: Array<{
      pJS?: {
        fn?: {
          vendors?: {
            destroypJS?: () => void;
          };
        };
      };
    }>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TUNING CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const OBJ_SIZE = 76;           // px — placeholder square for 200×200 PNG
const CATCHER_W = 96;
const CATCHER_H = 58;
const CATCHER_BOTTOM = 90;     // px from canvas bottom to catcher center
const CATCHER_SPEED = 310;     // px/s
const HIT_SLOP = 1.22;         // hitbox is 22% larger than visual for forgiving mobile feel

const BASE_FALL_SPEED = 78;    // px/s at game start (~40% slower than original)
const SPEED_RAMP = 0.013;      // speed multiplier growth per second
const BASE_SPAWN_INTERVAL = 1.3;
const MIN_SPAWN_INTERVAL = 0.38;
const SPAWN_RAMP = 0.009;

const BACHELOR_DURATION = 10;  // seconds
const SPLASH_CARD_DURATION_MS = 2800;
const BR_STUDIOS_CARD_SRC = "/bachelor-party-blitz/brstudios.png";
const BACHELOR_BLITZ_FONT = '"Press Start 2P", "SF Pro Display", "Segoe UI", sans-serif';
const BACKGROUND_MUSIC_PLACEHOLDER = "/music/background.mp3";
const BILL_SPAWN_CHANCE = 0.008; // Rare trigger target: roughly once every 2-3 minutes
const MUSHROOM_SPAWN_CHANCE = 0.05;
const DODGE_SPAWN_CHANCE = 0.35;
const KATIE_WARNING_DURATION = 1.8;
const BACHELOR_BANNER_DURATION_MS = 1600;
const PARTICLES_CONTAINER_ID = "bachelor-mode-particles";
const BILL_DIALOGUE_DURATIONS_MS = [3200, 4200, 3000] as const;
const BILL_FIRST_BEER_DURATION_MS = 1800;
const BILL_RAPID_BEER_DURATION_MS = 420;
const BILL_POST_CHUG_DIALOGUE_DURATION_MS = 4600;
const BILL_BEER_TOTAL = 12;
const BILL_DOOR_DURATION_MS = 8000;
const BILL_DOOR_INTRO_DURATION_MS = 2200;
const BILL_DOOR_TARGET_TAPS = 35;
const BILL_RESULT_HOLD_MS = 1200;
const BILL_BLACKOUT_FLASH_MS = 110;
const ANGBEEN_FLYBY_SRC = "/bachelor-party-blitz/angbeen-flyby.jpg";

const BILL_DIALOGUES = [
  "...",
  "Uhhh no. That's for chicks.",
  "Thereeeee ya go.",
] as const;

const BILL_POST_CHUG_DIALOGUES = [
  "I better take off all my clothes and leave the apartment.",
  "oh no, I'm locked out! And jimmy can't hear me! There's only one thing left to do",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE CACHE
// Drop a 200×200 PNG into public/bachelor-party-blitz/<name>.png, then add
// the name to IMAGE_NAMES below. The game falls back to the colored placeholder
// for any name not yet in the list. "jimmy" is the catcher image.
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_NAMES: string[] = [
  "money",      // ✅ provided
  "dreidel",    // ✅ provided
  "goth",       // ✅ provided
  "payment",    // ✅ provided
  "bill",       // ✅ provided
  "katie",      // ✅ provided
  "dumbbell",   // ✅ provided
  "mushroom",   // ✅ provided
  "jimmy",      // ✅ provided — catcher face
];

const imgCache = new Map<string, HTMLImageElement>();

// ─────────────────────────────────────────────────────────────────────────────
// OBJECT POOL
// Colored square placeholders — replaced automatically once a PNG is loaded.
// ─────────────────────────────────────────────────────────────────────────────

type CatchType =
  | "catch"
  | "dodge"
  | "mushroom"
  | "bill_trigger"
  | "bill_catch"
  | "bill_dodge";

type Behavior = "straight" | "erratic" | "accelerating";

interface ObjDef {
  type: string;
  emoji: string;
  label: string;
  color: string;
  behavior: Behavior;
  catchType: CatchType;
  speedMultiplier?: number;
}

// ── NORMAL MODE: catch these ─────────────────────────────────────────────────
const CATCH_POOL: ObjDef[] = [
  { type: "money",    emoji: "💰", label: "MONEY",   color: "#16a34a", behavior: "straight", catchType: "catch" },
  { type: "dreidel",  emoji: "🕎", label: "DREIDEL", color: "#7c3aed", behavior: "straight", catchType: "catch" },
  { type: "goth",     emoji: "🖤", label: "GOTH",    color: "#334155", behavior: "straight", catchType: "catch" },
];

// ── NORMAL MODE: dodge these ─────────────────────────────────────────────────
const KATIE_DEF: ObjDef = {
  type: "katie", emoji: "💃", label: "KATIE", color: "#ea580c", behavior: "erratic", catchType: "dodge", speedMultiplier: 1.85,
};

const DODGE_POOL: ObjDef[] = [
  { type: "dumbbell", emoji: "🏋️", label: "DUMBBELL", color: "#475569", behavior: "straight", catchType: "dodge" },
  { type: "payment",  emoji: "💳", label: "PAYMENT",  color: "#dc2626", behavior: "straight", catchType: "dodge" },
];

// ── SPECIALS: neutral objects that trigger a game mode when caught ────────────
const MUSHROOM_DEF: ObjDef = {
  type: "mushroom", emoji: "🍄", label: "SHROOM", color: "#db2777", behavior: "straight", catchType: "mushroom",
};

// Catching Bill activates Bill Mode — no score change, no life lost
const BILL_DEF: ObjDef = {
  type: "bill", emoji: "🧾", label: "BILL", color: "#f59e0b", behavior: "straight", catchType: "bill_trigger",
};

// ─────────────────────────────────────────────────────────────────────────────
// GAME STATE — all mutable sim data lives in a ref, never in React state
// ─────────────────────────────────────────────────────────────────────────────

interface FallingObj extends ObjDef {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GS {
  score: number;
  lives: number;
  bagMeter: number;       // 1.0–4.0, shown as multiplier
  speed: number;          // global scalar, grows over time
  elapsed: number;        // seconds since round start
  objs: FallingObj[];
  nextId: number;
  spawnTimer: number;
  cx: number;             // catcher center x
  cy: number;             // catcher center y (fixed near bottom)
  bachelor: boolean;
  bachelorTimer: number;
  bill: boolean;
  jimmyNoTimer: number;
  targetX: number;            // drag-to-follow: finger X position
  W: number;
  H: number;
  lastTs: number;
}

interface GameFx {
  onCatchSuccess: (modeActive: boolean) => void;
  onLifeLost: (modeActive: boolean) => void;
  onBachelorModeTriggered: () => void;
  onSpawn: (id: number) => void;
}

function reportBlitzRuntimeError(scope: string, error: unknown) {
  console.error(`[BachelorPartyBlitz] ${scope} failed`, error);
}

function makeGS(W: number, H: number): GS {
  return {
    score: 0, lives: 8, bagMeter: 1, speed: 1, elapsed: 0,
    objs: [], nextId: 0, spawnTimer: 1,
    cx: W / 2, cy: H - CATCHER_BOTTOM,
    bachelor: false, bachelorTimer: 0,
    bill: false,
    jimmyNoTimer: 0,
    targetX: W / 2,
    W, H, lastTs: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeObj(def: ObjDef, gs: GS): FallingObj {
  const speed = (BASE_FALL_SPEED + gs.elapsed * 3) * gs.speed * (def.speedMultiplier ?? 1);
  return {
    ...def,
    id: gs.nextId++,
    x: OBJ_SIZE + Math.random() * (gs.W - OBJ_SIZE * 2),
    y: -OBJ_SIZE / 2,
    vx: def.behavior === "erratic" ? (Math.random() - 0.5) * 120 : 0,
    vy: speed,
  };
}

function spawnObj(gs: GS): FallingObj {
  const r = Math.random();
  if (r < MUSHROOM_SPAWN_CHANCE) return makeObj(MUSHROOM_DEF, gs);
  if (r < MUSHROOM_SPAWN_CHANCE + BILL_SPAWN_CHANCE) return makeObj(BILL_DEF, gs);
  if (r < MUSHROOM_SPAWN_CHANCE + BILL_SPAWN_CHANCE + DODGE_SPAWN_CHANCE) return makeObj(pick(DODGE_POOL), gs);
  return makeObj(pick(CATCH_POOL), gs);
}

function triggerKatieWarning(gs: GS) {
  gs.jimmyNoTimer = KATIE_WARNING_DURATION;
  // Stagger Katie objects above the screen so they arrive a beat apart.
  for (let i = 1; i <= 3; i++) {
    const speed = (BASE_FALL_SPEED + gs.elapsed * 3) * gs.speed * 1.85;
    gs.objs.push({
      ...KATIE_DEF,
      id: gs.nextId++,
      x: OBJ_SIZE + Math.random() * (gs.W - OBJ_SIZE * 2),
      y: -OBJ_SIZE / 2 - i * 130,
      vx: (Math.random() - 0.5) * 120,
      vy: speed,
    });
  }
}

function loseLife(gs: GS, onGameOver: (score: number) => void) {
  gs.lives = Math.max(0, gs.lives - 1);
  gs.bagMeter = 1;
  if (gs.lives === 0) onGameOver(gs.score);
}

function onCatch(gs: GS, o: FallingObj, onGameOver: (score: number) => void, fx: GameFx) {
  const mult = gs.bill ? 3 : gs.bachelor ? 2 : 1;
  const modeAlreadyActive = gs.bill || gs.bachelor;

  switch (o.catchType) {
    case "catch":
      gs.score += Math.round(10 * mult * gs.bagMeter);
      gs.bagMeter = Math.min(4, gs.bagMeter + 0.2);
      fx.onCatchSuccess(modeAlreadyActive);
      break;
    case "dodge":
      loseLife(gs, onGameOver);
      fx.onLifeLost(modeAlreadyActive);
      break;
    case "mushroom":
      gs.bachelor = true;
      gs.bachelorTimer = BACHELOR_DURATION;
      gs.score += Math.round(50 * gs.bagMeter);
      fx.onBachelorModeTriggered();
      break;
    case "bill_trigger":
      // Neutral catch — no score, no life lost, just activates Bill Mode
      if (!gs.bill) {
        gs.bill = true;
        gs.objs = [];
      }
      break;
  }
}

function stepGS(gs: GS, dt: number, onGameOver: (score: number) => void, fx: GameFx) {
  gs.elapsed += dt;
  gs.speed = 1 + gs.elapsed * SPEED_RAMP;

  // Catcher movement — drag-to-follow; bachelor mode adds lag and jitter
  if (gs.bachelor) {
    gs.cx += (gs.targetX - gs.cx) * Math.min(1, 5 * dt) + (Math.random() - 0.5) * CATCHER_SPEED * 0.5 * dt;
  } else {
    gs.cx = gs.targetX;
  }
  gs.cx = Math.max(CATCHER_W / 2, Math.min(gs.W - CATCHER_W / 2, gs.cx));

  // Mode timers
  if (gs.bachelor) {
    gs.bachelorTimer -= dt;
    if (gs.bachelorTimer <= 0) { gs.bachelor = false; gs.bachelorTimer = 0; }
  }

  if (gs.jimmyNoTimer > 0) gs.jimmyNoTimer -= dt;

  if (gs.bill) return;

  // Spawn
  gs.spawnTimer -= dt;
  if (gs.spawnTimer <= 0) {
    const spawned = spawnObj(gs);
    gs.objs.push(spawned);
    fx.onSpawn(spawned.id);
    if (!gs.bill && Math.random() < 0.045) triggerKatieWarning(gs);
    gs.spawnTimer = Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - gs.elapsed * SPAWN_RAMP);
  }

  // Update objects
  const dead: number[] = [];
  for (const o of gs.objs) {
    switch (o.behavior) {
      case "erratic":
        o.vx += (Math.random() - 0.5) * (gs.bachelor ? 700 : 300) * dt;
        o.vx = Math.max(-220, Math.min(220, o.vx));
        if (gs.bachelor) { o.vy += (Math.random() - 0.5) * 120 * dt; o.vy = Math.max(60, o.vy); }
        break;
      case "accelerating":
        o.vy *= 1 + 0.9 * dt;
        break;
      case "straight":
        if (gs.bachelor) {
          o.vx += (Math.random() - 0.5) * 200 * dt;
          o.vx = Math.max(-160, Math.min(160, o.vx));
        }
        break;
    }
    o.x += o.vx * dt;
    o.y += o.vy * dt;

    // Wall bounce
    if (o.x < OBJ_SIZE / 2)        { o.x = OBJ_SIZE / 2;        o.vx = Math.abs(o.vx); }
    if (o.x > gs.W - OBJ_SIZE / 2) { o.x = gs.W - OBJ_SIZE / 2; o.vx = -Math.abs(o.vx); }

    if (o.y > gs.H + OBJ_SIZE) { dead.push(o.id); continue; }

    // Collision — hitbox is larger than visual for forgiving mobile feel
    const hitW = (CATCHER_W + OBJ_SIZE) * HIT_SLOP * 0.5;
    const hitH = (CATCHER_H + OBJ_SIZE) * HIT_SLOP * 0.5;
    if (Math.abs(o.x - gs.cx) < hitW && Math.abs(o.y - gs.cy) < hitH) {
      dead.push(o.id);
      onCatch(gs, o, onGameOver, fx);
    }
  }
  gs.objs = gs.objs.filter(o => !dead.includes(o.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────────────────────

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function borderColor(catchType: CatchType): string | null {
  if (catchType === "catch" || catchType === "bill_catch") return "#22c55e";
  if (catchType === "dodge" || catchType === "bill_dodge") return "#ef4444";
  return null;
}

function prefersEmojiRender(type: string): boolean {
  return type === "money";
}

function drawObj(ctx: CanvasRenderingContext2D, o: FallingObj, bachelor: boolean, poppingIn: boolean) {
  const border = borderColor(o.catchType);
  const img = imgCache.get(o.type);
  const scale = poppingIn ? 0.88 + Math.min(0.18, Math.max(0, (o.y + OBJ_SIZE / 2) / 120) * 0.18) : 1;
  const drawW = Math.round(OBJ_SIZE * scale);
  const drawH = Math.round(OBJ_SIZE * scale);
  const drawX = Math.round(o.x - drawW / 2);
  const drawY = Math.round(o.y - drawH / 2);

  ctx.save();

  if (img && !prefersEmojiRender(o.type)) {
    if (bachelor) { ctx.shadowColor = o.color; ctx.shadowBlur = 20; }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.shadowBlur = 0;
    if (border) {
      rr(ctx, drawX, drawY, drawW, drawH, 12);
      ctx.strokeStyle = border;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Colored placeholder — used until a real PNG is loaded
  if (bachelor) { ctx.shadowColor = o.color; ctx.shadowBlur = 20; }
  rr(ctx, drawX, drawY, drawW, drawH, 12);
  ctx.fillStyle = o.color;
  ctx.fill();
  ctx.strokeStyle = border ?? "rgba(255,255,255,0.45)";
  ctx.lineWidth = border ? 4 : 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.font = `${Math.round(OBJ_SIZE * 0.44)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(o.emoji, o.x, o.y - 8);

  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(o.label, o.x, o.y + OBJ_SIZE * 0.32);
  ctx.restore();
}

function drawCatcher(ctx: CanvasRenderingContext2D, gs: GS) {
  const img = imgCache.get("jimmy");
  if (img) {
    if (gs.bachelor) { ctx.shadowColor = "#ff00ff"; ctx.shadowBlur = 30; }
    ctx.drawImage(
      img,
      Math.round(gs.cx - CATCHER_W / 2),
      Math.round(gs.cy - CATCHER_H / 2),
      CATCHER_W,
      CATCHER_H,
    );
    ctx.shadowBlur = 0;
    return;
  }

  // Colored placeholder — used until jimmy.png is loaded
  const x = gs.cx - CATCHER_W / 2;
  const y = gs.cy - CATCHER_H / 2;
  const b = gs.bachelor;

  if (b) { ctx.shadowColor = "#ff00ff"; ctx.shadowBlur = 30; }
  rr(ctx, x, y, CATCHER_W, CATCHER_H, 14);
  ctx.fillStyle = b ? "#c026d3" : "#064789";
  ctx.fill();
  ctx.strokeStyle = b ? "#f0abfc" : "#7dd3fc";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("JIMMY", gs.cx, gs.cy);
}

function drawHUD(ctx: CanvasRenderingContext2D, gs: GS) {
  const { W, bill, bachelor } = gs;
  const hudH = 88;
  const compact = W < 390;

  ctx.fillStyle = "rgba(7,18,41,0.94)";
  ctx.fillRect(0, 0, W, hudH);

  // bottom accent line on HUD
  ctx.fillStyle = bachelor ? "#facc15" : bill ? "#fbbf24" : "#064789";
  ctx.fillRect(0, hudH, W, 3);

  // Score
  ctx.font = "bold 10px sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SCORE", 14, 16);
  ctx.font = `bold ${compact ? 22 : 26}px sans-serif`;
  ctx.fillStyle = bachelor ? "#facc15" : "#fff";
  ctx.fillText(String(gs.score), 14, 38);

  // BR multiplier
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("BR MULT", 14, 66);
  ctx.font = `bold ${compact ? 18 : 20}px sans-serif`;
  ctx.fillStyle = gs.bagMeter >= 3 ? "#22c55e" : "#94a3b8";
  const bmDisplay = Number.isInteger(gs.bagMeter) ? `${gs.bagMeter}x` : `${gs.bagMeter.toFixed(1)}x`;
  ctx.fillText(bmDisplay, compact ? 88 : 110, 66);

  // Lives on a dedicated right lane to avoid crowding the center mode label.
  ctx.font = "bold 10px sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "right";
  ctx.fillText("LIVES", W - 12, 16);
  ctx.font = `${compact ? 14 : 16}px serif`;
  for (let i = 0; i < gs.lives; i++) ctx.fillText("🍺", W - 12 - i * (compact ? 20 : 22), 42);

  // Center mode labels get their own lower lane so they don't collide with score/lives.
  if (bill) {
    ctx.font = `bold ${compact ? 12 : 14}px sans-serif`;
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.fillText("BILL MODE", W / 2, 20);
    ctx.font = `${compact ? 10 : 11}px sans-serif`;
    ctx.fillStyle = "#fde68a";
    ctx.fillText("BUST IT DOWN", W / 2, 66);
  } else if (bachelor) {
    ctx.font = `bold ${compact ? 12 : 14}px sans-serif`;
    ctx.fillStyle = "#facc15";
    ctx.textAlign = "center";
    ctx.fillText(`BACHELOR ${Math.ceil(gs.bachelorTimer)}s`, W / 2, 20);
    ctx.font = `${compact ? 10 : 11}px sans-serif`;
    ctx.fillStyle = "#e879f9";
    ctx.fillText("2X POINTS", W / 2, 66);
  }
}

function drawBg(ctx: CanvasRenderingContext2D, gs: GS) {
  const { W, H, bachelor } = gs;

  if (bachelor) {
    const t = performance.now() / 1000;
    const r = Math.round(12 + 8 * Math.sin(t * 1.3));
    const g = Math.round(4 + 4 * Math.sin(t * 1.7 + 2));
    const b = Math.round(18 + 12 * Math.sin(t * 2.1 + 4));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, W, H);
    const nr = Math.round(200 + 55 * Math.sin(t * 1.3));
    const ng = Math.round(50 + 50 * Math.sin(t * 1.7 + 2));
    const nb = Math.round(200 + 55 * Math.sin(t * 2.1 + 4));
    ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.18)`;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 38) { ctx.beginPath(); ctx.moveTo(x, 75); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 75; y < H; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(100,116,139,0.09)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 75); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 75; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, gs: GS, spawnPopIds: Set<number>) {
  drawBg(ctx, gs);
  for (const o of gs.objs) drawObj(ctx, o, gs.bachelor, spawnPopIds.has(o.id));
  drawCatcher(ctx, gs);
  drawHUD(ctx, gs);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT — edit these without touching game logic
// ─────────────────────────────────────────────────────────────────────────────

type SplashCredit =
  | { type: "text"; text: string }
  | { type: "image"; src: string; alt: string };

const SPLASH_CREDITS: SplashCredit[] = [
  { type: "image", src: "/bachelor-party-blitz/vjspice.png",  alt: "VJ Spice Productions" },
  { type: "image", src: "/bachelor-party-blitz/zimmy.png",    alt: "Sponsored by Zimmy's Head" },
  { type: "image", src: BR_STUDIOS_CARD_SRC, alt: "BR Studios" },
];

const END_QUOTE_LINE = "If you can dodge a wrench, you can dodge a ball. Try again qu33rbag";

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type Screen = "splash" | "playing" | "end";
type BillStage = "idle" | "dialogue" | "chug" | "postChug" | "doorIntro" | "door" | "result";

interface CatchBurst {
  id: number;
  x: number;
  y: number;
}

interface FlybyState {
  id: number;
  active: boolean;
  top: number;
  size: number;
  durationMs: number;
  fromLeft: boolean;
  rotate: number;
}

interface MusicController {
  play: () => number | undefined;
  pause: () => void;
  stop: () => void;
  unload: () => void;
  playing: () => boolean;
}

interface BachelorPartyGameProps {
  debugBill?: boolean;
}

export function BachelorPartyGame({ debugBill = false }: BachelorPartyGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playfieldRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);
  const bachelorAuraRef = useRef<HTMLDivElement>(null);
  const katieWarningRef = useRef<HTMLDivElement>(null);
  const bachelorBannerRef = useRef<HTMLDivElement>(null);
  const billWineRef = useRef<HTMLDivElement>(null);
  const billBeerRackRef = useRef<HTMLDivElement>(null);
  const billDoorRef = useRef<HTMLButtonElement>(null);
  const catcherFxRef = useRef<HTMLDivElement>(null);
  const gsRef = useRef<GS | null>(null);
  const rafRef = useRef<number>(0);
  const musicRef = useRef<MusicController | null>(null);
  const bachelorUiRef = useRef(false);
  const billUiRef = useRef(false);
  const warningUiRef = useRef(false);
  const bachelorBannerTimeoutRef = useRef<number | null>(null);
  const musicEnabledRef = useRef(false);
  const billStageTimeoutRef = useRef<number | null>(null);
  const billDoorIntervalRef = useRef<number | null>(null);
  const billBlackoutTimeoutRef = useRef<number | null>(null);
  const billBlackoutResetRef = useRef<number | null>(null);
  const shakeResetTimeoutRef = useRef<number | null>(null);
  const billDoorTapsRef = useRef(0);
  const catchBurstIdRef = useRef(0);
  const flybyTimeoutRef = useRef<number | null>(null);
  const flybyIdRef = useRef(0);
  const spawnPopIdsRef = useRef<Set<number>>(new Set());

  const [screen, setScreen] = useState<Screen>("splash");
  const [splashIdx, setSplashIdx] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [playerName, setPlayerName] = useState("I LUV JIMMY");
  const [personalBest, setPersonalBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem("blitz_best") || "0", 10);
  });
  const [isBachelorMode, setIsBachelorMode] = useState(false);
  const [isBillMode, setIsBillMode] = useState(false);
  const [showKatieWarning, setShowKatieWarning] = useState(false);
  const [showBachelorBanner, setShowBachelorBanner] = useState(false);
  const [billStage, setBillStage] = useState<BillStage>("idle");
  const [billDialogueIndex, setBillDialogueIndex] = useState(0);
  const [billPostChugIndex, setBillPostChugIndex] = useState(0);
  const [billBeerCount, setBillBeerCount] = useState(0);
  const [billDoorTimeLeft, setBillDoorTimeLeft] = useState(BILL_DOOR_DURATION_MS);
  const [billDoorTaps, setBillDoorTaps] = useState(0);
  const [billResult, setBillResult] = useState<{ success: boolean; bonus: number } | null>(null);
  const [billBlackout, setBillBlackout] = useState(false);
  const [catchBursts, setCatchBursts] = useState<CatchBurst[]>([]);
  const [flyby, setFlyby] = useState<FlybyState | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);

  useEffect(() => {
    console.debug("[BachelorPartyBlitz] Background music placeholder:", BACKGROUND_MUSIC_PLACEHOLDER);
  }, []);

  useEffect(() => {
    if (musicRef.current) return;

    try {
      if (typeof window.Howl === "function") {
        musicRef.current = new window.Howl({
          src: [BACKGROUND_MUSIC_PLACEHOLDER],
          loop: true,
          volume: 0.38,
          html5: true,
          preload: true,
          onloaderror: (_id, error) => {
            console.warn("[BachelorPartyBlitz] Background music failed to load.", error);
          },
          onplayerror: (_id, error) => {
            console.warn("[BachelorPartyBlitz] Background music failed to play.", error);
          },
        });
      }
    } catch (error) {
      reportBlitzRuntimeError("Howler setup", error);
    }
  }, []);

  useEffect(() => () => {
    if (bachelorBannerTimeoutRef.current) window.clearTimeout(bachelorBannerTimeoutRef.current);
    if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
    if (billDoorIntervalRef.current) window.clearInterval(billDoorIntervalRef.current);
    if (billBlackoutTimeoutRef.current) window.clearTimeout(billBlackoutTimeoutRef.current);
    if (billBlackoutResetRef.current) window.clearTimeout(billBlackoutResetRef.current);
    if (shakeResetTimeoutRef.current) window.clearTimeout(shakeResetTimeoutRef.current);
    if (flybyTimeoutRef.current) window.clearTimeout(flybyTimeoutRef.current);
    musicRef.current?.stop();
    musicRef.current?.unload();
  }, []);

  // Preload PNGs listed in IMAGE_NAMES
  useEffect(() => {
    for (const name of IMAGE_NAMES) {
      if (imgCache.has(name)) continue;
      const img = new window.Image();
      img.src = `/bachelor-party-blitz/${name}.png`;
      img.onload = () => imgCache.set(name, img);
    }
  }, []);

  // Canvas resize
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      const gs = gsRef.current;
      if (gs) { gs.W = c.width; gs.H = c.height; gs.cy = c.height - CATCHER_BOTTOM; }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Splash auto-advance
  useEffect(() => {
    if (screen !== "splash") return;
    if (splashIdx >= SPLASH_CREDITS.length) return;
    const t = setTimeout(() => setSplashIdx(i => i + 1), SPLASH_CARD_DURATION_MS);
    return () => clearTimeout(t);
  }, [screen, splashIdx]);

  // Prevent scroll only during live gameplay. Locking touchmove during splash/end
  // breaks Safari/Chrome interactions when the browser chrome changes viewport height.
  useEffect(() => {
    if (screen !== "playing") return;

    const prevent = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, [screen]);

  const handleGameOver = useCallback((score: number) => {
    const prev = parseInt(localStorage.getItem("blitz_best") || "0", 10);
    if (score > prev) {
      localStorage.setItem("blitz_best", String(score));
      setPersonalBest(score);
    }
    if (navigator.vibrate) navigator.vibrate(200);
    setFinalScore(score);
    setScreen("end");
  }, []);

  const runMusic = useCallback((shouldPlay: boolean) => {
    const music = musicRef.current;
    if (!music) return;

    try {
      if (shouldPlay) {
        if (!musicEnabledRef.current) return;
        if (!music.playing()) music.play();
        return;
      }

      if (music.playing()) {
        music.pause();
      }
    } catch (error) {
      reportBlitzRuntimeError("Music playback", error);
    }
  }, []);

  const ensureMusicReady = useCallback(() => {
    if (musicRef.current) return musicRef.current;

    try {
      if (typeof window.Howl === "function") {
        musicRef.current = new window.Howl({
          src: [BACKGROUND_MUSIC_PLACEHOLDER],
          loop: true,
          volume: 0.38,
          html5: true,
          preload: true,
          onloaderror: (_id, error) => {
            console.warn("[BachelorPartyBlitz] Background music failed to load.", error);
          },
          onplayerror: (_id, error) => {
            console.warn("[BachelorPartyBlitz] Background music failed to play.", error);
          },
        });
        return musicRef.current;
      }

      const audio = new window.Audio(BACKGROUND_MUSIC_PLACEHOLDER);
      audio.loop = true;
      audio.volume = 0.38;
      audio.preload = "auto";
      musicRef.current = {
        play: () => {
          void audio.play();
          return 0;
        },
        pause: () => audio.pause(),
        stop: () => {
          audio.pause();
          audio.currentTime = 0;
        },
        unload: () => {
          audio.pause();
          audio.src = "";
        },
        playing: () => !audio.paused,
      };
      return musicRef.current;
    } catch (error) {
      reportBlitzRuntimeError("Music controller setup", error);
      return null;
    }
  }, []);

  const runVibrate = useCallback((pattern: number | number[]) => {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    navigator.vibrate(pattern);
  }, []);

  const emitCatchBurst = useCallback(() => {
    const gs = gsRef.current;
    if (!gs) return;

    const id = catchBurstIdRef.current++;
    const burst = { id, x: gs.cx, y: gs.cy - 12 };
    setCatchBursts(current => [...current, burst]);
    window.setTimeout(() => {
      setCatchBursts(current => current.filter(entry => entry.id !== id));
    }, 520);
  }, []);

  useEffect(() => {
    if (screen !== "playing" || isBillMode) {
      if (flybyTimeoutRef.current) window.clearTimeout(flybyTimeoutRef.current);
      return;
    }

    const scheduleFlyby = () => {
      const nextDelay = 14000 + Math.random() * 18000;
      flybyTimeoutRef.current = window.setTimeout(() => {
        const durationMs = 6500 + Math.random() * 2500;
        const nextFlyby: FlybyState = {
          id: flybyIdRef.current++,
          active: false,
          top: 12 + Math.random() * 56,
          size: 120 + Math.random() * 70,
          durationMs,
          fromLeft: Math.random() > 0.5,
          rotate: -12 + Math.random() * 24,
        };
        setFlyby(nextFlyby);
        window.setTimeout(() => {
          setFlyby(current => (current && current.id === nextFlyby.id ? { ...current, active: true } : current));
        }, 40);
        flybyTimeoutRef.current = window.setTimeout(() => {
          setFlyby(current => (current && current.id === nextFlyby.id ? null : current));
          scheduleFlyby();
        }, durationMs + 180);
      }, nextDelay);
    };

    scheduleFlyby();

    return () => {
      if (flybyTimeoutRef.current) window.clearTimeout(flybyTimeoutRef.current);
    };
  }, [isBillMode, screen]);

  const shakeScreen = useCallback(() => {
    const gsap = window.gsap;
    const el = playfieldRef.current;
    if (!gsap || !el) return;

    if (shakeResetTimeoutRef.current) window.clearTimeout(shakeResetTimeoutRef.current);
    gsap.set(el, { x: 0, y: 0, rotation: 0 });
    const tween = gsap.fromTo(
      el,
      { x: -10, y: 0, rotate: -0.4 },
      { x: 10, y: 0, rotate: 0.4, duration: 0.08, repeat: 3, yoyo: true, ease: "sine.inOut" },
    );
    shakeResetTimeoutRef.current = window.setTimeout(() => {
      tween?.kill?.();
      gsap.set(el, { x: 0, y: 0, rotation: 0, clearProps: "transform" });
    }, 430);
  }, []);

  const wobbleCatcherFx = useCallback(() => {
    const gsap = window.gsap;
    const el = catcherFxRef.current;
    if (!gsap || !el) return;

    const tween = gsap.fromTo(
      el,
      { scale: 0.95, rotate: -5, opacity: 0.18 },
      { scale: 1.18, rotate: 5, opacity: 0.52, duration: 0.14, repeat: 1, yoyo: true, ease: "back.out(1.6)" },
    );
    window.setTimeout(() => tween?.kill?.(), 380);
  }, []);

  const handleCatchSuccessFx = useCallback((modeActive: boolean) => {
    if (!modeActive) {
      runVibrate(50);
      wobbleCatcherFx();
      emitCatchBurst();
    }
  }, [emitCatchBurst, runVibrate, wobbleCatcherFx]);

  const handleLifeLostFx = useCallback((modeActive: boolean) => {
    if (!modeActive) {
      runVibrate([50, 70, 50]);
      shakeScreen();
    }
  }, [runVibrate, shakeScreen]);

  const handleBachelorModeTriggeredFx = useCallback(() => {
    runVibrate([30, 40, 30, 40, 30]);
  }, [runVibrate]);

  const handleSpawnFx = useCallback((id: number) => {
    spawnPopIdsRef.current.add(id);
    window.setTimeout(() => {
      spawnPopIdsRef.current.delete(id);
    }, 260);
  }, []);

  const clearBillTimers = useCallback(() => {
    if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
    if (billDoorIntervalRef.current) window.clearInterval(billDoorIntervalRef.current);
    if (billBlackoutTimeoutRef.current) window.clearTimeout(billBlackoutTimeoutRef.current);
    if (billBlackoutResetRef.current) window.clearTimeout(billBlackoutResetRef.current);
    billStageTimeoutRef.current = null;
    billDoorIntervalRef.current = null;
    billBlackoutTimeoutRef.current = null;
    billBlackoutResetRef.current = null;
  }, []);

  const exitBillMode = useCallback(() => {
    clearBillTimers();
    const gs = gsRef.current;
    if (gs) gs.bill = false;
    billUiRef.current = false;
    setIsBillMode(false);
    setBillStage("idle");
    setBillDialogueIndex(0);
    setBillPostChugIndex(0);
    setBillBeerCount(0);
    setBillDoorTaps(0);
    setBillDoorTimeLeft(BILL_DOOR_DURATION_MS);
    setBillResult(null);
    setBillBlackout(false);
    billDoorTapsRef.current = 0;
  }, [clearBillTimers]);

  const initializeBillMode = useCallback(() => {
    clearBillTimers();
    setBillStage("dialogue");
    setBillDialogueIndex(0);
    setBillPostChugIndex(0);
    setBillBeerCount(0);
    setBillDoorTaps(0);
    setBillDoorTimeLeft(BILL_DOOR_DURATION_MS);
    setBillResult(null);
    setBillBlackout(false);
    billDoorTapsRef.current = 0;
  }, [clearBillTimers]);

  const resolveBillDoor = useCallback((taps: number) => {
    clearBillTimers();
    const success = taps >= BILL_DOOR_TARGET_TAPS;
    const bonus = success ? 300 + Math.max(0, taps - BILL_DOOR_TARGET_TAPS) * 25 : 0;

    if (success) {
      const gs = gsRef.current;
      if (gs) gs.score += bonus;
      runVibrate(100);
    } else {
      const gs = gsRef.current;
      if (gs) {
        gs.lives = Math.max(0, gs.lives - 1);
        gs.bagMeter = 1;
        if (gs.lives === 0) {
          handleGameOver(gs.score);
          return;
        }
      }
    }

    setBillResult({ success, bonus });
    setBillStage("result");
    setBillBlackout(true);
    billBlackoutResetRef.current = window.setTimeout(() => setBillBlackout(false), BILL_BLACKOUT_FLASH_MS);
    billStageTimeoutRef.current = window.setTimeout(() => {
      setBillBlackout(true);
      billBlackoutResetRef.current = window.setTimeout(() => {
        setBillBlackout(false);
        exitBillMode();
      }, BILL_BLACKOUT_FLASH_MS);
    }, BILL_RESULT_HOLD_MS);
  }, [clearBillTimers, exitBillMode, handleGameOver, runVibrate]);

  // Game loop
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = (ts: number) => {
      const gs = gsRef.current;
      if (!gs) return;
      const dt = gs.lastTs === 0 ? 0.016 : Math.min((ts - gs.lastTs) / 1000, 0.05);
      gs.lastTs = ts;
      stepGS(gs, dt, handleGameOver, {
        onCatchSuccess: handleCatchSuccessFx,
        onLifeLost: handleLifeLostFx,
        onBachelorModeTriggered: handleBachelorModeTriggeredFx,
        onSpawn: handleSpawnFx,
      });

      if (gs.bachelor !== bachelorUiRef.current) {
        bachelorUiRef.current = gs.bachelor;
        setIsBachelorMode(gs.bachelor);
        if (gs.bachelor) {
          setShowBachelorBanner(true);
          if (bachelorBannerTimeoutRef.current) window.clearTimeout(bachelorBannerTimeoutRef.current);
          bachelorBannerTimeoutRef.current = window.setTimeout(() => setShowBachelorBanner(false), BACHELOR_BANNER_DURATION_MS);
        } else {
          setShowBachelorBanner(false);
        }
      }

      if (gs.bill !== billUiRef.current) {
        billUiRef.current = gs.bill;
        setIsBillMode(gs.bill);
        if (gs.bill) initializeBillMode();
      }

      const warningActive = gs.jimmyNoTimer > 0;
      if (warningActive !== warningUiRef.current) {
        warningUiRef.current = warningActive;
        setShowKatieWarning(warningActive);
      }

      if (catcherFxRef.current) {
        catcherFxRef.current.style.left = `${gs.cx - CATCHER_W / 2}px`;
        catcherFxRef.current.style.top = `${gs.cy - CATCHER_H / 2}px`;
      }

      drawFrame(ctx, gs, spawnPopIdsRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, handleGameOver, handleCatchSuccessFx, handleLifeLostFx, handleBachelorModeTriggeredFx, handleSpawnFx, initializeBillMode]);

  useEffect(() => {
    const shouldPlay = screen === "playing" && !isBillMode;
    runMusic(shouldPlay);
  }, [isBillMode, runMusic, screen]);

  useEffect(() => {
    if (!isBillMode || billStage !== "dialogue") return;

    billStageTimeoutRef.current = window.setTimeout(() => {
      if (billDialogueIndex < BILL_DIALOGUES.length - 1) {
        setBillDialogueIndex(index => index + 1);
        return;
      }
      setBillStage("chug");
      setBillBeerCount(1);
    }, BILL_DIALOGUE_DURATIONS_MS[billDialogueIndex] ?? BILL_DIALOGUE_DURATIONS_MS[BILL_DIALOGUE_DURATIONS_MS.length - 1]);

    return () => {
      if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
    };
  }, [billDialogueIndex, billStage, isBillMode]);

  useEffect(() => {
    if (!isBillMode || billStage !== "chug") return;

    if (billBeerCount === 0) {
      billStageTimeoutRef.current = window.setTimeout(() => setBillBeerCount(1), BILL_FIRST_BEER_DURATION_MS);
      return () => {
        if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
      };
    }

    if (billBeerCount < BILL_BEER_TOTAL) {
      billStageTimeoutRef.current = window.setTimeout(
        () => setBillBeerCount(count => Math.min(BILL_BEER_TOTAL, count + 1)),
        BILL_RAPID_BEER_DURATION_MS,
      );
      return () => {
        if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
      };
    }

    billStageTimeoutRef.current = window.setTimeout(() => {
      setBillStage("postChug");
      setBillPostChugIndex(0);
    }, 850);

    return () => {
      if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
    };
  }, [billBeerCount, billStage, isBillMode]);

  useEffect(() => {
    if (!isBillMode || billStage !== "postChug") return;

    billStageTimeoutRef.current = window.setTimeout(() => {
      if (billPostChugIndex < BILL_POST_CHUG_DIALOGUES.length - 1) {
        setBillPostChugIndex(index => index + 1);
        return;
      }

      setBillStage("doorIntro");
      setBillDoorTimeLeft(BILL_DOOR_DURATION_MS);
      setBillDoorTaps(0);
      billDoorTapsRef.current = 0;
    }, BILL_POST_CHUG_DIALOGUE_DURATION_MS);

    return () => {
      if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
    };
  }, [billPostChugIndex, billStage, isBillMode]);

  useEffect(() => {
    if (!isBillMode || billStage !== "doorIntro") return;

    billStageTimeoutRef.current = window.setTimeout(() => {
      setBillStage("door");
      setBillDoorTimeLeft(BILL_DOOR_DURATION_MS);
    }, BILL_DOOR_INTRO_DURATION_MS);

    return () => {
      if (billStageTimeoutRef.current) window.clearTimeout(billStageTimeoutRef.current);
    };
  }, [billStage, isBillMode]);

  useEffect(() => {
    if (!isBillMode || billStage !== "door") return;

    const startedAt = performance.now();
    billDoorIntervalRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const nextTimeLeft = Math.max(0, BILL_DOOR_DURATION_MS - elapsed);
      setBillDoorTimeLeft(nextTimeLeft);
      if (nextTimeLeft <= 0) resolveBillDoor(billDoorTapsRef.current);
    }, 50);

    return () => {
      if (billDoorIntervalRef.current) window.clearInterval(billDoorIntervalRef.current);
    };
  }, [billStage, isBillMode, resolveBillDoor]);

  // Touch input (only during gameplay)
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sync = (e: TouchEvent) => {
      e.preventDefault();
      const gs = gsRef.current;
      if (!gs) return;
      if (e.touches.length > 0) gs.targetX = e.touches[0].clientX;
    };

    canvas.addEventListener("touchstart", sync, { passive: false });
    canvas.addEventListener("touchmove", sync, { passive: false });
    canvas.addEventListener("touchend", sync, { passive: false });
    canvas.addEventListener("touchcancel", sync, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", sync);
      canvas.removeEventListener("touchmove", sync);
      canvas.removeEventListener("touchend", sync);
      canvas.removeEventListener("touchcancel", sync);
    };
  }, [screen]);

  const startGame = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    gsRef.current = makeGS(c.width, c.height);
    if (debugBill && gsRef.current) gsRef.current.bill = true;
    musicEnabledRef.current = audioEnabled;
    if (audioEnabled) {
      ensureMusicReady();
      runMusic(true);
    }
    setScreen("playing");
  }, [audioEnabled, debugBill, ensureMusicReady, runMusic]);

  const skipIntro = useCallback((event?: ReactMouseEvent) => {
    event?.stopPropagation();
    setSplashIdx(SPLASH_CREDITS.length);
  }, []);

  const handleAudioToggle = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    setAudioEnabled(current => {
      const next = !current;
      const music = ensureMusicReady();

      if (next) {
        musicEnabledRef.current = true;
        try {
          music?.stop();
          music?.play();
        } catch (error) {
          reportBlitzRuntimeError("Immediate audio toggle play", error);
        }
      } else {
        musicEnabledRef.current = false;
        runMusic(false);
        music?.stop();
      }

      return next;
    });
  }, [ensureMusicReady, runMusic]);

  const playAgain = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    gsRef.current = makeGS(c.width, c.height);
    if (debugBill && gsRef.current) gsRef.current.bill = true;
    setFinalScore(0);
    bachelorUiRef.current = false;
    billUiRef.current = false;
    warningUiRef.current = false;
    setIsBachelorMode(false);
    setIsBillMode(false);
    setShowKatieWarning(false);
    setShowBachelorBanner(false);
    exitBillMode();
    musicEnabledRef.current = audioEnabled;
    if (audioEnabled) {
      ensureMusicReady();
      runMusic(true);
    }
    setScreen("playing");
  }, [audioEnabled, debugBill, ensureMusicReady, exitBillMode, runMusic]);

  const advanceSplash = useCallback(() => {
    if (screen !== "splash") return;
    setSplashIdx(index => Math.min(index + 1, SPLASH_CREDITS.length));
  }, [screen]);

  const isNewBest = finalScore > 0 && finalScore >= personalBest;

  const advanceBillDialogue = useCallback(() => {
    if (!isBillMode) return;

    if (billStage === "postChug") {
      if (billPostChugIndex < BILL_POST_CHUG_DIALOGUES.length - 1) {
        setBillPostChugIndex(index => index + 1);
        return;
      }

      setBillStage("doorIntro");
      setBillDoorTimeLeft(BILL_DOOR_DURATION_MS);
      setBillDoorTaps(0);
      billDoorTapsRef.current = 0;
      return;
    }

    if (billStage !== "dialogue") return;

    if (billDialogueIndex < BILL_DIALOGUES.length - 1) {
      setBillDialogueIndex(index => index + 1);
      return;
    }

    setBillStage("chug");
    setBillBeerCount(0);
  }, [billDialogueIndex, billPostChugIndex, billStage, isBillMode]);

  const handleBillDoorTap = useCallback(() => {
    if (!isBillMode || billStage !== "door") return;
    setBillDoorTaps(current => {
      const next = current + 1;
      billDoorTapsRef.current = next;
      return next;
    });
  }, [billStage, isBillMode]);

  useEffect(() => {
    if (!isBillMode || billStage !== "door") return;

    const isInsideDoor = (clientX: number, clientY: number) => {
      const rect = billDoorRef.current?.getBoundingClientRect();
      if (!rect) return false;
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !isInsideDoor(touch.clientX, touch.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
      handleBillDoorTap();
    };

    const onMouseDown = (event: MouseEvent) => {
      if (!isInsideDoor(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
      handleBillDoorTap();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
    document.addEventListener("mousedown", onMouseDown, { passive: false, capture: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [billStage, handleBillDoorTap, isBillMode]);

  useEffect(() => {
    const el = wrapperRef.current;
    const gsap = window.gsap;
    if (!el || !gsap || screen !== "playing") return;

    const billAfterDrinks = isBillMode && (billStage === "door" || billStage === "result");

    if (billAfterDrinks) {
      const swayTween = gsap.to(el, {
        duration: 2.4,
        x: 10,
        rotation: 0.7,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        transformOrigin: "center center",
      });
      const filterTween = gsap.to(el, {
        duration: 2,
        filter: "blur(1px) saturate(0.92)",
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      return () => {
        swayTween?.kill?.();
        filterTween?.kill?.();
        gsap.set(el, { clearProps: "filter,transform" });
      };
    }

    if (!isBachelorMode) {
      gsap.to(el, {
        duration: 0.35,
        filter: "hue-rotate(0deg) saturate(1) blur(0px)",
        scale: 1,
        ease: "power2.out",
      });
      return;
    }

    const hueTween = gsap.to(el, {
      duration: 8,
      filter: "blur(0.6px) saturate(1.08)",
      ease: "none",
      repeat: -1,
    });
    const breatheTween = gsap.to(el, {
      duration: 2.1,
      scale: 1.028,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
      transformOrigin: "center center",
    });

    return () => {
      hueTween?.kill?.();
      breatheTween?.kill?.();
      gsap.set(el, { clearProps: "filter,transform" });
    };
  }, [billStage, isBachelorMode, isBillMode, screen]);

  useEffect(() => {
    const el = bachelorAuraRef.current;
    const gsap = window.gsap;
    if (!el || !gsap || !isBachelorMode || isBillMode || screen !== "playing") return;

    const hueTween = gsap.to(el, {
      duration: 5.2,
      filter: "hue-rotate(360deg) saturate(1.5) contrast(1.08)",
      ease: "none",
      repeat: -1,
    });
    const pulseTween = gsap.to(el, {
      duration: 1.6,
      scale: 1.08,
      opacity: 0.92,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
      transformOrigin: "center center",
    });

    return () => {
      hueTween?.kill?.();
      pulseTween?.kill?.();
      gsap.set(el, { clearProps: "filter,transform,opacity" });
    };
  }, [isBachelorMode, isBillMode, screen]);

  useEffect(() => {
    const particlesNode = particlesRef.current;
    if (!particlesNode) return;
    particlesNode.innerHTML = "";

    if (!isBachelorMode || isBillMode || typeof window.particlesJS !== "function") return;

    try {
      window.particlesJS(PARTICLES_CONTAINER_ID, {
        particles: {
          number: { value: 70, density: { enable: true, value_area: 900 } },
          color: { value: ["#22d3ee", "#f472b6", "#fde047", "#a78bfa"] },
          shape: { type: "circle" },
          opacity: { value: 0.55, random: true },
          size: { value: 3.8, random: true },
          line_linked: { enable: false },
          move: {
            enable: true,
            speed: 1.8,
            direction: "top",
            random: true,
            straight: false,
            out_mode: "out",
          },
        },
        interactivity: {
          detect_on: "canvas",
          events: {
            onhover: { enable: false, mode: "grab" },
            onclick: { enable: false, mode: "push" },
            resize: true,
          },
        },
        retina_detect: true,
      });
    } catch (error) {
      reportBlitzRuntimeError("Particles setup", error);
    }

    return () => {
      try {
        const instances = window.pJSDom ?? [];
        const latest = instances[instances.length - 1];
        latest?.pJS?.fn?.vendors?.destroypJS?.();
      } catch (error) {
        reportBlitzRuntimeError("Particles cleanup", error);
      }
      particlesNode.innerHTML = "";
    };
  }, [isBachelorMode, isBillMode]);

  useEffect(() => {
    const el = katieWarningRef.current;
    const gsap = window.gsap;
    if (!el || !showKatieWarning) return;

    el.textContent = "KP INBOUND - HIDE!";
    try {
      window.Splitting?.({ target: el, by: "chars" });
    } catch (error) {
      reportBlitzRuntimeError("Katie warning splitting", error);
      return;
    }
    const chars = el.querySelectorAll(".char");

    if (!chars.length || !gsap) return;

    let timeline: ReturnType<NonNullable<typeof window.gsap>["timeline"]> | undefined;
    try {
      gsap.set(chars, { opacity: 0, y: 18, rotate: 0, scale: 0.88 });
      timeline = gsap.timeline();
      timeline.fromTo(
        chars,
        { opacity: 0, y: 18, rotate: 0, scale: 0.88 },
        {
          opacity: 1,
          y: 0,
          rotate: () => (Math.random() - 0.5) * 12,
          scale: 1,
          duration: 0.35,
          stagger: 0.018,
          ease: "back.out(1.7)",
        },
      );
      timeline.to(chars, {
        y: () => (Math.random() - 0.5) * 18,
        rotate: () => (Math.random() - 0.5) * 28,
        duration: 0.24,
        stagger: 0.012,
        ease: "power2.out",
      });
    } catch (error) {
      reportBlitzRuntimeError("Katie warning animation", error);
    }

    return () => timeline?.kill?.();
  }, [showKatieWarning]);

  useEffect(() => {
    const el = bachelorBannerRef.current;
    const gsap = window.gsap;
    if (!el || !showBachelorBanner) return;

    el.textContent = "BACHELOR MODE";
    try {
      window.Splitting?.({ target: el, by: "chars" });
    } catch (error) {
      reportBlitzRuntimeError("Bachelor banner splitting", error);
      return;
    }
    const chars = el.querySelectorAll(".char");
    if (!chars.length || !gsap) return;

    let timeline: ReturnType<NonNullable<typeof window.gsap>["timeline"]> | undefined;
    try {
      gsap.set(chars, { opacity: 0, y: 24, rotateX: -40, scale: 0.82 });
      timeline = gsap.timeline();
      timeline.fromTo(
        chars,
        { opacity: 0, y: 24, rotateX: -40, scale: 0.82 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          scale: 1,
          duration: 0.5,
          stagger: 0.03,
          ease: "back.out(1.4)",
        },
      );
      timeline.to(chars, {
        y: -3,
        scale: 1.05,
        duration: 0.75,
        yoyo: true,
        repeat: 1,
        stagger: 0.02,
        ease: "sine.inOut",
      });
    } catch (error) {
      reportBlitzRuntimeError("Bachelor banner animation", error);
    }

    return () => timeline?.kill?.();
  }, [showBachelorBanner]);

  useEffect(() => {
    const el = billWineRef.current;
    const gsap = window.gsap;
    if (!el || !gsap || !isBillMode || billStage !== "dialogue") return;

    if (billDialogueIndex === 0) {
      const tween = gsap.fromTo(
        el,
        { y: -18, opacity: 0, rotate: -10, scale: 0.82 },
        { y: 0, opacity: 1, rotate: 0, scale: 1, duration: 0.35, ease: "back.out(1.5)" },
      );
      return () => tween?.kill?.();
    }

    if (billDialogueIndex === 1) {
      const tween = gsap.to(el, {
        x: 180,
        y: -90,
        rotate: 120,
        opacity: 0,
        duration: 0.55,
        ease: "power2.in",
      });
      return () => tween?.kill?.();
    }
  }, [billDialogueIndex, billStage, isBillMode]);

  useEffect(() => {
    const el = billBeerRackRef.current;
    const gsap = window.gsap;
    if (!el || !gsap || !isBillMode || billStage !== "chug") return;

    const beers = el.querySelectorAll("[data-bill-beer]");
    if (!beers.length) return;

    const beersLeft = Math.max(0, BILL_BEER_TOTAL - billBeerCount);
    gsap.set(beers, { y: 0, opacity: 0, scale: 0.45 });
    beers.forEach((beer, index) => {
      if (index < beersLeft) {
        gsap.to(beer, {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.14,
          ease: "power2.out",
        });
        return;
      }

      gsap.to(beer, {
          opacity: 0,
          scale: index === beersLeft ? 0.2 : 0.32,
          y: index === beersLeft ? -12 : -6,
          duration: index === beersLeft ? 0.18 : 0.12,
          ease: "back.out(1.6)",
        });
    });
  }, [billBeerCount, billStage, isBillMode]);

  useEffect(() => {
    const el = billDoorRef.current;
    const gsap = window.gsap;
    if (!el || !gsap || !isBillMode || billStage !== "door") return;

    const crackLevel = Math.min(1, billDoorTaps / BILL_DOOR_TARGET_TAPS);
    const shake = crackLevel > 0
      ? gsap.fromTo(
        el,
        { x: -2 - crackLevel * 3, rotate: -0.25 - crackLevel * 0.8 },
        {
          x: 2 + crackLevel * 3,
          rotate: 0.25 + crackLevel * 0.8,
          duration: Math.max(0.07, 0.18 - crackLevel * 0.06),
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
      )
      : undefined;

    return () => shake?.kill?.();
  }, [billDoorTaps, billStage, isBillMode]);

  useEffect(() => {
    const el = billDoorRef.current;
    const gsap = window.gsap;
    if (!el || !gsap || !billResult) return;

    if (billResult.success) {
      const tween = gsap.to(el, {
        scale: 1.06,
        opacity: 0.2,
        rotate: 4,
        duration: 0.24,
        ease: "power2.out",
      });
      return () => tween?.kill?.();
    }

    const tween = gsap.fromTo(
      el,
      { x: -10, rotate: -1.2 },
      { x: 10, rotate: 1.2, duration: 0.12, repeat: 3, yoyo: true, ease: "sine.inOut" },
    );
    return () => tween?.kill?.();
  }, [billResult]);

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 overflow-hidden bg-[#0f172a]"
      style={{
        touchAction: screen === "playing" ? "none" : "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
        fontFamily: BACHELOR_BLITZ_FONT,
      }}
    >
      <style>{`
        .bachelor-pulse-char {
          display: inline-block;
          will-change: transform, opacity;
        }
        .bachelor-overlay-glow {
          text-shadow:
            0 0 10px rgba(255, 255, 255, 0.35),
            0 0 20px rgba(244, 114, 182, 0.5),
            0 0 34px rgba(34, 211, 238, 0.4);
        }
        .bill-door-shell {
          box-shadow:
            inset 0 0 0 2px rgba(255, 255, 255, 0.08),
            inset 0 0 30px rgba(0, 0, 0, 0.35),
            0 24px 60px rgba(0, 0, 0, 0.45);
        }
        .catch-burst {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255,255,255,0.95), rgba(34,197,94,0.85) 55%, transparent 70%);
          animation: catch-burst-pop 520ms ease-out forwards;
          pointer-events: none;
        }
        @keyframes catch-burst-pop {
          0% { transform: translate(0, 0) scale(0.55); opacity: 1; }
          100% { transform: translate(var(--burst-x), var(--burst-y)) scale(1.5); opacity: 0; }
        }
        .angbeen-flyby {
          will-change: transform, opacity;
          filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.28));
        }
      `}</style>

      <div ref={playfieldRef} className="absolute inset-0">
        {screen === "playing" && flyby && (
          <div
            className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            aria-hidden="true"
          >
            <Image
              src={ANGBEEN_FLYBY_SRC}
              alt=""
              width={1076}
              height={1536}
              className="angbeen-flyby absolute rounded-[1.6rem] border-4 border-white/75 object-cover opacity-70"
              style={{
                top: `${flyby.top}%`,
                width: `${flyby.size}px`,
                transform: flyby.active
                  ? `translateX(${flyby.fromLeft ? "120vw" : "-120vw"}) rotate(${flyby.rotate}deg)`
                  : `translateX(${flyby.fromLeft ? "-28vw" : "108vw"}) rotate(${flyby.rotate}deg)`,
                [flyby.fromLeft ? "left" : "right"]: "-12vw",
                transition: `transform ${flyby.durationMs}ms linear, opacity 380ms ease-out`,
              }}
            />
          </div>
        )}
        <canvas ref={canvasRef} className="absolute inset-0 z-10 block" />
        {screen === "playing" && (
          <div
            ref={catcherFxRef}
            className="pointer-events-none absolute rounded-full border-2 border-[#86efac]/70 bg-[#22c55e]/12 shadow-[0_0_22px_rgba(34,197,94,0.35)]"
            style={{
              width: `${CATCHER_W}px`,
              height: `${CATCHER_H}px`,
              left: "0px",
              top: "0px",
              opacity: 0.12,
            }}
          />
        )}
        <div
          ref={particlesRef}
          id={PARTICLES_CONTAINER_ID}
          className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
            isBachelorMode && !isBillMode ? "opacity-100" : "opacity-0"
          }`}
        />

        {screen === "playing" && (
          <div className="pointer-events-none absolute inset-0">
          <div
            ref={bachelorAuraRef}
            className={`absolute inset-0 transition-opacity duration-300 ${
              isBachelorMode ? "opacity-100" : "opacity-0"
            }`}
            style={{
              background:
                "radial-gradient(circle at 20% 10%, rgba(244,114,182,0.26), transparent 32%), radial-gradient(circle at 80% 18%, rgba(34,211,238,0.24), transparent 34%), radial-gradient(circle at 50% 88%, rgba(253,224,71,0.18), transparent 38%)",
              mixBlendMode: "screen",
            }}
          />

          <div
            className={`absolute inset-x-4 top-[22%] flex justify-center transition-opacity duration-150 ${
              showKatieWarning ? "opacity-100" : "opacity-0"
            }`}
          >
            <div
              ref={katieWarningRef}
              className="bachelor-overlay-glow max-w-sm text-center text-[1.6rem] leading-[1.5] text-[#ffe4e6] sm:text-[2rem]"
            >
              KP INBOUND - HIDE!
            </div>
          </div>

          <div
            className={`absolute inset-x-6 top-24 flex justify-center transition-opacity duration-200 ${
              showBachelorBanner ? "opacity-100" : "opacity-0"
            }`}
          >
            <div
              ref={bachelorBannerRef}
              className="bachelor-overlay-glow text-center text-[1.3rem] leading-[1.7] text-[#fef08a] sm:text-[1.75rem]"
            >
              BACHELOR MODE
            </div>
          </div>

          {isBillMode && (
            <div className="pointer-events-auto absolute inset-0 z-20 overflow-hidden bg-[#14181f]/92">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_42%)]" />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at center, transparent 42%, rgba(5,8,15,0.74) 100%)",
                  opacity: 0.9,
                }}
              />

              {(billStage === "dialogue" || billStage === "postChug") && (
                <button
                  type="button"
                  onClick={advanceBillDialogue}
                  className="absolute inset-0"
                  aria-label="Skip Bill dialogue"
                  style={{ touchAction: "auto" }}
                />
              )}

              <div className="relative flex h-full flex-col justify-between px-4 py-6 sm:px-8">
                {(billStage === "dialogue" || billStage === "chug" || billStage === "postChug") && (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="rounded-2xl border-4 border-[#f59e0b] bg-[#23160b]/90 p-3 shadow-[0_0_20px_rgba(245,158,11,0.22)]">
                        <Image
                          src="/bachelor-party-blitz/bill.png"
                          alt="Bill"
                          width={92}
                          height={92}
                          className="h-20 w-20 rounded-lg object-cover sm:h-24 sm:w-24"
                        />
                      </div>
                      <div className="max-w-[10rem] rounded-2xl border-2 border-white/10 bg-black/35 px-3 py-2 text-right text-[0.62rem] leading-[1.6] text-[#d1d5db] sm:max-w-xs sm:text-[0.72rem]">
                        tap to skip
                      </div>
                    </div>

                    <div className="flex flex-1 items-center justify-center">
                      <div className="flex flex-col items-center gap-6">
                        <div className="min-h-[5rem] text-center text-6xl sm:text-8xl">
                          {billStage === "dialogue" && billDialogueIndex <= 1 && (
                            <span ref={billWineRef} className="inline-block">
                              🍷
                            </span>
                          )}
                          {billStage === "dialogue" && billDialogueIndex === 1 && (
                            <span className="sr-only">Wine tossed away</span>
                          )}
                          {(billStage === "dialogue" && billDialogueIndex === 2) || billStage === "chug" ? (
                            <div ref={billBeerRackRef} className="grid grid-cols-6 gap-x-2 gap-y-3 sm:gap-x-3">
                              {Array.from({ length: BILL_BEER_TOTAL }).map((_, index) => (
                                <span
                                  key={`beer-${index}`}
                                  data-bill-beer
                                  className={`inline-block text-[2.2rem] leading-none transition-opacity duration-150 sm:text-[2.8rem] ${
                                    index < BILL_BEER_TOTAL - billBeerCount ? "opacity-100" : "opacity-0"
                                  }`}
                                >
                                  🍺
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {billStage === "postChug" && (
                            <div className="flex items-center justify-center gap-4 text-[3.1rem] drop-shadow-[0_6px_18px_rgba(0,0,0,0.3)] sm:text-[3.6rem]">
                              <span className="text-[4.1rem]">🧔</span>
                              <span>{billPostChugIndex === 0 ? "👕🩳➡️🚪" : "😳🔒🚪"}</span>
                            </div>
                          )}
                        </div>

                        {billStage === "chug" && (
                          <div className="rounded-2xl border-2 border-[#f59e0b]/55 bg-[#2c1809]/85 px-4 py-3 text-center text-[0.68rem] leading-[1.9] text-[#fde68a] sm:text-[0.82rem]">
                            {billBeerCount <= 1 ? "Bill is deliberately working on beer one..." : `${billBeerCount}/${BILL_BEER_TOTAL} beers down`}
                          </div>
                        )}

                        {billStage === "postChug" && (
                          <div className="rounded-2xl border-2 border-[#f59e0b]/55 bg-[#2c1809]/85 px-4 py-3 text-center text-[0.68rem] leading-[1.9] text-[#fde68a] sm:text-[0.82rem]">
                            {billPostChugIndex === 0 ? "Beer twelve is gone. Bad ideas are arriving." : "Bill has created a problem and Jimmy cannot help him."}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1.6rem] border-4 border-[#fbbf24] bg-[#1b2230]/96 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)] sm:px-6">
                      <div className="mb-2 text-[0.62rem] uppercase tracking-[0.35em] text-[#fcd34d] sm:text-[0.72rem]">
                        BILL MODE
                      </div>
                      <div className="text-[0.78rem] leading-[1.9] text-white sm:text-[0.95rem]">
                        {billStage === "dialogue"
                          ? BILL_DIALOGUES[billDialogueIndex]
                          : billStage === "postChug"
                            ? BILL_POST_CHUG_DIALOGUES[billPostChugIndex]
                            : "Thereeeee ya go."}
                      </div>
                    </div>
                  </>
                )}

                {(billStage === "doorIntro" || billStage === "door") && (
                  <div className="flex h-full flex-col items-center justify-center gap-6 py-4">
                    <div className="w-full max-w-sm space-y-3 text-center">
                      <p className="text-[0.8rem] uppercase tracking-[0.35em] text-[#cbd5e1]">
                        BUST IT DOWN
                      </p>
                      {billStage === "door" ? (
                        <div className="h-4 overflow-hidden rounded-full border-2 border-white/20 bg-white/10">
                          <div
                            className="h-full bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#fde68a] transition-[width] duration-75"
                            style={{ width: `${(billDoorTimeLeft / BILL_DOOR_DURATION_MS) * 100}%` }}
                          />
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-[0.7rem] leading-[1.8] text-[#e2e8f0]">
                          Get ready. The countdown starts in a second.
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      ref={billDoorRef}
                      className="bill-door-shell relative flex h-[52vh] max-h-[31rem] w-full max-w-sm select-none items-center justify-center rounded-[2rem] border-[10px] border-[#64748b] bg-gradient-to-b from-[#6b7280] via-[#525966] to-[#2c313b] px-6 active:scale-[0.995]"
                      style={{ touchAction: "none" }}
                    >
                      <div
                        className="absolute inset-[8%] rounded-[1.5rem] border-4 border-[#94a3b8]/45"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(0,0,0,0.15))",
                        }}
                      />
                      <div className="absolute left-[14%] top-[18%] h-10 w-3 rounded-full bg-black/35" />
                      <div className="absolute left-[14%] top-[34%] h-10 w-3 rounded-full bg-black/28" />
                      <div className="absolute left-[14%] top-[50%] h-10 w-3 rounded-full bg-black/22" />
                      <div className="absolute right-[18%] top-[46%] h-6 w-6 rounded-full border-4 border-[#e2e8f0]/60 bg-[#475569]" />
                      <div
                        className="absolute inset-0 rounded-[2rem]"
                        style={{
                          background: `
                            repeating-linear-gradient(135deg, transparent, transparent 36px, rgba(255,255,255,${Math.min(0.34, billDoorTaps * 0.008)}) 37px, transparent 40px),
                            linear-gradient(${110 + billDoorTaps * 2}deg, transparent 46%, rgba(248,250,252,${Math.min(0.42, billDoorTaps * 0.012)}) 48%, transparent 50%)
                          `,
                        }}
                      />
                      <div className="relative z-10 space-y-4 text-center text-white">
                        <p className="text-[0.92rem] leading-[1.9] text-[#f8fafc]">
                          {billStage === "door" ? "TAP THE DOOR" : "GET READY"}
                        </p>
                        <p className="text-[0.7rem] leading-[1.8] text-[#cbd5e1]">
                          {billStage === "door"
                            ? "Tap the door as fast as you can to break it down."
                            : "As soon as the bar starts moving, hammer the door."}
                        </p>
                      </div>
                    </button>

                    <div className="flex w-full max-w-sm items-center justify-between gap-4 text-[#f8fafc]">
                      <div className="rounded-2xl border-2 border-white/15 bg-black/25 px-4 py-3 text-left">
                        <p className="text-[0.58rem] uppercase tracking-[0.32em] text-[#94a3b8]">Time</p>
                        <p className="mt-2 text-[1.1rem]">
                          {billStage === "door" ? `${(billDoorTimeLeft / 1000).toFixed(1)}s` : "..."}
                        </p>
                      </div>
                      <div className="rounded-2xl border-2 border-white/15 bg-black/25 px-4 py-3 text-right">
                        <p className="text-[0.58rem] uppercase tracking-[0.32em] text-[#94a3b8]">Taps Left</p>
                        <p className="mt-2 text-[1.4rem] text-[#fde68a]">
                          {billStage === "door" ? Math.max(0, BILL_DOOR_TARGET_TAPS - billDoorTaps) : BILL_DOOR_TARGET_TAPS}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {billStage === "result" && billResult && (
                  <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                    <div className={`text-7xl ${billResult.success ? "scale-125" : ""}`}>
                      {billResult.success ? "💥" : "🚪"}
                    </div>
                    <div className={`space-y-3 rounded-[2rem] border-4 px-6 py-6 text-white ${
                      billResult.success
                        ? "border-[#fde68a]/55 bg-[#33180a]/82 shadow-[0_0_45px_rgba(251,191,36,0.25)]"
                        : "border-white/10 bg-black/35"
                    }`}>
                      <p className="text-[0.95rem] uppercase tracking-[0.25em] text-[#fde68a]">
                        {billResult.success ? "DOOR BUSTED!" : "DOOR HELD."}
                      </p>
                      <p className="text-[0.75rem] leading-[1.8] text-[#e2e8f0]">
                        {billResult.success
                          ? `+300 + ${Math.max(0, billResult.bonus - 300)} BONUS`
                          : "You lost a life and got bounced back outside."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div
                className={`absolute inset-0 bg-black transition-opacity duration-75 ${
                  billBlackout ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          )}
          </div>
        )}

        {screen === "playing" && (
          <div className="pointer-events-none absolute inset-0 z-10">
          {catchBursts.map((burst) => (
            <div key={burst.id} className="absolute" style={{ left: `${burst.x}px`, top: `${burst.y}px` }}>
              {[
                ["-42px", "-30px"],
                ["-12px", "-46px"],
                ["24px", "-38px"],
                ["42px", "-10px"],
                ["36px", "22px"],
                ["0px", "40px"],
                ["-34px", "26px"],
                ["-46px", "-4px"],
              ].map(([dx, dy], index) => (
                <span
                  key={`${burst.id}-${index}`}
                  className="catch-burst"
                  style={{ ["--burst-x" as string]: dx, ["--burst-y" as string]: dy }}
                />
              ))}
            </div>
          ))}
          </div>
        )}
      </div>

      {/* ── SPLASH ──────────────────────────────────────────────────────────── */}
      {screen === "splash" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/96"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 0.75rem)",
            paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
          }}
          onClick={splashIdx < SPLASH_CREDITS.length ? advanceSplash : undefined}
        >
          {splashIdx < SPLASH_CREDITS.length ? (
            (() => {
              const credit = SPLASH_CREDITS[splashIdx];
              return credit.type === "image" ? (
                // Full-screen image credit
                <div className="relative flex h-full w-full flex-col items-center justify-center">
                  <button
                    type="button"
                    onClick={skipIntro}
                    className="absolute right-4 top-4 z-10 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-[0.62rem] uppercase tracking-[0.22em] text-slate-200"
                    style={{ touchAction: "auto" }}
                  >
                    Skip Intro
                  </button>
                  <Image
                    src={credit.src}
                    alt={credit.alt}
                    fill
                    sizes="100vw"
                    className="object-contain"
                  />
                  <p className="absolute bottom-10 text-sm uppercase tracking-widest text-slate-600">
                    tap to continue
                  </p>
                </div>
              ) : (
                // Text credit
                <div className="w-full max-w-xs px-8 text-center">
                  <button
                    type="button"
                    onClick={skipIntro}
                    className="mb-6 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-[0.62rem] uppercase tracking-[0.22em] text-slate-200"
                    style={{ touchAction: "auto" }}
                  >
                    Skip Intro
                  </button>
                  <p className="mb-8 text-xs uppercase tracking-[0.3em] text-slate-600">
                    A PRODUCTION
                  </p>
                  <p className="whitespace-pre-line text-3xl font-black leading-tight text-white">
                    {credit.text}
                  </p>
                  <p className="mt-12 text-sm uppercase tracking-widest text-slate-700">
                    tap to continue
                  </p>
                </div>
              );
            })()
          ) : (
            // Title card
            <div className="pointer-events-auto w-full max-w-lg px-4 text-center sm:px-5">
              <div className="max-h-[calc(100dvh-2.5rem)] space-y-4 overflow-y-auto rounded-[1.75rem] border border-slate-700/80 bg-slate-950/88 px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.42)] sm:max-h-[calc(100dvh-3rem)] sm:px-6 sm:py-6">
                <p className="text-[1.9rem] leading-[1.35] text-white sm:text-[2.25rem]">
                  JIMMY&apos;S
                  <br />
                  BACHELOR
                  <br />
                  PARTY BLITZ
                </p>

                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); startGame(); }}
                  className="w-full rounded-2xl border-4 border-white bg-[#c8102e] py-4 text-xl uppercase tracking-[0.22em] text-white sm:text-2xl"
                  style={{ touchAction: "auto" }}
                >
                  START GAME
                </button>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-4 text-left text-[0.62rem] leading-[1.85] text-slate-200 sm:text-[0.72rem]">
                  <p className="mb-3 text-center text-[0.68rem] uppercase tracking-[0.28em] text-slate-400 sm:text-[0.78rem]">
                    How To Play
                  </p>
                  <p className="text-sky-300">👆 Drag anywhere to move Jimmy under the falling objects.</p>
                  <p className="text-green-400">🟢 Catch the good stuff: money, dreidel, goth, and the mushroom.</p>
                  <p className="mt-2 text-red-400">🔴 Dodge Katie, payments, and dumbbells or you lose a life.</p>
                  <p className="mt-2 text-fuchsia-300">🍄 Mushroom triggers Bachelor Mode.</p>
                  <p className="mt-2 text-amber-300">🧾 Bill Mode is rare and starts the door mini-game.</p>
                  <p className="mt-2 text-amber-300">🍺 You have 8 lives. Last as long as possible and run up your score.</p>
                </div>

                <button
                  type="button"
                  onClick={handleAudioToggle}
                  className={`w-full rounded-2xl border px-4 py-3 text-[0.68rem] uppercase tracking-[0.24em] sm:text-[0.78rem] ${
                    audioEnabled
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                      : "border-slate-600 bg-slate-900/85 text-slate-300"
                  }`}
                >
                  Slipknot: {audioEnabled ? "Yes" : "No"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── END SCREEN (game over + personal best) ──────────────────────────── */}
      {screen === "end" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-black/96 px-6 py-8">
          <div className="w-full max-w-sm space-y-5 text-center">
            <p className="text-6xl">💀</p>
            <p className="text-3xl font-black uppercase text-white">GAME OVER</p>

            <div className="space-y-3">
              <div className="mx-auto w-full max-w-[16rem] overflow-hidden rounded-3xl border-4 border-slate-700 bg-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
                <Image
                  src="/bachelor-party-blitz/end-quote-photo.jpg"
                  alt="End screen quote"
                  width={678}
                  height={1207}
                  className="h-auto w-full object-cover"
                />
              </div>
              <p className="px-4 text-base font-semibold italic text-[#f97316]">
                &ldquo;{END_QUOTE_LINE}&rdquo;
              </p>
            </div>

            {/* Score vs personal best */}
            <div className="space-y-3 rounded-2xl border-2 border-slate-700 bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Your Score
                </span>
                <span className="text-4xl font-black text-white">{finalScore}</span>
              </div>
              <div className="h-px bg-slate-700" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Personal Best
                </span>
                <span className={`text-2xl font-black ${isNewBest ? "text-yellow-400" : "text-slate-300"}`}>
                  {personalBest}
                </span>
              </div>
              {isNewBest && (
                <p className="text-sm font-black uppercase tracking-widest text-yellow-400">
                  🏆 NEW BEST!
                </p>
              )}
            </div>

            <p className="text-sm text-slate-400">
              Compare with your friends to see who scored highest! 👑
            </p>

            {/* Name entry */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-slate-500">Your Name</p>
              <input
                type="text"
                maxLength={11}
                value={playerName}
                onChange={e => setPlayerName(e.target.value.toUpperCase().slice(0, 11))}
                className="w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.18em] text-white outline-none focus:border-yellow-400 sm:text-2xl"
                style={{ touchAction: "auto" }}
              />
            </div>

            <button
              onClick={playAgain}
              className="w-full rounded-2xl border-4 border-white bg-[#064789] py-5 text-2xl font-black uppercase tracking-widest text-white active:bg-[#073a70]"
              style={{ touchAction: "auto" }}
            >
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
