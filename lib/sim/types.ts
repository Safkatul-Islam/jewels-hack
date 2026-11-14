// ============================================================
// lib/sim/types.ts   — FROZEN CONTRACT
//
// Copied verbatim from docs/02-CONTRACTS.md at T+0:20.
// Adding an OPTIONAL field is free. Renaming or removing one costs everybody
// a merge conflict — announce it to all four people first.
//
// Everything is in WORLD METRES, origin at the VENUE CENTRE, +x east, +y north.
// Nothing in this file, or anywhere in lib/sim/, names a city or hard-codes a
// distance. Every place-specific value lives in a scenario JSON.
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

// ---------- personas  (P2) ----------

export interface Persona extends PersonaSeed {
  quote: string;                                      // filled by the LLM
  sentiment: 'positive' | 'mixed' | 'negative';
}

// ============================================================
// Module APIs
//
// 02-CONTRACTS.md declares these as bare function signatures. A .ts file cannot
// hold a body-less `export function`, so they live here as function TYPES and are
// implemented in the owning module. The signatures are unchanged:
//
//   lib/sim/network.ts   (P3)  buildNetwork, route
//   lib/sim/simulate.ts  (P3)  simulate, scorePlan
//   lib/vision/markersToWorld.ts (P4)  markersToWorld
//
// Implementations may be typed against these, but nothing is forced to import
// them — matching the signature is what matters.
// ============================================================

export type BuildNetwork = (w: WorldState) => RoadNetwork;

export type Route = (
  net: RoadNetwork,
  fromNodeId: string,
  toNodeId: string,
  mode: 'walk' | 'drive' | 'transit',
) => { nodeIds: string[]; minutes: number } | null;

export type Simulate = (w: WorldState, net: RoadNetwork) => SimResult;

export type ScorePlan = (m: Metrics, weights: Weights) => Score;

export type MarkersToWorld = (readings: MarkerReading[], base: WorldState) => WorldState;
