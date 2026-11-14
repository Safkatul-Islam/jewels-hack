'use client';

// components/home/CorridorCanvas.tsx — P1
//
// The venue's operational apron as a three.js model: the stadium, the secure
// perimeter and its gates, the pedestrian corridor, the vendor villages and
// service banks, the bike valet, the shuttle hub, the park-and-ride, the
// closures — and the neighbourhood they are all imposed on.
//
// Three rules this file lives by.
//
// 1. It is a MODEL, not a render. Dark faces, hairline edges, no textures, no
//    post-processing, long lens. The look it chases is a planning model under
//    a desk lamp, which is also what the plan canvas looks like.
// 2. LIGHT IS INFORMATION, not atmosphere. Lit means a staffed, operating
//    facility; dark means ordinary city. The plan is literally the lit part of
//    the image, and that is what carries the visual hierarchy.
// 3. Anything repeated goes through InstancedMesh. There are several hundred
//    stalls, cars, racks and buildings here and they cost about what the
//    forty-five loose boxes of the previous version cost.
//
// Geometry: corridorModel.ts. Colours: corridorPalette.ts.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { LAMP, NIGHT, PIECE } from './corridorPalette';
import {
  FACILITIES,
  LOT_ANCHOR,
  PED_CORRIDOR,
  PED_POSTS,
  RAIL_ANCHOR,
  RESIDENTIAL,
  SCALE_BAR_UNITS,
  SHOPFRONTS,
  SHUTTLE,
  SHUTTLE_PATH,
  SHUTTLE_SECONDS,
  VENUE,
  VENUE_BOWL,
  VENUE_PERIMETER,
  type Facility,
  type FacilityKind,
  type Footprint,
  type Light,
  type Pt,
  flow,
  grid,
  lamps,
  plan,
  rise,
  roads,
  toScene,
  toSceneLength as s,
  WINDOWS,
} from './corridorModel';

/* ---------------------------------------------------------------- *
 * Camera
 *
 * Framed on the APRON, not on the whole corridor — and that is a
 * decision, not an oversight. A vendor village is 70 m across and the
 * corridor is 2.4 km long; at a framing that fits both ends, every
 * facility on this page is three pixels wide and the re-framing says
 * nothing. So the shot holds the venue and roughly the first kilometre,
 * and the corridor leaves toward the anchor through the haze.
 * ---------------------------------------------------------------- */

const EYE_OFFSET = new THREE.Vector3(1.45, 3.15, 6.3);
const TARGET_WIDE = new THREE.Vector3(0.05, 0.12, -1.0);
const TARGET_NARROW = new THREE.Vector3(1.15, 0.12, -0.95);

const DRIFT_ARC = 0.16;
const DRIFT_SECONDS = 52;

/* ---------------------------------------------------------------- *
 * Builders
 * ---------------------------------------------------------------- */

/**
 * The survey grid, deliberately DIMMER than the road surfaces. While roads
 * were hairlines the grid had to carry the ground; now that they are surfaces
 * it must get out of their way, or the abstract lattice reads louder than the
 * real streets.
 */
const GRID_LINE = NIGHT.grid;

const ROAD = {
  minor: { width: plan(14), color: '#171d25', y: 0.004 },
  major: { width: plan(22), color: '#222a34', y: 0.005 },
} as const;

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

/** A horizontal ring centred on the venue. */
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

