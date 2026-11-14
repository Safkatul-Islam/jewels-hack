# Decision log and open questions

Why things are the way they are, so nobody re-opens a settled question at hour four — and
what's still genuinely unresolved.

## Decisions

### Venue: the Rose Bowl, Pasadena

Closest LA28 venue to Glendale Community College, roughly 6 miles. But it won on the story,
not the distance: **the Rose Bowl has no rail station.** Metro's own game-day guidance is
A Line → Memorial Park Station → walk to Parsons Lot B → free shuttle every 5–7 minutes.
That gap *is* the design problem, and it runs through residential streets in the Arroyo
Seco and past Old Pasadena's small businesses.

Considered and rejected:

- **Dodger Stadium** (~8 mi) — also close, and the Chavez Ravine displacement history is
  powerful, but the stadium is ringed by its own parking moat. There's less of a
  neighbourhood immediately adjacent to plan *for*, which weakens the core mechanic.
- **LA Coliseum / Expo Park** — institutional surroundings, served by rail already, fewer
  small-business stakes.
- **Long Beach** — already walkable, so the problem is partly solved.
- **A fictional venue** — zero research overhead, but loses every specific detail that makes
  the pitch land.

### Reframe: "design the last mile", not "move buildings around a venue"

The original idea was dragging buildings around a central venue. Same mechanics, but
anchoring it to the real missing rail connection gives it a defensible premise, a specific
geography, and a genuine stakeholder conflict. It also narrows the piece palette to things
a city actually decides — shuttle hubs, park-and-rides, vendor zones, closures — rather
than arbitrary buildings, which makes the simulation easier to justify to a judge.

### Next.js, with the simulation on the client

Framework was the team's call. The constraint that comes with it: **the sim is a plain TS
module, not an API route.** Dragging a piece must not make an HTTP request, or the
"drag it, watch the numbers move" beat — the whole demo — feels laggy. Server routes exist
only for the LLM proxy, where hiding the API key is a real reason.

### Team split: by folder, not by feature

The team proposed experience / dashboard / backend / 3D. Kept, with three adjustments:

1. **P2 takes the LLM persona endpoint**, because it's adjacent to the panel they're already
   building, and it takes load off the critical path.
2. **P4 builds the map fixture in hour one** before touching 3D. `fixtures/rosebowl.json`
   gates both P1 and P3 — it's the first real deliverable of the project.
3. **Nobody models 3D assets.** CC0 or primitives. See `04-TABLE-MODE.md`.

The reason for the adjustments: as originally drawn, one person owned road generation *and*
the agent sim *and* the metrics — roughly 60% of the intellectual content of the project,
and the part judges actually score. That's the bottleneck, so the other three protect it.

### No map library

No Leaflet, no Mapbox, no tiles, no projection maths. One static satellite PNG with a
declared world bounding box in metres. Saves roughly 90 minutes, removes a network
dependency from the demo, and we control the framing — which looks *more* deliberate on
stage, not less.

### Sampled agents, not enumerated

Simulate 2,000 agents and scale to 88,000. Indistinguishable results, ~40× faster. This is
the standard approach in agent-based modelling, so say "sampled agent-based model" plainly
if asked — it's not a shortcut to be sheepish about.

### LLM after the sim, never during

Personas run on `claude-haiku-5-5`, streamed, triggered *after* metrics are on screen. The
numbers appear in under a second; quotes stream in over the next 2–3. The LLM never
computes a metric — it only narrates ones the simulation produced. A persona that invents
its own numbers will get caught by a judge; one that reacts to real deltas feels uncanny.

### ArUco behind a hard gate

Genuinely achievable, but webcam and lighting failures at a hackathon are brutal. So: a
pre-decided kill time (T+3:30), a layered fallback list, and a recorded video at T+4:00.
The gate exists so that cutting it costs an announcement rather than an argument.

### Confirm button over continuous re-simulation

Markers move → plan updates live → user presses Confirm → sim runs. Continuous
re-simulation reads as instability after about ten seconds. This also matches the
interaction in the original idea.

## Open questions

Nobody has resolved these. Worth ten minutes from whoever has the lightest first hour.

| Question | Why it matters | Status |
|---|---|---|
| **Does Pasadena cap large Rose Bowl events per year?** | Widely believed, and it would strengthen the pitch a lot — it's evidence the neighbourhood conflict is real and already litigated. | **Unverified. Leave out of the pitch until confirmed with a City of Pasadena source.** |
| Is residential street parking barricaded to non-residents on event days? | Would justify the road-closure piece directly. | Claim came from a commercial parking site. Plausible, uncited. |
| How many matches at the Rose Bowl? | Affects the spectator figure's credibility. | Sources conflict — one lists 12 group matches plus quarterfinals, another lists 3. Say "semifinals and finals", which is confirmed by Pasadena. |
| Stadium capacity | Appears on screen. | Sources range 89,700–92,500. **Say "about 90,000."** |
| Project name | It's on the slide. | "ARROYO" is a placeholder. Rename freely. |

Our population, trip and revenue figures are **modelling assumptions, not measurements.**
If a judge asks, say so — "these are tunable assumptions; the mechanism is the
contribution" is a strong answer. Claiming they're real data is weak and checkable.

## Status

Planning only. **No application code has been written, and nothing has been committed or
pushed** — the docs are untracked working-tree files, left for the team to review and
commit themselves.
