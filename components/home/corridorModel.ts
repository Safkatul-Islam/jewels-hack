// components/home/corridorModel.ts — P1
//
// The landing page's subject, as plain numbers on a flat plan.
//
// WHAT THIS DEPICTS, and why it changed: not a neighbourhood with a stadium in
// it, but the venue's operational APRON — the temporary infrastructure that
// gets built for an event and taken down after. That is what "the last mile"
// means in this product, and the planner's seven piece kinds are exactly that
// list. So the hero is assembled out of the same vocabulary the tool hands
// you: security gates, a pedestrian corridor, vendor villages, service banks,
// a bike valet, a shuttle hub, a park-and-ride, road closures.
//
// The residential fabric is still here, but it is CONTEXT. It is who the plan
// costs, not what the plan is.
//
// Two renderers read this file — `CorridorField.tsx` projects it into an SVG
// poster that needs no JavaScript, and `CorridorCanvas.tsx` builds it as a
// three.js scene. The poster draws a simplified version (see its header); the
// numbers themselves live here so neither can drift.
//
// Geometry is generated at module scope with a seeded LCG, so the drawing is
// byte-identical on every render and on four different laptops — no hydration
// mismatch, no Math.random.

const SEED = 20280714;
const MOTION_SEED = SEED + 7771;
const FABRIC_SEED = SEED + 4242;

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export type Pt = [number, number];

/* ------------------------------------------------------------------
   Scale

   Horizontally one plan unit is six metres, which makes the spine
   below 2.4 km — the distance the page claims. Vertically one unit is
   three metres: a deliberate 2× exaggeration, declared here rather
   than fudged per object.

   The exaggeration is not decoration. At true vertical scale a stadium
   is 50 m tall and 250 m across, and from a raised camera that reads
   as a dish — or worse, as a crater in the ground. Planning models
   have exaggerated the vertical for the same reason for a century.
   ------------------------------------------------------------------ */

const METRES_PER_UNIT = 6;
const METRES_PER_UNIT_VERTICAL = 3;

/** Metres across the ground → plan units. */
export const plan = (metres: number) => metres / METRES_PER_UNIT;
/** Metres of height → plan units. */
export const rise = (metres: number) => metres / METRES_PER_UNIT_VERTICAL;

export const VENUE: Pt = [560, 530];

/**
 * venue → primary anchor: 409 units, which is 2.45 km. Everything else is
 * arranged around this line.
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

/** Along-corridor and across-corridor unit vectors at the apron. */
const ALONG = spineTangent(0.1);
const ACROSS: Pt = [-ALONG[1], ALONG[0]];

/** A point `out` units along the corridor and `side` units across it. */
function apron(out: number, side: number): Pt {
  return [
    VENUE[0] + ALONG[0] * out + ACROSS[0] * side,
    VENUE[1] + ALONG[1] * out + ACROSS[1] * side,
  ];
}

/* ------------------------------------------------------------------
   The venue
   ------------------------------------------------------------------ */

/**
 * A bowl about 250 m across and 50 m tall — the real proportions of the
 * stadium this is modelled on, under the vertical exaggeration above.
 */
export const VENUE_BOWL = {
  rFoot: plan(118),
  rRim: plan(126),
  rPitch: plan(66),
  h: rise(50),
  pitchH: rise(14),
};

/** The secure perimeter: the fence line the gates sit on. */
export const VENUE_PERIMETER = plan(228);

/* ------------------------------------------------------------------
   Facilities — the seven piece kinds, at their real footprints
   ------------------------------------------------------------------ */

export interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** rotation about the footprint centre, radians */
  a?: number;
}

export type FacilityKind =
  | 'security_gate'
  | 'vendor_village'
  | 'service_bank'
  | 'bike_valet'
  | 'shuttle_hub'
  | 'park_and_ride'
  | 'road_closure';

export interface Light {
  x: number;
  y: number;
  /** height in plan units */
  h: number;
  /** 'warm' = a stall or a window, 'cool' = a lamp, 'clinical' = a gate */
  tone: 'warm' | 'cool' | 'clinical';
  size: number;
}

