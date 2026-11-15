// components/dashboard/HeatmapPanel.tsx
//
// Ported from P2's dashboard on the `development-josh` branch, with two things
// changed because the real data is not the mock's shape.
//
// 1. It takes the engine's `Heatmap` — a Float32Array with cols/rows — not a
//    `number[]`.
// 2. It DOWNSAMPLES before drawing. The real grid is 25 m cells over a 3.9 ×
//    2.4 km extent, so roughly 15,000 of them; the original rendered one <div>
//    per cell, which at that size is fifteen thousand DOM nodes rebuilt on
//    every sim. It also took the maximum with `Math.max(...values)`, which
//    overflows the call stack somewhere in the low tens of thousands of
//    arguments. Both are fine against a small mock and neither survives real
//    output.

import type { Heatmap } from '@/lib/sim/types';

export interface HeatmapPanelProps {
  title: string;
  heatmap: Heatmap;
  /** Width of the drawn grid, in blocks. */
  blocks?: number;
  tone?: string;
}

interface Downsampled {
  cols: number;
  rows: number;
  cells: number[];
  max: number;
}

function downsample(map: Heatmap, targetCols: number): Downsampled {
  const cols = Math.max(1, Math.min(targetCols, map.cols));
  const rows = Math.max(1, Math.round((cols * map.rows) / Math.max(map.cols, 1)));
  const cells = new Array<number>(cols * rows).fill(0);
  const counts = new Array<number>(cols * rows).fill(0);

  for (let y = 0; y < map.rows; y++) {
    const by = Math.min(rows - 1, Math.floor((y / map.rows) * rows));
    for (let x = 0; x < map.cols; x++) {
      const bx = Math.min(cols - 1, Math.floor((x / map.cols) * cols));
      const i = by * cols + bx;
      cells[i] += map.values[y * map.cols + x];
      counts[i] += 1;
    }
  }

  let max = 0;
  for (let i = 0; i < cells.length; i++) {
    cells[i] = counts[i] > 0 ? cells[i] / counts[i] : 0;
    if (cells[i] > max) max = cells[i];
  }

  return { cols, rows, cells, max: max || 1 };
}

export function HeatmapPanel({
  title,
  heatmap,
  blocks = 28,
  tone = 'var(--night-accent)',
}: HeatmapPanelProps) {
  const grid = downsample(heatmap, blocks);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase">
          {title}
        </p>
        <p className="font-mono text-[9px] text-[var(--night-dim)] tabular-nums">
          {heatmap.cellM} m · {heatmap.cols}×{heatmap.rows}
        </p>
      </div>
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
      >
        {grid.cells.map((value, i) => (
          <div
            key={i}
            className="aspect-square"
            style={{
              background: tone,
              // A floor of 0.06 so the grid itself stays legible as a shape;
              // an all-but-empty map should still read as a map.
              opacity: 0.06 + (value / grid.max) * 0.94,
            }}
          />
        ))}
      </div>
    </div>
  );
}
