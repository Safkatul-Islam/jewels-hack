// components/gesture/trash.ts — P4
//
// Where a held piece goes to be deleted, in canvas pixels.
//
// Mirrors the palette on the opposite edge on purpose: pieces are pulled from
// the left and thrown away to the right. That symmetry is the whole
// explanation of the gesture — nobody has to be told twice — and it is why the
// bin is a fixed zone on the canvas rather than, say, a shake or a fist, which
// would be a second hand shape to learn and much easier to fire by accident.
//
// Pure and shared by the renderer and the hit test, for the same reason
// palette.ts is: a target drawn in one place and tested in another drifts, and
// with only a faint dot for a cursor nobody can see that it has.

import { GAP, INSET_X, SLOT } from '@/components/gesture/palette';
import type { Vec2 } from '@/lib/sim/types';

/** Zone size in canvas px. Bigger than a palette swatch: it is one target, and
 *  throwing something away is a gesture you make with your whole arm. */
export const TRASH_W = 52;
export const TRASH_H = 96;
/** Distance from the canvas's right edge. Matches the palette's left inset. */
export const TRASH_INSET_X = 16;

/** How far right the palette's own hit zone reaches (palette.ts is open to the left). */
const PALETTE_RIGHT_EDGE = INSET_X + SLOT + 14;

/**
 * Narrower than this and the bin's left-open zone would reach into the
 * palette's right-open one. Since the palette is tested on pinch-down and the
 * bin on release, that overlap would let a single pinch create a facility and
 * delete it again without the hand moving at all — so below this width there
 * is simply no bin, and deleting stays on the mouse and the Delete key.
 */
export const MIN_WIDTH_FOR_TRASH = PALETTE_RIGHT_EDGE + GAP + TRASH_W + TRASH_INSET_X + 14;

export interface TrashZone {
  /** Centre, in canvas px. */
  centre: Vec2;
  /** Left edge of the active region — see `isOverTrash`. */
  minX: number;
  /** False when the canvas is too narrow to carry a bin at all. */
  active: boolean;
}

export function trashZone(width: number, height: number): TrashZone {
  const centre = {
    x: width - TRASH_INSET_X - TRASH_W / 2,
    y: height / 2,
  };

  return {
    centre,
    minX: Math.max(centre.x - TRASH_W / 2 - 14, PALETTE_RIGHT_EDGE + 1),
    active: width >= MIN_WIDTH_FOR_TRASH,
  };
}

/**
 * Is the hand over the bin?
 *
 * Open to the RIGHT, the mirror of the palette being open to the left, and for
 * exactly the same reason: reaching for an edge is the motion that carries a
 * hand out of the active region, where cursor.ts clamps the pointer against
 * the canvas edge. A tolerance centred on the zone would miss the fullest,
 * most committed version of the throw — which is the one a user makes when
 * they really mean to delete something.
 */
export function isOverTrash(point: Vec2, zone: TrashZone): boolean {
  if (!zone.active) return false;
  const withinX = point.x >= zone.minX;
  const withinY = Math.abs(point.y - zone.centre.y) <= TRASH_H / 2;
  return withinX && withinY;
}
