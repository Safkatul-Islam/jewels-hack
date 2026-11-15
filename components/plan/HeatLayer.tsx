'use client';

// components/plan/HeatLayer.tsx — P1
//
// The crowd, as a field. SimResult.heatmaps.pedestrian is a cols x rows grid of
// density that the engine rebuilds on every run, so this is the one layer that
// changes everywhere when you move anything — including the pieces whose
// position does not alter a single route.
//
// That matters more than it sounds. Before this layer, dragging a vendor
// village or a park-and-ride changed numbers in a panel and nothing else: the
// roads stayed put, the ribbons stayed put, and the canvas looked inert even
// though the whole simulation had re-run. The reference this page is chasing
// re-packs its entire drawing when you move one constraint; this is our
// equivalent, and unlike a re-pack it is the engine's real output.
//
// Rendered through an offscreen canvas rather than as SVG cells, for two
// reasons. A 4.5 km scenario at 25 m cells is ~35,000 cells, which is far too
// many elements; and cells drawn as rects would put a literal grid back on a
// canvas whose entire point is that it is not one. Upscaling a small bitmap
// gets bilinear smoothing from the browser for free, so it reads as a field.

import { memo, useEffect, useState } from 'react';
import type { BBox, Heatmap } from '@/lib/sim/types';
import { type Transform, worldToScreen } from '@/lib/transform';

interface Props {
  heatmap: Heatmap | null;
  bbox: BBox;
  t: Transform;
}

/**
 * Sequential ramp, as literal RGB. Heat ramps are data encodings, not brand
 * colours — they have to be perceptually ordered, and they are written into
 * image pixels where a CSS token cannot reach. Low density stays fully
 * transparent so the city underneath is never fogged by an empty street.
 */
const RAMP: [number, number, number, number][] = [
  [0.0, 56, 110, 240],
  [0.35, 72, 190, 210],
  [0.6, 235, 190, 90],
  [0.82, 240, 130, 60],
  [1.0, 235, 70, 70],
];

function rampAt(k: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (k <= RAMP[i][0]) {
      const [p0, r0, g0, b0] = RAMP[i - 1];
      const [p1, r1, g1, b1] = RAMP[i];
      const f = (k - p0) / (p1 - p0 || 1);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const last = RAMP[RAMP.length - 1];
  return [last[1], last[2], last[3]];
}

function HeatLayerImpl({ heatmap, bbox, t }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  // In an effect, not a useMemo: this touches `document`, and the page is
  // server-rendered before it is hydrated.
  useEffect(() => {
    if (!heatmap) {
      setUrl(null);
      return;
    }
    const { cols, rows, values } = heatmap;
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Normalise on a high percentile of the OCCUPIED cells, not on the single
    // worst one. Crowd density is extremely peaky — one chokepoint can be two
    // orders of magnitude above a busy street — so dividing by the max leaves
    // every cell but that one at an alpha of nearly zero, which is why this
    // layer was invisible the first time.
    const occupied: number[] = [];
    for (let i = 0; i < values.length; i++) if (values[i] > 0) occupied.push(values[i]);
    if (occupied.length === 0) {
      setUrl(null);
      return;
    }
    occupied.sort((a, b) => a - b);
    const max = occupied[Math.floor(occupied.length * 0.97)] || occupied[occupied.length - 1];
    if (max <= 0) {
      setUrl(null);
      return;
    }

    const img = ctx.createImageData(cols, rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const v = values[row * cols + col] ?? 0;
        // Gamma on top of the percentile, so the mid-range — ordinary busy
        // street, the part a planner can actually act on — gets most of the ramp.
        const k = Math.pow(Math.min(v / max, 1), 0.55);
        // Heatmap row 0 is the LOWEST world y; image row 0 is the top of the
        // picture. The flip here is the same y inversion worldToScreen does.
        const px = ((rows - 1 - row) * cols + col) * 4;
        const [r, g, b] = rampAt(k);
        img.data[px] = r;
        img.data[px + 1] = g;
        img.data[px + 2] = b;
        img.data[px + 3] = Math.round(Math.min(k * 1.3, 1) * 235);
      }
    }
    ctx.putImageData(img, 0, 0);
    setUrl(canvas.toDataURL());
  }, [heatmap]);

  if (!url) return null;

  // The grid covers exactly the span its cells describe, which is not quite the
  // bbox: createHeatmap rounds the cell count up.
  const topLeft = worldToScreen(
    t,
    { x: heatmap!.origin.x, y: heatmap!.origin.y + heatmap!.rows * heatmap!.cellM },
    bbox,
  );
  const bottomRight = worldToScreen(
    t,
    { x: heatmap!.origin.x + heatmap!.cols * heatmap!.cellM, y: heatmap!.origin.y },
    bbox,
  );

  return (
    <g data-slot="heat" className="pointer-events-none">
      <image
        href={url}
        x={topLeft.x}
        y={topLeft.y}
        width={bottomRight.x - topLeft.x}
        height={bottomRight.y - topLeft.y}
        preserveAspectRatio="none"
        style={{ mixBlendMode: 'screen' }}
      />
    </g>
  );
}

export const HeatLayer = memo(HeatLayerImpl);
