"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TUNING CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const OBJ_SIZE = 76;           // px — placeholder square for 200×200 PNG
const CATCHER_W = 96;
const CATCHER_H = 58;
const CATCHER_BOTTOM = 90;     // px from canvas bottom to catcher center
const CATCHER_SPEED = 310;     // px/s
const HIT_SLOP = 1.22;         // hitbox is 22% larger than visual for forgiving mobile feel

const BASE_FALL_SPEED = 130;   // px/s at game start
const SPEED_RAMP = 0.013;      // speed multiplier growth per second
const BASE_SPAWN_INTERVAL = 1.3;
const MIN_SPAWN_INTERVAL = 0.38;
const SPAWN_RAMP = 0.009;

const BACHELOR_DURATION = 10;  // seconds
const BILL_MODE_DURATION = 6;  // seconds

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
  "cass",       // ✅ provided
  "dumbbell",   // ✅ provided
  "mushroom",   // ✅ provided
  "beer_b",     // ✅ provided
  "dumpling_b", // ✅ provided
  "pizza_b",    // ✅ provided
  "toilet_b",   // ✅ provided
  "lock_b",     // ✅ provided
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
}

// ── NORMAL MODE: catch these ─────────────────────────────────────────────────
const CATCH_POOL: ObjDef[] = [
  { type: "money",    emoji: "💰", label: "MONEY",   color: "#16a34a", behavior: "straight",     catchType: "catch" },
  { type: "dreidel",  emoji: "🕎", label: "DREIDEL", color: "#7c3aed", behavior: "straight",     catchType: "catch" },
  { type: "goth",     emoji: "🖤", label: "GOTH",    color: "#334155", behavior: "straight",     catchType: "catch" },
];

// ── NORMAL MODE: dodge these ─────────────────────────────────────────────────
const DODGE_POOL: ObjDef[] = [
  { type: "katie",    emoji: "💃", label: "KATIE",   color: "#ea580c", behavior: "erratic",      catchType: "dodge" },
  { type: "cass",     emoji: "⚡", label: "CASS",    color: "#ca8a04", behavior: "accelerating", catchType: "dodge" },
  { type: "dumbbell", emoji: "🏋️", label: "DUMBBELL",color: "#475569", behavior: "straight",     catchType: "dodge" },
  { type: "payment",  emoji: "💳", label: "PAYMENT", color: "#dc2626", behavior: "straight",     catchType: "dodge" },
];

// ── SPECIALS: neutral objects that trigger a game mode when caught ────────────
const MUSHROOM_DEF: ObjDef = {
  type: "mushroom", emoji: "🍄", label: "SHROOM", color: "#db2777", behavior: "straight", catchType: "mushroom",
};

// Catching Bill activates Bill Mode — no score change, no life lost
const BILL_DEF: ObjDef = {
  type: "bill", emoji: "🧾", label: "BILL", color: "#f59e0b", behavior: "straight", catchType: "bill_trigger",
};

// ── BILL MODE: catch food, dodge the rest ────────────────────────────────────
const BILL_CATCH_POOL: ObjDef[] = [
  { type: "beer_b",     emoji: "🍺", label: "BEER",    color: "#d97706", behavior: "straight", catchType: "bill_catch" },
  { type: "dumpling_b", emoji: "🥟", label: "DUMPLING", color: "#ea580c", behavior: "straight", catchType: "bill_catch" },
  { type: "pizza_b",    emoji: "🍕", label: "PIZZA",   color: "#b91c1c", behavior: "straight", catchType: "bill_catch" },
];

const BILL_DODGE_POOL: ObjDef[] = [
  { type: "toilet_b", emoji: "🚽", label: "TOILET",  color: "#94a3b8", behavior: "straight", catchType: "bill_dodge" },
  { type: "lock_b",   emoji: "🔒", label: "LOCKED",  color: "#334155", behavior: "erratic",  catchType: "bill_dodge" },
];

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
  billTimer: number;
  jimmyNoTimer: number;
  leftDown: boolean;
  rightDown: boolean;
  W: number;
  H: number;
  lastTs: number;
}

