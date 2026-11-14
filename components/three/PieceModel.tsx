import type { PieceKind } from '@/lib/sim/types';

interface Props {
  kind: PieceKind | 'venue' | 'anchor';
  color: string;
}

/** Small primitives deliberately avoid external models and asset-loading delays. */
export function PieceModel({ kind, color }: Props) {
  return (
    <group>
      <mesh position={[0, 0, -0.18]}>
        <boxGeometry args={[0.86, 0.68, 0.05]} />
        <meshStandardMaterial color="#24353b" roughness={0.8} />
      </mesh>
      {kind === 'venue' ? (
        <mesh rotation={[0.25, 0, 0]}>
          <torusGeometry args={[0.3, 0.09, 12, 32]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ) : kind === 'ped_corridor' || kind === 'road_closure' ? (
        <mesh rotation={[0.25, 0, 0]}>
          <boxGeometry args={[0.8, 0.15, 0.13]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ) : (
        <mesh rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.6, 0.42, kind === 'security_gate' ? 0.42 : 0.24]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
        </mesh>
      )}
    </group>
  );
}
