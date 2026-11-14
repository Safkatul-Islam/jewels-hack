import { GridBackdrop } from '@/components/plan/GridBackdrop';
import { RoadLayer } from '@/components/plan/RoadLayer';
import { WorldLayer } from '@/components/plan/WorldLayer';
import { PIECE_META } from '@/lib/pieces';
import type { WorldState } from '@/lib/sim/types';
import { fitTransform, worldToScreen } from '@/lib/transform';

function ignoreCommit(): void {}

export function DraftPlan({ world }: { world: WorldState }) {
  const transform = fitTransform(world.bbox, 420, 320, 28);
  return (
    <svg viewBox="0 0 420 320" role="img" aria-label="Draft table plan" className="w-full rounded-xl border bg-[var(--canvas-bg)]">
      <GridBackdrop bbox={world.bbox} basemap={world.basemap} t={transform} />
      <RoadLayer network={null} roads={world.baseRoads} bbox={world.bbox} t={transform} />
      {/* P1's layer drags businesses/blocks through the shared store. The draft
          preview is read-only: an edit here would bypass Confirm and reset capture. */}
      <g style={{ pointerEvents: 'none' }}>
        <WorldLayer world={world} t={transform} onCommit={ignoreCommit} />
      </g>
      {world.pieces.map((piece) => {
        const point = worldToScreen(transform, piece.pos, world.bbox);
        return (
          <g key={piece.id} transform={`translate(${point.x} ${point.y})`}>
            <circle r={7} fill={PIECE_META[piece.kind].color} stroke="var(--background)" strokeWidth={2} />
            <text y={-12} textAnchor="middle" fontSize={10} fill="var(--foreground)">
              {piece.fromMarker ?? ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
