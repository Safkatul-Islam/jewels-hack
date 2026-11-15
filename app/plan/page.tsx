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

import { useCallback, useEffect, useRef } from 'react';
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
import { buildNetwork, shortestPathsFrom } from '@/lib/sim/network';
import { simulate } from '@/lib/sim/simulate';
import type { RoadNetwork, SimResult } from '@/lib/sim/types';
import { usePlanStore } from '@/lib/store';
import { buildFacility } from '@/components/plan/facilityGeometry';
import { makeBlocker } from '@/components/plan/packing';

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
  // The no-piece baseline, kept across drops. It depends on the scenario and on
  // anything draggable that is NOT a piece — a shop moved by hand changes the
  // baseline it should be judged against — but never on the plan itself, so
  // recomputing it per drop was simply running the simulation twice.
  const baselineCache = useRef<{ key: string; result: SimResult; net: RoadNetwork } | null>(null);

  const runPlan = useCallback(() => {
    const store = usePlanStore.getState();
    let current = store.world;
    if (!current) return;

    // ---- pack the site, THEN simulate what fitted ----
    //
    // For the kinds measured in area, capacity is an output, not an input. The
    // stalls are laid into whatever ground is free once the venue, the roads
    // and the neighbouring facilities have taken theirs (packing.ts), and the
    // count that comes back replaces Piece.capacity — which is the number
    // simulate() reads. Push a vendor village into a park-and-ride and the lot
    // loses spaces, which loses transit share, which moves the egress median
    // and the plan score.
    //
    // The footprint is sized from what was REQUESTED, not from what fitted:
    // the land is taken either way, and deriving it from the fitted count
    // would shrink the lot, which would change the packing, which would shrink
    // it again.
    const PACKED_KINDS = new Set(['park_and_ride', 'vendor_village', 'bike_valet']);
    if (current.pieces.some((p) => PACKED_KINDS.has(p.kind))) {
      const fitted = new Map<string, number>();
      for (const piece of current.pieces) {
        if (!PACKED_KINDS.has(piece.kind)) continue;
        const asked = store.requested[piece.id] ?? piece.capacity;
        const atRequestedSize = { ...piece, capacity: asked };
        const drawing = buildFacility(
          piece.kind,
          asked,
          makeBlocker(current, atRequestedSize),
        );
        // Capped at the request. True stall dimensions pack a little tighter
        // than the area-per-space the footprint was sized with, so clear
        // ground would otherwise hand back MORE than was asked for — which
        // reads as a bug, not a feature. The direction that matters is down.
        fitted.set(piece.id, Math.min(drawing.drawnUnits, asked));
      }
      for (const [id, capacity] of fitted) store.setFittedCapacity(id, capacity);
      current = usePlanStore.getState().world ?? current;
    }

    const net = buildNetwork(current);
    // The network is kept, not just consumed: RoadLayer draws it, so the roads
    // the user sees are the regenerated ones rather than the scenario's seeds.
    store.setNetwork(net);
    store.setResult(simulate(current, net));

    // Which streets this plan costs, as opposed to how many. The engine scores
    // livability off `residentsBlockedPct`, a single number for the whole
    // world; the canvas has to point at the houses. Same comparison the engine
    // makes internally (simulate.ts) — drive time from each block's access
    // nodes to the primary anchor, now versus a plan with nothing placed.
    //
    // Two Dijkstras, not two per block: roads are two-way, so one pass out
    // from the anchor gives the time from every node to it.
    // The same world with nothing placed. Everything the canvas says about
    // "what your plan did" is measured against this, not against the shops'
    // ordinary trading day: perBusiness.deltaPct compares with the latter and
    // runs to five figures on a corridor during an egress, which answers a
    // question nobody asked. The planner's question is what the PIECES did.
    const baseKey =
      current.scenario.id +
      '|' +
      current.businesses.map((b) => `${b.id}:${b.pos.x},${b.pos.y}`).join(';') +
      '|' +
      current.blocks.length;

    if (baselineCache.current?.key !== baseKey) {
      const baseWorld = { ...current, pieces: [] };
      const net0 = buildNetwork(baseWorld);
      baselineCache.current = { key: baseKey, result: simulate(baseWorld, net0), net: net0 };
    }
    const baseNet = baselineCache.current.net;
    store.setBaseline(current.pieces.length === 0 ? null : baselineCache.current.result);

    const anchor = current.anchors[0];
    if (anchor) {
      const destNow = net.anchorNodeIds[anchor.id];
      const destBase = baseNet.anchorNodeIds[anchor.id];
      const now = destNow ? shortestPathsFrom(net, destNow, 'drive') : null;
      const before = destBase ? shortestPathsFrom(baseNet, destBase, 'drive') : null;

      const delay: Record<string, number> = {};
      if (now && before) {
        for (const block of current.blocks) {
          let bestNow = Infinity;
          let bestBefore = Infinity;
          for (const id of block.accessNodeIds) {
            const a = now.minutes[id];
            if (a !== undefined && a < bestNow) bestNow = a;
            const b = before.minutes[id];
            if (b !== undefined && b < bestBefore) bestBefore = b;
          }
          // Cut off entirely is the worst case there is, so it saturates
          // rather than falling through as "no change".
          delay[block.id] = !Number.isFinite(bestBefore)
            ? 0
            : !Number.isFinite(bestNow)
              ? 999
              : Math.max(0, bestNow - bestBefore);
        }
      }
      store.setBlockDelay(delay);
    }
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
