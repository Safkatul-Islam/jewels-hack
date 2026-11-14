// components/home/corridorModel.ts — P1
//
// The landing page's corridor, as plain numbers on a flat plan: the venue, the
// arrival anchors, a loose road lattice, the egress wave, the residential
// blocks, the businesses at the rail anchor.
//
// Two things draw this: `CorridorField.tsx` projects it with one affine matrix
// into an SVG that needs no JavaScript, and `CorridorCanvas.tsx` builds it as a
// three.js scene. They have to agree down to the metre, which is why the
// numbers live here and not in either of them.
//
// It is NOT the real engine, and it should not become it. It is the same visual
// language as the plan canvas, drawn from a handful of parameters, so that `/`
// and `/plan` read as one object.
//
// Geometry is generated at module scope with a seeded LCG, so the drawing is
// byte-identical on every render and on four different laptops — no hydration
// mismatch, no Math.random.

const SEED = 20280714;

/**
 * A second stream, used only for the drift timings. Keeping it separate means
 * the motion parameters can be retuned without moving a single dot, block or
 * shop in the static composition — which was tuned by eye and is easy to break.
 */
const MOTION_SEED = SEED + 7771;

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export type Pt = [number, number];

/**
 * venue → primary anchor. Everything else is arranged around this line, and
 * both ends have to stay on screen in both renderers.
 */
export const SPINE: Pt[] = [
  [560, 530],
  [652, 482],
  [736, 424],
  [822, 362],
  [900, 302],
];

export function pointOnSpine(t: number): Pt {
  const seg = Math.min(Math.floor(t * (SPINE.length - 1)), SPINE.length - 2);
  const f = t * (SPINE.length - 1) - seg;
  return [
    SPINE[seg][0] + (SPINE[seg + 1][0] - SPINE[seg][0]) * f,
    SPINE[seg][1] + (SPINE[seg + 1][1] - SPINE[seg][1]) * f,
  ];
}

