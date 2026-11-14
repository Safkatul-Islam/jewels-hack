'use client';

// components/plan/PieceInspector.tsx — P1
//
// Tune the selected piece. Capacity is the interesting dial: the same shuttle
// hub at 2,000 and at 12,000 boardings an hour are two different plans.

import { Slider } from '@/components/ui/slider';
import { PIECE_META } from '@/lib/pieces';
import { selectSelectedPiece, usePlanStore } from '@/lib/store';

interface Props {
  onCommit?: () => void;
}

export function PieceInspector({ onCommit }: Props) {
  const piece = usePlanStore(selectSelectedPiece);
  const setPieceCapacity = usePlanStore((s) => s.setPieceCapacity);
  const rotatePiece = usePlanStore((s) => s.rotatePiece);
  const removePiece = usePlanStore((s) => s.removePiece);

  if (!piece) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
          Inspector
        </p>
        <p className="font-mono text-[9px] leading-relaxed tracking-[0.06em] text-[var(--night-dim)]">
          Select a piece to set its capacity.
        </p>
      </div>
    );
  }

  const meta = PIECE_META[piece.kind];
  const max = Math.max(meta.defaultCapacity * 2, 10);
  const step = Math.max(Math.round(max / 100), 1);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
        Inspector
      </p>

      <div className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-[1px]" style={{ background: meta.color }} />
        <span className="flex-1 truncate text-[0.8125rem]">{meta.label}</span>
      </div>

      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--night-hairline)] pb-2 font-mono text-[9px] tracking-[0.1em] text-[var(--night-dim)] uppercase tabular-nums">
        <span>Position</span>
        <span className="text-[var(--bone)]">
          {Math.round(piece.pos.x)}, {Math.round(piece.pos.y)} m
        </span>
      </div>

      {meta.defaultCapacity > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--night-dim)] uppercase">
              {meta.unit}
            </span>
            <span className="text-sm tabular-nums">{piece.capacity.toLocaleString()}</span>
          </div>
          <Slider
            min={0}
            max={max}
            step={step}
            value={piece.capacity}
            onValueChange={(v) => setPieceCapacity(piece.id, Array.isArray(v) ? v[0] : v)}
            onValueCommitted={() => onCommit?.()}
          />
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          className="flex-1 rounded-[2px] border border-[var(--night-hairline)] py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors hover:border-[var(--night-accent)] hover:text-[var(--night-accent)]"
          onClick={() => {
            rotatePiece(piece.id, piece.rotation + Math.PI / 12);
            onCommit?.();
          }}
        >
          Rotate
        </button>
        <button
          type="button"
          className="flex-1 rounded-[2px] border border-[var(--night-hairline)] py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors hover:border-[var(--piece-closure)] hover:text-[var(--piece-closure)]"
          onClick={() => {
            removePiece(piece.id);
            onCommit?.();
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
