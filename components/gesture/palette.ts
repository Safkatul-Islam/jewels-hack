// components/gesture/palette.ts — P4
//
// Where the hand-reachable palette sits on the canvas, in canvas pixels.
//
// Pure, and shared by the renderer and the hit test on purpose. A palette whose
// drawn position and whose grab target are computed in two places drifts the
// moment either is touched, and with a faint cursor the user cannot see that
// they are aiming at a slot two pixels above the one that lights up.
//
// WHY A SECOND PALETTE AT ALL. The real one (PiecePalette) lives in the page's
// left rail, outside the canvas, and the gesture pointer is mapped to canvas
// space only — so with hands alone you could move pieces but never add one,
// which left the mode unable to build a plan from nothing. Extending the
// pointer across the whole page is the other answer, and it is worse: it makes
// every hand movement a potential click on any control on the page.

import { PALETTE_ORDER } from '@/lib/pieces';
import type { PieceKind } from '@/lib/sim/types';
import type { Vec2 } from '@/lib/sim/types';

/** Swatch edge, in canvas px. Generous: it is a target for a hand, not a mouse. */
export const SLOT = 34;
/** Gap between swatches. Wide enough that the pick is unambiguous at hand jitter. */
export const GAP = 8;
/** Distance from the canvas's left edge. */
export const INSET_X = 16;

export interface PaletteSlot {
  kind: PieceKind;
  /** Centre, in canvas px. */
  centre: Vec2;
}

/**
 * The strip, vertically centred on the canvas.
 *
 * Centred rather than pinned to the top because the canvas's top-left already
 * carries the gesture legend and its bottom-left the camera preview; the middle
 * of the left edge is the one part of that side nothing else wants.
 */
export function gesturePaletteSlots(height: number): PaletteSlot[] {
  const pitch = SLOT + GAP;
  const total = PALETTE_ORDER.length * pitch - GAP;
  const top = Math.max((height - total) / 2, GAP);

  return PALETTE_ORDER.map((kind, i) => ({
    kind,
    centre: { x: INSET_X + SLOT / 2, y: top + i * pitch + SLOT / 2 },
  }));
}

/**
 * Which slot a hand is over, or null.
 *
 * Tight vertically, because the slots are stacked and bleeding into the
 * neighbour above would hand you the wrong facility — which you would only
 * discover once it was already on the map.
 *
 * Open to the LEFT, which is the part that is easy to get wrong. The strip
 * hugs the canvas edge, and reaching for it is exactly the motion that carries
 * a hand out of the active region — where the pointer stops dead at x = 0
 * (cursor.ts clamps rather than letting it run off). A symmetric tolerance
 * around the swatch therefore misses the one gesture the strip exists for, and
 * with nothing drawn but a faint dot the user gets no hint why. Everything to
 * the left of a swatch's right edge counts as that swatch.
 */
export function pickPaletteSlot(point: Vec2, slots: readonly PaletteSlot[]): PieceKind | null {
  for (const slot of slots) {
    const withinX = point.x <= slot.centre.x + SLOT / 2 + 14;
    const withinY = Math.abs(point.y - slot.centre.y) <= SLOT / 2;
    if (withinX && withinY) return slot.kind;
  }
  return null;
}