/** Unit tangent of the spine at t — the direction the wave travels there. */
export function spineTangent(t: number): Pt {
  const seg = Math.min(Math.floor(t * (SPINE.length - 1)), SPINE.length - 2);
  const dx = SPINE[seg + 1][0] - SPINE[seg][0];
  const dy = SPINE[seg + 1][1] - SPINE[seg][1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

export interface Road {
  pts: Pt[];
  major: boolean;
}

export interface FlowDot {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  /** Where it drifts to, in plan units. */
  dx: number;
  dy: number;
  dur: number;
  /** Negative: the cycle is already under way on first paint. */
  delay: number;
}

/** A footprint standing on the ground plane. */
export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

function buildGeometry() {
  const rnd = makeRng(SEED);
  const roads: Road[] = [];

  // north–south runs, sheared slightly so the lattice never reads as a grid
  for (let i = 0; i < 9; i++) {
    const pts: Pt[] = [];
    for (let j = 0; j < 5; j++) {
      pts.push([70 + i * 142 + j * 26 + (rnd() - 0.5) * 34, -40 + j * 220 + (rnd() - 0.5) * 30]);
    }
    roads.push({ pts, major: i % 3 === 1 });
  }

  // east–west runs, drifting up toward the anchor
  for (let i = 0; i < 6; i++) {
    const pts: Pt[] = [];
    for (let j = 0; j < 6; j++) {
      pts.push([-40 + j * 268 + (rnd() - 0.5) * 30, 92 + i * 126 - j * 16 + (rnd() - 0.5) * 26]);
    }
    roads.push({ pts, major: i === 2 });
  }

  // The egress wave: sampled spectators, fanning out as they travel.
  //
  // Each dot also carries where it drifts to (`dx`/`dy`: the local spine
  // tangent, fanned sideways in proportion to how far off the spine it already
  // sits), how long it takes, and a negative start offset so the 190 dots are
  // spread across the cycle instead of pulsing in unison.
  const drift = makeRng(MOTION_SEED);
  const flow: FlowDot[] = Array.from({ length: 190 }, (_, i) => {
    const t = i / 190;
    const [x, y] = pointOnSpine(t);
    const spread = 9 + t * 46;
    const jitterX = (rnd() - 0.5) * 30;
    const lateral = (rnd() - 0.5) * spread;
    const [tx, ty] = spineTangent(t);
    const fan = (lateral / Math.max(spread, 1)) * 0.5;
    const reach = 62 + drift() * 56;
    const dur = 15 + drift() * 9;
    return {
      cx: x + jitterX,
      cy: y + lateral,
      r: 0.9 + rnd() * 1.5,
      opacity: 0.16 + (1 - t) * 0.62,
      dx: (tx - ty * fan) * reach,
      dy: (ty + tx * fan) * reach,
      dur,
      delay: -drift() * dur,
    };
  });

  const shops = Array.from({ length: 16 }, (_, i) => ({
    cx: 752 + (i % 6) * 28 + (rnd() - 0.5) * 16,
    cy: 252 + Math.floor(i / 6) * 32 + (rnd() - 0.5) * 14,
  }));

  // The ground plane's own grid.
  const grid: Pt[][] = [];
  for (let x = -520; x <= 1860; x += 84) grid.push([[x, -420], [x, 940]]);
  for (let y = -420; y <= 940; y += 84) grid.push([[-520, y], [1860, y]]);

  return { roads, flow, shops, grid };
}

export const { roads, flow, shops, grid } = buildGeometry();

export const VENUE: Pt = [560, 530];

/**
 * The venue as a bowl: an outer wall flaring up from the ground to a rim, with
 * the pitch sunk inside it. A planning model of a stadium, not a render of one.
 */
export const VENUE_BOWL = { rFoot: 46, rRim: 60, rPitch: 29, h: 66, pitchH: 20 };

/** The dashed perimeter on the ground — the venue's own footprint. */
export const VENUE_PERIMETER = 104;

// Kept clear of the venue's ring and below the spine, so the corridor reads as
// running past the neighbourhood rather than through a pile of rectangles.
export const BLOCKS: Footprint[] = [
  { x: 432, y: 622, w: 132, d: 84, h: 30 },
  { x: 660, y: 578, w: 132, d: 84, h: 24 },
  { x: 820, y: 470, w: 132, d: 84, h: 19 },
];

export const SHOP_FOOTPRINTS: Footprint[] = shops.map((s) => ({
  x: s.cx - 7,
  y: s.cy - 5,
  w: 14,
  d: 10,
  h: 7,
}));

export const RAIL_ANCHOR: Footprint = { x: 900, y: 284, w: 18, d: 18, h: 26 };
export const LOT_ANCHOR: Footprint = { x: 352, y: 656, w: 14, d: 14, h: 15 };

/** Clear of the bowl, not parked in it. */
export const SHUTTLE_START = pointOnSpine(0.18);
export const SHUTTLE: Footprint = {
  x: SHUTTLE_START[0] - 11,
  y: SHUTTLE_START[1] - 6,
  w: 22,
  d: 13,
  h: 11,
};
/** One leg of the shuttle run, in plan units. It reverses rather than looping. */
export const SHUTTLE_SECONDS = 30;

/* ------------------------------------------------------------------
   Scene units

   The plan is authored in the same arbitrary units both renderers use.
   three.js is happier with a scene a few units across than one 1400
   units across — near/far planes, light falloff and camera framing all
   get easier — so the 3D side divides by this and re-centres on the
   venue. Nothing else in the project should need it.
   ------------------------------------------------------------------ */
export const SCENE_SCALE = 100;

/** Plan (x, y) → scene (x, z), with the venue at the origin and −z away. */
export function toScene(x: number, y: number): [number, number] {
  return [(x - VENUE[0]) / SCENE_SCALE, (y - VENUE[1]) / SCENE_SCALE];
}

/** A plan length → a scene length. */
export function toSceneLength(v: number): number {
  return v / SCENE_SCALE;
}
