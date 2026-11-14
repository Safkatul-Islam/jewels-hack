'use client';

// components/home/CorridorScene.tsx — P1
//
// Holds the two drawings of the corridor together: the server-rendered SVG
// poster and the three.js model that replaces it.
//
// The order matters and is the whole point of this file. The poster is in the
// markup from the first byte, so the hero is never empty and never shifts. The
// model is dynamically imported, so three.js is not in the page's first load;
// it mounts, draws two frames, and only then does the poster fade out. If
// WebGL is missing or the import fails, the poster is simply what you get —
// which is a complete drawing, not a placeholder.
//
// This component is `'use client'`, but the SVG arrives through `children`
// from the server component, so the poster's markup never enters the client
// bundle.

import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';

import { useAccent } from './AccentProvider';

const CorridorCanvas = dynamic(
  () => import('./CorridorCanvas').then((m) => m.CorridorCanvas),
  { ssr: false },
);

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

export function CorridorScene({ children }: { children: ReactNode }) {
  // Both start false so the first client render matches the server's: poster
  // only, no canvas. Everything else happens after hydration.
  const [enabled, setEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const { accent } = useAccent();

  useEffect(() => {
    if (!hasWebGL()) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(motion.matches);
    setEnabled(true);

    // Reduced motion does not mean no model — it means the model holds still.
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    motion.addEventListener('change', onChange);
    return () => motion.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0 transition-opacity duration-1000 ease-out"
        style={{ opacity: ready ? 0 : 1 }}
      >
        {children}
      </div>

      {enabled ? (
        <div
          className="absolute inset-0 transition-opacity duration-1000 ease-out"
          style={{ opacity: ready ? 1 : 0 }}
        >
          <CorridorCanvas reduced={reduced} onReady={() => setReady(true)} lamp={accent.lamp} />
        </div>
      ) : null}
    </div>
  );
}
