// lib/advisor.ts — P1
//
// The thing the voice agent actually calls. It answers "where should this go
// instead?" by sweeping candidate positions through the simulation we already
// ran, NOT by asking a language model for coordinates.
//
// That split is deliberate and it is the whole point:
//
//   The LLM parses intent and narrates. The engine finds the answer.
//
// A model asked for coordinates invents them, and docs/01-ARCHITECTURE.md
// already warns that invented numbers are what a judge catches. Everything
// returned from here is measured — either read straight off the pedestrian
// heatmap the last run produced, or from a real simulate() call.
//
// Nothing here touches React or the store. Callers apply the move.

import type { Heatmap, SimResult, Vec2, WorldState } from '@/lib/sim/types';
import { buildNetwork } from '@/lib/sim/network';
import { simulate } from '@/lib/sim/simulate';
import { PIECE_META } from '@/lib/pieces';

/** Keep candidates off the venue itself. Metres from the venue centre. */
const VENUE_CLEARANCE_M = 170;
/** Most candidates we will ever sweep on the fast path. */
const MAX_FAST_CANDIDATES = 2500;
/** Candidates on the slow path, where each one costs a full simulate(). */
const SLOW_CANDIDATE_COUNT = 12;

export type TargetKind = 'business' | 'piece';

export interface Target {
  kind: TargetKind;
  id: string;
  name: string;
  pos: Vec2;
  /** metres — how far from itself a business draws custom */
  catchmentM: number;
}

export interface Relocation {
  target: Target;
  from: Vec2;
  to: Vec2;
  /** Foot traffic in the catchment, before and after. Person-minutes of exposure. */
  footfallBefore: number;
  footfallAfter: number;
  /** Only for businesses: dollars per event day, from the PRD's own formula. */
  revenueBefore?: number;
  revenueAfter?: number;
  /** How many positions were actually evaluated to reach this. */
  candidatesTried: number;
  /** 'heatmap' = swept against the existing run; 'simulate' = each candidate re-simulated. */
  method: 'heatmap' | 'simulate';
}

// ---------- footfall ----------

/**
 * Foot traffic inside a disc, in the same units as lib/sim/business.ts's
 * integrateHeatmap — cell value times cell area, for cells whose centre falls
 * inside the radius.
 *
 * It is a windowed copy of that function rather than a call to it because the
 * original scans every cell in the grid. At one call that is irrelevant; at two
 * thousand candidates over a 156x136 grid it is 28 million distance tests and
 * the voice turn stalls. This one only visits the cells the disc can reach, so
 * a sweep costs about as much as a single full-grid pass. scripts/test-advisor.ts
 * checks the two agree.
 */
export function footfallAt(h: Heatmap, centre: Vec2, radiusM: number): number {
  const cellArea = h.cellM * h.cellM;
  const minCol = Math.max(0, Math.floor((centre.x - radiusM - h.origin.x) / h.cellM));
  const maxCol = Math.min(h.cols - 1, Math.ceil((centre.x + radiusM - h.origin.x) / h.cellM));
  const minRow = Math.max(0, Math.floor((centre.y - radiusM - h.origin.y) / h.cellM));
  const maxRow = Math.min(h.rows - 1, Math.ceil((centre.y + radiusM - h.origin.y) / h.cellM));

  const r2 = radiusM * radiusM;
  let total = 0;
  for (let row = minRow; row <= maxRow; row++) {
    const cy = h.origin.y + (row + 0.5) * h.cellM;
    const dy = cy - centre.y;
    const rowBase = row * h.cols;
    for (let col = minCol; col <= maxCol; col++) {
      const cx = h.origin.x + (col + 0.5) * h.cellM;
      const dx = cx - centre.x;
      if (dx * dx + dy * dy <= r2) total += h.values[rowBase + col]! * cellArea;
    }
  }
  return total;
}

// ---------- finding what the user meant ----------

