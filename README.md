# ARROYO

**A planning sandbox for the last mile around any major venue.**

A stadium holds 60–90,000 people. They arrive in about three hours and leave in about one.
Between the venue and wherever they came from — a rail station, a parking lot, a freeway
exit — there's a corridor of a mile or two. **That corridor is somebody's neighbourhood,**
and it's where the small businesses are.

Cities plan the venue. Cities plan the transit line. Almost nobody plans the last mile for
everyone who uses it at once.

ARROYO is a sandbox for that corridor. The venue and the arrival anchors are fixed; you
place the shuttle hubs, park-and-rides, vendor villages, pedestrian corridors and road
closures between them. The network regenerates, an agent simulation runs spectators,
residents and businesses through it, and you see what your plan does to each of them.

There is no optimal plan. There's only whose plan it is. ARROYO makes the tradeoff visible.

### Any venue

A scenario is just a JSON file — venue, arrival anchors, network, businesses, blocks,
personas. Nothing in the engine knows which city it's in. We ship the **Rose Bowl (LA28
Olympic football)** as the default, because a 90,000-seat venue with no rail station is an
unusually sharp example of the general problem. Swap the file and the whole world changes.

## Docs — read in order

| | | |
|---|---|---|
| [00-PRD.md](docs/00-PRD.md) | Product | What we're building, scope tiers, metric definitions, demo script |
| [01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | Everyone | Stack, scenario model, data flow, file ownership, performance budget |
| [02-CONTRACTS.md](docs/02-CONTRACTS.md) | Everyone | **The frozen types. Copy into `lib/sim/types.ts` first.** |
| [03-WORKPLAN.md](docs/03-WORKPLAN.md) | Everyone | 4-person split, hour-by-hour timeline, cut list |
| [04-TABLE-MODE.md](docs/04-TABLE-MODE.md) | P4 | ArUco markers, calibration, 3D assets, fallbacks |
| [05-DECISIONS.md](docs/05-DECISIONS.md) | Reference | Why things are this way, and what's still unverified |
| [06-P4-HANDOFF.md](docs/06-P4-HANDOFF.md) | P4 / integration | Table setup, marker printing, calibration, checks and remaining work |
| [07-ENGINEERING-NOTES.md](docs/07-ENGINEERING-NOTES.md) | Everyone | Researched sources and owner-approved engineering decisions |

## Status

P1's Next.js planner scaffold and P4's camera/table route are implemented locally.
Simulation/dashboard integration and physical camera acceptance remain in progress.
Scenarios contain synthetic, illustrative data; they are not official plans or forecasts.

```sh
npm ci
npm run dev
```

Open `/plan` for mouse planning, `/table` for marker input, and `/markers/index.html`
for printing. Start table testing with **Load marker test** before connecting a camera.
Run `npm run test:vision`, `npm run typecheck`, `npm run lint`, and `npm run build`
for software checks. See the P4 handoff for physical acceptance and camera setup.

Built at Joe City Hack 6.0.
