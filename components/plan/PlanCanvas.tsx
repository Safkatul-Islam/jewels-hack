'use client';

// components/plan/PlanCanvas.tsx — P1
//
// The SVG host. Owns the viewport measurement, the user's zoom/pan, and the one
// Transform that every layer under it uses. Nothing below this component
// touches pixels except through lib/transform.ts.
//
// Placement has two paths on purpose, because a demo should not hinge on one
// gesture working on an unfamiliar trackpad:
//   1. HTML5 drag from the palette and drop on the canvas.
//   2. Click a palette kind to arm it, then click the canvas to place.
//
// Zoom exists for a specific reason, not for completeness. A 3.9 km scenario
// fitted to a 900 px column puts about a quarter of a pixel on a metre, so a
// 2.6 m parking stall and a 3.5 m bus bay are invisible — and the facilities
// ARE the drawing (facilityGeometry.ts). Without zoom the canvas can only ever
// be a diagram of a plan. With it, you can get down to where the plan is.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Basemap } from '@/components/plan/Basemap';
import { FlowLayer } from '@/components/plan/FlowLayer';
import { HeatLayer } from '@/components/plan/HeatLayer';
import { ResidentLayer } from '@/components/plan/ResidentLayer';
import { PieceLayer } from '@/components/plan/PieceLayer';
import { RoadLayer } from '@/components/plan/RoadLayer';
import { WorldLayer } from '@/components/plan/WorldLayer';
import { PALETTE_DATA_KEY } from '@/components/plan/PiecePalette';
import { CameraPanel } from '@/components/gesture/CameraPanel';
import { GesturePalette } from '@/components/gesture/GesturePalette';
import { HandCursors } from '@/components/gesture/HandCursors';
import { HoverHighlight } from '@/components/gesture/HoverHighlight';
import { useGestureControl } from '@/components/gesture/useGestureControl';
import { usePlanStore } from '@/lib/store';
import type { PieceKind } from '@/lib/sim/types';
import {
  IDENTITY_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  type ViewState,
  clampToBBox,
  clampView,
  composeView,
  fitTransform,
  frameOn,
  screenToWorld,
  snapToGrid,
  zoomAt,
} from '@/lib/transform';

interface Props {
  /** Fires when the plan changed in a way that should re-simulate. */
  onCommit?: () => void;
}

/** Stand-in so the transform can be computed before the no-scenario return. */
const EMPTY_BBOX = { minX: 0, maxX: 1, minY: 0, maxY: 1 };

/** Pointer travel, in px, below which a press on empty canvas is a click. */
const CLICK_SLOP = 4;

/** Metres across on opening: the venue, its apron and the first ring road,
 *  which is where a plan actually gets made.
 *
 *  Tuned against the two things that fight each other here. The stadium bowl
 *  is 250 m across, so anything under ~700 m is just the venue filling the
 *  frame with nowhere to put anything. Meanwhile a 2.6 m parking stall needs
 *  roughly 2 px to read at all. 1,100 m lands at 0.82 px/m: the bowl takes a
 *  quarter of the frame, the first ring and the spokes off it are visible, a
 *  shuttle hub is 74 px with its bays drawn, and a park-and-ride is 225 px. */
const FORECOURT_M = 1100;

