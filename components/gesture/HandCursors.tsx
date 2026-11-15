'use client';

// components/gesture/HandCursors.tsx — P4
//
// A faint dot per hand. Deliberately faint: the thing you are meant to read is
// the piece lighting up under your hand (HoverHighlight), and a bright cursor
// competes with it for attention while adding nothing — you already know you
// moved your hand. What the dot is for is the case the highlight cannot cover:
// when nothing is near enough to highlight, an invisible pointer leaves you
// waving at a map with no idea whether you are off by ten pixels or six inches.
//
// So: present enough to locate, quiet enough to ignore. It does not change what
// picking does — that is still nearest-within-slop (pick.ts), because a 12 %
// opacity dot does not make a hand any more precise than it was.
//
// NO REACT STATE HERE. The dots move every frame, and a setState per frame
// would re-render the canvas at 60 fps. The frame loop writes the transform
// straight onto the DOM node, so this component renders exactly once.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Vec2 } from '@/lib/sim/types';
import type { HandSide } from '@/components/gesture/useHandTracking';

export interface HandCursorsHandle {
  update: (pts: Map<HandSide, { p: Vec2; phase: string; visible: boolean }>) => void;
}

/**
 * Resting opacity. Quiet, but it has to survive the basemap: the blocks are a
 * fine grey texture, and a grey dot below about 0.18 disappears into it — which
 * defeats the one thing the dot is for. The halo in `Dot` is what buys the
 * rest; raising this further would be solving it the expensive way.
 */
const IDLE_OPACITY = 0.2;
/** Pinched. Still quiet — the held piece's ring is what announces a grab. */
const PINCHED_OPACITY = 0.4;

export const HandCursors = forwardRef<HandCursorsHandle>(
  function HandCursors(_props, ref) {
    const left = useRef<SVGGElement>(null);
    const right = useRef<SVGGElement>(null);

    useImperativeHandle(ref, () => ({
      update(pts) {
        for (const side of ['left', 'right'] as const) {
          const node = side === 'left' ? left.current : right.current;
          if (!node) continue;

          const hand = pts.get(side);
          if (!hand || !hand.visible) {
            node.setAttribute('opacity', '0');
            continue;
          }

          const pinched = hand.phase === 'down' || hand.phase === 'held';
          // Shrinking on pinch mirrors the fingers closing, so the clutch is
          // legible from the dot alone when there is nothing under it to light up.
          const scale = pinched ? 0.68 : 1;
          node.setAttribute(
            'transform',
            `translate(${hand.p.x.toFixed(1)} ${hand.p.y.toFixed(1)}) scale(${scale})`,
          );
          node.setAttribute('opacity', String(pinched ? PINCHED_OPACITY : IDLE_OPACITY));
        }
      },
    }));

    return (
      <g data-slot="hand-cursors" className="pointer-events-none">
        <Dot ref={left} />
        <Dot ref={right} />
      </g>
    );
  },
);

/**
 * A filled core inside a ring, with a paper-coloured halo behind both.
 *
 * The halo is the part that matters. The basemap is a fine grey texture, so a
 * grey dot on it is a grey dot in a field of grey dots, and raising the opacity
 * until it wins is how you end up with a cursor that competes with the
 * highlight. A ring of background colour underneath separates it locally
 * instead, which costs no prominence at all — it is the same trick the piece
 * labels in HoverHighlight use to stay legible over the blocks.
 *
 * Starts at opacity 0 so nothing shows before the first frame, or after the
 * camera stops.
 */
const Dot = forwardRef<SVGGElement>(function Dot(_props, ref) {
  return (
    <g ref={ref} opacity="0">
      <circle r="11" fill="none" stroke="var(--paper)" strokeWidth="4" />
      <circle r="11" className="fill-foreground" opacity="0.3" />
      <circle r="11" className="stroke-foreground" fill="none" strokeWidth="1.5" />
      <circle r="3" className="fill-foreground" />
    </g>
  );
});
