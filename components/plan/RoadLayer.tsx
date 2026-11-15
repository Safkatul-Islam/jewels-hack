'use client';

// components/plan/RoadLayer.tsx — P1
//
// Draws the road graph the engine actually routes on: RoadNetwork.edges, which
// buildNetwork() regenerates from the scenario's seeds plus whatever pieces the
// user has placed. The user never edits a road directly — roads are a
// consequence of the plan, which is the whole interaction.
//
// Streets are drawn the way a map draws them: a grey CASING underneath, a pale
// SURFACE on top, every casing laid down before any surface. Done per-edge
// instead, the casings paint over their neighbours' surfaces and every junction
// grows a seam. Two passes is the entire trick, and it is what turns a web of
// coloured lines into something that reads as a street network.
//
// Widths are in metres — an arterial is 24 m of carriageway — with a pixel
// floor so the network stays legible when the whole scenario is in frame. That
// is also what makes zooming in feel like a map rather than a vector blow-up.
//
// What shows up here, and where it comes from (lib/sim/network.ts):
//   - 'arterial' / 'collector' / 'local'  the scenario's own seeds
//   - 'path'      a shortcut edge, created by a ped_corridor piece
//   - 'shuttle'   a hub→primary-anchor line, created by a shuttle_hub piece
//   - closed      an edge a road_closure piece shut, drawn struck through
//
// Falls back to the raw seeds when no network exists yet (the first frame after
// a scenario loads, before the first sim run), so the canvas is never empty.

import { AnimatePresence, motion } from 'framer-motion';
import type { BBox, RoadEdge, RoadNetwork, RoadSeed, Vec2 } from '@/lib/sim/types';
import { type Transform, worldToScreen } from '@/lib/transform';

interface RoadStyle {
  /** carriageway width in metres */
  widthM: number;
  /** never thinner than this on screen */
  minPx: number;
  color: string;
}

const STROKE: Record<RoadEdge['class'], RoadStyle> = {
  arterial: { widthM: 24, minPx: 4, color: 'var(--road-fill)' },
  collector: { widthM: 14, minPx: 2.75, color: 'var(--road-fill)' },
  local: { widthM: 8, minPx: 1.75, color: 'var(--road-fill)' },
  // Generated edges borrow the colour of the piece that made them, so the link
  // between "I dropped this" and "this appeared" is readable without a legend.
  path: { widthM: 10, minPx: 2.5, color: 'var(--piece-ped)' },
  shuttle: { widthM: 9, minPx: 2.5, color: 'var(--piece-shuttle)' },
};

function widthPx(style: RoadStyle, t: Transform): number {
  return Math.max(style.widthM * t.scale, style.minPx);
}

interface Props {
  network: RoadNetwork | null;
  /** Scenario seeds, drawn only until the first network exists. */
  roads: RoadSeed[];
  bbox: BBox;
  t: Transform;
}

export function RoadLayer({ network, roads, bbox, t }: Props) {
  if (!network) return <SeedRoads roads={roads} bbox={bbox} t={t} />;

  const nodePos = new Map<string, Vec2>(network.nodes.map((n) => [n.id, n.pos]));

  const drawn = network.edges.flatMap((edge) => {
    const a = nodePos.get(edge.a);
    const b = nodePos.get(edge.b);
    if (!a || !b) return [];
    const sa = worldToScreen(t, a, bbox);
    const sb = worldToScreen(t, b, bbox);
    const style = STROKE[edge.class];
    return [
      {
        edge,
        sa,
        sb,
        w: widthPx(style, t),
        color: style.color,
        generated: edge.class === 'path' || edge.class === 'shuttle',
      },
    ];
  });

  return (
    <g data-slot="roads" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* pass 1 — casings, all of them, before any surface */}
      <g stroke="var(--road-casing)">
        {drawn.map(({ edge, sa, sb, w }) => (
          <line
            key={`c-${edge.id}`}
            x1={sa.x}
            y1={sa.y}
            x2={sb.x}
            y2={sb.y}
            strokeWidth={w + 2.25}
            strokeOpacity={edge.closed ? 0.35 : 1}
          />
        ))}
      </g>

      {/* pass 2 — surfaces */}
      <AnimatePresence initial={false}>
        {drawn.map(({ edge, sa, sb, w, color, generated }) => (
          <motion.line
            key={edge.id}
            x1={sa.x}
            y1={sa.y}
            x2={sb.x}
            y2={sb.y}
            stroke={edge.closed ? 'var(--piece-closure)' : color}
            strokeWidth={w}
            strokeDasharray={
              edge.closed ? '3 4' : edge.class === 'shuttle' ? `${w * 2} ${w * 1.3}` : undefined
            }
            initial={generated ? { opacity: 0 } : false}
            animate={{ opacity: edge.closed ? 0.55 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>

      {/* A closed road reads as "shut", not merely "faint" — a dim dashed line
          alone is too easy to miss against the fabric at this zoom. */}
      <g data-slot="closures">
        {drawn
          .filter(({ edge }) => edge.closed)
          .map(({ edge, sa, sb }) => {
            const mx = (sa.x + sb.x) / 2;
            const my = (sa.y + sb.y) / 2;
            return (
              <g key={`x-${edge.id}`} stroke="var(--piece-closure)" strokeWidth={1.75}>
                <line x1={mx - 4} y1={my - 4} x2={mx + 4} y2={my + 4} />
                <line x1={mx - 4} y1={my + 4} x2={mx + 4} y2={my - 4} />
              </g>
            );
          })}
      </g>
    </g>
  );
}

function SeedRoads({ roads, bbox, t }: { roads: RoadSeed[]; bbox: BBox; t: Transform }) {
  const paths = roads.map((road) => ({
    id: road.id,
    d: road.path
      .map((p, i) => {
        const s = worldToScreen(t, p, bbox);
        return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`;
      })
      .join(' '),
    style: STROKE[road.class],
  }));

  return (
    <g data-slot="roads" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <g stroke="var(--road-casing)">
        {paths.map((p) => (
          <path key={`c-${p.id}`} d={p.d} strokeWidth={widthPx(p.style, t) + 2.25} />
        ))}
      </g>
      {paths.map((p) => (
        <path key={p.id} d={p.d} stroke={p.style.color} strokeWidth={widthPx(p.style, t)} />
      ))}
    </g>
  );
}
