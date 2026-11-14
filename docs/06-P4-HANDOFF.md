# P4: Vision & 3D handoff

Local branch: `p4-vision-table`. Pushes require explicit owner approval.
P1's `peter` scaffold was merged locally with owner approval. On 2026-11-14 the owner
also approved a local merge of `origin/main` at `45352bc` (engine, `/plan` wiring, voice
advisor, landing page) as `8fb1496`. Nothing after `b543844` has been pushed. The implementation
uses the root Next.js app and React Three Fiber; the standalone Vite lab is retired.

## Run and demonstrate

From the repository root:

```powershell
npm ci
npm run dev
```

Open **http://localhost:3000/table** (use the port printed by Next.js).
Click **Load marker test**, move the position slider, enable **3D models**, then
**Confirm plan**. Follow **Open planner** to see the confirmed pieces through P1's
shared Zustand store. Client navigation preserves that store; a full reload resets it.

The generated input goes through the **real js-aruco2 detector**. It is synthetic,
clearly labelled, and does not establish physical camera performance. Draft movements
remain local to the capture session until Confirm. Confirm writes the full world to
the shared store, then runs P3's `buildNetwork` and `simulate` **once** and stores the
network and result, the same sequence as P1's `runPlan`. `/table` reports only the run
time and warning count; the outputs appear in `/plan`. If the engine throws, the stale
network/result are cleared and the failure is shown. No metric is ever substituted.

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

While waiting for a printer, use **Test piece** to select IDs 10–16, the rotation
slider to turn the marker, and **Hide test piece** / **Hide calibration markers**
to exercise disappearance and recovery. Hiding one piece leaves the companion marker
visible, so Confirm may remain available. Hiding calibration markers disables overhead
Confirm. These controls change generated pixels before detection, rather than inserting
fake readings. The generated scene never places duplicate IDs in one frame.

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
`PieceModel.tsx` provides original primitive models for all nine kinds: stadium bowl,
arrival shelter, shuttle bus, parking with cars, market stalls, crosswalk, bike,
road barrier and security gate. They need no downloaded assets or textures. The
**Model size** slider changes only the illustration, never world coordinates/capacity.

Image-space movement, scale and rotation interpolate over a short interval, with the
shortest rotation across ±pi. Demand rendering continues only while settling or when
inputs change. R3F owns GPU cleanup. Render errors/context loss select a visible
fallback while the independent marker/map/Confirm path remains available. Toggle 3D
off/on to retry. Context-loss listener teardown has an automated test; real driver
failure has not been injected in the browser.

The overlay remains a stylized orthographic illustration, not perspective-correct AR
pose estimation. Models follow P1's colour tokens. Physical acceptance is still needed.

Root dependencies after the `main` merge follow P1's manifest: `three@^0.187.0`
(0.187.0 installed), `@react-three/fiber@^9.8.2`, `@types/three@^0.187.0`, plus P4's
`js-aruco2@2.0.0`. The overlay was rechecked in the browser on r187. The merge kept
P4's explicit synthetic wording for the picker entries in `lib/scenarios.ts`; P1's
`main` wording differs, so coordinate before that file reaches `main`. `DraftPlan`
passes `network={null}` and disables pointer input on P1's `WorldLayer`, whose new
business/block dragging would otherwise edit the shared world from the draft preview.

Open integration item: every fixture block still has empty `accessNodeIds`, and the
engine skips such blocks, so `residentDelayMin` and `residentsBlockedPct` are always 0.
They are not counted as blocked, but the resident metrics carry no information yet.
P3's nodes are now named `n_{x}_{y}` (0.5 m snap, `snapKey` in `lib/sim/network.ts`).
Emitting those IDs from the generator needs owner approval and P3 agreement.
See `fixtures/SCENARIOS.md`.

## Verification and physical acceptance

Thirteen automated test groups pass: real dictionary IDs/rotations, blank frames, overhead
orientation/origin/scenario distances, perspective interior points and degenerate
calibration, immutable/locked pieces, jitter/occlusion, Confirm gating, fixture
connectivity, camera replacement/late-stream cleanup, overlay coordinates, frame-rate
independent shortest-path rotation, and context-loss listener cleanup. Typecheck, lint and the
Next.js production build pass.

After the `main` merge (2026-11-14): typecheck, lint and the 13 vision test groups pass
with the engine wiring; the production build passed on the merged tree before the wiring
edit and was not rerun after it. In the dev server, generated markers were detected, the
3D overlay rendered on three r187, and Confirm of a moved shuttle-hub marker changed
`/plan` from plan score 57.9 to 39.7 using the stored 157 ms run (no rerun on arrival).
The embedded preview reported `document.hidden`, throttling frames to about 1 fps, so
Confirm was triggered by script right after a frame; the 500 ms freshness gate refused
a normal click there, as designed. Local image/video input, camera switching, the
angled calibration and JSON export were not rechecked after the merge.

Browser checks cover generated detection/movement, R3F rendering, Confirm and shared
planner navigation, capture reset on route departure, and calibration/scenario controls.
The expanded test scene also exercises all movable IDs, rotation, occlusion/recovery,
model sizing and repeated 3D toggles. A development hydration warning was traced to
the browser extension's injected `cz-shortcut-listen` body attribute; no shared root
layout change or warning suppression was applied.
Confirmed JSON export was downloaded and inspected: the expected scenario, stable
piece IDs, `fromMarker`, position and rotation survived serialization. Chrome's
automation download event timed out, so verification used the actual downloaded file.
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
