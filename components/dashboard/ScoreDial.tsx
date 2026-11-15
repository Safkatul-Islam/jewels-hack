// components/dashboard/ScoreDial.tsx
//
// Ported from P2's dashboard on the `development-josh` branch. Same geometry —
// an r=42 ring on a 120 box, drawn with stroke-dashoffset — restyled to take
// the page's accent and the night palette, and with the three component scores
// shown underneath, because the whole argument of the product is that the
// total is a weighted opinion rather than a fact.

import type { Score } from '@/lib/sim/types';

export interface ScoreDialProps {
  score: Score;
  label: string;
}

const PARTS: { key: keyof Omit<Score, 'total'>; label: string }[] = [
  { key: 'games', label: 'Games' },
  { key: 'livability', label: 'Livability' },
  { key: 'economy', label: 'Economy' },
];

export function ScoreDial({ score, label }: ScoreDialProps) {
  const circumference = 2 * Math.PI * 42;
  const clamped = Math.max(0, Math.min(100, score.total));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
        {label}
      </p>

      <div className="flex items-center gap-4">
        <div className="relative size-[104px] shrink-0">
          <svg viewBox="0 0 120 120" className="size-[104px] -rotate-90">
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              strokeWidth="8"
              stroke="var(--night-hairline)"
            />
            <circle
              cx="60"
              cy="60"
              r="42"
              fill="none"
              strokeWidth="8"
              strokeLinecap="butt"
              stroke="var(--night-accent)"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 300ms ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[1.75rem] leading-none font-medium tracking-[-0.03em] tabular-nums">
              {score.total.toFixed(1)}
            </span>
          </div>
        </div>

        <dl className="flex min-w-0 flex-1 flex-col gap-1.5">
          {PARTS.map((part) => (
            <div key={part.key} className="flex items-baseline justify-between gap-2">
              <dt className="font-mono text-[9px] tracking-[0.14em] text-[var(--night-dim)] uppercase">
                {part.label}
              </dt>
              <dd className="font-mono text-[11px] tabular-nums">{score[part.key].toFixed(1)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
