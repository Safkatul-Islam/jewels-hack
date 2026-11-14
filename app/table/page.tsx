'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScenarioPicker } from '@/components/plan/ScenarioPicker';
import { PIECE_META } from '@/lib/pieces';
import type { WorldState } from '@/lib/sim/types';
import { usePlanStore } from '@/lib/store';
import { MARKER_MAP, PIECE_LABELS } from '@/lib/vision/contracts';
import { centre } from '@/lib/vision/calibration';
import { DraftPlan } from './DraftPlan';
import { useTableCapture } from './useTableCapture';

const MarkerScene = dynamic(
  () => import('@/components/three/MarkerScene').then((module) => module.MarkerScene),
  { ssr: false, loading: () => <span className="sr-only">Loading 3D overlay…</span> },
);

/** Resolve P1's CSS colours through the browser, including its OKLCH tokens. */
function readModelColors(): Record<string, string> {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return {};
  const tokens = {
    venue: '--venue', anchor: '--anchor',
    ...Object.fromEntries(Object.entries(PIECE_META).map(([kind, meta]) => [kind, meta.color.slice(4, -1)])),
  };
  return Object.fromEntries(Object.entries(tokens).map(([kind, token]) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [kind, `rgb(${r}, ${g}, ${b})`];
  }));
}

