# ARROYO — product one-pager

> Working name. Rename freely.
> **ARROYO** — a tabletop simulator for the Rose Bowl's last mile, LA28.

## The problem

In summer 2028, Olympic football semifinals and finals will be played at the Rose Bowl in
Pasadena — the venue's third Games, after 1932 and 1984. Up to ~90,000 spectators per match.

The Rose Bowl has **no rail station**. Metro's own game-day guidance is:

```
A Line  ──►  Memorial Park Station  ──►  walk to Parsons Lot B  ──►  free shuttle (every 5–7 min)  ──►  stadium
```

That last mile runs through two things nobody plans for together:

1. **The Arroyo Seco residential neighborhoods**, whose streets become the overflow for
   90,000 people arriving and leaving in a few hours.
2. **Old Pasadena's small businesses**, clustered near the station — the people who could
   gain the most from the Games, or get squeezed out of them by official vendor zones.

Cities plan the venue. Cities plan the transit. **Nobody gives residents, business owners,
and planners a shared surface to argue about the last mile.** That's the gap.

## What we build

A planning sandbox where the venue is fixed and the last mile is the variable.

- The Rose Bowl and Memorial Park Station are **locked** in place — they're real.
- The user places **movable pieces**: shuttle hubs, park-and-ride lots, vendor villages,
  pedestrian corridors, bike valets, road closures, security gates.
- The system **regenerates the network automatically** — shuttle routes, pedestrian paths,
  and the traffic reroutes forced by each road closure.
- An **agent simulation** runs three populations through that network and reports what
  happens to each of them.
- A **weighted Plan Score** makes the tradeoff explicit — and the weights are adjustable,
  because there is no single right answer. That's the whole point.

### The three populations

| Population | Count | What they want |
|---|---|---|
| **Spectators** | ~88,000 | Get in before kickoff, get out fast after |
| **Residents** | ~4,200 trips | Get home, get groceries, not have their street closed |
| **Businesses** | ~40 fixed | Foot traffic past the door, and not be undercut by official vendors |

### The tension that makes it interesting

Two deliberate mechanics put the populations in genuine conflict:

- **Egress vs. livability.** The fastest way to clear 90,000 people is to push them through
  residential streets. Optimizing spectator egress *actively harms* residents, and the
  dashboard shows both numbers moving in opposite directions.
- **Local capture vs. official vendors.** Place a vendor village next to existing
  businesses and it cannibalizes them — modeling the sponsor-exclusivity zones that are a
  real and contested feature of modern Games. `localCapturePct` is the metric that exposes it.

A plan that scores 90 on Games Efficiency can score 30 on Neighborhood Livability. Showing
that, legibly, in one screen, is the deliverable.

## Scope tiers

**MUST — without these there is no demo**

- [ ] Fixed map of the Arroyo → Old Pasadena corridor, with Rose Bowl + Memorial Park locked
- [ ] Drag-and-drop placement of at least 4 piece kinds
- [ ] Automatic network regeneration on every move
- [ ] Agent sim producing at least these 5 metrics: egress p90, resident delay, local
      revenue, local capture %, crowd peak
- [ ] Plan Score with three adjustable weights
- [ ] Baseline vs. current comparison, side by side

**SHOULD — these are what make it memorable**

- [ ] Pedestrian + congestion heatmap overlays
- [ ] Minute-by-minute timeline chart of the egress wave
- [ ] LLM resident/owner personas reacting to *this specific plan's numbers*
- [ ] 2–3 preset scenarios ("Metro's plan", "car-first", "neighborhood-first")

**COULD — the showstopper, if the core lands early**

- [ ] ArUco marker table mode: printed markers on a physical table drive the plan live
- [ ] 3D models rendered on the markers through the camera feed

## Metric definitions

These are the contract for whoever builds the simulation. Implement exactly these.

