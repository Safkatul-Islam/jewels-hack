# Frozen contract — `lib/sim/types.ts`

**Copy this file into `lib/sim/types.ts` in the first 20 minutes, before anyone writes
logic.** It is the only thing all four people share. Once it's in, changing it means
telling the other three. Adding an optional field is cheap; renaming one is not.

Everything is in **world meters**, origin at the Rose Bowl's center, +x east, +y north.

```ts
// ============================================================
// lib/sim/types.ts   — FROZEN at T+0:20
// ============================================================

export type Vec2 = { x: number; y: number };

// ---------- the world ----------

export type PieceKind =
  | 'shuttle_hub'      // capacity = boardings per hour
  | 'park_and_ride'    // capacity = parking spaces
  | 'vendor_village'   // capacity = number of stalls
  | 'ped_corridor'     // capacity = persons per minute
  | 'bike_valet'       // capacity = bike spaces
  | 'road_closure'     // capacity unused
  | 'security_gate';   // capacity = screenings per hour

export interface Piece {
  id: string;
  kind: PieceKind;
  pos: Vec2;
  rotation: number;       // radians, 0 = pointing north
  capacity: number;
  locked?: boolean;       // the Rose Bowl and Memorial Park Station are locked
  fromMarker?: number;    // set when this piece came from an ArUco marker
}

export interface Business {
  id: string;
  name: string;
  pos: Vec2;
  category: 'food' | 'retail' | 'service';
  baselineDailyRevenue: number;   // USD, a normal non-event day
  catchmentM: number;             // default 80
}

export interface ResidentialBlock {
  id: string;
  polygon: Vec2[];
  population: number;
  accessNodeIds: string[];        // road nodes this block exits through
}

export interface RoadSeed {
  id: string;
  path: Vec2[];                             // real street centerline, polyline
  class: 'arterial' | 'collector' | 'local';
}

export interface SimParams {
  spectators: number;             // 88000
  sampleAgents: number;           // 2000 — simulate these, scale results up
  residentTrips: number;          // 4200
  arrivalWindowMin: number;       // 180
  egressWindowMin: number;        // 60
  seed: number;                   // 42
  ticksPerMin: number;            // 1
  conversionRate: number;         // 0.08
  avgTicket: { food: number; retail: number; service: number };  // 14 / 22 / 18
  exclusionRadiusM: number;       // 150 — vendor village cannibalization radius
}

export interface WorldState {
  version: 1;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  basemap: { src: string; bbox: WorldState['bbox'] };
  venue: { pos: Vec2; capacity: number; name: string };      // Rose Bowl — locked
  railStation: { pos: Vec2; name: string };                  // Memorial Park — locked
  baseRoads: RoadSeed[];
  pieces: Piece[];                 // ← the only thing the user changes
  businesses: Business[];
  blocks: ResidentialBlock[];
  params: SimParams;
}

// ---------- network  (P3) ----------

export interface RoadNode { id: string; pos: Vec2 }

export interface RoadEdge {
  id: string;
  a: string;                 // RoadNode id
  b: string;
  lengthM: number;
  class: 'arterial' | 'collector' | 'local' | 'path' | 'shuttle';
  capacityPerMin: number;
  closed: boolean;
  walkable: boolean;
  driveable: boolean;
}

export interface ShuttleLine {
  id: string;
  nodeIds: string[];
  headwayMin: number;
  vehicleCap: number;
}

export interface RoadNetwork {
  nodes: RoadNode[];
  edges: RoadEdge[];
  shuttles: ShuttleLine[];
  byNode: Record<string, string[]>;   // node id → incident edge ids
  hash: string;                       // hash of pieces[], for cache invalidation
}

export function buildNetwork(w: WorldState): RoadNetwork;

export function route(
  net: RoadNetwork,
  fromNodeId: string,
  toNodeId: string,
  mode: 'walk' | 'drive' | 'transit',
): { nodeIds: string[]; minutes: number } | null;

// ---------- simulation  (P3) ----------

export interface Metrics {
  egressMedianMin: number;
  egressP90Min: number;
  transitModeSharePct: number;
  residentDelayMin: number;
  residentsBlockedPct: number;
  localRevenueUsd: number;
  vendorRevenueUsd: number;
  localCapturePct: number;
  businessesNetPositive: number;
  crowdPeakPerM2: number;
}

export interface Heatmap {
  cellM: number;          // metres per cell, 25
  cols: number;
  rows: number;
  origin: Vec2;           // world position of cell [0,0]
  values: Float32Array;   // length cols*rows, row-major
}

export interface Weights { games: number; livability: number; economy: number }

export interface Score {
  total: number;          // 0–100
  games: number;
  livability: number;
  economy: number;
}

export interface SimResult {
  metrics: Metrics;
  score: Score;
  heatmaps: { pedestrian: Heatmap; congestion: Heatmap };
  timeline: { minute: number; inside: number; onFoot: number; onShuttle: number; inCar: number }[];
  perBusiness: { id: string; revenueUsd: number; deltaPct: number }[];
  warnings: string[];     // "shuttle hub over capacity", "no path from gate 3"
  runtimeMs: number;
}

export function simulate(w: WorldState, net: RoadNetwork): SimResult;

export function scorePlan(m: Metrics, weights: Weights): Score;

// ---------- vision  (P4) ----------

export interface MarkerReading {
  markerId: number;
  pos: Vec2;              // ALREADY converted to world meters
  rotation: number;
  confidence: number;     // 0–1
}

/** marker id → what it represents. Print these; tape the number on the back. */
export const MARKER_MAP: Record<number, PieceKind | 'venue' | 'station'> = {
  0:  'venue',            // the Rose Bowl — placed first, defines the table's origin
  1:  'station',          // Memorial Park Station — defines the table's scale and rotation
  10: 'shuttle_hub',
  11: 'park_and_ride',
  12: 'vendor_village',
  13: 'ped_corridor',
  14: 'bike_valet',
  15: 'road_closure',
  16: 'security_gate',
};

export function markersToWorld(readings: MarkerReading[], base: WorldState): WorldState;

// ---------- personas  (P2) ----------

export interface Persona {
  id: string;
  name: string;
  role: string;           // "owns a taco shop on Fair Oaks", "lives on Rosemont Ave"
  pos: Vec2;
  quote: string;          // filled by the LLM
  sentiment: 'positive' | 'mixed' | 'negative';
}
```

