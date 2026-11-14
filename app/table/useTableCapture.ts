'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldState, Vec2 } from '@/lib/sim/types';
import { CameraController } from '@/lib/vision/camera';
import { detectMarkers, type ArucoDetector } from '@/lib/vision/aruco';
import { bboxCorners, calibratePlanar } from '@/lib/vision/calibration';
import { DICTIONARY, type PixelMarker } from '@/lib/vision/contracts';
import { DEFAULT_SAMPLE_SETTINGS, drawSampleFrame, loadSampleMarkers, type SampleSettings } from '@/lib/vision/sampleFrame';
import { TableSession } from '@/lib/vision/session';
import type { TrackedReading } from '@/lib/vision/tracker';

type SourceKind = 'camera' | 'video' | 'image' | 'test';
type CalibrationMode = 'overhead' | 'planar';
interface CaptureSource { kind: SourceKind; image?: ImageBitmap; url?: string }
interface CaptureView {
  source: SourceKind | null;
  markers: PixelMarker[];
  readings: TrackedReading[];
  width: number;
  height: number;
  processingMs: number;
  calibrated: boolean;
  canConfirm: boolean;
  draft: WorldState | null;
}

function emptyView(world: WorldState | null): CaptureView {
  return { source: null, markers: [], readings: [], width: 1280, height: 720,
    processingMs: 0, calibrated: false, canConfirm: false, draft: world };
}

