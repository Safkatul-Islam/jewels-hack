// lib/vision/pinch.ts — P4
//
// The clutch. Pinch is what makes hand control usable at all: without an
// explicit grab-and-release the cursor is always "down" and every hand movement
// edits the plan. With it, the gesture is structurally identical to a mouse —
// down, move, up — which is why PieceLayer's rules survive unchanged and the
// simulation still runs once on release (AGENTS.md §2.7).

import { type Landmark, indexExtended, isFist, pinchRatio } from '@/lib/vision/landmarks';

/**
 * Two thresholds, not one. A single threshold sits exactly where the noise is
 * and the hand chatters across it several times a second, which looks like the
 * building being grabbed and dropped repeatedly. Closing the pinch has to be
 * deliberate; opening it has to be unambiguous.
 */
export const PINCH_ON = 0.38;
export const PINCH_OFF = 0.58;

/** How long a fist must be held before it counts as a reset, in ms. */
export const FIST_HOLD_MS = 350;

/** The same shape a pointer gesture has, which is the whole point. */
export type PinchPhase = 'none' | 'down' | 'held' | 'up';

export interface PinchState {
  phase: PinchPhase;
  /** Raw ratio, for the UI ring. 0 = tips touching. */
  ratio: number;
}

/**
 * Per-hand pinch tracking. One instance per hand, reused across frames.
 *
 * `update` is called once per frame per hand and returns the phase for THAT
 * frame: 'down' and 'up' fire exactly once each, so a caller can treat them as
 * pointerdown/pointerup without deduplicating.
 */
export class PinchTracker {
  private closed = false;

  update(lm: Landmark[] | null, aspect: number): PinchState {
    // A hand that left the frame releases. Holding the grab would leave a
    // building stuck to a hand that is no longer there, and the only way out
    // would be to put the hand back — a trap, not a feature.
    if (!lm) {
      const phase: PinchPhase = this.closed ? 'up' : 'none';
      this.closed = false;
      return { phase, ratio: 1 };
    }

    const ratio = pinchRatio(lm, aspect);

    // The index has to be out in front. Otherwise a fist reads as a pinch —
    // thumb and index tips are touching in a fist too — and the reset gesture
    // would grab whatever is under the cursor on its way through.
    const closing = ratio < PINCH_ON && indexExtended(lm, aspect) && !isFist(lm, aspect);
    const opening = ratio > PINCH_OFF;

    if (!this.closed && closing) {
      this.closed = true;
      return { phase: 'down', ratio };
    }
    if (this.closed && opening) {
      this.closed = false;
      return { phase: 'up', ratio };
    }
    return { phase: this.closed ? 'held' : 'none', ratio };
  }

  /** True while the pinch is closed, for callers that need the level not the edge. */
  get isClosed(): boolean {
    return this.closed;
  }

  cancel(): void {
    this.closed = false;
  }
}

/**
 * Fist-hold detection, latched. Fires once when the fist has been held long
 * enough and will not fire again until the hand opens — otherwise a held fist
 * would re-fire every frame and the cursor would be pinned to the hand.
 */
export class FistHoldTracker {
  private heldMs = 0;
  private fired = false;

  /** Returns true on the single frame the hold completes. `dtMs` since last frame. */
  update(lm: Landmark[] | null, aspect: number, dtMs: number): boolean {
    if (!lm || !isFist(lm, aspect)) {
      this.heldMs = 0;
      this.fired = false;
      return false;
    }
    this.heldMs += dtMs;
    if (this.heldMs >= FIST_HOLD_MS && !this.fired) {
      this.fired = true;
      return true;
    }
    return false;
  }

  /** 0 → 1 progress, for the UI to show the hold filling. */
  get progress(): number {
    return Math.min(this.heldMs / FIST_HOLD_MS, 1);
  }
}
