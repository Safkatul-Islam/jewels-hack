# Playing-card detection and enrollment

Branch `p4-playing-cards`, worktree `jewel-city-hacks-cards`. Owner: P4 (Claude session).
Code lives only in `lib/vision/cards/`. Nothing here is wired into `/table` yet; Codex owns
that integration. Last updated 2026-11-14.

## Status

- **Real still photos: works.** Nine phone photos of the owner's ace of spades, king of
  hearts and queen of clubs on the actual grey table were processed offline. All 21 card
  instances were outlined and identified with the default thresholds, and an un-enrolled
  card was rejected every time (details below).
- **Not verified:** a live camera, video frames, motion blur, the webcam or phone bridge,
  other cards, other tables or lighting, and running inside the browser build.
- Nine synthetic test groups and three real-photo test groups pass.

```text
npx tsx --test lib/vision/cards/cards.test.ts
npx tsx --test lib/vision/cards/realCards.test.ts
```

There is no package script for this; `package.json` belongs to P1 and was not edited.

## What it does

1. **Outline** (`quads.ts`): greyscale, then two local-contrast passes. Each marks pixels
   darker than their neighbourhood, which draws a thin ring on the table just outside each
   card edge; the ring is thickened by one pixel and the region it encloses is traced.
   Candidates must be four-cornered, convex, inside the frame, 0.2%-90% of the frame and
   have a card-like aspect ratio (1.15-1.8; a poker card is 1.4). Corners are refined by
   fitting a line to the straight middle of each side, ignoring outlying points, and
   intersecting neighbours. Quads centred inside a larger quad are dropped (printed
   frames and pale panels on a face are card-shaped too).
2. **Perspective normalization** (`appearance.ts`): each quad is resampled through a
   projective map to 64 x 64 and pooled to a 32 x 32 grid of brightness plus a 32 x 32 grid
   of red excess `max(0, R - (G + B) / 2)`. Channel means are removed and the vector is
   scaled to unit length, so uniform brightness and gain changes cancel. A quad with almost
   no contrast (blank or plain face-down card) yields no pattern and matches nothing.
3. **Matching** (`recognize.ts`): cosine similarity against each enrolled appearance, as
   seen and turned 180 degrees. The better of the two is that card's score.
4. **Rejection**: a reading keeps its corners but gets `identity: null` when the best score
   is too low, when two enrolled cards are too close, or when a stronger reading in the
   same frame already holds that identity. The nearest card is never assigned by default.

## Proposed interface

