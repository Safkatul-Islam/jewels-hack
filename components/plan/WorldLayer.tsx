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

import type { BBox, WorldState } from '@/lib/sim/types';
import { usePlanStore } from '@/lib/store';
import { useWorldDrag } from '@/components/plan/useWorldDrag';
import { type Transform, metresToPx, worldToScreen } from '@/lib/transform';

/** Storefront footprint, metres. Businesses have a catchment but no geometry. */
const SHOP_M = 16;
/** Stadium bowl radius, metres — the outer wall, not the pitch. */
const VENUE_R_M = 125;

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
  const result = usePlanStore((s) => s.result);
  const baseline = usePlanStore((s) => s.baseline);

  const businessDrag = useWorldDrag({ t, bbox, snapM, onMove: moveBusiness, onCommit });

  // What the PLAN did to each shop's takings, as a fraction: this run against
  // the same world with no pieces in it.
  //
  // Not `perBusiness.deltaPct` — that compares with the shop's ordinary day,
  // and during an egress it reaches five figures, so any fixed scale pins every
  // shop on the corridor to full colour and a vendor village halving one of
  // them changes nothing on screen. Against the no-piece baseline, halving a
  // shop's conversion reads as -50%, which is the number a planner means.
  const baseRev = new Map((baseline?.perBusiness ?? []).map((b) => [b.id, b.revenueUsd]));
  const shopEffect = new Map(
    (result?.perBusiness ?? []).map((b) => {
      const was = baseRev.get(b.id);
      return [b.id, was && was > 0 ? (b.revenueUsd - was) / was : 0];
    }),
  );

  const shopPx = Math.max(metresToPx(t, SHOP_M), 3.5);
  // Labels are clutter at the fitted view and information once you are in.
  const showLabels = t.scale > 0.1;

  return (
    <g data-slot="world">
      {/* Residential blocks are NOT drawn here, and are not draggable.
          A block is a census fact, not a thing on the map: nobody relocates a
          neighbourhood to improve an egress score, and the polygons read as
          abstract shapes floating over the city anyway. The people in them are
          already on screen — they are the buildings lining the streets — so
          the cost to residents is painted onto that fabric instead, by
          ResidentLayer. world.blocks stays in the data: the engine samples
          resident trips from it and livability is scored off it. */}

      <g data-slot="businesses">
        {world.businesses.map((b) => {
          const s2 = worldToScreen(t, b.pos, bbox);
          const dragging = businessDrag.draggingId === b.id;
          // Up is `--better`, down is `--worse`, and a shop the plan did not
          // touch stays its own amber. Saturating at ±20% is deliberate: a
          // fifth of a day's takings either way is the difference between a
          // good week and laying someone off, so it should reach full colour
          // early rather than reserving it for swings nobody survives.
          const k = Math.max(-1, Math.min((shopEffect.get(b.id) ?? 0) / 0.2, 1));
          const fill =
            k > 0.04
              ? `color-mix(in oklab, var(--better) ${Math.round(k * 100)}%, var(--business))`
              : k < -0.04
                ? `color-mix(in oklab, var(--worse) ${Math.round(-k * 100)}%, var(--business))`
                : 'var(--business)';
          // Size carries the magnitude too, so a hit shop is findable at a
          // zoom where its colour is three pixels wide.
          const grow = 1 + Math.abs(k) * 0.9;
          const half = (dragging ? shopPx * 1.3 : shopPx * grow) / 2;

          return (
            <g key={b.id} {...businessDrag.dragHandlers(b.id, b.pos)}>
              {/* An invisible disc gives a small storefront a grabbable target. */}
              <circle cx={s2.x} cy={s2.y} r={Math.max(half + 4, 9)} fill="transparent" />
              {/* A halo, so a badly hit shop is visible against the heat field
                  without inflating the footprint it actually occupies. */}
              {Math.abs(k) > 0.25 && (
                <circle
                  cx={s2.x}
                  cy={s2.y}
                  r={half * 3.2}
                  fill={k > 0 ? 'var(--better)' : 'var(--worse)'}
                  fillOpacity={0.16}
                />
              )}
              <rect
                x={s2.x - half}
                y={s2.y - half}
                width={half * 2}
                height={half * 2}
                fill={fill}
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