export default function TablePage() {
  const world = usePlanStore((state) => state.world);
  const scenarioId = usePlanStore((state) => state.scenarioId);
  const loading = usePlanStore((state) => state.loading);
  const error = usePlanStore((state) => state.error);
  const loadScenarioById = usePlanStore((state) => state.loadScenarioById);
  const [show3D, setShow3D] = useState(false);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<WorldState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!world && !loading && !error) void loadScenarioById(scenarioId);
  }, [error, loadScenarioById, loading, scenarioId, world]);

  const commitPlan = useCallback((next: WorldState) => {
    const store = usePlanStore.getState();
    store.setWorld(next);
    store.setResult(null);
    setConfirmed(next);
  }, []);

  const capture = useTableCapture(world, commitPlan);
  const { view } = capture;
  const currentSnapshot = confirmed?.scenario.id === world?.scenario.id ? confirmed : null;
  const visible = view.readings.filter((reading) => reading.markerId >= 10 && !reading.held);

  function downloadPlan() {
    if (!currentSnapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(currentSnapshot, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentSnapshot.scenario.id}-table-plan.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-4 border-b px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.18em]">ARROYO</Link>
        <span className="text-xs text-muted-foreground">TABLE / P4</span>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <a href="/markers/index.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Print markers ↗</a>
          <Link href="/plan" className="underline underline-offset-4">Open planner ↗</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] tracking-[0.2em] text-muted-foreground">PHYSICAL IDEAS. VISIBLE TRADEOFFS.</p>
            <h1 className="text-3xl font-medium tracking-tight md:text-4xl">Bring the plan to the table.</h1>
            <p className="mt-2 text-sm text-muted-foreground">Move a printed piece. Confirm it into the shared planner.</p>
          </div>
          <ScenarioPicker />
        </div>
        {error && <p role="alert" className="mb-5 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4 text-xs">
              <span>01 / Table view</span>
              <span className="text-muted-foreground" aria-live="off">
                {view.source ? `${view.markers.length} markers · ${Math.round(view.processingMs)} ms processing` : 'Camera off'}
              </span>
            </div>
            <div
              className="relative w-full overflow-hidden bg-muted"
              style={{ aspectRatio: `${view.width}/${view.height}` }}
              onPointerDown={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                capture.selectCorner({ x: (event.clientX - rect.left) / rect.width * view.width,
                  y: (event.clientY - rect.top) / rect.height * view.height });
              }}
            >
              <video ref={capture.videoRef} muted playsInline className="hidden" aria-hidden="true" />
              <canvas ref={capture.canvasRef} width={1280} height={720} className="block h-full w-full" aria-label="Marker camera input" />
              <svg viewBox={`0 0 ${view.width} ${view.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                {view.markers.map((marker) => {
                  const point = centre(marker);
                  return (
                    <g key={marker.id}>
                      <polygon points={marker.corners.map((corner) => `${corner.x},${corner.y}`).join(' ')} fill="none" stroke={marker.id < 10 ? '#d6a64c' : '#1b9572'} strokeWidth={3} />
                      <rect x={point.x - 21} y={point.y - 15} width={42} height={30} fill="#16292a" />
                      <text x={point.x} y={point.y + 7} textAnchor="middle" fill="white" fontSize={20}>{marker.id}</text>
                    </g>
                  );
                })}
                {capture.points.map((point, index) => (
                  <g key={index}><circle cx={point.x} cy={point.y} r={8} fill="#d6a64c" /><text x={point.x + 12} y={point.y} fontSize={20} fill="#a47924">{index + 1}</text></g>
                ))}
              </svg>
              {show3D && view.source && <MarkerScene markers={view.markers} width={view.width} height={view.height} colors={colors} />}
              {!view.source && (
                <div className="pointer-events-none absolute inset-0 grid place-content-center p-6 text-center">
                  <p className="text-3xl font-light">Your table, connected.</p>
                  <p className="mt-3 text-sm text-muted-foreground">Start a camera, open a local recording,<br />or try generated marker images.</p>
                </div>
              )}
              <p className="pointer-events-none absolute bottom-3 left-3 rounded bg-background/90 px-3 py-1 text-[9px] tracking-wider">
                {view.source === 'test' ? 'GENERATED MARKER TEST · NO CAMERA' : 'LOCAL PROCESSING · NO VIDEO UPLOAD'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 border-t p-4">
              <Button size="sm" disabled={!world || capture.busy} onClick={() => void capture.startCamera()}>Start camera</Button>
              <Button size="sm" variant="outline" disabled={!view.source && !capture.busy} onClick={capture.stop}>Stop</Button>
              <select aria-label="Camera device" value={capture.deviceId} className="rounded-md border bg-background px-2 text-xs" onChange={(event) => {
                capture.setDeviceId(event.target.value);
                if (view.source === 'camera') void capture.startCamera(event.target.value);
              }}>
                <option value="">Default camera</option>
                {capture.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
              </select>
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void capture.loadFile(file);
                event.target.value = '';
              }} />
              <Button size="sm" variant="outline" disabled={!world || capture.busy} onClick={() => fileRef.current?.click()}>Open image / video</Button>
              <Button size="sm" variant="outline" disabled={!world || capture.busy} onClick={() => void capture.loadTest()}>Load marker test</Button>
            </div>
            {view.source === 'test' && (
              <label className="flex flex-wrap items-center gap-4 border-t bg-muted/50 px-4 py-3 text-xs">
                Generated test / shuttle position
                <input aria-label="Test shuttle position" type="range" min={0} max={100} value={capture.testPosition} onChange={(event) => capture.changeTestPosition(Number(event.target.value))} />
                <span className="text-muted-foreground">Real detector, synthetic input</span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t p-4 text-xs">
              <label className="flex flex-col gap-1.5">Calibration
                <select aria-label="Calibration mode" value={capture.mode} onChange={(event) => capture.changeMode(event.target.value === 'planar' ? 'planar' : 'overhead')} className="rounded-md border bg-background px-3 py-2">
                  <option value="overhead">Overhead · markers 0 + 1</option>
                  <option value="planar">Angled · four table corners</option>
                </select>
              </label>
              <Button size="sm" variant="outline" disabled={capture.mode !== 'planar' || !view.source} onClick={capture.beginCalibration}>Select 4 corners</Button>
              <label className="ml-auto flex items-center gap-2"><input type="checkbox" checked={show3D} onChange={(event) => {
                if (event.target.checked) setColors(readModelColors());
                setShow3D(event.target.checked);
              }} />3D primitives</label>
            </div>
            <p role="status" className="min-h-16 border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">{capture.status}</p>
          </section>
          <aside className="rounded-xl border p-5">
            <div className="mb-4 flex justify-between text-xs"><span>02 / Planning surface</span><span className="text-muted-foreground">DRAFT</span></div>
            {view.draft ? <DraftPlan world={view.draft} /> : <p className="py-16 text-center text-sm text-muted-foreground">{loading ? 'Loading scenario…' : 'No scenario loaded.'}</p>}
            <div className="my-5 grid grid-cols-2 gap-4 text-center">
              <div><strong className="text-2xl font-medium">{visible.length}</strong><p className="mt-1 text-[10px] text-muted-foreground">visible pieces</p></div>
              <div><strong className="text-2xl font-medium">{view.calibrated ? capture.mode === 'planar' ? '4 PT' : '0 + 1' : '—'}</strong><p className="mt-1 text-[10px] text-muted-foreground">calibration</p></div>
            </div>
            <div className="min-h-20 space-y-2 border-t pt-3 text-[11px]">
              {view.readings.filter((reading) => reading.markerId >= 10).map((reading) => (
                <div key={reading.markerId} className="flex justify-between gap-2"><span>{reading.markerId} / {PIECE_LABELS[MARKER_MAP[reading.markerId]]}</span><span className="text-muted-foreground">{Math.round(reading.pos.x)}, {Math.round(reading.pos.y)} m{reading.held ? ' · held' : ''}</span></div>
              ))}
              {!visible.length && <p className="leading-relaxed text-muted-foreground">Keep a movable marker inside the calibrated table area.</p>}
            </div>
            <Button className="mt-5 w-full" disabled={!view.canConfirm || capture.busy} onClick={capture.confirm}>Confirm plan ↗</Button>
            <Button className="mt-2 w-full" variant="outline" disabled={!currentSnapshot} onClick={downloadPlan}>Export confirmed JSON</Button>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Confirm writes to P1’s shared store. P3’s simulation is not connected yet; no metrics are invented here.</p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Two markers support overhead views. Four-point calibration handles the table plane in a fixed angled view; the 3D layer remains orthographic.</p>
          </aside>
        </div>
        <footer className="mt-6 flex flex-wrap justify-between gap-3 border-t pt-4 text-[10px] text-muted-foreground"><span>ARROYO / Next.js + React Three Fiber</span><span>Synthetic scenarios · no official plans or forecasts</span></footer>
      </div>
    </main>
  );
}
