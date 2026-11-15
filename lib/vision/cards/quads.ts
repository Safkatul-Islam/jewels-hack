import type { CardCorners, CardQuad, CvApi, CvImage, Frame, Vec2 } from './types';

export interface QuadOptions {
  /** Smallest card area as a fraction of the frame. */
  minAreaFraction?: number;
  /** Largest card area as a fraction of the frame. */
  maxAreaFraction?: number;
  /** Accepted long-edge / short-edge range. A poker card is 88.9 / 63.5 = 1.4. */
  minAspect?: number;
  maxAspect?: number;
}

export const QUAD_DEFAULTS = {
  minAreaFraction: 0.002,
  maxAreaFraction: 0.9,
  minAspect: 1.15,
  maxAspect: 1.8,
} as const;

/**
 * Local-contrast passes used to outline cards. Each marks pixels at least
 * `contrast` grey levels darker than their neighbourhood (box blur of radius
 * `window`), which draws a thin ring on the surface just outside every card
 * edge and survives glare and uneven light that defeat a global threshold.
 * No single window closed every outline in the real photos used for
 * validation (docs/08-PLAYING-CARDS.md); the union of these two did.
 */
const OUTLINE_PASSES = [
  { window: 2, contrast: 7 },
  { window: 5, contrast: 10 },
] as const;

/** Polygon tolerance as a fraction of contour length; absorbs rounded card corners. */
const POLYGON_EPSILON_FRACTION = 0.03;

