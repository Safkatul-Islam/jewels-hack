// Checks the one thing lib/advisor.ts rests on: that its windowed footfallAt()
// returns the same number as lib/sim/business.ts's full-grid integrateHeatmap(),
// and that the sweep is fast enough to sit inside a spoken turn.
//
// Run: npx tsx scripts/test-advisor.ts [scenario.json]

import { readFileSync } from 'node:fs';
import { buildNetwork } from '../lib/sim/network.js';
import { simulate } from '../lib/sim/simulate.js';
import { integrateHeatmap } from '../lib/sim/business.js';
import { footfallAt, findBetterSpot, resolveTarget, describeRelocation } from '../lib/advisor.js';
import type { WorldState } from '../lib/sim/types.js';

const scenarioPath = process.argv[2] ?? 'fixtures/scenario-rosebowl.json';
const world: WorldState = JSON.parse(readFileSync(scenarioPath, 'utf-8'));
const result = simulate(world, buildNetwork(world));
const heatmap = result.heatmaps.pedestrian;

let allPass = true;
function check(label: string, pass: boolean) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}`);
  if (!pass) allPass = false;
}

// ---- equivalence with P3's function ----
let worstRelErr = 0;
let compared = 0;
for (const b of world.businesses) {
  const mine = footfallAt(heatmap, b.pos, b.catchmentM);
  const theirs = integrateHeatmap(heatmap, b.pos, b.catchmentM);
  compared++;
  const denom = Math.max(Math.abs(theirs), 1e-9);
  worstRelErr = Math.max(worstRelErr, Math.abs(mine - theirs) / denom);
}
console.log(`compared ${compared} businesses, worst relative error ${worstRelErr.toExponential(2)}`);
check('footfallAt agrees with integrateHeatmap on every business', worstRelErr < 1e-6);

// Also off the businesses, including points outside the grid entirely.
const probes = [
  world.venue.pos,
  world.anchors[0]!.pos,
  { x: world.bbox.minX - 500, y: world.bbox.minY - 500 },
  { x: world.bbox.maxX + 500, y: world.bbox.maxY + 500 },
  { x: (world.bbox.minX + world.bbox.maxX) / 2, y: (world.bbox.minY + world.bbox.maxY) / 2 },
];
let probeWorst = 0;
for (const p of probes) {
  for (const r of [25, 80, 300]) {
    const mine = footfallAt(heatmap, p, r);
    const theirs = integrateHeatmap(heatmap, p, r);
    probeWorst = Math.max(probeWorst, Math.abs(mine - theirs) / Math.max(Math.abs(theirs), 1e-9));
  }
}
check('…and at the venue, the anchor, the centre and outside the bbox', probeWorst < 1e-6);

// ---- the sweep ----
const target = resolveTarget(world, world.businesses[0]!.id);
check('resolveTarget finds a business by id', target !== null);

if (target) {
  const t0 = Date.now();
  const relocation = findBetterSpot(world, result, target);
  const sweepMs = Date.now() - t0;

  check('findBetterSpot returns a move for a business', relocation !== null);
  if (relocation) {
    console.log(`  swept ${relocation.candidatesTried} positions in ${sweepMs}ms (${relocation.method})`);
    console.log('  ' + describeRelocation(relocation, world));
    check('the new spot has strictly more foot traffic', relocation.footfallAfter > relocation.footfallBefore);
    check('revenue was computed for a business', relocation.revenueAfter !== undefined);
    check('the sweep fits inside a spoken turn (under 400ms)', sweepMs < 400);

    // The move must survive a real run: re-simulate with the business moved and
    // confirm the engine agrees the takings went up.
    const moved: WorldState = {
      ...world,
      businesses: world.businesses.map((b) => (b.id === target.id ? { ...b, pos: relocation.to } : b)),
    };
    const after = simulate(moved, buildNetwork(moved));
    const beforeRow = result.perBusiness.find((b) => b.id === target.id)!;
    const afterRow = after.perBusiness.find((b) => b.id === target.id)!;
    console.log(`  engine says: ${beforeRow.revenueUsd.toFixed(0)} -> ${afterRow.revenueUsd.toFixed(0)}`);
    check('a real re-simulation confirms the gain', afterRow.revenueUsd > beforeRow.revenueUsd);

    const predicted = relocation.revenueAfter!;
    const relErr = Math.abs(afterRow.revenueUsd - predicted) / Math.max(predicted, 1);
    console.log(`  predicted ${predicted.toFixed(0)}, actual ${afterRow.revenueUsd.toFixed(0)}, error ${(relErr * 100).toFixed(3)}%`);
    check('the predicted figure matches what the engine then reports', relErr < 0.01);
  }
}

// ---- the phrasings a person actually uses out loud ----
// Speech recognition writes number words, and names hold digits, so these are
// the cases the voice path lives or dies on.
const shouldResolve: [string, string][] = [
  ['business-1', 'business-1'],
  ['Example food business 1', 'business-1'],
  ['example food business one', 'business-1'],
  ['business 1', 'business-1'],
  ['business one', 'business-1'],
  ['business 19', 'business-19'],
  ['business nineteen', 'business-19'],
  ['business twenty one', 'business-21'],
  ['food business 4', 'business-4'],
  ['vendor village', 'initial-vendors'],
  ['Vendor village', 'initial-vendors'],
  ['shuttle hub', 'initial-hub'],
  ['pedestrian corridor', 'initial-corridor'],
  ['ped corridor', 'initial-corridor'],
  ['park and ride', 'initial-parking'],
];
for (const [phrase, expectedId] of shouldResolve) {
  const got = resolveTarget(world, phrase);
  check(`"${phrase}" resolves to ${expectedId}${got && got.id !== expectedId ? ` (got ${got.id})` : got ? '' : ' (got nothing)'}`, got?.id === expectedId);
}

// ---- ambiguity and nonsense must still resolve to nothing ----
for (const phrase of ['business', 'zzzzz', 'the taco place', '']) {
  check(`"${phrase}" resolves to nothing`, resolveTarget(world, phrase) === null);
}

console.log(allPass ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(allPass ? 0 : 1);