export interface Facility {
  kind: FacilityKind;
  /** the piece's own footprint, outlined on the ground */
  pad: Footprint;
  /** the small repeated solids standing inside it */
  units: Footprint[];
  lights: Light[];
}

/** Rotate a point about a pivot, in plan space. */
function rotateAbout(p: Pt, pivot: Pt, a: number): Pt {
  const dx = p[0] - pivot[0];
  const dy = p[1] - pivot[1];
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
}

/**
 * A grid of small solids filling a pad, inset from its edge.
 *
 * Each cell's CENTRE is rotated about the PAD's centre, and only then given
 * the pad's own angle. Rotating each solid about itself instead leaves the
 * grid axis-aligned inside a turned pad — every stall facing the right way,
 * the market as a whole facing the wrong one.
 */
function fill(
  pad: Footprint,
  cols: number,
  rows: number,
  unitH: number,
  gapX: number,
  gapY: number,
): Footprint[] {
  const cellW = pad.w / cols;
  const cellD = pad.d / rows;
  const pivot: Pt = [pad.x + pad.w / 2, pad.y + pad.d / 2];
  const a = pad.a ?? 0;
  const w = cellW - gapX;
  const d = cellD - gapY;
  const out: Footprint[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const centre = rotateAbout(
        [pad.x + c * cellW + cellW / 2, pad.y + r * cellD + cellD / 2],
        pivot,
        a,
      );
      out.push({ x: centre[0] - w / 2, y: centre[1] - d / 2, w, d, h: unitH, a });
    }
  }
  return out;
}

function centred(at: Pt, w: number, d: number, h: number, a: number): Footprint {
  return { x: at[0] - w / 2, y: at[1] - d / 2, w, d, h, a };
}

/** The corridor's bearing, for aligning everything in the apron to it. */
const BEARING = Math.atan2(ALONG[1], ALONG[0]);