export function assertFrame(frame: Frame): void {
  const { width, height, data } = frame;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Card detection needs a frame with positive integer size; got ${width}x${height}.`);
  }
  if (data.length !== width * height * 4) {
    throw new Error(`Card detection needs RGBA data of ${width * height * 4} bytes; got ${data.length}.`);
  }
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Positive for a polygon that runs clockwise on screen (image Y points down). */
function signedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Clockwise on screen, starting so the first edge is a short edge. Of the two
 * short edges the one higher in the image comes first; which of them is really
 * the card's top is decided later by appearance matching.
 */
function orderCorners(polygon: readonly Vec2[]): { corners: CardCorners; aspect: number } {
  const clockwise = signedArea(polygon) >= 0 ? [...polygon] : [...polygon].reverse();
  const edge = (i: number) => distance(clockwise[i]!, clockwise[(i + 1) % 4]!);
  const evenEdges = edge(0) + edge(2);
  const oddEdges = edge(1) + edge(3);
  let start = evenEdges <= oddEdges ? 0 : 1;
  const midY = (i: number) => (clockwise[i]!.y + clockwise[(i + 1) % 4]!.y) / 2;
  if (midY((start + 2) % 4) < midY(start)) start = (start + 2) % 4;
  const corners = [0, 1, 2, 3].map((i) => {
    const point = clockwise[(start + i) % 4]!;
    return { x: point.x, y: point.y };
  }) as unknown as CardCorners; // exactly four points: the caller checked polygon.length === 4
  const short = Math.min(evenEdges, oddEdges);
  const long = Math.max(evenEdges, oddEdges);
  return { corners, aspect: short > 0 ? long / short : Infinity };
}

interface Line { point: Vec2; direction: Vec2 }

/** Total-least-squares line through the points (principal axis of their scatter). */
function fitLine(points: readonly Vec2[]): Line | null {
  if (points.length < 2) return null;
  let meanX = 0, meanY = 0;
  for (const p of points) { meanX += p.x; meanY += p.y; }
  meanX /= points.length; meanY /= points.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) {
    const dx = p.x - meanX, dy = p.y - meanY;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx + syy === 0) return null;
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { point: { x: meanX, y: meanY }, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
}

function intersect(a: Line, b: Line): Vec2 | null {
  const cross = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
  if (Math.abs(cross) < 1e-6) return null;
  const t = ((b.point.x - a.point.x) * b.direction.y - (b.point.y - a.point.y) * b.direction.x) / cross;
  return { x: a.point.x + t * a.direction.x, y: a.point.y + t * a.direction.y };
}

/** Distance from the first line fit within which a contour point still counts as on the edge. */
const LINE_INLIER_PX = 1.5;

/** Share of each side's contour, centred, used for the line fit; skips the rounded corners. */
const SIDE_FIT_FRACTION = 0.7;

/**
 * approxPolyDP picks contour pixels on the rounded corners, each inset by a
 * different amount. Fitting a line to the straight middle of every side and
 * intersecting neighbours recovers the sharp corners to sub-pixel accuracy.
 * Returns null if the polygon vertices cannot be located or a fit degenerates.
 */
function refineCorners(contour: readonly Vec2[], polygon: readonly Vec2[]): Vec2[] | null {
  const indices = polygon.map((vertex) => contour.findIndex((p) => p.x === vertex.x && p.y === vertex.y));
  if (indices.some((index) => index < 0)) return null;
  const lines: Line[] = [];
  for (let side = 0; side < 4; side++) {
    const from = indices[side]!;
    const span = (indices[(side + 1) % 4]! - from + contour.length) % contour.length;
    const skip = Math.floor((span * (1 - SIDE_FIT_FRACTION)) / 2);
    const points: Vec2[] = [];
    for (let step = skip; step <= span - skip; step++) points.push(contour[(from + step) % contour.length]!);
    const rough = fitLine(points);
    if (!rough) return null;
    // A rank index or shadow that merged into the outline dents the side. Refit on
    // the points that agree with the first fit so a dent cannot tilt the edge.
    const inliers = points.filter((p) =>
      Math.abs((p.x - rough.point.x) * rough.direction.y - (p.y - rough.point.y) * rough.direction.x) <= LINE_INLIER_PX);
    const line = inliers.length >= points.length / 2 ? fitLine(inliers) : rough;
    if (!line) return null;
    lines.push(line);
  }
  const corners: Vec2[] = [];
  for (let vertex = 0; vertex < 4; vertex++) {
    const corner = intersect(lines[(vertex + 3) % 4]!, lines[vertex]!);
    // A refined corner far from its polygon vertex means the fit went wrong.
    if (!corner || distance(corner, polygon[vertex]!) > 0.25 * distance(polygon[vertex]!, polygon[(vertex + 2) % 4]!)) return null;
    corners.push(corner);
  }
  return corners;
}

/** Grows every marked pixel by one pixel in all directions, closing hairline gaps in an outline. */
function dilate(image: CvImage): void {
  const { width, height, data } = image;
  const rows = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      rows[row + x] = data[row + x]! | (x > 0 ? data[row + x - 1]! : 0) | (x < width - 1 ? data[row + x + 1]! : 0);
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      data[row + x] = rows[row + x]! | (y > 0 ? rows[row + x - width]! : 0) | (y < height - 1 ? rows[row + x + width]! : 0);
    }
  }
}

/** True when `point` is inside a convex polygon whose corners run clockwise on screen. */
function contains(corners: CardCorners, point: Vec2): boolean {
  return corners.every((a, i) => {
    const b = corners[(i + 1) % 4]!;
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= 0;
  });
}

function centroid(corners: CardCorners): Vec2 {
  return { x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4, y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4 };
}

/**
 * Finds convex, card-proportioned quadrilaterals whose whole edge is brighter
 * than the surface beside it. Cards must not touch or overlap each other or the
 * frame edge. Pure given `cv`; allocates and makes two contour passes per call,
 * so run it at the capture cadence, not per paint.
 */
export function detectCardQuads(cv: CvApi, frame: Frame, options: QuadOptions = {}): CardQuad[] {
  assertFrame(frame);
  const settings = { ...QUAD_DEFAULTS, ...options };
  const pixels = frame.width * frame.height;
  const grey: CvImage = { width: 0, height: 0, data: new Uint8Array(pixels) };
  const binary: CvImage = { width: 0, height: 0, data: new Uint8Array(pixels) };
  cv.grayscale(frame, grey);
  // The shortest outline that could enclose the minimum area is a circle's.
  const minContourLength = 2 * Math.sqrt(Math.PI * settings.minAreaFraction * pixels);
  const inFrame = (p: Vec2) => p.x >= -1 && p.y >= -1 && p.x <= frame.width && p.y <= frame.height;

  const candidates: { corners: CardCorners; area: number }[] = [];
  for (const pass of OUTLINE_PASSES) {
    cv.adaptiveThreshold(grey, binary, pass.window, pass.contrast);
    dilate(binary);
    const contours = cv.findContours(binary, new Int32Array((frame.width + 2) * (frame.height + 2)));
    for (const contour of contours) {
      // The card is the hole enclosed by its ring; the ring's outer side is ragged with surface texture.
      if (!contour.hole || contour.length < minContourLength) continue;
      const polygon = cv.approxPolyDP(contour, contour.length * POLYGON_EPSILON_FRACTION);
      if (polygon.length !== 4 || !cv.isContourConvex(polygon)) continue;
      const { corners, aspect } = orderCorners(refineCorners(contour, polygon) ?? polygon);
      if (aspect < settings.minAspect || aspect > settings.maxAspect || !corners.every(inFrame)) continue;
      const areaFraction = Math.abs(signedArea(corners)) / pixels;
      if (areaFraction < settings.minAreaFraction || areaFraction > settings.maxAreaFraction) continue;
      candidates.push({ corners, area: areaFraction });
    }
  }

  // Both passes usually find the same card, and a printed frame or pale panel on a
  // face is itself card-shaped. Keep only outermost quads: largest first, dropping
  // any centred inside a kept one.
  const quads: CardQuad[] = [];
  for (const candidate of candidates.sort((a, b) => b.area - a.area)) {
    const centre = centroid(candidate.corners);
    if (!quads.some((kept) => contains(kept.corners, centre))) quads.push({ corners: candidate.corners });
  }
  return quads;
}
