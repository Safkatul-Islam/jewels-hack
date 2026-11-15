'use client';

// components/plan/PlaybackBar.tsx — P1
//
// Running the simulation, as something you watch rather than something you read
// off a panel.
//
// The track is not a slider with a chart next to it — the track IS the egress
// curve. SimResult.timeline gives, per minute, how many people are still inside
// the venue and how many are on foot, on a shuttle and in a car; those four
// stack into the shape of the whole run. Scrubbing moves a playhead across it,
// and the canvas (FlowLayer) renders the same minute.
//
// Everything here is read from the engine's own output. The only invention is
// the playback RATE — the run is replayed over a fixed wall-clock duration,
// because an egress window is an hour and a demo is not.

import { useCallback, useEffect, useRef } from 'react';
import { usePlanStore } from '@/lib/store';
import type { SimResult } from '@/lib/sim/types';

/** Wall-clock seconds to replay the whole timeline. */
const REPLAY_SECONDS = 9;
const TICK_MS = 80;

const BANDS = [
  { key: 'inside', label: 'inside', color: 'var(--venue)' },
  { key: 'onFoot', label: 'on foot', color: 'var(--piece-ped)' },
  { key: 'onShuttle', label: 'on shuttle', color: 'var(--piece-shuttle)' },
  { key: 'inCar', label: 'in car', color: 'var(--piece-parking)' },
] as const;

type BandKey = (typeof BANDS)[number]['key'];

function frameAt(result: SimResult, minute: number) {
  const tl = result.timeline;
  const idx = tl.findIndex((f) => f.minute >= minute);
  if (idx <= 0) return tl[0];
  const a = tl[idx - 1];
  const b = tl[idx];
  const span = b.minute - a.minute || 1;
  const k = (minute - a.minute) / span;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  return {
    minute,
    inside: mix(a.inside, b.inside),
    onFoot: mix(a.onFoot, b.onFoot),
    onShuttle: mix(a.onShuttle, b.onShuttle),
    inCar: mix(a.inCar, b.inCar),
  };
}

