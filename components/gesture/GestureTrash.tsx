'use client';

// components/gesture/GestureTrash.tsx — P4
//
// The bin, drawn only while a hand is actually holding a piece.
//
// Permanently visible it would be an invitation; appearing the moment you pick
// something up, it is an answer to a question you have just asked. It also
// keeps the canvas clear the rest of the time, which matters on a plan you are
// supposed to be reading.
//
// Deleting is the one gesture here that cannot be undone by reversing it —
// drop a piece in the wrong place and you pick it up again, but a deleted
// facility is gone and the simulation has already moved on. So this is the one
// piece of gesture feedback that shouts: at the threshold it fills with the
// destructive colour and says what will happen, in words.

import { TRASH_H, TRASH_W, trashZone } from '@/components/gesture/trash';

interface Props {
  width: number;
  height: number;
  /** True while a hand holding a piece is inside the zone. */
  armed: boolean;
}

export function GestureTrash({ width, height, armed }: Props) {
  const { centre, active } = trashZone(width, height);
  const halfW = TRASH_W / 2;
  const halfH = TRASH_H / 2;

  // Too narrow for a bin that cannot be confused with the palette — drawing one
  // that the hit test will refuse is worse than drawing none.
  if (!active) return null;

  return (
    <g
      data-slot="gesture-trash"
      className="pointer-events-none"
      transform={`translate(${centre.x} ${centre.y})`}
    >
      <rect
        x={-halfW}
        y={-halfH}
        width={TRASH_W}
        height={TRASH_H}
        rx={6}
        fill="var(--paper)"
        opacity={0.82}
      />
      <rect
        x={-halfW}
        y={-halfH}
        width={TRASH_W}
        height={TRASH_H}
        rx={6}
        fill="var(--destructive)"
        opacity={armed ? 0.3 : 0.07}
      />
      <rect
        x={-halfW}
        y={-halfH}
        width={TRASH_W}
        height={TRASH_H}
        rx={6}
        fill="none"
        stroke="var(--destructive)"
        strokeWidth={armed ? 2.5 : 1.25}
        strokeDasharray={armed ? undefined : '5 4'}
        opacity={armed ? 1 : 0.5}
      />

      <BinIcon armed={armed} />

      {armed && (
        <text
          x={0}
          y={halfH - 10}
          textAnchor="middle"
          className="text-[9px] font-medium"
          fill="var(--destructive)"
          style={{
            paintOrder: 'stroke',
            stroke: 'var(--paper)',
            strokeWidth: 3,
            strokeLinejoin: 'round',
          }}
        >
          RELEASE
        </text>
      )}
    </g>
  );
}

/** A lid that lifts when armed — the one bit of motion worth spending here. */
function BinIcon({ armed }: { armed: boolean }) {
  const lidY = armed ? -22 : -16;
  return (
    <g
      stroke="var(--destructive)"
      strokeWidth={armed ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity={armed ? 1 : 0.65}
      transform="translate(0 -6)"
    >
      <path d={`M -11 ${lidY} H 11`} />
      <path d={`M -4 ${lidY - 4} H 4`} />
      <path d="M -9 -11 L -7 12 H 7 L 9 -11" />
      <path d="M -2 -5 V 7" />
      <path d="M 3 -5 V 7" />
    </g>
  );
}
