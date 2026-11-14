'use client';

// components/home/CorridorCanvas.tsx — P1
//
// The corridor as an actual three.js model: the same plan geometry as the SVG
// poster, with a perspective camera, real depth and a slow parallax drift.
//
// Two rules this file lives by.
//
// 1. It is a MODEL, not a render. Dark faces, bright hairline edges, no
//    textures, no shadows, no post-processing, long lens. The look it is
//    chasing is a planning model under a desk lamp, which is also what the
//    plan canvas looks like — `/` and `/plan` have to stay one object.
// 2. The scene is built imperatively into one group. R3F's JSX scene graph is
//    pleasant for scenes that change shape; this one never does, and building
//    it by hand keeps the whole thing in one readable place and keeps three's
//    JSX typings out of the build.
//
// Geometry: corridorModel.ts. Colours: corridorPalette.ts.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { NIGHT } from './corridorPalette';
import {
  BLOCKS,
  LOT_ANCHOR,
  RAIL_ANCHOR,
  SHOP_FOOTPRINTS,
  SHUTTLE,
  SHUTTLE_SECONDS,
  SPINE,
  VENUE,
  VENUE_BOWL,
  VENUE_PERIMETER,
  flow,
  grid,
  roads,
  toScene,
  toSceneLength as s,
  type Footprint,
  type Pt,
} from './corridorModel';

/* ---------------------------------------------------------------- *
 * Camera
 *
 * Framed to roughly match the SVG poster, so the swap from poster to
 * model is not a cut to a different shot. On wide screens the target
 * sits LEFT of the model, which pushes the model right on screen and
 * out from under the headline; on a phone there is no headline beside
 * it, so it centres instead.
 * ---------------------------------------------------------------- */

/**
 * The eye is an OFFSET from whatever it is looking at, not a fixed point.
 * That way the narrow-screen target re-centres the shot without also changing
 * the angle it is shot from. The offset's elevation is about 30°, which is
 * what the poster's affine projection works out to — the swap between them
 * should not read as a cut.
 */
const EYE_OFFSET = new THREE.Vector3(-3.09, 5.1, 8.31);
const TARGET_WIDE = new THREE.Vector3(-1.2, 0.25, -0.5);
const TARGET_NARROW = new THREE.Vector3(0.7, 0.25, -0.5);

/** Breadth of the parallax drift, in radians, and how long one sweep takes. */
const DRIFT_ARC = 0.2;
const DRIFT_SECONDS = 46;

/**
 * Line colours, one step up the night ramp from the poster's.
 *
 * WebGL cannot draw a line wider than one device pixel, so on a 2× display the
 * lattice renders at half the width of the poster's 1 CSS-pixel strokes — and
 * a half-width line of the same colour reads as roughly half the contrast.
 * Pulling each line one step up the ramp lands it at the same apparent weight.
 * These are not new colours; they are the same tokens, used one rung higher.
 */
const LINE = {
  grid: NIGHT.hairline,
  roadMinor: NIGHT.roadMajor,
  roadMajor: NIGHT.dim,
} as const;

/* ---------------------------------------------------------------- *
 * Builders
 * ---------------------------------------------------------------- */

function lineSegments(lines: Pt[][], y: number, color: string, opacity = 1): THREE.LineSegments {
  const position: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = toScene(line[i][0], line[i][1]);
      const [bx, bz] = toScene(line[i + 1][0], line[i + 1][1]);
      position.push(ax, y, az, bx, y, bz);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, fog: true }),
  );
}

/** A horizontal ring, centred on the venue. Used for the bowl's contours. */
function ring(radius: number, y: number, color: string, opacity = 1, segments = 96): THREE.Line {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, fog: true }),
  );
}

/**
 * A footprint, as a solid with its edges drawn. The edges are what carry the
 * form here — the faces are nearly as dark as the ground, exactly as they are
 * in the SVG.
 */
function massing(
  f: Footprint,
  face: string,
  edge: string,
  edgeOpacity = 1,
  parcels = 0,
): THREE.Group {
  const group = new THREE.Group();
  const [x, z] = toScene(f.x + f.w / 2, f.y + f.d / 2);
  const geometry = new THREE.BoxGeometry(s(f.w), s(f.h), s(f.d));

  const solid = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: face, roughness: 0.95, metalness: 0 }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: edge,
      transparent: edgeOpacity < 1,
      opacity: edgeOpacity,
      fog: true,
    }),
  );
  group.add(solid, edges);

  // Parcel divisions on the roof. Without them a block reads as a dark box
  // rather than as somebody's street — same reason the poster draws them.
  if (parcels > 0) {
    const position: number[] = [];
    const halfH = s(f.h) / 2;
    const halfD = s(f.d) / 2;
    for (let i = 1; i <= parcels; i++) {
      const px = (i / (parcels + 1) - 0.5) * s(f.w);
      position.push(px, halfH + 0.001, -halfD, px, halfH + 0.001, halfD);
    }
    const parcelGeometry = new THREE.BufferGeometry();
    parcelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    group.add(
      new THREE.LineSegments(
        parcelGeometry,
        new THREE.LineBasicMaterial({
          color: edge,
          transparent: true,
          opacity: edgeOpacity * 0.5,
          fog: true,
        }),
      ),
    );
  }

  group.position.set(x, s(f.h) / 2, z);
  return group;
}

