// components/plan/basemapGeometry.ts — P1
//
// The building fabric under the plan: what makes the canvas read as a place
// rather than as a diagram on a dark field.
//
// Buildings are placed along STREET FRONTAGES, not on a lattice. That is the
// whole idea, and the earlier version got it wrong: a jittered grid of parcels
// is still a grid, and it read as graph paper no matter how much the roads
// around it curved. Real cities line their streets — parcels follow the road,
// turn when it turns, and leave the middle of a block hollow. Generating off
// the road geometry means the fabric inherits whatever shape the network has,
// so an organic network produces an organic city for free.
//
// Three properties it has to keep:
//
//   1. DERIVED, never authored — everything comes from the scenario's own
//      roads and venue, so a new scenario JSON gets a city and nothing here
//      hard-codes a place (AGENTS.md §2.1).
//   2. DETERMINISTIC — a seeded LCG keyed off the scenario, so the same world
//      draws the same city on four laptops and across every re-render.
//   3. TWO DOM NODES — a scenario this size yields well over a thousand
//      parcels; as elements they would make every hit test crawl, so each tone
//      is emitted as one long path.

import type { Vec2, WorldState } from '@/lib/sim/types';

/** Distance along a street between parcels, in metres. */
const PITCH_MIN = 30;
const PITCH_MAX = 58;
/** Setback from the road centreline to the building line. */
const SETBACK_MIN = 15;
const SETBACK_MAX = 27;
/** Parcel size: frontage along the street, and depth back from it.
 *  Generous for real buildings, deliberately: a whole district in frame puts
 *  about a tenth of a pixel on a metre, and a true-to-life 15 m shopfront is
 *  then invisible. These are the smallest sizes that still read as a street
 *  wall at the fitted view, and they are texture, not surveyed footprints. */
const FRONT_MIN = 20;
const FRONT_MAX = 46;
const DEPTH_MIN = 18;
const DEPTH_MAX = 42;
/** Gaps in the street wall. A continuous terrace reads as a wall, not a city. */
const SKIP_CHANCE = 0.18;
/** Nothing is built inside this radius of the venue — that is its apron. */
const VENUE_CLEAR_M = 250;

export interface BasemapGeometry {
  massLight: string;
  massDark: string;
  /** Parcels that fall inside a residential block, keyed by block id.
   *  Split out so ResidentLayer can paint the homes a plan actually hurts.
   *  They are drawn in the ordinary fabric colour until something happens to
   *  them, so the city looks the same until the plan costs somebody. */
  blockMass: { id: string; d: string }[];
  count: number;
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

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One parcel, as a rotated rectangle aligned to the street it faces. */
function parcel(
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  front: number,
  depth: number,
): string {
  // (ax, ay) is the unit vector along the street; its perpendicular is the
  // depth axis. Building the corners from those two keeps each parcel square to
  // its own frontage however the road is turning.
  const hx = (ax * front) / 2;
  const hy = (ay * front) / 2;
  const dx = (-ay * depth) / 2;
  const dy = (ax * depth) / 2;
  const p = (sx: number, sy: number) =>
    `${(cx + hx * sx + dx * sy).toFixed(1)},${(cy + hy * sx + dy * sy).toFixed(1)}`;
  return `M${p(-1, -1)}L${p(1, -1)}L${p(1, 1)}L${p(-1, 1)}Z`;
}

export function buildBasemapGeometry(world: WorldState): BasemapGeometry {
  const { bbox } = world;
  const rng = makeRng(
    Math.round(
      Math.abs(bbox.minX) * 7919 + Math.abs(bbox.maxY) * 104729 + world.baseRoads.length * 31,
    ),
  );

  const light: string[] = [];
  const dark: string[] = [];
  let count = 0;

  // Blocks, with a bbox each so the point-in-polygon test only runs for
  // parcels that could possibly be inside one.
  const blocks = world.blocks.map((b) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of b.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { id: b.id, poly: b.polygon, minX, minY, maxX, maxY, parts: [] as string[] };
  });

  const venue = world.venue.pos;
  const venueClear2 = VENUE_CLEAR_M * VENUE_CLEAR_M;

  for (const road of world.baseRoads) {
    for (let i = 0; i < road.path.length - 1; i++) {
      const a: Vec2 = road.path[i];
      const b: Vec2 = road.path[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1) continue;
      const ax = (b.x - a.x) / segLen;
      const ay = (b.y - a.y) / segLen;

      // Walk the segment, dropping a parcel on each side as we go. Starting at
      // a random offset stops every street beginning with a building at the
      // junction, which is the tell that something was generated.
      let t = rng() * PITCH_MAX;
      while (t < segLen) {
        const pitch = PITCH_MIN + rng() * (PITCH_MAX - PITCH_MIN);

        for (const side of [-1, 1] as const) {
          if (rng() < SKIP_CHANCE) continue;

          const setback = SETBACK_MIN + rng() * (SETBACK_MAX - SETBACK_MIN);
          const depth = DEPTH_MIN + rng() * (DEPTH_MAX - DEPTH_MIN);
          const front = Math.min(FRONT_MIN + rng() * (FRONT_MAX - FRONT_MIN), pitch - 4);
          if (front < 6) continue;

          // Centre of the parcel: along the street by t, out by the setback
          // plus half the depth, on this side.
          const off = setback + depth / 2;
          const cx = a.x + ax * t + -ay * off * side;
          const cy = a.y + ay * t + ax * off * side;

          const dvx = cx - venue.x;
          const dvy = cy - venue.y;
          if (dvx * dvx + dvy * dvy < venueClear2) continue;
          if (cx < bbox.minX || cx > bbox.maxX || cy < bbox.minY || cy > bbox.maxY) continue;

          // A slight splay keeps the street wall from looking extruded.
          const jx = ax + -ay * (rng() - 0.5) * 0.18;
          const jy = ay + ax * (rng() - 0.5) * 0.18;
          const jl = Math.hypot(jx, jy) || 1;

          const d = parcel(cx, cy, jx / jl, jy / jl, front, depth);
          // A parcel inside a residential block belongs to that block's bucket
          // rather than to the general fabric, so it can be repainted later.
          let claimed = false;
          for (const b of blocks) {
            if (cx < b.minX || cx > b.maxX || cy < b.minY || cy > b.maxY) continue;
            if (!pointInPolygon({ x: cx, y: cy }, b.poly)) continue;
            b.parts.push(d);
            claimed = true;
            break;
          }
          if (!claimed) (rng() < 0.24 ? dark : light).push(d);
          count++;
        }

        t += pitch;
      }
    }
  }

  return {
    massLight: light.join(''),
    massDark: dark.join(''),
    blockMass: blocks.filter((b) => b.parts.length > 0).map((b) => ({ id: b.id, d: b.parts.join('') })),
    count,
  };
}

// Cache by scenario id. A scenario switch is the only thing that invalidates
// it: nothing the user does to a plan moves a building.
const cache = new Map<string, BasemapGeometry>();

export function basemapFor(world: WorldState): BasemapGeometry {
  const key = world.scenario.id;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildBasemapGeometry(world);
  cache.set(key, built);
  return built;
}
