// lib/vision/pick.ts — P4
//
// What is the hand pointing at. Pure, screen-space, no React.
//
// The hand is marked only by a faint dot, so this function is what a user
// actually aims with: the way they know what they would grab is that it lights
// up. Two consequences, both deliberate:
//
//   1. Nearest-within-slop, not containment. Hand tracking leaves a couple of
//      pixels of residual jitter after smoothing, and a facility drawn at a
//      quarter-pixel-per-metre is a handful of pixels wide. Requiring the
//      pointer to land inside it would make small pieces unpickable — and a
//      14 % opacity dot is not something you can aim precisely enough to tell
//      why nothing happened.
//   2. Big things do not swallow small ones. The score is distance from the
//      EDGE, so a small piece sitting next to a large one still wins when the
//      hand is nearer to it.

import type { Vec2 } from '@/lib/sim/types';

export interface PickTarget {
  id: string;
  /** Centre, in canvas pixels. */
  centre: Vec2;
  /** Half the drawn footprint, in canvas pixels. */
  radiusPx: number;
}

/**
 * Generous by design. 44 px is roughly the touch-target size interface
 * guidelines settle on for a finger on glass, and a hand in the air is less
 * precise than a finger on glass, not more.
 */
export const PICK_SLOP_PX = 44;

export function pickNearest(
  point: Vec2,
  targets: readonly PickTarget[],
  slopPx = PICK_SLOP_PX,
): string | null {
  let best: string | null = null;
  let bestScore = Infinity;

  for (const target of targets) {
    const d = Math.hypot(point.x - target.centre.x, point.y - target.centre.y);
    // Distance from the edge: negative inside, positive outside.
    const score = d - target.radiusPx;
    if (score <= slopPx && score < bestScore) {
      bestScore = score;
      best = target.id;
    }
  }

  return best;
}
