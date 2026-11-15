// Run: npx tsx --test lib/vision/cards/cards.test.ts
// Scenes are synthetic drawings (testScene.ts). Passing here does not establish
// recognition of real printed cards, a real camera, or venue lighting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FEATURE_LENGTH, halfTurnSimilarity, rotateFeature180 } from './appearance';
import { detectCardQuads } from './quads';
import { enrollCard, recognizeCards } from './recognize';
import { FACES, placeCard, renderScene, type PlacedCard } from './testScene';
import type { CardCorners, CardReading, CvApi, EnrolledCard, Vec2 } from './types';

// js-aruco2 is CommonJS and assigns CV onto its module object; this is its real, untyped export.
const { CV } = createRequire(import.meta.url)('js-aruco2/src/cv.js') as { CV: CvApi };

const CORNER_TOLERANCE_PX = 2.5;
const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) <= CORNER_TOLERANCE_PX;
const centre = (corners: CardCorners): Vec2 => ({
  x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
  y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
});
const enroll = (name: keyof typeof FACES): EnrolledCard =>
  enrollCard(CV, renderScene([placeCard(FACES[name], { x: 320, y: 180 }, 130)], { seed: 3 }), name);
/** The reading whose centre is closest to the placed card. */
function readingFor(readings: CardReading[], placed: PlacedCard): CardReading {
  const target = centre(placed.corners);
  const sorted = [...readings].sort((a, b) => Math.hypot(centre(a.corners).x - target.x, centre(a.corners).y - target.y)
    - Math.hypot(centre(b.corners).x - target.x, centre(b.corners).y - target.y));
  assert.ok(sorted[0], 'no reading for a placed card');
  return sorted[0];
}

const five = enroll('redFive');
const seven = enroll('blackSeven');
const two = enroll('blackTwo');
const HARD = { noise: 14, lighting: [0.75, 1.1] as const, seed: 11 };

test('three enrolled cards are identified under rotation, taper, uneven light and noise', () => {
  const placed = [
    placeCard(FACES.redFive, { x: 180, y: 260 }, 130, 0.5, 0.9),
    placeCard(FACES.blackSeven, { x: 480, y: 290 }, 130, -0.7, 0.85),
    placeCard(FACES.blackTwo, { x: 780, y: 250 }, 140, 1.2, 0.9),
  ];
  // Every card edge is at least 110 px: see the size limit in docs/08-PLAYING-CARDS.md.
  const readings = recognizeCards(CV, renderScene(placed, { ...HARD, width: 960, height: 540 }), [five, seven, two]);
  assert.equal(readings.length, 3);
  for (const [index, id] of ['redFive', 'blackSeven', 'blackTwo'].entries()) {
    const reading = readingFor(readings, placed[index]!);
    assert.equal(reading.identity, id);
    assert.equal(reading.rejection, null);
    assert.ok(reading.score > 0.9, `${id} score ${reading.score}`);
    assert.ok(reading.score - reading.runnerUpScore > 0.3, `${id} lead over runner-up`);
    for (const corner of reading.corners) {
      assert.ok(placed[index]!.corners.some((truth) => near(corner, truth)), `${id} corner ${corner.x},${corner.y} is off`);
    }
  }
});

