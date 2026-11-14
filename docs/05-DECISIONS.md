# Decision log and open questions

Why things are the way they are, so nobody re-opens a settled question at hour four — and
what's still genuinely unresolved.

## Decisions

### Venue-agnostic engine, with a default scenario

The tool models **the last mile around any major venue.** A scenario — venue, arrival
anchors, road network, businesses, residential blocks, personas — is a JSON file, and
nothing in the engine knows which city it's in.

Why this framing rather than a study of one stadium:

- **It's the honest description of what we built.** The engine never needed a specific place.
- **We rearrange the whole corridor anyway**, so geographic fidelity was never the point.
  A scenario is an abstract network of nodes and parcels, not a digitised street map. That
  removes hours of tracing work and loses nothing the simulation uses.
- **"Does this only work for X?" is the obvious judge question.** A scenario switcher answers
  it in four seconds.
- Authoring a new scenario takes about fifteen minutes, so a second one is nearly free and
  doubles as the cheapest possible test that no assumptions got hard-coded.

The enforcement rule: **no place names, distances or coordinates in `lib/sim/`.** If a
literal appears there, it's a bug. Grep for it before the demo.

### The default scenario: a venue with no rail station

Shipped default is the **Rose Bowl, Pasadena (LA28 Olympic football)** — chosen because it's
local to the hackathon and it's an unusually sharp example of the general problem: a
~90,000-seat venue with **no rail station at all.** Metro's own game-day route is A Line →
Memorial Park Station → walk to Parsons Lot B → free shuttle every 5–7 minutes. That gap
*is* the design problem, and it runs through residential streets in the Arroyo Seco and past
Old Pasadena's small businesses.

It's the default, not the premise. Other candidates considered as scenarios rather than as
the product: Dodger Stadium (ringed by its own parking, so less neighbourhood to plan for),
the LA Coliseum (already rail-served), Long Beach (already walkable). Each makes a decent
*second* scenario precisely because they stress different assumptions.

### Reframe: "design the last mile", not "move buildings around"

The original idea was dragging buildings around a central venue. Same mechanics, but
constraining the palette to things a city actually decides — shuttle hubs, park-and-rides,
vendor zones, closures — gives the simulation a defensible premise and a real stakeholder
conflict. "Arbitrary buildings" is hard to justify to a judge; "where does the shuttle hub
go" is not.

### Next.js, with the simulation on the client

Framework was the team's call. The constraint that comes with it: **the sim is a plain TS
module, not an API route.** Dragging a piece must not make an HTTP request, or the "drag it,
watch the numbers move" beat — the whole demo — feels laggy. Server routes exist only for
the LLM proxy, where hiding the API key is a real reason.

### Team split: by folder, not by feature

The team proposed experience / dashboard / backend / 3D. Kept, with three adjustments:

1. **P2 takes the LLM persona endpoint**, because it's adjacent to the panel they're already
   building, and it takes load off the critical path.
2. **P4 authors the default scenario in hour one** before touching 3D.
   `fixtures/scenario-rosebowl.json` gates both P1 and P3 — it's the first real deliverable
   of the project. Generating it from a small script makes the second scenario nearly free.
3. **Nobody models 3D assets.** CC0 or primitives. See `04-TABLE-MODE.md`.

The reason: as originally drawn, one person owned road generation *and* the agent sim *and*
the metrics — roughly 60% of the intellectual content, and the part judges actually score.
That's the bottleneck, so the other three protect it.

### No map library

No Leaflet, no Mapbox, no tiles, no projection maths. A scenario may carry a backdrop image
with a declared bounding box in metres, or ask for a generated abstract grid — **both must
render well.** Saves roughly 90 minutes, removes a network dependency from the demo, and
keeps the tool honest about being a planning abstraction rather than a map.

### Sampled agents, not enumerated

Simulate 2,000 agents and scale to 88,000. Indistinguishable results, ~40× faster. Standard
practice in agent-based modelling, so say "sampled agent-based model" plainly if asked —
it's not a shortcut to be sheepish about.

### LLM after the sim, never during

Personas run on `claude-haiku-5-5`, streamed, triggered *after* metrics are on screen. The
numbers appear in under a second; quotes stream in over the next 2–3. The LLM never computes
a metric — it only narrates ones the simulation produced. Persona identities live in the
scenario file, so they change when the scenario does. A persona that invents its own numbers
will get caught by a judge; one that reacts to real deltas feels uncanny.

### ArUco behind a hard gate

Genuinely achievable, but webcam and lighting failures at a hackathon are brutal. So: a
pre-decided kill time (T+3:30), a layered fallback list, and a recorded video at T+4:00. The
gate exists so that cutting it costs an announcement rather than an argument. One printed
marker set works for all scenarios, because calibration reads true distances from the loaded
scenario.

### Confirm button over continuous re-simulation

Markers move → plan updates live → user presses Confirm → sim runs. Continuous
re-simulation reads as instability after about ten seconds. This also matches the
interaction in the original idea.

## Open questions

Nobody has resolved these. They only matter if someone mentions them on stage — the engine
doesn't depend on any of them.

| Question | Why it matters | Status |
|---|---|---|
| **Does Pasadena cap large Rose Bowl events per year?** | Would strengthen the default scenario's framing — evidence the neighbourhood conflict is real and already litigated. | **Unverified. Leave out of the pitch until confirmed with a City of Pasadena source.** |
| Is residential street parking barricaded to non-residents on event days? | Would justify the road-closure piece directly. | Claim came from a commercial parking site. Plausible, uncited. |
| How many matches at the Rose Bowl? | Affects the spectator figure's credibility. | Sources conflict — one lists 12 group matches plus quarterfinals, another lists 3. Say "semifinals and finals", which Pasadena confirmed. |
| Stadium capacity | Appears on screen. | Sources range 89,700–92,500. **Say "about 90,000."** |
| What's the second scenario? | It's the proof of generality. | Open. Pick one that stresses different assumptions — rail at the door, or car-only access. |
| Project name | It's on the slide. | "ARROYO" is a placeholder, and now a slightly place-specific one for a venue-agnostic tool. Rename freely. |

Our population, trip and revenue figures are **modelling assumptions, not measurements.** If
a judge asks, say so — "these are tunable assumptions; the mechanism is the contribution" is
a strong answer. Claiming they're real data is weak and checkable.

## Status

Planning only. No application code has been written. The docs are committed and pushed to
`origin/main`.
