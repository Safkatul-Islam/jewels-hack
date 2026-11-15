'use client';

// components/plan/PiecePalette.tsx — P1
//
// The seven piece kinds. Drag one onto the canvas, or click to arm it and then
// click the map. Both paths end in the same store action.

import { PALETTE_ORDER, PIECE_META } from '@/lib/pieces';
import { usePlanStore } from '@/lib/store';
import { cn } from 'cn';

/** dataTransfer key — lowercase, because browsers normalise `types` to lowercase. */
export const PALETTE_DATA_KEY = 'application/x-arroyo-piece';

export function PiecePalette() {
  const armedKind = usePlanStore((s) => s.armedKind);
  const armKind = usePlanStore((s) => s.armKind);
  const hasWorld = usePlanStore((s) => s.world !== null);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
        Pieces
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {PALETTE_ORDER.map((kind) => {
          const meta = PIECE_META[kind];
          const armed = armedKind === kind;
          return (
            <button
              key={kind}
              type="button"
              disabled={!hasWorld}
              draggable={hasWorld}
              title={meta.hint}
              onDragStart={(e) => {
                e.dataTransfer.setData(PALETTE_DATA_KEY, kind);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => armKind(armed ? null : kind)}
              className={cn(
                'group flex items-center gap-2.5 rounded-[2px] border px-2.5 py-2 text-left transition-colors',
                'hover:border-[var(--night-dim)] disabled:cursor-not-allowed disabled:opacity-40',
                armed
                  ? 'border-[var(--night-accent)] bg-[color-mix(in_oklab,var(--night-accent),transparent_92%)]'
                  : 'border-[var(--night-hairline)]',
              )}
            >
              {/* The piece's own colour is the one thing here the accent must
                  never touch: it is how a kind is identified, on this palette
                  and on the canvas. */}
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[1px]"
                style={{ background: meta.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] leading-tight">{meta.label}</span>
                <span className="block truncate font-mono text-[9px] tracking-[0.08em] text-[var(--night-dim)] tabular-nums">
                  {meta.defaultCapacity > 0 ? `${meta.defaultCapacity.toLocaleString()} ${meta.unit}` : meta.unit}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="pt-1 font-mono text-[9px] leading-relaxed tracking-[0.06em] text-[var(--night-dim)]">
        Drag onto the map, or click a piece then the map. Selected:{' '}
        <kbd className="rounded-[1px] border border-[var(--night-hairline)] px-1">[</kbd>{' '}
        <kbd className="rounded-[1px] border border-[var(--night-hairline)] px-1">]</kbd> rotate,{' '}
        <kbd className="rounded-[1px] border border-[var(--night-hairline)] px-1">Del</kbd> remove.
      </p>
    </div>
  );
}
