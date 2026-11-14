// ============================================================
// lib/sim/network.ts   (P3)
// ============================================================
// buildNetwork(world) → RoadNetwork, and route() over it.
//
// Nothing here names a city or hard-codes a distance that belongs to one scenario —
// the grid comes entirely from world.baseRoads, world.pieces, world.anchors, world.venue.
// The constants below (speeds, default capacities) are generic model physics, the same
// for every scenario, not facts about any one place.

import type { BBox, Piece, RoadEdge, RoadNetwork, RoadNode, RoadSeed, ShuttleLine, Vec2, WorldState } from './types';
import { distance, distanceToSegment } from './geometry';

export type TravelMode = 'walk' | 'drive' | 'transit';

const SNAP_PRECISION_M = 0.5; // positions within this distance share a node

// Pedestrian-crowd capacity, in persons/minute — this is what spectator egress
// queues against (lib/sim/simulate.ts's bottleneck delay), so it's sized for a
// walkable street carrying a crowd, not a vehicle lane. The same field doubles as
// vehicle capacity for the (much lower-volume) resident congestion estimate — a
// simplification forced by RoadEdge having one capacityPerMin, not two.
const DEFAULT_CAPACITY_PER_MIN: Record<RoadSeed['class'], number> = {
  arterial: 2000,
  collector: 1000,
  local: 500,
};

// Model speeds, in metres/minute. Generic to the simulation, not any one venue.
const WALK_SPEED_M_PER_MIN = 80; // ~1.33 m/s
const DRIVE_SPEED_M_PER_MIN: Record<RoadSeed['class'], number> = {
  arterial: 600, // ~36 km/h
  collector: 400, // ~24 km/h
  local: 250, // ~15 km/h
};
const SHUTTLE_SPEED_M_PER_MIN = 500; // ~30 km/h, dedicated lane assumption
const DEFAULT_SHUTTLE_VEHICLE_CAP = 60;
const DEFAULT_SHUTTLE_HEADWAY_MIN = 15;

// ---------- node/edge bookkeeping during build ----------

interface MutableNetwork {
  nodes: Map<string, RoadNode>;
  edges: Map<string, RoadEdge>;
  shuttles: ShuttleLine[];
}

export function snapKey(pos: Vec2): string {
  const x = Math.round(pos.x / SNAP_PRECISION_M) * SNAP_PRECISION_M;
  const y = Math.round(pos.y / SNAP_PRECISION_M) * SNAP_PRECISION_M;
  return `n_${x}_${y}`;
}

function getOrCreateNode(net: MutableNetwork, pos: Vec2): RoadNode {
  const key = snapKey(pos);
  let node = net.nodes.get(key);
  if (!node) {
    node = { id: key, pos };
    net.nodes.set(key, node);
  }
  return node;
}

function addEdge(
  net: MutableNetwork,
  id: string,
  a: RoadNode,
  b: RoadNode,
  cls: RoadEdge['class'],
  opts: Partial<Pick<RoadEdge, 'capacityPerMin' | 'walkable' | 'driveable' | 'closed'>> = {},
): RoadEdge {
  const edge: RoadEdge = {
    id,
    a: a.id,
    b: b.id,
    lengthM: distance(a.pos, b.pos),
    class: cls,
    capacityPerMin: opts.capacityPerMin ?? DEFAULT_CAPACITY_PER_MIN[cls as RoadSeed['class']] ?? 100,
    closed: opts.closed ?? false,
    walkable: opts.walkable ?? true,
    driveable: opts.driveable ?? true,
  };
  net.edges.set(id, edge);
  return edge;
}

