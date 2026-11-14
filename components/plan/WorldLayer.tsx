'use client';

// components/plan/WorldLayer.tsx — P1
//
// The scenario's furniture. Two tiers, and the split is deliberate:
//
//   Draggable — businesses and residential blocks. Moving one is a SCENARIO
//   edit, not a plan edit: it carries no ArUco marker and the engine routes
//   nothing through it, so it changes the economics (a shop's catchment moves
//   relative to the pedestrian heatmap) and never the road graph.
//
//   Locked — the venue and the arrival anchors. These are the ArUco calibration
//   pair (docs/02-CONTRACTS.md): markers 0 and 1 derive scale, rotation and
//   origin from `distance(venue.pos, anchors[0].pos)`, so moving either here
//   would silently rescale the table mode. WorldState also types `venue.locked`
//   as the literal `true`. If they ever need to move, that is a scenario-author
//   mode with recalibration, not a drag on the planning canvas.

import type { BBox, Vec2, WorldState } from '@/lib/sim/types';
import { usePlanStore } from '@/lib/store';
import { useWorldDrag } from '@/components/plan/useWorldDrag';
import { type Transform, metresToPx, worldToScreen } from '@/lib/transform';

function centroid(points: Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

export function WorldLayer({
  world,
  t,
  onCommit,
}: {
  world: WorldState;
  t: Transform;
  onCommit: () => void;
}) {
  const bbox: BBox = world.bbox;
  const snapM = usePlanStore((s) => s.snapM);
  const moveBusiness = usePlanStore((s) => s.moveBusiness);
  const moveBlock = usePlanStore((s) => s.moveBlock);

  const businessDrag = useWorldDrag({ t, bbox, snapM, onMove: moveBusiness, onCommit });
  const blockDrag = useWorldDrag({ t, bbox, snapM, onMove: moveBlock, onCommit });

  return (
    <g data-slot="world">
      {/* residential blocks — drawn first, they are the ground the rest sits on */}
      <g data-slot="blocks">
        {world.blocks.map((b) => {
          const dragging = blockDrag.draggingId === b.id;
          return (
            <g key={b.id} {...blockDrag.dragHandlers(b.id, centroid(b.polygon))}>
              <polygon
                points={b.polygon
                  .map((p) => {
                    const s = worldToScreen(t, p, bbox);
                    return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="var(--block)"
                fillOpacity={dragging ? 0.6 : 0.35}
                stroke="var(--block)"
                strokeWidth={dragging ? 2 : 1}
              />
            </g>
          );
        })}
      </g>

      <g data-slot="businesses">
        {world.businesses.map((b) => {
          const s = worldToScreen(t, b.pos, bbox);
          const dragging = businessDrag.draggingId === b.id;
          return (
            <g key={b.id} {...businessDrag.dragHandlers(b.id, b.pos)}>
              {/* An invisible disc gives a 2.75px dot a grabbable target. */}
              <circle cx={s.x} cy={s.y} r={9} fill="transparent" />
              <circle
                cx={s.x}
                cy={s.y}
                r={dragging ? 4 : 2.75}
                fill="var(--business)"
                stroke="var(--canvas-bg)"
                strokeWidth={0.75}
              />
            </g>
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
