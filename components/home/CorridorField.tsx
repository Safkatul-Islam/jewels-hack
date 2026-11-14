// components/home/CorridorField.tsx — P1
//
// The apron as a projected plan, in SVG, with no JavaScript at all.
//
// This is the POSTER under the three.js model: server-rendered, so it is on
// screen before any of the 3D bundle has arrived, it holds the layout so
// nothing shifts, and it is the complete fallback when WebGL is unavailable.
//
// It is DELIBERATELY SIMPLER than the model, and this is a real tradeoff
// rather than an oversight. The model instances several hundred stalls, cars,
// racks and houses; drawing each of those as an SVG path would put tens of
// kilobytes of markup in front of the first paint, which is the one thing the
// poster exists to protect. So the poster draws the ZONES — facility pads,
// block footprints, the big solids — and leaves the grain to the model. The
// two differ slightly for the second the crossfade takes.
//
// Everything it does draw comes from corridorModel.ts, shared with the model,
// so the layout itself can never drift.

import type { CSSProperties } from 'react';

import {
  FACILITIES,
  LOT_ANCHOR,
  PED_CORRIDOR,
  RAIL_ANCHOR,
  RESIDENTIAL,
  SCALE_BAR_UNITS,
  SHOPFRONTS,
  VENUE,
  VENUE_BOWL,
  VENUE_PERIMETER,
  flow,
  grid,
  roads,
  type Facility,
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

   One affine matrix: y is compressed (the camera tilts down toward the
   ground) and sheared (it stands off to one side). No perspective,
   deliberately — parallel streets stay parallel, which keeps this a
   plan rather than a photograph of one. The 3D scene, which does have
   a perspective camera, is framed to roughly match.
   ------------------------------------------------------------------ */

const TILT = 0.54;
const SKEW = 0.21;

const GROUND = `matrix(1 0 ${SKEW} ${TILT} 0 0)`;

/** The same ground plane, raised `h` units in SCREEN space. */
function lifted(h: number): string {
  return `translate(0 ${-h}) ${GROUND}`;
}

function project(x: number, y: number): Pt {
  return [x + SKEW * y, TILT * y];
}

/** A footprint's four ground corners, with its own rotation applied. */
function corners({ x, y, w, d, a = 0 }: Footprint): Pt[] {
  const cx = x + w / 2;
  const cy = y + d / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as Pt[]
  ).map(([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Pt);
}

interface Massing {
  top: string;
  near: string;
  side: string;
  depth: number;
  key: string;
}

function extrude(f: Footprint): Massing {
  const [farLeft, farRight, nearRight, nearLeft] = corners(f).map(
    ([px, py]) => project(px, py) as Pt,
  );
  const up = ([px, py]: Pt): Pt => [px, py - f.h];

  return {
    top: polygon([up(farLeft), up(farRight), up(nearRight), up(nearLeft)]),
    near: polygon([nearLeft, nearRight, up(nearRight), up(nearLeft)]),
    side: polygon([farRight, nearRight, up(nearRight), up(farRight)]),
    depth: f.y + f.d,
    key: `${f.x.toFixed(1)}-${f.y.toFixed(1)}`,
  };
}

/** Flat ground outline of a footprint — a facility pad. */
function pad(f: Footprint): string {
  return polygon(corners(f).map(([px, py]) => project(px, py) as Pt));
}

/**
 * Where the projected ellipse reaches its left and right extremes. The shear
 * tilts them off the horizontal, and the silhouette of the bowl wall has to
 * start exactly there or it grows ears.
 */
const SILHOUETTE = Math.atan(SKEW);

function ringPoints(r: number, h: number, from: number, to: number, steps = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const [px, py] = project(VENUE[0] + r * Math.cos(a), VENUE[1] + r * Math.sin(a));
    pts.push([px, py - h]);
  }
  return pts;
}

const VENUE_WALL = polygon([
  ...ringPoints(VENUE_BOWL.rFoot, 0, SILHOUETTE, SILHOUETTE + Math.PI),
  ...ringPoints(VENUE_BOWL.rRim, VENUE_BOWL.h, SILHOUETTE + Math.PI, SILHOUETTE),
]);

/** Accent per facility kind — thin edges only, never a fill. */
const ACCENT: Record<Facility['kind'], string> = {
  security_gate: 'var(--piece-gate)',
  vendor_village: 'var(--piece-vendor)',
  service_bank: 'var(--piece-ped)',
  bike_valet: 'var(--piece-bike)',
  shuttle_hub: 'var(--piece-shuttle)',
  park_and_ride: 'var(--piece-parking)',
  road_closure: 'var(--piece-closure)',
};

/** One low solid per facility, standing in for its units. */
const FACILITY_MASSING = FACILITIES.map((f) => ({
  kind: f.kind,
  pad: pad(f.pad),
  massing: extrude({ ...f.pad, h: f.units[0]?.h ?? 1 }),
})).sort((a, b) => a.massing.depth - b.massing.depth);

const BLOCK_MASSING = RESIDENTIAL.map((b) =>
  extrude({ ...b.pad, h: Math.max(...b.buildings.map((x) => x.h), 1) * 0.7 }),
).sort((a, b) => a.depth - b.depth);

const SHOP_MASSING = SHOPFRONTS.map(extrude).sort((a, b) => a.depth - b.depth);
const RAIL_MASSING = extrude(RAIL_ANCHOR);
const LOT_MASSING = extrude(LOT_ANCHOR);

const PED_RIBBON = (() => {
  const half = PED_CORRIDOR.width / 2;
  const [a, , c] = PED_CORRIDOR.path;
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return polygon(
    (
      [
        [a[0] + nx, a[1] + ny],
        [c[0] + nx, c[1] + ny],
        [c[0] - nx, c[1] - ny],
        [a[0] - nx, a[1] - ny],
      ] as Pt[]
    ).map(([px, py]) => project(px, py) as Pt),
  );
})();

// Framed on the apron, matching the model's camera: the venue and roughly the
// first kilometre. The corridor leaves toward the anchor off the top right.
const VIEW_BOX = '340 330 520 320';

const LABEL = {
  venue: project(VENUE[0], VENUE[1] + VENUE_PERIMETER * 1.25),
  venueCrest: project(VENUE[0], VENUE[1]),
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

        {roads.map((road, i) => (
          <path
            key={i}
            d={polyline(road.pts)}
            strokeWidth={road.major ? 3.6 : 2.2}
            style={{ stroke: road.major ? '#222a34' : '#171d25' }}
          />
        ))}

        <path d={PED_RIBBON} style={{ fill: '#2b3540', stroke: 'none' }} />

        <circle
          cx={VENUE[0]}
          cy={VENUE[1]}
          r={VENUE_PERIMETER}
          strokeWidth={1}
          strokeDasharray="3 5"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--night-hairline)' }}
        />

        {FACILITY_MASSING.map((f) => (
          <path
            key={`pad-${f.pad.slice(0, 24)}`}
            d={f.pad}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ fill: 'none', stroke: ACCENT[f.kind], strokeOpacity: 0.4 }}
          />
        ))}

        {/* the egress wave — drifts gates → corridor, see `.night .drift` */}
        {flow.map((d, i) => (
          <circle
            key={i}
            className="drift"
            cx={d.cx.toFixed(1)}
            cy={d.cy.toFixed(1)}
            r={d.r.toFixed(2)}
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

      {/* Atmospheric fade over the far ground: without it the lattice runs to
          a hard edge and the plane reads as a sheet of paper rather than as
          ground going away from you. */}
      <defs>
        <linearGradient id="corridor-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--ink)', stopOpacity: 1 }} />
          <stop offset="60%" style={{ stopColor: 'var(--ink)', stopOpacity: 0.7 }} />
          <stop offset="100%" style={{ stopColor: 'var(--ink)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect x={200} y={100} width={900} height={110} fill="url(#corridor-haze)" />

      {/* ---- massing, far to near (painter's algorithm) ---- */}

      <g strokeWidth={0.6}>
        {BLOCK_MASSING.map((b) => (
          <g key={b.key}>
            <path
              d={b.side}
              style={{ fill: '#141b17', stroke: 'color-mix(in oklab, var(--pop-resident), transparent 84%)' }}
            />
            <path
              d={b.near}
              style={{ fill: '#19211c', stroke: 'color-mix(in oklab, var(--pop-resident), transparent 84%)' }}
            />
            <path
              d={b.top}
              style={{ fill: '#1d2721', stroke: 'color-mix(in oklab, var(--pop-resident), transparent 72%)' }}
            />
          </g>
        ))}
      </g>

      <g strokeWidth={0.6}>
        {SHOP_MASSING.map((shop) => (
          <g key={shop.key}>
            <path d={shop.side} style={{ fill: '#241b12', stroke: 'none' }} />
            <path d={shop.near} style={{ fill: '#2c2116', stroke: 'none' }} />
            <path
              d={shop.top}
              style={{
                fill: '#352819',
                stroke: 'color-mix(in oklab, var(--pop-business), transparent 50%)',
              }}
            />
          </g>
        ))}
      </g>

      <g strokeWidth={0.7}>
        {FACILITY_MASSING.map((f) => (
          <g key={f.massing.key}>
            <path d={f.massing.side} style={{ fill: '#1b212a', stroke: 'none' }} />
            <path d={f.massing.near} style={{ fill: '#202733', stroke: 'none' }} />
            <path
              d={f.massing.top}
              style={{ fill: '#252e3a', stroke: ACCENT[f.kind], strokeOpacity: 0.75 }}
            />
          </g>
        ))}
      </g>

      <g strokeWidth={0.9}>
        <path d={RAIL_MASSING.side} style={{ fill: 'var(--ink)', stroke: 'var(--bone)' }} />
        <path d={RAIL_MASSING.near} style={{ fill: 'var(--ink)', stroke: 'var(--bone)' }} />
        <path d={RAIL_MASSING.top} style={{ fill: 'var(--ink-raise)', stroke: 'var(--bone)' }} />
        <path d={LOT_MASSING.side} style={{ fill: 'var(--ink)', stroke: 'var(--night-dim)' }} />
        <path d={LOT_MASSING.near} style={{ fill: 'var(--ink)', stroke: 'var(--night-dim)' }} />
        <path d={LOT_MASSING.top} style={{ fill: 'var(--ink-raise)', stroke: 'var(--night-dim)' }} />
      </g>

      {/* the venue bowl */}
      <g>
        <path d={VENUE_WALL} strokeWidth={1} style={{ fill: '#1a2029', stroke: 'var(--bone)' }} />
        <g transform={lifted(VENUE_BOWL.h)}>
          <circle
            cx={VENUE[0]}
            cy={VENUE[1]}
            r={VENUE_BOWL.rRim}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ fill: 'var(--ink-raise)', stroke: 'var(--bone)' }}
          />
        </g>
        <g transform={lifted(VENUE_BOWL.pitchH)}>
          <circle
            cx={VENUE[0]}
            cy={VENUE[1]}
            r={VENUE_BOWL.rPitch}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ fill: '#3b4d61', stroke: 'var(--night-hairline)' }}
          />
        </g>
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
          y={LABEL.venueCrest[1] - VENUE_BOWL.h - 5}
          textAnchor="middle"
          className="svg-label"
        >
          88,000
        </text>
      </g>

      {/* scale bar — instrument chrome, so it stays flat on the screen */}
      <g transform="translate(392 600)" style={{ stroke: 'var(--night-dim)' }} strokeWidth={0.8}>
        <line x1={0} y1={0} x2={SCALE_BAR_UNITS} y2={0} />
        <line x1={0} y1={-3} x2={0} y2={3} />
        <line x1={SCALE_BAR_UNITS} y1={-3} x2={SCALE_BAR_UNITS} y2={3} />
        <text x={SCALE_BAR_UNITS + 8} y={2.5} className="svg-label" style={{ stroke: 'none' }}>
          500 m
        </text>
      </g>
    </svg>
  );
}