/** Punctuation and case are noise; "business-1", "Business 1" and "business 1" are one thing. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };

/**
 * Turn spoken numbers into digits: "business twenty one" → "business 21".
 *
 * Speech recognition writes words, and every name in a scenario ends in a
 * numeral, so without this the entire voice path resolves nothing — which is
 * exactly what the first run of this looked like.
 */
function spokenNumbersToDigits(s: string): string {
  const words = s.split(' ');
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const ten = TENS[w];
    if (ten !== undefined) {
      const unit = UNITS[words[i + 1] ?? ''];
      if (unit !== undefined && unit >= 1 && unit <= 9) {
        out.push(String(ten + unit));
        i++; // consumed the unit as well
        continue;
      }
      out.push(String(ten));
      continue;
    }
    const unit = UNITS[w];
    out.push(unit !== undefined ? String(unit) : w);
  }
  return out.join(' ');
}

/** The number a name ends in, which is what actually identifies one of forty shops. */
function trailingNumber(s: string): number | null {
  const m = /(\d+)\s*$/.exec(s);
  return m ? Number(m[1]) : null;
}

interface Candidate extends Target {
  /** every string this thing may reasonably be called, normalised */
  aliases: string[];
}

function candidatesFor(world: WorldState): Candidate[] {
  return [
    ...world.businesses.map((b) => ({
      kind: 'business' as const,
      id: b.id,
      name: b.name,
      pos: b.pos,
      catchmentM: b.catchmentM,
      aliases: [normalise(b.name), normalise(b.id)],
    })),
    ...world.pieces.map((p) => {
      const meta = PIECE_META[p.kind];
      return {
        kind: 'piece' as const,
        id: p.id,
        name: meta?.label ?? p.kind.replace(/_/g, ' '),
        pos: p.pos,
        catchmentM: 80,
        // A piece answers to its kind, its palette label, and its id. Without
        // the label, "pedestrian corridor" misses "ped corridor" entirely.
        aliases: [
          normalise(p.kind.replace(/_/g, ' ')),
          normalise(meta?.label ?? ''),
          normalise(p.id),
        ].filter(Boolean),
      };
    }),
  ];
}

/**
 * Resolve a spoken phrase to something on the map.
 *
 * Refusing to answer is a valid outcome and a deliberate one: moving the wrong
 * shop and then narrating the move confidently is far worse than saying the
 * name was not recognised. So an ambiguous phrase resolves to nothing.
 *
 * The one place that rule needed help is numbers. "business one" used to match
 * nothing (speech gives words, names hold digits) and "business 1" used to
 * match eleven things at once (it is a prefix of 10 through 19), so the two
 * most natural ways to refer to a shop both failed. A trailing number in the
 * query is now matched as a number, not as text.
 */
export function resolveTarget(world: WorldState, query: string): Target | null {
  const q = spokenNumbersToDigits(normalise(query));
  if (!q) return null;

  const candidates = candidatesFor(world);

  const exact = candidates.find((c) => c.aliases.includes(q));
  if (exact) return exact;

  // With a number in the query, that number must match exactly — this is what
  // separates "business 1" from "business 19".
  const wanted = trailingNumber(q);
  if (wanted !== null) {
    const stem = q.replace(/\s*\d+\s*$/, '').trim();
    const numbered = candidates.filter((c) => {
      if (!c.aliases.some((a) => trailingNumber(a) === wanted)) return false;
      if (!stem) return true;
      return c.aliases.some((a) => a.includes(stem) || stem.includes(a.replace(/\s*\d+\s*$/, '').trim()));
    });
    if (numbered.length === 1) return numbered[0]!;
    if (numbered.length > 1) return null; // genuinely ambiguous
  }

  const partial = candidates.filter((c) =>
    c.aliases.some((a) => a.includes(q) || q.includes(a)),
  );
  return partial.length === 1 ? partial[0]! : null;
}