function buildFacilities(): Facility[] {
  const rnd = makeRng(SEED + 909);
  const out: Facility[] = [];

  // --- security gates: three, on the perimeter, facing the corridor ---
  // 55 m footprint each, five screening lanes. They are the throughput
  // bottleneck the PRD says you place deliberately, so they are on the
  // fence line and not tucked away.
  for (const offset of [-plan(300), 0, plan(300)]) {
    const at = apron(VENUE_PERIMETER, offset);
    const pad = centred(at, plan(55), plan(30), 0, BEARING);
    out.push({
      kind: 'security_gate',
      pad,
      units: fill(pad, 5, 1, rise(4), plan(4), plan(6)),
      lights: fill(pad, 5, 1, rise(4), plan(4), plan(6)).map((u) => ({
        x: u.x + u.w / 2,
        y: u.y + u.d / 2,
        h: rise(6),
        tone: 'clinical' as const,
        size: 0.9,
      })),
    });
  }

  // --- vendor villages: 40 stalls each, flanking the pedestrian corridor ---
  // Placed where they undercut the existing shopfronts, because that is the
  // tradeoff the product is about, not in spite of it.
  for (const [out_, side] of [
    [plan(620), plan(135)],
    [plan(900), -plan(120)],
  ]) {
    const pad = centred(apron(out_, side), plan(70), plan(70), 0, BEARING);
    const stalls = fill(pad, 8, 5, rise(3.2), plan(4), plan(6));
    out.push({
      kind: 'vendor_village',
      pad,
      units: stalls,
      lights: stalls.map((u) => ({
        x: u.x + u.w / 2,
        y: u.y + u.d / 2,
        h: rise(4),
        tone: 'warm' as const,
        size: 0.85 + rnd() * 0.3,
      })),
    });
  }

  // --- service banks: the restrooms and welfare units ---
  // Not a PieceKind — `lib/sim/types.ts` is frozen and P3 owns it — so these
  // are drawn as unlabelled low sheds beside the villages. Visually they say
  // "facilities"; no contract changes.
  for (const [out_, side] of [
    [plan(560), plan(250)],
    [plan(960), -plan(235)],
  ]) {
    const pad = centred(apron(out_, side), plan(44), plan(16), 0, BEARING);
    out.push({
      kind: 'service_bank',
      pad,
      units: fill(pad, 4, 1, rise(3), plan(2), plan(1)),
      lights: [
        {
          x: pad.x + pad.w / 2,
          y: pad.y + pad.d / 2,
          h: rise(5),
          tone: 'cool',
          size: 0.7,
        },
      ],
    });
  }

  // --- bike valet: rows of racks, small footprint, cheap mode share ---
  {
    const pad = centred(apron(plan(380), -plan(240)), plan(50), plan(34), 0, BEARING);
    out.push({
      kind: 'bike_valet',
      pad,
      units: fill(pad, 2, 7, rise(1.4), plan(10), plan(2.5)),
      lights: [
        { x: pad.x + pad.w / 2, y: pad.y + pad.d / 2, h: rise(5), tone: 'cool', size: 0.7 },
      ],
    });
  }

  // --- shuttle hub: a canopy on columns, four bays, buses in them ---
  {
    const at = apron(plan(1180), plan(60));
    const pad = centred(at, plan(90), plan(46), 0, BEARING);
    const bays = fill(pad, 1, 4, rise(3.4), plan(26), plan(4));
    out.push({
      kind: 'shuttle_hub',
      pad,
      units: bays,
      lights: fill(pad, 3, 1, 0, plan(10), plan(8)).map((u) => ({
        x: u.x + u.w / 2,
        y: u.y + u.d / 2,
        h: rise(7),
        tone: 'cool' as const,
        size: 1.1,
      })),
    });
  }

  // --- park & ride: 140 m of lot, out where it pulls cars off the corridor ---
  {
    const pad = centred(apron(plan(1700), -plan(210)), plan(140), plan(96), 0, BEARING);
    const cars = fill(pad, 10, 6, rise(1.6), plan(5), plan(5)).filter(() => rnd() > 0.24);
    out.push({
      kind: 'park_and_ride',
      pad,
      units: cars,
      // mast lights, not one per car
      lights: fill(pad, 2, 2, 0, plan(40), plan(30)).map((u) => ({
        x: u.x + u.w / 2,
        y: u.y + u.d / 2,
        h: rise(14),
        tone: 'cool' as const,
        size: 1.3,
      })),
    });
  }

  // --- road closures: a barrier across a street mouth ---
  for (const [out_, side] of [
    [plan(330), plan(330)],
    [plan(760), -plan(330)],
  ]) {
    const pad = centred(apron(out_, side), plan(45), plan(7), 0, BEARING);
    out.push({
      kind: 'road_closure',
      pad,
      units: fill(pad, 5, 1, rise(2.2), plan(2.5), plan(1)),
      lights: [],
    });
  }

  return out;
}

export const FACILITIES = buildFacilities();

/* ------------------------------------------------------------------
   The pedestrian corridor — a ribbon, not a pad
   ------------------------------------------------------------------ */

/** 60 m wide, from the middle gate out along the spine. */
export const PED_CORRIDOR = {
  width: plan(60),
  path: [apron(VENUE_PERIMETER, 0), apron(plan(700), 0), apron(plan(1240), plan(30))] as Pt[],
};

/** Barrier posts down both edges of it. */
export const PED_POSTS: Pt[] = (() => {
  const posts: Pt[] = [];
  const half = PED_CORRIDOR.width / 2;
  const [a, , c] = PED_CORRIDOR.path;
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a[0] + (c[0] - a[0]) * t;
    const y = a[1] + (c[1] - a[1]) * t;
    posts.push([x + ACROSS[0] * half, y + ACROSS[1] * half]);
    posts.push([x - ACROSS[0] * half, y - ACROSS[1] * half]);
  }
  return posts;
})();

/* ------------------------------------------------------------------
   Existing businesses — the shopfront row the villages undercut
   ------------------------------------------------------------------ */

/**
 * A row of shopfronts along the corridor street. The PRD's sharpest tradeoff
 * is that an official vendor village within 150 m halves these businesses'
 * conversion, so they are placed where that is visible rather than tucked
 * somewhere convenient.
 */
