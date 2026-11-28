// Builds synthetic Terrarium PNG tiles for the tests (and nothing else): a height function in, a real PNG out (zlib, per-row filters, CRC), so the decoder
// and the server are exercised without any network and without a recorded tile of someone's neighbourhood. It is not part of the app.
import { deflateSync } from "node:zlib";
import { TILE_PX } from "./pngTerrarium.ts";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  out.set(body, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** The Terrarium colour of a height: R * 256 + G + B / 256 - 32768. `null` is "no data" (all zero, -32768 m). */
export function terrariumColour(metres: number | null): [number, number, number] {
  if (metres === null) return [0, 0, 0];
  const v = Math.round((metres + 32768) * 256);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** PNG filter types by row, so a decoder that only handles "None" fails the tests. */
const FILTER_BY_ROW = [0, 1, 2, 3, 4];

/** A 256 x 256 Terrarium PNG: `height(px, py)` metres (null = no data) for each pixel. `channels` 3 = RGB, 4 = RGBA. */
export function terrariumPng(height: (px: number, py: number) => number | null, channels: 3 | 4 = 3): Buffer {
  const stride = TILE_PX * channels;
  const px = Buffer.alloc(stride * TILE_PX);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const [r, g, b] = terrariumColour(height(x, y));
      px.set(channels === 3 ? [r, g, b] : [r, g, b, 255], y * stride + x * channels);
    }
  }
  const raw = Buffer.alloc((stride + 1) * TILE_PX);
  for (let y = 0; y < TILE_PX; y++) {
    const filter = FILTER_BY_ROW[y % FILTER_BY_ROW.length];
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const cur = px[y * stride + i];
      const left = i >= channels ? px[y * stride + i - channels] : 0;
      const up = y ? px[(y - 1) * stride + i] : 0;
      const corner = y && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
      let predict = 0;
      if (filter === 1) predict = left;
      else if (filter === 2) predict = up;
      else if (filter === 3) predict = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        predict = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      raw[y * (stride + 1) + 1 + i] = (cur - predict) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(TILE_PX, 0);
  header.writeUInt32BE(TILE_PX, 4);
  header.set([8, channels === 3 ? 2 : 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
