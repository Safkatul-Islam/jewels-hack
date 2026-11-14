# Frozen contract — `lib/sim/types.ts`

**Copy this into `lib/sim/types.ts` in the first 20 minutes, before anyone writes logic.**
It is the only thing all four people share. Once it's in, changing it means telling the
other three. Adding an optional field is cheap; renaming one is not.

Everything is in **world metres**, origin at the **venue centre**, +x east, +y north.

**Nothing here names a city.** Every place-specific value lives in a scenario JSON file. If
a literal distance or place name appears in `lib/sim/`, it's a bug.

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
  locked?: boolean;
  fromMarker?: number;    // set when this piece came from an ArUco marker
}

/**
 * Where spectators come from and go to. Replaces any single hard-coded station.
 * A scenario may have one anchor or six; the sim treats them uniformly.
 */
export interface ArrivalAnchor {
  id: string;
  name: string;
  pos: Vec2;
  mode: 'rail' | 'bus' | 'parking' | 'highway_exit' | 'rideshare';
  /** people per hour this anchor can absorb on egress */
  capacityPerHour: number;
  /** share of spectators who use this anchor, 0–1. Should sum to ~1 across anchors. */
  arrivalShare: number;
  locked?: boolean;
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
  path: Vec2[];                   // polyline, abstract — NOT a digitised street
  class: 'arterial' | 'collector' | 'local';
}

/** A persona's fixed identity. The LLM fills in `quote` at runtime. */
export interface PersonaSeed {
  id: string;
  name: string;
  role: string;                   // "owns a taco shop on the main street"
  pos: Vec2;
  kind: 'resident' | 'business_owner' | 'visitor';
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
  exclusionRadiusM: number;       // 150 — vendor village cannibalisation radius
}

/** Optional backdrop. A scenario with no image must still render well. */
export type Basemap =
  | { kind: 'image'; src: string; bbox: BBox }
  | { kind: 'grid'; spacingM: number };

export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

export interface WorldState {
  version: 1;
  scenario: {
    id: string;
    name: string;              // "Rose Bowl, Pasadena"
    event: string;             // "LA28 Olympic football — semifinal"
    blurb: string;             // one line shown in the scenario picker
  };
  bbox: BBox;
  basemap: Basemap;
  venue: { pos: Vec2; name: string; capacity: number; locked: true };
  anchors: ArrivalAnchor[];    // at least one
  baseRoads: RoadSeed[];
  pieces: Piece[];             // ← the only thing the user changes
  businesses: Business[];
  blocks: ResidentialBlock[];
  personas: PersonaSeed[];
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
  /** nearest road node to each anchor and to the venue — the sim's origins/destinations */
  venueNodeId: string;
  anchorNodeIds: Record<string, string>;   // ArrivalAnchor.id → RoadNode.id
  hash: string;                            // hash of pieces[], for cache invalidation
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
  perAnchor: { id: string; departures: number; peakLoadPct: number }[];
  warnings: string[];     // "shuttle hub over capacity", "no path from gate 3"
  runtimeMs: number;
}

export function simulate(w: WorldState, net: RoadNetwork): SimResult;

export function scorePlan(m: Metrics, weights: Weights): Score;

// ---------- vision  (P4) ----------

export interface MarkerReading {
  markerId: number;
  pos: Vec2;              // ALREADY converted to world metres
  rotation: number;
  confidence: number;     // 0–1
}

/**
 * marker id → what it represents. Print these; tape the number on the back.
 * 0 and 1 are the calibration pair: the venue, and the scenario's PRIMARY anchor
 * (anchors[0]). Their true separation is read from the loaded scenario, so the same
 * printed markers work for every scenario.
 */
export const MARKER_MAP: Record<number, PieceKind | 'venue' | 'anchor'> = {
  0:  'venue',
  1:  'anchor',
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

export interface Persona extends PersonaSeed {
  quote: string;                                      // filled by the LLM
  sentiment: 'positive' | 'mixed' | 'negative';
}
```

## How vision calibrates — read this before building the table mode

Markers `0` (venue) and `1` (primary anchor) are the calibration pair. Put them on the
table first. **Their true separation comes from the loaded scenario** — `distance(venue.pos,
anchors[0].pos)` — not from a constant. That's what makes the same printed markers work for
every scenario. Each frame:

```
trueM    = distance(world.venue.pos, world.anchors[0].pos)
scale    = trueM / pixelDistance(marker0, marker1)
rotation = angle(marker0 → marker1)  −  angle(venue → anchors[0] in world coords)
origin   = marker0.center
```

Then every other marker's pixel centre runs through that transform to become world metres.

This means **the table can be any size, at any angle, with the camera anywhere, for any
scenario.** Don't hard-code a homography; derive it from the two calibration markers every
frame. It's about fifteen lines and it removes the single biggest source of demo failure.

Smooth the readings — rolling average over ~5 frames, and a marker that vanishes for under
half a second keeps its last position. Raw per-frame ArUco output jitters by several pixels,
which at table scale is tens of world metres. Re-run the sim only when a marker moves more
than ~15 m in world terms, or on an explicit **Confirm** button.

**Use the Confirm button for the demo.** Markers move → the plan updates live on screen →
the user presses Confirm → the simulation runs and the dashboard fills. Continuous
re-simulation looks impressive for ten seconds and then looks broken. It's also exactly the
interaction the original idea described.

## Stub-first checklist — done by T+0:20

Everyone commits something that compiles and returns nonsense:

- [ ] **P3** `buildNetwork` returns nodes and edges derived only from `baseRoads`, ignoring
      pieces, with `venueNodeId` and `anchorNodeIds` resolved by nearest-node. `simulate`
      returns a hard-coded `SimResult`. `scorePlan` does the real arithmetic — it's ten
      lines and useful immediately.
- [ ] **P1** `lib/scenarios.ts` loading a scenario JSON into the Zustand store,
      `transform.ts` with `worldToScreen` / `screenToWorld`, and an SVG drawing the grid
      backdrop with the venue as a circle and anchors as squares.
- [ ] **P2** Dashboard rendering `fixtures/mock-result.ts`. Every metric card on screen with
      fake numbers, charts drawn. Do not wait for the engine.
- [ ] **P4** `fixtures/scenario-rosebowl.json` — a coarse abstract network, ~40 businesses,
      ~12 blocks, 6 personas, 2 anchors. **This file unblocks P1 and P3, so it is the first
      deliverable of the whole project.** Make it plausible, not accurate.

Then the integration at T+2:00 is deleting stubs one at a time and watching real numbers
replace fake ones.
