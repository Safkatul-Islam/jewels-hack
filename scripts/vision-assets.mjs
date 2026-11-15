// scripts/vision-assets.mjs — P4
//
// Puts the MediaPipe runtime under public/vision/ so the gesture mode loads
// from localhost and not from a CDN. This is a demo-reliability decision, not a
// preference: conference wifi is the single most likely thing to break a live
// demo, and a 15 MB wasm fetch over it is the worst possible moment to find out.
//
// The files are NOT committed (public/vision/ is gitignored) — 30 MB of
// binaries in a four-person repo is its own kind of pain. `npm run dev` runs
// this first and it no-ops once the files are there, so nobody has to remember.
//
// Cross-platform per AGENTS.md §4: a Node script, no cp, no curl, path.join
// everywhere.

import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmOut = path.join(root, 'public', 'vision', 'wasm');
const modelOut = path.join(root, 'public', 'vision', 'hand_landmarker.task');

// float16/1 is the published "full" hand model: ~7.5 MB, two hands, 21
// landmarks. The lite variant is faster but loses fingertip precision, and
// fingertip precision is the whole pinch gesture.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
];

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size > 0;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(path.join(wasmSrc, WASM_FILES[1])))) {
    throw new Error(
      '@mediapipe/tasks-vision is not installed. Run `npm install` first.',
    );
  }
  await mkdir(wasmOut, { recursive: true });
  let copied = 0;
  for (const name of WASM_FILES) {
    const to = path.join(wasmOut, name);
    if (await exists(to)) continue;
    await copyFile(path.join(wasmSrc, name), to);
    copied += 1;
  }
  return copied;
}

async function fetchModel() {
  if (await exists(modelOut)) return false;
  await mkdir(path.dirname(modelOut), { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`hand_landmarker.task download failed: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(modelOut));
  return true;
}

const copied = await copyWasm();
const fetched = await fetchModel();

if (copied === 0 && !fetched) {
  process.stdout.write('vision assets: already present\n');
} else {
  process.stdout.write(
    `vision assets: ${copied} wasm file(s) copied, model ${fetched ? 'downloaded' : 'already present'}\n`,
  );
}
