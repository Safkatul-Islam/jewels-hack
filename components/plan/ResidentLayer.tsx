'use client';

// components/plan/ResidentLayer.tsx — P1
//
// The people the plan costs, drawn as the houses they live in.
//
// There is no polygon here and that is the point. A residential block is a
// census fact, not an object on the map — nobody drags a neighbourhood to
// improve an egress score — so the old trapezoids were abstract shapes
// floating over a city that already contained the same information. The
// buildings lining those streets ARE the block. This layer takes the fabric
// parcels that fall inside each block (bucketed in basemapGeometry) and paints
// them by how much worse this plan made getting home.
//
// Until the plan hurts somebody, every one of these is drawn in the ordinary
// fabric colour, so the city looks untouched. Close the wrong street and the
// houses behind it light up. That is the product's whole argument, on the
// canvas, in the place where the argument is about.

import { memo } from 'react';
import type { BBox } from '@/lib/sim/types';
import { type Transform, worldTransformString } from '@/lib/transform';

interface Props {
  blockMass: { id: string; d: string }[];
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

function ResidentLayerImpl({ blockMass, delayByBlock, bbox, t }: Props) {
  if (blockMass.length === 0) return null;

  return (
    <g data-slot="residents" transform={worldTransformString(t, bbox)}>
      {blockMass.map((b) => {
        const delay = delayByBlock[b.id] ?? 0;
        const k = Math.max(0, Math.min(delay / SATURATE_MIN, 1));
        const hurt = k >= 0.02;
        // Full `--worse` at saturation, not a wash of it. These houses sit
        // under a translucent heat field on a near-black ground, so a tasteful
        // 88% tint arrives on screen as "slightly less dark" and says nothing.
        const fill = hurt
          ? `color-mix(in oklab, var(--worse) ${Math.round(20 + k * 80)}%, var(--fabric))`
          : 'var(--fabric)';
        return (
          <g key={b.id}>
            {/* A halo around the affected houses, so a hurt neighbourhood is
                findable when the whole district is in frame and each parcel is
                three pixels across. */}
            {k > 0.25 && (
              <path
                d={b.d}
                fill="none"
                stroke="var(--worse)"
                strokeOpacity={0.3 + k * 0.4}
                strokeWidth={9}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={b.d}
              fill={fill}
              stroke={hurt ? 'var(--worse)' : 'var(--fabric-edge)'}
              strokeOpacity={hurt ? 0.9 : 1}
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
