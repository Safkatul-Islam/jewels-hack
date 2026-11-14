// ============================================================
// lib/sim/geometry.ts   (P3)
// ============================================================
// Plain-metre geometry helpers shared by network.ts and simulate.ts.
// No place names, no hard-coded distances — just maths on Vec2.

import type { Vec2 } from './types';

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polylineLength(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1]!, path[i]!);
  return total;
}

/** Perpendicular distance from `p` to the segment `a`–`b`, clamped to the segment. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj: Vec2 = { x: a.x + t * abx, y: a.y + t * aby };
  return distance(p, proj);
}

/** Point a given distance along a polyline (nodes as positions), clamped to the ends. */
export function pointAtDistance(path: readonly Vec2[], dist: number): Vec2 {
  if (path.length === 0) throw new Error('pointAtDistance: empty path');
  if (path.length === 1) return path[0]!;
  let remaining = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const segLen = distance(a, b);
    if (remaining <= segLen) {
      const t = segLen === 0 ? 0 : remaining / segLen;
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    remaining -= segLen;
  }
  return path[path.length - 1]!;
}
