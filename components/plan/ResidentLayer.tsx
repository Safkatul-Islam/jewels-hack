'use client';

// components/plan/ResidentLayer.tsx — P1
//
// The people the plan costs, drawn as the houses they live in.
//
// A residential block is a census fact, not an object on the map — nobody
// drags a neighbourhood to improve an egress score — so these are not
// draggable and, on an untouched plan, are not drawn at all.
//
// The background is blank. A block appears only once the plan has made getting
// home measurably worse, and the colour is how much worse. Close the wrong
// street and the people behind it surface; leave them alone and you never see
// them. That is the product's whole argument, on the canvas, in the place the
// argument is about.

import { memo } from 'react';
import type { BBox, ResidentialBlock, Vec2 } from '@/lib/sim/types';
import { type Transform, worldTransformString } from '@/lib/transform';

interface Props {
  blocks: ResidentialBlock[];
  /** block id → minutes added to the drive out, versus a plan with no pieces */
  delayByBlock: Record<string, number>;
  bbox: BBox;
  t: Transform;
}

/** Minutes of added delay at which the colour saturates. Three, because that
 *  is already a serious imposition on every trip in and out of your own
 *  street, and because the delays this engine produces for a single closure
 *  sit in the low single digits — saturating at half an hour would make the
 *  layer technically correct and completely invisible. */
const SATURATE_MIN = 3;

function ResidentLayerImpl({ blocks, delayByBlock, bbox, t }: Props) {
  // Only the blocks this plan actually costs. On a blank forecourt there is no
  // city to tint, so an unaffected block draws nothing at all — which is also
  // the honest reading: until you close something, you have not touched them.
  const hurtBlocks = blocks.filter((b) => (delayByBlock[b.id] ?? 0) / SATURATE_MIN >= 0.02);
  if (hurtBlocks.length === 0) return null;

  return (
    <g data-slot="residents" transform={worldTransformString(t, bbox)}>
      {hurtBlocks.map((b) => {
        const k = Math.max(0, Math.min((delayByBlock[b.id] ?? 0) / SATURATE_MIN, 1));
        const d =
          'M' + b.polygon.map((p: Vec2) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') + 'Z';
        // Full `--worse` at saturation, not a wash of it: on a near-black
        // ground under a translucent heat field, a tasteful tint arrives as
        // "slightly less dark" and says nothing.
        const fill = `color-mix(in oklab, var(--worse) ${Math.round(20 + k * 80)}%, transparent)`;
        return (
          <g key={b.id}>
            {/* A halo, so a hurt block is findable without hunting. */}
            {k > 0.25 && (
              <path
                d={d}
                fill="none"
                stroke="var(--worse)"
                strokeOpacity={0.3 + k * 0.4}
                strokeWidth={9}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={d}
              fill={fill}
              stroke="var(--worse)"
              strokeOpacity={0.9}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
}

export const ResidentLayer = memo(ResidentLayerImpl);
