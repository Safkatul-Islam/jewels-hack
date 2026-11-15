'use client';

// app/plan/page.tsx — P1 owns this file.
//
// It is where P1's canvas and P2's dashboard meet, and the layout was agreed in
// the first twenty minutes: CANVAS LEFT, DASHBOARD RIGHT. Please don't rearrange
// it after T+0:20 — see docs/01-ARCHITECTURE.md.
//
// P3: `runPlan` below is the single integration point for the engine. It is
//     called once per committed edit — on drop, not during drag.
//
// ---- on the look ----
//
// The page is in the same instrument language as `/`: ink surfaces, hairline
// rules, 10px wide-tracked mono labels, one accent the user picks.
//
// It gets there by turning `.dark` ON rather than by restyling anything in the
// middle. The project already ships a full dark palette — canvas, roads,
// pieces, shadcn controls all have `.dark` values — and /plan simply never
// switched it on. So the canvas, the piece layers and the voice dock theme
// themselves, and NONE of those files had to be touched. `.console` then adds
// the night tokens on top, for this page's own chrome only.

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ConversationProvider } from '@elevenlabs/react';
import { AccentProvider } from '@/components/home/AccentProvider';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { AccentSelector } from '@/components/home/AccentSelector';
import { PieceInspector } from '@/components/plan/PieceInspector';
import { VoiceDock } from '@/components/voice/VoiceDock';
import { PiecePalette } from '@/components/plan/PiecePalette';
import { PlanCanvas } from '@/components/plan/PlanCanvas';
import { PlaybackBar } from '@/components/plan/PlaybackBar';
import { ScenarioPicker } from '@/components/plan/ScenarioPicker';
import { buildNetwork } from '@/lib/sim/network';
import { simulate } from '@/lib/sim/simulate';
import { usePlanStore } from '@/lib/store';

export default function PlanPage() {
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

  /**
   * The engine. Called once per committed edit — on drop, never during a drag
   * (AGENTS.md §2.7) — and synchronously on the client, so dragging a piece
   * makes no HTTP request (§2.2).
   *
   * The world is read from the store with getState() rather than from the
   * `world` binding above: the piece layer mutates the store and *then* calls
   * onCommit inside the same event, so the rendered `world` is still the
   * pre-drop one at this point. Reading it here is what makes the number change
   * on the drop that caused it rather than one drop late.
   */
  const runPlan = useCallback(() => {
    const store = usePlanStore.getState();
    const current = store.world;
    if (!current) return;
    const net = buildNetwork(current);
    // The network is kept, not just consumed: RoadLayer draws it, so the roads
    // the user sees are the regenerated ones rather than the scenario's seeds.
    store.setNetwork(net);
    store.setResult(simulate(current, net));
  }, []);

  // First run for a freshly loaded scenario, so the readout has numbers before
  // anything is touched — the demo is the numbers *changing*, which needs a
  // before. Guarded on `result` being null, which loadScenarioById resets.
  useEffect(() => {
    if (world && !result) runPlan();
  }, [world, result, runPlan]);

  return (
    // The provider holds the ElevenLabs session and the registry the advisor's
    // client tools register into. It opens no connection until VoiceDock calls
    // startSession, so the page costs nothing extra until someone asks to talk.
    <AccentProvider>
      <ConversationProvider>
        <main className="console dark flex h-dvh flex-col overflow-hidden bg-[var(--ink)] text-[var(--bone)]">
          <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--night-hairline)] px-4 py-2.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.26em] uppercase transition-opacity hover:opacity-70"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--night-accent)]" />
              Arroyo
            </Link>

            <span aria-hidden className="h-4 w-px bg-[var(--night-hairline)]" />

            <ScenarioPicker />

            {world && (
              <span className="hidden truncate font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase lg:block">
                {world.scenario.event}
              </span>
            )}

            <dl className="ml-auto flex items-center gap-x-5 font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase tabular-nums">
              <div className="flex gap-1.5">
                <dt>Pieces</dt>
                <dd className="font-medium text-[var(--bone)]">{pieceCount}</dd>
              </div>
              {result && (
                <div className="hidden gap-1.5 sm:flex">
                  <dt>Sim</dt>
                  <dd className="font-medium text-[var(--bone)]">{result.runtimeMs} ms</dd>
                </div>
              )}
            </dl>

            <span aria-hidden className="hidden h-4 w-px bg-[var(--night-hairline)] lg:block" />
            <AccentSelector />

            <button
              type="button"
              disabled={pieceCount === 0}
              onClick={() => {
                clearPieces();
                runPlan();
              }}
              className="rounded-[2px] border border-[var(--night-hairline)] px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors hover:border-[var(--night-accent)] hover:text-[var(--night-accent)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--night-hairline)] disabled:hover:text-current"
            >
              Clear plan
            </button>
          </header>

          {error && (
            <div className="shrink-0 border-b border-[var(--night-hairline)] bg-[color-mix(in_oklab,var(--piece-closure),transparent_88%)] px-4 py-2 font-mono text-[10px] tracking-[0.12em] text-[var(--piece-closure)] uppercase">
              {error}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[216px_minmax(0,1fr)_380px]">
            <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-r border-[var(--night-hairline)] p-3.5 lg:flex">
              <PiecePalette />
              <span aria-hidden className="h-px w-full shrink-0 bg-[var(--night-hairline)]" />
              <PieceInspector onCommit={runPlan} />
            </aside>

            {/* The dock is positioned against this section, so the advisor sits
                over the canvas rather than over the dashboard column. Nothing
                inside here is restyled — the canvas and the dock theme
                themselves from `.dark`. */}
            <section className="relative flex min-h-0 flex-col gap-3 p-3">
              {/* The plan above, the run it produced below. The timeline is a
                  consequence of the canvas, so it sits under it rather than in
                  the dashboard column, which answers a different question. */}
              <div className="relative min-h-0 flex-1">
                <PlanCanvas onCommit={runPlan} />
              </div>
              <PlaybackBar />
              <VoiceDock />
            </section>

            <aside className="min-h-0 overflow-y-auto border-l border-[var(--night-hairline)] p-3.5">
              <Dashboard />
            </aside>
          </div>
        </main>
      </ConversationProvider>
    </AccentProvider>
  );
}