function buildStatic(): THREE.Group {
  const root = new THREE.Group();

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: NIGHT.ink, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.004;
  root.add(ground);

  root.add(lineSegments(grid, 0, LINE.grid));

  // --- roads ---
  const minor = roads.filter((r) => !r.major).map((r) => r.pts);
  const major = roads.filter((r) => r.major).map((r) => r.pts);
  root.add(lineSegments(minor, 0.004, LINE.roadMinor));
  root.add(lineSegments(major, 0.005, LINE.roadMajor));
  root.add(lineSegments([SPINE], 0.006, LINE.roadMajor));

  // --- the venue's perimeter on the ground ---
  root.add(ring(s(VENUE_PERIMETER), 0.004, NIGHT.hairline, 0.55));

  // --- the venue bowl ---
  const { rRim, rPitch, h, pitchH } = VENUE_BOWL;

  // The outer wall is a near-vertical drum, NOT a dish flaring out to the rim.
  // A flared rim overhangs its own foot, so from a 30° camera you see the rim
  // and the inside of the bowl and nothing else — the stadium reads as a
  // crater punched in the ground. A slight inward taper at the base is all of
  // that shape worth keeping.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(s(rRim), s(rRim * 0.94), s(h), 96, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#262e37',
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  wall.position.y = s(h) / 2;
  root.add(wall);

  // The seating bowl, seen from inside — BackSide, or we would be looking at
  // the back of the cone and the stadium would read as a solid plug.
  const seating = new THREE.Mesh(
    new THREE.CylinderGeometry(s(rRim), s(rPitch), s(h - pitchH), 96, 1, true),
    new THREE.MeshStandardMaterial({
      color: NIGHT.ink,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    }),
  );
  seating.position.y = s(pitchH) + s(h - pitchH) / 2;
  root.add(seating);

  const pitch = new THREE.Mesh(
    new THREE.CircleGeometry(s(rPitch), 72),
    new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 1, metalness: 0 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = s(pitchH);
  root.add(pitch);

  // Contours: foot, rim, pitch, and two tiers between. These are the lines
  // that make it read as a drawing of a stadium rather than a plastic cup.
  root.add(ring(s(rRim * 0.94), 0.002, NIGHT.bone, 0.5));

  // Facade ribs. They are what make the drum read as a thing standing up off
  // the ground rather than a hole in it: a horizontal ring alone, seen from a
  // shallow angle, is exactly what the rim of a pit looks like.
  const ribs: number[] = [];
  const RIB_COUNT = 30;
  for (let i = 0; i < RIB_COUNT; i++) {
    const a = (i / RIB_COUNT) * Math.PI * 2;
    const foot = s(rRim * 0.94);
    const crest = s(rRim);
    ribs.push(
      Math.cos(a) * foot, 0.004, Math.sin(a) * foot,
      Math.cos(a) * crest, s(h), Math.sin(a) * crest,
    );
  }
  const ribGeometry = new THREE.BufferGeometry();
  ribGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ribs, 3));
  root.add(
    new THREE.LineSegments(
      ribGeometry,
      new THREE.LineBasicMaterial({ color: NIGHT.bone, transparent: true, opacity: 0.3, fog: true }),
    ),
  );
  root.add(ring(s(rRim), s(h), NIGHT.bone, 1));
  root.add(ring(s(rRim) - 0.008, s(h) - 0.004, NIGHT.bone, 0.8));
  root.add(ring(s(rPitch), s(pitchH) + 0.002, NIGHT.hairline, 0.9));
  for (const f of [0.74, 0.5]) {
    root.add(
      ring(s(rPitch + (rRim - rPitch) * f), s(pitchH + (h - pitchH) * f), NIGHT.bone, 0.32),
    );
  }

  // --- massing ---
  // Face colours sit between the ink and the population accent, the same
  // relationship the poster's `color-mix` fills have.
  for (const block of BLOCKS) root.add(massing(block, '#121d16', NIGHT.resident, 0.72, 3));
  for (const shop of SHOP_FOOTPRINTS) root.add(massing(shop, '#241b12', NIGHT.business, 0.8));
  root.add(massing(RAIL_ANCHOR, NIGHT.inkRaise, NIGHT.bone, 0.95));
  root.add(massing(LOT_ANCHOR, NIGHT.inkRaise, NIGHT.dim, 0.85));

  // --- scale bar, lying on the ground where a model's would ---
  const barZ = 2.15;
  const barGeometry = new THREE.BufferGeometry();
  barGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -0.6, 0.004, barZ, 0.58, 0.004, barZ, -0.6, 0.004, barZ - 0.04, -0.6, 0.004, barZ + 0.04,
        0.58, 0.004, barZ - 0.04, 0.58, 0.004, barZ + 0.04,
      ],
      3,
    ),
  );
  root.add(
    new THREE.LineSegments(
      barGeometry,
      new THREE.LineBasicMaterial({ color: NIGHT.dim, transparent: true, opacity: 0.8 }),
    ),
  );

  // --- light ---
  // Flat and frontal. Anything moodier and the faces start competing with the
  // edge lines, which are what actually describe the shapes here.
  root.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-4, 6, 5);
  root.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(5, 2, -4);
  root.add(fill);

  return root;
}

