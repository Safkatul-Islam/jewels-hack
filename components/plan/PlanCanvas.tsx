'use client';

// components/plan/PlanCanvas.tsx — P1
//
// The SVG host. Owns the viewport measurement and the one Transform that every
// layer under it uses. Nothing below this component touches pixels except
// through lib/transform.ts.
//
// Placement has two paths on purpose, because a demo should not hinge on one
// gesture working on an unfamiliar trackpad:
//   1. HTML5 drag from the palette and drop on the canvas.
//   2. Click a palette kind to arm it, then click the canvas to place.

import { useCallback, useEffect, useRef, useState } from 'react';
import { GridBackdrop } from '@/components/plan/GridBackdrop';
import { PieceLayer } from '@/components/plan/PieceLayer';
import { RoadLayer } from '@/components/plan/RoadLayer';
import { WorldLayer } from '@/components/plan/WorldLayer';
import { PALETTE_DATA_KEY } from '@/components/plan/PiecePalette';
import { usePlanStore } from '@/lib/store';
import type { PieceKind } from '@/lib/sim/types';
import { clampToBBox, fitTransform, screenToWorld, snapToGrid } from '@/lib/transform';

interface Props {
  /** Fires when the plan changed in a way that should re-simulate. */
  onCommit?: () => void;
}

export function PlanCanvas({ onCommit }: Props) {
  const world = usePlanStore((s) => s.world);
  const network = usePlanStore((s) => s.network);
  const addPiece = usePlanStore((s) => s.addPiece);
  const removePiece = usePlanStore((s) => s.removePiece);
  const rotatePiece = usePlanStore((s) => s.rotatePiece);
  const selectPiece = usePlanStore((s) => s.selectPiece);
  const selectedPieceId = usePlanStore((s) => s.selectedPieceId);
  const armedKind = usePlanStore((s) => s.armedKind);
  const armKind = usePlanStore((s) => s.armKind);
  const snapM = usePlanStore((s) => s.snapM);

  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  const commit = useCallback(() => onCommit?.(), [onCommit]);

  // Keyboard: Delete removes the selection, [ and ] rotate it. Both re-simulate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedPieceId) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removePiece(selectedPieceId);
        commit();
      } else if (e.key === '[' || e.key === ']') {
        const piece = world?.pieces.find((p) => p.id === selectedPieceId);
        if (!piece) return;
        const step = (Math.PI / 12) * (e.key === ']' ? 1 : -1);
        rotatePiece(selectedPieceId, piece.rotation + step);
        commit();
      } else if (e.key === 'Escape') {
        selectPiece(null);
        armKind(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPieceId, world, removePiece, rotatePiece, selectPiece, armKind, commit]);

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
  const t = fitTransform(bbox, size.width, size.height);

  function place(kind: PieceKind, clientX: number, clientY: number) {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const worldPos = clampToBBox(
      snapToGrid(screenToWorld(t, { x: clientX - rect.left, y: clientY - rect.top }, bbox), snapM),
      bbox,
    );
    addPiece(kind, worldPos);
    armKind(null);
    commit();
  }

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden rounded-xl border bg-[var(--canvas-bg)]"
      style={{ cursor: armedKind ? 'copy' : 'default' }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(PALETTE_DATA_KEY)) e.preventDefault();
      }}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData(PALETTE_DATA_KEY) as PieceKind;
        if (!kind) return;
        e.preventDefault();
        place(kind, e.clientX, e.clientY);
      }}
    >
      {size.width > 0 && (
        <svg
          data-slot="plan-canvas"
          width={size.width}
          height={size.height}
          className="block touch-none select-none"
          onPointerDown={(e) => {
            // A click on empty canvas either places the armed piece, or clears
            // the selection. It never does both.
            if (armedKind) place(armedKind, e.clientX, e.clientY);
            else selectPiece(null);
          }}
        >
          <GridBackdrop bbox={bbox} basemap={world.basemap} t={t} />
          <RoadLayer network={network} roads={world.baseRoads} bbox={bbox} t={t} />
          <WorldLayer world={world} t={t} onCommit={commit} />
          <PieceLayer pieces={world.pieces} bbox={bbox} t={t} onCommit={commit} />
        </svg>
      )}

      {/* scale bar — the corridor length is the whole premise, so make it readable */}
      <ScaleBar scale={t.scale} />

      {armedKind && (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background">
          Click the map to place · Esc to cancel
        </div>
      )}
    </div>
  );
}

function ScaleBar({ scale }: { scale: number }) {
  if (!scale || !Number.isFinite(scale)) return null;
  // Pick a round number of metres that lands near 90 px.
  const candidates = [50, 100, 200, 250, 500, 1000, 2000];
  const metres = candidates.find((m) => m * scale > 70) ?? candidates[candidates.length - 1];
  const px = metres * scale;
  return (
    <div className="absolute bottom-3 left-3 flex items-end gap-2 text-[10px] text-muted-foreground">
      <div className="flex flex-col items-center">
        <div className="h-2 w-px bg-current" />
        <div style={{ width: px }} className="h-px bg-current" />
      </div>
      <span className="tabular-nums">{metres >= 1000 ? `${metres / 1000} km` : `${metres} m`}</span>
    </div>
  );
}
