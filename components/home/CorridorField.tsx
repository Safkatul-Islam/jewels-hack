// components/home/CorridorField.tsx — P1
//
// The corridor as a projected plan, in SVG, with no JavaScript at all.
//
// This used to be the landing page's whole drawing. It is now the poster
// underneath the three.js scene: it is server-rendered, so it is on screen
// before any of the 3D bundle has arrived, it is what stays if WebGL is
// unavailable or the canvas fails, and it holds the layout so nothing shifts
// when the scene fades in. Keep it cheap and keep it server-only.
//
// The geometry comes from corridorModel.ts, shared with the 3D scene, so the
// poster and the model are the same object rather than two drawings that
// happen to look alike.

import type { CSSProperties } from 'react';

import {
  BLOCKS,
  LOT_ANCHOR,
  RAIL_ANCHOR,
  SHOP_FOOTPRINTS,
  SPINE,
  VENUE,
  VENUE_BOWL,
  VENUE_PERIMETER,
  flow,
  grid,
  roads,
  type Footprint,
  type Pt,
} from './corridorModel';

function polyline(points: Pt[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

function polygon(points: Pt[]): string {
  return `${polyline(points)} Z`;
}

/* ------------------------------------------------------------------
   Projection

   The plan is projected once, by one affine matrix: y is compressed (the
   camera tilts down toward the ground) and sheared (it stands off to one
   side). There is no perspective, deliberately — parallel streets stay
   parallel, which is what keeps this readable as a plan rather than a
   photograph of one. The 3D scene, which does have a perspective camera,
   is framed to roughly match.
   ------------------------------------------------------------------ */

const TILT = 0.54;
const SKEW = 0.21;

const GROUND = `matrix(1 0 ${SKEW} ${TILT} 0 0)`;

/**
 * The same ground plane, raised `h` units in SCREEN space. SVG transform
 * lists apply right to left, so the point is projected first and lifted
 * afterwards — which is what makes the lift vertical on screen instead of
 * leaning with the shear.
 */
function lifted(h: number): string {
  return `translate(0 ${-h}) ${GROUND}`;
}

function project(x: number, y: number): Pt {
  return [x + SKEW * y, TILT * y];
}

/** A box standing on the ground plane, as the three faces a camera can see. */
interface Massing {
  top: string;
  near: string;
  side: string;
  parcels: string[];
  /** Footprint's near edge — the painter's-algorithm sort key. */
  depth: number;
  key: string;
}

function extrude({ x, y, w, d, h }: Footprint, parcelCount = 0): Massing {
  const farLeft = project(x, y);
  const farRight = project(x + w, y);
  const nearRight = project(x + w, y + d);
  const nearLeft = project(x, y + d);
  const up = ([px, py]: Pt): Pt => [px, py - h];

  // A few parcel divisions: without them a block reads as a green slab
  // rather than as somebody's street.
  const parcels = Array.from({ length: parcelCount }, (_, i) => {
    const f = (i + 1) / (parcelCount + 1);
    return polyline([up(project(x + w * f, y)), up(project(x + w * f, y + d))]);
  });

  return {
    parcels,
    top: polygon([up(farLeft), up(farRight), up(nearRight), up(nearLeft)]),
    near: polygon([nearLeft, nearRight, up(nearRight), up(nearLeft)]),
    // With a positive skew the camera sits to the west, so it is the east
    // wall that shows. Swap this if SKEW ever goes negative.
    side: polygon([farRight, nearRight, up(nearRight), up(farRight)]),
    depth: y + d,
    key: `${x.toFixed(1)}-${y.toFixed(1)}`,
  };
}

/**
 * Where the projected ellipse reaches its left and right extremes. The shear
 * tilts them off the horizontal, and the silhouette of the bowl wall has to
 * start exactly there or it grows ears.
 */
const SILHOUETTE = Math.atan(SKEW);

/** A circle on the ground plane, sampled, projected and raised by h. */
function ringPoints(r: number, h: number, from: number, to: number, steps = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const [px, py] = project(VENUE[0] + r * Math.cos(a), VENUE[1] + r * Math.sin(a));
    pts.push([px, py - h]);
  }
  return pts;
}

/** The outer wall the camera can see: the near half, foot to rim. */
const VENUE_WALL = polygon([
  ...ringPoints(VENUE_BOWL.rFoot, 0, SILHOUETTE, SILHOUETTE + Math.PI),
  ...ringPoints(VENUE_BOWL.rRim, VENUE_BOWL.h, SILHOUETTE + Math.PI, SILHOUETTE),
]);

/** Seating tiers, stepping down from the rim toward the pitch. */
const VENUE_TIERS = [0.74, 0.5].map((f) => ({
  r: VENUE_BOWL.rPitch + (VENUE_BOWL.rRim - VENUE_BOWL.rPitch) * f,
  h: VENUE_BOWL.pitchH + (VENUE_BOWL.h - VENUE_BOWL.pitchH) * f,
}));

const BLOCK_MASSING = BLOCKS.map((b) => extrude(b, 3)).sort((a, b) => a.depth - b.depth);
const SHOP_MASSING = SHOP_FOOTPRINTS.map((s) => extrude(s)).sort((a, b) => a.depth - b.depth);
const RAIL_MASSING = extrude(RAIL_ANCHOR);
const LOT_MASSING = extrude(LOT_ANCHOR);

// Framed around the projected corridor. The ground plane lands in the lower
// two-thirds; what is above it is sky, and the headline scrim covers the left.
const VIEW_BOX = '-150 -96 1440 620';

// Label anchors, projected once. Text itself is never transformed — a sheared
// 9px mono label is unreadable, and the labels are the half of this drawing
// that carries meaning.
const LABEL = {
  venue: project(VENUE[0], VENUE[1] + 118),
  venueCrest: project(VENUE[0], VENUE[1]),
  rail: project(909, 284),
  railOut: project(909, 344),
  lot: project(359, 690),
};

export function CorridorField() {
  return (
    <svg
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      className="block h-full w-full"
    >
      {/* the ground plane */}
      <g transform={GROUND} fill="none" strokeLinecap="round">
        <g strokeWidth={1} style={{ stroke: 'var(--night-grid)' }}>
          {grid.map((line, i) => (
            <path key={i} d={polyline(line)} vectorEffect="non-scaling-stroke" />
          ))}
        </g>

        {/* roads — non-scaling-stroke, or the projection thins the hairlines */}
        {roads.map((road, i) => (
          <path
            key={i}
            d={polyline(road.pts)}
            strokeWidth={road.major ? 1.5 : 1}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: road.major ? 'var(--night-road-major)' : 'var(--night-road-minor)' }}
          />
        ))}
        <path
          d={polyline(SPINE)}
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--night-road-major)' }}
        />

        {/* the venue's perimeter, drawn on the ground */}
        <circle
          cx={VENUE[0]}
          cy={VENUE[1]}
          r={VENUE_PERIMETER}
          strokeWidth={1}
          strokeDasharray="2 6"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--night-hairline)' }}
        />

        {/* the egress wave — drifts venue → anchor, see `.night .drift` */}
        {flow.map((d, i) => (
          <circle
            key={i}
            className="drift"
            cx={d.cx.toFixed(1)}
            cy={d.cy.toFixed(1)}
            r={(d.r * 1.34).toFixed(2)}
            style={
              {
                fill: 'var(--pop-spectator)',
                // fill-opacity, not opacity: the keyframes animate `opacity`,
                // and the two multiply. With motion off, this is the drawing's
                // original weight.
                fillOpacity: d.opacity.toFixed(2),
                '--dx': `${d.dx.toFixed(1)}px`,
                '--dy': `${d.dy.toFixed(1)}px`,
                '--dur': `${d.dur.toFixed(1)}s`,
                animationDelay: `${d.delay.toFixed(1)}s`,
              } as CSSProperties
            }
          />
        ))}
      </g>

      {/* Atmospheric fade over the far ground. Not decoration: without it the
          lattice runs to a hard edge and the plane reads as a sheet of paper
          rather than as ground going away from you. It stops above the rail
          anchor, which has to stay legible. */}
      <defs>
        <linearGradient id="corridor-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--ink)', stopOpacity: 1 }} />
          <stop offset="55%" style={{ stopColor: 'var(--ink)', stopOpacity: 0.72 }} />
          <stop offset="100%" style={{ stopColor: 'var(--ink)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect x={-400} y={-300} width={2200} height={440} fill="url(#corridor-haze)" />

      {/* ---- massing, far to near (painter's algorithm) ---- */}

      {SHOP_MASSING.map((shop) => (
        <g key={shop.key} strokeWidth={0.8}>
          <path
            d={shop.side}
            style={{
              fill: 'color-mix(in oklab, var(--pop-business), var(--ink) 86%)',
              stroke: 'color-mix(in oklab, var(--pop-business), transparent 70%)',
            }}
          />
          <path
            d={shop.near}
            style={{
              fill: 'color-mix(in oklab, var(--pop-business), var(--ink) 80%)',
              stroke: 'color-mix(in oklab, var(--pop-business), transparent 70%)',
            }}
          />
          <path
            d={shop.top}
            style={{
              fill: 'color-mix(in oklab, var(--pop-business), var(--ink) 66%)',
              stroke: 'color-mix(in oklab, var(--pop-business), transparent 56%)',
            }}
          />
        </g>
      ))}

      <g strokeWidth={1.1}>
        <path d={RAIL_MASSING.side} style={{ fill: 'var(--ink)', stroke: 'var(--bone)' }} />
        <path d={RAIL_MASSING.near} style={{ fill: 'var(--ink)', stroke: 'var(--bone)' }} />
        <path d={RAIL_MASSING.top} style={{ fill: 'var(--ink-raise)', stroke: 'var(--bone)' }} />
      </g>

      {BLOCK_MASSING.map((b) => (
        <g key={b.key} strokeWidth={1}>
          <path
            d={b.side}
            style={{
              fill: 'color-mix(in oklab, var(--pop-resident), var(--ink) 88%)',
              stroke: 'color-mix(in oklab, var(--pop-resident), transparent 72%)',
            }}
          />
          <path
            d={b.near}
            style={{
              fill: 'color-mix(in oklab, var(--pop-resident), var(--ink) 82%)',
              stroke: 'color-mix(in oklab, var(--pop-resident), transparent 72%)',
            }}
          />
          <path
            d={b.top}
            style={{
              fill: 'color-mix(in oklab, var(--pop-resident), var(--ink) 74%)',
              stroke: 'color-mix(in oklab, var(--pop-resident), transparent 58%)',
            }}
          />
          {b.parcels.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              strokeWidth={0.75}
              style={{ stroke: 'color-mix(in oklab, var(--pop-resident), transparent 74%)' }}
            />
          ))}
        </g>
      ))}

      {/* the venue bowl */}
      <g>
        <path
          d={VENUE_WALL}
          strokeWidth={1.25}
          style={{ fill: 'var(--ink)', stroke: 'var(--bone)' }}
        />
        <g transform={lifted(VENUE_BOWL.h)}>
          <circle
            cx={VENUE[0]}
            cy={VENUE[1]}
            r={VENUE_BOWL.rRim}
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
            style={{ fill: 'var(--ink-raise)', stroke: 'var(--bone)' }}
          />
        </g>
        {VENUE_TIERS.map((tier) => (
          <g key={tier.r} transform={lifted(tier.h)}>
            <circle
              cx={VENUE[0]}
              cy={VENUE[1]}
              r={tier.r}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{
                fill: 'var(--ink)',
                stroke: 'color-mix(in oklab, var(--bone), transparent 55%)',
              }}
            />
          </g>
        ))}
        <g transform={lifted(VENUE_BOWL.pitchH)}>
          <circle
            cx={VENUE[0]}
            cy={VENUE[1]}
            r={VENUE_BOWL.rPitch}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ fill: 'var(--ink-raise)', stroke: 'var(--night-hairline)' }}
          />
        </g>
      </g>

      {/* lot anchor — nearest the camera, so it is drawn last */}
      <g strokeWidth={1}>
        <path d={LOT_MASSING.side} style={{ fill: 'var(--ink)', stroke: 'var(--night-dim)' }} />
        <path d={LOT_MASSING.near} style={{ fill: 'var(--ink)', stroke: 'var(--night-dim)' }} />
        <path d={LOT_MASSING.top} style={{ fill: 'var(--ink-raise)', stroke: 'var(--night-dim)' }} />
      </g>

      {/* ---- labels: projected positions, upright type ---- */}
      <g>
        <text
          x={LABEL.venue[0]}
          y={LABEL.venue[1]}
          textAnchor="middle"
          className="svg-label svg-label-strong"
        >
          Venue
        </text>
        <text
          x={LABEL.venueCrest[0]}
          y={LABEL.venueCrest[1] - VENUE_BOWL.pitchH + 3}
          textAnchor="middle"
          className="svg-label"
        >
          88,000
        </text>
        <text
          x={LABEL.rail[0]}
          y={LABEL.rail[1] - 40}
          textAnchor="middle"
          className="svg-label svg-label-strong"
        >
          Anchor · rail
        </text>
        <text x={LABEL.railOut[0]} y={LABEL.railOut[1]} textAnchor="middle" className="svg-label">
          2.4 km out
        </text>
        <text x={LABEL.lot[0]} y={LABEL.lot[1]} textAnchor="middle" className="svg-label">
          Anchor · lot
        </text>
      </g>

      {/* scale bar — instrument chrome, so it stays flat on the screen */}
      <g transform="translate(486 456)" style={{ stroke: 'var(--night-dim)' }} strokeWidth={1}>
        <line x1={0} y1={0} x2={118} y2={0} />
        <line x1={0} y1={-4} x2={0} y2={4} />
        <line x1={118} y1={-4} x2={118} y2={4} />
        <text x={130} y={3} className="svg-label" style={{ stroke: 'none' }}>
          500 m
        </text>
      </g>
    </svg>
  );
}
