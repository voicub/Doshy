// Decoder for the elevation tiles of the AWS Terrain Tiles dataset ("Terrarium" encoding): a 256 x 256 PNG whose colour carries the height,
// metres = R * 256 + G + B / 256 - 32768. Node only (zlib): the server decodes, the browser receives plain numbers. No dependency: a PNG is a few
// chunks around one zlib stream of filtered rows. The node test runner loads this file directly: imports carry a .ts extension or are type-only.
import { inflateSync } from "node:zlib";

export const TILE_PX = 256;
/** Terrarium tiles are about 70 KB; 600 KB is a safe ceiling that still refuses a decompression bomb's source. */
export const MAX_TILE_PNG_BYTES = 600 * 1024;
/** Below this is the encoding's "no data" (R = G = B = 0 is -32768); the real Earth bottoms out near -11 034 m. */
const NODATA_BELOW = -12_000;

/** Height in metres of one Terrarium pixel, NaN for "no data". */
export const terrariumHeight = (r: number, g: number, b: number): number => {
  const v = r * 256 + g + b / 256 - 32768;
  return v < NODATA_BELOW ? NaN : v;
};

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * The 256 x 256 heights (row-major from the north-west corner, NaN = no data) of a Terrarium PNG, or undefined when the bytes are not exactly that: only
 * 8-bit RGB or RGBA, not interlaced, 256 x 256 pixels, one complete zlib stream. Everything else is refused rather than guessed at.
 */
export function decodeTerrarium(png: Uint8Array): Float32Array | undefined {
  if (png.length < 33 || png.length > MAX_TILE_PNG_BYTES || SIGNATURE.some((v, i) => png[i] !== v)) return undefined;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let channels = 0;
  const idat: Uint8Array[] = [];
  let idatBytes = 0;
  let pos = 8;
  let sawEnd = false;
  while (pos + 12 <= png.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const body = pos + 8;
    if (len > png.length - body - 4) return undefined;
    if (type === "IHDR") {
      if (len !== 13 || view.getUint32(body) !== TILE_PX || view.getUint32(body + 4) !== TILE_PX) return undefined;
      const [depth, colour, compression, filter, interlace] = [png[body + 8], png[body + 9], png[body + 10], png[body + 11], png[body + 12]];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || compression !== 0 || filter !== 0 || interlace !== 0) return undefined;
      channels = colour === 2 ? 3 : 4;
    } else if (type === "IDAT") {
      idat.push(png.subarray(body, body + len));
      idatBytes += len;
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }
    pos = body + len + 4; // + the CRC, which zlib's own checksum makes redundant here
  }
  if (!channels || !sawEnd || !idatBytes) return undefined;

  const stride = TILE_PX * channels;
  const expected = (stride + 1) * TILE_PX;
  let raw: Uint8Array;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  } catch {
    return undefined;
  }
  if (raw.length !== expected) return undefined;

  // Undo the per-row filters in place (None, Sub, Up, Average, Paeth); `left`, `up` and `corner` are bytes of the already-unfiltered pixels.
  const px = new Uint8Array(stride * TILE_PX);
  for (let y = 0; y < TILE_PX; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) return undefined;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? px[row + i - channels] : 0;
      const up = y ? px[row - stride + i] : 0;
      const corner = y && i >= channels ? px[row - stride + i - channels] : 0;
      const add = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, corner);
      px[row + i] = (raw[src + i] + add) & 0xff;
    }
  }
  const out = new Float32Array(TILE_PX * TILE_PX);
  for (let k = 0; k < out.length; k++) out[k] = terrariumHeight(px[k * channels], px[k * channels + 1], px[k * channels + 2]);
  return out;
}
