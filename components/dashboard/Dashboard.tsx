'use client';

// components/dashboard/Dashboard.tsx
//
// The right-hand column of /plan. It replaces the DashboardSlot placeholder
// that app/plan/page.tsx carried while the engine was being wired up.
//
// Assembled from P2's components on the `development-josh` branch, which were
// built in a separate Next app and against a mock result. What changed in the
// port: they read the real `SimResult` from the store, the deltas are computed
// against the stored baseline instead of being hardcoded strings, and the
// score is recomputed live from the weights.
//
// The live score is the point. `scorePlan` is deliberately separate from
// `simulate` (AGENTS.md §2.5), so moving a weight re-scores metrics that
// already exist — no re-simulation, no network, nothing to wait for. That is
// what lets the demo say "there is no optimal plan, only whose plan it is" and
// then show it in the same breath.

import { useMemo } from 'react';
import { HeatmapPanel } from '@/components/dashboard/HeatmapPanel';
import { MetricCard, type MetricTone } from '@/components/dashboard/MetricCard';
import { ScoreDial } from '@/components/dashboard/ScoreDial';
import { WeightSliders } from '@/components/dashboard/WeightSliders';
import { scorePlan } from '@/lib/sim/simulate';
import { usePlanStore } from '@/lib/store';
import type { Metrics } from '@/lib/sim/types';

const money = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);

/**
 * A row's delta against the baseline, or undefined when there is no baseline
 * to compare against. It returns nothing rather than inventing a plausible
 * number: a dashboard that shows "-7 min" when nothing was measured is worse
 * than one that shows nothing.
 */
function delta(
  now: number,
  before: number | undefined,
  unit: string,
  lowerIsBetter: boolean,
): { text: string; tone: MetricTone } | undefined {
  if (before === undefined) return undefined;
  const d = now - before;
  if (Math.abs(d) < 0.05) return undefined;
  const improved = lowerIsBetter ? d < 0 : d > 0;
  const sign = d > 0 ? '+' : '−';
  return {
    text: `${sign}${Math.abs(d).toFixed(unit === '%' ? 0 : 1)}${unit}`,
    tone: improved ? 'good' : 'warning',
  };
}

export function Dashboard() {
  const result = usePlanStore((s) => s.result);
  const baseline = usePlanStore((s) => s.baseline);
  const loading = usePlanStore((s) => s.loading);
  const weights = usePlanStore((s) => s.weights);
  const setWeights = usePlanStore((s) => s.setWeights);

  // Recomputed from the weights, not read off the result: the stored score was
  // produced with whatever weights were set when the sim ran.
  const score = useMemo(
    () => (result ? scorePlan(result.metrics, weights) : null),
    [result, weights],
  );

  if (loading || !result || !score) {
    return (
      <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--night-dim)] uppercase">
        {loading ? 'Loading scenario…' : 'No result yet'}
      </p>
    );
  }

  const m = result.metrics;
  const b: Partial<Metrics> = baseline?.metrics ?? {};

  const cards: { label: string; value: string; d?: ReturnType<typeof delta> }[] = [
    {
      label: 'Egress p90',
      value: `${m.egressP90Min.toFixed(1)} min`,
      d: delta(m.egressP90Min, b.egressP90Min, ' min', true),
    },
    {
      label: 'Egress median',
      value: `${m.egressMedianMin.toFixed(1)} min`,
      d: delta(m.egressMedianMin, b.egressMedianMin, ' min', true),
    },
    {
      label: 'Transit share',
      value: `${m.transitModeSharePct.toFixed(0)} %`,
      d: delta(m.transitModeSharePct, b.transitModeSharePct, '%', false),
    },
    {
      label: 'Resident delay',
      value: `${m.residentDelayMin.toFixed(1)} min`,
      d: delta(m.residentDelayMin, b.residentDelayMin, ' min', true),
    },
    {
      label: 'Local capture',
      value: `${m.localCapturePct.toFixed(0)} %`,
      d: delta(m.localCapturePct, b.localCapturePct, '%', false),
    },
    {
      label: 'Crowd peak',
      value: `${m.crowdPeakPerM2.toFixed(2)} /m²`,
      d: delta(m.crowdPeakPerM2, b.crowdPeakPerM2, '', true),
    },
    {
      label: 'Local revenue',
      value: money(m.localRevenueUsd),
    },
    {
      label: 'Vendor revenue',
      value: money(m.vendorRevenueUsd),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ScoreDial score={score} label="Plan score" />

      <span aria-hidden className="h-px w-full bg-[var(--night-hairline)]" />

      <WeightSliders weights={weights} onChange={setWeights} />

      <span aria-hidden className="h-px w-full bg-[var(--night-hairline)]" />

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        {cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            delta={card.d?.text}
            tone={card.d?.tone}
          />
        ))}
      </div>

      <span aria-hidden className="h-px w-full bg-[var(--night-hairline)]" />

      <HeatmapPanel
        title="Pedestrian density"
        heatmap={result.heatmaps.pedestrian}
        tone="var(--pop-spectator)"
      />

      {result.warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {result.warnings.map((w) => (
            <li
              key={w}
              className="flex gap-2 font-mono text-[10px] leading-relaxed tracking-[0.06em] text-[var(--night-dim)]"
            >
              <span aria-hidden className="text-[var(--piece-closure)]">
                !
              </span>
              {w}
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-[9px] tracking-[0.12em] text-[var(--night-dim)] uppercase tabular-nums">
        Sim {result.runtimeMs} ms
      </p>
    </div>
  );
}
