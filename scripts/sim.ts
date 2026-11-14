// The headless harness — docs/01-ARCHITECTURE.md:
//   npx tsx scripts/sim.ts fixtures/scenario-demo.json
//
// Loads a scenario, runs buildNetwork then simulate, prints the metrics as a table.
// The engine can be built, tuned and demonstrated before a single component renders.

import { readFileSync } from 'node:fs';
import { buildNetwork } from '../lib/sim/network.js';
import { simulate, scorePlan } from '../lib/sim/simulate.js';
import type { WorldState } from '../lib/sim/types.js';

const scenarioPath = process.argv[2];
if (!scenarioPath) {
  console.error('Usage: npx tsx scripts/sim.ts <scenario.json>');
  process.exit(1);
}

const world: WorldState = JSON.parse(readFileSync(scenarioPath, 'utf-8'));
const net = buildNetwork(world);
const result = simulate(world, net);

console.log(`Scenario: ${world.scenario.name} (${world.scenario.event})`);
console.log(`Pieces placed: ${world.pieces.length}`);
console.log();

console.log('Metrics');
console.log('-------');
for (const [key, value] of Object.entries(result.metrics)) {
  const formatted = typeof value === 'number' ? value.toFixed(2) : String(value);
  console.log(`  ${key.padEnd(28)} ${formatted}`);
}
console.log();

console.log('Plan Score (default weights 1/1/1)');
console.log('-----------------------------------');
console.log(`  total       ${result.score.total.toFixed(1)}`);
console.log(`  games       ${result.score.games.toFixed(1)}`);
console.log(`  livability  ${result.score.livability.toFixed(1)}`);
console.log(`  economy     ${result.score.economy.toFixed(1)}`);
console.log();

console.log('Per anchor');
console.log('----------');
for (const a of result.perAnchor) {
  console.log(`  ${a.id.padEnd(16)} departures=${a.departures.toFixed(0).padStart(7)}  peakLoad=${a.peakLoadPct.toFixed(1)}%`);
}
console.log();

if (result.warnings.length > 0) {
  console.log('Warnings');
  console.log('--------');
  for (const w of result.warnings) console.log(`  - ${w}`);
  console.log();
}

console.log(`runtimeMs: ${result.runtimeMs}  (budget: 200ms)`);

// Sanity sweep: re-score with livability-weighted preference, to show scorePlan()
// recomputes without re-running simulate() — same metrics, different weights.
const livabilityFirst = scorePlan(result.metrics, { games: 1, livability: 3, economy: 1 });
console.log(`scorePlan() with livability-weighted sliders: total=${livabilityFirst.total.toFixed(1)}`);
