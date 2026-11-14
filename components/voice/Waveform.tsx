'use client';

// components/voice/Waveform.tsx — P1
//
// The line that moves when there is sound.
//
// It is NOT an oscilloscope, and it cannot be: the ElevenLabs SDK exposes
// frequency-domain data and a volume level, never the time-domain samples a
// real waveform is drawn from. So this takes the frequency bins, treats them as
// a height profile along the line, and mirrors it about the centre. It reads as
// a voice moving a wire, which is the point, and it does not pretend to be an
// oscilloscope trace.
//
// Driven by rAF off the live analyser rather than by React state — at 60 fps a
// setState per frame would re-render the dock and its subtitle along with it.

import { useEffect, useRef } from 'react';

const POINTS = 56;
/** How fast a bar falls back toward the centre line. 0 = frozen, 1 = no smoothing. */
const DECAY = 0.22;

interface Props {
  /** Live frequency bins, 0–255. Return an empty array when there is no audio. */
  getFrequencyData: () => Uint8Array;
  /** 0–1 overall level, used so a quiet line still reads as "listening". */
  getLevel: () => number;
  /** Drives the colour: the agent speaking vs the user speaking. */
  speaking: boolean;
  active: boolean;
}

export function Waveform({ getFrequencyData, getLevel, speaking, active }: Props) {
  const pathRef = useRef<SVGPathElement>(null);
  const heights = useRef<number[]>(new Array(POINTS).fill(0));

  useEffect(() => {
    let raf = 0;

    function frame() {
      raf = requestAnimationFrame(frame);
      const path = pathRef.current;
      if (!path) return;

      let bins: Uint8Array;
      let level = 0;
      try {
        bins = active ? getFrequencyData() : new Uint8Array(0);
        level = active ? getLevel() : 0;
      } catch {
        // The analyser only exists while a session is live, and the session can
        // end between one frame and the next. A dead line is the right output.
        bins = new Uint8Array(0);
      }

      const h = heights.current;
      for (let i = 0; i < POINTS; i++) {
        let target = 0;
        if (bins.length > 0) {
          // Low frequencies carry speech; sample the bottom half of the spectrum
          // and fold it so the line is symmetric about its middle.
          const half = Math.floor(POINTS / 2);
          const fromCentre = Math.abs(i - half);
          const bin = Math.floor((fromCentre / half) * (bins.length * 0.5));
          target = ((bins[bin] ?? 0) / 255) * (0.35 + level * 0.9);
        }
        h[i] = h[i]! + (target - h[i]!) * DECAY;
      }

      // Taper the ends so the line always meets the edges flat.
      let d = '';
      for (let i = 0; i < POINTS; i++) {
        const x = (i / (POINTS - 1)) * 100;
        const taper = Math.sin((i / (POINTS - 1)) * Math.PI);
        const y = 10 - h[i]! * 9 * taper;
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      }
      path.setAttribute('d', d);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getFrequencyData, getLevel, active]);

  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className="h-5 w-full"
      aria-hidden="true"
    >
      <path
        ref={pathRef}
        d="M0,10L100,10"
        fill="none"
        strokeWidth={1.1}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        stroke={speaking ? 'var(--piece-shuttle)' : active ? 'var(--piece-ped)' : 'currentColor'}
        className={active ? '' : 'text-muted-foreground/40'}
      />
    </svg>
  );
}
