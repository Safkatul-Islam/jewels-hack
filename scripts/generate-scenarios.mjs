import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Synthetic planning networks. No coordinates, businesses or demand are survey data.
const root = new URL('../', import.meta.url);
export function makeScenario({ id, name, event, step, spectators, railAtDoor }) {
  const point = (column, row) => ({ x: column * step, y: row * step });
  const baseRoads = [];
  // 30 unique junctions, 49 individual edges. Shared endpoints are exactly equal.
  for (let row = 0; row < 5; row++) {
    for (let column = -2; column < 3; column++) {
      baseRoads.push({ id: `h-${column}-${row}`, path: [point(column, row), point(column + 1, row)], class: row === 0 || row === 4 ? 'arterial' : 'local' });
    }
  }
  for (let column = -2; column <= 3; column++) {
    for (let row = 0; row < 4; row++) {
      baseRoads.push({ id: `v-${column}-${row}`, path: [point(column, row), point(column, row + 1)], class: column === 0 ? 'arterial' : 'collector' });
    }
  }
  const venue = point(0, 0);
  const primary = railAtDoor ? point(1, 0) : point(0, 4);
  const secondary = point(3, 4);
  const kinds = ['food', 'retail', 'service'];
  const businesses = Array.from({ length: 40 }, (_, index) => {
    const row = 2 + Math.floor(index / 20);
    const column = -1 + (index % 20) / 5;
    return {
      id: `business-${index + 1}`, name: `Example ${kinds[index % 3]} business ${index + 1}`,
      pos: { x: column * step, y: row * step + (index % 2 ? 22 : -22) },
      category: kinds[index % 3], baselineDailyRevenue: 500 + (index % 8) * 125, catchmentM: 80,
    };
  });
  const blocks = Array.from({ length: 12 }, (_, index) => {
    const column = -2 + index % 4;
    const row = 1 + Math.floor(index / 4);
    const a = point(column, row);
    return {
      id: `block-${index + 1}`,
      polygon: [
        { x: a.x + 40, y: a.y + 40 }, { x: a.x + step - 40, y: a.y + 40 },
        { x: a.x + step - 40, y: a.y + step - 40 }, { x: a.x + 40, y: a.y + step - 40 },
      ], population: 220 + (index % 4) * 40,
      // Resolved to actual generated node IDs by P3. See scenario metadata below.
      accessNodeIds: [],
    };
  });
  const definitions = [
    ['resident-1', 'Maya', 'Resident returning home after work', 'resident', point(-1, 2)],
    ['resident-2', 'Daniel', 'Resident making a grocery trip', 'resident', point(1, 3)],
    ['owner-1', 'Rosa', 'Owner of an example neighbourhood cafe', 'business_owner', businesses[0].pos],
    ['owner-2', 'Sam', 'Owner of an example local retail shop', 'business_owner', businesses[7].pos],
    ['visitor-1', 'Alex', 'Visitor using the primary arrival connection', 'visitor', primary],
    ['visitor-2', 'Jordan', 'Visitor arriving from the parking connection', 'visitor', secondary],
  ];
  return {
    version: 1,
    scenario: { id, name, event, blurb: 'Synthetic demonstration network; demand, revenue and geography are modelling assumptions.' },
    bbox: { minX: -2.5 * step, minY: -0.6 * step, maxX: 3.5 * step, maxY: 4.6 * step },
    basemap: { kind: 'grid', spacingM: step },
    venue: { pos: venue, name: railAtDoor ? 'Example downtown arena' : 'Rose Bowl — illustrative scenario', capacity: spectators, locked: true },
    anchors: [
      { id: 'primary', name: railAtDoor ? 'Example adjacent rail connection' : 'Example station/shuttle connection', pos: primary, mode: 'rail', capacityPerHour: railAtDoor ? 26000 : 18000, arrivalShare: 0.65, locked: true },
      { id: 'parking', name: 'Example parking connection', pos: secondary, mode: 'parking', capacityPerHour: 22000, arrivalShare: 0.35, locked: true },
    ],
    baseRoads,
    pieces: [
      { id: 'initial-hub', kind: 'shuttle_hub', pos: point(0, 3), rotation: 0, capacity: 18000 },
      { id: 'initial-vendors', kind: 'vendor_village', pos: { x: step * 0.45, y: step * 2.95 }, rotation: 0, capacity: 20 },
      { id: 'initial-corridor', kind: 'ped_corridor', pos: point(0, 2), rotation: 0, capacity: 180 },
      { id: 'initial-parking', kind: 'park_and_ride', pos: point(3, 3), rotation: 0, capacity: 2500 },
    ],
    businesses, blocks,
    personas: definitions.map(([id, name, role, kind, pos]) => ({ id, name, role, kind, pos })),
    params: { spectators, sampleAgents: 2000, residentTrips: 4200, arrivalWindowMin: 180, egressWindowMin: 60, seed: 42, ticksPerMin: 1, conversionRate: 0.08, avgTicket: { food: 14, retail: 22, service: 18 }, exclusionRadiusM: 150 },
  };
}

export const scenarios = [
  makeScenario({ id: 'rosebowl', name: 'Rose Bowl, Pasadena — illustrative', event: 'Major stadium event — planning sandbox', step: 650, spectators: 88000, railAtDoor: false }),
  makeScenario({ id: 'downtown', name: 'Example downtown arena', event: 'Urban arena event — planning sandbox', step: 180, spectators: 18000, railAtDoor: true }),
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(new URL('fixtures/', root), { recursive: true });
  for (const scenario of scenarios) {
    writeFileSync(new URL(`fixtures/scenario-${scenario.scenario.id}.json`, root), JSON.stringify(scenario, null, 2) + '\n');
    console.log(`${scenario.scenario.id}: ${scenario.baseRoads.length} edges, ${scenario.businesses.length} businesses, ${scenario.blocks.length} blocks`);
  }
}
