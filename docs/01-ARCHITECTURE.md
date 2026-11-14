# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15, App Router, TypeScript** | Route-level ownership splits the team cleanly; one server route for the LLM key |
| Styling | **Tailwind v4 + shadcn/ui** | Fastest path to a polished UI; components are copy-in, so no version fights |
| Motion | **Framer Motion** | Piece drags, number transitions, panel reveals — the "fancy" comes mostly from here |
| State | **Zustand** | One store, no provider ceremony, readable from plain functions |
| Plan canvas | **SVG** for pieces/roads, **one `<canvas>`** for heatmaps | SVG gives free hit-testing and drag; canvas for the 10k-cell heatmap |
| Charts | **Recharts** | Good enough in 20 minutes |
| Simulation | **Plain TS in `lib/sim/`** — no React, no server | Must re-run in <200 ms on every drag |
| 3D | **three.js via @react-three/fiber** | Declarative, same mental model as the rest of the app |
| Markers | **js-aruco2** | Pure JS, no WASM build step, no OpenCV toolchain |
| LLM | **Claude API, `claude-haiku-5-5`, streaming** | Personas only; latency matters more than depth here |

### Decisions already made — don't re-litigate these at hour 3

- **No map library.** No Leaflet, no Mapbox, no tile loading, no projection math. One
  static satellite PNG of the Arroyo → Old Pasadena corridor in `/public`, with a declared
  world bounding box in meters. We own the coordinate system. It looks *more* controlled on
  stage, and it saves roughly 90 minutes.
- **World units are meters**, origin at the Rose Bowl's center, +x east, +y north. Every
  position in every module is in world meters. Screen pixels exist only inside
  `lib/transform.ts`. If you find yourself converting coordinates anywhere else, stop.
- **The simulation is a pure function.** `simulate(world, network) → SimResult`. No network
  calls, no DOM, no React, no `Date.now()` outside the reported runtime, no `Math.random()`
  except through the seeded RNG. This is what lets it be developed headless, tested from a
  terminal, and re-run on every drag.
- **The sim does not run on the server.** Dragging a piece must not make an HTTP request.
- **`scorePlan()` is separate from `simulate()`.** Moving the weight sliders recomputes the
  score from existing metrics without re-simulating. That's what makes the sliders feel instant.

## Data flow

```
                    ┌─────────────────────────────────┐
                    │  WorldState  (Zustand, client)  │
                    │  venue + station locked         │
                    │  pieces[]  ◄── user drags       │
                    │  pieces[]  ◄── ArUco markers    │
                    └────────────┬────────────────────┘
                                 │
                   ┌─────────────▼──────────────┐
                   │  buildNetwork(world)       │   P3
                   │  → RoadNetwork             │   pure
                   │  roads, closures, shuttles │
                   └─────────────┬──────────────┘
                                 │
                   ┌─────────────▼──────────────┐
                   │  simulate(world, network)  │   P3
                   │  → SimResult               │   pure, <200ms
                   │  metrics, heatmaps, timeline│
                   └─────────────┬──────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
    ┌───────────────┐   ┌─────────────────┐  ┌──────────────────┐
    │ Plan canvas   │   │ Dashboard       │  │ POST /api/personas│
    │ heatmap layer │   │ metrics, charts │  │ → streamed quotes │
    │           P1  │   │  scorePlan()  P2│  │               P2  │
    └───────────────┘   └─────────────────┘  └──────────────────┘
```

Two input surfaces — mouse drag and camera markers — write to the **same** `pieces[]`
array. That's the entire trick behind the table mode: vision is just another input device.
It implements one function and touches nothing else:

```ts
markersToWorld(readings: MarkerReading[], base: WorldState): WorldState
```

## File layout — ownership is by folder

