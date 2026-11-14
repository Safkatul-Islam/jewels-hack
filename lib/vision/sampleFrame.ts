import type { WorldState } from '../sim/types';
import { fitTransform, worldToScreen } from '../transform';
import { MARKER_MAP } from './contracts';

const TEST_IDS = Object.keys(MARKER_MAP).map(Number);

export interface SampleSettings {
  markerId: number;
  positionPercent: number;
  rotationDegrees: number;
  hideMovable: boolean;
  hideAnchors: boolean;
}

export const DEFAULT_SAMPLE_SETTINGS: SampleSettings = {
  markerId: 10, positionPercent: 35, rotationDegrees: 0, hideMovable: false, hideAnchors: false,
};

export async function loadSampleMarkers(): Promise<Map<number, HTMLImageElement>> {
  const images = await Promise.all(
    TEST_IDS.map((id) => new Promise<[number, HTMLImageElement]>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([id, image]);
      image.onerror = () => reject(new Error(`Marker ${id} could not load. Regenerate the print assets.`));
      image.src = `/markers/marker-${id}.svg`;
    })),
  );
  return new Map(images);
}

/** Synthetic camera input for testing the real detector without camera permission. */
export function drawSampleFrame(
  context: CanvasRenderingContext2D,
  world: WorldState,
  images: Map<number, HTMLImageElement>,
  settings: SampleSettings,
) {
  const width = 1280;
  const height = 720;
  if (context.canvas.width !== width || context.canvas.height !== height) {
    context.canvas.width = width;
    context.canvas.height = height;
  }
  context.fillStyle = '#f3f0e6';
  context.fillRect(0, 0, width, height);
  const transform = fitTransform(world.bbox, width, height, 100);
  const box = world.bbox;
  const companionId = settings.markerId === 12 ? 10 : 12;
  const positions = [
    ...settings.hideAnchors ? [] : [
      { id: 0, pos: world.venue.pos, rotation: 0 },
      { id: 1, pos: world.anchors[0].pos, rotation: 0 },
    ],
    ...settings.hideMovable ? [] : [{ id: settings.markerId, pos: {
      x: box.minX + (0.2 + settings.positionPercent / 100 * 0.6) * (box.maxX - box.minX),
      y: box.minY + (box.maxY - box.minY) * 0.35,
    }, rotation: settings.rotationDegrees * Math.PI / 180 }],
    { id: companionId, pos: {
      x: box.minX + (box.maxX - box.minX) * 0.55,
      y: box.minY + (box.maxY - box.minY) * 0.7,
    }, rotation: 0 },
  ];
  for (const marker of positions) {
    const point = worldToScreen(transform, marker.pos, box);
    const image = images.get(marker.id);
    if (!image) throw new Error(`Sample marker ${marker.id} is missing.`);
    context.save();
    context.translate(point.x, point.y);
    context.rotate(marker.rotation);
    context.fillStyle = '#ffffff';
    context.fillRect(-56, -56, 112, 112);
    context.drawImage(image, -40, -40, 80, 80);
    context.restore();
  }
}
