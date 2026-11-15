import type { PieceKind } from '@/lib/sim/types';

interface Props {
  kind: PieceKind | 'venue' | 'anchor';
  color: string;
}

type Triple = [number, number, number];
const INK = '#213b46';
const WHITE = '#f9f6e9';

function Block({ size, at = [0, 0, 0], color, rotation }: {
  size: Triple; at?: Triple; color: string; rotation?: Triple;
}) {
  return <mesh position={at} rotation={rotation}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.72} />
  </mesh>;
}

function Ring({ radius, tube, at, color }: { radius: number; tube: number; at: Triple; color: string }) {
  return <mesh position={at}>
    <torusGeometry args={[radius, tube, 6, 24]} />
    <meshStandardMaterial color={color} roughness={0.65} />
  </mesh>;
}

function Vehicle({ color, compact = false }: { color: string; compact?: boolean }) {
  return <group scale={compact ? 0.62 : 1}>
    <Block size={[0.78, 0.3, 0.23]} at={[0, 0, 0.19]} color={color} />
    <Block size={[0.65, 0.26, 0.06]} at={[0, 0, 0.33]} color={WHITE} />
    {[-0.22, 0, 0.22].map(x => <Block key={x} size={[0.14, 0.315, 0.1]} at={[x, 0, 0.23]} color={INK} />)}
    {[-0.24, 0.24].flatMap(x => [-0.17, 0.17].map(y => (
      <mesh key={`${x}:${y}`} position={[x, y, 0.08]}>
        <cylinderGeometry args={[0.075, 0.075, 0.045, 10]} />
        <meshStandardMaterial color={INK} roughness={0.9} />
      </mesh>
    )))}
  </group>;
}

function Stadium({ color }: { color: string }) {
  return <group scale={[1, 0.78, 1]}>
    <Block size={[0.5, 0.44, 0.035]} at={[0, 0, 0.02]} color="#4f956d" />
    <Block size={[0.012, 0.41, 0.008]} at={[0, 0, 0.043]} color={WHITE} />
    <Ring radius={0.34} tube={0.09} at={[0, 0, 0.06]} color={color} />
    <Ring radius={0.37} tube={0.065} at={[0, 0, 0.14]} color={WHITE} />
    <Ring radius={0.395} tube={0.035} at={[0, 0, 0.2]} color={color} />
  </group>;
}

function Station({ color }: { color: string }) {
  return <group>
    <Block size={[0.8, 0.56, 0.045]} color={WHITE} />
    {[-0.29, 0.29].map(x => <Block key={x} size={[0.045, 0.045, 0.37]} at={[x, 0.12, 0.19]} color={INK} />)}
    <Block size={[0.8, 0.42, 0.065]} at={[0, 0.04, 0.4]} color={color} />
    <Block size={[0.56, 0.04, 0.08]} at={[0, -0.12, 0.08]} color={color} />
  </group>;
}

function Parking({ color }: { color: string }) {
  return <group>
    <Block size={[0.84, 0.68, 0.035]} color={INK} />
    {[-0.22, 0, 0.22].map(y => <Block key={y} size={[0.78, 0.012, 0.008]} at={[0, y, 0.023]} color={WHITE} />)}
    {[-0.2, 0.2].map(y => <group key={y} position={[0, y, 0.03]}><Vehicle color={color} compact /></group>)}
  </group>;
}

