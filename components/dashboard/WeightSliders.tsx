'use client';

// components/dashboard/WeightSliders.tsx
//
// Ported from P2's dashboard on the `development-josh` branch. Same three
// weights and the same 0–5 range; restyled, and wired to the real store.
//
// These are the controls the whole product is an argument for: there is no
// optimal plan, only whose plan it is, and this is where you say whose. They
// recompute the score from metrics that already exist — `scorePlan` is
// deliberately separate from `simulate` (AGENTS.md §2.5) — so dragging one
// costs nothing and never re-runs the simulation.

import type { Weights } from '@/lib/sim/types';

export interface WeightSlidersProps {
  weights: Weights;
  onChange: (next: Partial<Weights>) => void;
}

const ROWS: { key: keyof Weights; label: string; tone: string }[] = [
  { key: 'games', label: 'Games', tone: 'var(--pop-spectator)' },
  { key: 'livability', label: 'Livability', tone: 'var(--pop-resident)' },
  { key: 'economy', label: 'Economy', tone: 'var(--pop-business)' },
];

export function WeightSliders({ weights, onChange }: WeightSlidersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
          Weights
        </p>
        <p className="font-mono text-[9px] tracking-[0.12em] text-[var(--night-dim)] uppercase">
          No re-sim
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {ROWS.map((row) => (
          <label key={row.key} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2">
                {/* Each weight is tinted with the population it speaks for —
                    the same three colours the canvas and the landing page use,
                    which is why the accent picker is not allowed to move them. */}
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: row.tone }}
                />
                <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase">
                  {row.label}
                </span>
              </span>
              <span className="font-mono text-[11px] tabular-nums">
                {weights[row.key].toFixed(1)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={weights[row.key]}
              onChange={(e) => onChange({ [row.key]: Number(e.target.value) })}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--night-hairline)] accent-[var(--night-accent)]"
              aria-label={`${row.label} weight`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
