'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Group, OrthographicCamera } from 'three';
import { PieceModel } from './PieceModel';
import { MARKER_MAP, type PixelMarker } from '@/lib/vision/contracts';
import { advanceOverlayPose, markerOverlayPose, overlayAtRest, watchContextLoss, type OverlayPose } from '@/lib/vision/overlay';

export interface MarkerSceneProps {
  markers: PixelMarker[];
  width: number;
  height: number;
  colors: Record<string, string>;
  modelScale?: number;
}

function Unavailable() {
  return <p role="status" className="absolute left-3 right-3 top-3 rounded-md border bg-background/95 p-3 text-xs">
    3D unavailable. Marker outlines and planning still work. Toggle 3D off and on to retry.
  </p>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Unavailable /> : this.props.children; }
}

function ContextGuard({ onFailure }: { onFailure: () => void }) {
  const canvas = useThree(state => state.gl.domElement);
  useEffect(() => watchContextLoss(canvas, onFailure), [canvas, onFailure]);
  return null;
}

function MarkerModel({ target, kind, color, modelScale }: {
  target: OverlayPose;
  kind: Parameters<typeof PieceModel>[0]['kind'];
  color: string;
  modelScale: number;
}) {
  const group = useRef<Group>(null);
  const current = useRef(target);
  useFrame((state, delta) => {
    if (!group.current) return;
    current.current = advanceOverlayPose(current.current, target, delta);
    const pose = current.current;
    group.current.position.set(pose.x, pose.y, 0);
    group.current.rotation.z = pose.rotation;
    group.current.scale.setScalar(pose.size * modelScale);
    // Continue only while interpolating; demand rendering rests between detections.
    if (!overlayAtRest(pose, target)) state.invalidate();
  });
  return <group ref={group}><PieceModel kind={kind} color={color} /></group>;
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
export function MarkerScene({ markers, width, height, colors, modelScale = 2 }: MarkerSceneProps) {
  const [unavailable, setUnavailable] = useState(false);
  const fail = useCallback(() => setUnavailable(true), []);
  return (
    <div className="pointer-events-none absolute inset-0">
      <SceneBoundary>
        {unavailable ? <Unavailable /> : (
          <Canvas
            aria-hidden="true"
            orthographic
            camera={{ position: [0, 0, 1000], near: 1, far: 2000 }}
            frameloop="demand"
            dpr={1}
            gl={{ alpha: true, antialias: true }}
            fallback={<Unavailable />}
          >
            <ContextGuard onFailure={fail} />
            <ImageCamera width={width} height={height} />
            <ambientLight intensity={1.5} />
            <directionalLight position={[-200, 300, 1000]} intensity={3} />
            {markers.map((marker) => {
              const kind = MARKER_MAP[marker.id];
              const target = markerOverlayPose(marker, height);
              if (!kind || !target) return null;
              return (
                <MarkerModel
                  key={marker.id}
                  target={target}
                  kind={kind}
                  color={colors[kind] ?? '#a4bac5'}
                  modelScale={modelScale}
                />
              );
            })}
          </Canvas>
        )}
      </SceneBoundary>
    </div>
  );
}