// ---------- the sweep ----------

function candidateGrid(world: WorldState, stepM: number): Vec2[] {
  const { bbox } = world;
  const out: Vec2[] = [];
  const clear2 = VENUE_CLEARANCE_M * VENUE_CLEARANCE_M;
  for (let y = bbox.minY + stepM; y < bbox.maxY; y += stepM) {
    for (let x = bbox.minX + stepM; x < bbox.maxX; x += stepM) {
      const dx = x - world.venue.pos.x;
      const dy = y - world.venue.pos.y;
      if (dx * dx + dy * dy < clear2) continue; // not inside the stadium
      out.push({ x, y });
    }
  }
  return out;
}

/** Step chosen so the sweep stays under MAX_FAST_CANDIDATES for any scenario size. */
function gridStepFor(world: WorldState): number {
  const w = world.bbox.maxX - world.bbox.minX;
  const h = world.bbox.maxY - world.bbox.minY;
  const forBudget = Math.sqrt((w * h) / MAX_FAST_CANDIDATES);
  return Math.max(25, Math.round(forBudget / 25) * 25);
}

/**
 * Where should `target` go instead?
 *
 * Businesses and vendor villages take the fast path: they draw custom from the
 * crowd but do not change how the crowd moves, so the pedestrian heatmap from
 * the last run stays valid and every candidate is a windowed read of it.
 * Thousands of positions, no re-simulation, no approximation.
 *
 * Anything that changes the road graph — a shuttle hub, a park and ride — takes
 * the slow path, because moving it invalidates the very heatmap we would be
 * scoring against. Those get a coarse ring and a real simulate() each.
 *
 * Returns null when nothing beats where it already is.
 */
export function findBetterSpot(
  world: WorldState,
  result: SimResult,
  target: Target,
): Relocation | null {
  const changesNetwork =
    target.kind === 'piece' &&
    world.pieces.find((p) => p.id === target.id)?.kind !== 'vendor_village';

  return changesNetwork
    ? findBySimulating(world, target)
    : findByHeatmap(world, result, target);
}

function findByHeatmap(world: WorldState, result: SimResult, target: Target): Relocation | null {
  const heatmap = result.heatmaps.pedestrian;
  const before = footfallAt(heatmap, target.pos, target.catchmentM);

  const candidates = candidateGrid(world, gridStepFor(world));
  let bestPos: Vec2 | null = null;
  let bestFootfall = before;

  for (const pos of candidates) {
    const f = footfallAt(heatmap, pos, target.catchmentM);
    if (f > bestFootfall) {
      bestFootfall = f;
      bestPos = pos;
    }
  }

  if (!bestPos) return null;

  const relocation: Relocation = {
    target,
    from: target.pos,
    to: bestPos,
    footfallBefore: before,
    footfallAfter: bestFootfall,
    candidatesTried: candidates.length,
    method: 'heatmap',
  };

  // For a real business we can state the dollar figure exactly, because moving a
  // shop does not change the crowd — same formula as lib/sim/business.ts.
  const business = world.businesses.find((b) => b.id === target.id);
  if (business) {
    const ticket = world.params.avgTicket[business.category];
    const rate = world.params.conversionRate;
    relocation.revenueBefore = business.baselineDailyRevenue + before * rate * ticket;
    relocation.revenueAfter = business.baselineDailyRevenue + bestFootfall * rate * ticket;
  }

  return relocation;
}

