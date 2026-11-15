// components/plan/facilityGeometry.ts — P1
//
// Each piece kind drawn as the thing it actually is, at the dimensions it
// actually has: bus bays 3.5 m wide, car stalls 2.6 x 5.4 m, drive aisles
// 7.2 m, market stalls 3 m. A shuttle hub is a row of bays and a queue, not a
// rounded rectangle with a label on it.
//
// Two reasons this is worth the code:
//
//   1. Density is what makes a plan read as a plan. A dozen coloured boxes read
//      as a diagram of a proposal; four hundred stall ticks read as the
//      proposal. The reference we are working from (TestFit) is entirely this.
//
//   2. It makes the land take HONEST, which is the product's whole thesis. The
//      footprint is derived from the capacity — 2,500 park-and-ride spaces need
//      about 7.5 hectares, and now you can see that they do. Turn the capacity
//      up and the facility grows into the neighbourhood it is taking.
//
// Coordinate space: metres, origin at the piece centre, +y DOWN so it composes
// directly with the screen-space rotation applied by PieceLayer. Everything
// here is pure and deterministic — no rng, no Date, no store — so a drawing can
// be memoised on (kind, capacity) and reused across every render of a drag.

import type { PieceKind } from '@/lib/sim/types';
import type { Blocker } from '@/components/plan/packing';
import { PIECE_META } from '@/lib/pieces';

/** Real-world dimensions, in metres. These are the numbers the drawing is to. */
const CAR_STALL_W = 2.6;
const CAR_STALL_D = 5.4;
const DRIVE_AISLE = 7.2;
const BUS_BAY_W = 3.5;
const BUS_BAY_D = 14;
const MARKET_STALL = 3;
const BIKE_SPACE_W = 0.6;

/** Area per unit of capacity, in m², including circulation. Used to size the
 *  footprint from the capacity rather than fixing it.
 *
 *  These have to MATCH what the packer actually achieves on clear ground, and
 *  27 is measured, not assumed: a 274 m square laid out at 2.6 x 5.4 m stalls
 *  double-loaded around 7.2 m aisles yields 2,783 stalls, i.e. 27.0 m² each.
 *  Sizing the land at 30 left the lot with slack, and slack is fatal to the
 *  whole mechanic — a vendor village shoved into the middle ate the spare
 *  rather than the capacity, so the count never moved and neither did the
 *  score. The land you ask for should be the land you need. */
const AREA_PER_SPACE = 27;
const AREA_PER_STALL = 25;
const AREA_PER_BIKE = 1.6;

/** Above this many drawn elements a facility stops gaining legibility and
 *  starts costing frames. Rows are thinned to fit the budget. */
const MAX_TICKS = 520;

export interface FacilityDrawing {
  /** metres, the square the facility occupies */
  sizeM: number;
  /** pavement / ground fill */
  surface: string;
  /** repeated units — stalls, bays, racks. Stroked, not filled. */
  ticks: string;
  /** kerbs, fences, outlines */
  ink: string;
  /** the one shape carrying the piece's own colour */
  accent: string;
  /** diagonal hatching for queue and exclusion zones */
  hatch: string;
  /** planting, drawn as discs — TestFit's trees, and they read at a glance */
  trees: { x: number; y: number; r: number }[];
  /** How many units actually FIT once obstructions are taken out. This is the
   *  number that becomes Piece.capacity, and therefore the number the engine
   *  simulates — not the number that was asked for. */
  drawnUnits: number;
}

/** Always free. Used when a facility is drawn with nothing to avoid. */
const NOTHING_BLOCKED: Blocker = () => false;

