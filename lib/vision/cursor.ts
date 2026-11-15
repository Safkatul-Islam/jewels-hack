// lib/vision/cursor.ts — P4
//
// Camera space → canvas pixels, and the recentre that fixes it when your hands
// have drifted. There is no drawn cursor on the canvas: the hovered element
// highlights instead, so this module's output is an invisible pointer and the
// feedback is somewhere else entirely (HoverHighlight).
//
// That choice puts a requirement on this file: the mapping has to be stable and
// predictable, because the user cannot see it to correct for it. A drifting or
// non-linear mapping that would merely feel sloppy with a visible dot is
// unusable without one.

import type { Vec2 } from '@/lib/sim/types';

/**
 * The slice of the camera frame that maps to the canvas, as a half-extent in
 * normalised units either side of the origin. About 40% of the frame width.
 *
 * Deliberately not the whole frame. Mapping [0,1] to the full canvas means the
 * canvas edges sit where your arms are fully extended sideways, so the corners
 * are physically unreachable and the middle of the canvas — where everything
 * happens — gets a tenth of your hand's travel. A narrow region costs reach and
 * buys precision, and precision is what hand tracking is short of.
 *
 * The region is wider than it is tall because shoulders move hands sideways
 * more easily than up and down, and because the canvas is wider than it is tall.
 */
export const ACTIVE_HALF_W = 0.2;
export const ACTIVE_HALF_H = 0.15;

/**
 * Where the active region sits in the frame. Default is slightly above centre:
 * hands at rest in front of a laptop camera sit low, and a region centred on
 * the frame would put the canvas centre at an uncomfortable height.
 *
 * This is the thing the reset gesture moves — see `recentredOrigin`.
 */
export const DEFAULT_ORIGIN: Vec2 = { x: 0.5, y: 0.45 };

/**
 * Map a hand anchor in normalised camera space to a point in canvas pixels.
 *
 * `mirror` is not optional in practice: getUserMedia hands back the raw sensor
 * view, in which your right hand is on the left of the frame. Un-mirrored, the
 * canvas feels like steering a car by watching it in a mirror — every
 * correction goes the wrong way. We mirror here rather than flipping the video
 * into the detector, so the detector keeps seeing the frame it was trained on.
 */
export function anchorToCanvas(
  anchor: Vec2,
  origin: Vec2,
  width: number,
  height: number,
): Vec2 {
  const mirroredX = 1 - anchor.x;
  const originX = 1 - origin.x;

  // −1 … +1 across the active region, clamped so a hand outside it pins to the
  // edge rather than running off and silently doing nothing.
  const u = clamp((mirroredX - originX) / ACTIVE_HALF_W, -1, 1);
  const v = clamp((anchor.y - origin.y) / ACTIVE_HALF_H, -1, 1);

  return {
    x: (u * 0.5 + 0.5) * width,
    y: (v * 0.5 + 0.5) * height,
  };
}

/**
 * The reset. Takes wherever the hands are right now and makes that the centre
 * of the canvas, so you can drop your arms, get comfortable, and make the
 * comfortable position the neutral one.
 *
 * This is not a nicety. Arms drift — you reach right to move a shuttle hub and
 * your whole working envelope has shifted right, and because nothing is drawn
 * at the pointer there is no visual cue telling you why the canvas edge now
 * feels closer on one side. One deliberate gesture puts it back.
 *
 * With both hands up it recentres on their midpoint, which preserves their
 * left/right relationship instead of stacking both pointers in the middle.
 */
export function recentredOrigin(anchors: Vec2[]): Vec2 | null {
  if (anchors.length === 0) return null;
  const sum = anchors.reduce((acc, a) => ({ x: acc.x + a.x, y: acc.y + a.y }), { x: 0, y: 0 });
  const mid = { x: sum.x / anchors.length, y: sum.y / anchors.length };

  // Keep the region inside the frame. An origin close to an edge would make
  // half the canvas unreachable and the recentre would feel like a malfunction.
  return {
    x: clamp(mid.x, ACTIVE_HALF_W, 1 - ACTIVE_HALF_W),
    y: clamp(mid.y, ACTIVE_HALF_H, 1 - ACTIVE_HALF_H),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
