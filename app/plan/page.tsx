'use client';

// app/plan/page.tsx — P1 owns this file.
//
// It is where P1's canvas and P2's dashboard meet, and the layout was agreed in
// the first twenty minutes: CANVAS LEFT, DASHBOARD RIGHT. Please don't rearrange
// it after T+0:20 — see docs/01-ARCHITECTURE.md.
//
// P2: replace <DashboardSlot /> with your <Dashboard /> and delete the slot.
// P3: `runPlan` below is the single integration point for the engine. It is
//     called once per committed edit — on drop, not during drag.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PieceInspector } from '@/components/plan/PieceInspector';
import { PiecePalette } from '@/components/plan/PiecePalette';
import { PlanCanvas } from '@/components/plan/PlanCanvas';
import { ScenarioPicker } from '@/components/plan/ScenarioPicker';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { usePlanStore } from '@/lib/store';

export default function PlanPage() {
  const world = usePlanStore((s) => s.world);
  const scenarioId = usePlanStore((s) => s.scenarioId);
  const loading = usePlanStore((s) => s.loading);
  const error = usePlanStore((s) => s.error);
  const loadScenarioById = usePlanStore((s) => s.loadScenarioById);
  const clearPieces = usePlanStore((s) => s.clearPieces);
  const pieceCount = usePlanStore((s) => s.world?.pieces.length ?? 0);

  // Proof that the commit path fires, until the engine replaces it. Visible on
  // purpose: at INTEGRATION 1 the number should be replaced by real metrics, and
  // if it stops ticking, the wiring broke rather than the engine.
  const [edits, setEdits] = useState(0);

  useEffect(() => {
    if (!world && !loading && !error) void loadScenarioById(scenarioId);
  }, [world, loading, error, scenarioId, loadScenarioById]);

  const runPlan = useCallback(() => {
    // ⛔ INTEGRATION 1 (T+2:00) — replace the counter with:
    //
    //   const net = buildNetwork(world);
    //   setResult(simulate(world, net));
    //
    // Keep it synchronous and keep it client-side. Dragging a piece must not
    // make an HTTP request (AGENTS.md §2.2).
    setEdits((n) => n + 1);
  }, []);

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          ARROYO
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <ScenarioPicker />
        {world && (
          <span className="hidden truncate text-xs text-muted-foreground md:block">
            {world.scenario.event}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'} · {edits} {edits === 1 ? 'edit' : 'edits'}
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
          <PieceInspector onCommit={runPlan} />
        </aside>

        <section className="min-h-0 p-3">
          <PlanCanvas onCommit={runPlan} />
        </section>

        <aside className="min-h-0 overflow-y-auto border-l p-3">
          <DashboardSlot />
        </aside>
      </div>
    </main>
  );
}

/**
 * ⛔ P2 REPLACES THIS with <Dashboard /> from components/dashboard/.
 * It is here so the layout is real and the column widths are settled before the
 * dashboard exists — not as a design.
 */
function DashboardSlot() {
  return (
    <div className="flex h-full flex-col items-start gap-2 rounded-xl border border-dashed p-4">
      <p className="text-xs font-medium">Dashboard — P2</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Metric cards, score dial, three weight sliders, egress chart, persona panel. Render{' '}
        <code className="rounded bg-muted px-1">fixtures/mock-result.ts</code> here and do not wait
        for the engine. Replace this slot in <code className="rounded bg-muted px-1">app/plan/page.tsx</code>.
      </p>
    </div>
  );
}