function makeGS(W: number, H: number): GS {
  return {
    score: 0, lives: 3, bagMeter: 1, speed: 1, elapsed: 0,
    objs: [], nextId: 0, spawnTimer: 1,
    cx: W / 2, cy: H - CATCHER_BOTTOM,
    bachelor: false, bachelorTimer: 0,
    bill: false, billTimer: 0,
    jimmyNoTimer: 0,
    leftDown: false, rightDown: false,
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
  const speed = (BASE_FALL_SPEED + gs.elapsed * 3) * gs.speed;
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
  if (gs.bill) {
    return makeObj(Math.random() < 0.55 ? pick(BILL_CATCH_POOL) : pick(BILL_DODGE_POOL), gs);
  }
  const r = Math.random();
  if (r < 0.05) return makeObj(MUSHROOM_DEF, gs);
  if (r < 0.10) return makeObj(BILL_DEF, gs);  // ~5% chance — catching him starts Bill Mode
  if (r < 0.45) return makeObj(pick(DODGE_POOL), gs);
  return makeObj(pick(CATCH_POOL), gs);
}

function triggerJimmyNoWave(gs: GS) {
  gs.jimmyNoTimer = 1.8;
  // Stagger 3 dodge objects above the screen so they arrive a beat apart
  for (let i = 1; i <= 3; i++) {
    const def = pick(DODGE_POOL);
    const speed = (BASE_FALL_SPEED + gs.elapsed * 3) * gs.speed;
    gs.objs.push({
      ...def,
      id: gs.nextId++,
      x: OBJ_SIZE + Math.random() * (gs.W - OBJ_SIZE * 2),
      y: -OBJ_SIZE / 2 - i * 130,
      vx: def.behavior === "erratic" ? (Math.random() - 0.5) * 120 : 0,
      vy: speed,
    });
  }
}

function loseLife(gs: GS, onGameOver: (score: number) => void) {
  gs.lives = Math.max(0, gs.lives - 1);
  gs.bagMeter = 1;
  if (gs.lives === 0) onGameOver(gs.score);
}

function onCatch(gs: GS, o: FallingObj, onGameOver: (score: number) => void) {
  const mult = gs.bill ? 3 : gs.bachelor ? 2 : 1;

  switch (o.catchType) {
    case "catch":
      gs.score += Math.round(10 * mult * gs.bagMeter);
      gs.bagMeter = Math.min(4, gs.bagMeter + 0.2);
      break;
    case "dodge":
      loseLife(gs, onGameOver);
      break;
    case "mushroom":
      gs.bachelor = true;
      gs.bachelorTimer = BACHELOR_DURATION;
      gs.score += Math.round(50 * gs.bagMeter);
      break;
    case "bill_trigger":
      // Neutral catch — no score, no life lost, just activates Bill Mode
      if (!gs.bill) {
        gs.bill = true;
        gs.billTimer = BILL_MODE_DURATION;
        gs.objs = [];
      }
      break;
    case "bill_catch":
      gs.score += Math.round(30 * gs.bagMeter);
      gs.bagMeter = Math.min(4, gs.bagMeter + 0.3);
      break;
    case "bill_dodge":
      loseLife(gs, onGameOver);
      break;
  }
}

function stepGS(gs: GS, dt: number, onGameOver: (score: number) => void) {
  gs.elapsed += dt;
  gs.speed = 1 + gs.elapsed * SPEED_RAMP;

  // Catcher movement — chaotic speed in bachelor mode
  const cs = gs.bachelor ? CATCHER_SPEED * (0.55 + Math.random() * 0.9) : CATCHER_SPEED;
  if (gs.leftDown)  gs.cx -= cs * dt;
  if (gs.rightDown) gs.cx += cs * dt;
  gs.cx = Math.max(CATCHER_W / 2, Math.min(gs.W - CATCHER_W / 2, gs.cx));

  // Mode timers
  if (gs.bachelor) {
    gs.bachelorTimer -= dt;
    if (gs.bachelorTimer <= 0) { gs.bachelor = false; gs.bachelorTimer = 0; }
  }
  if (gs.bill) {
    gs.billTimer -= dt;
    if (gs.billTimer <= 0) {
      gs.bill = false; gs.billTimer = 0;
      gs.objs = gs.objs.filter(o => o.catchType !== "bill_catch" && o.catchType !== "bill_dodge");
    }
  }

  if (gs.jimmyNoTimer > 0) gs.jimmyNoTimer -= dt;

  // Spawn
  gs.spawnTimer -= dt;
  if (gs.spawnTimer <= 0) {
    gs.objs.push(spawnObj(gs));
    if (!gs.bill && Math.random() < 0.07) triggerJimmyNoWave(gs);
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
      onCatch(gs, o, onGameOver);
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

function drawObj(ctx: CanvasRenderingContext2D, o: FallingObj, bachelor: boolean) {
  const img = imgCache.get(o.type);
  if (img) {
    if (bachelor) { ctx.shadowColor = o.color; ctx.shadowBlur = 20; }
    ctx.drawImage(img, o.x - OBJ_SIZE / 2, o.y - OBJ_SIZE / 2, OBJ_SIZE, OBJ_SIZE);
    ctx.shadowBlur = 0;
    return;
  }

  // Colored placeholder — used until a real PNG is loaded
  const x = o.x - OBJ_SIZE / 2;
  const y = o.y - OBJ_SIZE / 2;

  if (bachelor) { ctx.shadowColor = o.color; ctx.shadowBlur = 20; }
  rr(ctx, x, y, OBJ_SIZE, OBJ_SIZE, 12);
  ctx.fillStyle = o.color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.font = `${Math.round(OBJ_SIZE * 0.44)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(o.emoji, o.x, o.y - 8);

  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(o.label, o.x, o.y + OBJ_SIZE * 0.32);
}

function drawCatcher(ctx: CanvasRenderingContext2D, gs: GS) {
  const img = imgCache.get("jimmy");
  if (img) {
    if (gs.bachelor) { ctx.shadowColor = "#ff00ff"; ctx.shadowBlur = 30; }
    ctx.drawImage(img, gs.cx - CATCHER_W / 2, gs.cy - CATCHER_H / 2, CATCHER_W, CATCHER_H);
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

  ctx.fillStyle = "rgba(7,18,41,0.94)";
  ctx.fillRect(0, 0, W, 72);

  // bottom accent line on HUD
  ctx.fillStyle = bachelor ? "#facc15" : bill ? "#fbbf24" : "#064789";
  ctx.fillRect(0, 72, W, 3);

  // Score
  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = bachelor ? "#facc15" : "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(gs.score), 14, 26);

  // Bag meter
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("BAG METER", 14, 54);
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = gs.bagMeter >= 3 ? "#22c55e" : "#94a3b8";
  const bmDisplay = Number.isInteger(gs.bagMeter) ? `${gs.bagMeter}x` : `${gs.bagMeter.toFixed(1)}x`;
  ctx.fillText(bmDisplay, 110, 54);

  // Lives as beer mugs
  ctx.font = "22px serif";
  ctx.textAlign = "right";
  for (let i = 0; i < gs.lives; i++) ctx.fillText("🍺", W - 14 - i * 34, 26);

  // Mode labels (center of HUD)
  if (bill) {
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.fillText(`BILL MODE  ${Math.ceil(gs.billTimer)}s`, W / 2, 26);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#fde68a";
    ctx.fillText("3× POINTS · CATCH FOOD · DODGE TOILETS", W / 2, 52);
  } else if (bachelor) {
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#facc15";
    ctx.textAlign = "center";
    ctx.fillText(`✨ BACHELOR MODE  ${Math.ceil(gs.bachelorTimer)}s ✨`, W / 2, 26);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#e879f9";
    ctx.fillText("2× POINTS · EVERYTHING IS CHAOS", W / 2, 52);
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

function drawFrame(ctx: CanvasRenderingContext2D, gs: GS) {
  drawBg(ctx, gs);
  for (const o of gs.objs) drawObj(ctx, o, gs.bachelor);
  drawCatcher(ctx, gs);
  drawHUD(ctx, gs);

  if (gs.jimmyNoTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, gs.jimmyNoTimer);
    ctx.font = "bold 46px sans-serif";
    ctx.fillStyle = "#ef4444";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚠️ JIMMY NO! ⚠️", gs.W / 2, gs.H / 2);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT — edit these without touching game logic
// ─────────────────────────────────────────────────────────────────────────────

type SplashCredit =
  | { type: "text"; text: string }
  | { type: "image"; src: string; alt: string };

const SPLASH_CREDITS: SplashCredit[] = [
  { type: "image", src: "/bachelor-party-blitz/zimmy.png",    alt: "Sponsored by Zimmy's Head" },
  { type: "image", src: "/bachelor-party-blitz/vjspice.png",  alt: "VJ Spice Productions" },
  { type: "image", src: "/bachelor-party-blitz/brstudios.png", alt: "BR Studios" },
];

// Edit this line to change the game-over roast
const ROAST_LINE = "Jimmy, even your bachelor party couldn't save your jump shot. 💀";

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type Screen = "splash" | "playing" | "end";

export function BachelorPartyGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS | null>(null);
  const rafRef = useRef<number>(0);

  const [screen, setScreen] = useState<Screen>("splash");
  const [splashIdx, setSplashIdx] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [playerName, setPlayerName] = useState("JIM");
  const [personalBest, setPersonalBest] = useState(0);

  useEffect(() => {
    setPersonalBest(parseInt(localStorage.getItem("blitz_best") || "0", 10));
  }, []);

  // Preload PNGs listed in IMAGE_NAMES
  useEffect(() => {
    for (const name of IMAGE_NAMES) {
      if (imgCache.has(name)) continue;
      const img = new Image();
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
    const t = setTimeout(() => setSplashIdx(i => i + 1), 1800);
    return () => clearTimeout(t);
  }, [screen, splashIdx]);

  // Prevent default mobile scroll/zoom on the whole page
  useEffect(() => {
    const prevent = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    document.addEventListener("touchstart", prevent, { passive: false });
    return () => {
      document.removeEventListener("touchmove", prevent);
      document.removeEventListener("touchstart", prevent);
    };
  }, []);

  const handleGameOver = useCallback((score: number) => {
    const prev = parseInt(localStorage.getItem("blitz_best") || "0", 10);
    if (score > prev) {
      localStorage.setItem("blitz_best", String(score));
      setPersonalBest(score);
    }
    setFinalScore(score);
    setScreen("end");
  }, []);

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
      stepGS(gs, dt, handleGameOver);
      drawFrame(ctx, gs);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, handleGameOver]);

  // Touch input (only during gameplay)
  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sync = (e: TouchEvent) => {
      e.preventDefault();
      const gs = gsRef.current;
      if (!gs) return;
      gs.leftDown = false;
      gs.rightDown = false;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.clientX < gs.W / 2) gs.leftDown = true;
        else gs.rightDown = true;
      }
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
    setScreen("playing");
  }, []);

  const playAgain = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    gsRef.current = makeGS(c.width, c.height);
    setFinalScore(0);
    setScreen("playing");
  }, []);

  const isNewBest = finalScore > 0 && finalScore >= personalBest;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#0f172a]"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* ── SPLASH ──────────────────────────────────────────────────────────── */}
      {screen === "splash" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/96"
          onClick={startGame}
        >
          {splashIdx < SPLASH_CREDITS.length ? (
            (() => {
              const credit = SPLASH_CREDITS[splashIdx];
              return credit.type === "image" ? (
                // Full-screen image credit
                <div className="relative flex h-full w-full flex-col items-center justify-center">
                  <img
                    src={credit.src}
                    alt={credit.alt}
                    className="max-h-full max-w-full object-contain"
                  />
                  <p className="absolute bottom-10 text-sm uppercase tracking-widest text-slate-600">
                    tap anywhere to skip
                  </p>
                </div>
              ) : (
                // Text credit
                <div className="w-full max-w-xs px-8 text-center">
                  <p className="mb-8 text-xs uppercase tracking-[0.3em] text-slate-600">
                    A PRODUCTION
                  </p>
                  <p className="whitespace-pre-line text-3xl font-black leading-tight text-white">
                    {credit.text}
                  </p>
                  <p className="mt-12 text-sm uppercase tracking-widest text-slate-700">
                    tap anywhere to skip
                  </p>
                </div>
              );
            })()
          ) : (
            // Title card
            <div className="w-full max-w-xs px-8 text-center space-y-6">
              <p className="text-5xl font-black leading-none text-white">
                JIMMY&apos;S<br />BACHELOR<br />PARTY BLITZ
              </p>
              <button
                onClick={e => { e.stopPropagation(); startGame(); }}
                className="w-full rounded-2xl border-4 border-white bg-[#c8102e] py-5 text-2xl font-black uppercase tracking-widest text-white"
              >
                PLAY
              </button>
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

            {/* Roast — edit ROAST_LINE above */}
            <p className="px-4 text-base italic font-semibold text-[#f97316]">
              &ldquo;{ROAST_LINE}&rdquo;
            </p>

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
                maxLength={3}
                value={playerName}
                onChange={e => setPlayerName(e.target.value.toUpperCase().slice(0, 3))}
                className="w-full rounded-xl border-2 border-slate-600 bg-slate-800 py-4 text-center text-3xl font-black uppercase tracking-[0.5em] text-white outline-none focus:border-yellow-400"
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
