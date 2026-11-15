'use client';

// components/plan/FlowLayer.tsx — P1
//
// The egress, drawn on the network it actually runs on: for each arrival
// anchor, the shortest path the engine would take from the venue, as a ribbon
// whose width is that anchor's share of the departures.
//
// This layer exists because of a gap between what the engine knows and what the
// screen showed. Dropping a road closure already re-ran buildNetwork and
// re-routed every trip — but the only evidence was a number changing in a panel
// three hundred pixels away. A ribbon that visibly swings onto a different
// street is the same fact, delivered where the user is looking.
//
// HONESTY, because this is the easiest place in the project to lie:
//   - The ribbon geometry is the engine's own route() output over the engine's
//     own RoadNetwork. It is not a drawn arc.
//   - The widths are perAnchor.departures, as returned.
//   - The MOVING DOTS ARE NOT AGENTS. SimResult exposes no per-tick positions,
//     so the dots are a rendering of timeline[] counts spread along the route.
//     They say "this many people, moving this way, at this minute". They do not
//     say "this person is here".

import { memo, useMemo } from 'react';
import type { ArrivalAnchor, BBox, RoadNetwork, SimResult, Vec2, WorldState } from '@/lib/sim/types';
import { route } from '@/lib/sim/network';
import { type Transform, worldToScreen } from '@/lib/transform';

interface Props {
  world: WorldState;
  network: RoadNetwork | null;
  result: SimResult | null;
  bbox: BBox;
  t: Transform;
  /** null = show the whole run; a number scrubs result.timeline */
  playMinute: number | null;
  playing: boolean;
}

type Mode = 'walk' | 'drive' | 'transit';

/** Modes to try for an anchor, best first. An anchor only served by a shuttle a
 *  user has not placed yet still has to draw something, so this falls back. */
function modesFor(anchor: ArrivalAnchor): Mode[] {
  switch (anchor.mode) {
    case 'parking':
      return ['drive', 'walk'];
    case 'rail':
    case 'bus':
      return ['transit', 'walk', 'drive'];
    default:
      return ['walk', 'drive'];
  }
}

const MODE_COLOR: Record<Mode, string> = {
  walk: 'var(--piece-ped)',
  transit: 'var(--piece-shuttle)',
  drive: 'var(--piece-parking)',
};

interface Ribbon {
  id: string;
  name: string;
  mode: Mode;
  /** world-space polyline along the routed edges */
  points: Vec2[];
  departures: number;
  minutes: number;
  /** 0 for an anchor's primary route, 1 for the alternative — drawn thinner so
   *  the two are distinguishable where they run down the same street. */
  rank: number;
}

function buildRibbons(
  world: WorldState,
  net: RoadNetwork,
  result: SimResult | null,
): Ribbon[] {
  const nodePos = new Map<string, Vec2>(net.nodes.map((n) => [n.id, n.pos]));
  const departuresById = new Map(result?.perAnchor.map((a) => [a.id, a.departures]) ?? []);

  const out: Ribbon[] = [];
  for (const anchor of world.anchors) {
    const destId = net.anchorNodeIds[anchor.id];
    if (!destId) continue;

    // Every mode that reaches this anchor by a DIFFERENT path gets its own
    // ribbon, up to two. Drawing only the first one that routes hid the move
    // the whole demo turns on: a road closure does not touch a transit route,
    // so a rail anchor's ribbon never budged while the drive corridor beside it
    // swung two blocks west. Two ribbons, and the detour is on screen.
    const seen = new Set<string>();
    for (const mode of modesFor(anchor)) {
      if (seen.size >= 2) break;
      const r = route(net, net.venueNodeId, destId, mode);
      if (!r || r.nodeIds.length < 2) continue;
      const key = r.nodeIds.join('>');
      if (seen.has(key)) continue;
      seen.add(key);

      const points = r.nodeIds.map((id) => nodePos.get(id)).filter((p): p is Vec2 => !!p);
      if (points.length < 2) continue;
      out.push({
        id: anchor.id,
        name: anchor.name,
        mode,
        points,
        // Before the first run there are no departures; fall back to the
        // scenario's own arrival share so the ribbon still has a weight.
        departures: departuresById.get(anchor.id) ?? anchor.arrivalShare * world.params.spectators,
        minutes: r.minutes,
        rank: seen.size - 1,
      });
    }
  }
  return out;
}

/** Total people in motion at a given minute, and the run's peak, from the only
 *  per-minute data the contract returns. */
function motionAt(result: SimResult | null, minute: number | null) {
  if (!result || result.timeline.length === 0) return { now: 1, peak: 1 };
  const moving = (i: number) => {
    const f = result.timeline[i];
    return f.onFoot + f.onShuttle + f.inCar;
  };
  let peak = 1;
  for (let i = 0; i < result.timeline.length; i++) peak = Math.max(peak, moving(i));
  if (minute === null) return { now: peak, peak };

  // Linear interpolation between samples, so a scrub reads as continuous rather
  // than stepping between whole minutes.
  const idx = result.timeline.findIndex((f) => f.minute >= minute);
  if (idx <= 0) return { now: moving(0), peak };
  const a = result.timeline[idx - 1];
  const b = result.timeline[idx];
  const span = b.minute - a.minute || 1;
  const k = (minute - a.minute) / span;
  return { now: moving(idx - 1) * (1 - k) + moving(idx) * k, peak };
}

function FlowLayerImpl({ world, network, result, bbox, t, playMinute, playing }: Props) {
  // Routing is the expensive part and depends only on the graph, so it is keyed
  // on the network's own hash of the pieces — a pan or a zoom must not re-route.
  const ribbons = useMemo(
    () => (network ? buildRibbons(world, network, result) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network?.hash, network, world, result],
  );

  if (ribbons.length === 0) return null;

  const maxDep = Math.max(...ribbons.map((r) => r.departures), 1);
  const { now, peak } = motionAt(result, playMinute);
  const intensity = Math.min(now / peak, 1);

  return (
    <g data-slot="flows" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {ribbons.map((rib) => {
        const d = rib.points
          .map((p, i) => {
            const s = worldToScreen(t, p, bbox);
            return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`;
          })
          .join(' ');
        // Width carries the share, with a floor so a small anchor is still a
        // ribbon and not a hairline.
        const w = (3 + (rib.departures / maxDep) * 13) * (rib.rank === 0 ? 1 : 0.5);
        const color = MODE_COLOR[rib.mode];

        return (
          <g key={`${rib.id}-${rib.mode}`}>
            {/* the corridor itself — always visible, so the route reads even
                when nothing is playing */}
            <path d={d} stroke={color} strokeWidth={w} strokeOpacity={0.2} />
            <path
              d={d}
              stroke={color}
              strokeWidth={w}
              strokeOpacity={0.18 + intensity * 0.5}
              strokeDasharray={`${w * 0.9} ${w * 2.2}`}
              className={playing ? 'plan-flow-move' : undefined}
              style={
                {
                  // The loop travels exactly one dash period, so it closes
                  // seamlessly; the period differs per ribbon because the width
                  // does. Duration is the route's own travel time, scaled — a
                  // longer corridor moves for longer.
                  '--plan-dash': `${(w * 3.1).toFixed(2)}px`,
                  animationDuration: `${Math.max(rib.minutes / 14, 0.9).toFixed(2)}s`,
                } as React.CSSProperties
              }
            />
          </g>
        );
      })}
    </g>
  );
}

export const FlowLayer = memo(FlowLayerImpl);
