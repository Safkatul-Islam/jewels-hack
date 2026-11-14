type ScoreDialProps = {
  value: number;
  label: string;
};

export function ScoreDial({ value, label }: ScoreDialProps) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="relative mx-auto mt-1 flex h-28 w-28 items-center justify-center">
        <svg className="h-28 w-28 -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r="42"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="12"
            fill="none"
          />
          <circle
            cx="60"
            cy="60"
            r="42"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="12"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-emerald-500"
          />
        </svg>
        <div className="absolute text-center">
          <div className="text-2xl font-semibold leading-none text-slate-900">
            {value}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
            score
          </div>
        </div>
      </div>
    </div>
  );
}
