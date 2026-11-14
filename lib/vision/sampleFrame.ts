import type { WorldState } from '../sim/types';
import { fitTransform, worldToScreen } from '../transform';

const TEST_IDS = [0, 1, 10, 12];

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
  positionPercent: number,
) {
  const width = 1280;
  const height = 720;
  context.canvas.width = width;
  context.canvas.height = height;
  context.fillStyle = '#f3f0e6';
  context.fillRect(0, 0, width, height);
  const transform = fitTransform(world.bbox, width, height, 100);
  const box = world.bbox;
  const positions = [
    { id: 0, pos: world.venue.pos },
    { id: 1, pos: world.anchors[0].pos },
    { id: 10, pos: {
      x: box.minX + (0.2 + positionPercent / 100 * 0.6) * (box.maxX - box.minX),
      y: box.minY + (box.maxY - box.minY) * 0.35,
    } },
    { id: 12, pos: world.pieces.find((piece) => piece.kind === 'vendor_village')?.pos ?? {
      x: box.minX + (box.maxX - box.minX) * 0.55,
      y: box.minY + (box.maxY - box.minY) * 0.7,
    } },
  ];
  for (const marker of positions) {
    const point = worldToScreen(transform, marker.pos, box);
    const image = images.get(marker.id);
    if (!image) throw new Error(`Sample marker ${marker.id} is missing.`);
    context.fillStyle = '#ffffff';
    context.fillRect(point.x - 56, point.y - 56, 112, 112);
    context.drawImage(image, point.x - 40, point.y - 40, 80, 80);
  }
}
