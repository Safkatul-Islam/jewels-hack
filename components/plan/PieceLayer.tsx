'use client';

// components/plan/PieceLayer.tsx — P1
//
// The pieces, and the drag that moves them. This is the interaction the whole
// product rests on: drag a piece → the network regenerates → the numbers change.
//
// Drag rules, deliberately:
//   - Pointer events with setPointerCapture, so a fast drag that leaves the
//     element still tracks. Mouse, trackpad and touch all take the same path.
//   - The sim does NOT run during the drag. `onCommit` fires once, on drop.
//     That is what keeps the drag at 60 fps (AGENTS.md §2.7).
//   - Positions snap to the store's grid and clamp to the scenario bbox, so a
//     piece can never be dropped off-world where the engine cannot route to it.

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { PIECE_META } from '@/lib/pieces';
import { usePlanStore } from '@/lib/store';
import type { BBox, Piece } from '@/lib/sim/types';
import {
  type Transform,
  clampToBBox,
  metresToPx,
  rotationToDeg,
  screenToWorld,
  snapToGrid,
} from '@/lib/transform';

interface Props {
  pieces: Piece[];
  bbox: BBox;
  t: Transform;
  /** Called once when a drag ends — the page re-simulates here, not during. */
  onCommit: () => void;
}

export function PieceLayer({ pieces, bbox, t, onCommit }: Props) {
  const movePiece = usePlanStore((s) => s.movePiece);
  const selectPiece = usePlanStore((s) => s.selectPiece);
  const setDragging = usePlanStore((s) => s.setDragging);
  const selectedId = usePlanStore((s) => s.selectedPieceId);
  const draggingId = usePlanStore((s) => s.draggingPieceId);
  const snapM = usePlanStore((s) => s.snapM);

  /** world-space offset from the pointer to the piece centre, so it doesn't jump */
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const moved = useRef(false);

  function svgPoint(e: React.PointerEvent<SVGGElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  return (
    <g data-slot="pieces">
      {pieces.map((piece) => {
        const meta = PIECE_META[piece.kind];
        const centre = {
          x: (piece.pos.x - bbox.minX) * t.scale + t.tx,
          y: (bbox.maxY - piece.pos.y) * t.scale + t.ty,
        };
        const size = Math.max(metresToPx(t, meta.footprintM), 16);
        const half = size / 2;
        const isSelected = selectedId === piece.id;
        const isDragging = draggingId === piece.id;
        const fromMarker = piece.fromMarker !== undefined;

        return (
          // Two nested <g>s on purpose. Framer Motion writes an inline
          // `style="transform: …"`, and a CSS transform BEATS the SVG transform
          // attribute — so a motion element that also carries transform="translate(…)"
          // renders at the canvas origin. Position lives on a plain <g>; the
          // animation lives on the motion <g> inside it.
          <g
            key={piece.id}
            style={{ cursor: piece.locked ? 'default' : isDragging ? 'grabbing' : 'grab' }}
            transform={`translate(${centre.x} ${centre.y}) rotate(${rotationToDeg(piece.rotation)})`}
            onPointerDown={(e) => {
              if (piece.locked) return;
              e.stopPropagation();
              const p = svgPoint(e);
              if (!p) return;
              const world = screenToWorld(t, p, bbox);
              grab.current = { dx: piece.pos.x - world.x, dy: piece.pos.y - world.y };
              moved.current = false;
              e.currentTarget.setPointerCapture(e.pointerId);
              selectPiece(piece.id);
              setDragging(piece.id);
            }}
            onPointerMove={(e) => {
              if (!grab.current || draggingId !== piece.id) return;
              const p = svgPoint(e);
              if (!p) return;
              const world = screenToWorld(t, p, bbox);
              const next = clampToBBox(
                snapToGrid({ x: world.x + grab.current.dx, y: world.y + grab.current.dy }, snapM),
                bbox,
              );
              if (next.x !== piece.pos.x || next.y !== piece.pos.y) {
                moved.current = true;
                movePiece(piece.id, next);
              }
            }}
            onPointerUp={(e) => {
              if (draggingId !== piece.id) return;
              e.currentTarget.releasePointerCapture(e.pointerId);
              grab.current = null;
              setDragging(null);
              // Only re-simulate if the piece actually went somewhere. A click
              // that selects a piece must not cost a sim run.
              if (moved.current) onCommit();
            }}
            onPointerCancel={() => {
              grab.current = null;
              setDragging(null);
            }}
          >
            <motion.g
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            >
              <rect
                x={-half}
                y={-half}
                width={size}
                height={size}
                rx={Math.min(6, size / 4)}
                fill={meta.color}
                fillOpacity={isDragging ? 0.95 : 0.8}
                stroke={isSelected ? 'var(--foreground)' : 'var(--canvas-bg)'}
                strokeWidth={isSelected ? 2 : 1.25}
                strokeDasharray={fromMarker ? '4 2' : undefined}
              />
              {/* capacity is the thing you tune after placing, so it is always legible */}
              {size >= 30 && (
                <text
                  y={3.5}
                  textAnchor="middle"
                  className="pointer-events-none fill-white text-[9px] font-semibold tabular-nums"
                >
                  {piece.capacity > 0 ? compact(piece.capacity) : '×'}
                </text>
              )}
              {isSelected && (
                <text
                  y={-half - 6}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground text-[10px] font-medium"
                >
                  {meta.label}
                </text>
              )}
            </motion.g>
          </g>
        );
      })}
    </g>
  );
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
