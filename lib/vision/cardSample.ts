import { FACES, placeCard, renderScene } from './cards/testScene';
import { CardInput } from './cardInput';
import type { SampleSettings } from './sampleFrame';
import type { WorldState } from '../sim/types';
import { fitTransform, worldToScreen } from '../transform';

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
      const frame = renderScene([placeCard(face, { x: 64, y: 90 }, 80)], { width: 128, height: 180, noise: 0 });
      input.enroll(frame, markerId, label);
      const sprite = document.createElement('canvas');
      sprite.width = 80;
      sprite.height = 112;
      const context = sprite.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable for the card demo.');
      context.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), -24, -34);
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
    const transform = fitTransform(world.bbox, width, height, 100);
    const box = world.bbox;
    const positions = [
      { id: 0, pos: world.venue.pos },
      { id: 1, pos: world.anchors[0].pos },
      { id: 10, pos: {
        x: box.minX + (0.2 + settings.positionPercent / 100 * 0.6) * (box.maxX - box.minX),
        y: box.minY + (box.maxY - box.minY) * 0.4,
      } },
    ];
    for (const card of positions) {
      if (onlyRole !== null && card.id !== onlyRole) continue;
      if (card.id < 10 ? settings.hideAnchors : settings.hideMovable) continue;
      const point = worldToScreen(transform, card.pos, box);
      context.save();
      context.translate(point.x, point.y);
      if (card.id === 10) context.rotate(settings.rotationDegrees * Math.PI / 180);
      context.drawImage(this.sprites.get(card.id)!, -26, -36.4, 52, 72.8);
      context.restore();
    }
  }
}
