'use client';

// components/plan/Basemap.tsx — P1
//
// What the plan sits on. Replaces the graph-paper grid, and the reason is not
// taste: a uniform field of grid lines makes everything drawn on top read as a
// sketch. A plan has to sit on a PLACE, and a place is figure and ground —
// pale building fabric and white streets underneath, the plan's own objects
// dark and saturated on top.
//
// The fabric is generated from the scenario (see basemapGeometry.ts), so a new
// scenario JSON gets a city without anyone drawing one, and nothing here knows
// the name of anywhere.
//
// The whole backdrop is four DOM nodes regardless of scenario size, because the
// masses are emitted as two long paths rather than a thousand rects. It is also
// completely static between scenario switches — React.memo at the bottom is
// what keeps a 60 fps drag from re-walking a 1,000-subpath string.

import { memo } from 'react';
import type { BBox, Basemap as BasemapSpec, WorldState } from '@/lib/sim/types';
import { basemapFor } from '@/components/plan/basemapGeometry';
import { type Transform, worldToScreen } from '@/lib/transform';

interface Props {
  world: WorldState;
  bbox: BBox;
  basemap: BasemapSpec;
  t: Transform;
}

/**
 * World metres → screen pixels as a single SVG transform, so geometry can be
 * emitted in world coordinates and handed to the browser untouched.
 *
 * worldToScreen is  x' = (x - minX)·s + tx,  y' = (maxY - y)·s + ty
 * which is exactly   translate(tx - s·minX, ty + s·maxY) · scale(s, -s).
 *
 * The negative y scale is what flips world-north to screen-up. It also flips
 * strokes, so anything stroked inside this group needs vector-effect
 * non-scaling-stroke — otherwise the hairlines scale with the zoom.
 */
function worldTransform(t: Transform, bbox: BBox): string {
  return `translate(${t.tx - t.scale * bbox.minX} ${t.ty + t.scale * bbox.maxY}) scale(${t.scale} ${-t.scale})`;
}

function BasemapImpl({ world, bbox, basemap, t }: Props) {
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

  const fabric = basemapFor(world);

  return (
    <g data-slot="backdrop">
      {/* the paper. Warm, not blue-grey: this is a drafting surface. */}
      <rect x={topLeft.x} y={topLeft.y} width={w} height={h} fill="var(--paper)" />

      <g transform={worldTransform(t, bbox)}>
        <path
          d={fabric.massLight}
          fill="var(--fabric)"
          stroke="var(--fabric-edge)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={fabric.massDark}
          fill="var(--fabric-dark)"
          stroke="var(--fabric-edge)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </g>

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
