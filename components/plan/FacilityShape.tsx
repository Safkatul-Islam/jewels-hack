'use client';

// components/plan/FacilityShape.tsx — P1
//
// Renders one facility's geometry. Geometry comes from facilityGeometry.ts in
// metres; this component is only responsible for turning metres into pixels and
// choosing how much of the drawing is worth showing at the current zoom.
//
// Level of detail matters more than it looks. At the fitted view a 3.9 km
// scenario puts ~0.23 px on a metre, so a 2.6 m stall is sub-pixel and four
// hundred of them are a grey smudge that costs frames. Below the thresholds
// here the facility collapses to a glyph; above them it opens into the real
// drawing. Zooming in is what reveals the plan.

import { memo } from 'react';
import type { PieceKind } from '@/lib/sim/types';
import { facilityFor } from '@/components/plan/facilityGeometry';
import type { Blocker } from '@/components/plan/packing';

interface Props {
  kind: PieceKind;
  /** the REQUESTED capacity — this sizes the footprint and seeds the packing */
  capacity: number;
  /** identifies the obstructions, so a stale layout is never served */
  maskKey?: string;
  blocked?: Blocker;
  /** screen pixels per world metre */
  scale: number;
  color: string;
  dragging: boolean;
}

/** Below this many pixels across, the detail is noise — draw a glyph instead. */
const GLYPH_BELOW_PX = 30;
/** Below this, draw the massing and the accent but skip the repeated units.
 *  46, not 58: at the forecourt view a 70 m vendor village is 57 px and was
 *  falling a pixel short of ever drawing the stalls that are its whole point. */
const TICKS_ABOVE_PX = 46;

function FacilityShapeImpl({ kind, capacity, maskKey, blocked, scale, color, dragging }: Props) {
  const f = facilityFor(kind, capacity, maskKey, blocked);
  const px = f.sizeM * scale;

  if (px < GLYPH_BELOW_PX) {
    // The glyph keeps the piece findable and grabbable when the whole scenario
    // is in frame. It is a marker, and it does not pretend to be a drawing.
    const r = Math.max(px / 2, 5);
    return (
      <g>
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={1.5}
          fill={color}
          fillOpacity={dragging ? 0.95 : 0.85}
          stroke="var(--paper)"
          strokeWidth={1.25}
        />
      </g>
    );
  }

  const showTicks = px >= TICKS_ABOVE_PX;

  return (
    // One scale, applied once. Every path below is in metres; non-scaling-stroke
    // keeps the hairlines at a constant pixel width through the zoom range.
    <g transform={`scale(${scale})`} style={{ pointerEvents: 'none' }}>
      {f.surface && (
        <path d={f.surface} fill="var(--facility-surface)" fillOpacity={0.96} stroke="none" />
      )}

      {showTicks && f.ticks && (
        <path
          d={f.ticks}
          fill="none"
          stroke="var(--facility-tick)"
          strokeWidth={1}
          strokeOpacity={0.9}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {showTicks && f.hatch && (
        <path
          d={f.hatch}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.55}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {f.ink && (
        <path
          d={f.ink}
          fill="none"
          stroke="var(--plan-ink)"
          strokeWidth={1.25}
          strokeOpacity={0.75}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {f.accent && <path d={f.accent} fill={color} />}

      {showTicks &&
        f.trees.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="var(--block)" fillOpacity={0.9} />
        ))}
    </g>
  );
}

export const FacilityShape = memo(FacilityShapeImpl);
