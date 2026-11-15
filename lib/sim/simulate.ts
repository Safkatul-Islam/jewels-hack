// ============================================================
// lib/sim/simulate.ts   (P3)
// ============================================================
// simulate(world, net) → SimResult, and scorePlan(metrics, weights) → Score.
//
// Pure function, no network calls, no DOM, no Date.now() outside the reported
// runtime, no Math.random() — randomness only through the seeded RNG from
// world.params.seed. See docs/01-ARCHITECTURE.md "Decisions already made".
//
// Two populations are modelled with deliberately different fidelity:
//  - Spectators are tracked tick-by-tick along their actual route, because their
//    egress wave is what the pedestrian heatmap and crowdPeakPerM2 are about.
//  - Residents only need a before/after route-time comparison (residentDelayMin,
//    residentsBlockedPct), so they're sampled as point-in-time trips, not rasterised.

import type { Heatmap, Metrics, RoadNetwork, Score, SimResult, Vec2, Weights, WorldState } from './types';
import {
  buildNetwork,
  routeEdgeIds,
  shortestPathsFrom,
  type ShortestPaths,
  type TravelMode,
} from './network';
import { pointAtDistance, polylineLength } from './geometry';
import { addSpreadToHeatmap, createHeatmap, stampSegmentMax } from './heatmap';
import { mean, percentile, clamp } from './stats';
import { createRng, type Rng } from './rng';
import { computeBusinessRevenue } from './business';

const HEATMAP_CELL_M = 25;

// ---------- spectator egress ----------

/** When spectators start leaving the gates, in minutes after the event ends.
 *  Skewed early (squared) — most of the crowd funnels out in the first third of the
 *  window, a long tail trickles out after. Tunable assumption, not measured. */
function sampleEgressStartMin(rng: Rng, egressWindowMin: number): number {
  return egressWindowMin * 0.4 * rng.next() ** 2;
}

interface SpectatorAgent {
  nodeIds: string[];
  positions: Vec2[];
  pathLengthM: number;
  startMin: number;
  travelMin: number;
  usedTransit: boolean;
  anchorId: string;
}

/**
 * Pure distance/speed routing alone makes egress unrealistically fast — real egress
 * time is dominated by queueing at pinch points (gates, narrow corridors), not walking
 * speed. Approximate it as a fluid queue: if a route's worst edge carries more total
 * load than it can clear within the egress window at its capacityPerMin, everyone using
 * it waits in proportion to that excess. Tunable assumption, not measured — see
 * docs/05-DECISIONS.md's framing on modelling assumptions. Clamped so a pathological
 * scenario (e.g. every anchor closed off) degrades to "very bad" rather than runaway.
 */
const BOTTLENECK_DELAY_PER_EXCESS_MIN = 20;
const MAX_BOTTLENECK_DELAY_MIN = 90;

function computeBottleneckDelayByEdge(
  net: RoadNetwork,
  agents: Pick<SpectatorAgent, 'nodeIds' | 'usedTransit'>[],
  scaleFactor: number,
  egressWindowMin: number,
): Map<string, number> {
  const load = new Map<string, number>();
  for (const agent of agents) {
    if (agent.usedTransit) continue; // shuttle throughput is checked separately via headway/vehicleCap
    for (const edgeId of routeEdgeIds(net, agent.nodeIds)) {
      load.set(edgeId, (load.get(edgeId) ?? 0) + scaleFactor);
    }
  }

  const extraDelayByEdge = new Map<string, number>();
  for (const edge of net.edges) {
    const edgeLoad = load.get(edge.id);
    if (!edgeLoad || !edge.walkable) continue;
    const ratio = edgeLoad / (edge.capacityPerMin * egressWindowMin);
    if (ratio > 1) {
      const delay = Math.min(MAX_BOTTLENECK_DELAY_MIN, (ratio - 1) * BOTTLENECK_DELAY_PER_EXCESS_MIN);
      extraDelayByEdge.set(edge.id, delay);
    }
  }
  return extraDelayByEdge;
}

function nodePositionMap(net: RoadNetwork): Map<string, Vec2> {
  return new Map(net.nodes.map((n) => [n.id, n.pos]));
}

