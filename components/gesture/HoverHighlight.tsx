'use client';

// components/gesture/HoverHighlight.tsx — P4
//
// This layer is the real cursor. There IS a dot at the hand (HandCursors), but
// it is deliberately faint and says only "your hand is here" — what tells you
// that a hand is pointing at something is that the thing itself lights up. That
// makes this component load-bearing rather than decorative, and it sets the
// requirements:
//
//   - It must be unmistakable at a glance, from across a room, while someone
//     is waving their arms around. Hence a full ring plus corner ticks plus the
//     facility's name, not a subtle tint.
//   - It must read differently for "the hand is over this" and "the hand has
//     hold of this", because without that distinction a user cannot tell
//     whether their pinch registered.
//   - It must never eat a pointer event: the mouse still works on this page and
//     this layer sits on top of the pieces.

import { PIECE_META } from '@/lib/pieces';
import type { BBox, Piece } from '@/lib/sim/types';
import { footprintFor } from '@/components/plan/facilityGeometry';
import { type Transform, metresToPx, worldToScreen } from '@/lib/transform';

interface Props {
  pieces: Piece[];
  bbox: BBox;
  t: Transform;
  /** Piece ids a hand is hovering but has not grabbed. */
  hovered: readonly string[];
  /** Piece ids a hand currently has pinched. */
  grabbed: readonly string[];
}

export function HoverHighlight({ pieces, bbox, t, hovered, grabbed }: Props) {
  const marks = pieces
    .map((piece) => {
      const held = grabbed.includes(piece.id);
      const over = !held && hovered.includes(piece.id);
      if (!held && !over) return null;
      return { piece, held };
    })
    .filter((m): m is { piece: Piece; held: boolean } => m !== null);

  if (marks.length === 0) return null;

  return (
    <g data-slot="hover-highlight" className="pointer-events-none">
      {marks.map(({ piece, held }) => {
        const centre = worldToScreen(t, piece.pos, bbox);
        const meta = PIECE_META[piece.kind];
        const sizePx = Math.max(metresToPx(t, footprintFor(piece.kind, piece.capacity)), 12);

        // The ring stands off the footprint so it never hides the facility
        // drawing underneath, and grows a little on grab so the transition from
        // hover to hold is visible as motion, not just colour.
        const half = sizePx / 2 + (held ? 16 : 11);

        return (
          <g key={piece.id} transform={`translate(${centre.x} ${centre.y})`}>
            {/* Halo. A wide, very transparent stroke reads as a glow at any
                zoom without needing an SVG filter, which would cost a texture
                upload every frame of a drag. */}
            <rect
              x={-half}
              y={-half}
              width={half * 2}
              height={half * 2}
              rx={8}
              fill="none"
              stroke={meta.color}
              strokeWidth={held ? 14 : 10}
              opacity={held ? 0.22 : 0.13}
            />

            <rect
              x={-half}
              y={-half}
              width={half * 2}
              height={half * 2}
              rx={8}
              fill="none"
              stroke={meta.color}
              strokeWidth={held ? 2.5 : 1.75}
              strokeDasharray={held ? '10 6' : undefined}
              opacity={held ? 1 : 0.85}
            >
              {/* A marching dash says "this is live and attached to your hand".
                  SMIL rather than JS: it costs no frames and stops with the
                  element. */}
              {held && (
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-32"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              )}
            </rect>

            <CornerTicks half={half} color={meta.color} strong={held} />

            {/* The name, so you know what you are about to move before you move
                it — the pieces are abstract shapes at corridor zoom. */}
            <text
              x={0}
              y={-half - 8}
              textAnchor="middle"
              className="fill-foreground text-[10px] font-medium"
              style={{
                paintOrder: 'stroke',
                stroke: 'var(--paper)',
                strokeWidth: 3,
                strokeLinejoin: 'round',
              }}
            >
              {held ? `Holding ${meta.label.toLowerCase()}` : meta.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Four corner brackets. They survive a busy basemap better than a plain ring. */
function CornerTicks({
  half,
  color,
  strong,
}: {
  half: number;
  color: string;
  strong: boolean;
}) {
  const len = Math.min(half * 0.45, strong ? 14 : 10);
  const w = strong ? 2.5 : 2;
  const corners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;

  return (
    <g stroke={color} strokeWidth={w} strokeLinecap="round" fill="none">
      {corners.map(([sx, sy]) => (
        <path
          key={`${sx}${sy}`}
          d={`M ${sx * half - sx * len} ${sy * half} L ${sx * half} ${sy * half} L ${sx * half} ${sy * half - sy * len}`}
        />
      ))}
    </g>
  );
}