/** Points, positions and colours rebuilt every frame from the drift vectors. */
function buildEgress() {
  const count = flow.length;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.075,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: true,
    }),
  );

  const base = flow.map((d) => {
    const [x, z] = toScene(d.cx, d.cy);
    return { x, z, dx: s(d.dx), dz: s(d.dy), dur: d.dur, delay: d.delay, opacity: d.opacity };
  });

  return { points, geometry, position, color, base };
}

/* ---------------------------------------------------------------- *
 * Labels
 *
 * Projected to screen each frame and written straight to the DOM node's
 * transform — no React state, so the labels cost nothing per frame.
 *
 * They are HTML rather than geometry on purpose. A 9px mono micro-label is
 * the one part of this drawing that is pure information, and the moment it is
 * rendered into the scene it starts to shear, scale and fight the fog. These
 * stay upright, crisp and the same size whatever the camera does.
 * ---------------------------------------------------------------- */

interface Label {
  text: string;
  at: THREE.Vector3;
  strong?: boolean;
}

const LABELS: Label[] = (() => {
  const at = (x: number, y: number, h: number) => {
    const [sx, sz] = toScene(x, y);
    return new THREE.Vector3(sx, h, sz);
  };
  return [
    { text: 'Venue', at: at(VENUE[0], 530 + 128, 0), strong: true },
    { text: '88,000', at: at(VENUE[0], 530, s(VENUE_BOWL.pitchH) + 0.01) },
    { text: 'Anchor · rail', at: at(909, 293, s(RAIL_ANCHOR.h) + 0.14), strong: true },
    { text: '2.4 km out', at: at(909, 352, 0.02) },
    { text: 'Anchor · lot', at: at(359, 698, 0.02) },
    { text: '500 m', at: new THREE.Vector3(0.72, 0.004, 2.15) },
  ];
})();

/* ---------------------------------------------------------------- *
 * Scene
 * ---------------------------------------------------------------- */

const SPECTATOR = new THREE.Color(NIGHT.spectator);
const PROJECTED = new THREE.Vector3();

interface SceneProps {
  reduced: boolean;
  onReady: () => void;
  labels: React.RefObject<(HTMLSpanElement | null)[]>;
}

