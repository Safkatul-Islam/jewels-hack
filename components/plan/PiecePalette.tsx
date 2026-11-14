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
      <div className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
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
                'group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
                armed ? 'border-foreground bg-accent' : 'border-border',
              )}
            >
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-[3px]"
                style={{ background: meta.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{meta.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground tabular-nums">
                  {meta.defaultCapacity > 0 ? `${meta.defaultCapacity.toLocaleString()} ${meta.unit}` : meta.unit}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-1 pt-1 text-[10px] leading-snug text-muted-foreground">
        Drag onto the map, or click a piece then click the map. Selected piece:{' '}
        <kbd className="rounded border px-1">[</kbd> <kbd className="rounded border px-1">]</kbd> to
        rotate, <kbd className="rounded border px-1">Del</kbd> to remove.
      </p>
    </div>
  );
}