function nearestNode(net: MutableNetwork, pos: Vec2, exclude?: Set<string>): RoadNode | null {
  let best: RoadNode | null = null;
  let bestDist = Infinity;
  for (const node of net.nodes.values()) {
    if (exclude?.has(node.id)) continue;
    const d = distance(node.pos, pos);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

/** Among edges matching `predicate`, the one whose segment passes closest to `pos`. */
function nearestEdge(
  net: MutableNetwork,
  pos: Vec2,
  predicate: (e: RoadEdge) => boolean = () => true,
): RoadEdge | null {
  let best: RoadEdge | null = null;
  let bestDist = Infinity;
  for (const edge of net.edges.values()) {
    if (!predicate(edge)) continue;
    const a = net.nodes.get(edge.a)!;
    const b = net.nodes.get(edge.b)!;
    const d = distanceToSegment(pos, a.pos, b.pos);
    if (d < bestDist) {
      bestDist = d;
      best = edge;
    }
  }
  return best;
}

// ---------- piece handlers ----------

function applyRoadClosure(net: MutableNetwork, piece: Piece): void {
  const edge = nearestEdge(net, piece.pos, (e) => !e.closed);
  if (!edge) return;
  edge.closed = true;
  edge.walkable = false;
  edge.driveable = false;
}

function applyShuttleHub(net: MutableNetwork, piece: Piece, world: WorldState): void {
  const hub = getOrCreateNode(net, piece.pos);
  const nearestExisting = nearestNode(net, piece.pos, new Set([hub.id]));
  if (nearestExisting) {
    addEdge(net, `e_hub_${piece.id}_access`, hub, nearestExisting, 'local', {
      capacityPerMin: DEFAULT_CAPACITY_PER_MIN.local,
    });
  }

  const primaryAnchor = world.anchors[0];
  if (!primaryAnchor) return;
  const anchorNode = getOrCreateNode(net, primaryAnchor.pos);

  const vehicleCap = DEFAULT_SHUTTLE_VEHICLE_CAP;
  const tripsPerHourNeeded = piece.capacity > 0 ? piece.capacity / vehicleCap : 0;
  const headwayMin =
    tripsPerHourNeeded > 0 ? Math.min(20, Math.max(3, 60 / tripsPerHourNeeded)) : DEFAULT_SHUTTLE_HEADWAY_MIN;

  addEdge(net, `e_shuttle_${piece.id}`, hub, anchorNode, 'shuttle', {
    capacityPerMin: Math.max(1, piece.capacity / 60),
    walkable: false,
    driveable: false,
  });

  net.shuttles.push({
    id: `shuttle_${piece.id}`,
    nodeIds: [hub.id, anchorNode.id],
    headwayMin,
    vehicleCap,
  });
}

function applyParkAndRide(net: MutableNetwork, piece: Piece): void {
  const node = getOrCreateNode(net, piece.pos);
  const nearestExisting = nearestNode(net, piece.pos, new Set([node.id]));
  if (!nearestExisting) return;
  addEdge(net, `e_pr_${piece.id}`, node, nearestExisting, 'local', {
    capacityPerMin: Math.max(10, piece.capacity / 10),
  });
}

/** A ped corridor is a shortcut: it links the two nearest existing nodes directly,
 *  which is what makes "drag a corridor, routes visibly shorten" demonstrable. */
function applyPedCorridor(net: MutableNetwork, piece: Piece): void {
  const a = nearestNode(net, piece.pos);
  if (!a) return;
  const b = nearestNode(net, piece.pos, new Set([a.id]));
  if (!b) return;
  addEdge(net, `e_corridor_${piece.id}`, a, b, 'path', {
    capacityPerMin: Math.max(50, piece.capacity),
    driveable: false,
  });
}

function applySecurityGate(net: MutableNetwork, piece: Piece): void {
  const edge = nearestEdge(net, piece.pos);
  if (!edge) return;
  const throughputPerMin = Math.max(1, piece.capacity / 60);
  edge.capacityPerMin = Math.min(edge.capacityPerMin, throughputPerMin);
}

// bike_valet: no network effect — out of scope for the MUST-tier metrics. A placeable
// prop for the demo table, not a routing input.

function applyPiece(net: MutableNetwork, piece: Piece, world: WorldState): void {
  switch (piece.kind) {
    case 'road_closure':
      return applyRoadClosure(net, piece);
    case 'shuttle_hub':
      return applyShuttleHub(net, piece, world);
    case 'park_and_ride':
      return applyParkAndRide(net, piece);
    case 'ped_corridor':
      return applyPedCorridor(net, piece);
    case 'security_gate':
      return applySecurityGate(net, piece);
    case 'bike_valet':
      return;
  }
}

// ---------- hashing (cache invalidation on pieces[]) ----------

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function hashPieces(pieces: Piece[]): string {
  return fnv1a(JSON.stringify(pieces));
}

// ---------- buildNetwork ----------

export function buildNetwork(world: WorldState): RoadNetwork {
  const net: MutableNetwork = { nodes: new Map(), edges: new Map(), shuttles: [] };

  for (const seed of world.baseRoads) {
    for (let i = 1; i < seed.path.length; i++) {
      const a = getOrCreateNode(net, seed.path[i - 1]!);
      const b = getOrCreateNode(net, seed.path[i]!);
      addEdge(net, `e_${seed.id}_${i - 1}`, a, b, seed.class);
    }
  }

  for (const piece of world.pieces) applyPiece(net, piece, world);

  const venueNode = nearestNode(net, world.venue.pos);
  if (!venueNode) throw new Error('buildNetwork: scenario has no roads to anchor the venue to');
  const venueNodeId = venueNode.id;

  const anchorNodeIds: Record<string, string> = {};
  for (const anchor of world.anchors) {
    const node = nearestNode(net, anchor.pos);
    if (node) anchorNodeIds[anchor.id] = node.id;
  }

  const byNode: Record<string, string[]> = {};
  for (const node of net.nodes.values()) byNode[node.id] = [];
  for (const edge of net.edges.values()) {
    byNode[edge.a]!.push(edge.id);
    byNode[edge.b]!.push(edge.id);
  }

  return {
    nodes: [...net.nodes.values()],
    edges: [...net.edges.values()],
    shuttles: net.shuttles,
    byNode,
    venueNodeId,
    anchorNodeIds,
    hash: hashPieces(world.pieces),
  };
}

// ---------- routing ----------

function edgePassable(edge: RoadEdge, mode: TravelMode): boolean {
  if (edge.closed) return false;
  if (mode === 'drive') return edge.driveable;
  if (mode === 'walk') return edge.walkable;
  return edge.walkable || edge.class === 'shuttle'; // transit: walk to/from stops, ride the shuttle leg
}

function findShuttleLine(net: RoadNetwork, a: string, b: string): ShuttleLine | undefined {
  return net.shuttles.find(
    (line) =>
      (line.nodeIds.includes(a) && line.nodeIds.includes(b)) ||
      (line.nodeIds.includes(b) && line.nodeIds.includes(a)),
  );
}

function edgeWeightMinutes(net: RoadNetwork, edge: RoadEdge, mode: TravelMode): number {
  if (mode === 'drive') {
    const speed = DRIVE_SPEED_M_PER_MIN[edge.class as RoadSeed['class']] ?? DRIVE_SPEED_M_PER_MIN.local;
    return edge.lengthM / speed;
  }
  if (edge.class === 'shuttle' && mode === 'transit') {
    const line = findShuttleLine(net, edge.a, edge.b);
    const headway = line?.headwayMin ?? DEFAULT_SHUTTLE_HEADWAY_MIN;
    return edge.lengthM / SHUTTLE_SPEED_M_PER_MIN + headway / 2;
  }
  return edge.lengthM / WALK_SPEED_M_PER_MIN; // walk, and the walk legs of transit
}

export interface ShortestPaths {
  minutes: Record<string, number>;
  prev: Record<string, string | null>;
}

/** Single-source Dijkstra, reusable across many agents who share an origin (or, run on a
 *  network with the edge directions irrelevant since every edge is undirected, a shared
 *  destination). Call once per (network, source, mode) instead of per agent. */
export function shortestPathsFrom(net: RoadNetwork, sourceId: string, mode: TravelMode): ShortestPaths {
  const minutes: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();

  for (const node of net.nodes) minutes[node.id] = Infinity;
  minutes[sourceId] = 0;
  prev[sourceId] = null;

  const edgesByNode = net.byNode;
  const edgeById = new Map(net.edges.map((e) => [e.id, e]));

  while (visited.size < net.nodes.length) {
    let currentId: string | null = null;
    let currentDist = Infinity;
    for (const node of net.nodes) {
      if (visited.has(node.id)) continue;
      const d = minutes[node.id]!;
      if (d < currentDist) {
        currentDist = d;
        currentId = node.id;
      }
    }
    if (currentId === null || currentDist === Infinity) break;
    visited.add(currentId);

    for (const edgeId of edgesByNode[currentId] ?? []) {
      const edge = edgeById.get(edgeId)!;
      if (!edgePassable(edge, mode)) continue;
      const neighborId = edge.a === currentId ? edge.b : edge.a;
      if (visited.has(neighborId)) continue;
      const weight = edgeWeightMinutes(net, edge, mode);
      const candidate = currentDist + weight;
      if (candidate < (minutes[neighborId] ?? Infinity)) {
        minutes[neighborId] = candidate;
        prev[neighborId] = currentId;
      }
    }
  }

  return { minutes, prev };
}

export function route(
  net: RoadNetwork,
  fromNodeId: string,
  toNodeId: string,
  mode: TravelMode,
): { nodeIds: string[]; minutes: number } | null {
  const { minutes, prev } = shortestPathsFrom(net, fromNodeId, mode);
  const total = minutes[toNodeId];
  if (total === undefined || total === Infinity) return null;

  const nodeIds: string[] = [];
  let cur: string | null = toNodeId;
  while (cur !== null) {
    nodeIds.push(cur);
    cur = prev[cur] ?? null;
  }
  nodeIds.reverse();
  return { nodeIds, minutes: total };
}

function edgeByPairMap(net: RoadNetwork): Map<string, RoadEdge> {
  const map = new Map<string, RoadEdge>();
  for (const edge of net.edges) {
    map.set(`${edge.a}_${edge.b}`, edge);
    map.set(`${edge.b}_${edge.a}`, edge);
  }
  return map;
}

/** The edges actually traversed by a path (as returned by route()), in order. */
export function routeEdgeIds(net: RoadNetwork, nodeIds: readonly string[]): string[] {
  const edgeByPair = edgeByPairMap(net);
  const ids: string[] = [];
  for (let i = 1; i < nodeIds.length; i++) {
    const edge = edgeByPair.get(`${nodeIds[i - 1]}_${nodeIds[i]}`);
    if (edge) ids.push(edge.id);
  }
  return ids;
}

/** Whether a path (as returned by route()) traverses at least one real shuttle edge. */
export function pathUsesShuttle(net: RoadNetwork, nodeIds: readonly string[]): boolean {
  const edgeByPair = edgeByPairMap(net);
  for (let i = 1; i < nodeIds.length; i++) {
    const edge = edgeByPair.get(`${nodeIds[i - 1]}_${nodeIds[i]}`);
    if (edge?.class === 'shuttle') return true;
  }
  return false;
}
