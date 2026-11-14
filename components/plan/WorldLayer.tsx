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
//
// Everything here is drawn at its real size in metres with a pixel floor, so
// the canvas stays honest under zoom: the venue really is ~250 m across and the
// corridor to the anchor really is kilometres long, and at 6x you can see that
// a vendor village is a rounding error beside a park-and-ride.
//
// Figure and ground: the fabric and the streets underneath are pale; the venue
// is the darkest object on the canvas. That contrast is doing the work of
// telling you where you are, and it is why nothing here is drawn at 35% opacity
// any more.

import type { BBox, Vec2, WorldState } from '@/lib/sim/types';
import { usePlanStore } from '@/lib/store';
import { useWorldDrag } from '@/components/plan/useWorldDrag';
import { type Transform, metresToPx, worldToScreen } from '@/lib/transform';

/** Storefront footprint, metres. Businesses have a catchment but no geometry. */
const SHOP_M = 16;
/** Stadium bowl radius, metres — the outer wall, not the pitch. */
const VENUE_R_M = 125;

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

  const shopPx = Math.max(metresToPx(t, SHOP_M), 3.5);
  // Labels are clutter at the fitted view and information once you are in.
  const showLabels = t.scale > 0.1;

  return (
    <g data-slot="world">
      {/* residential blocks — the people whose street this is. Drawn as solid
          masses, not tinted regions: they are buildings, and the plan's cost
          lands on them. */}
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
                // The fabric draws buildings inside these polygons, so the fill
                // is a tint over them rather than a slab: a block reads as a
                // dense residential district, not as a green field.
                fill="var(--block)"
                fillOpacity={dragging ? 0.5 : 0.28}
                stroke="color-mix(in oklab, var(--block), var(--plan-ink) 55%)"
                strokeWidth={dragging ? 2 : 1.25}
              />
            </g>
          );
        })}
      </g>

      <g data-slot="businesses">
        {world.businesses.map((b) => {
          const s = worldToScreen(t, b.pos, bbox);
          const dragging = businessDrag.draggingId === b.id;
          const half = (dragging ? shopPx * 1.3 : shopPx) / 2;
          return (
            <g key={b.id} {...businessDrag.dragHandlers(b.id, b.pos)}>
              {/* An invisible disc gives a small storefront a grabbable target. */}
              <circle cx={s.x} cy={s.y} r={Math.max(half + 4, 9)} fill="transparent" />
              <rect
                x={s.x - half}
                y={s.y - half}
                width={half * 2}
                height={half * 2}
                fill="var(--business)"
                stroke="var(--plan-ink)"
                strokeWidth={0.75}
                strokeOpacity={0.6}
              />
            </g>
          );
        })}
      </g>

      <g data-slot="anchors">
        {world.anchors.map((a) => {
          const s = worldToScreen(t, a.pos, bbox);
          const half = Math.max(metresToPx(t, 40), 7);
          return (
            <g key={a.id}>
              {/* the catchment the anchor pulls from, so an anchor reads as a
                  destination with a draw and not as a pin */}
              <circle
                cx={s.x}
                cy={s.y}
                r={half * 2.4}
                fill="var(--anchor)"
                fillOpacity={0.1}
                stroke="var(--anchor)"
                strokeOpacity={0.3}
                strokeWidth={1}
                strokeDasharray="3 5"
              />
              <rect
                x={s.x - half}
                y={s.y - half}
                width={half * 2}
                height={half * 2}
                rx={1.5}
                fill="var(--anchor)"
                stroke="var(--paper)"
                strokeWidth={1.5}
              />
              {showLabels && (
                <>
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
                </>
              )}
            </g>
          );
        })}
      </g>

      <g data-slot="venue">
        {(() => {
          const s = worldToScreen(t, world.venue.pos, bbox);
          const r = Math.max(metresToPx(t, VENUE_R_M), 10);
          return (
            <>
              {/* the apron: the ring of ground the event spills onto */}
              <circle cx={s.x} cy={s.y} r={r * 1.55} fill="var(--venue-ring)" fillOpacity={0.14} />
              <circle
                cx={s.x}
                cy={s.y}
                r={r * 1.55}
                fill="none"
                stroke="var(--venue)"
                strokeOpacity={0.3}
                strokeWidth={1}
                strokeDasharray="4 6"
              />
              {/* the bowl — the darkest thing on the canvas, on purpose */}
              <circle cx={s.x} cy={s.y} r={r} fill="var(--venue)" />
              <circle
                cx={s.x}
                cy={s.y}
                r={r * 0.62}
                fill="none"
                stroke="var(--paper)"
                strokeOpacity={0.45}
                strokeWidth={Math.max(r * 0.1, 1)}
              />
              {showLabels && (
                <text
                  x={s.x}
                  y={s.y - r * 1.55 - 9}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold"
                >
                  {world.venue.name}
                </text>
              )}
              <text
                x={s.x}
                y={s.y + 3}
                textAnchor="middle"
                className="pointer-events-none fill-white text-[9px] font-semibold tabular-nums"
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