export function useTableCapture(world: WorldState | null, onConfirm: (world: WorldState) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef(world);
  const sessionRef = useRef<TableSession<WorldState> | null>(world ? new TableSession(world) : null);
  const sourceRef = useRef<CaptureSource | null>(null);
  const cameraRef = useRef<CameraController | null>(null);
  const detectorRef = useRef<ArucoDetector | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const frameTimeRef = useRef(0);
  const testImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const testSettingsRef = useRef<SampleSettings>({ ...DEFAULT_SAMPLE_SETTINGS });
  const modeRef = useRef<CalibrationMode>('overhead');
  const pointsRef = useRef<Vec2[]>([]);
  const selectingRef = useRef(false);
  const viewRef = useRef<CaptureView>(emptyView(world));
  const [view, setView] = useState<CaptureView>(() => emptyView(world));
  const [status, setStatus] = useState('Start with the generated marker test, or connect your camera.');
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [mode, setMode] = useState<CalibrationMode>('overhead');
  const [points, setPoints] = useState<Vec2[]>([]);
  const [testSettings, setTestSettings] = useState<SampleSettings>({ ...DEFAULT_SAMPLE_SETTINGS });

  const releaseSource = useCallback(() => {
    generationRef.current++;
    cameraRef.current?.stop();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }
    sourceRef.current?.image?.close();
    if (sourceRef.current?.url) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = null;
  }, []);

  const resetTracking = useCallback(() => {
    if (worldRef.current) sessionRef.current = new TableSession(worldRef.current);
    else sessionRef.current = null;
    pointsRef.current = [];
    selectingRef.current = false;
    frameTimeRef.current = 0;
    setPoints([]);
    const next = { ...viewRef.current, canConfirm: false, calibrated: false, readings: [] };
    viewRef.current = next;
    setView(next);
  }, []);

  const stop = useCallback(() => {
    releaseSource();
    resetTracking();
    const next = emptyView(worldRef.current);
    viewRef.current = next;
    setView(next);
    setBusy(false);
    setStatus('Capture stopped. Camera tracks have been released.');
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [releaseSource, resetTracking]);

  useEffect(() => {
    if (worldRef.current === world) return;
    worldRef.current = world;
    resetTracking();
    const next = { ...emptyView(world), source: sourceRef.current?.kind ?? null };
    viewRef.current = next;
    setView(next);
    setStatus('World changed. Tracking and calibration have been reset.');
  }, [resetTracking, world]);

  useEffect(() => {
    mountedRef.current = true;
    let animation = 0;
    let previousFrame = 0;
    let previousSize = '';

    function tick(now: number) {
      animation = requestAnimationFrame(tick);
      const source = sourceRef.current;
      const currentWorld = worldRef.current;
      const session = sessionRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;
      if (!source || !currentWorld || !session || !canvas || !detector || now - previousFrame < 100) return;
      previousFrame = now;
      try {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('2D canvas is unavailable.');
        if (source.kind === 'test') {
          drawSampleFrame(context, currentWorld, testImagesRef.current, testSettingsRef.current);
        } else {
          const video = videoRef.current;
          if (source.kind !== 'image' && (!video || video.readyState < 2)) return;
          const input = source.image ?? video;
          if (!input) return;
          const inputWidth = source.image?.width ?? video!.videoWidth;
          const inputHeight = source.image?.height ?? video!.videoHeight;
          if (!inputWidth || !inputHeight) return;
          const scale = Math.min(1, 1280 / inputWidth, 720 / inputHeight);
          const width = Math.round(inputWidth * scale);
          const height = Math.round(inputHeight * scale);
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.drawImage(input, 0, 0, canvas.width, canvas.height);
        }

        const size = `${canvas.width}:${canvas.height}`;
        if (previousSize && size !== previousSize) {
          resetTracking();
          setStatus('Frame dimensions changed. Recalibrate before confirming.');
        }
        previousSize = size;
        const start = performance.now();
        const markers = detectMarkers(detector, context.getImageData(0, 0, canvas.width, canvas.height));
        const pendingPlanar = modeRef.current === 'planar' && (selectingRef.current || pointsRef.current.length !== 4);
        const result = pendingPlanar ? null : sessionRef.current!.process(markers, now);
        const next: CaptureView = {
          source: source.kind, markers, readings: result?.readings ?? [],
          width: canvas.width, height: canvas.height, processingMs: performance.now() - start,
          calibrated: Boolean(result?.calibration), canConfirm: result?.canConfirm ?? false,
          draft: result?.draft ?? viewRef.current.draft ?? currentWorld,
        };
        frameTimeRef.current = now;
        viewRef.current = next;
        setView(next);
      } catch (error) {
        releaseSource();
        resetTracking();
        const next = emptyView(worldRef.current);
        viewRef.current = next;
        setView(next);
        setBusy(false);
        setStatus(`Frame processing stopped: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    animation = requestAnimationFrame(tick);
    const releaseOnHide = () => releaseSource();
    window.addEventListener('pagehide', releaseOnHide);
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(animation);
      window.removeEventListener('pagehide', releaseOnHide);
      releaseSource();
    };
  }, [releaseSource, resetTracking]);

  const prepare = useCallback(async () => {
    releaseSource();
    resetTracking();
    setView(emptyView(worldRef.current));
    setBusy(true);
    const generation = generationRef.current;
    if (!detectorRef.current) {
      const { AR } = await import('js-aruco2');
      if (!mountedRef.current || generation !== generationRef.current) return null;
      detectorRef.current = new AR.Detector({ dictionaryName: DICTIONARY, maxHammingDistance: 4 });
    }
    return generation;
  }, [releaseSource, resetTracking]);

  const startCamera = useCallback(async (selected = deviceId) => {
    let generation: number | null = generationRef.current + 1;
    try {
      generation = await prepare();
      if (generation === null || !videoRef.current) return;
      cameraRef.current ??= new CameraController(videoRef.current);
      await cameraRef.current.start(selected || undefined);
      if (!mountedRef.current || generation !== generationRef.current) return;
      sourceRef.current = { kind: 'camera' };
      setBusy(false);
      setStatus('Camera connected. Keep calibration and movable markers visible.');
      const stream = videoRef.current.srcObject;
      if (stream instanceof MediaStream) {
        stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
          if (generation === generationRef.current && mountedRef.current) {
            stop();
            setStatus('Camera disconnected. Reconnect it and start capture again.');
          }
        }, { once: true }));
        setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? selected);
      }
      const devices = await cameraRef.current.devices();
      if (mountedRef.current && generation === generationRef.current) setDevices(devices);
    } catch (error) {
      if (!mountedRef.current || (generation !== null && generation !== generationRef.current)) return;
      stop();
      setStatus(`Camera unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [deviceId, prepare, stop]);

  const loadTest = useCallback(async () => {
    let generation: number | null = generationRef.current + 1;
    try {
      generation = await prepare();
      if (generation === null) return;
      const images = await loadSampleMarkers();
      if (!mountedRef.current || generation !== generationRef.current) return;
      testImagesRef.current = images;
      sourceRef.current = { kind: 'test' };
      setBusy(false);
      setStatus('Generated images use the real detector. Move the test piece, then Confirm.');
    } catch (error) {
      if (!mountedRef.current || (generation !== null && generation !== generationRef.current)) return;
      stop();
      setStatus(`Test input failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [prepare, stop]);

  const loadFile = useCallback(async (file: File) => {
    let generation: number | null = generationRef.current + 1;
    try {
      generation = await prepare();
      if (generation === null) return;
      if (file.type.startsWith('image/')) {
        const image = await createImageBitmap(file);
        if (!mountedRef.current || generation !== generationRef.current) { image.close(); return; }
        sourceRef.current = { kind: 'image', image };
      } else if (file.type.startsWith('video/')) {
        const video = videoRef.current;
        if (!video) throw new Error('Video input is unavailable.');
        const url = URL.createObjectURL(file);
        sourceRef.current = { kind: 'video', url };
        video.src = url;
        video.loop = true;
        await video.play();
        if (!mountedRef.current || generation !== generationRef.current) return;
      } else throw new Error('Choose an image or a video file.');
      setBusy(false);
      setStatus('Local file loaded. Its pixels stay in your browser.');
    } catch (error) {
      if (!mountedRef.current || (generation !== null && generation !== generationRef.current)) return;
      stop();
      setStatus(`File could not load: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [prepare, stop]);

  function changeMode(next: CalibrationMode) {
    modeRef.current = next;
    setMode(next);
    resetTracking();
    setStatus(next === 'planar' ? 'Select the four corners of a physically marked table rectangle.' : 'Overhead mode requires markers 0 and 1 in view.');
  }

  function beginCalibration() {
    if (!sourceRef.current) { setStatus('Start a camera or load an input first.'); return; }
    resetTracking();
    selectingRef.current = true;
    setStatus('Click TOP LEFT → TOP RIGHT → BOTTOM RIGHT → BOTTOM LEFT on the table plane.');
  }

  function selectCorner(point: Vec2) {
    if (!selectingRef.current || !worldRef.current) return;
    pointsRef.current = [...pointsRef.current, point];
    setPoints(pointsRef.current);
    if (pointsRef.current.length !== 4) { setStatus(`Corner ${pointsRef.current.length}/4 selected.`); return; }
    try {
      sessionRef.current!.setPlanarCalibration(calibratePlanar(pointsRef.current, bboxCorners(worldRef.current)));
      selectingRef.current = false;
      setStatus('Table plane calibrated. Keep the camera and table fixed; recalibrate after moving either.');
    } catch (error) {
      pointsRef.current = [];
      setPoints([]);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function confirm() {
    if (!sourceRef.current || !viewRef.current.canConfirm || performance.now() - frameTimeRef.current > 500) {
      setStatus('Confirm needs fresh calibrated input with a visible, in-bounds movable marker.');
      return;
    }
    const next = sessionRef.current!.confirm();
    // Keep our own confirmed update from being mistaken for an external world reset.
    worldRef.current = next;
    onConfirm(next);
    setStatus('Plan confirmed into the shared planner.');
  }

  return { view, status, busy, videoRef, canvasRef, devices, deviceId, setDeviceId,
    mode, points, testSettings, startCamera, stop, loadTest, loadFile, changeMode,
    beginCalibration, selectCorner, confirm,
    changeTestSettings(update: Partial<SampleSettings>) {
      testSettingsRef.current = { ...testSettingsRef.current, ...update };
      setTestSettings(testSettingsRef.current);
    },
  };
}
