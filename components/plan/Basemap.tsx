'use client';

// components/plan/Basemap.tsx — P1
//
// What the plan sits on: the ground, and nothing else.
//
// This used to generate a city — building parcels along every street frontage,
// so a district read as a place. The subject changed: /plan is now the venue's
// forecourt, one street with the event kit on it, and a city drawn around it
// was answering a question nobody asked. The background is blank on purpose.
// Everything on screen is either the plan or something the plan acts on.
//
// Residential blocks are not drawn here either. They are still in the data —
// the engine samples resident trips from them and livability is scored off
// them — but ResidentLayer shows them only once a plan has cost them
// something. Blank until it hurts somebody.

import { memo } from 'react';
import type { BBox, Basemap as BasemapSpec } from '@/lib/sim/types';
import { type Transform, worldToScreen } from '@/lib/transform';

interface Props {
  bbox: BBox;
  basemap: BasemapSpec;
  t: Transform;
}

function BasemapImpl({ bbox, basemap, t }: Props) {
  const topLeft = worldToScreen(t, { x: bbox.minX, y: bbox.maxY }, bbox);
  const bottomRight = worldToScreen(t, { x: bbox.maxX, y: bbox.minY }, bbox);
  const w = bottomRight.x - topLeft.x;
  const h = bottomRight.y - topLeft.y;

  if (basemap.kind === 'image') {
    return (
      <g data-slot="backdrop">
        <image
          href={basemap.src}
          x={topLeft.x}
          y={topLeft.y}
          width={w}
          height={h}
          preserveAspectRatio="none"
          opacity={0.9}
        />
      </g>
    );
  }

  return (
    <g data-slot="backdrop">
      {/* the paper. Warm, not blue-grey: this is a drafting surface. */}
      <rect x={topLeft.x} y={topLeft.y} width={w} height={h} fill="var(--paper)" />

      {/* A hairline at the edge of the world, so the canvas has a defined extent
          and the plan does not appear to float on an infinite surface. */}
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={w}
        height={h}
        fill="none"
        stroke="var(--paper-edge)"
        strokeWidth={1}
      />
    </g>
  );
}

export const Basemap = memo(BasemapImpl);
