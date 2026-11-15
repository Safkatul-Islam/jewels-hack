// lib/scenarios.ts — P1
//
// Load + validate a scenario, and list the ones available to the picker.
//
// A scenario is just a JSON file. Nothing in the engine knows which city it is
// in, so swapping the file swaps the whole world. P4 authors the fixtures; this
// file is the single door they come through.
//
// ADDING A SCENARIO (P4): drop fixtures/scenario-<id>.json, then add one entry
// to SCENARIOS below. That is the whole job — the picker, the store and the
// validator pick it up for free.

import type { WorldState } from '@/lib/sim/types';

export interface ScenarioEntry {
  id: string;
  /** shown in the picker */
  name: string;
  event: string;
  blurb: string;
  /** deferred so a scenario's JSON is only parsed when it is actually chosen */
  load: () => Promise<unknown>;
}

// The entries' name/event/blurb are what the picker shows *before* the JSON is
// fetched, so they are deliberately duplicated from each fixture's own
// `scenario` block rather than read out of it. Keep them in step with the file.
export const SCENARIOS: ScenarioEntry[] = [
  {
    id: 'forecourt',
    name: 'Venue forecourt — illustrative',
    event: 'Major stadium event — planning sandbox',
    blurb: 'One street out of the bowl, 880 m to the interchange, kit already on it.',
    load: () => import('@/fixtures/scenario-forecourt.json').then((m) => m.default),
  },
  {
    id: 'arroyo',
    name: 'Arroyo — illustrative venue district',
    event: 'Major stadium event — planning sandbox',
    blurb: '88,000 seats, ring roads and uneven spokes, 2.4 km to the interchange.',
    load: () => import('@/fixtures/scenario-arroyo.json').then((m) => m.default),
  },
  {
    id: 'rosebowl',
    name: 'Rose Bowl, Pasadena — illustrative',
    event: 'Major stadium event — planning sandbox',
    blurb: '88,000 seats, 2.6 km to the rail anchor, one residential corridor.',
    load: () => import('@/fixtures/scenario-rosebowl.json').then((m) => m.default),
  },
  {
    id: 'downtown',
    name: 'Example downtown arena',
    event: 'Urban arena event — planning sandbox',
    blurb: '18,000 seats on a tight street grid, rail almost at the door.',
    load: () => import('@/fixtures/scenario-downtown.json').then((m) => m.default),
  },
];

export const DEFAULT_SCENARIO_ID = SCENARIOS[0].id;

export function listScenarios(): ScenarioEntry[] {
  return SCENARIOS;
}

export function findScenario(id: string): ScenarioEntry | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * Load a scenario by id and validate it. Throws with a message naming the
 * problem — at hour four, "anchors[1].arrivalShare is not a number" is worth a
 * great deal more than a blank canvas.
 */
export async function loadScenario(id: string): Promise<WorldState> {
  const entry = findScenario(id);
  if (!entry) {
    throw new Error(
      `Unknown scenario "${id}". Registered: ${SCENARIOS.map((s) => s.id).join(', ') || '(none)'}`,
    );
  }
  const raw = await entry.load();
  return validateWorld(raw, `scenario "${id}"`);
}

/**
 * Runtime validation of a scenario JSON against the frozen contract. TypeScript
 * does not check JSON at runtime, and a scenario is hand-authored data that four
 * people edit under time pressure, so this earns its keep.
 *
 * Checks the invariants the sim and the canvas actually depend on. It does not
 * try to be a schema validator.
 */
export function validateWorld(raw: unknown, label = 'scenario'): WorldState {
  const problems: string[] = [];
  const w = raw as Partial<WorldState> | null;

  if (!w || typeof w !== 'object') {
    throw new Error(`${label}: not an object`);
  }

  if (w.version !== 1) problems.push(`version must be 1, got ${JSON.stringify(w.version)}`);

  if (!w.scenario?.id) problems.push('scenario.id is missing');
  if (!w.scenario?.name) problems.push('scenario.name is missing');

  const bbox = w.bbox;
  if (!bbox || typeof bbox.minX !== 'number') {
    problems.push('bbox is missing or malformed');
  } else if (bbox.maxX <= bbox.minX || bbox.maxY <= bbox.minY) {
    problems.push('bbox is inverted or zero-sized');
  }

  if (!w.basemap?.kind) problems.push('basemap is missing');

  if (!w.venue || typeof w.venue.pos?.x !== 'number') {
    problems.push('venue.pos is missing');
  }

  if (!Array.isArray(w.anchors) || w.anchors.length === 0) {
    problems.push('anchors must have at least one entry');
  } else {
    w.anchors.forEach((a, i) => {
      if (typeof a?.pos?.x !== 'number') problems.push(`anchors[${i}].pos is malformed`);
      if (typeof a?.arrivalShare !== 'number') problems.push(`anchors[${i}].arrivalShare is not a number`);
    });
    const shareSum = w.anchors.reduce((s, a) => s + (a?.arrivalShare ?? 0), 0);
    // Not fatal — a scenario mid-edit should still render — but it skews every
    // arrival number, so it is worth saying out loud.
    if (Math.abs(shareSum - 1) > 0.02) {
      problems.push(`anchor arrivalShare sums to ${shareSum.toFixed(3)}, expected ~1`);
    }
  }

  for (const key of ['baseRoads', 'pieces', 'businesses', 'blocks', 'personas'] as const) {
    if (!Array.isArray(w[key])) problems.push(`${key} must be an array`);
  }

  if (!w.params || typeof w.params.spectators !== 'number') {
    problems.push('params.spectators is missing');
  }

  const ids = [
    ...(w.anchors ?? []).map((a) => a?.id),
    ...(w.baseRoads ?? []).map((r) => r?.id),
    ...(w.pieces ?? []).map((p) => p?.id),
  ].filter(Boolean);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) problems.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);

  if (problems.length) {
    throw new Error(`${label} is invalid:\n  - ${problems.join('\n  - ')}`);
  }

  return raw as WorldState;
}
