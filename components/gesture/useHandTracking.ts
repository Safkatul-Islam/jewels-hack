'use client';

// components/gesture/useHandTracking.ts — P4
//
// Camera in, gesture frames out. Everything stateful about tracking lives here;
// everything geometric lives in lib/vision/ as pure functions, so the maths can
// be reasoned about and retuned without touching the camera lifecycle.
//
// The one hard rule in this file: NO REACT STATE PER FRAME. A setState at 60 fps
// re-renders the canvas 60 times a second and the plan drag drops to single
// digits, which breaks AGENTS.md §2.7 by a different route than the one that
// rule was written for. Frames are delivered to a callback; React state here
// changes only when the status or the once-a-second fps readout changes.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Vec2 } from '@/lib/sim/types';
import { type Landmark, handAnchor } from '@/lib/vision/landmarks';
import { FistHoldTracker, type PinchState, PinchTracker } from '@/lib/vision/pinch';
import { DEFAULT_ORIGIN, recentredOrigin } from '@/lib/vision/cursor';
import { OneEuroVec2 } from '@/lib/vision/smooth';

export type HandSide = 'left' | 'right';

export interface TrackedHand {
  side: HandSide;
  /** Smoothed knuckle anchor, normalised camera space (NOT mirrored — see cursor.ts). */
  anchor: Vec2;
  pinch: PinchState;
  /** Raw landmarks, for the camera preview overlay. Unsmoothed on purpose: the
   *  skeleton is a diagnostic, and smoothing a diagnostic hides the problem. */
  landmarks: Landmark[];
  /** 0 → 1 while a fist is being held toward a recentre. */
  fistProgress: number;
}

export interface GestureFrame {
  hands: TrackedHand[];
  /** The active-region origin, after any recentre. Pass to anchorToCanvas. */
  origin: Vec2;
  /** True on the single frame a fist-hold completed and the origin moved. */
  recentred: boolean;
  dtMs: number;
}

export type TrackingStatus = 'idle' | 'starting' | 'running' | 'error';

interface Options {
  /** Called once per detected frame. Kept in a ref, so it need not be stable. */
  onFrame: (frame: GestureFrame) => void;
  /** Called when tracking stops, so the consumer can drop any in-flight grab. */
  onStop?: () => void;
}

/** Where `npm run vision:assets` puts the runtime. Served from public/. */
const WASM_PATH = '/vision/wasm';
const MODEL_PATH = '/vision/hand_landmarker.task';