export const SHOPFRONTS: Footprint[] = (() => {
  const rnd = makeRng(SEED + 1717);
  const out: Footprint[] = [];
  for (let i = 0; i < 18; i++) {
    const along = plan(430) + i * plan(34);
    const at = apron(along, -plan(86));
    const w = plan(22 + rnd() * 8);
    out.push({
      x: at[0] - w / 2,
      y: at[1] - plan(11),
      w,
      d: plan(22),
      h: rise(6 + rnd() * 5),
      a: BEARING,
    });
  }
  return out;
})();

/* ------------------------------------------------------------------
   Residential fabric — context, pushed back
   ------------------------------------------------------------------ */

export interface Block {
  pad: Footprint;
  buildings: Footprint[];
}

/**
 * City blocks, at a city block's actual size: about 130 × 85 m. The previous
 * version drew one solid per block at thirty times that, which is the real
 * reason it read as a pile of boxes rather than a city.
 *
 * They sit OUTSIDE the apron and away from the corridor — they are the
 * neighbourhood the plan runs through, and the plan is the subject.
 */
export const RESIDENTIAL: Block[] = (() => {
  const rnd = makeRng(FABRIC_SEED);
  const blocks: Block[] = [];
  const blockW = plan(132);
  const blockD = plan(84);
  const street = plan(30);

  for (let col = -3; col <= 4; col++) {
    for (let row = -2; row <= 3; row++) {
      const along = plan(250) + col * (blockW + street) * 1.0;
      const side = row * (blockD + street) * 1.6;
      // leave the corridor and the apron alone
      if (Math.abs(side) < plan(190)) continue;
      if (along < -plan(400)) continue;

      const at = apron(along, side);
      const pad: Footprint = {
        x: at[0] - blockW / 2,
        y: at[1] - blockD / 2,
        w: blockW,
        d: blockD,
        h: 0,
        a: BEARING,
      };

      const buildings: Footprint[] = [];
      const cols = 6;
      const rows = 3;
      const cellW = blockW / cols;
      const cellD = blockD / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rnd() < 0.12) continue; // a yard, a gap, a car park
          const insetX = plan(4) + rnd() * plan(9);
          const insetY = plan(4) + rnd() * plan(9);
          const tall = rnd();
          const bw = cellW - insetX;
          const bd = cellD - insetY;
          const centre = rotateAbout(
            [pad.x + c * cellW + cellW / 2, pad.y + r * cellD + cellD / 2],
            [pad.x + pad.w / 2, pad.y + pad.d / 2],
            BEARING,
          );
          buildings.push({
            x: centre[0] - bw / 2,
            y: centre[1] - bd / 2,
            w: bw,
            d: bd,
            // Mostly two to four storeys, occasionally much taller. A uniform
            // height reads as an extruded grid, which is the slab problem one
            // level down.
            h: rise(7 + tall * tall * 26),
            a: BEARING,
          });
        }
      }
      blocks.push({ pad, buildings });
    }
  }
  return blocks;
})();

/** A scatter of lit windows. Most of the city is dark; the plan is what is lit. */
export const WINDOWS: Light[] = (() => {
  const rnd = makeRng(SEED + 5150);
  const out: Light[] = [];
  for (const block of RESIDENTIAL) {
    for (const b of block.buildings) {
      if (rnd() > 0.34) continue;
      out.push({
        x: b.x + b.w * (0.2 + rnd() * 0.6),
        y: b.y + b.d * (0.2 + rnd() * 0.6),
        h: b.h * (0.45 + rnd() * 0.4),
        tone: 'warm',
        size: 0.55 + rnd() * 0.25,
      });
    }
  }
  return out;
})();

/* ------------------------------------------------------------------
   Streets, survey grid, egress wave
   ------------------------------------------------------------------ */

export interface Road {
  pts: Pt[];
  major: boolean;
}

