# P4 scenario handoff

Run `node scripts/generate-scenarios.mjs` to reproduce both committed fixtures.
They match the documented WorldState fields. Both are **synthetic planning examples**;
neither is an official event plan, surveyed map, or validated forecast.

- Rose Bowl example: 30 junctions, 49 individual connecting road edges, 40 businesses,
  12 residential blocks, 6 fictional personas, 2 anchors, 4 initial pieces.
- Downtown example: the same graph topology at a smaller scale, with a primary rail
  anchor beside the venue and a smaller population. It exercises scenario-dependent
  distances and camera calibration without inventing another real venue's data.
- Each road is one segment. Intersections share identical endpoint coordinates.
- `accessNodeIds` is intentionally empty: the contract gives P3 ownership of node IDs
  but defines no naming scheme. P3 must attach each block to adjacent/nearest road
  nodes in `buildNetwork`, or agree an ID convention and regenerate these lists.
  **Do not interpret an empty list as a blocked block.**
- Scenario descriptions label assumptions; neither fixture claims LA28 transport
  arrangements, exact capacity, official closures, or real business revenues.
- Marker IDs are common across scenarios. Printed pieces use capacities appropriate
  to each scenario's initial piece where one exists.

No root app scaffolding, shared store, shared transform or shared types are changed.
