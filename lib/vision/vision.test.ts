import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { calibrateOverhead, calibratePlanar } from './calibration';
import { detectMarkers, markersInWorld } from './aruco';
import { markersToWorld } from './markersToWorld';
import { MarkerTracker } from './tracker';
import { TableSession } from './session';
import { MARKER_MAP, DICTIONARY, type PixelMarker, type VisionWorld, type Vec2 } from './contracts';
import { validateWorld } from '../scenarios';
import { buildNetwork } from '../sim/network';
import { CameraController } from './camera';
import { advanceOverlayPose, markerOverlayPose, overlayAtRest, watchContextLoss } from './overlay';

const {AR}=createRequire(import.meta.url)('js-aruco2');
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const marker=(id:number,x:number,y:number):PixelMarker=>({id,corners:[{x:x-20,y:y-20},{x:x+20,y:y-20},{x:x+20,y:y+20},{x:x-20,y:y+20}]});
const world=():VisionWorld=>{
  const fixture=validateWorld(JSON.parse(readFileSync(new URL('../../fixtures/scenario-rosebowl.json',import.meta.url),'utf8')));
  return {...fixture,bbox:{minX:-1000,minY:-1000,maxX:3000,maxY:3000},venue:{...fixture.venue,pos:{x:100,y:200}},anchors:[{...fixture.anchors[0],pos:{x:100,y:1200}}],pieces:[{id:'hub',kind:'shuttle_hub',pos:{x:0,y:0},rotation:0,capacity:777}]};
};

