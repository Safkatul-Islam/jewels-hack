'use client';

// components/gesture/GesturePalette.tsx — P4
//
// The hand-reachable palette: reach left, pinch a swatch, pull a new facility
// onto the map. It only exists while hand tracking is live, because with a
// mouse the real palette in the page's left rail is better in every way.
//
// Swatches carry colour and nothing else until you hover one, and then it says
// its name. The piece colours are the one thing that identifies a kind on this
// canvas (PiecePalette makes the same point), so colour alone is a real
// affordance here — but only to someone who already knows the mapping, which a
// first-time user does not. The hover label is for them, and it costs nothing
// the rest of the time.

import { PIECE_META } from '@/lib/pieces';
import type { PieceKind } from '@/lib/sim/types';
import { SLOT, gesturePaletteSlots } from '@/components/gesture/palette';

interface Props {
  /** Canvas height in px — the strip centres itself against it. */
  height: number;
  /** The kind a hand is currently over, if any. */
  hoveredKind: PieceKind | null;
}

export function GesturePalette({ height, hoveredKind }: Props) {
  const slots = gesturePaletteSlots(height);
  const half = SLOT / 2;

  return (
    <g data-slot="gesture-palette" className="pointer-events-none">
      {slots.map(({ kind, centre }) => {
        const meta = PIECE_META[kind];
        const over = hoveredKind === kind;

        return (
          <g key={kind} transform={`translate(${centre.x} ${centre.y})`}>
            {/* A backing plate, so a swatch stays readable over roads and
                blocks rather than only over blank ground. */}
            <rect
              x={-half}
              y={-half}
              width={SLOT}
              height={SLOT}
              rx={4}
              fill="var(--paper)"
              opacity={0.82}
            />
            <rect
              x={-half}
              y={-half}
              width={SLOT}
              height={SLOT}
              rx={4}
              fill={meta.color}
              opacity={over ? 0.55 : 0.3}
            />
            <rect
              x={-half}
              y={-half}
              width={SLOT}
              height={SLOT}
              rx={4}
              fill="none"
              stroke={meta.color}
              strokeWidth={over ? 2.5 : 1.25}
              opacity={over ? 1 : 0.6}
            />

            {over && (
              <>
                {/* Grows out of the swatch rather than floating beside it, so
                    there is never any doubt which one is about to be taken. */}
                <rect
                  x={half + 6}
                  y={-11}
                  width={meta.label.length * 6.1 + 14}
                  height={22}
                  rx={3}
                  fill="var(--paper)"
                  stroke={meta.color}
                  strokeWidth={1}
                  opacity={0.95}
                />
                <text
                  x={half + 13}
                  y={4}
                  className="fill-foreground text-[11px] font-medium"
                >
                  {meta.label}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