function Scene({ reduced, onReady, labels }: SceneProps) {
  const { scene, camera, size } = useThree();

  const statics = useMemo(buildStatic, []);
  const egress = useMemo(buildEgress, []);

  const shuttle = useMemo(() => massing(SHUTTLE, NIGHT.bone, NIGHT.bone, 1), []);
  const shuttleCurve = useMemo(() => {
    const points = SPINE.map((p) => {
      const [x, z] = toScene(p[0], p[1]);
      return new THREE.Vector3(x, s(SHUTTLE.h) / 2, z);
    });
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
  }, []);
  const shuttleHome = useMemo(() => shuttle.position.clone(), [shuttle]);

  useEffect(() => {
    scene.background = new THREE.Color(NIGHT.ink);
    // Depth haze. The SVG poster fakes this with a gradient; here it is the
    // real thing, and it is what stops the road lattice running to a hard edge.
    scene.fog = new THREE.FogExp2(NIGHT.ink, 0.034);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene]);

  // Free the GPU buffers on unmount. The scene is built once, but React in
  // development mounts twice, and three does not reference-count.
  useEffect(() => {
    const built = [statics, shuttle];
    const points = egress.points;
    return () => {
      for (const root of built) {
        root.traverse((node) => {
          const mesh = node as Partial<THREE.Mesh>;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        });
      }
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    };
  }, [statics, shuttle, egress]);

  const target = useMemo(
    () => (size.width < 1024 ? TARGET_NARROW : TARGET_WIDE).clone(),
    [size.width],
  );

  // Frame once before telling the page to fade the poster out, so the swap
  // never shows an empty canvas.
  const frames = useRef(0);

  useFrame(({ clock }) => {
    const t = reduced ? 6 : clock.elapsedTime;

    // --- camera: a slow lateral drift around the corridor ---
    const arc = reduced ? 0 : Math.sin((t / DRIFT_SECONDS) * Math.PI * 2) * DRIFT_ARC;
    const cos = Math.cos(arc);
    const sin = Math.sin(arc);
    camera.position.set(
      target.x + EYE_OFFSET.x * cos - EYE_OFFSET.z * sin,
      target.y + EYE_OFFSET.y + (reduced ? 0 : Math.sin((t / 71) * Math.PI * 2) * 0.16),
      target.z + EYE_OFFSET.x * sin + EYE_OFFSET.z * cos,
    );
    camera.lookAt(target);

    // --- the egress wave ---
    const { position, color, base } = egress;
    for (let i = 0; i < base.length; i++) {
      const d = base[i];
      const phase = (((t - d.delay) / d.dur) % 1 + 1) % 1;
      // The same envelope as the CSS keyframes on the poster: in by 9%, out
      // after 86%. If you change one, change the other.
      const fade = phase < 0.09 ? phase / 0.09 : phase > 0.86 ? (1 - phase) / 0.14 : 1;
      const k = i * 3;
      position[k] = d.x + d.dx * phase;
      position[k + 1] = 0.016;
      position[k + 2] = d.z + d.dz * phase;
      const w = d.opacity * fade;
      color[k] = SPECTATOR.r * w;
      color[k + 1] = SPECTATOR.g * w;
      color[k + 2] = SPECTATOR.b * w;
    }
    egress.geometry.attributes.position.needsUpdate = true;
    egress.geometry.attributes.color.needsUpdate = true;

    // --- the shuttle: out to the anchor and back, like a service ---
    const cycle = (t % (SHUTTLE_SECONDS * 2)) / SHUTTLE_SECONDS;
    const leg = cycle <= 1 ? cycle : 2 - cycle;
    const eased = leg * leg * (3 - 2 * leg);
    const u = 0.18 + eased * 0.8;
    const at = shuttleCurve.getPointAt(u);
    const ahead = shuttleCurve.getTangentAt(u);
    shuttle.position.set(at.x, shuttleHome.y, at.z);
    shuttle.rotation.y = Math.atan2(ahead.x, ahead.z);

    // --- labels follow the camera ---
    //
    // They are a fixed 9px whatever the canvas is, so on a phone-sized canvas
    // the full set collides with itself and with the model. Below this width
    // only the two that name the ends of the corridor survive — which are the
    // two the drawing is actually about.
    const sparse = size.width < 640;
    for (let i = 0; i < LABELS.length; i++) {
      const el = labels.current?.[i];
      if (!el) continue;
      const label = LABELS[i];
      if (sparse && !label.strong) {
        el.style.opacity = '0';
        continue;
      }
      PROJECTED.copy(label.at).project(camera);
      const x = (PROJECTED.x * 0.5 + 0.5) * size.width;
      const y = (-PROJECTED.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      // z > 1 means it is behind the camera; nothing should be, but a label
      // snapping to the far edge of the screen is a very visible way to find
      // out that something is.
      el.style.opacity = PROJECTED.z > 1 ? '0' : '1';
    }

    if (frames.current < 2) {
      frames.current += 1;
      if (frames.current === 2) onReady();
    }
  });

  return (
    <>
      <primitive object={statics} />
      <primitive object={egress.points} />
      <primitive object={shuttle} />
    </>
  );
}

export interface CorridorCanvasProps {
  reduced: boolean;
  onReady: () => void;
}

export function CorridorCanvas({ reduced, onReady }: CorridorCanvasProps) {
  const labels = useRef<(HTMLSpanElement | null)[]>([]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        // `flat`: no tone mapping. The palette is already authored for a dark
        // screen, and ACES crushes it into mud.
        flat
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        camera={{
          fov: 30,
          near: 0.1,
          far: 80,
          position: [EYE_OFFSET.x, EYE_OFFSET.y, EYE_OFFSET.z],
        }}
        // The scene is a drawing, not a control. Pointer events belong to the
        // page behind it.
        style={{ pointerEvents: 'none' }}
      >
        <Scene reduced={reduced} onReady={onReady} labels={labels} />
      </Canvas>

      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {LABELS.map((label, i) => (
          <span
            key={label.text}
            ref={(el) => {
              labels.current[i] = el;
            }}
            className={`absolute top-0 left-0 font-mono text-[9px] tracking-[0.16em] whitespace-nowrap uppercase ${
              label.strong ? 'text-[var(--bone)]' : 'text-[var(--night-dim)]'
            }`}
          >
            {label.text}
          </span>
        ))}
      </div>
    </div>
  );
}