```
app/
  page.tsx                    P1   landing page
  plan/page.tsx               P1   the planner (hosts P1 canvas + P2 dashboard)
  table/page.tsx              P4   ArUco camera mode
  api/personas/route.ts       P2   Claude proxy, streaming
components/
  plan/                       P1   PlanCanvas, PieceLayer, PiecePalette, RoadLayer, HeatmapLayer
  dashboard/                  P2   MetricCard, ScoreDial, WeightSliders, EgressChart, PersonaPanel
  three/                      P4   MarkerScene, VenueModel, PieceModel
  ui/                         P1   shadcn components (P1 owns the design system)
lib/
  sim/
    types.ts                  ⚠️  FROZEN CONTRACT — see 02-CONTRACTS.md
    network.ts                P3   buildNetwork, route
    simulate.ts               P3   simulate, scorePlan
    rng.ts                    P3   seeded RNG
  transform.ts                P1   world meters ↔ screen pixels, the ONLY place this happens
  store.ts                    P1   Zustand store
  vision/
    aruco.ts                  P4   camera → MarkerReading[]
    markersToWorld.ts         P4   MarkerReading[] → WorldState
fixtures/
  rosebowl.json               P4   the base world: streets, businesses, blocks
  scenario-metro.json         P4   preset: Metro's current plan
  scenario-carfirst.json      P4   preset
  scenario-neighborhood.json  P4   preset
public/
  arroyo.png                  P4   satellite basemap
scripts/
  sim.ts                      P3   headless runner: `npx tsx scripts/sim.ts fixtures/x.json`
docs/                              these files
```

If you need to edit a file outside your folder, say so in the group chat first. The two
exceptions, which everybody will need and nobody owns alone:

- `lib/sim/types.ts` — frozen at T+0:20. Changes require telling all four people.
- `app/plan/page.tsx` — P1 owns it, but it's where P1's canvas and P2's dashboard meet.
  Agree the layout in the first 20 minutes and don't touch it after.

## The headless harness — this is what makes parallel work possible

P3 should never wait for a UI to exist. `scripts/sim.ts` loads a fixture, runs
`buildNetwork` then `simulate`, and prints the metrics as a table:

```bash
npx tsx scripts/sim.ts fixtures/scenario-metro.json
```

That means the engine can be built, tuned, and demonstrated before a single component
renders. Same in reverse: P1 and P2 develop against a hand-written `SimResult` literal in
`fixtures/mock-result.ts` and don't care whether the real sim exists yet.

**Everyone commits a stub that compiles, in the first 20 minutes.** `buildNetwork` can
return the base roads untouched. `simulate` can return hard-coded numbers. The dashboard
can render the mock. The point is that the whole pipe is connected and type-checks before
anyone writes real logic — so the integration at T+2:00 is wiring, not surgery.

## Performance budget

| Thing | Budget | If you blow it |
|---|---|---|
| `buildNetwork` | 30 ms | Cache on a hash of `pieces[]` |
| `simulate` | 200 ms | Cut agent count — 2,000 sampled agents scaled up reads identically |
| `scorePlan` | 1 ms | It's arithmetic; you can't blow it |
| Drag frame rate | 60 fps | Don't re-simulate during drag. Simulate on drop. |
| Personas | 3 s, streamed, after the sim | Never blocks the numbers |

Spectators are **sampled, not enumerated.** Simulate 2,000 agents and multiply by 44. The
numbers are indistinguishable and it runs 40× faster. Say "sampled agent-based model" if a
judge asks — that's the normal approach, not a shortcut.

If `simulate` ends up over ~300 ms, move it to a Web Worker rather than optimizing. But
measure first: 2,000 agents over 240 ticks is about half a million operations, which is
nothing.

## LLM personas — the latency answer

The question was whether the LLM makes it too slow. It can't, because it's off the critical
path by design:

1. User drops a piece → sim runs → **numbers and charts are on screen in <1 s**
2. *Then* `POST /api/personas` fires with the metrics as JSON
3. Quotes stream into the persona panel over the next 2–3 s, each card skeleton → text

Use `claude-haiku-5-5`, request all 6 personas in one call, stream the response. Prompt the
model with the actual metric deltas — "resident delay went from 4 to 19 minutes, local
capture fell to 38%" — and give each persona a fixed identity in the fixture so they're the
same people across runs. Personas that react to real numbers feel uncanny; personas that
invent their own numbers get caught by a judge.

**Cache the last successful response to `localStorage`.** If the API is slow or the venue
wifi dies during the demo, the panel shows the cached quotes rather than a spinner. Also
commit one pre-generated response as a fixture, and have a `?mock=1` flag that uses it.
Decide this now, not at 2 a.m.
