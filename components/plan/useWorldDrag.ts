'use client';

// components/plan/useWorldDrag.ts — P1
//
// The drag gesture for scenario furniture (businesses, residential blocks),
// factored out so businesses and blocks behave identically and neither
// re-implements pointer capture. PieceLayer keeps its own copy: it is working,
// it carries extra concerns (selection, rotation, the armed-kind palette), and
// rewriting it would be a refactor nobody asked for.
//
// Same rules as the piece drag, for the same reasons:
//   - setPointerCapture, so a fast drag that leaves the element still tracks.
//   - Snapped to the store's grid and clamped to the scenario bbox.
//   - onCommit fires once on drop and only if the thing actually moved, so a
//     click never costs a simulation run and the drag itself stays at 60 fps.

import { useRef, useState } from 'react';
import type { BBox, Vec2 } from '@/lib/sim/types';
import { type Transform, clampToBBox, screenToWorld, snapToGrid } from '@/lib/transform';

interface Options {
  t: Transform;
  bbox: BBox;
  snapM: number;
  /** Called on every pointer move that changes the position. */
  onMove: (id: string, pos: Vec2) => void;
  /** Called once on drop, only when the thing moved. */
  onCommit: () => void;
}

export function useWorldDrag({ t, bbox, snapM, onMove, onCommit }: Options) {
  const grab = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const moved = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function svgPoint(e: React.PointerEvent<SVGGElement>): Vec2 | null {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Spread onto the draggable <g>. `pos` is where the thing is right now. */
  function dragHandlers(id: string, pos: Vec2) {
    return {
      onPointerDown: (e: React.PointerEvent<SVGGElement>) => {
        e.stopPropagation();
        const p = svgPoint(e);
        if (!p) return;
        const w = screenToWorld(t, p, bbox);
        grab.current = { id, dx: pos.x - w.x, dy: pos.y - w.y };
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraggingId(id);
      },
      onPointerMove: (e: React.PointerEvent<SVGGElement>) => {
        if (grab.current?.id !== id) return;
        const p = svgPoint(e);
        if (!p) return;
        const w = screenToWorld(t, p, bbox);
        const next = clampToBBox(
          snapToGrid({ x: w.x + grab.current.dx, y: w.y + grab.current.dy }, snapM),
          bbox,
        );
        if (next.x !== pos.x || next.y !== pos.y) {
          moved.current = true;
          onMove(id, next);
        }
      },
      onPointerUp: (e: React.PointerEvent<SVGGElement>) => {
        if (grab.current?.id !== id) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        grab.current = null;
        setDraggingId(null);
        if (moved.current) onCommit();
      },
      onPointerCancel: () => {
        grab.current = null;
        setDraggingId(null);
      },
      style: { cursor: draggingId === id ? 'grabbing' : 'grab' } as const,
    };
  }

  return { draggingId, dragHandlers };
}
