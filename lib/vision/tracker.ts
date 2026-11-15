import type { MarkerReading } from './contracts';

export interface TrackedReading extends MarkerReading { held: boolean }
export class MarkerTracker {
  private tracks=new Map<number,{ samples: MarkerReading[]; seen: number; accepted: MarkerReading }>();
  constructor(private options={window:5,holdMs:500,moveThresholdM:15,rotationThresholdRad:0.08}) {}
  reset() { this.tracks.clear(); }
  update(readings: MarkerReading[], now: number): TrackedReading[] {
    const visible=new Set<number>();
    for(const reading of readings) {
      if(![reading.pos.x,reading.pos.y,reading.rotation,reading.confidence].every(Number.isFinite)) continue;
      visible.add(reading.markerId);
      const existing=this.tracks.get(reading.markerId);
      const previous=existing && now-existing.seen<=this.options.holdMs ? existing : undefined;
      const samples=[...(previous?.samples??[]),reading].slice(-this.options.window);
      const mean:MarkerReading={markerId:reading.markerId,
        pos:{x:samples.reduce((s,p)=>s+p.pos.x,0)/samples.length,y:samples.reduce((s,p)=>s+p.pos.y,0)/samples.length},
        rotation:Math.atan2(samples.reduce((s,p)=>s+Math.sin(p.rotation),0),samples.reduce((s,p)=>s+Math.cos(p.rotation),0)),
        // Smooth geometry, but confidence must describe this frame's evidence.
        confidence:reading.confidence};
      const old=previous?.accepted;
      const turn=old?Math.abs(Math.atan2(Math.sin(mean.rotation-old.rotation),Math.cos(mean.rotation-old.rotation))):Infinity;
      const moved=!old || Math.hypot(mean.pos.x-old.pos.x,mean.pos.y-old.pos.y)>=this.options.moveThresholdM || turn>=this.options.rotationThresholdRad;
      const accepted = moved ? mean : { ...old!, confidence: reading.confidence };
      this.tracks.set(reading.markerId,{samples,seen:now,accepted});
    }
    const result:TrackedReading[]=[];
    for(const [id,track] of this.tracks) {
      if(now-track.seen>this.options.holdMs) {this.tracks.delete(id);continue;}
      result.push({...track.accepted,pos:{...track.accepted.pos},held:!visible.has(id)});
    }
    return result;
  }
}