function rect(x: number, y: number, w: number, h: number): string {
  return `M${x.toFixed(2)},${y.toFixed(2)}h${w.toFixed(2)}v${h.toFixed(2)}h${(-w).toFixed(2)}Z`;
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`;
}

/** Diagonal fill for a rectangle, as a single path. Spacing in metres. */
function hatchRect(x: number, y: number, w: number, h: number, step: number): string {
  const out: string[] = [];
  for (let d = 0; d < w + h; d += step) {
    const x1 = x + Math.min(d, w);
    const y1 = y + Math.max(0, d - w);
    const x2 = x + Math.max(0, d - h);
    const y2 = y + Math.min(d, h);
    out.push(line(x1, y1, x2, y2));
  }
  return out.join('');
}

/**
 * The square a facility occupies, in metres: the declared default, or what the
 * capacity actually needs, whichever is larger. Never below the default, so a
 * piece cannot shrink to a dot when someone zeroes its capacity.
 */
export function footprintFor(kind: PieceKind, capacity: number): number {
  const base = PIECE_META[kind].footprintM;
  const cap = Math.max(capacity, 0);
  switch (kind) {
    case 'park_and_ride':
      return Math.max(base, Math.sqrt(cap * AREA_PER_SPACE));
    case 'vendor_village':
      return Math.max(base, Math.sqrt(cap * AREA_PER_STALL));
    case 'bike_valet':
      return Math.max(base, Math.sqrt(cap * AREA_PER_BIKE));
    case 'shuttle_hub': {
      // One bay turns over roughly 900 boardings an hour.
      const bays = Math.max(3, Math.round(cap / 900));
      return Math.max(base, bays * (BUS_BAY_W + 1.6) + 26);
    }
    case 'security_gate': {
      // A screening lane does roughly 600 people an hour.
      const lanes = Math.max(2, Math.round(cap / 600));
      return Math.max(base, lanes * 4.2 + 14);
    }
    default:
      return base;
  }
}

/**
 * Rows of car stalls, double-loaded around drive aisles, laid into whatever
 * ground is actually free.
 *
 * Each bank is scanlined: walk the row a stall at a time, ask the blocker
 * whether that stall's own footprint is clear, and collect contiguous runs.
 * A run gets its kerb line and its closing divider; a blocked stretch simply
 * gets nothing. Rows therefore break around a neighbouring facility, stop at
 * a road and disappear entirely where the stadium is, without any of that
 * being special-cased.
 *
 * `drawn` is the true count of placeable stalls, never the strided drawing
 * count — it leaves this function to become the piece's capacity.
 */
function parkingRows(
  size: number,
  blocked: Blocker,
): { ticks: string; ink: string; drawn: number } {
  const ticks: string[] = [];
  const ink: string[] = [];
  const half = size / 2;
  const moduleD = CAR_STALL_D * 2 + DRIVE_AISLE;
  const perRow = Math.max(1, Math.floor(size / CAR_STALL_W));
  const modules = Math.max(1, Math.floor(size / moduleD));
  const stride = Math.max(1, Math.ceil((modules * 2 * perRow) / MAX_TICKS));

  let drawn = 0;
  const usedD = modules * moduleD;
  const top = -usedD / 2;

  for (let m = 0; m < modules; m++) {
    const y0 = top + m * moduleD;
    for (const bankTop of [y0, y0 + CAR_STALL_D + DRIVE_AISLE]) {
      let runStart: number | null = null;
      let lastX = -half;

      const closeRun = (endX: number) => {
        if (runStart === null) return;
        ink.push(line(runStart, bankTop + CAR_STALL_D, endX, bankTop + CAR_STALL_D));
        ticks.push(line(endX, bankTop, endX, bankTop + CAR_STALL_D));
        runStart = null;
      };

      for (let i = 0; i < perRow; i++) {
        const x = -half + i * CAR_STALL_W;
        const free = !blocked(x + CAR_STALL_W / 2, bankTop + CAR_STALL_D / 2);
        if (free) {
          if (runStart === null) runStart = x;
          if (i % stride === 0) ticks.push(line(x, bankTop, x, bankTop + CAR_STALL_D));
          drawn++;
          lastX = x + CAR_STALL_W;
        } else {
          closeRun(lastX);
        }
      }
      closeRun(lastX);
    }
  }
  return { ticks: ticks.join(''), ink: ink.join(''), drawn };
}

export function buildFacility(
  kind: PieceKind,
  capacity: number,
  blocked: Blocker = NOTHING_BLOCKED,
): FacilityDrawing {
  const size = footprintFor(kind, capacity);
  const half = size / 2;
  const base: FacilityDrawing = {
    sizeM: size,
    surface: '',
    ticks: '',
    ink: '',
    accent: '',
    hatch: '',
    trees: [],
    drawnUnits: 0,
  };

  switch (kind) {
    case 'park_and_ride': {
      const rows = parkingRows(size, blocked);
      // Planting islands at the ends of the rows — the single cheapest thing
      // that makes a parking field look designed rather than paved.
      const trees: FacilityDrawing['trees'] = [];
      const treeStep = Math.max(size / 5, 24);
      for (let x = -half + treeStep / 2; x < half; x += treeStep) {
        for (let y = -half + treeStep / 2; y < half; y += treeStep) {
          if (blocked(x, y)) continue;
          trees.push({ x, y, r: 3.4 });
        }
      }
      return {
        ...base,
        surface: rect(-half, -half, size, size),
        ticks: rows.ticks,
        ink: rows.ink + rect(-half, -half, size, size),
        accent: rect(-half, -half, size, 6),
        trees: trees.slice(0, 40),
        drawnUnits: rows.drawn,
      };
    }

    case 'vendor_village': {
      // Here the count is literal: `capacity` stalls, drawn, in aisled rows.
      const stalls = Math.max(1, Math.min(Math.round(capacity), MAX_TICKS));
      const cols = Math.max(1, Math.round(Math.sqrt(stalls * 1.6)));
      const rows = Math.ceil(stalls / cols);
      const pitch = MARKET_STALL + 1.2;
      const aisle = 4;
      const w = cols * pitch;
      const h = rows * (MARKET_STALL + aisle);
      const x0 = -w / 2;
      const y0 = -h / 2;
      const ticks: string[] = [];
      let n = 0;
      for (let r = 0; r < rows && n < stalls; r++) {
        for (let c = 0; c < cols && n < stalls; c++) {
          const sx = x0 + c * pitch;
          const sy = y0 + r * (MARKET_STALL + aisle);
          // A stall on blocked ground is not a stall you have.
          if (blocked(sx + MARKET_STALL / 2, sy + MARKET_STALL / 2)) continue;
          ticks.push(rect(sx, sy, MARKET_STALL, MARKET_STALL));
          n++;
        }
      }
      return {
        ...base,
        surface: rect(-half, -half, size, size),
        ticks: ticks.join(''),
        ink: rect(-half, -half, size, size),
        accent: rect(x0 - 1.5, y0 - 1.5, w + 3, 2.2),
        drawnUnits: n,
      };
    }

    case 'shuttle_hub': {
      const bays = Math.max(3, Math.round(capacity / 900));
      const pitch = BUS_BAY_W + 1.6;
      const w = bays * pitch;
      const x0 = -w / 2;
      // The queue is the part that fails first, so it gets drawn, hatched, and
      // sized off the same capacity as the bays. Bays and queue are laid out as
      // one stack and centred, so the facility does not sit in the top third of
      // its own footprint with dead asphalt underneath.
      const queueH = Math.min(half * 0.9, 24);
      const stackH = BUS_BAY_D + 5 + queueH;
      const bayTop = -stackH / 2;
      const ticks: string[] = [];
      for (let i = 0; i < bays; i++) {
        ticks.push(rect(x0 + i * pitch, bayTop, BUS_BAY_W, BUS_BAY_D));
      }
      const queueTop = bayTop + BUS_BAY_D + 5;
      return {
        ...base,
        surface: rect(-half, -half, size, size),
        ticks: ticks.join(''),
        // kerb line along the head of the bays
        ink: line(x0 - 3, bayTop, x0 + w + 3, bayTop) + rect(-half, -half, size, size),
        accent: rect(x0 - 3, bayTop - 2.4, w + 6, 2.4),
        hatch: queueH > 4 ? hatchRect(x0, queueTop, w, queueH, 3.2) : '',
        drawnUnits: bays,
      };
    }

    case 'bike_valet': {
      // Staple racks: a double tick per two bikes, in rows.
      const spaces = Math.max(2, Math.min(Math.round(capacity), MAX_TICKS * 2));
      const perRow = Math.max(4, Math.floor(size / (BIKE_SPACE_W * 2)));
      const rows = Math.min(Math.ceil(spaces / perRow), Math.floor(size / 3.2));
      const ticks: string[] = [];
      let n = 0;
      for (let r = 0; r < rows; r++) {
        const y = -half + 4 + r * 3.2;
        for (let i = 0; i < perRow && n < spaces; i += 2) {
          const x = -half + 3 + i * BIKE_SPACE_W * 2;
          if (x > half - 3) break;
          if (blocked(x, y + 1)) continue;
          ticks.push(line(x, y, x, y + 2));
          n += 2;
        }
      }
      return {
        ...base,
        surface: rect(-half, -half, size, size),
        ticks: ticks.join(''),
        ink: rect(-half, -half, size, size),
        accent: rect(-half, -half, 5, size),
        drawnUnits: n,
      };
    }

    case 'ped_corridor': {
      // A walking band, its width set by the flow it is sized for: roughly
      // 60 people per minute per metre of width at a comfortable density.
      const widthM = Math.min(Math.max(capacity / 60, 6), size);
      const ticks: string[] = [];
      // chevrons along the direction of travel (local north = -y)
      const step = 9;
      for (let y = -half + 6; y < half - 6; y += step) {
        const c = widthM / 2;
        ticks.push(`M${(-c * 0.6).toFixed(2)},${(y + 4).toFixed(2)}L0,${y.toFixed(2)}L${(c * 0.6).toFixed(2)},${(y + 4).toFixed(2)}`);
      }
      return {
        ...base,
        surface: rect(-widthM / 2, -half, widthM, size),
        ticks: ticks.join(''),
        ink: line(-widthM / 2, -half, -widthM / 2, half) + line(widthM / 2, -half, widthM / 2, half),
        accent: rect(-widthM / 2, -half, widthM, 2.4) + rect(-widthM / 2, half - 2.4, widthM, 2.4),
        drawnUnits: Math.round(widthM),
      };
    }

    case 'security_gate': {
      const lanes = Math.max(2, Math.round(capacity / 600));
      const pitch = 4.2;
      const w = lanes * pitch;
      const x0 = -w / 2;
      const ticks: string[] = [];
      for (let i = 0; i <= lanes; i++) {
        ticks.push(line(x0 + i * pitch, -6, x0 + i * pitch, 6));
      }
      // the fence line the lanes puncture
      const fence = line(-half, -6, x0, -6) + line(x0 + w, -6, half, -6);
      return {
        ...base,
        surface: rect(x0, -6, w, 12),
        ticks: ticks.join(''),
        ink: fence,
        accent: rect(x0, 6, w, 2.4),
        hatch: hatchRect(x0, 8, w, Math.min(half - 8, 16), 3),
        drawnUnits: lanes,
      };
    }

    case 'road_closure': {
      // A barricade: a bar, hatched, with end posts. Deliberately the most
      // graphic of the seven — a closure is the piece that hurts somebody.
      const w = size;
      const barH = 7;
      return {
        ...base,
        surface: rect(-w / 2, -barH / 2, w, barH),
        hatch: hatchRect(-w / 2, -barH / 2, w, barH, 3.4),
        ink: rect(-w / 2, -barH / 2, w, barH),
        accent: rect(-w / 2 - 3, -barH, 3.2, barH * 2) + rect(w / 2, -barH, 3.2, barH * 2),
        drawnUnits: 1,
      };
    }
  }
}

// Memoised by kind and capacity: a drag changes neither, so the path strings
// are built once per distinct facility and then only moved.
const cache = new Map<string, FacilityDrawing>();

export function facilityFor(
  kind: PieceKind,
  capacity: number,
  /** identifies everything that could block this facility — see packing.ts */
  maskKey = '',
  blocked: Blocker = NOTHING_BLOCKED,
): FacilityDrawing {
  // Quantise the capacity so a slider drag does not mint a drawing per pixel.
  const q = Math.round(capacity);
  const key = `${kind}:${q}:${maskKey}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildFacility(kind, q, blocked);
  if (cache.size > 400) cache.clear();
  cache.set(key, built);
  return built;
}
