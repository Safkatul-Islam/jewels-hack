'use client';

// components/gesture/GestureCanvas.tsx — P4
//
// The plan canvas, driven by two hands in the air. It renders the same layers
// as components/plan/PlanCanvas.tsx and adds the gesture driver on top.
//
// WHY THIS IS A SEPARATE COMPONENT AND NOT A PROP ON PlanCanvas:
// PlanCanvas is P1's file and is being edited right now. Threading a gesture
// mode through it would put a merge conflict in the middle of the one component
// the whole product rests on, to save about eighty lines (AGENTS.md §0.3, §3).
// The duplication is the cheaper mistake, and the repo already makes it
// deliberately once — see the note at the top of useWorldDrag.ts.
//
// THE INTERACTION, AND WHY IT IS SHAPED THIS WAY:
//
//   Hover    an open hand moves an INVISIBLE pointer; the piece under it
//            highlights. Nothing is drawn at the hand itself.
//   Grab     pinch (thumb to index) on a highlighted piece picks it up; the
//            highlight switches to a held state. Release drops it, and that is
//            the one moment the simulation runs (AGENTS.md §2.7).
//   Rotate   with one hand holding a piece, pinch with the other and turn: the
//            angle between your hands is the piece's bearing.
//   Pan/zoom pinch empty space to pan; pinch with both hands and pull apart to
//            zoom.
//   Reset    hold a fist for ~350 ms to make wherever your hands are now the
//            centre of the canvas.
//
// Pinch is load-bearing: it is the only thing separating "my hand is moving" from
// "I am editing the plan". Without a clutch the cursor is permanently down.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Basemap } from '@/components/plan/Basemap';
import { FlowLayer } from '@/components/plan/FlowLayer';
import { PieceLayer } from '@/components/plan/PieceLayer';
import { RoadLayer } from '@/components/plan/RoadLayer';
import { WorldLayer } from '@/components/plan/WorldLayer';
import { footprintFor } from '@/components/plan/facilityGeometry';
import { CameraPanel, type CameraPanelHandle } from '@/components/gesture/CameraPanel';
import { HoverHighlight } from '@/components/gesture/HoverHighlight';
import {
  type GestureFrame,
  type HandSide,
  useHandTracking,
} from '@/components/gesture/useHandTracking';
import { usePlanStore } from '@/lib/store';
import type { BBox, Piece, PieceKind, Vec2 } from '@/lib/sim/types';
import { anchorToCanvas } from '@/lib/vision/cursor';
import { type PickTarget, pickNearest } from '@/lib/vision/pick';
import {
  IDENTITY_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  type Transform,
  type ViewState,
  clampToBBox,
  clampView,
  composeView,
  fitTransform,
  metresToPx,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomAt,
} from '@/lib/transform';

interface Props {
  onCommit?: () => void;
}

/**
 * Gesture rotation snaps to 15°, always — unlike the mouse handle, which lets
 * Alt disable snapping. There is no fine control to protect here: the residual
 * jitter in a two-hand angle is a couple of degrees, so free rotation would
 * mean a piece that never quite stops moving.
 */
const ROTATE_STEP = Math.PI / 12;

/** What one hand is doing with its pinch closed. */
type Role =
  | { kind: 'piece'; id: string; dx: number; dy: number; moved: boolean }
  | { kind: 'rotate'; id: string; angle0: number; rotation0: number; moved: boolean }
  | { kind: 'view' }
  | null;

const OTHER: Record<HandSide, HandSide> = { left: 'right', right: 'left' };