/** A polyline turned into a flat quad strip of the given plan width. */
function ribbon(lines: Pt[][], width: number, y: number, color: string): THREE.Mesh | null {
  const half = s(width) / 2;
  const position: number[] = [];

  for (const line of lines) {
    const pts = line.map((p) => toScene(p[0], p[1]));
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * half;
      const nz = ((bx - ax) / len) * half;
      // Wound counter-clockwise seen from ABOVE. Get this backwards and
      // computeVertexNormals points every normal at the floor: the surface is
      // then lit from underneath and backface-culled, so it vanishes while
      // looking perfectly correct in the geometry.
      position.push(
        ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz,
        ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
      );
    }
  }
  if (position.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const MATRIX = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const POS = new THREE.Vector3();
const SCALE = new THREE.Vector3();

/**
 * One draw call for a whole population of boxes.
 *
 * A plan-space rotation of `a` about the vertical becomes a three rotation of
 * `-a` about Y, because the plan's y axis maps to the scene's z and that flips
 * the handedness. Getting the sign wrong turns every facility across the
 * corridor instead of along it, which looks almost right and is not.
 */
function instanced(
  items: Footprint[],
  color: string,
  opts: { shadow?: boolean; roughness?: number } = {},
): THREE.InstancedMesh | null {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(
    UNIT_BOX,
    new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.95,
      metalness: 0,
    }),
    items.length,
  );
  items.forEach((f, i) => {
    const [x, z] = toScene(f.x + f.w / 2, f.y + f.d / 2);
    POS.set(x, s(f.h) / 2, z);
    SCALE.set(s(f.w), s(f.h), s(f.d));
    QUAT.setFromAxisAngle(AXIS_Y, -(f.a ?? 0));
    MATRIX.compose(POS, QUAT, SCALE);
    mesh.setMatrixAt(i, MATRIX);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = opts.shadow ?? true;
  mesh.receiveShadow = opts.shadow ?? true;
  return mesh;
}

/** The outline of a piece's pad, drawn on the ground. */
function padOutline(f: Footprint, color: string, opacity: number): THREE.Line {
  const a = f.a ?? 0;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  const corners: Pt[] = [
    [-f.w / 2, -f.d / 2],
    [f.w / 2, -f.d / 2],
    [f.w / 2, f.d / 2],
    [-f.w / 2, f.d / 2],
    [-f.w / 2, -f.d / 2],
  ];
  const points = corners.map(([dx, dy]) => {
    const px = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const py = cy + dx * Math.sin(a) + dy * Math.cos(a);
    const [sx, sz] = toScene(px, py);
    return new THREE.Vector3(sx, 0.008, sz);
  });
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: true }),
  );
}

/**
 * One Points object per light TONE, with a flat material colour rather than
 * per-vertex colours — which is what lets the accent recolour the whole cool
 * group later by setting a single material colour, instead of rewriting a
 * buffer attribute every time somebody clicks a swatch.
 */
