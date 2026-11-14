type MetricCardProps = {
  label: string;
  value: string;
  delta?: string;
  tone?: "good" | "neutral" | "warning";
};

const toneClasses = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  neutral: "border-slate-200 bg-slate-50 text-slate-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

export function MetricCard({
  label,
  value,
  delta,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <div className={`rounded-xl border p-2.5 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-[9px] font-medium uppercase tracking-[0.18em] opacity-70">
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-base font-semibold leading-none">{value}</div>
        {delta ? (
          <div className="text-[10px] font-medium opacity-80">{delta}</div>
        ) : null}
      </div>
    </div>
  );
}
