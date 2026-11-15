// lib/vision/landmarks.ts — P4
//
// Pure geometry over one MediaPipe hand. No React, no camera, no DOM: given 21
// landmarks, say where the hand is and what it is doing. Everything here is a
// ratio against the hand's own size, never a pixel distance — that is what
// makes a gesture work at arm's length and at six inches without recalibration,
// and it is the single most important decision in this file.
//
// MediaPipe landmark space: x,y normalised to [0,1] against the IMAGE, so the
// space is anisotropic on a 16:9 frame. Every distance here multiplies x by the
// aspect ratio first, because a pinch judged in anisotropic space drifts as you
// move your hand across the frame.

import type { Vec2 } from '@/lib/sim/types';

/** One MediaPipe hand landmark. z is relative and deliberately unused — see §depth below. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * §depth: MediaPipe's z is relative to the hand's own centre and noisy enough
 * that nothing in this feature is allowed to depend on it. Pinch is the clutch
 * instead. If you are tempted to use z for "push to select", read
 * docs/10-GESTURE-MODE.md first.
 */

// The indices we use, named. Full map in the MediaPipe hand landmark docs.
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_TIP = 20;

const FINGER_TIPS = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP] as const;

/** Aspect-corrected distance between two landmarks, in units of image height. */
function dist(a: Landmark, b: Landmark, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/**
 * The hand's own scale: wrist to middle-finger knuckle. Used as the denominator
 * for every other measurement, so all the thresholds below are dimensionless
 * and hold at any distance from the camera.
 *
 * Floored at a small positive number so a degenerate frame cannot divide by
 * zero and produce an Infinity that then reads as "pinching".
 */
export function palmSpan(lm: Landmark[], aspect: number): number {
  return Math.max(dist(lm[WRIST], lm[MIDDLE_MCP], aspect), 1e-4);
}

/**
 * Thumb tip to index tip, over palm span. Roughly 0.1–0.25 pinched, 0.6–0.8 at
 * rest, 1.2+ with the hand open. The caller applies hysteresis — see pinch.ts.
 */
export function pinchRatio(lm: Landmark[], aspect: number): number {
  return dist(lm[THUMB_TIP], lm[INDEX_TIP], aspect) / palmSpan(lm, aspect);
}

/**
 * How far a fingertip reaches from the wrist, over palm span. ~1.6 extended,
 * ~0.75 curled into the palm.
 *
 * This is what separates a pinch from a fist, and without it the two are the
 * same gesture: in BOTH of them the thumb and index tips are close together.
 * The difference is that a pinch happens out in front of the hand with the
 * index extended, and a fist happens against the palm.
 */
export function extension(lm: Landmark[], tip: number, aspect: number): number {
  return dist(lm[WRIST], lm[tip], aspect) / palmSpan(lm, aspect);
}

/** A pinch needs the index actually pointing out, not curled under the thumb. */
export const INDEX_EXTENDED_MIN = 1.1;

export function indexExtended(lm: Landmark[], aspect: number): boolean {
  return extension(lm, INDEX_TIP, aspect) >= INDEX_EXTENDED_MIN;
}

/**
 * A fist: all four fingers curled against the palm. This is the reset gesture,
 * chosen because it is the one hand shape that is never accidental — an open
 * palm is the resting state, so "hold an open palm" would fire constantly.
 */
export function isFist(lm: Landmark[], aspect: number): boolean {
  return FINGER_TIPS.every((tip) => extension(lm, tip, aspect) < 1.0);
}

/**
 * The hand's position, in normalised image space. Deliberately NOT the index
 * fingertip: the fingertip moves several centimetres when you merely close a
 * pinch, which would make every grab yank the thing you grabbed. The knuckle
 * line is the stable part of a hand, so the cursor rides on it and the pinch
 * happens around it.
 */
export function handAnchor(lm: Landmark[]): Vec2 {
  const a = lm[INDEX_MCP];
  const b = lm[MIDDLE_MCP];
  const c = lm[PINKY_MCP];
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
}

/**
 * Where the pinch itself closes — midway between the two tips. Used only to
 * draw the pinch indicator, never to position the cursor, for the reason above.
 */
export function pinchPoint(lm: Landmark[]): Vec2 {
  return {
    x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
    y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
  };
}

/**
 * The MediaPipe hand skeleton, as index pairs. Duplicated here rather than read
 * from `HandLandmarker.HAND_CONNECTIONS` so the camera preview can draw a hand
 * without importing the wasm bundle — the preview is a small diagnostic and
 * should not pull 300 KB of glue into whatever renders it.
 */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
