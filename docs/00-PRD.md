# ARROYO — product one-pager

> Working name. Rename freely.
> **ARROYO** — a planning sandbox for the last mile around any major venue.

## The problem

Every big venue has the same unsolved problem, and it isn't the venue.

A stadium holds 60–90,000 people. They all arrive in about three hours and leave in about
one. Between the venue and wherever they came from — a rail station, a parking lot, a
freeway exit — there is a corridor of a mile or two. **That corridor is somebody's
neighbourhood,** and it's where the small businesses are.

Cities plan the venue. Cities plan the transit line. Almost nobody plans the last mile for
*everyone who uses it at once* — spectators, residents, and the businesses in between —
because the three groups want incompatible things and there's no shared surface on which to
see the tradeoff.

That's what this is: a sandbox where the venue is fixed and the last mile is the variable.

## What we build

```
            a venue (fixed)                 arrival anchors (fixed)
                 ▲                                    ▲
                 │        ◄── you place these ──►     │
          shuttle hubs · park-and-rides · vendor villages
          pedestrian corridors · bike valets · road closures
```

- The **venue** and the **arrival anchors** are fixed — those are the givens of a real site.
- The user places **movable pieces** between them.
- The system **regenerates the network automatically** — shuttle routes, pedestrian paths,
  and the traffic reroutes forced by each closure.
- An **agent simulation** runs three populations through that network.
- A **weighted Plan Score** makes the tradeoff explicit, with live weights — because there
  is no single right answer, and that's the point.

### It works for any venue

A scenario is **just a JSON file.** A venue position, some arrival anchors, a road network,
some businesses, some residential blocks. Nothing in the engine knows or cares which city
it's in.

This matters for two reasons. First, it's the honest description of what we built — a
general tool, not a model of one stadium. Second, **we are rearranging the whole corridor
anyway**, so geographic fidelity was never the goal. A scenario is an abstract network of
nodes, edges and parcels, not a digitised street map. Authoring a new one takes about
fifteen minutes.

We ship the **Rose Bowl (LA28)** as the default scenario, because it's local to the
hackathon and it's an unusually sharp example — a ~90,000-seat Olympic football venue with
**no rail station at all.** Metro's own game-day route is A Line → Memorial Park Station →
walk → shuttle, and that last mile runs straight through the Arroyo Seco's residential
streets and past Old Pasadena's small businesses. A great default. Not the premise.

The demo includes a **scenario switcher**, so the answer to "does this only work for the
Rose Bowl?" is to change a dropdown.

### The three populations

| Population | Typical count | What they want |
|---|---|---|
| **Spectators** | ~88,000 | Get in before the start, get out fast after |
| **Residents** | ~4,200 trips | Get home, get groceries, not have their street closed |
| **Businesses** | ~40 fixed | Foot traffic past the door, and not be undercut by official vendors |

### The tension that makes it interesting

Two deliberate mechanics put the populations in genuine conflict:

- **Egress vs. livability.** The fastest way to clear 90,000 people is to push them through
  residential streets. Optimising spectator egress *actively harms* residents, and the
  dashboard shows both numbers moving in opposite directions.
- **Local capture vs. official vendors.** Place a vendor village next to existing businesses
  and it cannibalises them — modelling the sponsor-exclusivity zones that are a real and
  contested feature of modern Games. `localCapturePct` is the metric that exposes it.

A plan that scores 90 on Games Efficiency can score 30 on Neighbourhood Livability. Showing
that, legibly, on one screen, is the deliverable.

## Scope tiers

**MUST — without these there is no demo**

- [ ] A scenario rendered from JSON, with venue and anchors locked
- [ ] Drag-and-drop placement of at least 4 piece kinds
- [ ] Automatic network regeneration on every move
- [ ] Agent sim producing at least these 5 metrics: egress p90, resident delay, local
      revenue, local capture %, crowd peak
- [ ] Plan Score with three adjustable weights
- [ ] Baseline vs. current comparison, side by side

**SHOULD — these are what make it memorable**

- [ ] **Scenario switcher** — two or three scenarios, proving the engine is venue-agnostic
- [ ] Pedestrian + congestion heatmap overlays
- [ ] Minute-by-minute timeline chart of the egress wave
- [ ] LLM resident/owner personas reacting to *this specific plan's numbers*
- [ ] Preset plans per scenario ("the official plan", "car-first", "neighbourhood-first")

**COULD — the showstopper, if the core lands early**

