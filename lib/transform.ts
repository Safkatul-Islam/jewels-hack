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

/**
 * The user's zoom and pan, on top of the fitted transform.
 *
 * Kept separate from `Transform` on purpose: `fitTransform` is a pure function
 * of (bbox, viewport) and must stay that way, because the ArUco table mode and
 * the tests both depend on a scenario filling the frame predictably. The view
 * is a user preference layered over it, and `composeView` is the only thing
 * that mixes the two.
 *
 * Semantics: screen = fitted_screen * k + pan.
 */
export interface ViewState {
  k: number;
  panX: number;
  panY: number;
}

export const IDENTITY_VIEW: ViewState = { k: 1, panX: 0, panY: 0 };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 14;

/**
 * Fold a view into a fitted transform, producing a transform that every other
 * function here accepts. Because the composition is affine and uniform, this is
 * just a scaled scale and a scaled-then-shifted origin — which is what keeps
 * `screenToWorld` exact under zoom, and therefore keeps a drag from drifting
 * away from the pointer.
 */
export function composeView(fit: Transform, view: ViewState): Transform {
  return {
    scale: fit.scale * view.k,
    tx: fit.tx * view.k + view.panX,
    ty: fit.ty * view.k + view.panY,
    width: fit.width,
    height: fit.height,
  };
}

/**
 * Zoom to `nextK` about a fixed screen point, so the world under the cursor
 * stays under the cursor. Returns the view; clamping to [MIN_ZOOM, MAX_ZOOM]
 * happens here so callers cannot produce a view that escapes the viewport.
 */
export function zoomAt(view: ViewState, nextK: number, focus: Vec2): ViewState {
  const k = Math.min(Math.max(nextK, MIN_ZOOM), MAX_ZOOM);
  // The fitted-space point under the cursor must be invariant:
  //   (focus - pan) / k  ===  (focus - pan') / k'
  const fx = (focus.x - view.panX) / view.k;
  const fy = (focus.y - view.panY) / view.k;
  return { k, panX: focus.x - fx * k, panY: focus.y - fy * k };
}

/**
 * A view that frames `spanM` metres around `target`, centred.
 *
 * This is how /plan opens. Fitting the whole scenario sounds like the neutral
 * choice and is not: a 4.5 km district on a 900 px canvas puts 0.17 px on a
 * metre, which makes a 2.6 m parking stall 0.45 px and a 3.5 m bus bay 0.6 px.
 * Everything facilityGeometry.ts draws at true dimensions is then thrown away
 * by the level-of-detail cutoffs, and the canvas can only ever show glyphs. At
 * a 450 m forecourt the same stall is 4.8 px and the drawing is the point
 * again. The whole district stays one click away on FIT.
 */
export function frameOn(
  fit: Transform,
  bbox: BBox,
  target: Vec2,
  spanM: number,
): ViewState {
  if (!fit.width || !fit.height || !fit.scale) return IDENTITY_VIEW;
  const wanted = Math.min(fit.width, fit.height) / Math.max(spanM, 1);
  const k = Math.min(Math.max(wanted / fit.scale, MIN_ZOOM), MAX_ZOOM);
  const atFit = worldToScreen(fit, target, bbox);
  return clampView(
    { k, panX: fit.width / 2 - atFit.x * k, panY: fit.height / 2 - atFit.y * k },
    fit.width,
    fit.height,
  );
}

/**
 * Keep the fitted world in contact with the viewport. At k = 1 the fit already
 * fills the frame, so pan is pinned to zero; above that, pan is bounded by how
 * much of the scaled frame hangs off each edge.
 */
export function clampView(view: ViewState, width: number, height: number): ViewState {
  const slackX = Math.max(0, width * (view.k - 1));
  const slackY = Math.max(0, height * (view.k - 1));
  return {
    k: view.k,
    panX: Math.min(0, Math.max(-slackX, view.panX)),
    panY: Math.min(0, Math.max(-slackY, view.panY)),
  };
}

/**
 * The same mapping as `worldToScreen`, expressed as an SVG transform, so a
 * group of geometry can be emitted in world metres and handed to the browser
 * untouched instead of being converted point by point.
 *
 *   worldToScreen is  x' = (x - minX)*s + tx,  y' = (maxY - y)*s + ty
 *   which is exactly  translate(tx - s*minX, ty + s*maxY) * scale(s, -s)
 *
 * The negative y scale is what flips world-north to screen-up. It flips
 * strokes too, so anything stroked inside such a group wants
 * vector-effect="non-scaling-stroke".
 */
export function worldTransformString(t: Transform, bbox: BBox): string {
  return `translate(${t.tx - t.scale * bbox.minX} ${t.ty + t.scale * bbox.maxY}) scale(${t.scale} ${-t.scale})`;
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
