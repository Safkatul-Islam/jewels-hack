type WeightSlidersProps = {
  weights: { games: number; livability: number; economy: number };
  onChange: (next: { games: number; livability: number; economy: number }) => void;
};

export function WeightSliders({ weights, onChange }: WeightSlidersProps) {
  const update = (key: keyof typeof weights, value: number) => {
    onChange({ ...weights, [key]: value });
  };

  const sliderClass =
    "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-600";

  return (
    <div className="rounded-[18px] border border-slate-200/10 bg-slate-900/80 p-2.5 shadow-[0_20px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Live weights
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-slate-300">
          Adjust
        </div>
      </div>

      <div className="rounded-[12px] border border-slate-200/10 bg-white p-2.5">
        <div className="space-y-2.5">
          {[
            { key: "games", label: "Games" },
            { key: "livability", label: "Livability" },
            { key: "economy", label: "Economy" },
          ].map(({ key, label }) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-700">
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
    </div>
  );
}
