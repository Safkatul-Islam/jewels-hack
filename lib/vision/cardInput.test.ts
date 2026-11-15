import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { CardInput } from './cardInput';
import { FACES, placeCard, renderScene } from './cards/testScene';
import type { CardReading, CvApi } from './cards/types';
import { TableSession } from './session';
import { validateWorld } from '../scenarios';
import type { WorldState } from '../sim/types';

const { CV } = createRequire(import.meta.url)('js-aruco2/src/cv.js') as { CV: CvApi };
const solo = (face: keyof typeof FACES) => renderScene([placeCard(FACES[face], { x: 320, y: 180 }, 100)]);

test('the card recognizer feeds calibration, world updates and an immutable Confirm snapshot', () => {
  const input = new CardInput(CV);
  input.enroll(solo('court'), 0, 'Venue');
  input.enroll(solo('redFive'), 1, 'Arrival');
  input.enroll(solo('blackSeven'), 10, 'Shuttle');
  const frame = renderScene([
    placeCard(FACES.court, { x: 110, y: 270 }, 55),
    placeCard(FACES.redFive, { x: 110, y: 100 }, 55),
    placeCard(FACES.blackSeven, { x: 430, y: 180 }, 55, 0.2),
  ]);
  const detected = input.detect(frame);
  assert.deepEqual(detected.markers.map(marker => marker.id).sort((a, b) => a - b), [0, 1, 10]);
  const fixture = validateWorld(JSON.parse(readFileSync(new URL('../../fixtures/scenario-rosebowl.json', import.meta.url), 'utf8')));
  const world: WorldState = { ...fixture, bbox: { minX: -1000, minY: -1000, maxX: 3000, maxY: 3000 },
    venue: { ...fixture.venue, pos: { x: 100, y: 200 } },
    anchors: [{ ...fixture.anchors[0], pos: { x: 100, y: 1200 } }], pieces: [],
  };
  const session = new TableSession(world);
  const state = session.process(detected.markers, 0);
  assert.equal(state.canConfirm, true);
  assert.equal(world.pieces.length, 0);
  const snapshot = session.confirm();
  const piece = snapshot.pieces[0];
  assert.equal(piece.fromMarker, 10);
  assert.equal(piece.kind, 'shuttle_hub');
  assert.ok(Math.abs(piece.pos.x - 1982) < 25);
  assert.ok(Math.abs(piece.pos.y - 729) < 25);
  assert.ok(state.readings.every(reading => Number.isFinite(reading.confidence)));
  session.process([], 600);
  assert.throws(() => session.confirm());
});

test('failed enrollment preserves references; roles can be replaced, removed and cleared', () => {
  const input = new CardInput(CV);
  input.enroll(solo('court'), 0, 'First');
  assert.throws(() => input.enroll(renderScene([]), 0, 'Invalid'), /exactly one/);
  assert.equal(input.list()[0].label, 'First');
  assert.throws(() => input.enroll(solo('court'), 99, 'Unknown'), /known planning role/);
  input.enroll(solo('redFive'), 0, 'Replacement');
  assert.equal(input.list().length, 1);
  assert.equal(input.list()[0].label, 'Replacement');
  input.remove(0);
  assert.equal(input.detect(solo('redFive')).markers.length, 0);
  input.enroll(solo('blackSeven'), 10, 'Hub');
  input.clear();
  assert.deepEqual(input.list(), []);
});

test('ambiguous headings stay continuous and a manual flip changes the heading once', () => {
  const input = new CardInput(CV);
  input.enroll(solo('redFive'), 10, 'Symmetric card');
  const corners = placeCard(FACES.redFive, { x: 200, y: 200 }, 80).corners;
  const reading: CardReading = { corners, identity: '10', score: 0.93, runnerUpScore: 0.3,
    headingAmbiguous: true, rejection: null };
  const first = input.adapt([reading])[0];
  const reversed = { ...reading, corners: [corners[2], corners[3], corners[0], corners[1]] as const };
  assert.deepEqual(input.adapt([reversed])[0].corners, first.corners);
  input.flip(10);
  const flipped = input.adapt([reading])[0];
  assert.deepEqual(flipped.corners[0], first.corners[2]);
  assert.deepEqual(input.adapt([reversed])[0].corners, flipped.corners);
  assert.equal(flipped.confidence, 0.93);
  input.flip(10);
  assert.deepEqual(input.adapt([reading])[0].corners, first.corners);
  assert.equal(input.adapt([{ ...reading, identity: null, rejection: 'low_score' }]).length, 0);
  assert.equal(input.adapt([{ ...reading, score: NaN }]).length, 0);
  assert.equal(input.adapt([{ ...reading, identity: '16' }]).length, 0);
  assert.equal(input.adapt([{ ...reading, score: 0.5 }]).length, 0);
});