function simulateSpectators(
  world: WorldState,
  net: RoadNetwork,
  rng: Rng,
  warnings: string[],
): {
  egressMedianMin: number;
  egressP90Min: number;
  transitModeSharePct: number;
  agents: SpectatorAgent[];
  anchorDepartureTicks: Map<string, Map<number, number>>; // anchorId -> tick -> scaled count
} {
  const scaleFactor = world.params.spectators / Math.max(1, world.params.sampleAgents);
  const nodePos = nodePositionMap(net);

  const pathsFromVenueByMode = {
    walk: shortestPathsFrom(net, net.venueNodeId, 'walk'),
    transit: shortestPathsFrom(net, net.venueNodeId, 'transit'),
  };

  const agents: SpectatorAgent[] = [];
  const egressTimes: number[] = [];
  const anchorDepartureTicks = new Map<string, Map<number, number>>();
  for (const a of world.anchors) anchorDepartureTicks.set(a.id, new Map());

  let transitUsers = 0;
  let reached = 0;
  const anchorsWithNoPath = new Set<string>();

  for (let i = 0; i < world.params.sampleAgents; i++) {
    const anchor = rng.weightedPick(world.anchors, world.anchors.map((a) => a.arrivalShare));
    const anchorNodeId = net.anchorNodeIds[anchor.id];
    if (!anchorNodeId) {
      anchorsWithNoPath.add(anchor.id);
      continue;
    }

    const walkMin = pathsFromVenueByMode.walk.minutes[anchorNodeId];
    const transitMin = pathsFromVenueByMode.transit.minutes[anchorNodeId];
    const useTransit = transitMin !== undefined && transitMin < (walkMin ?? Infinity);
    const travelMin = useTransit ? transitMin : walkMin;

    if (travelMin === undefined || travelMin === Infinity) {
      anchorsWithNoPath.add(anchor.id);
      continue;
    }

    const paths = useTransit ? pathsFromVenueByMode.transit : pathsFromVenueByMode.walk;
    const nodeIds = reconstructPath(paths, net.venueNodeId, anchorNodeId);
    const positions = nodeIds.map((id) => nodePos.get(id)!);

    const startMin = sampleEgressStartMin(rng, world.params.egressWindowMin);
    if (useTransit) transitUsers++;
    reached++;

    agents.push({
      nodeIds,
      positions,
      pathLengthM: polylineLength(positions),
      startMin,
      travelMin,
      usedTransit: useTransit,
      anchorId: anchor.id,
    });
  }

  for (const anchorId of anchorsWithNoPath) {
    warnings.push(`no path from venue to anchor ${anchorId}`);
  }

  const bottleneckDelayByEdge = computeBottleneckDelayByEdge(
    net,
    agents,
    scaleFactor,
    world.params.egressWindowMin,
  );
  for (const agent of agents) {
    let extra = 0;
    for (const edgeId of routeEdgeIds(net, agent.nodeIds)) {
      extra = Math.max(extra, bottleneckDelayByEdge.get(edgeId) ?? 0);
    }
    agent.travelMin += extra;
  }

  for (const agent of agents) {
    egressTimes.push(agent.startMin + agent.travelMin);
    const completionTick = Math.round(agent.startMin + agent.travelMin);
    const byTick = anchorDepartureTicks.get(agent.anchorId)!;
    byTick.set(completionTick, (byTick.get(completionTick) ?? 0) + scaleFactor);
  }

  return {
    egressMedianMin: percentile(egressTimes, 0.5),
    egressP90Min: percentile(egressTimes, 0.9),
    transitModeSharePct: reached > 0 ? (transitUsers / reached) * 100 : 0,
    agents,
    anchorDepartureTicks,
  };
}

function reconstructPath(paths: ShortestPaths, fromId: string, toId: string): string[] {
  const nodeIds: string[] = [];
  let cur: string | null = toId;
  while (cur !== null) {
    nodeIds.push(cur);
    if (cur === fromId) break;
    cur = paths.prev[cur] ?? null;
  }
  nodeIds.reverse();
  return nodeIds;
}

// ---------- tick-by-tick heatmap raster ----------

/**
 * Pedestrian heatmap units: cumulative person-minutes of presence per m², summed
 * across every tick. integrateHeatmap() (lib/sim/business.ts) sums value × cellArea
 * over a catchment to get "passersby" — really total foot-traffic exposure, not a
 * unique headcount. That's fine: conversionRate is already a tunable assumption, and
 * this keeps exposure time (loitering vs. passing through) part of the signal.
 *
 * crowdPeakPerM2 is tracked separately as the max *instantaneous* density seen in any
 * single tick — the per-tick scratch grid is reset every minute for that purpose.
 */
