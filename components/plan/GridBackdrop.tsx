'use client';

// components/plan/GridBackdrop.tsx — P1
//
// The basemap. A scenario either carries a backdrop image with a declared bbox,
// or asks for a generated grid. Both must look deliberate — the grid is not a
// fallback, it is a design choice for scenarios that have no imagery.

import type { BBox, Basemap } from '@/lib/sim/types';
import { type Transform, worldToScreen } from '@/lib/transform';

interface Props {
  bbox: BBox;
  basemap: Basemap;
  t: Transform;
}

export function GridBackdrop({ bbox, basemap, t }: Props) {
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

  const spacing = Math.max(basemap.spacingM, 10);
  const lines: { key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];

  const firstX = Math.ceil(bbox.minX / spacing) * spacing;
  for (let x = firstX, i = 0; x <= bbox.maxX; x += spacing, i++) {
    const a = worldToScreen(t, { x, y: bbox.maxY }, bbox);
    const b = worldToScreen(t, { x, y: bbox.minY }, bbox);
    lines.push({ key: `v${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, major: Math.abs(x) < 1e-6 });
  }
  const firstY = Math.ceil(bbox.minY / spacing) * spacing;
  for (let y = firstY, i = 0; y <= bbox.maxY; y += spacing, i++) {
    const a = worldToScreen(t, { x: bbox.minX, y }, bbox);
    const b = worldToScreen(t, { x: bbox.maxX, y }, bbox);
    lines.push({ key: `h${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, major: Math.abs(y) < 1e-6 });
  }

  return (
    <g data-slot="backdrop">
      <rect x={topLeft.x} y={topLeft.y} width={w} height={h} fill="var(--canvas-bg)" />
      {lines.map((l) => (
        <line
          key={l.key}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={l.major ? 'var(--canvas-grid-major)' : 'var(--canvas-grid)'}
          strokeWidth={l.major ? 1.25 : 0.75}
        />
      ))}
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={w}
        height={h}
        fill="none"
        stroke="var(--canvas-grid-major)"
        strokeWidth={1}
      />
    </g>
  );
}