```ts
import type { CvApi, Frame, EnrolledCard, CardReading } from '@/lib/vision/cards/types';

enrollCard(cv, frame, id, options?: QuadOptions & { pointSymmetric?: boolean }): EnrolledCard;
recognizeCards(cv, frame, enrolled: readonly EnrolledCard[], options?: MatchOptions): CardReading[];
detectCardQuads(cv, frame, options?: QuadOptions): CardQuad[];
halfTurnSimilarity(feature: Float32Array): number;   // appearance.ts

interface EnrolledCard { id: string; feature: Float32Array; pointSymmetric?: boolean }

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
  declaration; the test casts it to `CvApi`. Adding one to the existing
  `lib/vision/js-aruco2.d.ts` is Codex's call.
- **Corners** run clockwise on screen (image Y down) in the card's own order: top-left,
  top-right, bottom-right, bottom-left. This is the `PixelMarker` convention, so the
  heading formula in `lib/vision/aruco.ts` applies unchanged to `corners[0]` and
  `corners[1]`. "Top" is whatever was up in the image when the card was enrolled.
- **180-degree symmetry**: when `headingAmbiguous` is true the outline is still correct
  but `corners` may be turned by 180 degrees, so the heading is known only modulo pi.
  It is true when the two orientation scores differ by less than `minHeadingMargin`, when
  the enrolled card is declared `pointSymmetric`, and for every rejected reading.
- **Declare two-headed cards.** Set `pointSymmetric: true` when enrolling a king, queen,
  jack or symmetric pip card. `halfTurnSimilarity(feature)` is a hint for the enrollment
  UI (higher means more symmetric); it is not a calibrated test. See the heading note below.
- `EnrolledCard.feature` has 2048 values and can be kept in memory or serialized. A
  length mismatch throws and asks for re-enrollment. Enrollment requires **exactly one**
  patterned card in the frame and throws otherwise.

Defaults (`MATCH_DEFAULTS`): `minScore` 0.8, `minIdentityMargin` 0.06, `minHeadingMargin`
0.05. These were chosen on synthetic scenes before the real photos and were **not changed**
after seeing them.

## Evidence on the real cards

Input: nine photos from the owner (iPhone, as supplied at 1500 x 2000 or 2000 x 1500),
downscaled to 1280 px on the long side to match the capture pipeline. Photos 1 and 5 show
the ace alone, photo 6 the queen alone, the other six all three cards at various turns and
camera angles, with strong glare streaks on the table. Cards were 200-700 px wide.

Enrollment: ace from photo 1, queen from photo 6. No photo shows the king alone, so the
king was enrolled from its quad in photo 9; its reading in photo 9 is therefore not
independent.

| | Result |
| --- | --- |
| Card instances outlined | 21 of 21 |
| Correct identity, defaults | 21 of 21, no rejections |
| Ace of spades scores (7 readings besides enrollment) | 0.889-0.993 |
| King of hearts scores (5 independent readings) | 0.954-0.974 |
| Queen of clubs scores (6 independent readings) | 0.831-0.978 |
| Runner-up score, any reading | 0.298-0.510 |
| Leave-one-out: third card not enrolled | 21 of 21 rejected as `low_score`, 0 misassigned, highest score 0.510 |

The lowest accepted score, 0.831, is the queen at the far end of the most oblique photo.
It is close to `minScore`, so a more oblique or smaller view would be rejected, not misread.

**Heading.** The ace is asymmetric and its heading was resolved in all 8 readings
(orientation margin 0.107-0.349); every overlay was checked by eye and `corners[0]` sat
on the correct corner. The king and queen are printed two-headed. The matcher still
preferred one orientation for them in 12 of 13 readings (margin 0.040-0.164), and even a
reference compared with its own half-turn scores only 0.836 (queen) and 0.868 (king)
against 0.659 for the ace. That residual comes from things like print registration and
lighting. It cannot be checked from the photos and **must not be trusted as a heading**:
enroll these two with `pointSymmetric: true`.

**What failed first, and why.** The first version used one global brightness threshold. On
the real photos it outlined none of the cards correctly: white cards on a pale grey table
with glare and dark surroundings do not split into two brightness classes. It also
"enrolled" the queen from a wrong region. The fix was the local-contrast outline, not a
threshold change. No single window size closed every outline (17-19 of 21, because glare
locally removes the contrast between card and table); the union of two windows did. The
two windows were selected on these nine photos, so treat 21 of 21 as fitted, not held out.

**Committed fixtures.** With the owner's approval, three of the photos are in
`lib/vision/cards/fixtures/` as PNG at 1280 px (about 3.7 MB together, re-encoded without
metadata): `real-three-upright` (photo 9), `real-three-oblique` (photo 2) and
`real-three-turned` (photo 7). `realCards.test.ts` enrolls all three cards from the upright
photo, with the king and queen declared `pointSymmetric`, and checks the other two:
identities, ace heading, and rejection of whichever card is left un-enrolled. With that
enrollment the scores are 0.841-0.991 and runner-ups 0.331-0.500. `pngFixture.ts` is a
test-only reader for those files (8-bit RGB/RGBA PNG); it is not for application use.

Cost: `recognizeCards` averaged about 56 ms per 1280-px photo in Node on the development
laptop (25 ms for outline detection on a clean synthetic frame). That is too slow to run
on every frame next to ArUco at 10 Hz without measuring in the browser first.

## Evidence on synthetic scenes

Drawn card-like faces (`testScene.ts`) with rotation, a top edge narrowed by up to 15%,
a 0.75-1.1 brightness ramp and noise. Same-card similarity 0.98-1.00; different rank and
colour 0.04-0.52; four vs five of one colour 0.88-0.89; an asymmetric seven-like face the
wrong way round 0.84. Corners within 2.5 px for cards at least 110 px on every edge.

**Size limit, measured:** outlines were found for 120 of 120 placements at 100 px card
width and above, and 75-114 of 120 between 50 and 90 px. Below about 110 px on the shortest
edge a rank index can merge into the outline, which cost up to 6 px of corner accuracy and
dropped scores to 0.78-0.83. A test checks that undersized cards are missed or rejected,
never given a wrong identity.

## Limitations and unverified claims

- **Live capture is untested.** Still photos are sharper and better exposed than webcam
  frames. Motion blur, auto-exposure changes and compression are not covered.
- **A near-twin that is not enrolled can pass.** On synthetic faces an un-enrolled four
  scores 0.88-0.89 against the five. The three real cards are very different from each
  other (runner-up at most 0.51), so this was not exercised on real cards. Keep only
  enrolled cards on the table, or enroll every card that can appear.
- **Cards need about 110 px on their shortest edge** in the processed frame, and a visible
  edge all the way round: not touching each other, a marker sheet or the frame edge, and
  not lying where glare makes the table as bright as the card.
- Two cards laid exactly side by side can form one card-shaped outline; it should fail
  matching, but that is not tested.
- Card backs are not handled. Similarity is not a probability; thresholds are heuristics.

## Research

| Question | Source | Finding and decision |
| --- | --- | --- |
| Is there CV code to reuse without a new dependency? | Installed `node_modules/js-aruco2/src/cv.js`, v2.0.0 (MIT), read 2026-11-14; https://github.com/damianofalcioni/js-aruco2 | `grayscale`, `adaptiveThreshold`, `findContours`, `approxPolyDP`, `isContourConvex` are reused. No dependency added. |
| How is CV exported? | Same file and `src/aruco.js` | CommonJS, assigned as `this.CV`; reachable as `js-aruco2/src/cv.js`. The package has no `exports` map, so the deep path resolves in Node. Bundling it with Turbopack is **not yet verified**. |
| Can `CV.warp` normalize a card? | Same file, and measured | It maps to a square and samples one pixel off-centre, which cost up to 0.17 of score for a card turned 180 degrees. Replaced by a centred sampler. |
| Does `findContours` trace thin rings? | Same file, and measured | A ring one pixel thick is followed as a single outer contour with no hole; hence the one-pixel dilation. `stackBoxBlur` returned no usable mask at window 16, so windows stay small. |

No external recognition service, model or network call is used. No camera was opened.

## Before application integration

1. Codex decides how readings enter the planner: which enrolled id maps to which
   `PieceKind`, how a card's centre and heading become a `MarkerReading`, and what the
   tracker does with `headingAmbiguous` and rejected readings.
2. Enrollment needs a UI step ("show one card, name it, is it two-headed?") and a
   decision on whether enrolled appearances persist across reloads.
3. Verify the `js-aruco2/src/cv.js` import in the Next.js build and measure per-frame
   cost in the browser alongside ArUco detection; consider running cards at a lower rate.
4. A photo of each card alone, especially the king, would let the real test exercise
   `enrollCard` itself and make every enrollment independent of the test photos.
