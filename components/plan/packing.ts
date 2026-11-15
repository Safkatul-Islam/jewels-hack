// components/plan/packing.ts — P1
//
// What a facility is not allowed to be built on.
//
// Until now a park-and-ride packed its stalls into a square and drew them,
// whatever was already there — rows marched straight through the stadium bowl
// and across live roads. The capacity was an assumption ("you asked for 2,500,
// so you have 2,500") rather than anything the site had agreed to.
//
// This module answers one question for a given piece: for a point in that
// piece's own local frame, is the ground free? facilityGeometry.ts scanlines
// that answer into rows, so stalls break, shorten and vanish around whatever
// is in the way, and the count that comes back out is what actually FITS.
//
// That count then becomes Piece.capacity, which is what simulate() reads — so
// shoving a vendor village into a park-and-ride removes spaces, which removes
// transit share, which moves the egress median and the plan score. Geometry
// feeding the simulation is the thing the reference is really selling.

import type { Piece, Vec2, WorldState } from '@/lib/sim/types';
import { PIECE_META } from '@/lib/pieces';
import { footprintFor } from '@/components/plan/facilityGeometry';

/** Clearance kept around the venue bowl, in metres. */
const VENUE_MARGIN_M = 30;
/** Half-width kept clear either side of a road centreline, by class. */
const ROAD_CLEAR_M: Record<string, number> = {
  arterial: 16,
  collector: 11,
  local: 7,
  path: 6,
  shuttle: 6,
};
/** Clearance between two facilities. */
const PIECE_MARGIN_M = 4;

/**
 * Local metres (origin at the piece centre, +y DOWN to match screen space and
 * the piece's rotate transform) → world metres.
 *
 * `rotation` is radians clockwise from north, as the contract defines it, and
 * is applied on screen; world y is up while local y is down, hence the flip on
 * the second component.
 */
function localToWorld(piece: Piece, lx: number, ly: number): Vec2 {
  const c = Math.cos(piece.rotation);
  const s = Math.sin(piece.rotation);
  return {
    x: piece.pos.x + (lx * c - ly * s),
    y: piece.pos.y - (lx * s + ly * c),
  };
}

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

export type Blocker = (lx: number, ly: number) => boolean;

/**
 * Build the obstruction test for one piece. Everything is pre-filtered to the
 * piece's own reach first: a facility 2 km away cannot block this one, and
 * testing every road in the scenario per cell would make a drop cost more than
 * the simulation it triggers.
 */
export function makeBlocker(world: WorldState, piece: Piece): Blocker {
  const size = footprintFor(piece.kind, piece.capacity);
  // Diagonal half-span: the furthest a local point can be from the centre.
  const reach = (size * Math.SQRT2) / 2 + 40;
  const near = (p: Vec2) => {
    const dx = p.x - piece.pos.x;
    const dy = p.y - piece.pos.y;
    return dx * dx + dy * dy < reach * reach;
  };

  // --- the venue bowl ---
  const venueR = 125 + VENUE_MARGIN_M;
  const venueInReach = near(world.venue.pos);

  // --- other pieces, as their own rotated squares ---
  const others = world.pieces
    .filter((p) => p.id !== piece.id && near(p.pos))
    .map((p) => ({
      pos: p.pos,
      half: footprintFor(p.kind, p.capacity) / 2 + PIECE_MARGIN_M,
      cos: Math.cos(p.rotation),
      sin: Math.sin(p.rotation),
    }));

  // --- roads, as segments with a class-dependent half-width ---
  const segments: { a: Vec2; b: Vec2; clear2: number }[] = [];
  for (const road of world.baseRoads) {
    const clear = ROAD_CLEAR_M[road.class] ?? 8;
    for (let i = 0; i < road.path.length - 1; i++) {
      const a = road.path[i];
      const b = road.path[i + 1];
      if (!near(a) && !near(b)) continue;
      segments.push({ a, b, clear2: clear * clear });
    }
  }

  return (lx: number, ly: number): boolean => {
    const w = localToWorld(piece, lx, ly);

    if (venueInReach) {
      const dx = w.x - world.venue.pos.x;
      const dy = w.y - world.venue.pos.y;
      if (dx * dx + dy * dy < venueR * venueR) return true;
    }

    for (const o of others) {
      // into that piece's local frame, then a box test
      const dx = w.x - o.pos.x;
      const dy = o.pos.y - w.y;
      const ox = dx * o.cos + dy * o.sin;
      const oy = -dx * o.sin + dy * o.cos;
      if (Math.abs(ox) < o.half && Math.abs(oy) < o.half) return true;
    }

    for (const s of segments) {
      if (distSqToSegment(w, s.a, s.b) < s.clear2) return true;
    }

    return false;
  };
}

/**
 * A key identifying everything that could block this piece. The facility cache
 * is keyed on (kind, capacity) alone, which would happily serve a layout packed
 * around obstructions that have since moved — so the key has to carry them.
 */
export function blockerKey(world: WorldState, piece: Piece): string {
  const size = footprintFor(piece.kind, piece.capacity);
  const reach = (size * Math.SQRT2) / 2 + 40;
  const parts: string[] = [`${piece.pos.x},${piece.pos.y},${piece.rotation.toFixed(3)}`];
  for (const p of world.pieces) {
    if (p.id === piece.id) continue;
    const dx = p.pos.x - piece.pos.x;
    const dy = p.pos.y - piece.pos.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    parts.push(`${p.id}:${p.pos.x},${p.pos.y},${p.rotation.toFixed(2)},${p.capacity}`);
  }
  // Roads and the venue are fixed for a scenario, so the id is enough for them.
  return `${world.scenario.id}|${parts.join('|')}`;
}

/** Unit label for the fitted count, per kind. */
export function fittedUnitLabel(kind: Piece['kind']): string {
  return PIECE_META[kind].unit;
}
