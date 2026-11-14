// lib/pieces.ts — P1
//
// Presentation metadata for the seven piece kinds: label, the unit its capacity
// is measured in, a default capacity for a freshly dropped piece, and the design
// token it draws with. The ENGINE never imports this file — capacity semantics
// live in docs/02-CONTRACTS.md and the numbers come off the Piece itself.

import type { PieceKind } from '@/lib/sim/types';

export interface PieceMeta {
  kind: PieceKind;
  label: string;
  /** what `Piece.capacity` counts for this kind */
  unit: string;
  defaultCapacity: number;
  /** drag step in world metres, and the footprint drawn on the canvas */
  footprintM: number;
  /** CSS colour, from the tokens in globals.css */
  color: string;
  /** one line in the palette tooltip */
  hint: string;
}

export const PIECE_META: Record<PieceKind, PieceMeta> = {
  shuttle_hub: {
    kind: 'shuttle_hub',
    label: 'Shuttle hub',
    unit: 'boardings/hr',
    defaultCapacity: 6000,
    footprintM: 90,
    color: 'var(--piece-shuttle)',
    hint: 'Adds a shuttle line between here and the venue.',
  },
  park_and_ride: {
    kind: 'park_and_ride',
    label: 'Park & ride',
    unit: 'spaces',
    defaultCapacity: 2500,
    footprintM: 140,
    color: 'var(--piece-parking)',
    hint: 'Pulls cars off the corridor, but feeds a shuttle.',
  },
  vendor_village: {
    kind: 'vendor_village',
    label: 'Vendor village',
    unit: 'stalls',
    defaultCapacity: 40,
    footprintM: 70,
    color: 'var(--piece-vendor)',
    hint: 'Captures spend — and cannibalises nearby businesses.',
  },
  ped_corridor: {
    kind: 'ped_corridor',
    label: 'Pedestrian corridor',
    unit: 'persons/min',
    defaultCapacity: 1800,
    footprintM: 60,
    color: 'var(--piece-ped)',
    hint: 'High-capacity walking route. Closes the street to cars.',
  },
  bike_valet: {
    kind: 'bike_valet',
    label: 'Bike valet',
    unit: 'bike spaces',
    defaultCapacity: 800,
    footprintM: 50,
    color: 'var(--piece-bike)',
    hint: 'Cheap mode share, small footprint.',
  },
  road_closure: {
    kind: 'road_closure',
    label: 'Road closure',
    unit: '—',
    defaultCapacity: 0,
    footprintM: 45,
    color: 'var(--piece-closure)',
    hint: 'Cuts every edge it touches. Residents feel this one.',
  },
  security_gate: {
    kind: 'security_gate',
    label: 'Security gate',
    unit: 'screenings/hr',
    defaultCapacity: 9000,
    footprintM: 55,
    color: 'var(--piece-gate)',
    hint: 'A throughput bottleneck you place deliberately.',
  },
};

/** Palette order — most load-bearing first, so the demo reaches for the right one. */
export const PALETTE_ORDER: PieceKind[] = [
  'shuttle_hub',
  'park_and_ride',
  'vendor_village',
  'ped_corridor',
  'bike_valet',
  'security_gate',
  'road_closure',
];

export function pieceMeta(kind: PieceKind): PieceMeta {
  return PIECE_META[kind];
}