// Nominal width (metres) a crowd spreads across along a corridor — sidewalk plus
// street, not a single-file line. See addSpreadToHeatmap's doc comment for why this
// matters: without it, every agent is a literal point on a zero-width polyline.
const CROWD_SPREAD_M = 40;

function rasterizeSpectators(
  world: WorldState,
  agents: SpectatorAgent[],
  scaleFactor: number,
): { pedestrian: Heatmap; crowdPeakPerM2: number } {
  const pedestrian = createHeatmap(world.bbox, HEATMAP_CELL_M);
  const cellArea = HEATMAP_CELL_M * HEATMAP_CELL_M;
  const tickHeatmap = createHeatmap(world.bbox, HEATMAP_CELL_M);

  const maxTick = Math.ceil(
    Math.max(world.params.egressWindowMin, ...agents.map((a) => a.startMin + a.travelMin), 0),
  );
  let crowdPeakPerM2 = 0;

  for (let tick = 0; tick <= maxTick; tick++) {
    tickHeatmap.values.fill(0);
    for (const agent of agents) {
      if (tick < agent.startMin || tick > agent.startMin + agent.travelMin) continue;
      const frac = agent.travelMin === 0 ? 1 : (tick - agent.startMin) / agent.travelMin;
      const pos = pointAtDistance(agent.positions, frac * agent.pathLengthM);
      addSpreadToHeatmap(tickHeatmap, pos, scaleFactor / cellArea, CROWD_SPREAD_M);
    }
    for (let i = 0; i < tickHeatmap.values.length; i++) {
      const density = tickHeatmap.values[i]!;
      if (density > crowdPeakPerM2) crowdPeakPerM2 = density;
      pedestrian.values[i]! += density;
    }
  }

  return { pedestrian, crowdPeakPerM2 };
}

// ---------- residents ----------

const MAX_SAMPLED_RESIDENT_TRIPS = 1200;
const NO_PATH_DELAY_PENALTY_MIN = 30; // a trip that's no longer possible at all

