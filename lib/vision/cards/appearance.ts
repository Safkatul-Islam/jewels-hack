import { assertFrame } from './quads';
import type { CardCorners, CvApi, CvImage, Frame } from './types';

/** Side of the perspective-normalized card image, in pixels. */
export const WARP_SIZE = 64;
/** The warp is average-pooled to this grid so a pixel or two of corner error is tolerated. */
export const FEATURE_GRID = 32;
const CELLS = FEATURE_GRID * FEATURE_GRID;
/** Brightness cells followed by red-excess cells. */
export const FEATURE_LENGTH = CELLS * 2;
const POOL = WARP_SIZE / FEATURE_GRID;
/**
 * Minimum root-mean-square contrast, in grey levels per feature value, for a quad
 * to count as printed. Below it (a blank or face-down plain card under uneven
 * light) normalizing would only amplify shading and noise into a fake pattern.
 */
const MIN_PATTERN_RMS = 8;

/** Per-frame single-channel images, computed once and shared by every card in the frame. */
export interface PreparedFrame {
  grey: CvImage;
  /** max(0, R - (G + B) / 2): separates red suits from black ones. */
  red: CvImage;
}

export function prepareFrame(cv: CvApi, frame: Frame): PreparedFrame {
  assertFrame(frame);
  const pixels = frame.width * frame.height;
  const grey: CvImage = { width: 0, height: 0, data: new Uint8Array(pixels) };
  cv.grayscale(frame, grey);
  const red: CvImage = { width: frame.width, height: frame.height, data: new Uint8Array(pixels) };
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    const excess = frame.data[p]! - (frame.data[p + 1]! + frame.data[p + 2]!) / 2;
    red.data[i] = excess > 0 ? Math.min(255, Math.round(excess)) : 0;
  }
  return { grey, red };
}

/**
 * Projective map from the unit square to the quad: (0,0) -> corners[0], (1,0) ->
 * corners[1], (1,1) -> corners[2], (0,1) -> corners[3]. Returns [a..h] with
 * x = (a*u + b*v + c) / (g*u + h*v + 1) and y = (d*u + e*v + f) / (g*u + h*v + 1).
 */
function squareToQuad(q: CardCorners): [number, number, number, number, number, number, number, number] {
  const px = q[0].x - q[1].x + q[2].x - q[3].x;
  const py = q[0].y - q[1].y + q[2].y - q[3].y;
  const dx1 = q[1].x - q[2].x, dx2 = q[3].x - q[2].x;
  const dy1 = q[1].y - q[2].y, dy2 = q[3].y - q[2].y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den === 0 ? 0 : (px * dy2 - dx2 * py) / den;
  const h = den === 0 ? 0 : (dx1 * py - px * dy1) / den;
  return [
    q[1].x - q[0].x + g * q[1].x, q[3].x - q[0].x + h * q[3].x, q[0].x,
    q[1].y - q[0].y + g * q[1].y, q[3].y - q[0].y + h * q[3].y, q[0].y,
    g, h,
  ];
}

/**
 * Perspective-normalizes one channel to WARP_SIZE x WARP_SIZE by bilinear sampling
 * at cell centres. Centred sampling matters: the CV.warp shipped with js-aruco2
 * samples one pixel off-centre, so a card turned by 180 degrees no longer lines
 * up with its reference.
 */
function warpChannel(source: CvImage, corners: CardCorners): Float32Array {
  const [a, b, c, d, e, f, g, h] = squareToQuad(corners);
  const { width, height, data } = source;
  const warped = new Float32Array(WARP_SIZE * WARP_SIZE);
  for (let row = 0; row < WARP_SIZE; row++) {
    const v = (row + 0.5) / WARP_SIZE;
    for (let col = 0; col < WARP_SIZE; col++) {
      const u = (col + 0.5) / WARP_SIZE;
      const w = g * u + h * v + 1;
      const x = Math.min(width - 1, Math.max(0, (a * u + b * v + c) / w));
      const y = Math.min(height - 1, Math.max(0, (d * u + e * v + f) / w));
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      const fx = x - x0, fy = y - y0;
      warped[row * WARP_SIZE + col] =
        (1 - fy) * ((1 - fx) * data[y0 * width + x0]! + fx * data[y0 * width + x1]!) +
        fy * ((1 - fx) * data[y1 * width + x0]! + fx * data[y1 * width + x1]!);
    }
  }
  return warped;
}

function pooledChannel(source: CvImage, corners: CardCorners, out: Float32Array, offset: number): void {
  const warped = warpChannel(source, corners);
  let mean = 0;
  for (let cellY = 0; cellY < FEATURE_GRID; cellY++) {
    for (let cellX = 0; cellX < FEATURE_GRID; cellX++) {
      let sum = 0;
      for (let dy = 0; dy < POOL; dy++) {
        const row = (cellY * POOL + dy) * WARP_SIZE + cellX * POOL;
        for (let dx = 0; dx < POOL; dx++) sum += warped[row + dx]!;
      }
      const value = sum / (POOL * POOL);
      out[offset + cellY * FEATURE_GRID + cellX] = value;
      mean += value;
    }
  }
  mean /= CELLS;
  for (let i = 0; i < CELLS; i++) out[offset + i]! -= mean;
}

/**
 * Perspective-normalizes the quad and returns a unit-length appearance vector.
 * Subtracting each channel's mean and normalizing the whole vector removes
 * uniform brightness and gain changes, so the score reflects the printed pattern.
 * A featureless quad (blank paper) returns all zeros and matches nothing.
 */
export function describeCard(prepared: PreparedFrame, corners: CardCorners): Float32Array {
  const feature = new Float32Array(FEATURE_LENGTH);
  pooledChannel(prepared.grey, corners, feature, 0);
  pooledChannel(prepared.red, corners, feature, CELLS);
  let squared = 0;
  for (let i = 0; i < FEATURE_LENGTH; i++) squared += feature[i]! * feature[i]!;
  const norm = Math.sqrt(squared);
  if (norm < MIN_PATTERN_RMS * Math.sqrt(FEATURE_LENGTH)) return new Float32Array(FEATURE_LENGTH);
  for (let i = 0; i < FEATURE_LENGTH; i++) feature[i]! /= norm;
  return feature;
}

/** The same card seen turned by 180 degrees: each channel's grid reversed. */
export function rotateFeature180(feature: Float32Array): Float32Array {
  assertFeature(feature);
  const turned = new Float32Array(FEATURE_LENGTH);
  for (let i = 0; i < CELLS; i++) {
    turned[i] = feature[CELLS - 1 - i]!;
    turned[CELLS + i] = feature[FEATURE_LENGTH - 1 - i]!;
  }
  return turned;
}

/** Cosine similarity of two unit-length appearance vectors, -1..1. */
export function similarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < FEATURE_LENGTH; i++) dot += a[i]! * b[i]!;
  return dot;
}

/**
 * How alike a card looks when turned by 180 degrees, -1..1. Near 1 means the
 * heading cannot be recovered from appearance. Informational: use it to suggest
 * `pointSymmetric` at enrollment, not as a calibrated test.
 */
export function halfTurnSimilarity(feature: Float32Array): number {
  return similarity(feature, rotateFeature180(feature));
}

export function assertFeature(feature: Float32Array): void {
  if (feature.length !== FEATURE_LENGTH) {
    throw new Error(`Card appearance must have ${FEATURE_LENGTH} values; got ${feature.length}. Re-enroll the card.`);
  }
}
