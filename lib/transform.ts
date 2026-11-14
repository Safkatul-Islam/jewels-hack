// lib/transform.ts — P1
//
// THE ONLY PLACE IN THIS CODEBASE WHERE WORLD METRES MEET SCREEN PIXELS.
// If you are converting coordinates anywhere else, stop and import from here.
//
// World: origin at the venue centre, +x east, +y north, units metres.
// Screen: origin top-left, +x right, +y DOWN. The y axis is flipped here and
// nowhere else.

import type { BBox, Vec2 } from '@/lib/sim/types';

export interface Transform {
  /** screen pixels per world metre */
  scale: number;
  /** screen x of bbox.minX */
  tx: number;
  /** screen y of bbox.maxY (north edge — the top of the screen) */
  ty: number;
  /** the viewport this transform was fitted to */
  width: number;
  height: number;
}

/**
 * Fit a world bbox into a pixel viewport, preserving aspect ratio and centring
 * the leftover slack. Returns a transform even for a degenerate bbox or a
 * zero-sized viewport, so a component can render on its first pass before
 * layout has settled.
 */
export function fitTransform(
  bbox: BBox,
  width: number,
  height: number,
  paddingPx = 32,
): Transform {
  const worldW = Math.max(bbox.maxX - bbox.minX, 1);
  const worldH = Math.max(bbox.maxY - bbox.minY, 1);
  const boxW = Math.max(width - paddingPx * 2, 1);
  const boxH = Math.max(height - paddingPx * 2, 1);

  const scale = Math.min(boxW / worldW, boxH / worldH);
  const slackX = (width - worldW * scale) / 2;
  const slackY = (height - worldH * scale) / 2;

  return { scale, tx: slackX, ty: slackY, width, height };
}

export function worldToScreen(t: Transform, p: Vec2, bbox: BBox): Vec2 {
  return {
    x: (p.x - bbox.minX) * t.scale + t.tx,
    y: (bbox.maxY - p.y) * t.scale + t.ty,
  };
}

export function screenToWorld(t: Transform, p: Vec2, bbox: BBox): Vec2 {
  return {
    x: (p.x - t.tx) / t.scale + bbox.minX,
    y: bbox.maxY - (p.y - t.ty) / t.scale,
  };
}

/** World metres → screen pixels, for radii, stroke widths and hit targets. */
export function metresToPx(t: Transform, m: number): number {
  return m * t.scale;
}

/** Screen pixels → world metres, for drag deltas. */
export function pxToMetres(t: Transform, px: number): number {
  return px / t.scale;
}

/** World rotation (radians, 0 = north) → SVG rotation (degrees, 0 = up). */
export function rotationToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function distanceM(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Clamp a world position into the scenario's bbox, so nothing can be dragged off-world. */
export function clampToBBox(p: Vec2, bbox: BBox): Vec2 {
  return {
    x: Math.min(Math.max(p.x, bbox.minX), bbox.maxX),
    y: Math.min(Math.max(p.y, bbox.minY), bbox.maxY),
  };
}

/** Snap a world position to a grid, in metres. `step <= 0` disables snapping. */
export function snapToGrid(p: Vec2, step: number): Vec2 {
  if (step <= 0) return p;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}
