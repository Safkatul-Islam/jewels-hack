'use client';

// components/plan/PieceInspector.tsx — P1
//
// Tune the selected piece. Capacity is the interesting dial: the same shuttle
// hub at 2,000 and at 12,000 boardings an hour are two different plans.

import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
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
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        Select a piece to set its capacity.
      </p>
    );
  }

  const meta = PIECE_META[piece.kind];
  const max = Math.max(meta.defaultCapacity * 2, 10);
  const step = Math.max(Math.round(max / 100), 1);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-[3px]" style={{ background: meta.color }} />
        <span className="flex-1 truncate text-xs font-medium">{meta.label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {Math.round(piece.pos.x)}, {Math.round(piece.pos.y)} m
        </span>
      </div>

      {meta.defaultCapacity > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-muted-foreground">{meta.unit}</span>
            <span className="font-medium tabular-nums">{piece.capacity.toLocaleString()}</span>
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
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => {
            rotatePiece(piece.id, piece.rotation + Math.PI / 12);
            onCommit?.();
          }}
        >
          Rotate
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => {
            removePiece(piece.id);
            onCommit?.();
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
