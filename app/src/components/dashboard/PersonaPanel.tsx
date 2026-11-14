type Persona = {
  name: string;
  role: string;
  quote: string;
  sentiment: "positive" | "mixed" | "negative";
};

type PersonaPanelProps = {
  personas: ReadonlyArray<Persona>;
};

const sentimentColors = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-900",
  mixed: "border-amber-200 bg-amber-50 text-amber-900",
  negative: "border-rose-200 bg-rose-50 text-rose-900",
};

export function PersonaPanel({ personas }: PersonaPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
        Resident voices
      </div>
      <div className="space-y-3">
        {personas.map((persona) => (
          <div
            key={persona.name}
            className={`rounded-xl border p-3 ${sentimentColors[persona.sentiment]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{persona.name}</div>
                <div className="text-xs opacity-80">{persona.role}</div>
              </div>
              <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em]">
                {persona.sentiment}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6">“{persona.quote}”</p>
          </div>
        ))}
      </div>
    </div>
  );
}