function simulateResidents(
  world: WorldState,
  net: RoadNetwork,
  baseNet: RoadNetwork,
  rng: Rng,
): { residentDelayMin: number; residentsBlockedPct: number; congestion: Heatmap } {
  const congestion = createHeatmap(world.bbox, HEATMAP_CELL_M);
  const nodePos = nodePositionMap(net);

  if (world.blocks.length === 0) {
    return { residentDelayMin: 0, residentsBlockedPct: 0, congestion };
  }

  const sampleCount = Math.min(world.params.residentTrips, MAX_SAMPLED_RESIDENT_TRIPS);
  const populationWeights = world.blocks.map((b) => b.population);
  const primaryAnchor = world.anchors[0];

  // ---- P1, performance only: memoise the shortest-path trees ----
  //
  // Both loops below call shortestPathsFrom() per sampled trip and per block
  // access node, on two networks. Every one of those is a full Dijkstra, but
  // the ORIGINS come from block.accessNodeIds, of which there are only a
  // couple of hundred at most — so the same tree was being rebuilt thousands
  // of times. On a 30-node lattice that cost 130 ms and nobody noticed; on a
  // 150-node organic network it was 1.2 seconds, five times the frame budget
  // in docs/01-ARCHITECTURE.md, on every single drop.
  //
  // This changes no result: same function, same arguments, cached. Likewise
  // the node lookup, which was a linear scan of net.nodes inside the loop.
  const pathCache = new Map<string, ShortestPaths>();
  const pathsFrom = (n: RoadNetwork, sourceId: string, mode: TravelMode): ShortestPaths => {
    const key = `${n === baseNet ? 'b' : 'c'}|${mode}|${sourceId}`;
    let paths = pathCache.get(key);
    if (!paths) {
      paths = shortestPathsFrom(n, sourceId, mode);
      pathCache.set(key, paths);
    }
    return paths;
  };
  const netNodeIds = new Set(net.nodes.map((n) => n.id));

  const delays: number[] = [];
  const edgeLoad = new Map<string, number>(); // edgeId -> scaled trips/window using it
  const scalePerTrip = sampleCount > 0 ? world.params.residentTrips / sampleCount : 0;

  for (let i = 0; i < sampleCount; i++) {
    const block = rng.weightedPick(world.blocks, populationWeights);
    if (block.accessNodeIds.length === 0) continue;
    const originNodeId = rng.pick(block.accessNodeIds);
    const destNodeId = primaryAnchor ? net.anchorNodeIds[primaryAnchor.id] : undefined;
    if (!destNodeId || !netNodeIds.has(originNodeId)) continue;

    const mode = rng.next() < 0.7 ? 'drive' : 'walk';
    const cur = pathsFrom(net, originNodeId, mode);
    const base = pathsFrom(baseNet, originNodeId, mode);
    const curMin = cur.minutes[destNodeId];
    const baseMin = base.minutes[destNodeId];

    if (baseMin === undefined || baseMin === Infinity) continue; // not a meaningful baseline trip
    if (curMin === undefined || curMin === Infinity) {
      delays.push(NO_PATH_DELAY_PENALTY_MIN);
      continue;
    }
    delays.push(curMin - baseMin);

    if (mode === 'drive') {
      const nodeIds = reconstructPath(cur, originNodeId, destNodeId);
      for (const edgeId of routeEdgeIds(net, nodeIds)) {
        edgeLoad.set(edgeId, (edgeLoad.get(edgeId) ?? 0) + scalePerTrip);
      }
    }
  }

  for (const edge of net.edges) {
    const load = edgeLoad.get(edge.id);
    if (!load) continue;
    const ratio = clamp(load / Math.max(1, edge.capacityPerMin * world.params.egressWindowMin), 0, 4);
    const a = nodePos.get(edge.a)!;
    const b = nodePos.get(edge.b)!;
    stampSegmentMax(congestion, a, b, ratio);
  }

  let blockedCount = 0;
  for (const block of world.blocks) {
    if (block.accessNodeIds.length === 0) continue;
    const destNodeId = primaryAnchor ? net.anchorNodeIds[primaryAnchor.id] : undefined;
    if (!destNodeId) continue;

    let bestCur = Infinity;
    let bestBase = Infinity;
    for (const nodeId of block.accessNodeIds) {
      if (!netNodeIds.has(nodeId)) continue;
      const curMin = pathsFrom(net, nodeId, 'drive').minutes[destNodeId] ?? Infinity;
      const baseMin = pathsFrom(baseNet, nodeId, 'drive').minutes[destNodeId] ?? Infinity;
      bestCur = Math.min(bestCur, curMin);
      bestBase = Math.min(bestBase, baseMin);
    }

    const isolated = bestCur === Infinity;
    const farSlower = bestBase !== Infinity && bestBase > 0 && bestCur > 2 * bestBase;
    if (isolated || farSlower) blockedCount++;
  }

  return {
    residentDelayMin: mean(delays),
    residentsBlockedPct: (blockedCount / world.blocks.length) * 100,
    congestion,
  };
}

// ---------- top level ----------

