# Gesture mode — P4's playbook

`/gesture` is the plan canvas driven by two hands in front of a webcam. It replaces the
ArUco table (`04-TABLE-MODE.md`), which needs a printer we do not have.

It keeps what the table mode was for — moving the infrastructure with your hands, in front
of an audience, with no mouse between you and the plan — and drops what the table mode
needed: printed markers, a calibration pair, controlled overhead lighting, and a camera
mounted above a surface. A laptop and its built-in webcam are the whole rig.

`/plan` is untouched. Nothing in `components/gesture/` or `lib/vision/` is imported by it.

## Running it

```bash
npm run dev
```

`predev` fetches the MediaPipe runtime into `public/vision/` (~30 MB of wasm, a 7.5 MB
model) and no-ops once it is there. The files are gitignored, so a fresh clone does this
once. To do it by hand: `npm run vision:assets`.

Then open **`http://localhost:3000/gesture`** and press *Start hands*.

> `getUserMedia` needs a secure context. `localhost` qualifies, a LAN IP does not.
> **Demo from localhost.** This is the same constraint the table mode had.

The runtime is served from `public/`, not a CDN, on purpose: conference wifi is the single
most likely thing to break a live demo, and a 15 MB wasm fetch over it is the worst moment
to discover that.

## The gestures

| Gesture | What it does |
|---|---|
| Move a hand | A faint dot follows it, and the piece you would grab highlights. |
| Pinch (thumb to index) | Picks up the highlighted piece. Release drops it — and that is the one moment the simulation runs. |
| Pinch with the other hand while holding | Rotates the held piece. The angle between your hands is its bearing. Snaps to 15°. |
| Pinch empty space | Pans. Both hands, pull apart → zoom. |
| Hold a fist (~350 ms) | Recentres: wherever your hands are now becomes the middle of the canvas. |

### Why the cursor is barely there

Feedback lives on the target, not at the hand: the piece under your hand lights up with a
ring, corner ticks and its name. That is what you read.

The dot at the hand is deliberately faint — 14 % opacity at rest, 34 % while pinching —
because it has exactly one job: telling you where your hand is when nothing is near enough
to highlight. Without it you are waving at a map with no idea whether you are off by ten
pixels or six inches. Drawn any stronger it competes with the highlight for attention
while adding nothing, since you already know you moved your hand.

Where your hands are *relative to the reachable area* is a different question, and the
camera preview in the bottom-left answers it: the hand skeleton inside a dashed box showing
the slice of the frame that maps to the canvas. That is the one to look at when the
recentre gesture is what you need.

None of this changes what picking does. It is **nearest-within-44px**, not containment
(`lib/vision/pick.ts`): a dot that faint is not something you can aim precisely, and a user
three pixels off a small facility would have no way to find out why nothing happened.

## The four things that make or break it

Each of these is the difference between "magic" and "broken". They are all in `lib/vision/`.

1. **Everything is a ratio against palm span** (`landmarks.ts`). Never a pixel distance. A
   raw thumb-to-index threshold works at one distance from the camera and fails at every
   other, because the hand gets bigger as it approaches. Distances are also
   aspect-corrected — normalised landmark space is anisotropic on a 16:9 frame.
2. **Two pinch thresholds, not one** (`pinch.ts`, `PINCH_ON` 0.38 / `PINCH_OFF` 0.58). A
   single threshold sits where the noise is, and the hand crosses it several times a second
   — which reads as the building being grabbed and dropped repeatedly.
3. **A pinch is not a fist.** In a fist the thumb and index tips are touching *too*, so the
   pinch ratio alone cannot tell them apart. The discriminator is fingertip-to-wrist
   distance: a pinch happens out in front with the index extended, a fist against the palm.
   Without this the reset gesture grabs whatever it passes over.
4. **One Euro filter** (`smooth.ts`). Raw landmarks jitter a few pixels per frame, which at
   canvas scale is tens of world metres. A rolling average long enough to kill it adds
   enough lag to make dragging feel like syrup; One Euro smooths when the hand is still and
   gets out of the way when it moves. `minCutoff` fixes the stillness, `beta` fixes the
   lag — change one at a time, and test at rest *and* on a fast sweep.

## Tuning

| Knob | Where | Raise it to… |
|---|---|---|
| `PINCH_ON` / `PINCH_OFF` | `lib/vision/pinch.ts` | …make grabbing easier / releasing stickier |
| `FIST_HOLD_MS` | `lib/vision/pinch.ts` | …make an accidental reset less likely |
| `ACTIVE_HALF_W/H` | `lib/vision/cursor.ts` | …trade precision for reach |
| `CURSOR_FILTER` | `lib/vision/smooth.ts` | …trade lag for steadiness |
| `PICK_SLOP_PX` | `lib/vision/pick.ts` | …make small pieces easier to catch |

A scratch harness that feeds synthetic hand poses through the classifier is the fastest way
to check a change without waving at a laptop; the discriminator and the hysteresis are both
testable with no camera at all.

## Known limits — say these out loud rather than being caught by them

- **Depth is unusable.** MediaPipe's `z` is relative to the hand and noisy. Nothing here
  depends on it, and nothing new should: pinch is the clutch. No "push forward to select".
- **It is not mouse-precise.** After smoothing there is still a little jitter, which is why
  grid snapping stays on and rotation snaps to 15°. Do not add a gesture that needs to hit
  a 12 px target.
- **Arms get tired.** Fine for a three-minute demo, not for an afternoon of planning. This
  is a demo mode; the mouse remains the primary path and still works on this page.
- **One piece at a time.** Each hand can hold its own piece, but the world furniture
  (businesses, residential blocks) is mouse-only for now.
- **Lighting still matters**, much less than it did for ArUco. Diffuse light, hands clearly
  separated from what is behind them.

## If it misbehaves

| Symptom | Cause |
|---|---|
| "Could not load the MediaPipe runtime" | `npm run vision:assets` was never run. |
| Camera permission denied | Grant it for `localhost`. macOS also gates it per browser in System Settings → Privacy & Security → Camera. |
| Nothing highlights | Hands outside the active region — hold a fist to recentre, and watch the dashed box in the preview. |
| Pieces grabbed and dropped repeatedly | The hysteresis band is too narrow for your lighting. Widen `PINCH_OFF`. |
| Left and right swapped | Something upstream started mirroring the frame before the detector. The detector must get the raw frame; mirroring belongs in `cursor.ts`. |
| Cursor drifts to one side over time | That is the arm drifting, not a bug. Hold a fist. |