export function PlaybackBar() {
  const result = usePlanStore((s) => s.result);
  const playMinute = usePlanStore((s) => s.playMinute);
  const playing = usePlanStore((s) => s.playing);
  const setPlayMinute = usePlanStore((s) => s.setPlayMinute);
  const setPlaying = usePlanStore((s) => s.setPlaying);

  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const timeline = result?.timeline ?? [];
  const first = timeline[0]?.minute ?? 0;
  const last = timeline[timeline.length - 1]?.minute ?? 0;
  const span = Math.max(last - first, 1);

  // The clock. One interval, started only while playing, so an idle page costs
  // nothing. Reading the playhead from the store inside the tick (rather than
  // closing over it) keeps the effect from restarting on every frame.
  useEffect(() => {
    if (!playing || timeline.length < 2) return;
    const step = span / ((REPLAY_SECONDS * 1000) / TICK_MS);
    const id = window.setInterval(() => {
      const s = usePlanStore.getState();
      const at = s.playMinute ?? first;
      const next = at + step;
      if (next >= last) {
        s.setPlayMinute(last);
        s.setPlaying(false);
      } else {
        s.setPlayMinute(next);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, timeline.length, span, first, last]);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const k = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      setPlayMinute(first + k * span);
    },
    [first, span, setPlayMinute],
  );

  if (!result || timeline.length < 2) {
    return (
      <div className="flex h-[58px] shrink-0 items-center gap-2 rounded-[2px] border border-dashed border-[var(--night-hairline)] px-3 font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase">
        Place a piece to run the plan — the egress timeline appears here.
      </div>
    );
  }

  const peak = Math.max(
    ...timeline.map((f) => f.inside + f.onFoot + f.onShuttle + f.inCar),
    1,
  );
  const atEnd = playMinute !== null && playMinute >= last - 1e-6;

  // The resting state of this bar is the PEAK minute, not the last one. An
  // egress timeline ends with everyone home, so defaulting to `last` shows four
  // zeros and reads as a broken readout rather than as a finished evacuation.
  const moving = (f: (typeof timeline)[number]) => f.onFoot + f.onShuttle + f.inCar;
  const peakMinute = timeline.reduce((best, f) => (moving(f) > moving(best) ? f : best), timeline[0])
    .minute;

  const shown = playMinute ?? peakMinute;
  const frame = frameAt(result, shown);
  const headPct = (((shown - first) / span) * 100).toFixed(2);

  // Two readings of the same run, on one normalisation so the proportions stay
  // honest. `inside` is a STOCK — the stadium draining — and it dwarfs
  // everything else, so it goes behind as a faint silhouette. The three
  // in-motion bands stack on the baseline in full colour, because where people
  // ARE is what the canvas beside this bar is showing.
  const x = (minute: number) => (((minute - first) / span) * 100).toFixed(2);
  const y = (v: number) => (100 - (v / peak) * 100).toFixed(2);

  const areaFrom = (tops: number[]) =>
    'M' +
    timeline.map((f) => `${x(f.minute)},100`).join('L') +
    'L' +
    timeline
      .map((f, i) => ({ f, i }))
      .reverse()
      .map(({ f, i }) => `${x(f.minute)},${y(tops[i])}`)
      .join('L') +
    'Z';

  const insideArea = areaFrom(timeline.map((f) => f.inside));

  const movingAreas = (() => {
    const base = timeline.map(() => 0);
    return BANDS.filter((b) => b.key !== 'inside').map((band) => {
      const top = timeline.map((f, i) => base[i] + f[band.key as BandKey]);
      const d =
        'M' +
        timeline.map((f, i) => `${x(f.minute)},${y(base[i])}`).join('L') +
        'L' +
        timeline
          .map((f, i) => ({ f, i }))
          .reverse()
          .map(({ f, i }) => `${x(f.minute)},${y(top[i])}`)
          .join('L') +
        'Z';
      for (let i = 0; i < base.length; i++) base[i] = top[i];
      return { ...band, d };
    });
  })();

  return (
    <div className="flex h-[58px] shrink-0 items-center gap-3 rounded-[2px] border border-[var(--night-hairline)] bg-[var(--ink)] px-3">
      <button
        type="button"
        aria-label={playing ? 'Pause the run' : 'Play the run'}
        onClick={() => {
          if (playing) {
            setPlaying(false);
            return;
          }
          // Starting from the end means replaying, not sitting still.
          if (playMinute === null || atEnd) setPlayMinute(first);
          setPlaying(true);
        }}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bone)] text-[var(--ink)] transition-opacity hover:opacity-85"
      >
        {playing ? (
          <svg viewBox="0 0 10 10" className="size-3 fill-current">
            <rect x={1} y={0.5} width={2.75} height={9} rx={0.6} />
            <rect x={6.25} y={0.5} width={2.75} height={9} rx={0.6} />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" className="size-3 fill-current">
            <path d="M1.5 0.6 9 5 1.5 9.4Z" />
          </svg>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Egress timeline"
          aria-valuemin={first}
          aria-valuemax={last}
          aria-valuenow={Math.round(shown)}
          className="relative h-7 cursor-ew-resize overflow-hidden rounded-[2px] bg-[color-mix(in_oklab,var(--night-hairline),transparent_55%)]"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubbing.current = true;
            setPlaying(false);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) seekFromPointer(e.clientX);
          }}
          onPointerUp={(e) => {
            scrubbing.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const d = (e.key === 'ArrowRight' ? 1 : -1) * (span / 40);
            setPlayMinute(Math.min(Math.max(shown + d, first), last));
          }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            <path d={insideArea} fill="var(--venue)" fillOpacity={0.14} />
            {movingAreas.map((a) => (
              <path key={a.key} d={a.d} fill={a.color} fillOpacity={0.75} />
            ))}
          </svg>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-[var(--bone)]"
            style={{ left: `${headPct}%` }}
          />
        </div>

        <div className="flex items-center gap-3 overflow-hidden font-mono text-[10px] tracking-[0.12em] text-[var(--night-dim)] uppercase tabular-nums">
          <span className="shrink-0 font-medium text-[var(--bone)]">
            {Math.round(shown)} min
            {playMinute === null && <span className="ml-1 opacity-60">peak</span>}
          </span>
          {BANDS.map((b) => (
            <span key={b.key} className="flex shrink-0 items-center gap-1">
              <span
                aria-hidden
                className="size-[6px] rounded-full"
                style={{ background: b.color }}
              />
              {frame[b.key as BandKey].toLocaleString('en-US')} {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
