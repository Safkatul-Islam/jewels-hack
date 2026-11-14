# P4: Vision & 3D handoff

Local branch: `p4-vision-table`. Pushes require explicit owner approval.
P1's `peter` scaffold was merged locally with owner approval. The implementation
uses the root Next.js app and React Three Fiber; the standalone Vite lab is retired.

## Run and demonstrate

From the repository root:

```powershell
npm ci
npm run dev
```

Open **http://localhost:3000/table** (use the port printed by Next.js).
Click **Load marker test**, move the shuttle slider, enable **3D primitives**, then
**Confirm plan**. Follow **Open planner** to see the confirmed pieces through P1's
shared Zustand store. Client navigation preserves that store; a full reload resets it.

The generated input goes through the **real js-aruco2 detector**. It is synthetic,
clearly labelled, and does not establish physical camera performance. Draft movements
remain local to the capture session until Confirm. Confirm writes the full world to
the shared store and clears the previous result. **P3's simulation is not wired yet**;
the route does not invent metrics or claim a simulation ran.

```powershell
npm run test:vision
npm run typecheck
npm run lint
npm run build
npm run markers
node scripts/generate-scenarios.mjs
git diff --check
```

`markers` regenerates nine SVGs and the printable HTML in `public/markers/`.
The scenario generator is deterministic; both fixture networks have 30 junctions,
49 connected edges, 40 businesses, 12 blocks, six fictional personas and two anchors.

## Print and connect the camera

Open **http://localhost:3000/markers/index.html**. Print **one page first**, at
**100% / Actual size**. The black square should measure **80 mm**, with 12 mm total
white quiet margin on each side. Check with a ruler before printing the rest.
Use matte paper. Keep spare IDs 0 and 1; avoid duplicate IDs in one camera view.

The user's hardware is an iPhone 17 Pro Max and Windows 11 ASUS Zephyrus G16.
[Camo Studio](https://camo.com/studio) is a researched candidate phone bridge: its
vendor lists iOS 15+ and Windows 10+ support. No bridge was installed or tested here.
Prefer USB for the demo if available, then verify the phone appears in the browser's
camera menu. A laptop webcam or local image/video file also works as input.

For mounting, prefer a tripod with a phone clamp. A temporary option is a rigid board
bridging two stable book stacks, with the phone secured over the table and the lens
unobstructed. Keep it parallel to the table for overhead calibration. Mounting alone
does not connect a phone camera to Windows.

The camera menu lists browser-visible video inputs after permission. Camera capture
requires localhost or trusted HTTPS. Opening the laptop's LAN HTTP URL on the phone
does not forward the phone feed. Audio is never requested. Camera/video pixels and
local files are processed in the browser without an upload.

## Calibration and tracking

- **Overhead:** IDs 0 and 1 map to the scenario venue and first arrival anchor. They
  establish translation, scale and rotation, with image Y inverted into world north.
  Both must remain visible. This does not correct arbitrary perspective.
- **Angled:** mark a rectangular table area. Select four corners in the unmirrored
  image: **top left, top right, bottom right, bottom left**. These map to the scenario
  bbox. A homography rectifies points on that plane; it does not correct lens distortion
  or estimate full 3D pose. Keep the camera fixed after calibration.
- Source, resolution, scenario and external world changes reset calibration/tracking.
  Changing modes immediately invalidates Confirm. Route departure releases capture.
- Tracking averages five readings, suppresses position changes below 15 world metres
  and rotation changes below 0.08 radians, and holds missing readings for at most 500 ms.
  Missing markers do not delete previously placed pieces.
- Confirm requires fresh calibration and at least one visible, in-bounds movable marker.
  A frame older than 500 ms cannot be confirmed. The export contains the last confirmed
  snapshot for the current scenario, excluding subsequent unconfirmed movement.
- Detection's Hamming-derived confidence is a heuristic, not a calibrated probability.

## Integration and ownership

`lib/vision/contracts.ts` reexports the actual types and `MARKER_MAP` from
`lib/sim/types.ts`; piece capacities/labels come from P1's `lib/pieces.ts`.
No temporary parallel world contract remains.

`app/table/useTableCapture.ts` owns camera/file input, throttled 10 Hz detection,
session resets, RAF cleanup, media tracks, image bitmaps and object URLs.
`CameraController` also guards superseded asynchronous camera starts.

`TableSession<WorldState>` owns draft/confirmed separation. `markersToWorld` performs
immutable upserts, adopts an existing unmarked piece of the same kind, and preserves
stable IDs, capacities and locked pieces. The route uses `setWorld` and `setResult(null)`
only on explicit Confirm. P1's map layers and coordinate transform render the draft.

`components/three/MarkerScene.tsx` is a client-only, dynamically imported R3F Canvas.
`PieceModel.tsx` provides declarative primitive meshes and a stadium ring. R3F owns
GPU cleanup. The overlay uses orthographic image coordinates and demand rendering;
it is not perspective-correct AR pose estimation. Models follow P1's colour tokens.

Root dependency additions: `js-aruco2@2.0.0`, `three@0.182.0`,
`@react-three/fiber@9.8.2`, and development types `@types/three@0.182.0`.
P1's Next.js 15 / React 19 versions remain unchanged.

P1/P3 integration remaining: call `buildNetwork(confirmedWorld)` and then the actual
simulation on Confirm when those modules are available. The store deliberately does
not run simulation itself. Resolve fixture `accessNodeIds` using P3's node convention;
empty unresolved IDs must not be counted as blocked access. See `fixtures/SCENARIOS.md`.

## Verification and physical acceptance

Ten automated test groups pass: real dictionary IDs/rotations, blank frames, overhead
orientation/origin/scenario distances, perspective interior points and degenerate
calibration, immutable/locked pieces, jitter/occlusion, Confirm gating, fixture
connectivity, and camera replacement/late-stream cleanup. Typecheck, lint and the
Next.js production build pass.

Browser checks cover generated detection/movement, R3F rendering, Confirm and shared
planner navigation, capture reset on route departure, and calibration/scenario controls.
No physical camera, printed dimensions, iPhone connection or venue-lighting performance
has been verified. Run this physical check before claiming the live demo is ready:

1. Detect printed IDs 0/1 plus 10 and 12 under the room lights.
2. Move each planning piece along both axes and rotate one.
3. Cover a movable marker briefly, then cover an anchor; overhead Confirm must disable.
4. Switch scenarios and recalibrate. Confirm and inspect the shared planner.
5. Stop capture and verify the camera indicator turns off; repeat after leaving `/table`.

The retired `tools/p4/` generated artifacts remain ignored locally because automatic
approval review rejected deleting that directory. They are unused and uncommitted.

Library reference: [js-aruco2](https://github.com/damianofalcioni/js-aruco2), MIT.
