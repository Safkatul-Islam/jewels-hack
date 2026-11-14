// ============================================================
// lib/sim/business.ts   (P3)
// ============================================================
//
// Local business & vendor-village revenue, per docs/00-PRD.md "Metric definitions":
//
//   localRevenueUsd   = sum over existing businesses of
//                       baseline + passersby × conversionRate × avgTicket
//   vendorRevenueUsd  = same formula over vendor-village stalls
//   localCapturePct   = localRevenue / (localRevenue + vendorRevenue)
//
//   Exclusivity rule: an existing business within exclusionRadiusM of a
//   vendor_village has its conversionRate halved.
//
// No place names or distances are hard-coded here — catchment, exclusion radius,
// conversion rate and ticket sizes all come from the loaded WorldState.

import type { Business, Heatmap, Piece, Vec2, WorldState } from './types';
import { distance } from './geometry';

/** Vendor-village stalls have no `category`, so pick one ticket size to model them with.
 *  Tunable assumption, not measured — stalls at a venue skew food/concessions. */
const VENDOR_AVG_TICKET_CATEGORY: keyof WorldState['params']['avgTicket'] = 'food';

/** Vendor-village `Piece`s carry no `catchmentM`; reuse the same PRD default as businesses. */
const DEFAULT_VENDOR_CATCHMENT_M = 80;

export interface BusinessRevenueResult {
  localRevenueUsd: number;
  vendorRevenueUsd: number;
  localCapturePct: number;
  businessesNetPositive: number;
  perBusiness: { id: string; revenueUsd: number; deltaPct: number }[];
}

/**
 * Integral of a pedestrian-density heatmap over a disc of radius `radiusM` around
 * `center`, in person-equivalents ("passersby"). Cells are included by their centre
 * falling within the radius — fine-grained enough at `heatmap.cellM` ≈ catchment/3.
 */
export function integrateHeatmap(heatmap: Heatmap, center: Vec2, radiusM: number): number {
  const cellArea = heatmap.cellM * heatmap.cellM;
  let total = 0;
  for (let row = 0; row < heatmap.rows; row++) {
    for (let col = 0; col < heatmap.cols; col++) {
      const cellCenter: Vec2 = {
        x: heatmap.origin.x + (col + 0.5) * heatmap.cellM,
        y: heatmap.origin.y + (row + 0.5) * heatmap.cellM,
      };
      if (distance(cellCenter, center) <= radiusM) {
        total += heatmap.values[row * heatmap.cols + col]! * cellArea;
      }
    }
  }
  return total;
}

function revenueForBusiness(
  business: Business,
  pedestrianHeatmap: Heatmap,
  vendorVillages: Piece[],
  params: WorldState['params'],
): { id: string; revenueUsd: number; deltaPct: number } {
  const passersby = integrateHeatmap(pedestrianHeatmap, business.pos, business.catchmentM);

  const underExclusivity = vendorVillages.some(
    (village) => distance(village.pos, business.pos) <= params.exclusionRadiusM,
  );
  const conversionRate = underExclusivity ? params.conversionRate / 2 : params.conversionRate;
  const avgTicket = params.avgTicket[business.category];

  const revenueUsd = business.baselineDailyRevenue + passersby * conversionRate * avgTicket;
  const deltaPct =
    business.baselineDailyRevenue === 0
      ? 0
      : ((revenueUsd - business.baselineDailyRevenue) / business.baselineDailyRevenue) * 100;

  return { id: business.id, revenueUsd, deltaPct };
}

function revenueForVendorVillage(
  village: Piece,
  pedestrianHeatmap: Heatmap,
  params: WorldState['params'],
): number {
  const passersby = integrateHeatmap(pedestrianHeatmap, village.pos, DEFAULT_VENDOR_CATCHMENT_M);
  const avgTicket = params.avgTicket[VENDOR_AVG_TICKET_CATEGORY];
  return passersby * params.conversionRate * avgTicket;
}

/**
 * Pure function: existing-business and vendor revenue, plus the local-capture metric,
 * given a world and the pedestrian-flow heatmap the rest of `simulate()` produces.
 */
export function computeBusinessRevenue(
  world: WorldState,
  pedestrianHeatmap: Heatmap,
): BusinessRevenueResult {
  const vendorVillages = world.pieces.filter((p) => p.kind === 'vendor_village');

  const perBusiness = world.businesses.map((business) =>
    revenueForBusiness(business, pedestrianHeatmap, vendorVillages, world.params),
  );

  const localRevenueUsd = perBusiness.reduce((sum, b) => sum + b.revenueUsd, 0);

  const vendorRevenueUsd = vendorVillages.reduce(
    (sum, village) => sum + revenueForVendorVillage(village, pedestrianHeatmap, world.params),
    0,
  );

  const denom = localRevenueUsd + vendorRevenueUsd;
  const localCapturePct = denom === 0 ? 100 : (localRevenueUsd / denom) * 100;

  const businessesNetPositive = perBusiness.filter((b, i) => {
    const baseline = world.businesses[i]!.baselineDailyRevenue;
    return b.revenueUsd > baseline;
  }).length;

  return { localRevenueUsd, vendorRevenueUsd, localCapturePct, businessesNetPositive, perBusiness };
}
