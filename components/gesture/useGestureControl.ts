'use client';

// components/gesture/useGestureControl.ts — P4
//
// Two-hand control of the plan canvas, as a hook the canvas mounts.
//
// This used to be a whole second canvas (components/gesture/GestureCanvas.tsx,
// and a /gesture route). That was the right call while P1 was rewriting
// PlanCanvas underneath us — a gesture mode threaded through the one component
// the product rests on would have been a merge conflict in the worst possible
// place. It stopped being the right call the moment the copy fell behind: the
// canvas gained a heat layer, a resident layer and the console styling, and the
// copy had none of it. One canvas, one driver.
//
// THE INTERACTION:
//
//   Hover    an open hand moves a pointer drawn as a faint dot; the piece
//            under it highlights. The highlight is the signal.
//   Grab     pinch (thumb to index) on a highlighted piece picks it up.
//            Release drops it, and that is the one moment the simulation runs
//            (AGENTS.md §2.7) — exactly like the mouse drag.
//   Rotate   with one hand holding a piece, pinch with the other and turn.
//   Pan/zoom pinch empty space to pan; both hands to zoom.
//   Reset    hold a fist to make wherever your hands are the canvas centre.
//
// Pinch is load-bearing: it is the only thing separating "my hand is moving"
// from "I am editing the plan". Without a clutch the pointer is always down.
//
// NO REACT STATE PER FRAME, with two deliberate exceptions: the hovered/held
// id lists, which are guarded on actually changing, and the view during a
// pan/zoom, which is no worse than what a mouse pan already does. Everything
// else is written straight to the DOM.

import { useCallback, useRef, useState } from 'react';
import { footprintFor } from '@/components/plan/facilityGeometry';
import type { CameraPanelHandle } from '@/components/gesture/CameraPanel';
import type { HandCursorsHandle } from '@/components/gesture/HandCursors';
import {
  type GestureFrame,
  type HandSide,
  useHandTracking,
} from '@/components/gesture/useHandTracking';
import { gesturePaletteSlots, pickPaletteSlot } from '@/components/gesture/palette';
import { usePlanStore } from '@/lib/store';
import type { BBox, Piece, PieceKind, Vec2 } from '@/lib/sim/types';
import { anchorToCanvas } from '@/lib/vision/cursor';
import { type PickTarget, pickNearest } from '@/lib/vision/pick';
import {
  type Transform,
  type ViewState,
  clampToBBox,
  clampView,
  metresToPx,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomAt,
} from '@/lib/transform';

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

/** What the frame loop needs from the canvas, as of this render. */
export interface GestureScene {
  t: Transform;
  bbox: BBox;
  pieces: Piece[];
  width: number;
  height: number;
  snapM: number;
}

interface Options {
  /** Null until the canvas has measured itself. */
  scene: GestureScene | null;
  /** The canvas's current view, so a pan/zoom baselines against the live one. */
  view: ViewState;
  setView: (next: ViewState) => void;
  /** Fires once per committed edit, on release — never during. */
  onCommit: () => void;
}

