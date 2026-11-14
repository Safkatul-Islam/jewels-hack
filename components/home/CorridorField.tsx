// components/home/CorridorField.tsx — P1
//
// The landing page's corridor drawing: the venue, the arrival anchors, a loose
// road lattice, the egress wave, the businesses clustered at the rail anchor.
//
// It is NOT the real engine, and it should not become it. It is the same visual
// language as the plan canvas, drawn from a handful of parameters, so that `/`
// and `/plan` read as one object. Keeping it decorative is what keeps this a
// server component that ships zero JavaScript.
//
// Geometry is generated at module scope with a seeded LCG, so the drawing is
// byte-identical on every render and on four different laptops — no hydration
// mismatch, no Math.random.

const SEED = 20280714;

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Pt = [number, number];

function polyline(points: Pt[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

interface Road {
  d: string;
  major: boolean;
}

/**
 * venue → primary anchor. Everything else is arranged around this line.
 *
 * Both ends have to stay on screen. `preserveAspectRatio="slice"` crops roughly
 * 140 units off each side at the hero's usual proportions, so the spine is kept
 * well inside the viewBox rather than running to its edges.
 */
const SPINE: Pt[] = [
  [560, 530],
  [652, 482],
  [736, 424],
  [822, 362],
  [900, 302],
];

function pointOnSpine(t: number): Pt {
  const seg = Math.min(Math.floor(t * (SPINE.length - 1)), SPINE.length - 2);
  const f = t * (SPINE.length - 1) - seg;
  return [
    SPINE[seg][0] + (SPINE[seg + 1][0] - SPINE[seg][0]) * f,
    SPINE[seg][1] + (SPINE[seg + 1][1] - SPINE[seg][1]) * f,
  ];
}

function buildGeometry() {
  const rnd = makeRng(SEED);
  const roads: Road[] = [];

  // north–south runs, sheared slightly so the lattice never reads as a grid
  for (let i = 0; i < 9; i++) {
    const pts: Pt[] = [];
    for (let j = 0; j < 5; j++) {
      pts.push([70 + i * 142 + j * 26 + (rnd() - 0.5) * 34, -40 + j * 220 + (rnd() - 0.5) * 30]);
    }
    roads.push({ d: polyline(pts), major: i % 3 === 1 });
  }

  // east–west runs, drifting up toward the anchor
  for (let i = 0; i < 6; i++) {
    const pts: Pt[] = [];
    for (let j = 0; j < 6; j++) {
      pts.push([-40 + j * 268 + (rnd() - 0.5) * 30, 92 + i * 126 - j * 16 + (rnd() - 0.5) * 26]);
    }
    roads.push({ d: polyline(pts), major: i === 2 });
  }

  // the egress wave: sampled spectators, fanning out as they travel
  const flow = Array.from({ length: 190 }, (_, i) => {
    const t = i / 190;
    const [x, y] = pointOnSpine(t);
    const spread = 9 + t * 46;
    return {
      cx: x + (rnd() - 0.5) * 30,
      cy: y + (rnd() - 0.5) * spread,
      r: 0.9 + rnd() * 1.5,
      opacity: 0.16 + (1 - t) * 0.62,
    };
  });

  const shops = Array.from({ length: 16 }, (_, i) => ({
    cx: 752 + (i % 6) * 28 + (rnd() - 0.5) * 16,
    cy: 252 + Math.floor(i / 6) * 32 + (rnd() - 0.5) * 14,
  }));

  return { roads, flow, shops };
}

const { roads, flow, shops } = buildGeometry();

// Panned right by 320 units so the venue clears the headline scrim on wide
// screens. The whole point of the drawing is the gap between the venue and the
// anchor — if one end of it sits under the type, the image says nothing.
const VIEW_BOX = '-240 0 1440 760';

// Kept clear of the venue's ring and below the spine, so the corridor reads as
// running past the neighbourhood rather than through a pile of rectangles.
const BLOCKS: Pt[] = [
  [432, 622],
  [660, 578],
  [820, 470],
];

export function CorridorField() {
  return (
    <svg
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      className="block h-full w-full"
    >
      {/* roads */}
      <g fill="none" strokeLinecap="round">
        {roads.map((road, i) => (
          <path
            key={i}
            d={road.d}
            strokeWidth={road.major ? 1.5 : 1}
            style={{ stroke: road.major ? 'var(--night-road-major)' : 'var(--night-road-minor)' }}
          />
        ))}
        <path
          d={polyline(SPINE)}
          strokeWidth={2.5}
          style={{ stroke: 'var(--night-road-major)' }}
        />
      </g>

      {/* residential blocks */}
      <g strokeWidth={1}>
        {BLOCKS.map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={132}
            height={84}
            style={{
              fill: 'color-mix(in oklab, var(--pop-resident), transparent 90%)',
              stroke: 'color-mix(in oklab, var(--pop-resident), transparent 62%)',
            }}
          />
        ))}
      </g>

      {/* the egress wave */}
      <g>
        {flow.map((d, i) => (
          <circle
            key={i}
            cx={d.cx.toFixed(1)}
            cy={d.cy.toFixed(1)}
            r={d.r.toFixed(2)}
            style={{ fill: 'var(--pop-spectator)', opacity: d.opacity.toFixed(2) }}
          />
        ))}
      </g>

      {/* businesses, clustered at the rail anchor */}
      <g>
        {shops.map((s, i) => (
          <circle
            key={i}
            cx={s.cx.toFixed(1)}
            cy={s.cy.toFixed(1)}
            r={2.4}
            style={{ fill: 'var(--pop-business)', opacity: 0.85 }}
          />
        ))}
      </g>

      {/* venue */}
      <g>
        <circle
          cx={560}
          cy={530}
          r={104}
          strokeWidth={1}
          strokeDasharray="2 6"
          style={{ fill: 'none', stroke: 'var(--night-hairline)' }}
        />
        <circle
          cx={560}
          cy={530}
          r={54}
          strokeWidth={1.25}
          style={{ fill: 'var(--ink-raise)', stroke: 'var(--bone)' }}
        />
        {/* label sits BELOW the circle: above it collides with the subhead */}
        <text x={560} y={606} textAnchor="middle" className="svg-label svg-label-strong">
          Venue
        </text>
        <text x={560} y={535} textAnchor="middle" className="svg-label">
          88,000
        </text>
      </g>

      {/* primary anchor */}
      <g>
        <rect
          x={900}
          y={284}
          width={17}
          height={17}
          strokeWidth={1.25}
          style={{ fill: 'var(--ink-raise)', stroke: 'var(--bone)' }}
        />
        <text x={908} y={268} textAnchor="middle" className="svg-label svg-label-strong">
          Anchor · rail
        </text>
        <text x={908} y={322} textAnchor="middle" className="svg-label">
          2.4 km out
        </text>
      </g>

      {/* secondary anchor */}
      <g>
        <rect
          x={352}
          y={656}
          width={13}
          height={13}
          strokeWidth={1.1}
          style={{ fill: 'var(--ink-raise)', stroke: 'var(--night-dim)' }}
        />
        <text x={359} y={690} textAnchor="middle" className="svg-label">
          Anchor · lot
        </text>
      </g>

      {/* scale bar — the corridor length is the whole premise */}
      <g transform="translate(60 712)" style={{ stroke: 'var(--night-dim)' }} strokeWidth={1}>
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