- [ ] ArUco marker table mode: printed markers on a physical table drive the plan live
- [ ] 3D models rendered on the markers through the camera feed

## Metric definitions

These are the contract for whoever builds the simulation. Implement exactly these.

| Metric | Definition |
|---|---|
| `egressMedianMin` / `egressP90Min` | Per spectator agent: minutes from the end of the event until they reach **any arrival anchor** or the map edge. Median and 90th percentile. |
| `transitModeSharePct` | Share of spectators whose exit path used a transit or shuttle edge. |
| `residentDelayMin` | Per resident trip: route time with pieces and closures in place, minus route time on the base network with nothing placed. Mean across trips. |
| `residentsBlockedPct` | Share of residential blocks where every access node sits on a closed edge, or the shortest exit exceeds 2× baseline. |
| `localRevenueUsd` | Per existing business: `baseline + passersby × conversionRate × avgTicket`. `passersby` = integral of the pedestrian flow heatmap within `catchmentM` (default 80 m). Defaults: conversion 0.08, avgTicket $14 food / $22 retail / $18 service. |
| `vendorRevenueUsd` | Same formula over vendor-village stalls. |
| `localCapturePct` | `localRevenue / (localRevenue + vendorRevenue)`. **Exclusivity rule: any existing business within `exclusionRadiusM` (150 m) of a vendor village has its `conversionRate` halved.** |
| `businessesNetPositive` | Count of existing businesses whose revenue exceeds baseline. |
| `crowdPeakPerM2` | Maximum pedestrian density in any heatmap cell at any tick. |

### Plan Score

Normalise each metric to 0–100 against these anchors, linearly, clamped:

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
economy    = mean(localCapture, businessesNetPositive_normalised)

total = (w.games × games + w.livability × livability + w.economy × economy)
        / (w.games + w.livability + w.economy)
```

Default weights `{ games: 1, livability: 1, economy: 1 }`. The sliders change them live and
the score recomputes **without re-running the simulation**, because `scorePlan()` is
separate from `simulate()`. That's what makes the sliders feel instant.

## Demo script — 3 minutes

| Time | Beat |
|---|---|
| **0:00** | "Every stadium has the same problem. 90,000 people arrive in three hours and leave in one — through a corridor that's somebody's neighbourhood. Cities plan the stadium. Nobody plans the mile around it." |
| **0:20** | The default scenario. Venue locked, the arrival anchor locked a mile and a half away. Point at the gap: "there is no train to this stadium." |
| **0:35** | Run the baseline — the official plan. Numbers land: egress p90, resident delay, local revenue, Plan Score. |
| **1:05** | Drag the shuttle hub and the vendor village. Network regenerates live. Re-run. Score jumps — **but call out that resident delay got worse.** Name the tradeoff out loud. |
| **1:35** | Pull the weight sliders toward livability. A *different* plan now wins. "There is no optimal plan. There's only whose plan it is. That's why this has to be a tool, not an answer." |
| **1:55** | **Switch the scenario from the dropdown.** Different venue, different city, same engine. "A scenario is a JSON file. Any venue, any event, fifteen minutes." |
| **2:10** | Persona cards. Read one resident quote aloud, verbatim. |
| **2:25** | Walk to the table. Move the physical markers. The screen follows. 3D venue standing on the paper. |
| **2:50** | "A planning department could put this on a table at a community meeting tonight." |

Rehearse this out loud **three times** before submitting. The 1:35 beat is the one that
wins — do not let it get cut for a feature.

## Source notes — the default scenario

The engine is venue-agnostic, but the shipped default is based on a real site, so get the
claims right if you mention them. Verified from search, 2026-11-14:

- The Rose Bowl is an LA28 venue hosting football; Pasadena confirmed men's and women's
  semifinals and finals; third Games after 1932 and 1984. The Rose Bowl Aquatics Center
  hosts diving. Both in LA28's Pasadena Zone.
- Transit: Metro A Line to Memorial Park Station, short walk to Parsons Lot B, free bus
  shuttle every 5–7 minutes, running until two hours after the event.

**Unverified — see `05-DECISIONS.md`.** Don't state these as fact: exact match counts,
stadium capacity (say "about 90,000"), residential parking barricades, and Pasadena's
annual cap on large events.

Our population, trip and revenue figures are **modelling assumptions, not measurements.**
If a judge asks, say so — "these are tunable assumptions; the mechanism is the
contribution" is a strong answer. Claiming they're real data is weak and checkable.
