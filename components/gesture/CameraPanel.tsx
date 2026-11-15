'use client';

// components/gesture/CameraPanel.tsx — P4
//
// The camera preview. The faint dot on the canvas (HandCursors) says where your
// hand is pointing; this answers the question the dot cannot — where your hands
// are relative to the slice of the frame that reaches the canvas at all.
//
// Those are different problems. A hand drifting toward the edge of the active
// region still has a dot on the canvas, pinned to the edge and looking fine,
// while half your reach has quietly disappeared. The dashed box here is where
// that becomes visible, and where you see the fist-reset land.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { HAND_CONNECTIONS } from '@/lib/vision/landmarks';
import { ACTIVE_HALF_H, ACTIVE_HALF_W } from '@/lib/vision/cursor';
import type { TrackedHand } from '@/components/gesture/useHandTracking';
import type { Vec2 } from '@/lib/sim/types';

export interface CameraPanelHandle {
  /** Called from the tracking loop, not from React. */
  draw: (hands: readonly TrackedHand[], origin: Vec2) => void;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  live: boolean;
}

const W = 208;
const H = 117; // 16:9, so the preview matches the frame it is a window onto.

export const CameraPanel = forwardRef<CameraPanelHandle, Props>(function CameraPanel(
  { videoRef, live },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(hands, origin) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== W * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Mirrored, to match the video underneath: the preview is a mirror, so a
      // hand moved right moves right on screen. (The detector gets the
      // un-mirrored frame — see cursor.ts.)
      const px = (x: number) => (1 - x) * W;
      const py = (y: number) => y * H;

      // The active region. Visible here and nowhere else, which is what makes
      // the fist-reset legible: the box jumps to your hands.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(
        px(origin.x + ACTIVE_HALF_W),
        py(origin.y - ACTIVE_HALF_H),
        ACTIVE_HALF_W * 2 * W,
        ACTIVE_HALF_H * 2 * H,
      );
      ctx.setLineDash([]);

      for (const hand of hands) {
        if (hand.landmarks.length === 0) continue;
        const lm = hand.landmarks;
        const pinching = hand.pinch.phase === 'down' || hand.pinch.phase === 'held';

        ctx.strokeStyle = pinching ? 'rgba(120,255,190,0.95)' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth = pinching ? 2 : 1.25;
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.moveTo(px(lm[a].x), py(lm[a].y));
          ctx.lineTo(px(lm[b].x), py(lm[b].y));
        }
        ctx.stroke();

        // The pinch pair gets its own emphasis, because the pinch is the only
        // gesture whose state the user needs to read mid-action.
        drawDot(ctx, px(lm[4].x), py(lm[4].y), pinching ? 3.5 : 2.5, pinching);
        drawDot(ctx, px(lm[8].x), py(lm[8].y), pinching ? 3.5 : 2.5, pinching);

        // Fist-hold progress, as an arc filling around the wrist.
        if (hand.fistProgress > 0.02) {
          ctx.strokeStyle = 'rgba(255,210,120,0.95)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(
            px(lm[0].x),
            py(lm[0].y),
            9,
            -Math.PI / 2,
            -Math.PI / 2 + hand.fistProgress * Math.PI * 2,
          );
          ctx.stroke();
        }
      }
    },
  }));

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 overflow-hidden rounded-lg border border-white/15 bg-black/80 shadow-lg backdrop-blur">
      <div className="relative" style={{ width: W, height: H }}>
        <video
          ref={videoRef}
          playsInline
          muted
          // scaleX(-1): a preview that is not a mirror makes every correction
          // go the wrong way, which is the single fastest way to make hand
          // control feel broken.
          className="absolute inset-0 size-full scale-x-[-1] object-cover opacity-70"
        />
        <canvas
          ref={canvasRef}
          style={{ width: W, height: H }}
          className="absolute inset-0"
        />
        {!live && (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-white/55">
            camera off
          </div>
        )}
      </div>
    </div>
  );
});

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hot: boolean,
) {
  ctx.fillStyle = hot ? 'rgb(120,255,190)' : 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
