# ARROYO

**A tabletop simulator for the Rose Bowl's last mile, LA28.**

In 2028, Olympic football semifinals and finals come to the Rose Bowl — about 90,000
spectators per match, to a stadium with no rail station. Metro's route is A Line →
Memorial Park Station → walk → shuttle. That last mile runs through the Arroyo Seco's
residential streets and past Old Pasadena's small businesses.

ARROYO is a planning sandbox for that corridor. The venue is fixed; the last mile is the
variable. Place shuttle hubs, park-and-rides, vendor villages and road closures — the
network regenerates, an agent simulation runs spectators, residents and businesses
through it, and you see what your plan does to each of them.

There is no optimal plan. There's only whose plan it is. ARROYO makes the tradeoff visible.

## Docs — read in order

| | | |
|---|---|---|
| [00-PRD.md](docs/00-PRD.md) | Product | What we're building, scope tiers, metric definitions, demo script |
| [01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | Everyone | Stack, data flow, file ownership, performance budget |
| [02-CONTRACTS.md](docs/02-CONTRACTS.md) | Everyone | **The frozen types. Copy into `lib/sim/types.ts` first.** |
| [03-WORKPLAN.md](docs/03-WORKPLAN.md) | Everyone | 4-person split, hour-by-hour timeline, cut list |
| [04-TABLE-MODE.md](docs/04-TABLE-MODE.md) | P4 | ArUco markers, calibration, 3D assets, fallbacks |
| [05-DECISIONS.md](docs/05-DECISIONS.md) | Reference | Why things are this way, and what's still unverified |

## Status

Planning only — no application code yet. Start at `03-WORKPLAN.md`.

Built at Joe City Hack 6.0.
