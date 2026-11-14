// Headless check of lib/sim/network.ts against a tiny synthetic grid.
// Run: npx tsx scripts/test-network.ts

import type { RoadSeed, WorldState } from '../lib/sim/types.js';
import { buildNetwork, route } from '../lib/sim/network.js';

// A 3x3 grid, 100m spacing, local roads only:
//   (0,0)----(100,0)----(200,0)
//     |          |          |
//   (0,100)--(100,100)--(200,100)
//     |          |          |
//   (0,200)--(100,200)--(200,200)
const pts = [0, 100, 200];
const baseRoads: RoadSeed[] = [];
let id = 0;
for (const y of pts) {
  for (let i = 1; i < pts.length; i++) {
    baseRoads.push({ id: `h${id++}`, class: 'local', path: [{ x: pts[i - 1]!, y }, { x: pts[i]!, y }] });
  }
}
for (const x of pts) {
  for (let i = 1; i < pts.length; i++) {
    baseRoads.push({ id: `v${id++}`, class: 'local', path: [{ x, y: pts[i - 1]! }, { x, y: pts[i]! }] });
  }
}

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

function makeWorld(pieces: WorldState['pieces']): WorldState {
  return {
    version: 1,
    scenario: { id: 'test', name: 'grid', event: 'unit test', blurb: '' },
    bbox: { minX: -50, minY: -50, maxX: 250, maxY: 250 },
    basemap: { kind: 'grid', spacingM: 50 },
    venue: { pos: { x: 0, y: 100 }, name: 'Test Venue', capacity: 90000, locked: true },
    anchors: [
      { id: 'a1', name: 'Anchor 1', pos: { x: 200, y: 100 }, mode: 'rail', capacityPerHour: 10000, arrivalShare: 1 },
    ],
    baseRoads,
    pieces,
    businesses: [],
    blocks: [],
    personas: [],
    params,
  };
}

let allPass = true;
function check(label: string, pass: boolean) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}`);
  if (!pass) allPass = false;
}

// ---- 1. baseline routing, no pieces ----
const baseWorld = makeWorld([]);
const baseNet = buildNetwork(baseWorld);
check('grid has 9 nodes', baseNet.nodes.length === 9);
check('venue resolves to the node at (0,100)', baseNet.venueNodeId === 'n_0_100');
check('anchor resolves to the node at (200,100)', baseNet.anchorNodeIds['a1'] === 'n_200_100');

const directRoute = route(baseNet, baseNet.venueNodeId, baseNet.anchorNodeIds['a1']!, 'walk');
check('direct route exists', directRoute !== null);
check('direct route is the straight line (200m / 80 m/min = 2.5 min)', Math.abs((directRoute?.minutes ?? -1) - 2.5) < 0.01);

// ---- 2. road_closure forces a detour ----
const closedWorld = makeWorld([
  { id: 'rc1', kind: 'road_closure', pos: { x: 150, y: 100 }, rotation: 0, capacity: 0 },
]);
const closedNet = buildNetwork(closedWorld);
const detourRoute = route(closedNet, closedNet.venueNodeId, closedNet.anchorNodeIds['a1']!, 'walk');
check('detour route exists after closure', detourRoute !== null);
check('detour is longer than the direct route', (detourRoute?.minutes ?? 0) > (directRoute?.minutes ?? 0));
check('hash changes when pieces change', closedNet.hash !== baseNet.hash);

// ---- 3. ped_corridor creates a shortcut ----
// A corridor piece placed just off-grid picks the two nearest existing nodes and
// links them directly with a new edge.
const shortcutWorld = makeWorld([
  { id: 'pc2', kind: 'ped_corridor', pos: { x: 90, y: 10 }, rotation: 0, capacity: 100 },
]);
const shortcutNet = buildNetwork(shortcutWorld);
const hasDirectShortcut = shortcutNet.edges.some((e) => e.id.startsWith('e_corridor_'));
check('ped_corridor adds a new shortcut edge', hasDirectShortcut);

// ---- 4. shuttle_hub adds a shuttle line and a faster transit option ----
const shuttleWorld = makeWorld([
  { id: 'sh1', kind: 'shuttle_hub', pos: { x: 0, y: 100 }, rotation: 0, capacity: 1200 },
]);
const shuttleNet = buildNetwork(shuttleWorld);
check('shuttle_hub registers a ShuttleLine', shuttleNet.shuttles.length === 1);
const transitRoute = route(shuttleNet, shuttleNet.venueNodeId, shuttleNet.anchorNodeIds['a1']!, 'transit');
check('transit route exists', transitRoute !== null);

console.log();
console.log(allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(allPass ? 0 : 1);
