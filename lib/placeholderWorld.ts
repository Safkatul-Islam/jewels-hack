// lib/placeholderWorld.ts — P1, TEMPORARY
//
// ⚠️  DELETE THIS FILE AT INTEGRATION 1 (T+2:00).
//
// P4 owns the real scenarios (fixtures/scenario-*.json) and that file is the
// gating deliverable. This exists only so the canvas, the transform and the
// store can be built and looked at before it lands — it is deliberately ugly,
// deliberately small, and deliberately not named after anywhere real, so that
// nobody mistakes it for the scenario or demos it by accident.
//
// Everything here is generated from a handful of parameters, deterministically.
// No Math.random, so the placeholder is the same on four laptops.

import type { WorldState } from '@/lib/sim/types';

const CORRIDOR_M = 2400;   // venue → primary anchor, roughly
const BLOCK_M = 300;       // grid spacing

function grid(): WorldState['baseRoads'] {
  const roads: WorldState['baseRoads'] = [];

  // Two arterials aimed at the anchors, then a loose local grid over the corridor.
  roads.push({
    id: 'art-main',
    class: 'arterial',
    path: [
      { x: -300, y: 0 },
      { x: 900, y: 120 },
      { x: 1800, y: 240 },
      { x: CORRIDOR_M, y: 300 },
    ],
  });
  roads.push({
    id: 'art-south',
    class: 'arterial',
    path: [
      { x: -200, y: -200 },
      { x: 700, y: -600 },
      { x: -800, y: -700 },
    ],
  });

  for (let i = 0; i < 6; i++) {
    const x = -300 + i * (BLOCK_M + 120);
    roads.push({
      id: `loc-n${i}`,
      class: i % 2 === 0 ? 'collector' : 'local',
      path: [
        { x, y: -700 },
        { x: x + 60, y: 700 },
      ],
    });
  }
  for (let j = 0; j < 4; j++) {
    const y = -600 + j * 420;
    roads.push({
      id: `loc-e${j}`,
      class: j === 2 ? 'collector' : 'local',
      path: [
        { x: -400, y },
        { x: CORRIDOR_M - 200, y: y + 80 },
      ],
    });
  }
  return roads;
}

function businesses(): WorldState['businesses'] {
  const cats = ['food', 'retail', 'service'] as const;
  return Array.from({ length: 12 }, (_, i) => ({
    id: `biz-${i}`,
    name: `Business ${i + 1}`,
    pos: { x: 1500 + (i % 4) * 180, y: 80 + Math.floor(i / 4) * 160 - 160 },
    category: cats[i % 3],
    baselineDailyRevenue: 900 + (i % 5) * 220,
    catchmentM: 80,
  }));
}

function blocks(): WorldState['blocks'] {
  return Array.from({ length: 3 }, (_, i) => {
    const x = 200 + i * 700;
    const y = -500;
    return {
      id: `blk-${i}`,
      polygon: [
        { x, y },
        { x: x + 420, y },
        { x: x + 420, y: y - 320 },
        { x, y: y - 320 },
      ],
      population: 1400 + i * 260,
      accessNodeIds: [],
    };
  });
}

export const PLACEHOLDER_WORLD: WorldState = {
  version: 1,
  scenario: {
    id: 'placeholder',
    name: 'Placeholder corridor',
    event: 'Not a real scenario',
    blurb: 'Dev stand-in until the real scenario lands. Do not demo this.',
  },
  bbox: { minX: -1200, minY: -1200, maxX: 2700, maxY: 1200 },
  basemap: { kind: 'grid', spacingM: 200 },
  venue: { pos: { x: 0, y: 0 }, name: 'Venue', capacity: 88000, locked: true },
  anchors: [
    {
      id: 'anc-rail',
      name: 'Rail station',
      pos: { x: CORRIDOR_M, y: 300 },
      mode: 'rail',
      capacityPerHour: 12000,
      arrivalShare: 0.55,
      locked: true,
    },
    {
      id: 'anc-lot',
      name: 'Remote lot',
      pos: { x: -800, y: -700 },
      mode: 'parking',
      capacityPerHour: 6000,
      arrivalShare: 0.45,
      locked: true,
    },
  ],
  baseRoads: grid(),
  pieces: [],
  businesses: businesses(),
  blocks: blocks(),
  personas: [
    {
      id: 'per-1',
      name: 'Placeholder resident',
      role: 'lives two streets off the corridor',
      pos: { x: 500, y: -620 },
      kind: 'resident',
    },
    {
      id: 'per-2',
      name: 'Placeholder owner',
      role: 'runs a food counter near the station',
      pos: { x: 1680, y: 60 },
      kind: 'business_owner',
    },
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