test('camera releases late streams and an old play rejection cannot stop its replacement', async () => {
  const descriptors = ['window', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const stopped = [0, 0, 0];
  // Test doubles implement only the browser methods exercised by CameraController.
  const streams = stopped.map((_, index) => ({ getTracks: () => [{ stop: () => { stopped[index]++; } }] })) as unknown as MediaStream[];
  let request = 0;
  let rejectOldPlay!: (error: Error) => void;
  let signalPlay!: () => void;
  const firstPlayStarted = new Promise<void>(resolve => { signalPlay = resolve; });
  const oldPlay = new Promise<void>((_, reject) => { rejectOldPlay = reject; });
  let plays = 0;
  const video = { srcObject: null as MediaStream | null, pause() {},
    play: () => { if (plays++ === 0) { signalPlay(); return oldPlay; } return Promise.resolve(); },
  } as unknown as HTMLVideoElement;
  let deliverLate!: (stream: MediaStream) => void;
  const lateStream = new Promise<MediaStream>(resolve => { deliverLate = resolve; });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      assert.equal(constraints.audio, false);
      return request < 2 ? streams[request++] : lateStream;
    },
  } } });
  const camera = new CameraController(video);
  try {
    const first = camera.start();
    await firstPlayStarted;
    await camera.start();
    rejectOldPlay(new Error('superseded playback'));
    await assert.rejects(first, /superseded/);
    assert.equal(video.srcObject, streams[1]);
    assert.deepEqual(stopped, [1, 0, 0]);
    camera.stop();
    const late = camera.start();
    camera.stop();
    deliverLate(streams[2]);
    await late;
    assert.equal(video.srcObject, null);
    assert.deepEqual(stopped, [1, 1, 1]);
  } finally {
    camera.stop();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('the actual detector recognises every generated marker, including ID zero and a quarter turn',()=>{
  const dictionary=new AR.Dictionary(DICTIONARY), detector=new AR.Detector({dictionaryName:DICTIONARY,maxHammingDistance:4});
  for(const id of Object.keys(MARKER_MAP).map(Number))for(const rotate of [false,true]) {
    const width=240,height=240,data=new Uint8ClampedArray(width*height*4);data.fill(255);
    const svg=dictionary.generateSVG(id);
    for(const match of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(white|black)"\/>/g)) {
      const [,sx,sy,sw,sh,colour]=match;
      for(let y=20+Number(sy)*20;y<20+(Number(sy)+Number(sh))*20;y++)for(let x=20+Number(sx)*20;x<20+(Number(sx)+Number(sw))*20;x++){
        const px=rotate?width-1-y:x,py=rotate?x:y,index=(py*width+px)*4,value=colour==='black'?0:255;
        data[index]=value;data[index+1]=value;data[index+2]=value;
      }
    }
    const markers=detectMarkers(detector,{width,height,data} as ImageData);
    assert.deepEqual(markers.map(m=>m.id),[id],`id ${id}, rotated=${rotate}`);
  }
});
test('blank frame produces no markers',()=>{
  const data=new Uint8ClampedArray(240*240*4);data.fill(255);
  assert.deepEqual(detectMarkers(new AR.Detector({dictionaryName:DICTIONARY}),{width:240,height:240,data}as ImageData),[]);
});

test('3D overlay uses image coordinates, canonical heading and rejects degenerate detections', () => {
  const square = marker(10, 200, 200);
  const pose = markerOverlayPose(square, 720)!;
  close(pose.x, 200); close(pose.y, 520); close(pose.size, 40); close(pose.rotation, 0);
  const turned = { ...square, corners: [...square.corners.slice(1), square.corners[0]] };
  close(markerOverlayPose(turned, 720)!.rotation, -Math.PI / 2);
  assert.equal(markerOverlayPose({ ...square, corners: [] }, 720), null);
  assert.equal(markerOverlayPose({ ...square, corners: square.corners.map(() => ({ x: 1, y: 1 })) }, 720), null);
  assert.equal(markerOverlayPose(square, NaN), null);
});

test('3D interpolation crosses the angle seam by the short route and is frame-rate independent', () => {
  const start = { x: 0, y: 0, size: 40, rotation: Math.PI - 0.02 };
  const target = { x: 200, y: 100, size: 60, rotation: -Math.PI + 0.02 };
  const first = advanceOverlayPose(start, target, 1 / 60);
  assert.ok(first.rotation > start.rotation && first.rotation < Math.PI + 0.02);
  assert.ok(first.x > 0 && first.x < target.x);
  let sixty = start, thirty = start;
  for (let i = 0; i < 60; i++) sixty = advanceOverlayPose(sixty, target, 1 / 60);
  for (let i = 0; i < 30; i++) thirty = advanceOverlayPose(thirty, target, 1 / 30);
  close(sixty.x, thirty.x); close(sixty.rotation, thirty.rotation);
  assert.ok(overlayAtRest(sixty, target));
  assert.deepEqual(advanceOverlayPose(start, target, -1), start);
  assert.ok(advanceOverlayPose(start, target, 5).x < target.x);
  assert.deepEqual(start, { x: 0, y: 0, size: 40, rotation: Math.PI - 0.02 });
});

test('GPU context loss notifies the overlay and its listener is removed on teardown', () => {
  const canvas = new EventTarget();
  let failures = 0;
  const dispose = watchContextLoss(canvas, () => { failures++; });
  const loss = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(loss);
  assert.equal(failures, 1);
  assert.equal(loss.defaultPrevented, true);
  dispose();
  const afterUnmount = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(afterUnmount);
  assert.equal(failures, 1);
  assert.equal(afterUnmount.defaultPrevented, false);
});
test('overhead calibration honours image Y flip, world origin and scenario distance',()=>{
  const w=world(), calibration=calibrateOverhead([marker(0,200,400),marker(1,200,200)],w)!;
  const p=calibration.toWorld({x:300,y:300});close(p.x,600);close(p.y,700);
  const back=calibration.toPixel(p);close(back.x,300);close(back.y,300);
  w.anchors[0].pos.y=2200;
  close(calibrateOverhead([marker(0,200,400),marker(1,200,200)],w)!.toWorld({x:300,y:300}).x,1100);
  assert.equal(calibrateOverhead([marker(0,200,400)],w),null);
  assert.equal(calibrateOverhead([marker(0,200,400),marker(1,200,400)],w),null);
});
test('overhead calibration supports a rotated pair and preserves north-zero marker heading',()=>{
  const w=world(),markers=[marker(0,200,200),marker(1,400,200)];
  const calibration=calibrateOverhead(markers,w)!;
  const target=calibration.toWorld({x:400,y:200});close(target.x,100);close(target.y,1200);
  const reading=markersInWorld([marker(10,300,200)],calibration)[0];
  close(reading.rotation,-Math.PI/2);
});
test('four-point calibration rectifies genuine perspective, including interior points',()=>{
  const pixel=(u:number,v:number):Vec2=>({x:(200+600*u+80*v)/(1+0.3*u+0.15*v),y:(80+50*u+450*v)/(1+0.3*u+0.15*v)});
  const pixels=[pixel(0,0),pixel(1,0),pixel(1,1),pixel(0,1)];
  const corners=[{x:-100,y:500},{x:900,y:500},{x:900,y:-500},{x:-100,y:-500}];
  const calibration=calibratePlanar(pixels,corners),centre=calibration.toWorld(pixel(0.5,0.5));
  close(centre.x,400);close(centre.y,0);
  const back=calibration.toPixel({x:150,y:250}),expected=pixel(0.25,0.25);close(back.x,expected.x);close(back.y,expected.y);
  assert.throws(()=>calibratePlanar([{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}],corners));
  assert.throws(()=>calibratePlanar([pixels[0],pixels[2],pixels[1],pixels[3]],corners));
});
test('marker upsert is immutable, adopts baseline capacities, ignores invalid readings and protects locked pieces',()=>{
  const original=world(),snapshot=structuredClone(original);
  const read=(markerId:number,x=300)=>({markerId,pos:{x,y:500},rotation:0.2,confidence:1});
  const updated=markersToWorld([read(10),read(12),read(0),read(999),read(11,Infinity),read(13,99999)],original);
  assert.deepEqual(original,snapshot);assert.equal(updated.pieces.length,2);
  assert.equal(updated.pieces[0].id,'hub');assert.equal(updated.pieces[0].capacity,777);assert.equal(updated.pieces[0].fromMarker,10);
  const twice=markersToWorld([read(10,500)],updated);assert.equal(twice.pieces.length,2);assert.equal(twice.pieces[0].pos.x,500);
  twice.pieces[0].locked=true;
  assert.equal(markersToWorld([read(10,900)],twice).pieces[0].pos.x,500);
  assert.equal(markersToWorld([],original),original);
});
test('tracker suppresses jitter, wraps angles, expires held readings and resets long-lost samples',()=>{
  const tracker=new MarkerTracker(),reading=(x:number,rotation=0)=>({markerId:10,pos:{x,y:0},rotation,confidence:1});
  tracker.update([reading(100)],0);
  close(tracker.update([reading(104)],100)[0].pos.x,100);
  assert.equal(tracker.update([],500)[0].held,true);assert.deepEqual(tracker.update([],601),[]);
  close(tracker.update([reading(500)],1000)[0].pos.x,500);
  tracker.reset();tracker.update([reading(0,Math.PI-0.02)],0);
  assert.ok(Math.abs(tracker.update([reading(0,-Math.PI+0.02)],100)[0].rotation)>3);
});
test('Confirm snapshots the draft and refuses stale/missing calibration and out-of-bounds pieces',()=>{
  const session=new TableSession(world());assert.throws(()=>session.confirm());
  const anchors=[marker(0,200,400),marker(1,200,200)];
  const state=session.process([...anchors,marker(10,300,300)],0);assert.equal(state.canConfirm,true);
  const confirmed=session.confirm();confirmed.pieces[0].pos.x=999;
  close(session.confirm().pieces[0].pos.x,600);
  session.process([],600);assert.throws(()=>session.confirm());
  assert.equal(session.process([...anchors,marker(10,9999,300)],700).canConfirm,false);
  session.reset(world());assert.throws(()=>session.confirm());
});

test('a stationary uncertain marker disables Confirm and recovers without moving', () => {
  const session = new TableSession(world());
  const anchors = [marker(0, 200, 400), marker(1, 200, 200)];
  const movable = marker(10, 300, 300);
  assert.equal(session.process([...anchors, movable], 0).canConfirm, true);
  // A correctable but weak dictionary match must not inherit an earlier frame's confidence.
  const uncertain = { ...movable, hammingDistance: 4 };
  const degraded = session.process([...anchors, uncertain], 100);
  close(degraded.readings.find(reading => reading.markerId === 10)!.confidence, 1 / 3);
  assert.equal(degraded.canConfirm, false);
  assert.throws(() => session.confirm());
  assert.equal(session.process([...anchors, uncertain], 200).canConfirm, false);
  assert.equal(session.process([...anchors, movable], 300).canConfirm, true);
});
test('both committed scenarios have connected 30-node networks, expected populations and block exits that are real engine junctions',()=>{
  for(const id of ['rosebowl','downtown']){
    const scenario=validateWorld(JSON.parse(readFileSync(new URL(`../../fixtures/scenario-${id}.json`,import.meta.url),'utf8')));
    assert.equal(scenario.businesses.length,40);assert.equal(scenario.blocks.length,12);assert.equal(scenario.personas.length,6);assert.equal(scenario.anchors.length,2);
    close(scenario.anchors.reduce((sum:number,a:{arrivalShare:number})=>sum+a.arrivalShare,0),1);
    const graph=new Map<string,Set<string>>(),key=(p:Vec2)=>`${p.x},${p.y}`;
    for(const road of scenario.baseRoads){const a=key(road.path[0]),b=key(road.path[1]);if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a)!.add(b);graph.get(b)!.add(a);}
    assert.equal(graph.size,30);const seen=new Set<string>(),queue=[key(scenario.venue.pos)];
    while(queue.length){const current=queue.pop()!;if(seen.has(current))continue;seen.add(current);queue.push(...graph.get(current)!);}
    assert.equal(seen.size,30);for(const anchor of scenario.anchors)assert.ok(seen.has(key(anchor.pos)));
    assert.match(scenario.scenario.blurb,/Synthetic/);
    // Block exits must be IDs the engine really creates, at the block's own four corners.
    const nodes=new Map(buildNetwork({...scenario,pieces:[]}).nodes.map(node=>[node.id,node.pos]));
    for(const block of scenario.blocks){
      assert.equal(new Set(block.accessNodeIds).size,4);
      const xs=block.polygon.map((p:Vec2)=>p.x),ys=block.polygon.map((p:Vec2)=>p.y);
      const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
      const nearest=[...nodes].sort((p,q)=>Math.hypot(p[1].x-cx,p[1].y-cy)-Math.hypot(q[1].x-cx,q[1].y-cy)).slice(0,4).map(([id])=>id);
      assert.deepEqual([...block.accessNodeIds].sort(),nearest.sort(),`${block.id} exits are not its four nearest engine junctions`);
    }
  }
});
