type HeatmapPanelProps = {
  title: string;
  values: number[];
  cols: number;
  rows: number;
};

export function HeatmapPanel({ title, values, cols, rows }: HeatmapPanelProps) {
  const max = Math.max(...values, 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
        {title}
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {values.map((value, index) => {
          const opacity = Math.min(1, value / max);
          return (
            <div
              key={`${title}-${index}`}
              className="h-3 rounded-[2px] border border-white/60"
              style={{
                backgroundColor: `rgba(14, 116, 144, ${0.12 + opacity * 0.88})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
