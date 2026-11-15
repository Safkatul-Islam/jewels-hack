# Playing-card detection and enrollment

Branch `p4-playing-cards`, worktree `jewel-city-hacks-cards`. Owner: P4 (Claude session).
Code lives only in `lib/vision/cards/`. Nothing here is wired into `/table` yet; Codex owns
that integration. Written 2026-11-14.

## Status

**Works on synthetic scenes only.** Eight focused test groups pass. No photograph of a real
playing card, no camera frame and no venue lighting has been processed. Treat every
threshold below as a starting point to be re-measured on the real cards.

```text
npx tsx --test lib/vision/cards/cards.test.ts
```

There is no package script for this yet; `package.json` belongs to P1 and was not edited.

## What it does

1. **Quadrilaterals** (`quads.ts`): greyscale, Otsu threshold, outer contours, polygon
   approximation, then filters for four convex corners, area and a card-like aspect ratio.
   Corners are refined by fitting a line to the straight middle of each side and
   intersecting neighbours, which undoes the rounded corners. Quads nested inside a
   larger quad are dropped (a pale panel printed on a face is itself card-shaped).
2. **Perspective normalization** (`appearance.ts`): each quad is resampled through a
   projective map to 64 x 64 and average-pooled to a 32 x 32 grid of brightness plus a
   32 x 32 grid of red excess `max(0, R - (G + B) / 2)`. Channel means are removed and the
   vector is scaled to unit length, so uniform brightness and gain changes cancel.
3. **Matching** (`recognize.ts`): cosine similarity against each enrolled appearance, both
   as seen and turned 180 degrees. The better of the two is that card's score.
4. **Rejection**: a reading keeps its corners but gets `identity: null` when the best score
   is too low, when two enrolled cards are too close, or when a stronger reading in the
   same frame already holds that identity. The nearest card is never assigned by default.

## Proposed interface

```ts
import type { CvApi, Frame, EnrolledCard, CardReading } from '@/lib/vision/cards/types';

enrollCard(cv: CvApi, frame: Frame, id: string, options?: QuadOptions): EnrolledCard;
recognizeCards(cv: CvApi, frame: Frame, enrolled: readonly EnrolledCard[],
               options?: MatchOptions): CardReading[];
detectCardQuads(cv: CvApi, frame: Frame, options?: QuadOptions): CardQuad[];

interface CardReading {
  corners: readonly [Vec2, Vec2, Vec2, Vec2]; // image pixels
  identity: string | null;                    // enrolled id, or null when rejected
  score: number;                              // cosine similarity, not a probability
  runnerUpScore: number;
  headingAmbiguous: boolean;
  rejection: 'low_score' | 'ambiguous_identity' | 'duplicate_identity' | null;
}
```

- `Frame` is `{ width, height, data }` with RGBA bytes; a browser `ImageData` fits.
- `cv` is injected, like the ArUco detector, so the modules stay pure and testable:
  `const { CV } = await import('js-aruco2/src/cv.js')`. That deep import has no type
  declaration; the test casts it to `CvApi`. Adding a declaration to the existing
  `lib/vision/js-aruco2.d.ts` is Codex's call.
- **Corners** run clockwise on screen (image Y down) in the card's own order: top-left,
  top-right, bottom-right, bottom-left. This is the `PixelMarker` convention, so the
  existing heading formula in `lib/vision/aruco.ts` applies unchanged to `corners[0]` and
  `corners[1]`. "Top" is whatever was up in the image when the card was enrolled.
- **180-degree symmetry**: when `headingAmbiguous` is true the outline is still correct
  but `corners` may be turned by 180 degrees, so the heading is known only modulo pi.
  It is always true for rejected readings.
- `EnrolledCard.feature` is a plain `Float32Array` of 2048 values and can be kept in
  memory or serialized. A length mismatch throws and asks for re-enrollment.
- Enrollment requires **exactly one** card in the frame and throws otherwise, including
  for a blank or face-down plain card.

Defaults (`MATCH_DEFAULTS`, `QUAD_DEFAULTS`): `minScore` 0.8, `minIdentityMargin` 0.06,
`minHeadingMargin` 0.05, area 0.2%-50% of the frame, aspect 1.15-1.8 (a poker card is 1.4).

