// Test-only PNG reader for the photo fixtures. Node has no image decoder and the
// project adds no dependency for one, so this handles exactly what the fixtures
// use: 8-bit RGB or RGBA, non-interlaced. Anything else throws.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { Frame } from './types';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left), dUp = Math.abs(estimate - up), dUpLeft = Math.abs(estimate - upLeft);
  return dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
}

export function readPngFrame(path: string | URL): Frame {
  const file = readFileSync(path);
  if (!SIGNATURE.every((byte, i) => file[i] === byte)) throw new Error(`${path} is not a PNG file.`);
  let width = 0, height = 0, channels = 0;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < file.length;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = body.subarray(8);
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
      if (bitDepth !== 8 || !channels || interlace !== 0) {
        throw new Error(`${path}: only 8-bit RGB/RGBA non-interlaced PNG fixtures are supported.`);
      }
    } else if (type === 'IDAT') compressed.push(body);
    offset += 12 + length;
  }
  if (!width || !height || !compressed.length) throw new Error(`${path}: missing PNG header or image data.`);

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== (stride + 1) * height) throw new Error(`${path}: unexpected PNG data length.`);
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const input = y * (stride + 1) + 1, row = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[row + i - channels]! : 0;
      const up = y > 0 ? pixels[row + i - stride]! : 0;
      const upLeft = y > 0 && i >= channels ? pixels[row + i - stride - channels]! : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : -1;
      if (predictor < 0) throw new Error(`${path}: unknown PNG filter ${filter}.`);
      pixels[row + i] = (raw[input + i]! + predictor) & 0xff;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < pixels.length; i += channels, p += 4) {
    data[p] = pixels[i]!;
    data[p + 1] = pixels[i + 1]!;
    data[p + 2] = pixels[i + 2]!;
    data[p + 3] = channels === 4 ? pixels[i + 3]! : 255;
  }
  return { width, height, data };
}
