import { MARKER_MAP, type MarkerReading, type PixelMarker } from './contracts';
import { centre, type Calibration } from './calibration';

export interface ArucoDetector { detect(frame: ImageData): PixelMarker[] }
export function detectMarkers(detector: ArucoDetector, frame: ImageData): PixelMarker[] {
  const detected = detector.detect(frame);
  const unique = new Map<number, PixelMarker>();
  for (const marker of detected) {
    if (!(marker.id in MARKER_MAP) || marker.corners?.length !== 4 || !marker.corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) continue;
    const previous = unique.get(marker.id);
    if (!previous || (marker.hammingDistance ?? 0) < (previous.hammingDistance ?? 0)) unique.set(marker.id, marker);
  }
  return [...unique.values()];
}

export function markersInWorld(markers: PixelMarker[], calibration: Calibration): MarkerReading[] {
  return markers.flatMap(marker => {
    try {
      const pos=calibration.toWorld(centre(marker));
      const a=calibration.toWorld(marker.corners[0]), b=calibration.toWorld(marker.corners[1]);
      // Local marker up is its canonical top-edge normal. 0 points north, +pi/2 east.
      const rotation=Math.atan2(-(b.y-a.y), b.x-a.x);
      if (![pos.x,pos.y,rotation].every(Number.isFinite)) return [];
      const confidence = marker.confidence ?? Math.max(0, 1 - (marker.hammingDistance ?? 0) / 6);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return [];
      return [{markerId:marker.id,pos,rotation,confidence}];
    } catch { return []; }
  });
}
