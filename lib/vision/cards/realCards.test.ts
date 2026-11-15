// Run: npx tsx --test lib/vision/cards/realCards.test.ts
// Regression test on three of the owner's phone photos (fixtures/real-three-*.png,
// 1280 px on the long side): ace of spades, king of hearts and queen of clubs on
// the real table, with glare. These are still photos. Passing says nothing about
// a live camera, motion blur, other cards or other lighting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describeCard, prepareFrame } from './appearance';
import { readPngFrame } from './pngFixture';
import { detectCardQuads } from './quads';
import { MATCH_DEFAULTS, recognizeCards } from './recognize';
import type { CardCorners, CardReading, CvApi, EnrolledCard, Vec2 } from './types';

const { CV } = createRequire(import.meta.url)('js-aruco2/src/cv.js') as { CV: CvApi };
const fixture = (name: string) => readPngFrame(new URL(`./fixtures/real-three-${name}.png`, import.meta.url));
const centre = (corners: CardCorners): Vec2 => ({
  x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
  y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
});
const by = (axis: 'x' | 'y') => (a: { corners: CardCorners }, b: { corners: CardCorners }) => centre(a.corners)[axis] - centre(b.corners)[axis];

// "upright": the three cards side by side, left to right ace, queen, king.
const upright = fixture('upright');
const uprightQuads = detectCardQuads(CV, upright).sort(by('x'));
const prepared = prepareFrame(CV, upright);
const enrolled: EnrolledCard[] = uprightQuads.length === 3 ? [
  // The ace lies upside down in this photo; turn its corners so "top" is the BICYCLE end.
  { id: 'ace_spades', feature: describeCard(prepared, [uprightQuads[0]!.corners[2], uprightQuads[0]!.corners[3], uprightQuads[0]!.corners[0], uprightQuads[0]!.corners[1]]) },
  // Both court cards are printed two-headed: their heading is never claimed.
  { id: 'queen_clubs', feature: describeCard(prepared, uprightQuads[1]!.corners), pointSymmetric: true },
  { id: 'king_hearts', feature: describeCard(prepared, uprightQuads[2]!.corners), pointSymmetric: true },
] : [];

function expectCard(reading: CardReading | undefined, id: string) {
  assert.ok(reading, `${id}: no reading`);
  assert.equal(reading.identity, id);
  assert.equal(reading.rejection, null);
  assert.ok(reading.score >= MATCH_DEFAULTS.minScore, `${id} score ${reading.score}`);
  // The three cards look nothing alike; a close runner-up would mean the match is not sound.
  assert.ok(reading.runnerUpScore < 0.65, `${id} runner-up ${reading.runnerUpScore}`);
  assert.equal(reading.headingAmbiguous, id !== 'ace_spades');
}

test('real photo: every card is outlined despite glare, and nothing else is', () => {
  assert.equal(uprightQuads.length, 3);
  assert.equal(detectCardQuads(CV, fixture('oblique')).length, 3);
  assert.equal(detectCardQuads(CV, fixture('turned')).length, 3);
});

test('real photos: three enrolled cards are identified at other turns and camera angles', () => {
  // "oblique": steep view down the table, top to bottom ace, king, queen.
  const oblique = recognizeCards(CV, fixture('oblique'), enrolled).sort(by('y'));
  assert.equal(oblique.length, 3);
  ['ace_spades', 'king_hearts', 'queen_clubs'].forEach((id, i) => expectCard(oblique[i], id));
  // "turned": each card at a different turn, left to right ace, queen, king.
  const turned = recognizeCards(CV, fixture('turned'), enrolled).sort(by('x'));
  assert.equal(turned.length, 3);
  ['ace_spades', 'queen_clubs', 'king_hearts'].forEach((id, i) => expectCard(turned[i], id));

  // Ace heading, checked by eye against the photos: corners[0] is the "A" beside BICYCLE.
  const uprightAce = turned[0]!;
  assert.ok(uprightAce.corners[0].x < centre(uprightAce.corners).x && uprightAce.corners[0].y < centre(uprightAce.corners).y);
  const tiltedAce = oblique[0]!;
  assert.ok(Math.hypot(tiltedAce.corners[0].x - 253, tiltedAce.corners[0].y - 227) < 15,
    `ace top-left at ${tiltedAce.corners[0].x},${tiltedAce.corners[0].y}`);
});

test('real photos: a card that is not enrolled is rejected, not read as another card', () => {
  for (const left of enrolled) {
    const others = enrolled.filter((card) => card !== left);
    for (const name of ['oblique', 'turned']) {
      const readings = recognizeCards(CV, fixture(name), others);
      assert.equal(readings.length, 3);
      assert.deepEqual(readings.map((r) => r.identity).filter(Boolean).sort(), others.map((card) => card.id).sort());
      const rejected = readings.filter((r) => r.identity === null);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0]!.rejection, 'low_score');
      assert.ok(rejected[0]!.score < 0.65, `left-out ${left.id} scored ${rejected[0]!.score}`);
    }
  }
});
