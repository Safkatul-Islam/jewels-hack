'use client';

// components/plan/RoadLayer.tsx — P1
//
// Draws the scenario's abstract road seeds. These are NOT digitised streets and
// are not meant to look like a map — they are the corridor's topology.
//
// At INTEGRATION 1 this should switch to drawing RoadNetwork.edges instead, so
// closures and generated shuttle lines are visible. The seeds are what exists
// before P3's buildNetwork does.

import type { BBox, RoadSeed } from '@/lib/sim/types';
import { type Transform, worldToScreen } from '@/lib/transform';

const STROKE: Record<RoadSeed['class'], { width: number; color: string }> = {
  arterial: { width: 4, color: 'var(--road-arterial)' },
  collector: { width: 2.5, color: 'var(--road-collector)' },
  local: { width: 1.5, color: 'var(--road-local)' },
};

export function RoadLayer({ roads, bbox, t }: { roads: RoadSeed[]; bbox: BBox; t: Transform }) {
  return (
    <g data-slot="roads" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {roads.map((road) => {
        const d = road.path
          .map((p, i) => {
            const s = worldToScreen(t, p, bbox);
            return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`;
          })
          .join(' ');
        const style = STROKE[road.class];
        return <path key={road.id} d={d} stroke={style.color} strokeWidth={style.width} />;
      })}
    </g>
  );
}