export function useHandTracking({ onFrame, onStop }: Options) {
  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  // Per-hand state, keyed by side. One filter and one clutch per hand, so the
  // left hand's history never leaks into the right hand's cursor when one of
  // them leaves the frame and MediaPipe reorders its output.
  const perHand = useRef<
    Record<HandSide, { filter: OneEuroVec2; pinch: PinchTracker; fist: FistHoldTracker }>
  >({
    left: { filter: new OneEuroVec2(), pinch: new PinchTracker(), fist: new FistHoldTracker() },
    right: { filter: new OneEuroVec2(), pinch: new PinchTracker(), fist: new FistHoldTracker() },
  });

  const originRef = useRef<Vec2>(DEFAULT_ORIGIN);
  const lastTsRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const fpsWindow = useRef({ frames: 0, since: 0 });

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) video.srcObject = null;

    perHand.current.left.pinch.cancel();
    perHand.current.right.pinch.cancel();
    setStatus('idle');
    setFps(0);
    onStopRef.current?.();
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    setError(null);
    setStatus('starting');

    try {
      // Dynamic import: the wasm glue is ~330 KB of JS and nothing on the page
      // needs it until someone asks for the camera. It also keeps the module
      // off the server render path entirely.
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');

      const stream = await navigator.mediaDevices.getUserMedia({
        // 1280×720 is plenty and higher costs frame rate for nothing — the same
        // conclusion docs/04-TABLE-MODE.md reached for ArUco.
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('No video element mounted.');
      video.srcObject = stream;
      await video.play();

      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      landmarkerRef.current = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        // Detection slightly strict, tracking slightly loose: a false hand in
        // the background is worse than a brief dropout, but a hand that loses
        // tracking mid-drag drops the building it was carrying.
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.4,
      });

      runningRef.current = true;
      lastTsRef.current = performance.now();
      lastVideoTimeRef.current = -1;
      fpsWindow.current = { frames: 0, since: performance.now() };
      setStatus('running');
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      // Worth distinguishing: a denied camera is a user action with an obvious
      // fix, a missing model file means nobody ran the asset script, and the
      // two want completely different words on screen.
      const message =
        e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? 'Camera permission denied. Allow it for localhost and try again.'
          : e instanceof DOMException && e.name === 'NotFoundError'
            ? 'No camera found.'
            : e instanceof Error && /fetch|load|404|wasm|model/i.test(e.message)
              ? 'Could not load the MediaPipe runtime. Run `npm run vision:assets`.'
              : e instanceof Error
                ? e.message
                : 'Could not start hand tracking.';
      setError(message);
      setStatus('error');
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    // `tick` is defined below and stable for the life of the hook; listing it
    // would mean hoisting it into a useCallback that closes over nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tick() {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    const now = performance.now();
    const dtMs = Math.min(now - lastTsRef.current, 100);
    lastTsRef.current = now;

    // detectForVideo rejects a repeated timestamp, and rAF runs faster than the
    // camera delivers frames, so only detect when the video has actually
    // advanced. Skipping is free; calling it twice on one frame throws.
    if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;

      const aspect = video.videoWidth / Math.max(video.videoHeight, 1);
      const result = landmarker.detectForVideo(video, now);

      const bySide: Partial<Record<HandSide, Landmark[]>> = {};
      result.landmarks.forEach((lm, i) => {
        // MediaPipe reports the SUBJECT's hand, not the viewer's, as long as the
        // frame goes in un-mirrored — which it does; the mirroring happens later
        // in cursor.ts. So no swap here. If the labels ever come out backwards,
        // something upstream started flipping the video.
        const label = result.handedness[i]?.[0]?.categoryName;
        const side: HandSide = label === 'Left' ? 'left' : 'right';
        // Two hands can be labelled the same when one is partly occluded; keep
        // the first, which is the higher-scoring detection.
        if (!bySide[side]) bySide[side] = lm as Landmark[];
      });

      const hands: TrackedHand[] = [];
      const fistAnchors: Vec2[] = [];
      let recentred = false;

      for (const side of ['left', 'right'] as const) {
        const lm = bySide[side] ?? null;
        const state = perHand.current[side];

        if (!lm) {
          // A hand that left the frame releases its pinch and forgets its
          // history, so it does not glide in from its old position on return.
          const pinch = state.pinch.update(null, aspect);
          state.filter.reset();
          state.fist.update(null, aspect, dtMs);
          if (pinch.phase === 'up') {
            hands.push({
              side,
              anchor: originRef.current,
              pinch,
              landmarks: [],
              fistProgress: 0,
            });
          }
          continue;
        }

        const anchor = state.filter.filter(handAnchor(lm), dtMs / 1000);
        const pinch = state.pinch.update(lm, aspect);
        if (state.fist.update(lm, aspect, dtMs)) fistAnchors.push(handAnchor(lm));

        hands.push({ side, anchor, pinch, landmarks: lm, fistProgress: state.fist.progress });
      }

      if (fistAnchors.length > 0) {
        // Recentre on every visible hand, not only the fisted one, so a
        // two-handed reset keeps the hands' left/right relationship.
        const visible = hands.filter((h) => h.landmarks.length > 0).map((h) => h.anchor);
        const next = recentredOrigin(visible.length > 0 ? visible : fistAnchors);
        if (next) {
          originRef.current = next;
          recentred = true;
        }
      }

      onFrameRef.current({ hands, origin: originRef.current, recentred, dtMs });

      const w = fpsWindow.current;
      w.frames += 1;
      if (now - w.since >= 1000) {
        setFps(Math.round((w.frames * 1000) / (now - w.since)));
        fpsWindow.current = { frames: 0, since: now };
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  // Stop on unmount. A live camera behind a navigation is both a privacy
  // problem and a hot laptop.
  useEffect(() => stop, [stop]);

  return { videoRef, status, error, fps, start, stop };
}