export function useGestureControl({ scene, view, setView, onCommit }: Options) {
  const addPiece = usePlanStore((s) => s.addPiece);
  const movePiece = usePlanStore((s) => s.movePiece);
  const rotatePiece = usePlanStore((s) => s.rotatePiece);
  const selectPiece = usePlanStore((s) => s.selectPiece);
  const setDragging = usePlanStore((s) => s.setDragging);

  const panelRef = useRef<CameraPanelHandle>(null);
  const cursorsRef = useRef<HandCursorsHandle>(null);

  // Highlight state. The only per-frame setState allowed, and guarded on
  // actually changing — a setState every frame re-renders the whole canvas.
  const [hovered, setHovered] = useState<readonly string[]>([]);
  const [held, setHeld] = useState<readonly string[]>([]);
  const [hoveredKind, setHoveredKind] = useState<PieceKind | null>(null);
  const [recentredAt, setRecentredAt] = useState(0);

  const roles = useRef<Record<HandSide, Role>>({ left: null, right: null });
  const viewGesture = useRef<{
    sides: HandSide[];
    mid0: Vec2;
    d0: number | null;
    view0: ViewState;
  } | null>(null);

  /**
   * Written during render, not in an effect: the loop runs between paints, and
   * reading a transform one paint stale makes a dragged piece lag the hand by
   * a frame.
   */
  const sceneRef = useRef<GestureScene | null>(scene);
  sceneRef.current = scene;
  const viewRef = useRef<ViewState>(view);
  viewRef.current = view;

  const commit = useCallback(() => onCommit(), [onCommit]);

  /** Drop everything a hand was holding. Used on release and when tracking stops. */
  const endRole = useCallback(
    (side: HandSide) => {
      const role = roles.current[side];
      roles.current[side] = null;
      if (!role) return;

      // A view hand letting go is deliberately NOT handled here. Shrinking the
      // baseline's side list in place would leave mid0/d0 describing two hands
      // while only one is left, and the pan/zoom block would read that as a
      // sudden movement. It compares the live hands against the baseline every
      // frame and re-takes it when they disagree, so the right thing here is
      // nothing.
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
    setHoveredKind(null);
    // No frames are coming, so nothing else will hide the dots.
    cursorsRef.current?.update(new Map());
  }, [endRole]);

  /**
   * Re-take the pan/zoom baseline when the set of hands doing it changes.
   *
   * Reads the view from a ref rather than the prop: setView runs on every frame
   * of a zoom, so the rendered view is up to a frame stale, and baselining
   * against a stale view is exactly the jump this exists to prevent.
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

      const s = sceneRef.current;
      if (!s || s.width === 0) return;

      // Hands in canvas pixels. Drawn only as a faint dot (HandCursors) — what
      // the user actually reads is the piece lighting up underneath.
      const pts = new Map<HandSide, { p: Vec2; phase: string; visible: boolean }>();
      for (const hand of frame.hands) {
        pts.set(hand.side, {
          p: anchorToCanvas(hand.anchor, frame.origin, s.width, s.height),
          phase: hand.pinch.phase,
          visible: hand.landmarks.length > 0,
        });
      }
      cursorsRef.current?.update(pts);

      const targets: PickTarget[] = s.pieces
        .filter((piece) => !piece.locked)
        .map((piece) => ({
          id: piece.id,
          centre: worldToScreen(s.t, piece.pos, s.bbox),
          radiusPx: Math.max(metresToPx(s.t, footprintFor(piece.kind, piece.capacity)), 12) / 2,
        }));

      const paletteSlots = gesturePaletteSlots(s.height);

      // ---- pinch down: decide what this hand just took hold of -------------
      for (const side of ['left', 'right'] as const) {
        const hand = pts.get(side);
        if (!hand || hand.phase !== 'down' || roles.current[side]) continue;

        // The palette is checked before anything else. It sits over the canvas,
        // so a pinch on a swatch would otherwise read as a pinch on empty
        // ground and pan the map out from under the thing you were reaching for.
        const newKind = pickPaletteSlot(hand.p, paletteSlots);
        if (newKind) {
          const w = screenToWorld(s.t, hand.p, s.bbox);
          const pos = clampToBBox(snapToGrid(w, s.snapM), s.bbox);
          const id = addPiece(newKind, pos);
          // Born under the hand and already held, so the same pinch that took
          // it from the palette carries it to where it belongs. `moved` starts
          // true because the piece is new: the plan changed on this pinch
          // whether or not the hand travels afterwards, so release must
          // re-simulate even if you drop it exactly where you picked it up.
          roles.current[side] = { kind: 'piece', id, dx: 0, dy: 0, moved: true };
          selectPiece(id);
          setDragging(id);
          continue;
        }

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
          // pan/zoom block below, which owns it for joining and leaving alike.
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
        // The set of hands changed — one joined, or one let go. Re-baseline and
        // spend this frame doing nothing, because measuring one hand against a
        // baseline taken from two jumps the map by the gap between the hands.
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
      let nextKind: PieceKind | null = null;
      for (const side of ['left', 'right'] as const) {
        const hand = pts.get(side);
        if (!hand || !hand.visible || hand.phase !== 'none' || roles.current[side]) continue;
        // A hand over the palette is reaching for a new piece, not hovering the
        // map underneath it — so it highlights the swatch and nothing else.
        const kind = pickPaletteSlot(hand.p, paletteSlots);
        if (kind) {
          nextKind ??= kind;
          continue;
        }
        const id = pickNearest(hand.p, targets);
        if (id && !nextHover.includes(id)) nextHover.push(id);
      }

      setHovered((prev) => (sameIds(prev, nextHover) ? prev : nextHover));
      setHeld((prev) => (sameIds(prev, nextHeld) ? prev : nextHeld));
      setHoveredKind((prev) => (prev === nextKind ? prev : nextKind));
    },
    [addPiece, endRole, movePiece, rebaseViewGesture, rotatePiece, selectPiece, setDragging, setView],
  );

  const { videoRef, status, error, fps, start, stop } = useHandTracking({
    onFrame: handleFrame,
    onStop: stopAllRoles,
  });

  return {
    /** Spread onto <CameraPanel>. */
    panelRef,
    videoRef,
    /** Spread onto <HandCursors>. */
    cursorsRef,
    /** Piece ids to pass to <HoverHighlight>. */
    hovered,
    held,
    /** The palette swatch a hand is over, for <GesturePalette>. */
    hoveredKind,
    live: status === 'running',
    status,
    error,
    fps,
    start,
    stop,
    /** True for about a second after a fist-hold moved the active region. */
    justRecentred: recentredAt > 0 && performance.now() - recentredAt < 1100,
  };
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

function isPresent<T>(v: T | undefined): v is T {
  return v !== undefined;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