function lightPoints(items: Light[], color: string, scale = 1): THREE.Points | null {
  if (items.length === 0) return null;
  const position = new Float32Array(items.length * 3);
  items.forEach((l, i) => {
    const [x, z] = toScene(l.x, l.y);
    position[i * 3] = x;
    position[i * 3 + 1] = s(l.h);
    position[i * 3 + 2] = z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color,
      size: 0.055 * scale,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      // Additive, so overlapping lights pool the way real ones do. On a near
      // black ground this is the only blending that reads as emission rather
      // than as paint.
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
}

/** Accent colour per facility kind — used on edges and light, never as fill. */
const ACCENT: Record<FacilityKind, string> = {
  security_gate: PIECE.gate,
  vendor_village: PIECE.vendor,
  service_bank: PIECE.ped,
  bike_valet: PIECE.bike,
  shuttle_hub: PIECE.shuttle,
  park_and_ride: PIECE.parking,
  road_closure: PIECE.closure,
};

function buildFacility(facility: Facility, lights: Light[]): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const accent = ACCENT[facility.kind];

  out.push(padOutline(facility.pad, accent, 0.65));

  const solids = instanced(facility.units, '#1b212a', { roughness: 0.9 });
  if (solids) out.push(solids);

  // A thin accent cap on each solid: the piece's own colour, present but
  // never a fill.
  const caps = facility.units.map((u) => ({ ...u, h: u.h * 0.12, y: u.y }));
  const capMesh = instanced(caps, accent, { shadow: false });
  if (capMesh) {
    capMesh.position.y = s(facility.units[0]?.h ?? 0) * 0.94;
    out.push(capMesh);
  }

  lights.push(...facility.lights);

  return out;
}

/**
 * Everything the accent recolours, held by reference so a swatch click is a
 * handful of `.color.set()` calls rather than a scene rebuild.
 */
interface Built {
  root: THREE.Group;
  cool: THREE.Points | null;
  spill: THREE.PointLight;
  /** the pitch, which is emissive — the event is happening */
  pitch: THREE.MeshStandardMaterial;
  /** bowl rim, secure perimeter, facade ribs */
  rings: THREE.LineBasicMaterial[];
}

function buildStatic(): Built {
  const root = new THREE.Group();
  const lights: Light[] = [];

  // --- ground ---
  // Lifted off pure ink: a cast shadow on a near-black surface is not a
  // shadow, it is nothing, and the point of shadows is that solids stop
  // floating.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.004;
  ground.receiveShadow = true;
  root.add(ground);

  root.add(lineSegments(grid, 0, GRID_LINE));

  // --- streets ---
  const minor = ribbon(roads.filter((r) => !r.major).map((r) => r.pts), ROAD.minor.width, ROAD.minor.y, ROAD.minor.color);
  if (minor) root.add(minor);
  const major = ribbon(roads.filter((r) => r.major).map((r) => r.pts), ROAD.major.width, ROAD.major.y, ROAD.major.color);
  if (major) root.add(major);

  // --- pedestrian corridor: a surfaced ribbon where the street used to be ---
  const ped = ribbon([PED_CORRIDOR.path], PED_CORRIDOR.width, 0.007, '#2b3540');
  if (ped) root.add(ped);
  const posts = PED_POSTS.map((p) => ({
    x: p[0] - plan(3),
    y: p[1] - plan(3),
    w: plan(6),
    d: plan(6),
    h: rise(2.4),
  }));
  const postMesh = instanced(posts, '#39434f', { shadow: false });
  if (postMesh) root.add(postMesh);

  // --- the venue ---
  const { rRim, rPitch, h, pitchH } = VENUE_BOWL;

  // The outer wall is a near-vertical drum, NOT a dish flaring out to the rim.
  // A flared rim overhangs its own foot, so from a raised camera you see the
  // rim and the inside of the bowl and nothing else — the stadium reads as a
  // crater punched in the ground.
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
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);

  const seating = new THREE.Mesh(
    new THREE.CylinderGeometry(s(rRim), s(rPitch), s(h - pitchH), 96, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#1a212a',
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    }),
  );
  seating.position.y = s(pitchH) + s(h - pitchH) / 2;
  root.add(seating);

  // The pitch is EMISSIVE: the event is happening, and the bowl spilling light
  // over its rim is the thing that makes the whole image read as "tonight".
  const pitchMaterial = new THREE.MeshStandardMaterial({
    color: '#2c3a4a',
    emissive: LAMP.cool,
    emissiveIntensity: 0.75,
    roughness: 1,
    metalness: 0,
  });
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(s(rPitch), 72), pitchMaterial);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = s(pitchH);
  root.add(pitch);

  // Light actually leaving the bowl, so the rim and the apron catch it.
  const spill = new THREE.PointLight(LAMP.cool, 3.2, s(plan(900)), 2);
  spill.position.set(0, s(h) * 1.1, 0);
  root.add(spill);

  // Facade ribs. They are what make the drum read as a thing standing up off
  // the ground rather than a hole in it.
  const ribs: number[] = [];
  const RIB_COUNT = 34;
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
      new THREE.LineBasicMaterial({ color: NIGHT.bone, transparent: true, opacity: 0.26, fog: true }),
    ),
  );
  // Concourse lights around the facade. Without them the drum is the single
  // biggest black mass in the picture, in a scene whose whole hierarchy is
  // carried by what is lit.
  const concourse: Light[] = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    concourse.push({
      x: VENUE[0] + Math.cos(a) * rRim * 0.99,
      y: VENUE[1] + Math.sin(a) * rRim * 0.99,
      h: h * 0.42,
      tone: 'warm',
      size: 0.6,
    });
  }
  lights.push(...concourse);

  const rimA = ring(s(rRim), s(h), NIGHT.bone, 1);
  const rimB = ring(s(rRim) - 0.006, s(h) - 0.003, NIGHT.bone, 0.75);
  root.add(rimA, rimB);

  // --- the secure perimeter, with the gates sitting on it ---
  const perimeter = ring(s(VENUE_PERIMETER), 0.006, NIGHT.hairline, 0.7, 128);
  root.add(perimeter);

  const rings = [rimA, rimB, perimeter].map((l) => l.material as THREE.LineBasicMaterial);

  // --- facilities ---
  for (const facility of FACILITIES) {
    for (const object of buildFacility(facility, lights)) root.add(object);
  }

  // --- existing businesses: the shopfront row the villages undercut ---
  const shops = instanced(SHOPFRONTS, '#241b12');
  if (shops) root.add(shops);
  const shopCaps = instanced(
    SHOPFRONTS.map((f) => ({ ...f, h: f.h * 0.1 })),
    NIGHT.business,
    { shadow: false },
  );
  if (shopCaps) {
    shopCaps.position.y = s(SHOPFRONTS[0].h) * 0.9;
    root.add(shopCaps);
  }

  // --- residential fabric: context, and most of it is dark ---
  const homes = RESIDENTIAL.flatMap((b) => b.buildings);
  const homeMesh = instanced(homes, '#141b17');
  if (homeMesh) root.add(homeMesh);

  lights.push(...WINDOWS, ...lamps);

  // --- every light in the scene, grouped by tone ---
  // Warm is the city and the stalls; cool is the plan's own lighting and is
  // what the accent drives; clinical is the gates, which stay clinical.
  const warmPoints = lightPoints(lights.filter((l) => l.tone === 'warm'), LAMP.warm, 0.85);
  if (warmPoints) root.add(warmPoints);
  const clinicalPoints = lightPoints(
    lights.filter((l) => l.tone === 'clinical'),
    LAMP.clinical,
    0.95,
  );
  if (clinicalPoints) root.add(clinicalPoints);
  const cool = lightPoints(lights.filter((l) => l.tone === 'cool'), LAMP.cool, 1.15);
  if (cool) root.add(cool);

  // --- anchors ---
  const anchors = instanced([RAIL_ANCHOR, LOT_ANCHOR], NIGHT.inkRaise);
  if (anchors) root.add(anchors);

  // --- scale bar, lying on the ground where a model's would ---
  const barZ = 2.6;
  const barX = -1.1;
  const barLen = s(SCALE_BAR_UNITS);
  const barGeometry = new THREE.BufferGeometry();
  barGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        barX, 0.006, barZ, barX + barLen, 0.006, barZ,
        barX, 0.006, barZ - 0.04, barX, 0.006, barZ + 0.04,
        barX + barLen, 0.006, barZ - 0.04, barX + barLen, 0.006, barZ + 0.04,
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

  // --- ambient light ---
  // Low. The scene is meant to be lit BY the plan — the bowl, the stalls, the
  // lamps — so the fill light only has to keep the dark city legible.
  root.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5.5;
  key.shadow.camera.right = 5.5;
  key.shadow.camera.top = 5.5;
  key.shadow.camera.bottom = -5.5;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 26;
  key.shadow.bias = -0.0012;
  key.target.position.set(0.7, 0, -0.4);
  root.add(key.target);
  root.add(key);

  return { root, cool, spill, pitch: pitchMaterial, rings };
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
      size: 0.05,
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
 * Projected to screen each frame and written straight to the DOM
 * node's transform — no React state, so they cost nothing per frame.
 *
 * HTML rather than geometry on purpose: a 9px mono micro-label is the
 * one part of this drawing that is pure information, and the moment it
 * is rendered into the scene it starts to shear, scale and fight the
 * fog.
 * ---------------------------------------------------------------- */

