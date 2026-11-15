// components/dashboard/MetricCard.tsx
//
// Ported from P2's dashboard on the `development-josh` branch, where it lived
// in a separate Next app at app/src/components/dashboard/. Same props and same
// job; restyled into this project's instrument language, which has no cards,
// no shadows and no rounded corners to speak of.

export type MetricTone = 'good' | 'neutral' | 'warning';

export interface MetricCardProps {
  label: string;
  value: string;
  /** Only shown when there is a baseline to compare against. */
  delta?: string;
  tone?: MetricTone;
}

const TONE: Record<MetricTone, string> = {
  good: 'var(--better)',
  neutral: 'var(--night-dim)',
  warning: 'var(--worse)',
};

export function MetricCard({ label, value, delta, tone = 'neutral' }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 border-l border-[var(--night-hairline)] pl-2.5">
      <p className="font-mono text-[9px] tracking-[0.14em] text-[var(--night-dim)] uppercase">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[0.9375rem] leading-none tabular-nums">{value}</span>
        {delta ? (
          <span className="font-mono text-[9px] tabular-nums" style={{ color: TONE[tone] }}>
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}
