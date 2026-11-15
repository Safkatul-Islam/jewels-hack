'use client';

// app/gesture/page.tsx — P4
//
// The plan, driven by two hands in front of a webcam. Same layout as /plan on
// purpose — palette left, canvas centre, numbers right — because the point of
// this page is that the gesture replaces the mouse, not that the tool becomes a
// different tool. A demo that also rearranges the furniture makes it impossible
// to tell which change did what.
//
// This exists because the ArUco table (docs/04-TABLE-MODE.md) needs a printer
// and the printer is dead. It keeps what the table mode was actually for —
// moving the infrastructure with your hands, in front of an audience, without
// a mouse between you and the plan — and drops what the table mode needed:
// printed markers, a calibration pair, controlled overhead lighting, and a
// camera mounted above a surface.
//
// /plan is untouched. Nothing here is imported by it.

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { GestureCanvas } from '@/components/gesture/GestureCanvas';
import { PieceInspector } from '@/components/plan/PieceInspector';
import { PiecePalette } from '@/components/plan/PiecePalette';
import { PlaybackBar } from '@/components/plan/PlaybackBar';
import { ScenarioPicker } from '@/components/plan/ScenarioPicker';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { buildNetwork } from '@/lib/sim/network';
import { simulate } from '@/lib/sim/simulate';
import { usePlanStore } from '@/lib/store';

export default function GesturePage() {
  const world = usePlanStore((s) => s.world);
  const scenarioId = usePlanStore((s) => s.scenarioId);
  const loading = usePlanStore((s) => s.loading);
  const error = usePlanStore((s) => s.error);
  const result = usePlanStore((s) => s.result);
  const loadScenarioById = usePlanStore((s) => s.loadScenarioById);
  const clearPieces = usePlanStore((s) => s.clearPieces);
  const pieceCount = usePlanStore((s) => s.world?.pieces.length ?? 0);

  useEffect(() => {
    if (!world && !loading && !error) void loadScenarioById(scenarioId);
  }, [world, loading, error, scenarioId, loadScenarioById]);

  /** Same single integration point as /plan: once per committed edit. */
  const runPlan = useCallback(() => {
    const store = usePlanStore.getState();
    const current = store.world;
    if (!current) return;
    const net = buildNetwork(current);
    store.setNetwork(net);
    store.setResult(simulate(current, net));
  }, []);

  useEffect(() => {
    if (world && !result) runPlan();
  }, [world, result, runPlan]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          ARROYO
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <span className="rounded bg-foreground/90 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-background uppercase">
          Hands
        </span>
        <ScenarioPicker />
        {world && (
          <span className="hidden truncate text-xs text-muted-foreground md:block">
            {world.scenario.event}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/plan"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Mouse version
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">
            {pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}
            {result && ` · sim ${result.runtimeMs} ms`}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            disabled={pieceCount === 0}
            onClick={() => {
              clearPieces();
              runPlan();
            }}
          >
            Clear plan
          </Button>
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_380px]">
        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-r p-3 lg:flex">
          <PiecePalette />
          <Separator />
          <GestureLegend />
          <Separator />
          <PieceInspector onCommit={runPlan} />
        </aside>

        <section className="relative flex min-h-0 flex-col gap-3 p-3">
          <div className="relative min-h-0 flex-1">
            <GestureCanvas onCommit={runPlan} />
          </div>
          <PlaybackBar />
        </section>

        <aside className="min-h-0 overflow-y-auto border-l p-3">
          <MetricsReadout />
        </aside>
      </div>
    </main>
  );
}

/**
 * The gestures, written down. Not optional: there is no cursor drawn on the
 * canvas, so a first-time user has no way to discover that a pinch is the
 * clutch or that a fist recentres. Five lines of text is the whole onboarding.
 */
function GestureLegend() {
  const rows: { gesture: string; does: string }[] = [
    { gesture: 'Move a hand', does: 'highlights what you would grab' },
    { gesture: 'Pinch', does: 'pick it up · release to drop and re-simulate' },
    { gesture: 'Pinch + other hand', does: 'turn the piece you are holding' },
    { gesture: 'Pinch empty space', does: 'pan · both hands to zoom' },
    { gesture: 'Hold a fist', does: 'recentre on your hands' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium text-muted-foreground">Gestures</p>
      <dl className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.gesture} className="flex flex-col">
            <dt className="text-[11px] font-medium">{row.gesture}</dt>
            <dd className="text-[10px] leading-snug text-muted-foreground">{row.does}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The same raw readout /plan carries, for the same reason: it proves the wiring
 * — pinch a piece, drop it, network rebuilds, numbers move — before the real
 * dashboard exists. Replace with <Dashboard /> when components/dashboard/ lands.
 */
function MetricsReadout() {
  const result = usePlanStore((s) => s.result);
  const loading = usePlanStore((s) => s.loading);

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        Loading scenario…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        No result yet.
      </div>
    );
  }

  const m = result.metrics;
  const rows: { label: string; value: string }[] = [
    { label: 'Egress median', value: `${m.egressMedianMin.toFixed(1)} min` },
    { label: 'Egress p90', value: `${m.egressP90Min.toFixed(1)} min` },
    { label: 'Transit mode share', value: `${m.transitModeSharePct.toFixed(0)} %` },
    { label: 'Crowd peak', value: `${m.crowdPeakPerM2.toFixed(2)} /m²` },
    { label: 'Local revenue', value: `$${Math.round(m.localRevenueUsd).toLocaleString('en-US')}` },
    { label: 'Plan score', value: result.score.total.toFixed(1) },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <p className="text-xs font-medium">Run</p>
      <dl className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
            <dd className="text-sm tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {result.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
          {result.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
