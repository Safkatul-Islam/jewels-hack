// lib/store.ts — P1
//
// The one store. Both input surfaces write here: mouse drags from the plan
// canvas, and ArUco markers from the table mode (P4 calls setWorld / setPieces).
// Nothing else is shared state.
//
// The store deliberately does NOT import lib/sim. Running the simulation is the
// page's job, not the store's, so that the store stays usable from the table
// route, from tests, and before the engine exists.

import { create } from 'zustand';
import { PIECE_META } from '@/lib/pieces';
import { DEFAULT_SCENARIO_ID, loadScenario } from '@/lib/scenarios';
import type {
  Piece,
  PieceKind,
  SimResult,
  Vec2,
  Weights,
  WorldState,
} from '@/lib/sim/types';

export type HeatmapLayer = 'none' | 'pedestrian' | 'congestion';

/** Deterministic ids — no randomness, so two laptops produce the same plan file. */
let pieceSeq = 0;
function nextPieceId(kind: PieceKind): string {
  pieceSeq += 1;
  return `${kind}-${pieceSeq}`;
}

export interface PlanStore {
  // ---- world ----
  world: WorldState | null;
  scenarioId: string;
  loading: boolean;
  error: string | null;

  // ---- interaction ----
  selectedPieceId: string | null;
  draggingPieceId: string | null;
  snapM: number;
  /** palette selection: click a kind, then click the canvas to place it */
  armedKind: PieceKind | null;

  // ---- results ----
  weights: Weights;
  result: SimResult | null;
  baseline: SimResult | null;
  compare: boolean;
  heatmap: HeatmapLayer;

  // ---- scenario ----
  loadScenarioById: (id: string) => Promise<void>;
  /** P4: markersToWorld() lands here. Also used by preset plans. */
  setWorld: (w: WorldState) => void;

  // ---- pieces: the only thing the user changes ----
  addPiece: (kind: PieceKind, pos: Vec2) => string;
  movePiece: (id: string, pos: Vec2) => void;
  rotatePiece: (id: string, rotation: number) => void;
  setPieceCapacity: (id: string, capacity: number) => void;
  removePiece: (id: string) => void;
  /** Wholesale replacement — ArUco frames, presets, undo of a whole plan. */
  setPieces: (pieces: Piece[]) => void;
  clearPieces: () => void;

  // ---- ui ----
  selectPiece: (id: string | null) => void;
  setDragging: (id: string | null) => void;
  armKind: (kind: PieceKind | null) => void;
  setSnapM: (m: number) => void;
  setWeights: (w: Partial<Weights>) => void;
  setResult: (r: SimResult | null) => void;
  setBaseline: (r: SimResult | null) => void;
  setCompare: (on: boolean) => void;
  setHeatmap: (layer: HeatmapLayer) => void;
}

export const usePlanStore = create<PlanStore>((set) => ({
  world: null,
  scenarioId: DEFAULT_SCENARIO_ID,
  loading: false,
  error: null,

  selectedPieceId: null,
  draggingPieceId: null,
  snapM: 25,
  armedKind: null,

  weights: { games: 1, livability: 1, economy: 1 },
  result: null,
  baseline: null,
  compare: false,
  heatmap: 'none',

  loadScenarioById: async (id) => {
    set({ loading: true, error: null });
    try {
      const world = await loadScenario(id);
      // A scenario switch resets everything downstream of it: a result from the
      // previous world would be silently wrong, which is worse than empty.
      set({
        world,
        scenarioId: id,
        loading: false,
        error: null,
        result: null,
        baseline: null,
        compare: false,
        selectedPieceId: null,
        draggingPieceId: null,
        armedKind: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setWorld: (world) => set({ world }),

  addPiece: (kind, pos) => {
    const id = nextPieceId(kind);
    const piece: Piece = {
      id,
      kind,
      pos,
      rotation: 0,
      capacity: PIECE_META[kind].defaultCapacity,
    };
    set((s) =>
      s.world ? { world: { ...s.world, pieces: [...s.world.pieces, piece] }, selectedPieceId: id } : s,
    );
    return id;
  },

  movePiece: (id, pos) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              pieces: s.world.pieces.map((p) => (p.id === id ? { ...p, pos } : p)),
            },
          }
        : s,
    ),

  rotatePiece: (id, rotation) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              pieces: s.world.pieces.map((p) => (p.id === id ? { ...p, rotation } : p)),
            },
          }
        : s,
    ),

  setPieceCapacity: (id, capacity) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              pieces: s.world.pieces.map((p) => (p.id === id ? { ...p, capacity } : p)),
            },
          }
        : s,
    ),

  removePiece: (id) =>
    set((s) =>
      s.world
        ? {
            world: { ...s.world, pieces: s.world.pieces.filter((p) => p.id !== id) },
            selectedPieceId: s.selectedPieceId === id ? null : s.selectedPieceId,
          }
        : s,
    ),

  setPieces: (pieces) => set((s) => (s.world ? { world: { ...s.world, pieces } } : s)),

  clearPieces: () =>
    set((s) => (s.world ? { world: { ...s.world, pieces: [] }, selectedPieceId: null } : s)),

  selectPiece: (id) => set({ selectedPieceId: id }),
  armKind: (armedKind) => set({ armedKind }),
  setDragging: (id) => set({ draggingPieceId: id }),
  setSnapM: (m) => set({ snapM: m }),

  setWeights: (w) => set((s) => ({ weights: { ...s.weights, ...w } })),

  setResult: (result) => set({ result }),
  setBaseline: (baseline) => set({ baseline }),
  setCompare: (compare) => set({ compare }),
  setHeatmap: (heatmap) => set({ heatmap }),
}));

// ---- selectors: import these rather than reaching into the store shape ----

export const selectPieces = (s: PlanStore) => s.world?.pieces ?? [];
export const selectBBox = (s: PlanStore) => s.world?.bbox ?? null;
export const selectSelectedPiece = (s: PlanStore) =>
  s.world?.pieces.find((p) => p.id === s.selectedPieceId) ?? null;

/** Has a plan been placed at all? Drives the empty state on the dashboard. */
export const selectHasPieces = (s: PlanStore) => (s.world?.pieces.length ?? 0) > 0;

/** `get()` escape hatch for non-React callers — P4's vision loop, mainly. */
export const planStore = usePlanStore;
