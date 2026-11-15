import type { PixelMarker } from './contracts';
import { centre } from './calibration';

/** Image-space pose only; this does not estimate the physical camera's pose. */
export interface OverlayPose {
  x: number;
  y: number;
  rotation: number;
  size: number;
}

/** Return the cleanup so a removed overlay never retains a GPU event listener. */
export function watchContextLoss(canvas: EventTarget, onFailure: () => void): () => void {
  const lost = (event: Event) => { event.preventDefault(); onFailure(); };
  canvas.addEventListener('webglcontextlost', lost);
  return () => canvas.removeEventListener('webglcontextlost', lost);
}

export function markerOverlayPose(marker: PixelMarker, imageHeight: number): OverlayPose | null {
  if (marker.corners.length !== 4 || !Number.isFinite(imageHeight) || imageHeight <= 0 ||
      !marker.corners.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  const [a, b] = marker.corners;
  const size = Math.hypot(b.x - a.x, b.y - a.y);
  if (size < 1) return null;
  const point = centre(marker);
  return { x: point.x, y: imageHeight - point.y,
    rotation: -Math.atan2(b.y - a.y, b.x - a.x), size };
}

/** Frame-rate-independent interpolation, taking the shortest route across ±pi. */
export function advanceOverlayPose(current: OverlayPose, target: OverlayPose, deltaSeconds: number): OverlayPose {
  const amount = 1 - Math.exp(-22 * Math.max(0, Math.min(deltaSeconds, 0.1)));
  const turn = Math.atan2(Math.sin(target.rotation - current.rotation), Math.cos(target.rotation - current.rotation));
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
    size: current.size + (target.size - current.size) * amount,
    rotation: current.rotation + turn * amount,
  };
}

export function overlayAtRest(current: OverlayPose, target: OverlayPose): boolean {
  const turn = Math.atan2(Math.sin(target.rotation - current.rotation), Math.cos(target.rotation - current.rotation));
  return Math.hypot(current.x - target.x, current.y - target.y) < 0.15 &&
    Math.abs(current.size - target.size) < 0.1 && Math.abs(turn) < 0.002;
}
