# Table mode — P4's playbook

The ArUco table is the showstopper and the riskiest thing in the build. It is also the
only piece with a hard kill gate (T+3:30, see `03-WORKPLAN.md`). Read this before starting.

**Order of work.** Camera feed → detection → calibration → pieces move on screen → *then*
3D. Each step is demonstrable on its own. If you run out of time at step four you still
have a real demo; if you start with 3D you have nothing until the very end.

## Printing the markers

| | |
|---|---|
| Dictionary | `ARUCO_MIP_36h12` — more robust than the original ArUco dictionary. **The generator and the detector must use the same dictionary**, so set this in both and verify one marker detects before printing nine. |
| Size | **8–10 cm** per marker. Bigger than feels necessary. Detection range scales with marker size in pixels, and a webcam two feet above a table has less resolution than you think. |
| Quiet zone | A white border of at least one marker module — practically about 1 cm. Markers that bleed to the paper edge do not detect. |
| Paper | **Matte.** Glossy photo paper catches overhead light and kills detection at exactly the angle you'll be demoing from. |
| Mounting | Glue to cardboard or foam core. Paper curls, and a curled marker is a warped square. |
| Labels | Write the marker ID and what it is **on the back** in marker pen. At hour five nobody remembers that 12 is the vendor village. |

IDs come from `MARKER_MAP` in `02-CONTRACTS.md`: `0` venue, `1` station, `10`–`16` the
placeable pieces. Print **two spares** of markers 0 and 1 — if a calibration marker gets
coffee on it the whole table stops working.

## Calibration — do not hard-code a homography

Markers `0` (Rose Bowl) and `1` (Memorial Park Station) are the calibration pair. Their
true separation is known from the fixture, about 2,900 m. Every frame:

```
scale    = 2900 / pixelDistance(marker0, marker1)
rotation = angle(marker0 → marker1)  −  angle(venue → station in world coords)
origin   = marker0.center
```

Then every other marker's pixel centre runs through that transform to become world metres.

This is about fifteen lines and it means **the table can be any size, at any angle, with
the camera anywhere.** It removes the single largest source of demo failure — a
pre-calibrated setup that breaks the moment someone nudges the table. Derive it every
frame, from the markers themselves.

## Smoothing — the step everyone skips

Raw per-frame ArUco output jitters by several pixels, which at table scale is tens of
world metres. Un-smoothed, that re-triggers the simulation continuously and looks broken.

- Rolling average of each marker's position over ~5 frames
- A marker that vanishes for under ~500 ms keeps its last known position
- Only register a move when it exceeds roughly 15 world metres

**And put the simulation behind a Confirm button.** Markers move → the plan updates live on
screen → the user presses Confirm → the sim runs and the dashboard fills. Continuous
re-simulation is impressive for ten seconds and then reads as instability. The Confirm
interaction is also exactly what the original idea described, and it's the right call.

## Lighting and camera

- Diffuse overhead light. No desk lamp raking across the table, no phone torch.
- 1280×720 is plenty. Higher resolution costs frame rate and buys nothing.
- Convert to greyscale before detection.
- **Test under the actual room lights early**, not under the lights at your hotel. Venue
  fluorescents plus a projector washing out the table is the realistic failure case.
- `getUserMedia` needs a secure context. `localhost` qualifies; a LAN IP does not. **Demo
  from `localhost`.**

## 3D — do not model anything

Six hours of modelling buys about four seconds of demo. Use CC0 assets or primitives:

| Source | Licence | Notes |
|---|---|---|
| [Kenney](https://kenney.nl/assets) | CC0 | City Kit and the building packs are exactly this use case |
| [Quaternius](https://quaternius.com) | CC0 | Low-poly buildings and props |
| [Poly Pizza](https://poly.pizza) | CC0 / CC-BY | Check per-model licence; attribute if CC-BY |

Load `.glb` through `@react-three/drei`'s `useGLTF`. **Start with extruded boxes** — a
colour-coded box per piece kind reads perfectly well on a marker, and swapping in a `.glb`
later is a one-line change. The Rose Bowl itself: a scaled oval ring, which is more
recognisable than any detailed model at that size anyway.

### Two routes for the overlay, in order of safety

**Safe — top-down orthographic.** You already have scale, rotation and origin from
calibration. Render the video as a plain `<video>` element, put a transparent
`<canvas>` over it, and use an `OrthographicCamera` looking straight down with the same
transform. Models sit flat on the markers. Takes maybe 30 minutes and cannot really fail.

**Impressive — real pose.** js-aruco ships a POSIT pose estimator that returns per-marker
rotation and translation, which you can drive a perspective three.js camera with, so models
stand upright on the table in correct perspective. Check the library's pose module API
before committing — budget an hour, and only attempt it after the orthographic version
works and is committed.

Do the safe one first, commit it, then try the other. Never the reverse.

## Fallbacks, decided in advance

1. **Markers detect but 3D doesn't land** → coloured squares on the markers. Still reads as magic.
2. **Detection is unreliable** → demo the screen version, leave the printed markers on the
   table as a physical prop. People will still ask about them, and you get to describe it.
3. **Camera fails entirely at demo time** → play the video you recorded at T+4:00.

Record the table working **the moment it works once**, on a phone. Not later. The recording
is what makes all of this risk-free.