export function simulate(world: WorldState, net: RoadNetwork): SimResult {
  const t0 = Date.now();
  const rng = createRng(world.params.seed);
  const warnings: string[] = [];

  const baseNet = buildNetwork({ ...world, pieces: [] });

  const spectatorResult = simulateSpectators(world, net, rng, warnings);
  const scaleFactor = world.params.spectators / Math.max(1, world.params.sampleAgents);
  const { pedestrian, crowdPeakPerM2 } = rasterizeSpectators(world, spectatorResult.agents, scaleFactor);

  const residentResult = simulateResidents(world, net, baseNet, rng);

  const businessResult = computeBusinessRevenue(world, pedestrian);

  const perBusiness = businessResult.perBusiness;
  const businessesNetPositivePct =
    world.businesses.length > 0 ? (businessResult.businessesNetPositive / world.businesses.length) * 100 : 0;

  const timeline = buildTimeline(world, spectatorResult.agents);
  const perAnchor = world.anchors.map((a) => {
    const byTick = spectatorResult.anchorDepartureTicks.get(a.id) ?? new Map();
    const departures = [...byTick.values()].reduce((s, v) => s + v, 0);
    const peakTickLoad = Math.max(0, ...byTick.values());
    const capacityPerMin = a.capacityPerHour / 60;
    const peakLoadPct = capacityPerMin > 0 ? (peakTickLoad / capacityPerMin) * 100 : 0;
    if (peakLoadPct > 100) warnings.push(`anchor ${a.id} over capacity at peak egress`);
    return { id: a.id, departures, peakLoadPct };
  });

  for (const line of net.shuttles) {
    const anchorId = Object.entries(net.anchorNodeIds).find(([, nodeId]) => line.nodeIds.includes(nodeId))?.[0];
    const anchorAgents = spectatorResult.agents.filter((a) => a.usedTransit && a.anchorId === anchorId);
    const riders = anchorAgents.length * scaleFactor;
    const windowCapacity = (line.vehicleCap / line.headwayMin) * world.params.egressWindowMin;
    if (riders > windowCapacity) warnings.push(`shuttle ${line.id} over capacity`);
  }

  const metrics: Metrics = {
    egressMedianMin: spectatorResult.egressMedianMin,
    egressP90Min: spectatorResult.egressP90Min,
    transitModeSharePct: spectatorResult.transitModeSharePct,
    residentDelayMin: residentResult.residentDelayMin,
    residentsBlockedPct: residentResult.residentsBlockedPct,
    localRevenueUsd: businessResult.localRevenueUsd,
    vendorRevenueUsd: businessResult.vendorRevenueUsd,
    localCapturePct: businessResult.localCapturePct,
    businessesNetPositive: businessResult.businessesNetPositive,
    crowdPeakPerM2,
    businessesNetPositivePct,
  };

  const score = scorePlan(metrics, { games: 1, livability: 1, economy: 1 });

  return {
    metrics,
    score,
    heatmaps: { pedestrian, congestion: residentResult.congestion },
    timeline,
    perBusiness,
    perAnchor,
    warnings,
    runtimeMs: Date.now() - t0,
  };
}

function buildTimeline(
  world: WorldState,
  agents: SpectatorAgent[],
): SimResult['timeline'] {
  const minutes = Math.ceil(Math.max(world.params.egressWindowMin, ...agents.map((a) => a.startMin + a.travelMin), 0));
  const scaleFactor = world.params.spectators / Math.max(1, world.params.sampleAgents);
  const timeline: SimResult['timeline'] = [];

  for (let minute = 0; minute <= minutes; minute++) {
    let onFoot = 0;
    let onShuttle = 0;
    for (const agent of agents) {
      if (minute < agent.startMin || minute > agent.startMin + agent.travelMin) continue;
      if (agent.usedTransit) onShuttle += scaleFactor;
      else onFoot += scaleFactor;
    }
    const departed = agents
      .filter((a) => a.startMin + a.travelMin <= minute)
      .length * scaleFactor;
    const inside = Math.max(0, world.params.spectators - departed - onFoot - onShuttle);
    timeline.push({ minute, inside, onFoot, onShuttle, inCar: 0 });
  }

  return timeline;
}

// ---------- scorePlan ----------

/** Linear normalisation to 0–100, clamped. Works for both "higher is better"
 *  (at100 > at0) and "lower is better" (at100 < at0) metrics — see docs/00-PRD.md. */
function normalize(value: number, at100: number, at0: number): number {
  if (at100 === at0) return 100;
  const t = (value - at0) / (at100 - at0);
  return clamp(t * 100, 0, 100);
}

export function scorePlan(m: Metrics, weights: Weights): Score {
  const egressP90 = normalize(m.egressP90Min, 30, 120);
  const transitModeShare = normalize(m.transitModeSharePct, 70, 10);
  const residentDelay = normalize(m.residentDelayMin, 0, 45);
  const residentsBlocked = normalize(m.residentsBlockedPct, 0, 25);
  const localCapture = normalize(m.localCapturePct, 100, 0);
  const crowdPeak = normalize(m.crowdPeakPerM2, 1.0, 4.0);
  const businessesNetPositivePct = m.businessesNetPositivePct ?? clamp(m.businessesNetPositive, 0, 100);
  const businessesNetPositiveNorm = normalize(businessesNetPositivePct, 100, 0);

  const games = mean([egressP90, transitModeShare, crowdPeak]);
  const livability = mean([residentDelay, residentsBlocked, crowdPeak]);
  const economy = mean([localCapture, businessesNetPositiveNorm]);

  const weightSum = weights.games + weights.livability + weights.economy;
  const total =
    weightSum === 0
      ? 0
      : (weights.games * games + weights.livability * livability + weights.economy * economy) / weightSum;

  return { total, games, livability, economy };
}