## How vision calibrates — read this before building the table mode

Markers `0` (venue) and `1` (station) are the calibration pair. Put them on the table
first. Their real-world separation is known from the fixture — the Rose Bowl to Memorial
Park Station, about 2,900 m. So:

- **scale** = 2900 / (pixel distance between markers 0 and 1)
- **rotation** = the angle of the 0→1 vector, minus the same angle in world coordinates
- **origin** = marker 0's centre

Every other marker's pixel position runs through that transform to become world meters.
This means **the table can be any size, at any angle, and the camera can be anywhere.**
Don't hard-code a homography; derive it from the two calibration markers every frame. It
takes about fifteen lines and removes the single biggest source of demo failure.

Smooth the readings — a marker's position should be a rolling average over ~5 frames, and a
marker that disappears for under half a second should keep its last position. Raw per-frame
ArUco output jitters by several pixels, and un-smoothed jitter will re-trigger the
simulation constantly. Re-run the sim only when a marker moves more than ~15 m in world
terms, or on an explicit "Confirm" button.

**Use the Confirm button for the demo.** Live continuous re-simulation looks impressive for
ten seconds and then looks broken. Markers move → the plan updates live on screen → the
user presses Confirm → the simulation runs and the dashboard fills in. That's also exactly
the interaction described in the original idea, and it's the right one.

## Stub-first checklist — done by T+0:20

Everyone commits something that compiles and returns nonsense:

- [ ] **P3** `buildNetwork` returns nodes and edges derived only from `baseRoads`, ignoring
      pieces. `simulate` returns a hard-coded `SimResult`. `scorePlan` does the real
      arithmetic — it's ten lines and it's useful immediately.
- [ ] **P1** Zustand store holding a `WorldState` loaded from `fixtures/rosebowl.json`,
      `transform.ts` with `worldToScreen` / `screenToWorld`, and an SVG that draws the
      basemap with the venue as a circle.
- [ ] **P2** Dashboard rendering `fixtures/mock-result.ts`. Every metric card on screen
      with fake numbers, charts drawn. Do not wait for the engine.
- [ ] **P4** `fixtures/rosebowl.json` with a coarse street network, ~40 businesses, ~12
      residential blocks, and `public/arroyo.png`. Coarse is fine — 30 nodes and 40 edges
      is enough. **This file unblocks P1 and P3, so it is the first deliverable of the
      whole project.**

Then the integration at T+2:00 is just deleting stubs, one at a time, and watching real
numbers replace fake ones.