function Market({ color }: { color: string }) {
  return <group>
    {[-0.23, 0.23].map(x => <group key={x} position={[x, 0, 0]}>
      <Block size={[0.34, 0.38, 0.17]} at={[0, 0, 0.085]} color={color} />
      {[-0.13, 0.13].map(y => <Block key={y} size={[0.025, 0.025, 0.33]} at={[-0.14, y, 0.2]} color={WHITE} />)}
      <mesh position={[0, 0, 0.36]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <coneGeometry args={[0.3, 0.17, 4]} />
        <meshStandardMaterial color={WHITE} roughness={0.8} />
      </mesh>
      <Block size={[0.35, 0.08, 0.05]} at={[0, -0.18, 0.22]} color={INK} />
    </group>)}
  </group>;
}

function Corridor({ color }: { color: string }) {
  return <group>
    <Block size={[0.85, 0.46, 0.04]} color={color} />
    {[-0.3, -0.15, 0, 0.15, 0.3].map(x => <Block key={x} size={[0.065, 0.38, 0.012]} at={[x, 0, 0.03]} color={WHITE} />)}
    {[-0.37, 0.37].map(x => <Block key={x} size={[0.055, 0.055, 0.22]} at={[x, 0.29, 0.11]} color={INK} />)}
  </group>;
}

function Bikes({ color }: { color: string }) {
  return <group>
    {[-0.24, 0.24].map(x => <Ring key={x} radius={0.14} tube={0.025} at={[x, 0, 0.05]} color={INK} />)}
    <Block size={[0.5, 0.035, 0.04]} at={[0, 0.03, 0.07]} rotation={[0, 0, 0.35]} color={color} />
    <Block size={[0.035, 0.3, 0.04]} at={[-0.02, 0.06, 0.07]} rotation={[0, 0, -0.45]} color={color} />
    <Block size={[0.035, 0.28, 0.04]} at={[0.19, 0.12, 0.07]} rotation={[0, 0, 0.3]} color={color} />
    <Block size={[0.17, 0.045, 0.04]} at={[0.16, 0.27, 0.08]} color={INK} />
    <Block size={[0.15, 0.065, 0.035]} at={[-0.1, 0.2, 0.08]} color={INK} />
  </group>;
}

function Barrier({ color }: { color: string }) {
  return <group>
    {[-0.29, 0.29].map(x => <group key={x}>
      <Block size={[0.11, 0.34, 0.05]} at={[x, 0, 0.025]} color={INK} />
      <Block size={[0.045, 0.045, 0.37]} at={[x, 0, 0.2]} color={WHITE} />
    </group>)}
    <Block size={[0.85, 0.07, 0.16]} at={[0, 0, 0.29]} color={color} />
    {[-0.28, -0.09, 0.1, 0.29].map(x => <Block key={x} size={[0.075, 0.012, 0.16]} at={[x, -0.041, 0.29]} rotation={[0, -0.35, 0]} color={WHITE} />)}
  </group>;
}

function Gate({ color }: { color: string }) {
  return <group>
    {[-0.3, 0.3].map(x => <Block key={x} size={[0.13, 0.22, 0.5]} at={[x, 0, 0.25]} color={color} />)}
    <Block size={[0.73, 0.22, 0.11]} at={[0, 0, 0.53]} color={color} />
    <Block size={[0.32, 0.015, 0.07]} at={[0, -0.12, 0.53]} color={WHITE} />
    <Block size={[0.04, 0.5, 0.035]} at={[0.16, 0, 0.18]} color={INK} />
  </group>;
}

/** Original low-poly primitives: no downloads, textures, or external asset licences. */
export function PieceModel({ kind, color }: Props) {
  return <group rotation={[0.62, -0.4, 0]}>
    <Block size={[0.96, 0.8, 0.045]} at={[0, 0, -0.04]} color="#dce4de" />
    {kind === 'venue' && <Stadium color={color} />}
    {kind === 'anchor' && <Station color={color} />}
    {kind === 'shuttle_hub' && <Vehicle color={color} />}
    {kind === 'park_and_ride' && <Parking color={color} />}
    {kind === 'vendor_village' && <Market color={color} />}
    {kind === 'ped_corridor' && <Corridor color={color} />}
    {kind === 'bike_valet' && <Bikes color={color} />}
    {kind === 'road_closure' && <Barrier color={color} />}
    {kind === 'security_gate' && <Gate color={color} />}
  </group>;
}
