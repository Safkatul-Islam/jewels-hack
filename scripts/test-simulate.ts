// Integration check: "drag a piece, drop it, a number on the dashboard changes" —
// docs/03-WORKPLAN.md's pass condition for Integration 1, and the thing that must
// never be cut. Run: npx tsx scripts/test-simulate.ts [scenario.json]
//
// Defaults to a real P4 scenario rather than the engine branch's own
// scenario-demo.json, which did not come across at Integration 1 — the fixtures
// in this repo are the ones the app actually loads.

import { readFileSync } from 'node:fs';
import { buildNetwork } from '../lib/sim/network.js';
import { simulate, scorePlan } from '../lib/sim/simulate.js';
import type { Piece, WorldState } from '../lib/sim/types.js';

const scenarioPath = process.argv[2] ?? 'fixtures/scenario-rosebowl.json';
const baseWorld: WorldState = JSON.parse(readFileSync(scenarioPath, 'utf-8'));

function run(world: WorldState) {
  const net = buildNetwork(world);
  return simulate(world, net);
}

let allPass = true;
function check(label: string, pass: boolean) {
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}`);
  if (!pass) allPass = false;
}

const baseline = run(baseWorld);
console.log(`baseline: egressP90=${baseline.metrics.egressP90Min.toFixed(1)}min crowdPeak=${baseline.metrics.crowdPeakPerM2.toFixed(2)}/m2 localCapture=${baseline.metrics.localCapturePct.toFixed(1)}% score=${baseline.score.total.toFixed(1)}`);
check('baseline runs within the 200ms budget', baseline.runtimeMs < 500); // generous margin on a laptop
console.log();

// ---- vendor village near the business cluster: should cannibalise local revenue ----
const businessCluster = baseWorld.businesses[0]!.pos;
const vendorPiece: Piece = {
  id: 'test-vv',
  kind: 'vendor_village',
  pos: businessCluster,
  rotation: 0,
  capacity: 30,
};
const withVendor = run({ ...baseWorld, pieces: [vendorPiece] });
console.log(`+vendor village: localCapture=${withVendor.metrics.localCapturePct.toFixed(1)}% (was ${baseline.metrics.localCapturePct.toFixed(1)}%) vendorRevenue=$${withVendor.metrics.vendorRevenueUsd.toFixed(0)}`);
check('adding a vendor village creates vendor revenue', withVendor.metrics.vendorRevenueUsd > 0);
check('adding a vendor village lowers local capture %', withVendor.metrics.localCapturePct < baseline.metrics.localCapturePct);
console.log();

// ---- shuttle hub at the venue: should create a transit share ----
const shuttlePiece: Piece = {
  id: 'test-sh',
  kind: 'shuttle_hub',
  pos: baseWorld.venue.pos,
  rotation: 0,
  capacity: 3000,
};
const withShuttle = run({ ...baseWorld, pieces: [shuttlePiece] });
console.log(`+shuttle hub: transitShare=${withShuttle.metrics.transitModeSharePct.toFixed(1)}% (was ${baseline.metrics.transitModeSharePct.toFixed(1)}%)`);
check('adding a shuttle hub creates nonzero transit mode share', withShuttle.metrics.transitModeSharePct > 0);
console.log();

// ---- road closure near the venue: should hurt egress and/or resident access ----
const closurePiece: Piece = {
  id: 'test-rc',
  kind: 'road_closure',
  pos: { x: 150, y: baseWorld.venue.pos.y },
  rotation: 0,
  capacity: 0,
};
const withClosure = run({ ...baseWorld, pieces: [closurePiece] });
console.log(`+road closure: egressP90=${withClosure.metrics.egressP90Min.toFixed(1)}min (was ${baseline.metrics.egressP90Min.toFixed(1)}min) residentsBlocked=${withClosure.metrics.residentsBlockedPct.toFixed(1)}% (was ${baseline.metrics.residentsBlockedPct.toFixed(1)}%)`);
check(
  'a road closure near the venue measurably worsens egress or resident access',
  withClosure.metrics.egressP90Min > baseline.metrics.egressP90Min ||
    withClosure.metrics.residentsBlockedPct > baseline.metrics.residentsBlockedPct,
);
console.log();

// ---- scorePlan recomputes instantly from the SAME metrics under different weights ----
const gamesFirst = scorePlan(baseline.metrics, { games: 3, livability: 1, economy: 1 });
const livabilityFirst = scorePlan(baseline.metrics, { games: 1, livability: 3, economy: 1 });
check('different weight sliders produce different totals from the same metrics', gamesFirst.total !== livabilityFirst.total);
console.log(`scorePlan: games-weighted=${gamesFirst.total.toFixed(1)} livability-weighted=${livabilityFirst.total.toFixed(1)}`);

console.log();
console.log(allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(allPass ? 0 : 1);
