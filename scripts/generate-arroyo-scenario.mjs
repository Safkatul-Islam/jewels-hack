// scripts/generate-arroyo-scenario.mjs — P1
//
//   node scripts/generate-arroyo-scenario.mjs > fixtures/scenario-arroyo.json
//
// Generates the default scenario: a venue with an organic street network around
// it, conforming to the frozen WorldState contract in docs/02-CONTRACTS.md.
//
// WHY THIS EXISTS. The other fixtures are Manhattan lattices — road vertices on
// six x-values and five y-values, 650 m apart, twelve identical blocks in a
// 4 x 3 arrangement. Whatever you draw on top of that, the canvas reads as
// graph paper, because the city IS graph paper. No backdrop can fix a gridded
// world; the world has to stop being a grid.
//
// So this builds a radial-concentric network instead: irregular ring roads
// around the venue, spokes running out at uneven angles, a couple of chords cut
// across, and segments missing here and there so blocks merge into different
// shapes. That is roughly how cities around a stadium actually grow, and it
// makes the product's own idea legible — the venue is the centre, and the
// corridors are the spokes leading away from it.
//
// It also fills `accessNodeIds`, which the lattice fixtures leave empty. The
// engine skips any block with an empty list (simulate.ts), so on those fixtures
// every resident metric comes out as exactly zero and `livability` is scored
// off nothing. Node ids are minted by snapKey() in lib/sim/network.ts as
// `n_<x>_<y>` rounded to SNAP_PRECISION_M, so the same rule is applied here and
// the ids line up with the graph buildNetwork() will produce.

const SNAP = 0.5;

/** Round to the network's snap precision so generated ids match snapKey(). */
const q = (v) => Math.round(v / SNAP) * SNAP;
const nodeId = (p) => `n_${q(p.x)}_${q(p.y)}`;
const pt = (x, y) => ({ x: q(x), y: q(y) });

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rng = makeRng(20280714);
/** uniform in [a,b) */
const rand = (a, b) => a + rng() * (b - a);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------- the lattice
//
// Irregular on both axes on purpose: evenly spaced rings at evenly spaced
// angles is still a grid, just in polar coordinates.

const RING_R = [430, 790, 1180, 1580, 2010];
const SPOKES = 11;

/** Base angle of each spoke, jittered so no two gaps match. */
const spokeAngle = [];
for (let s = 0; s < SPOKES; s++) {
  const even = (s / SPOKES) * Math.PI * 2;
  spokeAngle.push(even + rand(-0.17, 0.17));
}

