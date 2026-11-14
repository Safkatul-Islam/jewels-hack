'use client';

// components/home/AccentSelector.tsx — P1
//
// The accent dots, in the header. Ported from the Doppel frontend's
// AccentSelector and restyled: square swatches on a hairline rule rather than
// glass pills, because this page is an instrument and the rest of the header
// is 10px mono readouts.

import { ACCENTS } from './accents';
import { useAccent } from './AccentProvider';

export function AccentSelector() {
  const { accent, setAccentId } = useAccent();

  return (
    <div className="flex items-center gap-2">
      <span className="hidden font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase sm:inline">
        Accent
      </span>
      <div className="flex items-center gap-1.5">
        {ACCENTS.map((a) => {
          const active = a.id === accent.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccentId(a.id)}
              aria-label={`Accent: ${a.label}`}
              aria-pressed={active}
              title={a.label}
              className="size-3 rounded-[1px] transition-transform duration-200 hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bone)]"
              style={{
                background: a.accent,
                opacity: active ? 1 : 0.42,
                boxShadow: active ? `0 0 0 1px var(--ink), 0 0 0 2px ${a.accent}` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
