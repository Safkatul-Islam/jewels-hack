// lib/vision/smooth.ts — P4
//
// One Euro filter. The step everyone skips, and the reason an un-smoothed hand
// cursor reads as broken: raw landmark output jitters by a couple of pixels
// every frame, which at canvas scale is tens of world metres and re-triggers
// everything downstream continuously. docs/04-TABLE-MODE.md made the same point
// about ArUco; it is just as true here.
//
// Why One Euro and not a rolling average: a rolling average long enough to kill
// the jitter at rest also adds enough lag to make a fast drag feel like it is
// dragging through syrup. One Euro adapts — it smooths hard when the hand is
// still and gets out of the way when the hand moves — with two parameters and
// no buffer. Casiez, Roussel & Vogel, CHI 2012.

import type { Vec2 } from '@/lib/sim/types';

/** alpha for a first-order lowpass at `cutoff` Hz sampled `dt` seconds apart. */
function alphaFor(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export interface OneEuroConfig {
  /** Cutoff at zero velocity, Hz. Lower = steadier when still, laggier to start. */
  minCutoff: number;
  /** How much velocity raises the cutoff. Higher = less lag, more jitter in motion. */
  beta: number;
  /** Cutoff for the velocity estimate itself, Hz. 1.0 is the paper's default. */
  dCutoff: number;
}

/**
 * Tuned for a hand cursor filtered in NORMALISED camera space (0–1), at 30–60
 * fps. At rest this leaves about a pixel of movement on a 900 px canvas; on a
 * deliberate sweep it tracks within a frame or two.
 *
 * If you retune: minCutoff fixes the stillness, beta fixes the lag. Change one
 * at a time, and test both at rest and on a fast sweep — a value that feels
 * great standing still usually feels terrible moving.
 */
export const CURSOR_FILTER: OneEuroConfig = { minCutoff: 0.8, beta: 12, dCutoff: 1 };

/** A filter instance per tracked value. Stateful on purpose; cheap to recreate. */
export class OneEuroVec2 {
  private prev: Vec2 | null = null;
  private velocity: Vec2 = { x: 0, y: 0 };
  private out: Vec2 | null = null;

  constructor(private readonly cfg: OneEuroConfig = CURSOR_FILTER) {}

  /** `dt` in seconds. A non-finite or non-positive dt passes the sample through. */
  filter(p: Vec2, dt: number): Vec2 {
    if (!this.prev || !this.out || !Number.isFinite(dt) || dt <= 0) {
      this.prev = p;
      this.out = p;
      this.velocity = { x: 0, y: 0 };
      return p;
    }

    const ad = alphaFor(this.cfg.dCutoff, dt);
    const vx = (p.x - this.prev.x) / dt;
    const vy = (p.y - this.prev.y) / dt;
    this.velocity = {
      x: this.velocity.x + ad * (vx - this.velocity.x),
      y: this.velocity.y + ad * (vy - this.velocity.y),
    };

    // One cutoff for both axes, from the speed of the hand rather than per-axis
    // velocity: per-axis cutoffs make a diagonal sweep smooth in one axis and
    // sharp in the other, which shows up as the cursor cutting corners.
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const a = alphaFor(this.cfg.minCutoff + this.cfg.beta * speed, dt);

    this.out = {
      x: this.out.x + a * (p.x - this.out.x),
      y: this.out.y + a * (p.y - this.out.y),
    };
    this.prev = p;
    return this.out;
  }

  /** Forget the history — call when a hand reappears, so it does not glide in from where it left. */
  reset(): void {
    this.prev = null;
    this.out = null;
    this.velocity = { x: 0, y: 0 };
  }
}
