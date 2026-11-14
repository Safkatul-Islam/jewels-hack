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
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold">{value}</div>
        {delta ? (
          <div className="text-xs font-medium opacity-80">{delta}</div>
        ) : null}
      </div>
    </div>
  );
}
