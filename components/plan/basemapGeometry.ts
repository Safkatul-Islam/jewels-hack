// components/plan/basemapGeometry.ts — P1
//
// The city fabric under the plan: the building masses that make the canvas read
// as a place rather than as graph paper.
//
// Three rules it exists to satisfy:
//
//   1. It is DERIVED, never authored. Every building is generated from the
//      scenario's own bbox, roads, blocks and venue, so a new scenario JSON gets
//      a city for free and nothing here hard-codes a place. (AGENTS.md §2.1 —
//      no place names, distances or coordinates outside the scenario file.)
//
//   2. It is DETERMINISTIC. A seeded LCG keyed off the bbox, so the same
//      scenario draws the same city on four different laptops and across every
//      re-render. No Math.random, no hydration mismatch, and the result can be
//      cached by scenario id.
//
//   3. It is ONE PATH, not a thousand rects. A 3.9 x 3.4 km scenario yields
//      roughly a thousand buildings; as individual elements they would make
//      every hit test and repaint crawl. Emitting a single `d` string per tone
//      keeps the whole backdrop at two DOM nodes.
//
// Buildings are kept clear of the roads, the blocks and the venue, so the
// network cuts visible streets through the fabric instead of sitting on top of
// a solid mat.

import type { BBox, Vec2, WorldState } from '@/lib/sim/types';

/** Spacing of the candidate lattice, in metres. Coarser than a real city block
 *  on purpose: this is texture at a 3-4 km viewport, not a survey. */
const STEP_M = 86;

/** Half-widths of a building, in metres, before jitter. */
const MIN_SIZE_M = 26;
const MAX_SIZE_M = 58;

/** Keep-out distances. A building inside these reads as a mistake, not texture. */
const ROAD_CLEAR_M = 34;
const VENUE_CLEAR_M = 260;
const BLOCK_CLEAR_M = 20;

export interface BasemapGeometry {
  /** Two tone buckets, each a single SVG path in WORLD metres (y up). */
  massLight: string;
  massDark: string;
  /** Count, for the readout — it is honest about being generated. */
  count: number;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Squared distance from p to segment ab. Squared, because every use below is a
 *  comparison against a threshold and the sqrt is pure cost. */
function distSqToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return dx * dx + dy * dy;
}

function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function bboxOf(points: readonly Vec2[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Build the fabric. Pure, and cheap enough to call on a scenario switch
 * (~4k candidates, a few hundred segment tests each at worst) — but it is
 * cached by `basemapFor` below, which is what components should use.
 */
export function buildBasemapGeometry(world: WorldState): BasemapGeometry {
  const { bbox } = world;
  const rng = makeRng(
    Math.round(bbox.minX * 7919 + bbox.maxY * 104729 + world.blocks.length * 31),
  );

  // Flatten the roads once. Each seed is a polyline; we test against its
  // segments, and segments are what the keep-out is really about.
  const segments: { a: Vec2; b: Vec2 }[] = [];
  for (const road of world.baseRoads) {
    for (let i = 0; i < road.path.length - 1; i++) {
      segments.push({ a: road.path[i], b: road.path[i + 1] });
    }
  }

  // Buildings are drawn INSIDE the residential blocks too, and more densely.
  // A block left empty reads as a park; a block packed with fabric reads as the
  // several hundred people the contract says live there — which is who the plan
  // is being charged against. Pre-compute each polygon's bbox so the expensive
  // point-in-polygon test only runs for candidates that could be inside one.
  const blocks = world.blocks.map((b) => ({ poly: b.polygon, box: bboxOf(b.polygon) }));

  const roadClear2 = ROAD_CLEAR_M * ROAD_CLEAR_M;
  const venueClear2 = VENUE_CLEAR_M * VENUE_CLEAR_M;

  const light: string[] = [];
  const dark: string[] = [];
  let count = 0;

  // The lattice runs at half a step so residential blocks can be filled at
  // double density; outside them, every other point is dropped. Indices rather
  // than a float accumulator, because "is this a coarse point" has to be an
  // exact test and `x % STEP_M === 0` never holds on an accumulated float.
  const sub = STEP_M / 2;
  const cols = Math.floor((bbox.maxX - bbox.minX) / sub);
  const rows = Math.floor((bbox.maxY - bbox.minY) / sub);

  for (let ix = 0; ix <= cols; ix++) {
    for (let iy = 0; iy <= rows; iy++) {
      const x = bbox.minX + ix * sub;
      const y = bbox.minY + iy * sub;
      const coarse = ix % 2 === 0 && iy % 2 === 0;
      const cx = x + (rng() - 0.5) * sub * 0.55;
      const cy = y + (rng() - 0.5) * sub * 0.55;
      const p = { x: cx, y: cy };

      let inBlock = false;
      for (const b of blocks) {
        if (
          cx >= b.box.minX - BLOCK_CLEAR_M &&
          cx <= b.box.maxX + BLOCK_CLEAR_M &&
          cy >= b.box.minY - BLOCK_CLEAR_M &&
          cy <= b.box.maxY + BLOCK_CLEAR_M &&
          pointInPolygon(p, b.poly)
        ) {
          inBlock = true;
          break;
        }
      }

      // Outside a block the lattice is coarse and thinned — a perfect grid of
      // buildings reads as wallpaper. Inside one it stays fine-grained, so a
      // residential block looks inhabited rather than paved.
      if (!inBlock) {
        if (!coarse) continue;
        if (rng() < 0.22) continue;
      }

      const dvx = cx - world.venue.pos.x;
      const dvy = cy - world.venue.pos.y;
      if (dvx * dvx + dvy * dvy < venueClear2) continue;

      let blocked = false;
      for (const seg of segments) {
        if (distSqToSegment(p, seg.a, seg.b) < roadClear2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const scale = inBlock ? 0.55 : 1;
      const w = (MIN_SIZE_M + rng() * (MAX_SIZE_M - MIN_SIZE_M)) * scale;
      const h = (MIN_SIZE_M + rng() * (MAX_SIZE_M - MIN_SIZE_M)) * scale;
      // Axis-aligned. Rotated masses look hand-drawn; a map's footprints read as
      // orthogonal even when the streets are not.
      const subpath = `M${(cx - w / 2).toFixed(1)},${(cy - h / 2).toFixed(1)}h${w.toFixed(1)}v${h.toFixed(1)}h${(-w).toFixed(1)}Z`;
      (rng() < 0.26 ? dark : light).push(subpath);
      count++;
    }
  }

  return { massLight: light.join(''), massDark: dark.join(''), count };
}

// Cache by scenario id. A scenario switch is the only thing that invalidates it:
// nothing the user does to a plan moves a building.
const cache = new Map<string, BasemapGeometry>();

export function basemapFor(world: WorldState): BasemapGeometry {
  const key = world.scenario.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildBasemapGeometry(world);
  cache.set(key, built);
  return built;
}
