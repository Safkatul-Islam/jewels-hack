# Playing cards in the table app

The owner approved the local merge of Claude's `3606196` into `p4-vision-table`
(merge `e601d0c`) and the card-input/enrollment UI. No push is authorized. Claude may
continue real-photo checks in the separate cards worktree; later changes need review
and separate merge approval. No engine, frozen shared types, package manifest or
lockfile was changed for this integration.

## First try: software demo

1. Open `http://localhost:3000/table` with **Playing Cards** selected.
2. Click **Load card demo**. Three synthetic sample faces are enrolled into a separate
   demo session: venue (0), arrival (1), shuttle (10).
3. Enable **3D models**, then move/rotate the shuttle with the test sliders.
4. Press **Confirm plan** and follow **Open planner** to inspect actual simulation output.

The demo draws pixels that pass through the real contour/appearance recognizer. It does
not insert recognized identities directly. Sprites are cached once; the expensive
synthetic-scene generator never runs for each video frame. Sample references do not
replace physical-card references. Reloading/starting the demo rebuilds its sample set.

To exercise enrollment manually, clear the demo references, select **Venue card only**,
choose role 0 and enroll; repeat with arrival/1 and shuttle/10. Return the demo view to
**All three sample cards**. Selecting one card hides the others, so overhead calibration
is unavailable until both calibration cards and a movable card are present again.

## Enroll physical cards or photos

1. Use a dark, contrasting surface, diffuse light, and distinct face-up cards. Keep
   every corner visible, cards separated, and other cards off the table.
2. Start a browser-visible camera explicitly, or open a local image/video file.
   Loading files never uploads them. An iPhone bridge is still a separate setup task.
3. Show exactly one card. Choose a **Planning role**, optionally name the card, and
   click **Enroll visible card**. A successful re-enrollment replaces only that role.
4. Repeat for 0 (venue), 1 (first arrival anchor) and 10 (shuttle). The menu also supports
   all other existing planning roles, 11–16.
5. Put the enrolled cards in view together. Overhead mode uses the current scenario's
   venue-to-first-anchor distance; angled views need the existing four-corner calibration.
6. Inspect match feedback, draft and 3D, then Confirm. Simulation still runs only on Confirm.

Enrollment captures the displayed image, including a still photograph. It requires a
processed frame but not a continuously fresh position. Confirm separately retains its
500 ms freshness requirement. Enrollment failure preserves the previous reference.

Reference appearances stay in browser memory across client navigation to the planner
and back. Reloading clears them. Clear/remove buttons are explicit; camera pixels and
appearance vectors are not written to disk, localStorage, or any external service.
Stopping/replacing input releases capture while retaining physical-card references.
Source, dimensions, mode and scenario changes invalidate tracking/calibration.

## Scores and direction

Uncertain, duplicate, low-score or unknown identities do not become planning pieces.
Rejected outlines remain visible in amber with a rejection reason. Match scores are
heuristics, not probabilities. The known near-twin limitation of the detector remains:
an unenrolled similar card may match a reference. Use only the selected cards and
validate real scores instead of lowering thresholds merely to obtain a match.

Many cards are symmetric under a half turn. The adapter keeps the closest previous
heading for ambiguous observations, so score noise does not flip models by 180°.
**Flip 180°** explicitly changes the selected role's heading; it is retained until
changed/removed/re-enrolled. This cannot recover an unknowable physical direction from
a symmetric face. The overlay remains stylized orthographic, not full camera pose AR.

## Integration boundary

- `lib/vision/cards/**`: Claude's recognizer; unchanged by this UI integration.
- `lib/vision/cardInput.ts`: session enrollment, role mapping, identity rejection,
  stable ambiguous headings, manual flips and score conversion.
- `lib/vision/cardSample.ts`: browser-only cached synthetic demo sprites/references.
- `app/table/useTableCapture.ts`: switches input modes/sources, owns capture lifecycle,
  retains the physical session across client routes, and updates drafts through TableSession.
- `app/table/CardSetup.tsx`: enrollment, removal, match feedback and heading controls.
- `lib/vision/contracts.ts`: an optional pixel-detection confidence field. Frozen
  `lib/sim/types.ts` is unchanged. ArUco keeps its existing Hamming-derived heuristic;
  accepted cards carry a bounded similarity heuristic without fabricating Hamming errors.

## Verification

Run the existing vision suite with `npm run test:vision`. Run all three suites from
PowerShell with the installed runner (no dependency download):

```powershell
.\node_modules\.bin\tsx.cmd --test lib/vision/vision.test.ts lib/vision/cards/cards.test.ts lib/vision/cardInput.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

The combined suite has 25 test groups: 14 existing vision/fixture/lifecycle checks,
8 card-detector tests and 3 adapter integration tests. New checks exercise recognition
into calibration/world/Confirm, failed enrollment preservation, invalid roles, removal,
unknown/uncertain rejection and stable half-turn correction.

Browser checks cover the bundled CV deep import, three recognized demo faces, manual
enrollment of the three demo roles, rejection of multiple cards during enrollment,
local PNG enrollment, physical-session reference retention through planner navigation,
and the existing ArUco fallback. Synthetic PNG fixtures were used for the local-file
check; no actual playing-card photograph or live camera was used by Codex.

The dev-browser card flow also passed normal Confirm and planner navigation: the
baseline score 57.9 became 39.7 after the generated shuttle moved/rotated, and `/plan`
retained the stored 369 ms run. That runtime exceeds the 200 ms target; it is one
observation under concurrent development load, not a benchmark or a validated forecast.
Hiding calibration cards disabled Confirm, and restoring them recovered calibration.
Manual half-turn correction and the associated warning were exercised in the UI.

Typecheck, lint and the production build pass. In the production browser the deep CV
import recognized all three sample cards; moving/rotating and normal Confirm passed,
with a 406 ms simulation run in that observation. Warm card-processing HUD readings
were about 18–34 ms there. These are individual readings, not frame-rate guarantees.

Real-deck recognition, camera framing/glare and venue-light performance remain physical
acceptance tasks. See Claude's `docs/08-PLAYING-CARDS.md` for detector limitations and
real-photo measurements when available. Do not claim physical readiness from this demo.