export function PlanCanvas({ onCommit }: Props) {
  const world = usePlanStore((s) => s.world);
  const network = usePlanStore((s) => s.network);
  const result = usePlanStore((s) => s.result);
  const playMinute = usePlanStore((s) => s.playMinute);
  const playing = usePlanStore((s) => s.playing);
  const heatmap = usePlanStore((s) => s.heatmap);
  const blockDelay = usePlanStore((s) => s.blockDelay);
  const addPiece = usePlanStore((s) => s.addPiece);
  const removePiece = usePlanStore((s) => s.removePiece);
  const rotatePiece = usePlanStore((s) => s.rotatePiece);
  const selectPiece = usePlanStore((s) => s.selectPiece);
  const selectedPieceId = usePlanStore((s) => s.selectedPieceId);
  const armedKind = usePlanStore((s) => s.armedKind);
  const armKind = usePlanStore((s) => s.armKind);
  const snapM = usePlanStore((s) => s.snapM);
  const scenarioId = usePlanStore((s) => s.scenarioId);

  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>(IDENTITY_VIEW);
  const pan = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(
    null,
  );

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

  // /plan opens on the venue forecourt, not on the whole district, and
  // re-frames there on a scenario switch. See frameOn() for why: at district
  // scale a parking stall is half a pixel, so the facilities can only be
  // glyphs. FIT is one click away for the overview.
  //
  // Keyed on the viewport too, because the first render measures 0 x 0 and the
  // frame cannot be computed until ResizeObserver has reported.
  const framedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!world || size.width === 0 || size.height === 0) return;
    const key = `${scenarioId}:${Math.round(size.width)}x${Math.round(size.height)}`;
    if (framedFor.current === key) return;
    framedFor.current = key;
    // A scenario that is already forecourt-sized just fits — framing 1,100 m
    // on the venue would centre on the bowl and push the street it leads to
    // off the bottom of the canvas. Only a district needs cropping.
    const span = Math.max(world.bbox.maxX - world.bbox.minX, world.bbox.maxY - world.bbox.minY);
    const fit = fitTransform(world.bbox, size.width, size.height);
    setView(
      span <= FORECOURT_M * 1.5
        ? IDENTITY_VIEW
        : frameOn(fit, world.bbox, world.venue.pos, FORECOURT_M),
    );
  }, [scenarioId, world, size.width, size.height]);

  const commit = useCallback(() => onCommit?.(), [onCommit]);

  // Wheel has to be a native non-passive listener: React's synthetic onWheel is
  // registered passively, so preventDefault there is ignored and the page
  // scrolls behind the canvas instead of zooming it.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const focus = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0022);
        return clampView(zoomAt(v, v.k * factor, focus), rect.width, rect.height);
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard: Delete removes the selection, [ and ] rotate it. Both re-simulate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === '0') {
        setView(IDENTITY_VIEW);
        return;
      }
      if (!selectedPieceId) return;

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

  // Computed before the no-scenario return because useGestureControl is a hook
  // and cannot sit behind one. `t` is only meaningful once a world and a
  // measured viewport exist; until then the scene below is null and the frame
  // loop ignores its frames.
  const fit = fitTransform(world?.bbox ?? EMPTY_BBOX, size.width, size.height);
  const t = composeView(fit, view);

  /**
   * Two-hand control of this canvas. It drives the same store actions the
   * mouse does and commits on release, so the simulation still runs once per
   * edit (AGENTS.md §2.7) whichever way the piece was moved.
   */
  const gesture = useGestureControl({
    scene:
      world && size.width > 0
        ? { t, bbox: world.bbox, pieces: world.pieces, width: size.width, height: size.height, snapM }
        : null,
    view,
    setView,
    onCommit: commit,
  });

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

  function zoomBy(factor: number) {
    setView((v) =>
      clampView(
        zoomAt(v, v.k * factor, { x: size.width / 2, y: size.height / 2 }),
        size.width,
        size.height,
      ),
    );
  }

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden rounded-xl border bg-[var(--paper)]"
      style={{ cursor: armedKind ? 'copy' : pan.current?.moved ? 'grabbing' : 'default' }}
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
            // A press on empty canvas is ambiguous until it ends: it is a pan if
            // the pointer travels, and a click — place, or deselect — if it does
            // not. Deciding on pointerup is what lets one gesture do both.
            e.currentTarget.setPointerCapture(e.pointerId);
            pan.current = {
              x: e.clientX,
              y: e.clientY,
              panX: view.panX,
              panY: view.panY,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const p = pan.current;
            if (!p) return;
            const dx = e.clientX - p.x;
            const dy = e.clientY - p.y;
            if (!p.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
            p.moved = true;
            setView((v) =>
              clampView({ ...v, panX: p.panX + dx, panY: p.panY + dy }, size.width, size.height),
            );
          }}
          onPointerUp={(e) => {
            const p = pan.current;
            pan.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (p?.moved) return;
            if (armedKind) place(armedKind, e.clientX, e.clientY);
            else selectPiece(null);
          }}
          onPointerCancel={() => {
            pan.current = null;
          }}
        >
          <Basemap bbox={bbox} basemap={world.basemap} t={t} />
          {/* Homes, over the general fabric and under the streets, so a hurt
              block reads as part of the city rather than as an overlay on it. */}
          <ResidentLayer
            blocks={world.blocks}
            delayByBlock={blockDelay}
            bbox={bbox}
            t={t}
          />
          <RoadLayer network={network} roads={world.baseRoads} bbox={bbox} t={t} />
          {/* The crowd field, over the streets it forms on and under everything
              you can grab. This is the layer that changes when a piece moves
              but no route does. */}
          <HeatLayer
            heatmap={
              heatmap === 'none' || !result
                ? null
                : heatmap === 'congestion'
                  ? result.heatmaps.congestion
                  : result.heatmaps.pedestrian
            }
            bbox={bbox}
            t={t}
          />
          <WorldLayer world={world} t={t} onCommit={commit} />
          {/* flows sit above the blocks so a corridor is not tinted by the
              district it runs through, and below the pieces so a facility is
              never hidden under the demand it serves */}
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
          {/* Gesture feedback, above the pieces so a ring is never buried under
              a facility, and pointer-events-none so the mouse still reaches
              them. Both render nothing until a hand is actually tracked. */}
          <HoverHighlight
            pieces={world.pieces}
            bbox={bbox}
            t={t}
            hovered={gesture.hovered}
            grabbed={gesture.held}
          />
          {/* The hand-reachable palette. Only while tracking: with a mouse the
              real one in the left rail is better in every way. */}
          {gesture.live && (
            <GesturePalette height={size.height} hoveredKind={gesture.hoveredKind} />
          )}
          <HandCursors ref={gesture.cursorsRef} />
        </svg>
      )}

      {/* Only once someone has asked for hands. On a page where most people
          will use the mouse, a permanent black camera box in the corner is a
          feature advertising itself at the plan's expense. */}
      {gesture.status !== 'idle' && (
        <CameraPanel ref={gesture.panelRef} videoRef={gesture.videoRef} live={gesture.live} />
      )}

      {/* scale bar — the corridor length is the whole premise, so make it readable */}
      <ScaleBar scale={t.scale} />

      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-sm backdrop-blur">
        <ZoomButton label="Zoom in" onClick={() => zoomBy(1.6)} disabled={view.k >= MAX_ZOOM}>
          +
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / 1.6)} disabled={view.k <= MIN_ZOOM}>
          −
        </ZoomButton>
        <ZoomButton
          label="Fit the scenario"
          onClick={() => setView(IDENTITY_VIEW)}
          disabled={view.k <= MIN_ZOOM}
        >
          <span className="text-[9px] tracking-tight">FIT</span>
        </ZoomButton>
        <ZoomButton
          label={gesture.live ? 'Stop hand control' : 'Control the plan with your hands'}
          onClick={gesture.live ? gesture.stop : () => void gesture.start()}
        >
          <HandIcon active={gesture.live} />
        </ZoomButton>
      </div>

      {gesture.status === 'starting' && (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background">
          Starting the camera…
        </div>
      )}

      {gesture.error && (
        // inset-x-14, not inset-x-3: the zoom stack lives at top-3 right-3 and a
        // full-width banner lands on top of it.
        <div className="absolute inset-x-14 top-3 mx-auto w-fit max-w-sm rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {gesture.error}
        </div>
      )}

      {gesture.justRecentred && (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background">
          Recentred on your hands
        </div>
      )}

      {/* The gestures, written down. Not optional: the dot at your hand says
          where you are and nothing else, so there is no way to discover that a
          pinch is the clutch or that a fist recentres. Shown only while
          tracking, because it is onboarding, not chrome. */}
      {gesture.live && (
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1 rounded-md border bg-background/90 px-2.5 py-2 text-[10px] leading-snug backdrop-blur">
          <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            Hands · {gesture.fps} fps
          </span>
          <span>
            <b>Pinch a swatch</b> on the left to add one
          </span>
          <span>
            <b>Pinch</b> to pick up · release to drop
          </span>
          <span>
            <b>Other hand</b> turns what you hold
          </span>
          <span>
            <b>Pinch empty space</b> to pan · both to zoom
          </span>
          <span>
            <b>Hold a fist</b> to recentre
          </span>
        </div>
      )}

      {view.k > 1.02 && (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums backdrop-blur">
          {view.k.toFixed(1)}×
        </div>
      )}

      {armedKind && (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-foreground/90 px-3 py-1 text-xs font-medium text-background">
          Click the map to place · Esc to cancel
        </div>
      )}
    </div>
  );
}

/** A hand, filled while tracking so the button reads as a state, not an action. */
function HandIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0 0V4.5a1.5 1.5 0 0 1 3 0V11m0 0V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L5 14.2a1.5 1.5 0 0 1 2.6-1.5L9 15V11Z"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.18 : 0}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
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

function ScaleBar({ scale }: { scale: number }) {
  if (!scale || !Number.isFinite(scale)) return null;
  // Pick a round number of metres that lands near 90 px.
  const candidates = [25, 50, 100, 200, 250, 500, 1000, 2000];
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
