// Emits fixtures/scenario-demo.json from a handful of parameters — not a digitised
// street map, an abstract grid (see docs/01-ARCHITECTURE.md: "plausible beats accurate").
//
// This is a PLACEHOLDER engine-testing fixture, not the shipped Rose Bowl default —
// that's P4's deliverable, authored from the sourced facts in docs/00-PRD.md. This one
// exists so lib/sim/* has something realistic-shaped to run against while that lands.
//
// Run: npx tsx fixtures/generate-scenario.ts

import { writeFileSync } from 'node:fs';
import { createRng } from '../lib/sim/rng.js';
import { snapKey } from '../lib/sim/network.js';
import type { ArrivalAnchor, Business, PersonaSeed, ResidentialBlock, RoadSeed, Vec2, WorldState } from '../lib/sim/types.js';

const rng = createRng(42);

const COLS = 6;
const ROWS = 5;
const SPACING_M = 150;
const CENTER_ROW = Math.floor((ROWS - 1) / 2);

function nodePos(col: number, row: number): Vec2 {
  return { x: col * SPACING_M, y: row * SPACING_M };
}

// ---------- road grid ----------
// Row CENTER_ROW is the spine — the one direct arterial from venue to anchors.
// Every other row/column is a collector/local street, so closures have detours to cut.
const baseRoads: RoadSeed[] = [];
let roadId = 0;
for (let row = 0; row < ROWS; row++) {
  for (let col = 1; col < COLS; col++) {
    baseRoads.push({
      id: `h${roadId++}`,
      class: row === CENTER_ROW ? 'arterial' : 'collector',
      path: [nodePos(col - 1, row), nodePos(col, row)],
    });
  }
}
for (let col = 0; col < COLS; col++) {
  for (let row = 1; row < ROWS; row++) {
    baseRoads.push({ id: `v${roadId++}`, class: 'local', path: [nodePos(col, row - 1), nodePos(col, row)] });
  }
}

// ---------- venue + anchors ----------
const venue: WorldState['venue'] = {
  pos: nodePos(0, CENTER_ROW),
  name: 'Demo Venue',
  capacity: 90000,
  locked: true,
};

const anchors: ArrivalAnchor[] = [
  {
    id: 'anchor-bus',
    name: 'Demo Transit Hub',
    pos: nodePos(COLS - 1, CENTER_ROW),
    mode: 'bus',
    capacityPerHour: 12000,
    arrivalShare: 0.6,
  },
  {
    id: 'anchor-parking',
    name: 'Demo Parking Lot',
    pos: nodePos(COLS - 1, CENTER_ROW - 1),
    mode: 'parking',
    capacityPerHour: 8000,
    arrivalShare: 0.4,
  },
];

// ---------- businesses ----------
// Clustered toward the anchor side of the corridor, like a real commercial strip
// forming near the busiest arrival point.
const CATEGORIES: Business['category'][] = ['food', 'retail', 'service'];
const CATEGORY_WEIGHTS = [0.45, 0.35, 0.2];
const BASELINE_RANGE: Record<Business['category'], [number, number]> = {
  food: [800, 1500],
  retail: [1000, 2500],
  service: [600, 1200],
};

const businesses: Business[] = [];
for (let i = 0; i < 40; i++) {
  const col = 2 + rng.range(0, COLS - 2); // concentrated in columns [2, COLS)
  const row = rng.range(0, ROWS - 1);
  const category = rng.weightedPick(CATEGORIES, CATEGORY_WEIGHTS);
  const [lo, hi] = BASELINE_RANGE[category];
  businesses.push({
    id: `biz-${i}`,
    name: `Demo ${category} shop ${i}`,
    pos: { x: col * SPACING_M + rng.range(-20, 20), y: row * SPACING_M + rng.range(-20, 20) },
    category,
    baselineDailyRevenue: Math.round(rng.range(lo, hi)),
    catchmentM: 80,
  });
}

// ---------- residential blocks ----------
// One block per grid cell along the corridor, bounded by the four surrounding nodes;
// access nodes are that cell's own corners, matching network.ts's snapKey() scheme.
const blocks: ResidentialBlock[] = [];
let blockId = 0;
for (let col = 0; col < COLS - 1; col++) {
  for (let row = 0; row < ROWS - 1; row++) {
    if (blockId >= 12) break;
    const corners = [
      nodePos(col, row),
      nodePos(col + 1, row),
      nodePos(col + 1, row + 1),
      nodePos(col, row + 1),
    ];
    blocks.push({
      id: `block-${blockId}`,
      polygon: corners,
      population: Math.round(rng.range(200, 600)),
      accessNodeIds: corners.map(snapKey),
    });
    blockId++;
  }
}

// ---------- personas ----------
const personas: PersonaSeed[] = [
  { id: 'persona-1', name: 'Dana Ruiz', role: 'has lived on the corridor for 20 years', pos: nodePos(1, 0), kind: 'resident' },
  { id: 'persona-2', name: 'Marcus Lee', role: 'owns a corner grocery near the transit hub', pos: nodePos(4, CENTER_ROW), kind: 'business_owner' },
  { id: 'persona-3', name: 'Priya Nair', role: 'runs a coffee shop two blocks from the venue', pos: nodePos(2, CENTER_ROW), kind: 'business_owner' },
  { id: 'persona-4', name: 'Sam Okafor', role: 'commutes through the corridor on event days', pos: nodePos(3, 1), kind: 'resident' },
  { id: 'persona-5', name: 'Grace Kim', role: 'is visiting for the event from out of town', pos: venue.pos, kind: 'visitor' },
  { id: 'persona-6', name: 'Leo Fontaine', role: 'manages the parking lot anchor', pos: anchors[1]!.pos, kind: 'business_owner' },
];

// ---------- params ----------
const params: WorldState['params'] = {
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
};

const maxX = (COLS - 1) * SPACING_M;
const maxY = (ROWS - 1) * SPACING_M;

const world: WorldState = {
  version: 1,
  scenario: {
    id: 'scenario-demo',
    name: 'Demo Corridor (synthetic)',
    event: 'engine test fixture — not a real venue',
    blurb: 'Synthetic placeholder scenario for exercising lib/sim/* end to end.',
  },
  bbox: { minX: -SPACING_M, minY: -SPACING_M, maxX: maxX + SPACING_M, maxY: maxY + SPACING_M },
  basemap: { kind: 'grid', spacingM: SPACING_M },
  venue,
  anchors,
  baseRoads,
  pieces: [],
  businesses,
  blocks,
  personas,
  params,
};

writeFileSync(new URL('./scenario-demo.json', import.meta.url), JSON.stringify(world, null, 2) + '\n');
console.log(`Wrote fixtures/scenario-demo.json: ${baseRoads.length} road segments, ${businesses.length} businesses, ${blocks.length} blocks, ${personas.length} personas.`);