## Evidence (synthetic)

Drawn card-like faces (`testScene.ts`), cards 45-110 px wide in a 640 x 360 frame, turned
through arbitrary angles, top edge narrowed by up to 20%, brightness ramp 0.75-1.1 across
the frame, uniform noise up to 20 grey levels peak to peak.

| Comparison | Similarity |
| --- | --- |
| Same card, any tested condition | 0.98-1.00 |
| Point-symmetric card, upright vs turned 180 degrees | equal (0.98-0.99 both) |
| Seven-like face (one pip off-centre), wrong way round | 0.84 |
| Court-like face, wrong way round | 0.41-0.42 |
| Different rank and colour | 0.04-0.52 |
| Four vs five of the same colour (one pip apart) | 0.88-0.89 |

Detected corners were within 2.5 px of the drawn corners. One 1280 x 720 frame with three
cards took about 11 ms in Node on the development laptop; that is one measurement, not a
browser or frame-rate guarantee.

Two problems found by measurement and fixed before these numbers:
- A pale card-proportioned panel on a face was returned as a second card.
- `CV.warp` in js-aruco2 samples one pixel off-centre. Reusing it cost up to 0.17 of score
  for a card turned 180 degrees, so `appearance.ts` has its own centred sampler.

## Limitations and unverified claims

- **Real cards are untested.** Glare on glossy cards, blur, lens distortion, shadows and
  camera white balance are not modelled. Expect lower same-card scores than above.
- **A near-twin that is not enrolled can pass.** With only the five enrolled, the
  unenrolled four scores 0.88-0.89, above the default `minScore` of 0.8. Either enroll
  every card that can appear on the table, choose visually distinct cards (different
  colour and pip count, or court cards), or raise `minScore` once real scores are known.
- **Most pip cards are point-symmetric**, so their heading is ambiguous by design. A card
  whose rotation matters should be asymmetric (many 3/5/6/7/8/9 pip layouts, court
  cards with care, or any card with a marked corner). Which real cards qualify is unverified.
- **Contrast is required.** Cards must be clearly brighter than the surface. A white or
  pale table, or a card touching another card, a marker sheet or the frame edge, will
  not produce a card outline. Two cards laid exactly side by side can form one
  card-shaped outline; it should fail matching, but that is not tested.
- A single global Otsu threshold is used. Strong shadows or a very bright non-card region
  can move it; `threshold` can be passed explicitly.
- Card backs are not handled. A patterned back would simply be an unenrolled appearance.
- Similarity is not a calibrated probability, and the thresholds are heuristics.

## Research

| Question | Source | Finding and decision |
| --- | --- | --- |
| Is there CV code to reuse without a new dependency? | Installed `node_modules/js-aruco2/src/cv.js`, v2.0.0 (MIT), read 2026-11-14; https://github.com/damianofalcioni/js-aruco2 | `grayscale`, `otsu`, `threshold`, `findContours`, `approxPolyDP`, `isContourConvex` are reused. No dependency added. |
| How is CV exported? | Same file and `src/aruco.js` | CommonJS, assigned as `this.CV`; reachable as `js-aruco2/src/cv.js`. The package has no `exports` map, so the deep path resolves. Bundling that path with Turbopack is **not yet verified**. |
| Can `CV.warp` normalize a card? | Same file, and measured | It maps to a square and samples off-centre; replaced by a small centred sampler. |

No external recognition service, model or network call is used. No camera was opened.

## Before application integration

1. **Real images first.** A few still photos of the three chosen cards on the actual
   table (alone for enrollment, then together at different turns) would let the scores
   and thresholds above be re-measured without opening a camera.
2. Codex decides how readings enter the planner: which enrolled id maps to which
   `PieceKind`, how a card's centre and heading become a `MarkerReading`, and what the
   tracker does with `headingAmbiguous` and rejected readings.
3. Enrollment needs a UI step ("show one card, name it") and a decision on whether
   enrolled appearances persist across reloads.
4. Verify the `js-aruco2/src/cv.js` import in the Next.js build and measure per-frame
   cost in the browser alongside ArUco detection.
