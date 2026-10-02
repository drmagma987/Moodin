// ---- Optional GPU enhancement layer ---------------------------------------
//
// The authoritative match and the full fallback picture remain in render.ts.
// This renderer owns a second, transparent canvas and adds effects that benefit
// from WebGL compositing. If Pixi/WebGL is unavailable, every method becomes a
// no-op and the Canvas2D match remains completely playable.

import { Application, BlurFilter, Container, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { CANVAS_H, CANVAS_W, FIELD_H, FIELD_W, PLAYER_SCALE, SPRINT_SPEED } from './constants';
import { clamp } from './math';
import { proj, setCamera } from './projection';
import type { Scene } from './render';

const OFFSCREEN_PAD = 90;

/**
 * A progressive-enhancement renderer deliberately kept separate from the
 * simulation and base Canvas2D renderer. It consumes the same immutable Scene
 * snapshot and never writes game state.
 */
export class PixiEnhancementRenderer {
  private app: Application | null = null;
  private destroyed = false;
  private frame = 0;

  private readonly atmosphere = new Graphics();
  private readonly shadows = new Graphics();
  private readonly motion = new Graphics();
  private readonly accents = new Graphics();

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    this.destroyed = false;
    const app = new Application();

    try {
      await app.init({
        canvas,
        width: CANVAS_W,
        height: CANVAS_H,
        preference: 'webgl',
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        resolution: 1,
        powerPreference: 'high-performance',
      });

      if (this.destroyed) {
        app.destroy(false, { children: true, context: true });
        return false;
      }

      const root = new Container();
      this.atmosphere.blendMode = 'screen';
      this.motion.blendMode = 'screen';
      this.shadows.filters = [new BlurFilter({ strength: 2.5, quality: 1 })];
      this.accents.filters = [
        new GlowFilter({
          distance: 7,
          outerStrength: 1.1,
          innerStrength: 0.15,
          alpha: 0.42,
          quality: 0.12,
        }),
      ];
      root.addChild(this.atmosphere, this.shadows, this.motion, this.accents);
      app.stage.addChild(root);
      this.app = app;
      return true;
    } catch (error) {
      // Progressive enhancement must never prevent a match from starting.
      console.warn('VIFA Pixi enhancement layer unavailable; using Canvas2D only.', error);
      app.destroy(false, { children: true, context: true });
      return false;
    }
  }

  render(scene: Scene) {
    if (!this.app || this.destroyed) return;
    this.frame += 1;
    setCamera(scene.camX, scene.camY);

    this.atmosphere.clear();
    this.shadows.clear();
    this.motion.clear();
    this.accents.clear();

    this.drawPitchLight(scene);
    this.drawPlayerDepth(scene);
    this.drawBallDepth(scene);
    this.drawGoalEnergy(scene);
    this.app.render();
  }

  destroy() {
    this.destroyed = true;
    if (!this.app) return;
    this.app.destroy(false, { children: true, context: true });
    this.app = null;
  }

  /** Subtle projected mowing sheen and stadium-light cones add depth to turf. */
  private drawPitchLight(scene: Scene) {
    const bands = 9;
    for (let i = 0; i < bands; i += 1) {
      if (i % 2 === 0) continue;
      const y0 = (FIELD_H / bands) * i;
      const y1 = (FIELD_H / bands) * (i + 1);
      const a = proj(0, y0);
      const b = proj(FIELD_W, y0);
      const c = proj(FIELD_W, y1);
      const d = proj(0, y1);
      this.atmosphere
        .poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y], true)
        .fill({ color: 0xcfffe8, alpha: 0.018 });
    }

    const focus = proj(scene.ball.x, scene.ball.y);
    const pulse = 0.014 + Math.sin(this.frame * 0.012) * 0.003;
    this.atmosphere
      .poly([0, 0, 235, 0, focus.x + 145, focus.y + 105, focus.x - 100, focus.y + 70], true)
      .fill({ color: 0xb9d9ff, alpha: pulse });
    this.atmosphere
      .poly([
        CANVAS_W - 235,
        0,
        CANVAS_W,
        0,
        focus.x + 100,
        focus.y + 70,
        focus.x - 145,
        focus.y + 105,
      ], true)
      .fill({ color: 0xb9d9ff, alpha: pulse });

    // Near-touchline haze reinforces the camera's foreground plane.
    const nearLeft = proj(0, FIELD_H);
    const nearRight = proj(FIELD_W, FIELD_H);
    this.atmosphere
      .poly([
        nearLeft.x,
        nearLeft.y - 10,
        nearRight.x,
        nearRight.y - 10,
        nearRight.x,
        CANVAS_H,
        nearLeft.x,
        CANVAS_H,
      ], true)
      .fill({ color: 0x9bdcc7, alpha: 0.018 });
  }

  private drawPlayerDepth(scene: Scene) {
    for (const { p, kit } of scene.players) {
      const q = proj(p.x, p.y);
      if (
        q.x < -OFFSCREEN_PAD
        || q.x > CANVAS_W + OFFSCREEN_PAD
        || q.y < -OFFSCREEN_PAD
        || q.y > CANVAS_H + OFFSCREEN_PAD
      ) continue;

      const gs = q.s * PLAYER_SCALE;
      const speed = Math.hypot(p.vx, p.vy);
      const speedRatio = clamp(speed / SPRINT_SPEED, 0, 1.25);
      const diving = (p.diveTimer ?? 0) > 0;
      const sliding = (p.slideTimer ?? 0) > 0;
      const stretch = diving || sliding ? 1.7 : 1 + speedRatio * 0.16;

      // The main renderer retains its crisp contact shadow; this blurred offset
      // shadow supplies the softer stadium-light penumbra around it.
      this.shadows
        .ellipse(q.x + 5.5 * gs, q.y + 3 * gs, 13 * gs * stretch, 4.4 * gs)
        .fill({ color: 0x02070b, alpha: diving ? 0.10 : 0.15 });

      if (speedRatio > 0.76 && !diving && !sliding) {
        const directionLength = Math.hypot(p.vx, p.vy) || 1;
        const tailWorldX = p.x - (p.vx / directionLength) * 34;
        const tailWorldY = p.y - (p.vy / directionLength) * 34;
        const tail = proj(tailWorldX, tailWorldY);
        const alpha = (speedRatio - 0.76) * 0.13;
        this.motion
          .moveTo(q.x - 5 * gs, q.y - 17 * gs)
          .lineTo(tail.x, tail.y - 14 * gs)
          .stroke({ width: 2.3 * gs, color: kit.shirt, alpha });
        this.motion
          .moveTo(q.x + 5 * gs, q.y - 10 * gs)
          .lineTo(tail.x + 5 * gs, tail.y - 8 * gs)
          .stroke({ width: 1.2 * gs, color: 0xffffff, alpha: alpha * 0.55 });
      }

      const selected = p === scene.controlled || p === scene.secondaryControlled;
      if (selected) {
        this.accents
          .ellipse(q.x, q.y + 1.5 * gs, 15 * gs, 6 * gs)
          .stroke({ width: 1.45 * gs, color: kit.shirt, alpha: 0.45 });
      }
    }
  }

  private drawBallDepth(scene: Scene) {
    const q = proj(scene.ball.x, scene.ball.y);
    const height = Math.max(0, scene.ball.z);
    if (height <= 1) return;

    const heightRatio = clamp(height / 150, 0, 1);
    const radius = (7 + heightRatio * 9) * q.s;
    this.shadows
      .ellipse(q.x + heightRatio * 10, q.y + 2, radius, radius * 0.34)
      .fill({ color: 0x010405, alpha: 0.13 * (1 - heightRatio * 0.55) });

    // A restrained airborne glint makes chips and crosses readable without
    // changing the deliberately oversized ball used by the base renderer.
    const ballY = q.y - height * q.s;
    this.accents
      .circle(q.x - 1.5 * q.s, ballY - 1.5 * q.s, 1.35 * q.s)
      .fill({ color: 0xffffff, alpha: 0.52 });
  }

  private drawGoalEnergy(scene: Scene) {
    const sides: Array<['left' | 'right', number]> = [
      ['left', scene.netRipple.left],
      ['right', scene.netRipple.right],
    ];

    for (const [side, ripple] of sides) {
      if (ripple < 0.08) continue;
      const goal = proj(side === 'left' ? 0 : FIELD_W, FIELD_H / 2);
      const spread = 18 + (1 - ripple) * 25;
      this.accents
        .ellipse(goal.x, goal.y - 13 * goal.s, spread * goal.s, 22 * goal.s)
        .stroke({ width: 2.2, color: 0xf2fbff, alpha: ripple * 0.42 });
    }
  }
}