export function GestureCanvas({ onCommit }: Props) {
  const world = usePlanStore((s) => s.world);
  const network = usePlanStore((s) => s.network);
  const result = usePlanStore((s) => s.result);
  const playMinute = usePlanStore((s) => s.playMinute);
  const playing = usePlanStore((s) => s.playing);
  const addPiece = usePlanStore((s) => s.addPiece);
  const movePiece = usePlanStore((s) => s.movePiece);
  const rotatePiece = usePlanStore((s) => s.rotatePiece);
  const selectPiece = usePlanStore((s) => s.selectPiece);
  const setDragging = usePlanStore((s) => s.setDragging);
  const armedKind = usePlanStore((s) => s.armedKind);
  const armKind = usePlanStore((s) => s.armKind);
  const snapM = usePlanStore((s) => s.snapM);
  const scenarioId = usePlanStore((s) => s.scenarioId);

  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<CameraPanelHandle>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>(IDENTITY_VIEW);
  /** The current view, readable from the frame loop without a stale closure. */
  const viewRef = useRef<ViewState>(IDENTITY_VIEW);

  // Highlight state. These are the only per-frame React updates allowed, and
  // they are guarded on actually changing — a setState on every frame would
  // re-render the whole canvas at 60 fps and break the drag budget.
  const [hovered, setHovered] = useState<readonly string[]>([]);
  const [held, setHeld] = useState<readonly string[]>([]);
  const [recentredAt, setRecentredAt] = useState(0);

  const roles = useRef<Record<HandSide, Role>>({ left: null, right: null });
  /** Baseline for the pan/zoom gesture, re-taken whenever a hand joins or leaves it. */
  const viewGesture = useRef<{
    sides: HandSide[];
    mid0: Vec2;
    d0: number | null;
    view0: ViewState;
  } | null>(null);

  /**
   * Everything the frame loop needs from the render. Written during render
   * rather than in an effect: the loop runs between paints, and reading a
   * transform one paint stale makes a dragged piece lag the hand by a frame.
   */
  const scene = useRef<{
    t: Transform;
    bbox: BBox;
    pieces: Piece[];
    width: number;
    height: number;
    snapM: number;
  } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setView(IDENTITY_VIEW);
  }, [scenarioId]);

  const commit = useCallback(() => onCommit?.(), [onCommit]);

  /** Drop everything a hand was holding. Used on release and when tracking stops. */
  const endRole = useCallback(
    (side: HandSide) => {
      const role = roles.current[side];
      roles.current[side] = null;
      if (!role) return;

      // A view hand letting go is deliberately NOT handled here. Shrinking
      // the baseline's side list in place would leave mid0/d0 describing two
      // hands while only one is left, and the pan/zoom block would then read
      // that as a sudden movement. It compares the live hands against the
      // baseline every frame and re-takes it when they disagree, so the right
      // thing to do here is nothing.
      if (role.kind === 'view') return;

      if (role.kind === 'piece') {
        setDragging(null);
        // A hand that releases the piece also ends any rotation keyed to it:
        // rotating something nobody is holding reads as the canvas spinning.
        const other = roles.current[OTHER[side]];
        if (other?.kind === 'rotate' && other.id === role.id) {
          roles.current[OTHER[side]] = null;
          if (other.moved) commit();
        }
      }

      if (role.moved) commit();
    },
    [commit, setDragging],
  );

  const stopAllRoles = useCallback(() => {
    endRole('left');
    endRole('right');
    viewGesture.current = null;
    setHovered([]);
    setHeld([]);
  }, [endRole]);

  /**
   * Re-take the pan/zoom baseline. Called when the set of hands doing the
   * gesture changes, so a second hand joining mid-pan does not snap the map.
   *
   * Reads the view from a ref rather than the `view` binding: setView runs on
   * every frame of a zoom, so the rendered `view` is up to a frame stale, and
   * baselining against a stale view is exactly the jump this function exists
   * to prevent.
   */
  const rebaseViewGesture = useCallback((pts: Map<HandSide, { p: Vec2 }>) => {
    const sides = (['left', 'right'] as const).filter(
      (side) => roles.current[side]?.kind === 'view' && pts.has(side),
    );
    if (sides.length === 0) {
      viewGesture.current = null;
      return;
    }
    const points = sides.map((side) => pts.get(side)!.p);
    viewGesture.current = {
      sides: [...sides],
      mid0: midpoint(points),
      d0: points.length === 2 ? spread(points[0], points[1]) : null,
      view0: viewRef.current,
    };
  }, []);

  const handleFrame = useCallback(
    (frame: GestureFrame) => {
      panelRef.current?.draw(frame.hands, frame.origin);
      if (frame.recentred) setRecentredAt(performance.now());

      const s = scene.current;
      if (!s || s.width === 0) return;

      // Hands in canvas pixels. This is the invisible pointer; the only thing
      // the user ever sees of it is what lights up underneath.
      const pts = new Map<HandSide, { p: Vec2; phase: string; visible: boolean }>();
      for (const hand of frame.hands) {
        pts.set(hand.side, {
          p: anchorToCanvas(hand.anchor, frame.origin, s.width, s.height),
          phase: hand.pinch.phase,
          visible: hand.landmarks.length > 0,
        });
      }

      const targets: PickTarget[] = s.pieces
        .filter((piece) => !piece.locked)
        .map((piece) => ({
          id: piece.id,
          centre: worldToScreen(s.t, piece.pos, s.bbox),
          radiusPx: Math.max(metresToPx(s.t, footprintFor(piece.kind, piece.capacity)), 12) / 2,
        }));

      // ---- pinch down: decide what this hand just took hold of -------------
      for (const side of ['left', 'right'] as const) {
        const hand = pts.get(side);
        if (!hand || hand.phase !== 'down' || roles.current[side]) continue;

        const otherRole = roles.current[OTHER[side]];
        const otherPt = pts.get(OTHER[side]);

        if (otherRole?.kind === 'piece' && otherPt) {
          // The Iron Man move: one hand holds, the other turns.
          const piece = s.pieces.find((p) => p.id === otherRole.id);
          if (piece) {
            roles.current[side] = {
              kind: 'rotate',
              id: piece.id,
              angle0: bearing(otherPt.p, hand.p),
              rotation0: piece.rotation,
              moved: false,
            };
            continue;
          }
        }

        const pickedId = pickNearest(hand.p, targets);
        if (pickedId) {
          const piece = s.pieces.find((p) => p.id === pickedId);
          if (!piece) continue;
          // World-space offset from pointer to centre, so the piece does not
          // jump to the hand on grab — same trick as the mouse drag.
          const w = screenToWorld(s.t, hand.p, s.bbox);
          roles.current[side] = {
            kind: 'piece',
            id: piece.id,
            dx: piece.pos.x - w.x,
            dy: piece.pos.y - w.y,
            moved: false,
          };
          selectPiece(piece.id);
          setDragging(piece.id);
        } else {
          // Pinching nothing pans the map. The baseline is taken by the
          // pan/zoom block below, which owns it for both joining and leaving.
          roles.current[side] = { kind: 'view' };
        }
      }

      // ---- pinch up --------------------------------------------------------
      for (const side of ['left', 'right'] as const) {
        const hand = pts.get(side);
        if (hand?.phase === 'up' || (!hand && roles.current[side])) endRole(side);
      }

      // ---- held: do the work ----------------------------------------------
      for (const side of ['left', 'right'] as const) {
        const role = roles.current[side];
        const hand = pts.get(side);
        if (!role || !hand || hand.phase !== 'held') continue;

        if (role.kind === 'piece') {
          const w = screenToWorld(s.t, hand.p, s.bbox);
          const next = clampToBBox(
            snapToGrid({ x: w.x + role.dx, y: w.y + role.dy }, s.snapM),
            s.bbox,
          );
          const piece = s.pieces.find((p) => p.id === role.id);
          if (piece && (next.x !== piece.pos.x || next.y !== piece.pos.y)) {
            role.moved = true;
            movePiece(role.id, next);
          }
        }

        if (role.kind === 'rotate') {
          const holder = pts.get(OTHER[side]);
          const piece = s.pieces.find((p) => p.id === role.id);
          if (!holder || !piece) continue;
          const delta = bearing(holder.p, hand.p) - role.angle0;
          const raw = role.rotation0 + delta;
          const next = Math.round(raw / ROTATE_STEP) * ROTATE_STEP;
          if (next !== piece.rotation) {
            role.moved = true;
            rotatePiece(role.id, next);
          }
        }
      }

      // ---- pan / zoom ------------------------------------------------------
      const viewSides = (['left', 'right'] as const).filter(
        (side) => roles.current[side]?.kind === 'view' && pts.has(side),
      );
      const g = viewGesture.current;

      if (viewSides.length === 0) {
        viewGesture.current = null;
      } else if (!g || !sameIds(g.sides, viewSides)) {
        // The set of hands doing the gesture changed — a second hand joined, or
        // one let go. Re-baseline and spend this frame doing nothing, because
        // measuring one hand's movement against a baseline taken from two makes
        // the map jump by whatever the gap between the hands was.
        rebaseViewGesture(pts);
      } else {
        const live = viewSides.map((side) => pts.get(side)).filter(isPresent);
        const mid = midpoint(live.map((h) => h.p));
        const d = live.length === 2 ? spread(live[0].p, live[1].p) : null;

        // Absolute from the baseline each frame, never incremental: an
        // incremental pan accumulates the smoothing error and the map creeps
        // while your hands are still.
        let next = g.view0;
        if (g.d0 && d && g.d0 > 1) {
          next = zoomAt(g.view0, g.view0.k * (d / g.d0), g.mid0);
        }
        next = {
          ...next,
          panX: next.panX + (mid.x - g.mid0.x),
          panY: next.panY + (mid.y - g.mid0.y),
        };
        setView(clampView(next, s.width, s.height));
      }

      // ---- hover highlight -------------------------------------------------
      const nextHeld: string[] = [];
      for (const side of ['left', 'right'] as const) {
        const role = roles.current[side];
        if (role && (role.kind === 'piece' || role.kind === 'rotate')) nextHeld.push(role.id);
      }

      const nextHover: string[] = [];
      for (const side of ['left', 'right'] as const) {
        const hand = pts.get(side);
        if (!hand || !hand.visible || hand.phase !== 'none' || roles.current[side]) continue;
        const id = pickNearest(hand.p, targets);
        if (id && !nextHover.includes(id)) nextHover.push(id);
      }

      setHovered((prev) => (sameIds(prev, nextHover) ? prev : nextHover));
      setHeld((prev) => (sameIds(prev, nextHeld) ? prev : nextHeld));
    },
    [endRole, movePiece, rebaseViewGesture, rotatePiece, selectPiece, setDragging],
  );

  const { videoRef, status, error, fps, start, stop } = useHandTracking({
    onFrame: handleFrame,
    onStop: stopAllRoles,
  });

  // Wheel zoom and keyboard still work: the mouse is the fallback for every
  // gesture here, and during setup you want both.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const focus = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setView((v) =>
        clampView(zoomAt(v, v.k * Math.exp(-e.deltaY * 0.0022), focus), rect.width, rect.height),
      );
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (!world) {
    return (
      <div
        ref={hostRef}
        className="grid h-full w-full place-items-center rounded-xl border border-dashed text-sm text-muted-foreground"
      >
        No scenario loaded.
      </div>
    );
  }

  const bbox = world.bbox;
  const fit = fitTransform(bbox, size.width, size.height);
  const t = composeView(fit, view);
  viewRef.current = view;
  scene.current = {
    t,
    bbox,
    pieces: world.pieces,
    width: size.width,
    height: size.height,
    snapM,
  };

  const live = status === 'running';
  const justRecentred = recentredAt > 0 && performance.now() - recentredAt < 1100;

  function place(kind: PieceKind, clientX: number, clientY: number) {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const pos = clampToBBox(
      snapToGrid(screenToWorld(t, { x: clientX - rect.left, y: clientY - rect.top }, bbox), snapM),
      bbox,
    );
    addPiece(kind, pos);
    armKind(null);
    commit();
  }

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden rounded-xl border bg-[var(--paper)]"
      style={{ cursor: armedKind ? 'copy' : 'default' }}
    >
      {size.width > 0 && (
        <svg
          data-slot="gesture-canvas"
          width={size.width}
          height={size.height}
          className="block touch-none select-none"
          onPointerUp={(e) => {
            if (armedKind) place(armedKind, e.clientX, e.clientY);
            else selectPiece(null);
          }}
        >
          <Basemap world={world} bbox={bbox} basemap={world.basemap} t={t} />
          <RoadLayer network={network} roads={world.baseRoads} bbox={bbox} t={t} />
          <WorldLayer world={world} t={t} onCommit={commit} />
          <FlowLayer
            world={world}
            network={network}
            result={result}
            bbox={bbox}
            t={t}
            playMinute={playMinute}
            playing={playing}
          />
          <PieceLayer pieces={world.pieces} bbox={bbox} t={t} onCommit={commit} />
          {/* Above the pieces, so the ring is never buried under a facility,
              and pointer-events-none so the mouse still reaches them. */}
          <HoverHighlight pieces={world.pieces} bbox={bbox} t={t} hovered={hovered} grabbed={held} />
        </svg>
      )}

      <CameraPanel ref={panelRef} videoRef={videoRef} live={live} />

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <button
          type="button"
          onClick={live ? stop : () => void start()}
          className="rounded-md border bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-accent"
        >
          {status === 'starting' ? 'Starting…' : live ? 'Stop hands' : 'Start hands'}
        </button>
        {live && (
          <span className="rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums backdrop-blur">
            {fps} fps
          </span>
        )}
      </div>

      {error && (
        <div className="absolute inset-x-3 top-12 mx-auto w-fit max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {justRecentred && (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background">
          Recentred on your hands
        </div>
      )}

      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-sm backdrop-blur">
        <ZoomButton
          label="Zoom in"
          onClick={() => setView((v) => clampView(zoomAt(v, v.k * 1.6, centreOf(size)), size.width, size.height))}
          disabled={view.k >= MAX_ZOOM}
        >
          +
        </ZoomButton>
        <ZoomButton
          label="Zoom out"
          onClick={() => setView((v) => clampView(zoomAt(v, v.k / 1.6, centreOf(size)), size.width, size.height))}
          disabled={view.k <= MIN_ZOOM}
        >
          −
        </ZoomButton>
        <ZoomButton label="Fit the scenario" onClick={() => setView(IDENTITY_VIEW)} disabled={view.k <= MIN_ZOOM}>
          <span className="text-[9px] tracking-tight">FIT</span>
        </ZoomButton>
      </div>

      {view.k > 1.02 && (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums backdrop-blur">
          {view.k.toFixed(1)}×
        </div>
      )}
    </div>
  );
}

/** 0 = north, positive clockwise — the convention Piece.rotation uses. */
function bearing(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y));
}

function midpoint(points: Vec2[]): Vec2 {
  const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function spread(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centreOf(size: { width: number; height: number }): Vec2 {
  return { x: size.width / 2, y: size.height / 2 };
}

function isPresent<T>(v: T | undefined): v is T {
  return v !== undefined;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function ZoomButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center text-sm leading-none text-foreground transition-colors not-last:border-b hover:bg-accent disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
