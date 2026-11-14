'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { OrthographicCamera } from 'three';
import { PieceModel } from './PieceModel';
import { centre } from '@/lib/vision/calibration';
import { MARKER_MAP, type PixelMarker } from '@/lib/vision/contracts';

export interface MarkerSceneProps {
  markers: PixelMarker[];
  width: number;
  height: number;
  colors: Record<string, string>;
}

function ImageCamera({ width, height }: Pick<MarkerSceneProps, 'width' | 'height'>) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);

  useEffect(() => {
    // Canvas is declared orthographic, so the camera has this known runtime shape.
    const orthographic = camera as OrthographicCamera;
    orthographic.left = 0;
    orthographic.right = width;
    orthographic.top = height;
    orthographic.bottom = 0;
    orthographic.updateProjectionMatrix();
    invalidate();
  }, [camera, height, invalidate, size.height, size.width, width]);

  return null;
}

/** R3F owns the WebGL lifecycle. This is orthographic, not a full AR pose estimate. */
export function MarkerScene({ markers, width, height, colors }: MarkerSceneProps) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1000], near: 1, far: 2000 }}
        frameloop="demand"
        dpr={1}
        gl={{ alpha: true, antialias: true }}
        fallback={<span className="sr-only">3D unavailable; marker outlines remain visible.</span>}
      >
        <ImageCamera width={width} height={height} />
        <ambientLight intensity={2} />
        <directionalLight position={[-100, 100, 1000]} intensity={3} />
        {markers.map((marker) => {
          const kind = MARKER_MAP[marker.id];
          if (!kind || marker.corners.length !== 4) return null;
          const point = centre(marker);
          const [a, b] = marker.corners;
          const scale = Math.hypot(b.x - a.x, b.y - a.y);
          return (
            <group
              key={marker.id}
              position={[point.x, height - point.y, 0]}
              rotation={[0, 0, -Math.atan2(b.y - a.y, b.x - a.x)]}
              scale={scale}
            >
              <PieceModel kind={kind} color={colors[kind] ?? '#a4bac5'} />
            </group>
          );
        })}
      </Canvas>
    </div>
  );
}
