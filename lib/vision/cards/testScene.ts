// Synthetic scenes for cards.test.ts only. These are drawn card-like patterns,
// not photographs of real playing cards, and prove nothing about a real camera.
import type { CardCorners, Frame, Vec2 } from './types';

type Rgb = readonly [number, number, number];
export const RED: Rgb = [200, 30, 40];
export const BLACK: Rgb = [25, 25, 30];
const PAPER: Rgb = [244, 242, 236];

export interface CardFace {
  /** Pip centres in card units: x 0..1 across the short side, y 0..1 down the long side. */
  pips: readonly Vec2[];
  color: Rgb;
  /** Extra filled rectangles [x0, y0, x1, y1] in card units, for a court-card-like face. */
  blocks?: readonly (readonly [number, number, number, number, Rgb])[];
  /** No rank index marks: a completely unprinted face. */
  plain?: boolean;
}

const column = (ys: number[], x: number): Vec2[] => ys.map((y) => ({ x, y }));
export const FACES = {
  redFive: { color: RED, pips: [...column([0.2, 0.8], 0.28), ...column([0.2, 0.8], 0.72), { x: 0.5, y: 0.5 }] },
  redFour: { color: RED, pips: [...column([0.2, 0.8], 0.28), ...column([0.2, 0.8], 0.72)] },
  blackSeven: { color: BLACK, pips: [...column([0.2, 0.5, 0.8], 0.28), ...column([0.2, 0.5, 0.8], 0.72), { x: 0.5, y: 0.35 }] },
  blackTwo: { color: BLACK, pips: column([0.22, 0.78], 0.5) },
  court: {
    color: BLACK, pips: [],
    blocks: [[0.2, 0.14, 0.8, 0.5, RED], [0.2, 0.5, 0.8, 0.86, BLACK], [0.34, 0.24, 0.66, 0.4, PAPER], [0.3, 0.6, 0.5, 0.78, RED]],
  },
  blank: { color: BLACK, pips: [], plain: true },
} satisfies Record<string, CardFace>;

const PIP_RADIUS = 0.085; // in card widths
const CARD_ASPECT = 1.4;
const CORNER_RADIUS = 0.06;

function faceColor(face: CardFace, u: number, v: number): Rgb {
  // Rank index: a small mark at the top-left and, turned, at the bottom-right.
  if (!face.plain && ((Math.abs(u - 0.1) < 0.04 && Math.abs(v - 0.07) < 0.035) || (Math.abs(u - 0.9) < 0.04 && Math.abs(v - 0.93) < 0.035))) {
    return face.color;
  }
  for (const pip of face.pips) {
    if (Math.hypot(u - pip.x, (v - pip.y) * CARD_ASPECT) < PIP_RADIUS) return face.color;
  }
  let color: Rgb = PAPER;
  for (const [x0, y0, x1, y1, fill] of face.blocks ?? []) if (u >= x0 && u <= x1 && v >= y0 && v <= y1) color = fill;
  return color;
}

function insideRoundedCard(u: number, v: number): boolean {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  // Work in card widths so the corner is a true circular arc.
  const y = v * CARD_ASPECT;
  const dx = Math.max(0, CORNER_RADIUS - Math.min(u, 1 - u));
  const dy = Math.max(0, CORNER_RADIUS - Math.min(y, CARD_ASPECT - y));
  return Math.hypot(dx, dy) <= CORNER_RADIUS;
}

/** Image -> unit-square coefficients: the inverse of the unit-square -> quad projective map. */
function inverseHomography(q: CardCorners): number[] {
  const px = q[0].x - q[1].x + q[2].x - q[3].x, py = q[0].y - q[1].y + q[2].y - q[3].y;
  const dx1 = q[1].x - q[2].x, dx2 = q[3].x - q[2].x, dy1 = q[1].y - q[2].y, dy2 = q[3].y - q[2].y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (px * dy2 - dx2 * py) / den, h = (dx1 * py - px * dy1) / den;
  const a = q[1].x - q[0].x + g * q[1].x, b = q[3].x - q[0].x + h * q[3].x, c = q[0].x;
  const d = q[1].y - q[0].y + g * q[1].y, e = q[3].y - q[0].y + h * q[3].y, f = q[0].y;
  return [e - f * h, c * h - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
}

export interface PlacedCard { face: CardFace; corners: CardCorners }

/**
 * Card corners (top-left, top-right, bottom-right, bottom-left) for a card of
 * `widthPx` centred at `centre`, turned clockwise on screen by `angle` radians.
 * `taper` below 1 narrows the top edge, a mild stand-in for an angled camera.
 */
export function placeCard(face: CardFace, centre: Vec2, widthPx: number, angle = 0, taper = 1): PlacedCard {
  const halfW = widthPx / 2, halfH = (widthPx * CARD_ASPECT) / 2, cos = Math.cos(angle), sin = Math.sin(angle);
  const at = (x: number, y: number): Vec2 => ({ x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos });
  return { face, corners: [at(-halfW * taper, -halfH), at(halfW * taper, -halfH), at(halfW, halfH), at(-halfW, halfH)] };
}

export interface SceneOptions {
  width?: number;
  height?: number;
  /** Peak-to-peak uniform sensor noise in grey levels. */
  noise?: number;
  /** Brightness multiplier at the left and right edges, interpolated across the frame. */
  lighting?: readonly [number, number];
  /** Surface brightness, 0-255. */
  surface?: number;
  seed?: number;
}

export function renderScene(cards: readonly PlacedCard[], options: SceneOptions = {}): Frame {
  const { width = 640, height = 360, noise = 10, lighting = [1, 1], surface = 48, seed = 7 } = options;
  const inverses = cards.map((card) => inverseHomography(card.corners));
  const data = new Uint8ClampedArray(width * height * 4);
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const SUB = [0.25, 0.75];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sum = [0, 0, 0];
      for (const oy of SUB) for (const ox of SUB) {
        let color: Rgb = [surface, surface, surface + 4];
        for (let i = 0; i < cards.length; i++) {
          const m = inverses[i]!, sx = x + ox, sy = y + oy, w = m[6]! * sx + m[7]! * sy + m[8]!;
          const u = (m[0]! * sx + m[1]! * sy + m[2]!) / w, v = (m[3]! * sx + m[4]! * sy + m[5]!) / w;
          if (insideRoundedCard(u, v)) { color = faceColor(cards[i]!.face, u, v); break; }
        }
        sum[0]! += color[0]; sum[1]! += color[1]; sum[2]! += color[2];
      }
      const gain = lighting[0] + ((lighting[1] - lighting[0]) * x) / (width - 1);
      const grain = (random() - 0.5) * noise;
      const p = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) data[p + channel] = (sum[channel]! / 4) * gain + grain;
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}