function findBySimulating(world: WorldState, target: Target): Relocation | null {
  const piece = world.pieces.find((p) => p.id === target.id);
  if (!piece) return null;

  const score = (w: WorldState) => {
    const r = simulate(w, buildNetwork(w));
    // Lower egress p90 is better; this is the metric a hub or a park and ride
    // is actually for. Returned as "higher is better" so the loop reads plainly.
    return { fitness: -r.metrics.egressP90Min, result: r };
  };

  const current = score(world);
  let best: { pos: Vec2; fitness: number } | null = null;

  // A ring between the venue and the primary anchor is where these belong; a
  // full grid at ~70ms a candidate would take a minute.
  const anchor = world.anchors[0];
  const reach = anchor
    ? Math.hypot(anchor.pos.x - world.venue.pos.x, anchor.pos.y - world.venue.pos.y)
    : Math.max(world.bbox.maxX - world.bbox.minX, world.bbox.maxY - world.bbox.minY) / 2;

  for (let i = 0; i < SLOW_CANDIDATE_COUNT; i++) {
    const t = (i + 1) / (SLOW_CANDIDATE_COUNT + 1);
    const pos: Vec2 = anchor
      ? {
          x: world.venue.pos.x + (anchor.pos.x - world.venue.pos.x) * t,
          y: world.venue.pos.y + (anchor.pos.y - world.venue.pos.y) * t,
        }
      : {
          x: world.venue.pos.x + Math.cos(t * Math.PI * 2) * reach * 0.6,
          y: world.venue.pos.y + Math.sin(t * Math.PI * 2) * reach * 0.6,
        };

    const trial: WorldState = {
      ...world,
      pieces: world.pieces.map((p) => (p.id === target.id ? { ...p, pos } : p)),
    };
    const { fitness } = score(trial);
    if (fitness > (best?.fitness ?? current.fitness)) best = { pos, fitness };
  }

  if (!best) return null;

  return {
    target,
    from: target.pos,
    to: best.pos,
    // Footfall is not what this path optimises; report the egress figures via
    // the caller's own re-run instead of inventing a footfall number here.
    footfallBefore: 0,
    footfallAfter: 0,
    candidatesTried: SLOW_CANDIDATE_COUNT,
    method: 'simulate',
  };
}

// ---------- what the agent says ----------

export function describeRelocation(r: Relocation, world: WorldState): string {
  const metres = Math.round(Math.hypot(r.to.x - r.from.x, r.to.y - r.from.y));
  const bearing = compass(r.from, r.to);

  if (r.revenueBefore !== undefined && r.revenueAfter !== undefined) {
    // A shop that was sitting off the crowd's path entirely has a baseline of
    // nearly zero, and a percentage against that is a meaningless number like
    // "up 33,000 percent". Say what actually happened instead.
    const wasStranded = r.footfallBefore < r.footfallAfter * 0.02;
    const change = wasStranded
      ? `It was getting almost no passing trade at all; now it takes ${usd(r.revenueAfter)} on an event day, against ${usd(r.revenueBefore)} where it was.`
      : `Takings go from ${usd(r.revenueBefore)} to ${usd(r.revenueAfter)}, up ` +
        `${(((r.revenueAfter - r.revenueBefore) / r.revenueBefore) * 100).toFixed(0)} percent.`;

    return (
      `Moved ${r.target.name} ${metres} metres ${bearing}. ${change} ` +
      `I compared ${r.candidatesTried.toLocaleString('en-US')} positions against the crowd flow from the last run.`
    );
  }

  return (
    `Moved the ${r.target.name} ${metres} metres ${bearing}. ` +
    `I re-ran the simulation at ${r.candidatesTried} positions along the corridor to ${world.anchors[0]?.name ?? 'the anchor'} ` +
    `and this one clears the venue fastest.`
  );
}

export function describeNoBetterSpot(target: Target): string {
  return `${target.name} is already in the best spot I can find — nothing on the map beats it.`;
}

function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function compass(from: Vec2, to: Vec2): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const parts: string[] = [];
  if (Math.abs(dy) > Math.abs(dx) * 0.4) parts.push(dy > 0 ? 'north' : 'south');
  if (Math.abs(dx) > Math.abs(dy) * 0.4) parts.push(dx > 0 ? 'east' : 'west');
  return parts.join('-') || 'across';
}