| Metric | Definition |
|---|---|
| `egressMedianMin` / `egressP90Min` | Per spectator agent: minutes from final whistle until they reach the rail station, a park-and-ride, or the map edge. Median and 90th percentile. |
| `transitModeSharePct` | Share of spectators whose exit path used rail or shuttle. |
| `residentDelayMin` | Per resident trip: route time with pieces and closures in place, minus route time on the base street network with nothing placed. Mean across trips. |
| `residentsBlockedPct` | Share of residential blocks where every access node sits on a closed edge, or the shortest exit exceeds 2× baseline. |
| `localRevenueUsd` | Per existing business: `baseline + passersby × conversionRate × avgTicket`. `passersby` = integral of the pedestrian flow heatmap within `catchmentM` (default 80 m). Defaults: conversion 0.08, avgTicket $14 food / $22 retail / $18 service. |
| `vendorRevenueUsd` | Same formula over vendor-village stalls. |
| `localCapturePct` | `localRevenue / (localRevenue + vendorRevenue)`. **Exclusivity rule: any existing business within 150 m of a vendor village has its `conversionRate` halved.** |
| `businessesNetPositive` | Count of existing businesses whose revenue exceeds baseline. |
| `crowdPeakPerM2` | Maximum pedestrian density in any heatmap cell at any tick. |

### Plan Score

Normalize each metric to 0–100 against these anchors, linearly, clamped:

| Metric | 100 means | 0 means |
|---|---|---|
| `egressP90Min` | 30 min | 120 min |
| `transitModeSharePct` | 70% | 10% |
| `residentDelayMin` | 0 min | 45 min |
| `residentsBlockedPct` | 0% | 25% |
| `localCapturePct` | 100% | 0% |
| `crowdPeakPerM2` | 1.0 | 4.0 |

Then:

```
games      = mean(egressP90, transitModeShare, crowdPeak)
livability = mean(residentDelay, residentsBlocked, crowdPeak)
economy    = mean(localCapture, businessesNetPositive_normalized)

total = (w.games × games + w.livability × livability + w.economy × economy)
        / (w.games + w.livability + w.economy)
```

Default weights: `{ games: 1, livability: 1, economy: 1 }`. The sliders change them live;
the score recomputes without re-running the simulation, because `scorePlan()` is separate
from `simulate()`.

## Demo script — 3 minutes

| Time | Beat |
|---|---|
| **0:00** | "In 2028, 90,000 people will walk through this neighborhood to watch Olympic soccer. 4,000 people *live* here. Nobody has a tool to plan for both." |
| **0:20** | The map. Rose Bowl locked in the Arroyo. Memorial Park Station locked, 1.8 miles away. Point at the gap: "there is no train to this stadium." |
| **0:35** | Run the baseline — Metro's current plan. Numbers land: egress p90, resident delay, local revenue, Plan Score. |
| **1:05** | Drag the shuttle hub and the vendor village. Roads regenerate live. Re-run. Score jumps — **but call out that resident delay got worse.** Name the tradeoff out loud. |
| **1:35** | Pull the weight sliders toward livability. A *different* plan now wins. "There is no optimal plan. There's only whose plan it is. That's why this has to be a tool, not an answer." |
| **2:00** | Persona cards. Read one resident quote aloud, verbatim. |
| **2:20** | Walk to the table. Move the physical markers. The screen follows. 3D Rose Bowl standing on the paper. |
| **2:50** | "A planning department could put this on a table at a community meeting tonight." |

Rehearse this out loud **three times** before submitting. The 1:35 beat is the one that
wins — do not let it get cut for a feature.

## Source notes

Verified from search, 2026-11-14:

- Rose Bowl Stadium is an LA28 venue hosting football; Pasadena confirmed men's and women's
  semifinals and finals; third Games after 1932 and 1984. Rose Bowl Aquatics Center hosts
  diving. Both in LA28's Pasadena Zone.
- Transit: Metro A Line to Memorial Park Station, short walk to Parsons Lot B, free bus
  shuttle every 5–7 minutes, running until two hours after the event.

**Treat as unverified — do not state as fact in the pitch:**

- Exact match counts at the Rose Bowl (sources conflict: one lists 12 group matches plus
  quarterfinals, another lists 3).
- Stadium capacity (sources range 89,700–92,500 — say "about 90,000").
- The claim that residential street parking is barricaded to non-residents on event days
  came from a commercial parking site. Plausible, but check with the City of Pasadena
  before anyone says it on stage.
- Pasadena's annual cap on large Rose Bowl events. Widely believed to exist; nobody has
  verified the number. **Leave it out unless someone confirms it.**

Our population and revenue figures are modeling assumptions, not measurements. Say so if a
judge asks — "these are tunable assumptions, the mechanism is the contribution" is a
strong answer. Claiming they're real data is a weak one, and checkable.
