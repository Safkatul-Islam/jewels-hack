import { DEFAULT_CAPACITIES, MARKER_MAP, type MarkerReading, type VisionWorld } from './contracts';

/** Immutable upsert. Missing markers do not delete pieces; use an explicit reset/remove.
 * Locked pieces and calibration markers never move. Duplicate readings use highest confidence. */
export function markersToWorld<T extends VisionWorld>(readings: MarkerReading[], base: T): T {
  const best=new Map<number,MarkerReading>();
  for(const reading of readings) {
    if(!Number.isInteger(reading.markerId) || ![reading.pos.x,reading.pos.y,reading.rotation,reading.confidence].every(Number.isFinite) || reading.confidence<0.5 || reading.confidence>1) continue;
    const kind=MARKER_MAP[reading.markerId], p=reading.pos, box=base.bbox;
    if(!kind || kind==='venue' || kind==='anchor' || p.x<box.minX || p.x>box.maxX || p.y<box.minY || p.y>box.maxY) continue;
    if(!best.has(reading.markerId) || best.get(reading.markerId)!.confidence<reading.confidence) best.set(reading.markerId,reading);
  }
  if(!best.size) return base;
  const pieces=base.pieces.map(piece=>({...piece,pos:{...piece.pos}}));
  for(const reading of best.values()) {
    const kind=MARKER_MAP[reading.markerId];
    if(kind==='venue' || kind==='anchor') continue;
    // Adopt one same-kind unmarked baseline piece before adding another instance.
    const existing=pieces.find(piece=>piece.fromMarker===reading.markerId)
      ?? pieces.find(piece=>piece.kind===kind && piece.fromMarker===undefined && !piece.locked);
    if(existing) {
      if(existing.locked) continue;
      existing.pos={...reading.pos}; existing.rotation=reading.rotation; existing.fromMarker=reading.markerId;
    } else {
      pieces.push({id:`marker-${reading.markerId}`,kind,pos:{...reading.pos},rotation:reading.rotation,
        capacity:DEFAULT_CAPACITIES[kind],fromMarker:reading.markerId});
    }
  }
  return {...base,pieces};
}
