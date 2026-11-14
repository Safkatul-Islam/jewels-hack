'use client';

// components/plan/WorldLayer.tsx — P1
//
// The locked furniture: residential blocks, businesses, arrival anchors and the
// venue. None of it is draggable — the venue and the anchors are the premise of
// the scenario, and the whole point is that only the pieces move.

import type { BBox, WorldState } from '@/lib/sim/types';
import { type Transform, metresToPx, worldToScreen } from '@/lib/transform';

export function WorldLayer({ world, t }: { world: WorldState; t: Transform }) {
  const bbox: BBox = world.bbox;

  return (
    <g data-slot="world">
      {/* residential blocks — drawn first, they are the ground the rest sits on */}
      <g data-slot="blocks">
        {world.blocks.map((b) => (
          <polygon
            key={b.id}
            points={b.polygon
              .map((p) => {
                const s = worldToScreen(t, p, bbox);
                return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
              })
              .join(' ')}
            fill="var(--block)"
            fillOpacity={0.35}
            stroke="var(--block)"
            strokeWidth={1}
          />
        ))}
      </g>

      <g data-slot="businesses">
        {world.businesses.map((b) => {
          const s = worldToScreen(t, b.pos, bbox);
          return (
            <circle
              key={b.id}
              cx={s.x}
              cy={s.y}
              r={2.75}
              fill="var(--business)"
              stroke="var(--canvas-bg)"
              strokeWidth={0.75}
            />
          );
        })}
      </g>

      <g data-slot="anchors">
        {world.anchors.map((a) => {
          const s = worldToScreen(t, a.pos, bbox);
          const half = 7;
          return (
            <g key={a.id}>
              <rect
                x={s.x - half}
                y={s.y - half}
                width={half * 2}
                height={half * 2}
                rx={2}
                fill="var(--anchor)"
                stroke="var(--canvas-bg)"
                strokeWidth={1.5}
              />
              <text
                x={s.x}
                y={s.y + half + 13}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-medium"
              >
                {a.name}
              </text>
              <text
                x={s.x}
                y={s.y + half + 24}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px] tabular-nums"
              >
                {Math.round(a.arrivalShare * 100)}% · {a.mode}
              </text>
            </g>
          );
        })}
      </g>

      <g data-slot="venue">
        {(() => {
          const s = worldToScreen(t, world.venue.pos, bbox);
          // A stadium footprint is roughly 250 m across; draw it to scale so the
          // corridor length reads honestly against it.
          const r = Math.max(metresToPx(t, 125), 10);
          return (
            <>
              <circle cx={s.x} cy={s.y} r={r * 1.6} fill="var(--venue-ring)" fillOpacity={0.18} />
              <circle
                cx={s.x}
                cy={s.y}
                r={r}
                fill="var(--venue)"
                fillOpacity={0.9}
                stroke="var(--canvas-bg)"
                strokeWidth={1.5}
              />
              <text
                x={s.x}
                y={s.y - r - 8}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-semibold"
              >
                {world.venue.name}
              </text>
              <text
                x={s.x}
                y={s.y + 3}
                textAnchor="middle"
                className="fill-primary-foreground text-[9px] font-medium tabular-nums"
              >
                {(world.venue.capacity / 1000).toFixed(0)}k
              </text>
            </>
          );
        })()}
      </g>
    </g>
  );
}
