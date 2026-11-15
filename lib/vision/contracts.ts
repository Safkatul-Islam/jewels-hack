import { PIECE_META } from '../pieces';
import type { PieceKind, Vec2 } from '../sim/types';

// The frozen shared contract is the single source of truth. Only pixel-space
// detector output and vision-specific settings are defined here.
export type { Vec2, PieceKind, Piece as VisionPiece, WorldState as VisionWorld, MarkerReading } from '../sim/types';
export { MARKER_MAP } from '../sim/types';
export interface PixelMarker { id: number; corners: Vec2[]; hammingDistance?: number }
export const DICTIONARY = 'ARUCO_MIP_36h12';
export const PIECE_LABELS: Record<string, string> = {
  venue: 'Venue / calibration A', anchor: 'Arrival / calibration B', shuttle_hub: 'Shuttle hub',
  park_and_ride: 'Park & ride', vendor_village: 'Vendor village', ped_corridor: 'Pedestrian corridor',
  bike_valet: 'Bike valet', road_closure: 'Road closure', security_gate: 'Security gate',
};
export const DEFAULT_CAPACITIES: Record<PieceKind, number> = {
  shuttle_hub: PIECE_META.shuttle_hub.defaultCapacity,
  park_and_ride: PIECE_META.park_and_ride.defaultCapacity,
  vendor_village: PIECE_META.vendor_village.defaultCapacity,
  ped_corridor: PIECE_META.ped_corridor.defaultCapacity,
  bike_valet: PIECE_META.bike_valet.defaultCapacity,
  road_closure: PIECE_META.road_closure.defaultCapacity,
  security_gate: PIECE_META.security_gate.defaultCapacity,
};