test('heading: an asymmetric card is resolved through 180 degrees, a point-symmetric one is flagged', () => {
  for (const angle of [0.3, Math.PI + 0.3, -2.4]) {
    const placed = placeCard(FACES.blackSeven, { x: 320, y: 180 }, 110, angle);
    const [reading] = recognizeCards(CV, renderScene([placed], HARD), [five, seven, two]);
    assert.equal(reading?.identity, 'blackSeven');
    assert.equal(reading.headingAmbiguous, false);
    // corners follow the card, not the image: [0] is the card's own top-left at any turn.
    placed.corners.forEach((truth, i) => assert.ok(near(reading.corners[i]!, truth), `angle ${angle} corner ${i}`));
  }
  const symmetric = placeCard(FACES.redFive, { x: 320, y: 180 }, 110, Math.PI + 0.3);
  const [reading] = recognizeCards(CV, renderScene([symmetric], HARD), [five, seven, two]);
  assert.equal(reading?.identity, 'redFive');
  assert.equal(reading.headingAmbiguous, true);
  // Still a valid outline with a short first edge; only its 180-degree turn is unknown.
  assert.ok(near(reading.corners[0], symmetric.corners[0]) || near(reading.corners[0], symmetric.corners[2]));

  // A card declared point-symmetric never claims a heading, whatever the scores say.
  const declared = { ...seven, pointSymmetric: true };
  const turned = renderScene([placeCard(FACES.blackSeven, { x: 320, y: 180 }, 110, 0.3)], HARD);
  assert.equal(recognizeCards(CV, turned, [five, declared, two])[0]?.identity, 'blackSeven');
  assert.equal(recognizeCards(CV, turned, [five, declared, two])[0]?.headingAmbiguous, true);
  assert.ok(halfTurnSimilarity(five.feature) > 0.95 && halfTurnSimilarity(seven.feature) < 0.9);
});

test('cards below the supported size are missed or rejected, never given a wrong identity', () => {
  // Outlines are reliable from about 100 px card width; below that a rank index can merge into the outline.
  for (const width of [40, 55, 70]) {
    for (const [index, name] of (['redFive', 'blackSeven', 'blackTwo'] as const).entries()) {
      const frame = renderScene([placeCard(FACES[name], { x: 320, y: 180 }, width, 0.4 + index)], HARD);
      for (const reading of recognizeCards(CV, frame, [five, seven, two])) {
        assert.ok(reading.identity === null || reading.identity === name, `${name} at ${width}px read as ${reading.identity}`);
      }
    }
  }
});

test('an unenrolled or face-down card is reported with corners but no identity', () => {
  const court = placeCard(FACES.court, { x: 190, y: 180 }, 110, 0.4);
  const blank = placeCard(FACES.blank, { x: 450, y: 180 }, 110, -0.3);
  const readings = recognizeCards(CV, renderScene([court, blank], HARD), [five, seven, two]);
  assert.equal(readings.length, 2);
  for (const placed of [court, blank]) {
    const reading = readingFor(readings, placed);
    assert.equal(reading.identity, null);
    assert.equal(reading.rejection, 'low_score');
    assert.equal(reading.headingAmbiguous, true);
    assert.ok(reading.score < 0.6, `score ${reading.score}`);
  }
  assert.equal(readingFor(readings, blank).score, 0);
  assert.deepEqual(recognizeCards(CV, renderScene([court], HARD), []).map((r) => r.rejection), ['low_score']);
});

test('near-identical cards: both enrolled are told apart; equal references and strict thresholds reject', () => {
  const four = enroll('redFour');
  const placed = [placeCard(FACES.redFour, { x: 190, y: 180 }, 100, 0.6), placeCard(FACES.redFive, { x: 450, y: 180 }, 100, 2.1)];
  const frame = renderScene(placed, HARD);
  const both = recognizeCards(CV, frame, [five, four]);
  assert.equal(readingFor(both, placed[0]!).identity, 'redFour');
  assert.equal(readingFor(both, placed[1]!).identity, 'redFive');
  // Their appearances are close, so the lead is small; it must still clear the margin.
  assert.ok(readingFor(both, placed[0]!).runnerUpScore > 0.8);

  // Two references that explain the card equally: never pick one arbitrarily.
  const twins = recognizeCards(CV, frame, [five, { id: 'copy', feature: five.feature }]);
  assert.equal(readingFor(twins, placed[1]!).identity, null);
  assert.equal(readingFor(twins, placed[1]!).rejection, 'ambiguous_identity');

  // Only the five is enrolled: a strict minimum score rejects the four instead of calling it a five.
  const strict = recognizeCards(CV, frame, [five], { minScore: 0.95 });
  assert.equal(readingFor(strict, placed[0]!).identity, null);
  assert.equal(readingFor(strict, placed[0]!).rejection, 'low_score');
  assert.equal(readingFor(strict, placed[1]!).identity, 'redFive');
});

