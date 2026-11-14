// Quick headless check of lib/sim/business.ts against synthetic data.
// Run: npx tsx scripts/test-business.ts

import type { Heatmap, WorldState } from '../lib/sim/types.js';
import { computeBusinessRevenue } from '../lib/sim/business.js';

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

const world: WorldState = {
  version: 1,
  scenario: { id: 'test', name: 'Synthetic test', event: 'unit test', blurb: '' },
  bbox: { minX: -500, minY: -500, maxX: 500, maxY: 500 },
  basemap: { kind: 'grid', spacingM: 50 },
  venue: { pos: { x: 0, y: 0 }, name: 'Test Venue', capacity: 90000, locked: true },
  anchors: [],
  baseRoads: [],
  pieces: [
    { id: 'vv-1', kind: 'vendor_village', pos: { x: 100, y: 0 }, rotation: 0, capacity: 20 },
  ],
  businesses: [
    // far from the vendor village — full conversion rate, should come out net positive
    { id: 'b-far', name: 'Far Cafe', pos: { x: 400, y: 0 }, category: 'food', baselineDailyRevenue: 500, catchmentM: 80 },
    // inside the exclusion radius — conversion rate halved
    { id: 'b-near', name: 'Near Diner', pos: { x: 150, y: 0 }, category: 'food', baselineDailyRevenue: 500, catchmentM: 80 },
    // no foot traffic nearby at all — should stay flat at baseline
    { id: 'b-empty', name: 'Empty Block Shop', pos: { x: -400, y: -400 }, category: 'retail', baselineDailyRevenue: 300, catchmentM: 80 },
  ],
  blocks: [],
  personas: [],
  params,
};

// Pedestrian density of 1 person per m^2 in a corridor along y=0 (where the venue,
// vendor village and the "far"/"near" businesses sit), 0 everywhere else — including
// where "b-empty" sits at (-400,-400), which should see zero passersby.
const cellM = 50;
const cols = 20;
const rows = 20;
const origin = { x: -500, y: -500 };
const values = new Float32Array(cols * rows).fill(0);
for (let row = 0; row < rows; row++) {
  const cellCenterY = origin.y + (row + 0.5) * cellM;
  if (Math.abs(cellCenterY) < cellM) {
    for (let col = 0; col < cols; col++) values[row * cols + col] = 1;
  }
}
const pedestrianHeatmap: Heatmap = { cellM, cols, rows, origin, values };

const result = computeBusinessRevenue(world, pedestrianHeatmap);

console.log('perBusiness:');
for (const b of result.perBusiness) {
  console.log(`  ${b.id.padEnd(8)} revenue=$${b.revenueUsd.toFixed(2).padStart(10)}  delta=${b.deltaPct.toFixed(1)}%`);
}
console.log();
console.log('localRevenueUsd  ', result.localRevenueUsd.toFixed(2));
console.log('vendorRevenueUsd ', result.vendorRevenueUsd.toFixed(2));
console.log('localCapturePct  ', result.localCapturePct.toFixed(1), '%');
console.log('businessesNetPositive', result.businessesNetPositive, '/', world.businesses.length);

// Sanity checks — fail loudly if the exclusivity rule or geometry is broken.
const far = result.perBusiness.find((b) => b.id === 'b-far')!;
const near = result.perBusiness.find((b) => b.id === 'b-near')!;
const empty = result.perBusiness.find((b) => b.id === 'b-empty')!;

const checks: [string, boolean][] = [
  ['far business earns more than baseline', far.revenueUsd > 500],
  ['near business (halved conversion) earns less uplift than far business', near.deltaPct < far.deltaPct],
  ['empty-block business stays at baseline (no passersby)', Math.abs(empty.revenueUsd - 300) < 1e-6],
  ['localCapturePct is between 0 and 100', result.localCapturePct >= 0 && result.localCapturePct <= 100],
];

console.log();
let allPass = true;
for (const [label, pass] of checks) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}`);
  if (!pass) allPass = false;
}
process.exit(allPass ? 0 : 1);
