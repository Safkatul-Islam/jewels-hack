'use client';

// components/plan/RoadLayer.tsx — P1
//
// Draws the road graph the engine actually routes on: RoadNetwork.edges, which
// buildNetwork() regenerates from the scenario's seeds plus whatever pieces the
// user has placed. The user never edits a road directly — roads are a
// consequence of the plan, which is the whole interaction.
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

const STROKE: Record<RoadEdge['class'], { width: number; color: string }> = {
  arterial: { width: 4, color: 'var(--road-arterial)' },
  collector: { width: 2.5, color: 'var(--road-collector)' },
  local: { width: 1.5, color: 'var(--road-local)' },
  // Generated edges borrow the colour of the piece that made them, so the link
  // between "I dropped this" and "this appeared" is readable without a legend.
  path: { width: 2.5, color: 'var(--piece-ped)' },
  shuttle: { width: 3, color: 'var(--piece-shuttle)' },
};

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

  return (
    <g data-slot="roads" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <AnimatePresence initial={false}>
        {network.edges.map((edge) => {
          const a = nodePos.get(edge.a);
          const b = nodePos.get(edge.b);
          if (!a || !b) return null;

          const sa = worldToScreen(t, a, bbox);
          const sb = worldToScreen(t, b, bbox);
          const style = STROKE[edge.class];
          const generated = edge.class === 'path' || edge.class === 'shuttle';

          return (
            <motion.line
              key={edge.id}
              x1={sa.x}
              y1={sa.y}
              x2={sb.x}
              y2={sb.y}
              stroke={edge.closed ? 'var(--piece-closure)' : style.color}
              strokeWidth={style.width}
              strokeDasharray={edge.closed ? '3 4' : edge.class === 'shuttle' ? '9 5' : undefined}
              initial={generated ? { opacity: 0 } : false}
              animate={{ opacity: edge.closed ? 0.5 : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            />
          );
        })}
      </AnimatePresence>

      {/* A closed road reads as "shut", not merely "faint" — a dim dashed line
          alone is too easy to miss against the grid at this zoom. */}
      <g data-slot="closures">
        {network.edges
          .filter((e) => e.closed)
          .map((edge) => {
            const a = nodePos.get(edge.a);
            const b = nodePos.get(edge.b);
            if (!a || !b) return null;
            const sa = worldToScreen(t, a, bbox);
            const sb = worldToScreen(t, b, bbox);
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