interface Label {
  text: string;
  at: THREE.Vector3;
  strong?: boolean;
}

const at3 = (x: number, y: number, h: number) => {
  const [sx, sz] = toScene(x, y);
  return new THREE.Vector3(sx, h, sz);
};

const LABELS: Label[] = (() => {
  const gate = FACILITIES.find((f) => f.kind === 'security_gate');
  const village = FACILITIES.find((f) => f.kind === 'vendor_village');
  const hub = FACILITIES.find((f) => f.kind === 'shuttle_hub');
  const pick = (f?: Facility, h = 0.12) =>
    f ? at3(f.pad.x + f.pad.w / 2, f.pad.y + f.pad.d / 2, h) : new THREE.Vector3();

  return [
    { text: 'Venue', at: at3(VENUE[0], VENUE[1] + VENUE_BOWL.rRim * 1.15, 0.02), strong: true },
    { text: '88,000', at: at3(VENUE[0], VENUE[1], s(VENUE_BOWL.h) + 0.1) },
    { text: 'Security gate', at: pick(gate, 0.3), strong: true },
    { text: 'Vendor village · 40 stalls', at: pick(village, 0.34), strong: true },
    { text: 'Shuttle hub', at: pick(hub, 0.34) },
    // the far end of the row, so it does not sit on the village's label —
    // the two are deliberately close together in the world, which is the
    // whole point of where they are placed
    { text: 'Existing shopfronts', at: at3(
        SHOPFRONTS[9].x + SHOPFRONTS[9].w / 2,
        SHOPFRONTS[9].y + SHOPFRONTS[9].d / 2,
        0.3,
      ) },
    { text: '500 m', at: new THREE.Vector3(-1.1 + s(SCALE_BAR_UNITS) + 0.16, 0.006, 2.6) },
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
  /** the colour the plan's own lighting is thrown in */
  lamp: string;
}

function Scene({ reduced, onReady, labels, lamp }: SceneProps) {
  const { scene, camera, size } = useThree();

  const built = useMemo(buildStatic, []);
  const statics = built.root;
  const egress = useMemo(buildEgress, []);

  const shuttle = useMemo(() => {
    const mesh = instanced([SHUTTLE], NIGHT.bone, { shadow: true });
    const group = new THREE.Group();
    if (mesh) {
      // rebuild at the origin so the group can carry it along the path
      const local = instanced(
        [{ ...SHUTTLE, x: -SHUTTLE.w / 2, y: -SHUTTLE.d / 2 }],
        NIGHT.bone,
        { shadow: true },
      );
      if (local) group.add(local);
    }
    return group;
  }, []);

  const shuttleCurve = useMemo(() => {
    const points = SHUTTLE_PATH.map((p) => {
      const [x, z] = toScene(p[0], p[1]);
      return new THREE.Vector3(x, s(SHUTTLE.h) / 2, z);
    });
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
  }, []);

  useEffect(() => {
    scene.background = new THREE.Color(NIGHT.ink);
    // Depth haze. The corridor leaves toward the anchor through this, which is
    // honest — you cannot see 2.4 km.
    scene.fog = new THREE.FogExp2(NIGHT.ink, 0.07);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene]);

  useEffect(() => {
    const roots = [statics, shuttle];
    const points = egress.points;
    return () => {
      for (const root of roots) {
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

  // The accent recolours the LIGHT the plan is lit by — the lamps, the masts,
  // the service banks, the bowl's spill — and nothing else. The three
  // population colours are a legend and are not the picker's to move.
  useEffect(() => {
    if (built.cool) (built.cool.material as THREE.PointsMaterial).color.set(lamp);
    built.spill.color.set(lamp);
    // The bowl's own light is the loudest thing the accent touches: the pitch
    // is what the whole image is lit from.
    built.pitch.emissive.set(lamp);
    for (const material of built.rings) material.color.set(lamp);
  }, [built, lamp]);

  const target = useMemo(
    () => (size.width < 1024 ? TARGET_NARROW : TARGET_WIDE).clone(),
    [size.width],
  );

  const frames = useRef(0);

  useFrame(({ clock }) => {
    const t = reduced ? 6 : clock.elapsedTime;

    const arc = reduced ? 0 : Math.sin((t / DRIFT_SECONDS) * Math.PI * 2) * DRIFT_ARC;
    const cos = Math.cos(arc);
    const sin = Math.sin(arc);
    camera.position.set(
      target.x + EYE_OFFSET.x * cos - EYE_OFFSET.z * sin,
      target.y + EYE_OFFSET.y + (reduced ? 0 : Math.sin((t / 71) * Math.PI * 2) * 0.12),
      target.z + EYE_OFFSET.x * sin + EYE_OFFSET.z * cos,
    );
    camera.lookAt(target);

    const { position, color, base } = egress;
    for (let i = 0; i < base.length; i++) {
      const d = base[i];
      const phase = ((((t - d.delay) / d.dur) % 1) + 1) % 1;
      // The same envelope as the CSS keyframes on the poster: in by 9%, out
      // after 86%. If you change one, change the other.
      const fade = phase < 0.09 ? phase / 0.09 : phase > 0.86 ? (1 - phase) / 0.14 : 1;
      const k = i * 3;
      position[k] = d.x + d.dx * phase;
      position[k + 1] = 0.012;
      position[k + 2] = d.z + d.dz * phase;
      const w = d.opacity * fade;
      color[k] = SPECTATOR.r * w;
      color[k + 1] = SPECTATOR.g * w;
      color[k + 2] = SPECTATOR.b * w;
    }
    egress.geometry.attributes.position.needsUpdate = true;
    egress.geometry.attributes.color.needsUpdate = true;

    const cycle = (t % (SHUTTLE_SECONDS * 2)) / SHUTTLE_SECONDS;
    const leg = cycle <= 1 ? cycle : 2 - cycle;
    const eased = leg * leg * (3 - 2 * leg);
    const u = Math.min(0.999, eased);
    const atPoint = shuttleCurve.getPointAt(u);
    const ahead = shuttleCurve.getTangentAt(u);
    shuttle.position.copy(atPoint);
    shuttle.rotation.y = Math.atan2(ahead.x, ahead.z);

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
  lamp: string;
}

export function CorridorCanvas({ reduced, onReady, lamp }: CorridorCanvasProps) {
  const labels = useRef<(HTMLSpanElement | null)[]>([]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        // `flat`: no tone mapping. The palette is already authored for a dark
        // screen, and ACES crushes it into mud.
        flat
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'low-power' }}
        camera={{
          fov: 32,
          near: 0.1,
          far: 80,
          position: [EYE_OFFSET.x, EYE_OFFSET.y, EYE_OFFSET.z],
        }}
        // The scene is a drawing, not a control. Pointer events belong to the
        // page behind it.
        style={{ pointerEvents: 'none' }}
      >
        <Scene reduced={reduced} onReady={onReady} labels={labels} lamp={lamp} />
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
