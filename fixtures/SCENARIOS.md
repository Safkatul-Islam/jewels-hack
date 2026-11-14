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
- `accessNodeIds` lists each block's four corner junctions, named with P3's `snapKey`
  convention from `lib/sim/network.ts` (`n_{x}_{y}`, 0.5 m snap). The generator
  duplicates that naming, and `npm run test:vision` fails if any ID is not a node that
  `buildNetwork` creates. If P3 changes the scheme, update the generator and regenerate.
  The engine skips a block with an empty list; **empty never means blocked.**
- Scenario descriptions label assumptions; neither fixture claims LA28 transport
  arrangements, exact capacity, official closures, or real business revenues.
- Marker IDs are common across scenarios. Printed pieces use capacities appropriate
  to each scenario's initial piece where one exists.

No root app scaffolding, shared store, shared transform or shared types are changed.
