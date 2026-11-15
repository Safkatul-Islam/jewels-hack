import { FACES, placeCard, renderScene } from './cards/testScene';
import { CardInput } from './cardInput';
import type { SampleSettings } from './sampleFrame';
import type { WorldState } from '../sim/types';
import { calibrateOverhead } from './calibration';

const DEMO_FACES = [
  { markerId: 0, face: FACES.court, label: 'Sample court / venue' },
  { markerId: 1, face: FACES.redFive, label: 'Sample red five / arrival' },
  { markerId: 10, face: FACES.blackSeven, label: 'Sample black seven / shuttle' },
];

/** Cache three tiny sprites once. The expensive test-scene generator never runs per frame. */
export class CardDemo {
  private sprites = new Map<number, HTMLCanvasElement>();

  constructor(input: CardInput) {
    for (const { markerId, face, label } of DEMO_FACES) {
      const frame = renderScene([placeCard(face, { x: 128, y: 180 }, 160)], { width: 256, height: 360, noise: 0 });
      input.enroll(frame, markerId, label, markerId === 1);
      const sprite = document.createElement('canvas');
      sprite.width = 160;
      sprite.height = 224;
      const context = sprite.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable for the card demo.');
      context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), -48, -68);
      this.sprites.set(markerId, sprite);
    }
  }

  draw(context: CanvasRenderingContext2D, world: WorldState, settings: SampleSettings, onlyRole: number | null): void {
    const width = 1280, height = 720;
    if (context.canvas.width !== width || context.canvas.height !== height) {
      context.canvas.width = width;
      context.canvas.height = height;
    }
    context.fillStyle = '#303034';
    context.fillRect(0, 0, width, height);
    // Keep large cards separated while preserving scenario-derived calibration.
    const pixelAnchors = [
      { id: 0, corners: placeCard(FACES.court, { x: 640, y: 560 }, 120).corners.map(point => ({ ...point })) },
      { id: 1, corners: placeCard(FACES.redFive, { x: 640, y: 160 }, 120).corners.map(point => ({ ...point })) },
    ];
    const calibration = calibrateOverhead(pixelAnchors, world);
    if (!calibration) throw new Error('The scenario needs distinct venue and arrival positions.');
    const venue = world.venue.pos, arrival = world.anchors[0].pos;
    const distance = Math.hypot(arrival.x - venue.x, arrival.y - venue.y);
    const midpoint = { x: (venue.x + arrival.x) / 2, y: (venue.y + arrival.y) / 2 };
    const normal = { x: (arrival.y - venue.y) / distance, y: -(arrival.x - venue.x) / distance };
    const box = world.bbox;
    let low = -distance * 1.2, high = distance * 1.2;
    for (const [origin, direction, min, max] of [[midpoint.x, normal.x, box.minX, box.maxX], [midpoint.y, normal.y, box.minY, box.maxY]]) {
      if (Math.abs(direction) < 1e-8) continue;
      const a = (min - origin) / direction, b = (max - origin) / direction;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
    const offset = low + (high - low) * (0.1 + settings.positionPercent / 100 * 0.8);
    const positions = [
      { id: 0, pos: world.venue.pos },
      { id: 1, pos: world.anchors[0].pos },
      { id: 10, pos: {
        x: midpoint.x + normal.x * offset,
        y: midpoint.y + normal.y * offset,
      } },
    ];
    for (const card of positions) {
      if (onlyRole !== null && card.id !== onlyRole) continue;
      if (card.id < 10 ? settings.hideAnchors : settings.hideMovable) continue;
      const point = calibration.toPixel(card.pos);
      context.save();
      context.translate(point.x, point.y);
      if (card.id === 10) context.rotate(settings.rotationDegrees * Math.PI / 180);
      context.drawImage(this.sprites.get(card.id)!, -60, -84, 120, 168);
      context.restore();
    }
  }
}
