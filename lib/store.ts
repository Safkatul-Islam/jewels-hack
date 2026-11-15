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
  RoadNetwork,
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
  /**
   * The regenerated road graph from the last run. The canvas draws THIS, not
   * world.baseRoads — the seeds are only what exists before buildNetwork has
   * had a say. Stored rather than recomputed per render because runPlan has to
   * build it anyway to simulate; buildNetwork is well under a millisecond, so
   * if this ever gets in the way, recomputing is also fine.
   */
  network: RoadNetwork | null;
  result: SimResult | null;
  /**
   * Minutes added to each block's drive out, versus the same world with no
   * pieces. Derived in the page rather than returned by the engine: SimResult
   * reports `residentsBlockedPct` as one number for the whole world, and the
   * canvas needs to say WHICH streets, not how many.
   */
  blockDelay: Record<string, number>;
  /**
   * What was ASKED for, per piece, before the site had its say.
   *
   * Piece.capacity now carries what actually FITS once the stalls are packed
   * around the venue, the roads and the neighbours (packing.ts), and that is
   * the number simulate() reads. The requested figure has to survive
   * separately or the inspector slider becomes a ratchet: pack it down to
   * 1,840, and 1,840 is all you could ever ask for again. It also fixes the
   * FOOTPRINT — the land you took is what you asked for, not what fitted, and
   * deriving the footprint from the fitted count instead would make the
   * packing oscillate.
   *
   * Store-only. Nothing in docs/02-CONTRACTS.md changes.
   */
  requested: Record<string, number>;
  baseline: SimResult | null;
  compare: boolean;
  heatmap: HeatmapLayer;

  // ---- playback ----
  //
  // Where on the egress timeline the canvas is showing. `null` means "the whole
  // run at once" — the aggregate view, which is what you want while editing.
  // A number scrubs SimResult.timeline, which is the only per-minute data the
  // contract returns; everything animated on the canvas is a rendering of those
  // counts, not a second simulation.
  playMinute: number | null;
  playing: boolean;

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

  // ---- scenario furniture: authoring, not planning ----
  //
  // The venue and the anchors stay locked and have no mover here on purpose.
  // They are the ArUco calibration pair (docs/02-CONTRACTS.md): marker 0 and
  // marker 1 derive scale, rotation and origin from
  // `distance(venue.pos, anchors[0].pos)`, so moving either of them in the
  // canvas silently rescales the table mode. WorldState also types
  // `venue.locked` as the literal `true`.
  //
  // Businesses and blocks are different: they carry no marker and nothing in
  // the engine routes through them, so dragging one is a scenario edit, not a
  // plan edit. It changes the economics (a shop's catchment moves relative to
  // the pedestrian heatmap), never the road graph.
  moveBusiness: (id: string, pos: Vec2) => void;
  /** `centroid` is the block's new centre; every polygon vertex shifts with it. */
  moveBlock: (id: string, centroid: Vec2) => void;

  // ---- ui ----
  selectPiece: (id: string | null) => void;
  setDragging: (id: string | null) => void;
  armKind: (kind: PieceKind | null) => void;
  setSnapM: (m: number) => void;
  setWeights: (w: Partial<Weights>) => void;
  setNetwork: (n: RoadNetwork | null) => void;
  setResult: (r: SimResult | null) => void;
  setBlockDelay: (d: Record<string, number>) => void;
  /** The packed result. Sets Piece.capacity without touching the request. */
  setFittedCapacity: (id: string, capacity: number) => void;
  setBaseline: (r: SimResult | null) => void;
  setCompare: (on: boolean) => void;
  setHeatmap: (layer: HeatmapLayer) => void;
  setPlayMinute: (m: number | null) => void;
  setPlaying: (on: boolean) => void;
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
  network: null,
  result: null,
  blockDelay: {},
  requested: {},
  baseline: null,
  compare: false,
  heatmap: 'pedestrian',
  playMinute: null,
  playing: true,

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
        network: null,
        result: null,
        blockDelay: {},
        requested: {},
        baseline: null,
        compare: false,
        playMinute: null,
        playing: true,
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
      s.world
        ? {
            world: { ...s.world, pieces: [...s.world.pieces, piece] },
            selectedPieceId: id,
            requested: { ...s.requested, [id]: piece.capacity },
          }
        : s,
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

  // The inspector's slider. It sets the REQUEST, and provisionally the
  // capacity too, so the piece resizes while you drag; runPlan then packs the
  // site and replaces the capacity with what fitted.
  setPieceCapacity: (id, capacity) =>
    set((s) =>
      s.world
        ? {
            requested: { ...s.requested, [id]: capacity },
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

  moveBusiness: (id, pos) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              businesses: s.world.businesses.map((b) => (b.id === id ? { ...b, pos } : b)),
            },
          }
        : s,
    ),

  moveBlock: (id, centroid) =>
    set((s) => {
      if (!s.world) return s;
      return {
        world: {
          ...s.world,
          blocks: s.world.blocks.map((b) => {
            if (b.id !== id || b.polygon.length === 0) return b;
            const n = b.polygon.length;
            const cx = b.polygon.reduce((sum, p) => sum + p.x, 0) / n;
            const cy = b.polygon.reduce((sum, p) => sum + p.y, 0) / n;
            const dx = centroid.x - cx;
            const dy = centroid.y - cy;
            return { ...b, polygon: b.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
          }),
        },
      };
    }),

  selectPiece: (id) => set({ selectedPieceId: id }),
  armKind: (armedKind) => set({ armedKind }),
  setDragging: (id) => set({ draggingPieceId: id }),
  setSnapM: (m) => set({ snapM: m }),

  setWeights: (w) => set((s) => ({ weights: { ...s.weights, ...w } })),

  setNetwork: (network) => set({ network }),
  // A fresh result replaces the timeline the playhead was indexing, so playback
  // rewinds rather than pointing into a run that no longer exists — but it
  // keeps running. The egress loop is the page's resting state, not something
  // the user has to start.
  setResult: (result) => set({ result, playMinute: null, playing: true }),
  setBlockDelay: (blockDelay) => set({ blockDelay }),
  setFittedCapacity: (id, capacity) =>
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
  setBaseline: (baseline) => set({ baseline }),
  setCompare: (compare) => set({ compare }),
  setHeatmap: (heatmap) => set({ heatmap }),
  setPlayMinute: (playMinute) => set({ playMinute }),
  setPlaying: (playing) => set({ playing }),
}));

// ---- selectors: import these rather than reaching into the store shape ----

export const selectPieces = (s: PlanStore) => s.world?.pieces ?? [];
export const selectBBox = (s: PlanStore) => s.world?.bbox ?? null;
export const selectSelectedPiece = (s: PlanStore) =>
  s.world?.pieces.find((p) => p.id === s.selectedPieceId) ?? null;

/** Has a plan been placed at all? Drives the empty state on the dashboard. */
export const selectHasPieces = (s: PlanStore) => (s.world?.pieces.length ?? 0) > 0;

/** What a piece was asked to be, falling back to what it is. Pieces that
 *  arrive from outside the palette — P4's ArUco markers, a preset, setPieces —
 *  have no recorded request, and their own capacity is the best answer. */
export function requestedCapacity(s: PlanStore, piece: Piece): number {
  return s.requested[piece.id] ?? piece.capacity;
}

/** `get()` escape hatch for non-React callers — P4's vision loop, mainly. */
export const planStore = usePlanStore;
