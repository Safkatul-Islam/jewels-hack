// ============================================================
// lib/sim/heatmap.ts   (P3)
// ============================================================
// Grid helpers shared by simulate.ts (which writes heatmaps) and business.ts
// (which reads them via integrateHeatmap).

import type { BBox, Heatmap, Vec2 } from './types';
import { distance } from './geometry';

export function createHeatmap(bbox: BBox, cellM: number): Heatmap {
  const cols = Math.max(1, Math.ceil((bbox.maxX - bbox.minX) / cellM));
  const rows = Math.max(1, Math.ceil((bbox.maxY - bbox.minY) / cellM));
  return {
    cellM,
    cols,
    rows,
    origin: { x: bbox.minX, y: bbox.minY },
    values: new Float32Array(cols * rows),
  };
}

function cellIndex(heatmap: Heatmap, pos: Vec2): number | null {
  const col = Math.floor((pos.x - heatmap.origin.x) / heatmap.cellM);
  const row = Math.floor((pos.y - heatmap.origin.y) / heatmap.cellM);
  if (col < 0 || col >= heatmap.cols || row < 0 || row >= heatmap.rows) return null;
  return row * heatmap.cols + col;
}

/** Adds `amount` to whichever cell contains `pos`. No-op if `pos` is outside the grid. */
export function addToHeatmap(heatmap: Heatmap, pos: Vec2, amount: number): void {
  const idx = cellIndex(heatmap, pos);
  if (idx !== null) heatmap.values[idx]! += amount;
}

/**
 * Distributes `amount` (mass, conserved) across every cell within `spreadM` of `pos`,
 * weighted by linear falloff. Roads are modelled as zero-width polylines, so without
 * this every agent lands in exactly one cell and density spikes unrealistically at any
 * shared chokepoint — real crowds spread across a street's actual width. Falls back to
 * a single cell if nothing is in range.
 */
export function addSpreadToHeatmap(heatmap: Heatmap, pos: Vec2, amount: number, spreadM: number): void {
  const cellsRadius = Math.max(1, Math.ceil(spreadM / heatmap.cellM));
  const centerCol = Math.floor((pos.x - heatmap.origin.x) / heatmap.cellM);
  const centerRow = Math.floor((pos.y - heatmap.origin.y) / heatmap.cellM);

  const touched: { idx: number; w: number }[] = [];
  let totalWeight = 0;
  for (let dr = -cellsRadius; dr <= cellsRadius; dr++) {
    const row = centerRow + dr;
    if (row < 0 || row >= heatmap.rows) continue;
    for (let dc = -cellsRadius; dc <= cellsRadius; dc++) {
      const col = centerCol + dc;
      if (col < 0 || col >= heatmap.cols) continue;
      const cellCenter: Vec2 = {
        x: heatmap.origin.x + (col + 0.5) * heatmap.cellM,
        y: heatmap.origin.y + (row + 0.5) * heatmap.cellM,
      };
      const d = distance(cellCenter, pos);
      if (d > spreadM) continue;
      const w = 1 - d / spreadM;
      touched.push({ idx: row * heatmap.cols + col, w });
      totalWeight += w;
    }
  }

  if (totalWeight <= 0) {
    addToHeatmap(heatmap, pos, amount);
    return;
  }
  for (const { idx, w } of touched) heatmap.values[idx]! += amount * (w / totalWeight);
}

/** Stamps `value` along the segment a→b, taking the max with whatever's already there.
 *  Used to rasterise an edge's congestion load onto the grid without leaving gaps. */
export function stampSegmentMax(heatmap: Heatmap, a: Vec2, b: Vec2, value: number): void {
  const len = distance(a, b);
  const steps = Math.max(1, Math.ceil(len / (heatmap.cellM / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pos: Vec2 = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const idx = cellIndex(heatmap, pos);
    if (idx !== null) heatmap.values[idx] = Math.max(heatmap.values[idx]!, value);
  }
}

export function maxValue(heatmap: Heatmap): number {
  let max = 0;
  for (let i = 0; i < heatmap.values.length; i++) max = Math.max(max, heatmap.values[i]!);
  return max;
}

export function cloneHeatmap(heatmap: Heatmap): Heatmap {
  return { ...heatmap, values: new Float32Array(heatmap.values) };
}