test('two cards claiming one identity: only the stronger keeps it', () => {
  const placed = [placeCard(FACES.redFive, { x: 190, y: 180 }, 120, 0.2), placeCard(FACES.redFive, { x: 450, y: 180 }, 100, 1.0, 0.85)];
  const readings = recognizeCards(CV, renderScene(placed, HARD), [five, seven, two]);
  assert.deepEqual(readings.map((r) => r.identity).filter(Boolean), ['redFive']);
  assert.deepEqual(readings.map((r) => r.rejection).filter(Boolean), ['duplicate_identity']);
});

test('enrollment refuses anything but exactly one patterned card', () => {
  const one = placeCard(FACES.redFive, { x: 190, y: 180 }, 110);
  const other = placeCard(FACES.blackTwo, { x: 450, y: 180 }, 110);
  assert.throws(() => enrollCard(CV, renderScene([]), 'x'), /found 0/);
  assert.throws(() => enrollCard(CV, renderScene([one, other]), 'x'), /found 2/);
  assert.throws(() => enrollCard(CV, renderScene([placeCard(FACES.blank, { x: 320, y: 180 }, 110)]), 'x'), /no printed pattern/);
  assert.throws(() => enrollCard(CV, renderScene([one]), '  '), /non-empty card id/);
  assert.equal(enrollCard(CV, renderScene([one]), 'x').feature.length, FEATURE_LENGTH);
});

test('quad detection rejects non-cards and keeps only the outer card outline', () => {
  assert.deepEqual(detectCardQuads(CV, renderScene([])), []);
  const square: PlacedCard = { face: FACES.blank, corners: [{ x: 260, y: 120 }, { x: 380, y: 120 }, { x: 380, y: 240 }, { x: 260, y: 240 }] };
  assert.deepEqual(detectCardQuads(CV, renderScene([square])), []);
  // The court face has a pale card-proportioned panel inside it.
  assert.equal(detectCardQuads(CV, renderScene([placeCard(FACES.court, { x: 320, y: 180 }, 130)])).length, 1);
  // Touching cards merge into one bright blob that is not a card outline.
  const touching = [placeCard(FACES.redFive, { x: 270, y: 150 }, 100), placeCard(FACES.blackTwo, { x: 369, y: 205 }, 100)];
  assert.deepEqual(detectCardQuads(CV, renderScene(touching)), []);
  const quads = detectCardQuads(CV, renderScene([placeCard(FACES.redFive, { x: 320, y: 180 }, 110, 2.0)]));
  assert.equal(quads.length, 1);
  const [a, b, c] = quads[0]!.corners;
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < Math.hypot(c.x - b.x, c.y - b.y), 'first edge must be a short edge');
});

test('invalid inputs fail with actionable errors', () => {
  assert.throws(() => detectCardQuads(CV, { width: 4, height: 4, data: new Uint8ClampedArray(10) }), /RGBA data of 64 bytes/);
  assert.throws(() => detectCardQuads(CV, { width: 0, height: 4, data: new Uint8ClampedArray(0) }), /positive integer size/);
  const frame = renderScene([placeCard(FACES.redFive, { x: 320, y: 180 }, 110)]);
  assert.throws(() => recognizeCards(CV, frame, [five, { id: 'redFive', feature: five.feature }]), /enrolled twice/);
  assert.throws(() => recognizeCards(CV, frame, [{ id: 'short', feature: new Float32Array(8) }]), /Re-enroll/);
  assert.deepEqual([...rotateFeature180(rotateFeature180(seven.feature))], [...seven.feature]);
});
