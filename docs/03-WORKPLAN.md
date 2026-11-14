# Work plan — 4 people, ~6 hours

Fill in the wall-clock times in the left column before you start, so nobody has to do
arithmetic at hour four.

## Roles

| | Role | Owns | Never touches |
|---|---|---|---|
| **P1** | **Experience** | Landing page, app shell, design system, Zustand store, `transform.ts`, the drag-and-drop plan canvas | `lib/sim/*` |
| **P2** | **Dashboard** | Metric cards, score dial, weight sliders, charts, heatmap overlay, persona panel, `/api/personas` | `lib/sim/*`, `components/plan/*` |
| **P3** | **Engine** | `buildNetwork`, `simulate`, `scorePlan`, seeded RNG, `scripts/sim.ts` | Anything that imports React |
| **P4** | **Vision & 3D** | Hour 1: the map fixture. Then ArUco table mode, three.js overlay | `lib/sim/*`, `components/dashboard/*` |

P1 is the integrator. When two people disagree about where something goes, P1 decides and
everyone moves on. Pick your most decisive person, not your best coder.

**P3 is the critical path.** If P3 is blocked, the project is blocked. Everybody else's
job includes not blocking P3 — which mainly means P4 shipping the fixture early and nobody
renaming anything in `types.ts`.

## Timeline

### T+0:00 → T+0:20 — Contract lock. All four people, same table, laptops shut for ten minutes.

- Read `00-PRD.md` out loud. Not silently — out loud, together. Ten minutes, and it is the
  highest-return ten minutes of the day.
- Copy `02-CONTRACTS.md` into `lib/sim/types.ts`. **Freeze it.**
- Agree the `/plan` page layout: canvas left, dashboard right. Draw it on paper.
- Scaffold: `npx create-next-app@latest`, Tailwind, shadcn init, Zustand, Recharts. One
  person does this and pushes; the other three pull.

### T+0:20 → T+1:00 — Stubs. Nobody writes real logic yet.

Goal: **the whole pipe compiles and renders fake data end to end.** See the stub checklist
at the bottom of `02-CONTRACTS.md`. P4's `fixtures/rosebowl.json` lands in this window —
it's the gating deliverable, so P4 starts it first and nothing else.

Trace the street network coarsely off a satellite screenshot. 30 nodes, 40 edges, 40
businesses, 12 blocks. **Do not make it accurate.** Make it exist.

### T+1:00 → T+2:00 — Real logic, in parallel.

| | Doing |
|---|---|
| P1 | Pieces drag and snap. Palette works. Pieces persist to the store. |
| P2 | Real charts bound to `SimResult` shape. Weight sliders calling real `scorePlan`. |
| P3 | `buildNetwork` actually responds to pieces — closures cut edges, hubs add shuttle lines. A* routing works. |
| P4 | Hands off the fixture, then starts ArUco: camera feed, marker detection, the two-marker calibration. |

### ⛔ T+2:00 — INTEGRATION 1. Everyone stops. Fifteen minutes. No exceptions.

Delete the stubs one at a time and wire real `simulate` into the real UI.

**The pass condition: drag a piece, drop it, and a number on the dashboard changes.**

Nothing else matters at this checkpoint. If that works, you have a project. If it doesn't,
stop adding features and fix it — go to the cut list below immediately. Do not let anyone
say "let me just finish this one thing first."

### T+2:15 → T+3:30 — Depth.

| | Doing |
|---|---|
| P1 | Baseline-vs-current compare toggle. Motion polish on pieces. Landing page. |
| P2 | Heatmap overlay. Egress timeline chart. `/api/personas` streaming. |
| P3 | All ten metrics. Tune the parameters until the numbers feel *plausible* — a judge who knows LA will notice if egress is 4 minutes. |
| P4 | ArUco → `markersToWorld` → store. Markers moving on the table move pieces on screen. |