function buildGround() {
  const rnd = makeRng(SEED);
  const roads: Road[] = [];

  const spacing = plan(190);
  for (let i = -6; i <= 8; i++) {
    const pts: Pt[] = [];
    for (let j = 0; j <= 4; j++) {
      const along = -plan(900) + j * plan(900);
      const side = i * spacing + (rnd() - 0.5) * plan(40);
      pts.push(apron(along, side));
    }
    roads.push({ pts, major: i % 3 === 1 });
  }
  for (let i = -4; i <= 6; i++) {
    const pts: Pt[] = [];
    for (let j = 0; j <= 4; j++) {
      const along = i * plan(300) + (rnd() - 0.5) * plan(40);
      const side = -plan(1300) + j * plan(650);
      pts.push(apron(along, side));
    }
    roads.push({ pts, major: i === 0 });
  }

  // Street lamps along the corridor street.
  const lamps: Light[] = [];
  for (let i = 0; i < 22; i++) {
    const along = plan(180) + i * plan(90);
    for (const side of [plan(52), -plan(52)]) {
      const at = apron(along, side);
      lamps.push({ x: at[0], y: at[1], h: rise(9), tone: 'cool', size: 0.8 });
    }
  }

  // The egress wave: sampled spectators, released from the gates and fanning
  // out as they travel. It starts at the perimeter now, not at the centre of
  // the bowl — people leave through the gates.
  const drift = makeRng(MOTION_SEED);
  const flow = Array.from({ length: 220 }, (_, i) => {
    const t = i / 220;
    const along = VENUE_PERIMETER + t * plan(1900);
    const spread = plan(70) + t * plan(190);
    const side = (rnd() - 0.5) * spread;
    const [x, y] = apron(along, side);
    const fan = (side / Math.max(spread, 1)) * 0.5;
    const reach = plan(260 + drift() * 240);
    const dur = 15 + drift() * 9;
    return {
      cx: x,
      cy: y,
      r: (0.9 + rnd() * 1.5) * 1.34 * 0.62,
      opacity: 0.18 + (1 - t) * 0.6,
      dx: (ALONG[0] - ACROSS[0] * fan) * reach,
      dy: (ALONG[1] - ACROSS[1] * fan) * reach,
      dur,
      delay: -drift() * dur,
    };
  });

  // The survey grid: 250 m squares, aligned to the corridor.
  const grid: Pt[][] = [];
  const step = plan(250);
  for (let i = -14; i <= 18; i++) {
    grid.push([apron(i * step, -plan(2600)), apron(i * step, plan(2600))]);
  }
  for (let i = -11; i <= 11; i++) {
    grid.push([apron(-plan(2200), i * step), apron(plan(3400), i * step)]);
  }

  return { roads, flow, grid, lamps };
}

export const { roads, flow, grid, lamps } = buildGround();

export type FlowDot = (typeof flow)[number];

/* ------------------------------------------------------------------
   Anchors, shuttle, scale bar
   ------------------------------------------------------------------ */

export const RAIL_ANCHOR: Footprint = {
  ...centred(apron(plan(2420), plan(40)), plan(60), plan(60), rise(22), BEARING),
};
export const LOT_ANCHOR: Footprint = {
  ...centred(apron(-plan(430), plan(620)), plan(44), plan(44), rise(12), BEARING),
};

/** Clear of the bowl, running the pedestrian corridor's own street. */
export const SHUTTLE_START = apron(VENUE_PERIMETER + plan(90), -plan(100));
export const SHUTTLE: Footprint = centred(SHUTTLE_START, plan(12), plan(4), rise(3.2), BEARING);
export const SHUTTLE_PATH: Pt[] = [
  SHUTTLE_START,
  apron(plan(900), -plan(90)),
  apron(plan(1700), -plan(60)),
  apron(plan(2380), plan(10)),
];
export const SHUTTLE_SECONDS = 30;

/** 500 m, at the scale this plan is actually drawn to. */
export const SCALE_BAR_UNITS = plan(500);

/* ------------------------------------------------------------------
   Scene units

   three.js is happier with a scene a few units across than one 400
   units across — near/far planes, light falloff and camera framing all
   get easier — so the 3D side divides by this and re-centres on the
   venue. Nothing else in the project should need it.
   ------------------------------------------------------------------ */

export const SCENE_SCALE = 40;

/** Plan (x, y) → scene (x, z), with the venue at the origin and −z away. */
export function toScene(x: number, y: number): [number, number] {
  return [(x - VENUE[0]) / SCENE_SCALE, (y - VENUE[1]) / SCENE_SCALE];
}

/** A plan length → a scene length. */
export function toSceneLength(v: number): number {
  return v / SCENE_SCALE;
}
