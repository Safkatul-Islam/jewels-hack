type WeightSlidersProps = {
  weights: { games: number; livability: number; economy: number };
  onChange: (next: { games: number; livability: number; economy: number }) => void;
};

export function WeightSliders({ weights, onChange }: WeightSlidersProps) {
  const update = (key: keyof typeof weights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  const sliderClass =
    "h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
        Live weights
      </div>

      <div className="space-y-5">
        {[
          { key: "games", label: "Games" },
          { key: "livability", label: "Livability" },
          { key: "economy", label: "Economy" },
        ].map(({ key, label }) => (
          <div key={key}>
            <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
              <span>{label}</span>
              <span className="font-medium">{weights[key as keyof typeof weights]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={weights[key as keyof typeof weights]}
              onChange={(event) =>
                update(key as keyof typeof weights, Number(event.target.value))
              }
              className={sliderClass}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