### ⛔ T+3:30 — GO/NO-GO on the table mode.

If markers are not detecting and moving pieces on screen **by T+4:00**, cut ArUco. Keep the
printed markers on the table as a physical prop, and present the screen version. This is a
pre-made decision, so it costs no argument when the moment comes.

### ⛔ T+4:00 — INTEGRATION 2, then **record the demo video.**

Record it now, at T+4:00, while everything works and nobody is panicking. Screen recording
plus a phone video of the table. Two takes.

This is the single most important instruction in this document. A recorded demo means the
live demo failing costs you nothing. Teams that record at T+6:00 don't record at all.

### T+4:00 → T+5:15 — Polish and the three worst bugs.

3D models on the markers, if and only if ArUco survived its gate. Persona copy. Visual
polish. Fix the three ugliest bugs and consciously leave the rest.

### ⛔ T+5:15 — FEATURE FREEZE. Hard.

No new code. Not "one small thing." The next 45 minutes are:

- Rehearse the 3-minute demo **out loud, three times.** Time it. It will run long the first
  time; cut words, not beats.
- Write the README — what it is, the three metrics that matter, how to run it.
- Slides, if they're required. Four of them: problem, demo, how it works, what's next.
- Decide who speaks and who drives. **Don't let the same person do both.**
- Submit. Then re-check that the submission actually went through.

### T+6:00 → Submitted, with buffer.

If you have spare time at the end, that's a win, not a waste. Use it to rehearse a fourth
time.

## Pre-decided cut list

When you're behind, cut in this order. The decision is already made, so nobody has to
defend their piece at hour five.

1. **3D models on the markers** → flat coloured squares on the markers instead
2. **ArUco entirely** → markers stay on the table as a prop, demo on screen
3. **Heatmap overlays** → numbers alone carry it
4. **LLM personas** → ship the pre-generated fixture quotes, labelled as examples
5. **Egress timeline chart** → one number instead of a curve
6. **Preset scenarios** → baseline plus one is enough

### Never cut these. This is the product.

- Drag a piece → network regenerates → **the numbers change**
- Plan Score with three live weight sliders
- Baseline vs. current, side by side

If those three work and nothing else does, you still have a strong submission. If you have
ArUco and 3D but dragging doesn't change the numbers, you have a tech demo with no idea in it.

## Rules of engagement

- **Push every 30 minutes.** Working or not, compiling or not, on a branch if you must.
- **Stuck for 15 minutes → say it out loud.** Not in a DM. Out loud, to the table. Four
  people and six hours means a 40-minute silent struggle is 10% of your total capacity.
- **Nobody edits another person's folder** without saying so first.
- **`types.ts` changes get announced.** Adding an optional field is free. Renaming costs
  everybody a merge conflict.
- **Commit the fixtures.** Never leave the base world only on one laptop.
- **One person owns the git remote** and resolves conflicts. Usually P1.
- **No refactors after T+4:00.** Ugly and working beats clean and broken.

## Known risks

| Risk | Mitigation |
|---|---|
| ArUco won't detect under venue lighting | Big markers — 8–10 cm, thick white border. Test under the actual room lights early. Matte paper, not glossy. |
| Webcam permission or HTTPS issues | `getUserMedia` needs a secure context. `localhost` counts. Don't demo from a LAN IP. |
| Sim produces absurd numbers | P3 tunes against intuition at T+3:00. "Egress p90 of 70 minutes" is believable; 4 minutes is not. |
| Numbers don't move when a piece moves | Most likely a stale cache on `RoadNetwork.hash`. Check this first — it's the classic bug in this architecture. |
| LLM API dies mid-demo | `localStorage` cache plus a committed fixture plus a `?mock=1` flag. |
| Merge conflict at hour five | Folder ownership. It's why the split is by folder and not by feature. |
| Someone builds a feature nobody asked for | The cut list and the PRD scope tiers exist precisely to make this a quick conversation. |