/** node[ring][spoke] — null where the lattice is deliberately missing. */
const node = [];
for (let r = 0; r < RING_R.length; r++) {
  node[r] = [];
  for (let s = 0; s < SPOKES; s++) {
    const radius = RING_R[r] * rand(0.94, 1.06);
    const angle = spokeAngle[s] + rand(-0.035, 0.035);
    node[r][s] = pt(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
}

/** The spoke that carries the main corridor, and the one the lot sits on. */
const MAIN_SPOKE = 3;
const LOT_SPOKE = 8;

const roads = [];
let roadSeq = 0;
const addRoad = (path, cls) => {
  roads.push({ id: `r${roadSeq++}`, path, class: cls });
};

/** A ring segment, drawn as an arc through two intermediate points so the road
 *  curves rather than cutting the corner. */
function ringSegment(r, s0, s1, cls) {
  const a = node[r][s0];
  const b = node[r][s1];
  const ang0 = Math.atan2(a.y, a.x);
  let ang1 = Math.atan2(b.y, b.x);
  if (ang1 < ang0) ang1 += Math.PI * 2;
  const rad0 = Math.hypot(a.x, a.y);
  const rad1 = Math.hypot(b.x, b.y);
  const path = [a];
  // One intermediate point, not two. Each extra point is another graph node on
  // every ring segment, and simulate() runs a shortest-path tree per resident
  // origin — the curve is worth one node, not two.
  for (let i = 1; i <= 1; i++) {
    const k = i / 2;
    const ang = ang0 + (ang1 - ang0) * k;
    const rad = (rad0 + (rad1 - rad0) * k) * rand(0.995, 1.012);
    path.push(pt(Math.cos(ang) * rad, Math.sin(ang) * rad));
  }
  path.push(b);
  return { path, cls };
}

// ring roads — the outermost and the second are through-routes, the rest local
for (let r = 0; r < RING_R.length; r++) {
  const cls = r === RING_R.length - 1 ? 'arterial' : r === 1 ? 'collector' : 'local';
  for (let s = 0; s < SPOKES; s++) {
    const s1 = (s + 1) % SPOKES;
    // Gaps in the inner rings: a missing segment merges two blocks into one
    // larger, odder parcel, which is what stops the result reading as a wheel.
    if (r < RING_R.length - 1 && rng() < 0.2) continue;
    const seg = ringSegment(r, s, s1, cls);
    addRoad(seg.path, seg.cls);
  }
}

// spokes — venue out to the rim. Three are arterials; the rest thin out.
const venuePos = pt(0, 0);
for (let s = 0; s < SPOKES; s++) {
  const arterial = s === MAIN_SPOKE || s === LOT_SPOKE || s === 0;
  const path = [venuePos];
  for (let r = 0; r < RING_R.length; r++) {
    // Minor spokes stop short, leaving dead ends and uneven block depth.
    if (!arterial && r >= 3 && rng() < 0.45) break;
    path.push(node[r][s]);
  }
  if (path.length < 2) continue;
  addRoad(path, arterial ? 'arterial' : r3(s) ? 'collector' : 'local');
}
function r3(s) {
  return s % 3 === 1;
}

// two chords — old roads that predate the rings and cut across them
for (const [sa, sb] of [
  [1, 6],
  [4, 9],
]) {
  addRoad([node[2][sa], node[3][(sa + sb) >> 1], node[2][sb]], 'collector');
}

// the corridor out to the rail anchor, beyond the rim
const anchorPrimary = (() => {
  const a = spokeAngle[MAIN_SPOKE];
  return pt(Math.cos(a) * 2380, Math.sin(a) * 2380);
})();
addRoad([node[RING_R.length - 1][MAIN_SPOKE], anchorPrimary], 'arterial');

const anchorLot = (() => {
  const a = spokeAngle[LOT_SPOKE];
  return pt(Math.cos(a) * 2150, Math.sin(a) * 2150);
})();
addRoad([node[RING_R.length - 1][LOT_SPOKE], anchorLot], 'arterial');

// ----------------------------------------------------------------- the blocks
//
// A parcel between two rings and two spokes. Trapezoids of varying size, and
// `accessNodeIds` is filled with the corners' real ids so the engine can
// actually route residents out of them.

const blocks = [];
const RESIDENT_RINGS = [0, 1, 2, 3];
let blockSeq = 0;
for (const r of RESIDENT_RINGS) {
  for (let s = 0; s < SPOKES; s++) {
    if (rng() < 0.42) continue;
    const s1 = (s + 1) % SPOKES;
    const inner = [node[r][s], node[r][s1]];
    const outer = [node[r + 1][s1], node[r + 1][s]];
    // Inset from the kerb so the parcel sits between the roads, not under them.
    const centre = {
      x: (inner[0].x + inner[1].x + outer[0].x + outer[1].x) / 4,
      y: (inner[0].y + inner[1].y + outer[0].y + outer[1].y) / 4,
    };
    const inset = (p) => pt(p.x + (centre.x - p.x) * 0.16, p.y + (centre.y - p.y) * 0.16);
    const polygon = [...inner, ...outer].map(inset);
    blocks.push({
      id: `block-${++blockSeq}`,
      polygon,
      population: Math.round(rand(140, 460)),
      // The four corners are real junctions in the graph buildNetwork will make.
      accessNodeIds: [...inner, ...outer].map(nodeId),
    });
  }
}

// ------------------------------------------------------------- the businesses
//
// Clustered along the main corridor and the second ring, where the footfall is
// — not scattered uniformly, which is what makes a map look generated.

const CATEGORIES = ['food', 'food', 'food', 'retail', 'retail', 'service'];
const BASELINE = { food: 520, retail: 760, service: 640 };
const businesses = [];
for (let i = 0; i < 40; i++) {
  const onCorridor = rng() < 0.62;
  const a = onCorridor
    ? spokeAngle[MAIN_SPOKE] + rand(-0.1, 0.1)
    : spokeAngle[pick([MAIN_SPOKE - 1, MAIN_SPOKE + 1, LOT_SPOKE, 0])] + rand(-0.14, 0.14);
  const radius = onCorridor ? rand(500, 2050) : rand(700, 1500);
  const category = pick(CATEGORIES);
  businesses.push({
    id: `business-${i + 1}`,
    name: `${category === 'food' ? 'Cafe' : category === 'retail' ? 'Shop' : 'Service'} ${i + 1}`,
    pos: pt(Math.cos(a) * radius + rand(-45, 45), Math.sin(a) * radius + rand(-45, 45)),
    category,
    baselineDailyRevenue: Math.round(BASELINE[category] * rand(0.6, 1.5)),
    catchmentM: 80,
  });
}

// ------------------------------------------------------------------ the world

const allX = [
  ...roads.flatMap((r) => r.path.map((p) => p.x)),
  anchorPrimary.x,
  anchorLot.x,
];
const allY = [
  ...roads.flatMap((r) => r.path.map((p) => p.y)),
  anchorPrimary.y,
  anchorLot.y,
];
const pad = 220;
const bbox = {
  minX: q(Math.min(...allX) - pad),
  minY: q(Math.min(...allY) - pad),
  maxX: q(Math.max(...allX) + pad),
  maxY: q(Math.max(...allY) + pad),
};

const world = {
  version: 1,
  scenario: {
    id: 'arroyo',
    name: 'Arroyo — illustrative venue district',
    event: 'Major stadium event — planning sandbox',
    blurb:
      'A synthetic venue district with an organic street network: ring roads, ' +
      'uneven spokes and irregular parcels. Demand, revenue and geography are ' +
      'invented for demonstration and describe no real place.',
  },
  bbox,
  basemap: { kind: 'grid', spacingM: 400 },
  venue: {
    pos: venuePos,
    name: 'Arroyo Stadium — illustrative',
    capacity: 88000,
    locked: true,
  },
  anchors: [
    {
      id: 'primary',
      name: 'Transit interchange',
      pos: anchorPrimary,
      mode: 'rail',
      // Sized against the egress it has to absorb rather than left to make every
      // plan open at 2000% over capacity, as the lattice fixtures do.
      capacityPerHour: 42000,
      arrivalShare: 0.62,
      locked: true,
    },
    {
      id: 'lot',
      name: 'Park & ride lot',
      pos: anchorLot,
      mode: 'parking',
      capacityPerHour: 26000,
      arrivalShare: 0.38,
      locked: true,
    },
  ],
  baseRoads: roads,
  pieces: [],
  businesses,
  blocks,
  personas: [
    { id: 'resident-1', name: 'Maya', role: 'Resident getting home after work', kind: 'resident', pos: node[1][MAIN_SPOKE + 1] },
    { id: 'resident-2', name: 'Theo', role: 'Resident with a driveway on the corridor', kind: 'resident', pos: node[2][MAIN_SPOKE - 1] },
    { id: 'spectator-1', name: 'Priya', role: 'Spectator arriving by rail', kind: 'spectator', pos: anchorPrimary },
    { id: 'spectator-2', name: 'Dan', role: 'Spectator who drove and parked', kind: 'spectator', pos: anchorLot },
    { id: 'business-1', name: 'Rosa', role: 'Runs a cafe on the corridor', kind: 'business', pos: businesses[0].pos },
    { id: 'business-2', name: 'Ken', role: 'Runs a shop two streets back', kind: 'business', pos: businesses[7].pos },
  ],
  params: {
    spectators: 88000,
    sampleAgents: 2000,
    residentTrips: 4200,
    arrivalWindowMin: 180,
    egressWindowMin: 60,
    seed: 42,
    ticksPerMin: 1,
    conversionRate: 0.08,
    avgTicket: { food: 14, retail: 22, service: 18 },
    exclusionRadiusM: 150,
  },
};

process.stdout.write(JSON.stringify(world, null, 1) + '\n');
