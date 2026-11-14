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
//
// A selected piece gets the vocabulary a planning tool is supposed to have:
// corner handles, a rotation handle, and its live dimensions in metres. The
// dimensions are not decoration — the footprint is derived from the capacity
// (facilityGeometry.ts), so they are the land this plan is actually taking.

import { useRef } from 'react';
import { motion } from 'framer-motion';
import { PIECE_META } from '@/lib/pieces';
import { usePlanStore } from '@/lib/store';
import type { BBox, Piece } from '@/lib/sim/types';
import { FacilityShape } from '@/components/plan/FacilityShape';
import { footprintFor } from '@/components/plan/facilityGeometry';
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

/** Rotation snaps to 15° while dragging the handle, unless Alt is held. */
const ROTATE_STEP = Math.PI / 12;

export function PieceLayer({ pieces, bbox, t, onCommit }: Props) {
  const movePiece = usePlanStore((s) => s.movePiece);
  const rotatePiece = usePlanStore((s) => s.rotatePiece);
  const selectPiece = usePlanStore((s) => s.selectPiece);
  const setDragging = usePlanStore((s) => s.setDragging);
  const selectedId = usePlanStore((s) => s.selectedPieceId);
  const draggingId = usePlanStore((s) => s.draggingPieceId);
  const snapM = usePlanStore((s) => s.snapM);

  /** world-space offset from the pointer to the piece centre, so it doesn't jump */
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const moved = useRef(false);
  /** set while the rotation handle has the pointer, so the body drag stays out of it */
  const rotating = useRef<string | null>(null);

  function svgPoint(e: React.PointerEvent<SVGElement>) {
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
        const sizeM = footprintFor(piece.kind, piece.capacity);
        const sizePx = Math.max(metresToPx(t, sizeM), 12);
        const half = sizePx / 2;
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
              if (piece.locked || rotating.current) return;
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
              {/* A transparent pad keeps a small facility grabbable, and keeps
                  the grab target the same size as the thing you can see. */}
              <rect x={-half} y={-half} width={sizePx} height={sizePx} fill="transparent" />

              <FacilityShape
                kind={piece.kind}
                capacity={piece.capacity}
                scale={t.scale}
                color={meta.color}
                dragging={isDragging}
              />

              {fromMarker && (
                <rect
                  x={-half}
                  y={-half}
                  width={sizePx}
                  height={sizePx}
                  fill="none"
                  stroke={meta.color}
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
              )}

              {isSelected && (
                <SelectionFrame
                  half={half}
                  label={meta.label}
                  sizeM={sizeM}
                  capacity={piece.capacity}
                  unit={meta.unit}
                  onRotateStart={(e) => {
                    e.stopPropagation();
                    rotating.current = piece.id;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onRotateMove={(e) => {
                    if (rotating.current !== piece.id) return;
                    const p = svgPoint(e);
                    if (!p) return;
                    // 0 = north, positive clockwise — the same convention the
                    // contract uses for Piece.rotation.
                    const raw = Math.atan2(p.x - centre.x, -(p.y - centre.y));
                    const next = e.altKey ? raw : Math.round(raw / ROTATE_STEP) * ROTATE_STEP;
                    if (next !== piece.rotation) {
                      moved.current = true;
                      rotatePiece(piece.id, next);
                    }
                  }}
                  onRotateEnd={(e) => {
                    if (rotating.current !== piece.id) return;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    rotating.current = null;
                    if (moved.current) onCommit();
                    moved.current = false;
                  }}
                />
              )}
            </motion.g>
          </g>
        );
      })}
    </g>
  );
}

/**
 * The CAD furniture: corner handles, a rotation handle, a dimension line and
 * the live readout. All of it in screen pixels — handles that scale with the
 * zoom stop being handles.
 */
function SelectionFrame({
  half,
  label,
  sizeM,
  capacity,
  unit,
  onRotateStart,
  onRotateMove,
  onRotateEnd,
}: {
  half: number;
  label: string;
  sizeM: number;
  capacity: number;
  unit: string;
  onRotateStart: (e: React.PointerEvent<SVGCircleElement>) => void;
  onRotateMove: (e: React.PointerEvent<SVGCircleElement>) => void;
  onRotateEnd: (e: React.PointerEvent<SVGCircleElement>) => void;
}) {
  const h = 3.5;
  const corners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const dim = `${Math.round(sizeM)} m`;

  return (
    <g className="pointer-events-none">
      <rect
        x={-half}
        y={-half}
        width={half * 2}
        height={half * 2}
        fill="none"
        stroke="var(--plan-ink)"
        strokeWidth={1.25}
      />

      {/* dimension line along the top edge, with end ticks */}
      <g stroke="var(--plan-ink)" strokeWidth={1} strokeOpacity={0.75}>
        <line x1={-half} y1={-half - 9} x2={half} y2={-half - 9} />
        <line x1={-half} y1={-half - 13} x2={-half} y2={-half - 5} />
        <line x1={half} y1={-half - 13} x2={half} y2={-half - 5} />
      </g>
      <text
        y={-half - 13}
        textAnchor="middle"
        className="fill-foreground text-[9px] font-medium tabular-nums"
      >
        {dim}
      </text>

      {corners.map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          x={x - h}
          y={y - h}
          width={h * 2}
          height={h * 2}
          fill="var(--paper)"
          stroke="var(--plan-ink)"
          strokeWidth={1.25}
        />
      ))}

      {/* rotation handle, on a stem above the frame */}
      <line
        x1={0}
        y1={-half}
        x2={0}
        y2={-half - 24}
        stroke="var(--plan-ink)"
        strokeWidth={1}
        strokeOpacity={0.6}
      />
      <circle
        cx={0}
        cy={-half - 24}
        r={5}
        fill="var(--paper)"
        stroke="var(--plan-ink)"
        strokeWidth={1.5}
        className="pointer-events-auto"
        style={{ cursor: 'grab' }}
        onPointerDown={onRotateStart}
        onPointerMove={onRotateMove}
        onPointerUp={onRotateEnd}
        onPointerCancel={onRotateEnd}
      />

      <text
        y={half + 14}
        textAnchor="middle"
        className="fill-foreground text-[10px] font-medium"
      >
        {label}
      </text>
      {capacity > 0 && (
        <text
          y={half + 25}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px] tabular-nums"
        >
          {capacity.toLocaleString('en-US')} {unit}
        </text>
      )}
    </g>
  );
}
