import type { PixelMarker, VisionWorld } from './contracts';
import { calibrateOverhead, type Calibration } from './calibration';
import { markersInWorld } from './aruco';
import { MarkerTracker, type TrackedReading } from './tracker';
import { markersToWorld } from './markersToWorld';

/** Draft updates are separate from Confirm. Integrators own when simulate() runs. */
export class TableSession<T extends VisionWorld> {
  private tracker=new MarkerTracker();
  private planar:Calibration|null=null;
  private draft:T;
  private ready=false;
  constructor(private committed:T) { this.draft=committed; }
  reset(world:T) { this.committed=world;this.draft=world;this.planar=null;this.tracker.reset();this.ready=false; }
  setPlanarCalibration(value:Calibration|null) {this.planar=value;this.tracker.reset();this.ready=false;}
  process(markers:PixelMarker[],now:number):{ draft:T; readings:TrackedReading[]; calibration:Calibration|null; canConfirm:boolean } {
    const calibration=this.planar??calibrateOverhead(markers,this.committed);
    const readings=this.tracker.update(calibration?markersInWorld(markers,calibration):[],now);
    const b=this.committed.bbox;
    this.ready=Boolean(calibration && readings.some(r=>r.markerId>=10 && !r.held && r.confidence>=0.5 && r.pos.x>=b.minX && r.pos.x<=b.maxX && r.pos.y>=b.minY && r.pos.y<=b.maxY));
    if(calibration) this.draft=markersToWorld(readings.filter(r=>!r.held),this.draft);
    return {draft:this.draft,readings,calibration,canConfirm:this.ready};
  }
  confirm():T {
    if(!this.ready) throw new Error('Keep a movable marker visible inside a calibrated table before confirming.');
    this.committed=structuredClone(this.draft);
    return structuredClone(this.committed);
  }
}
