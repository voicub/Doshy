// A small PMTiles v3 reader (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md): the 127-byte header, the varint-packed directories (a root
// directory and optional leaf directories) and the Hilbert-curve tile ids, reading only the byte ranges it needs through an injected `range` function, so a
// 180 GB archive costs a few kilobytes per tile. Node only (zlib for the gzip the archive uses). No dependency. The node test runner loads this file directly.
import { gunzipSync } from "node:zlib";

export class PmtilesError extends Error {}

export type RangeFn = (offset: number, length: number) => Promise<Uint8Array>;

export type Compression = "none" | "gzip";

export type PmHeader = {
  rootOffset: number;
  rootLength: number;
  leafOffset: number;
  leafLength: number;
  dataOffset: number;
  dataLength: number;
  internal: Compression;
  tile: Compression;
  /** 1 = Mapbox Vector Tile */
  tileType: number;
  minZoom: number;
  maxZoom: number;
};

export type DirEntry = { tileId: number; offset: number; length: number; runLength: number };

export const HEADER_BYTES = 127;
/** A directory (decompressed) is at most this big: a real leaf is ~100 KB, a hostile answer must not be inflated into memory. */
const MAX_DIR_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 600_000;
const MAX_LEAF_DEPTH = 3;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function compression(code: number): Compression {
  if (code === 1) return "none";
  if (code === 2) return "gzip";
  throw new PmtilesError(`unsupported compression ${code}`);
}

/** The header, checking the magic bytes, the version (3) and that the sizes are sane numbers. */
export function parseHeader(b: Uint8Array): PmHeader {
  if (b.length < HEADER_BYTES || String.fromCharCode(...b.subarray(0, 7)) !== "PMTiles" || b[7] !== 3) throw new PmtilesError("not a PMTiles v3 archive");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u64 = (o: number): number => {
    const n = v.getBigUint64(o, true);
    if (n > BigInt(MAX_SAFE)) throw new PmtilesError("offset too large");
    return Number(n);
  };
  return {
    rootOffset: u64(8),
    rootLength: u64(16),
    leafOffset: u64(40),
    leafLength: u64(48),
    dataOffset: u64(56),
    dataLength: u64(64),
    internal: compression(b[97]),
    tile: compression(b[98]),
    tileType: b[99],
    minZoom: b[100],
    maxZoom: b[101],
  };
}

/** Reads one LEB128 varint (up to 2^53) at `pos.i` and moves on. Plain arithmetic, not bit operations, so values past 32 bits stay exact. */
function varint(b: Uint8Array, pos: { i: number }): number {
  let result = 0;
  let scale = 1;
  for (let n = 0; n < 8; n++) {
    if (pos.i >= b.length) throw new PmtilesError("truncated directory");
    const byte = b[pos.i++];
    result += (byte & 0x7f) * scale;
    if (byte < 0x80) {
      if (result > MAX_SAFE) throw new PmtilesError("number too large");
      return result;
    }
    scale *= 128;
  }
  throw new PmtilesError("number too long");
}

/** A directory (already decompressed): entries sorted by tile id. Offsets are relative to the tile data (leaf entries: to the leaf-directory section). */
export function parseDirectory(b: Uint8Array): DirEntry[] {
  const pos = { i: 0 };
  const count = varint(b, pos);
  if (count > MAX_ENTRIES || count > b.length) throw new PmtilesError("implausible directory size");
  const entries: DirEntry[] = Array.from({ length: count }, () => ({ tileId: 0, offset: 0, length: 0, runLength: 0 }));
  let id = 0;
  for (const e of entries) {
    id += varint(b, pos);
    e.tileId = id;
  }
  for (const e of entries) e.runLength = varint(b, pos);
  for (const e of entries) e.length = varint(b, pos);
  for (let i = 0; i < count; i++) {
    const o = varint(b, pos);
    // 0 means "directly after the previous entry"; anything else is the offset plus one
    entries[i].offset = o === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : Math.max(0, o - 1);
  }
  return entries;
}

/** The id of tile z/x/y along the archive's Hilbert curve (zoom levels one after another): what the directories are sorted by. */
export function tileIdOf(z: number, x: number, y: number): number {
  if (!Number.isInteger(z) || z < 0 || z > 26) throw new PmtilesError("zoom out of range");
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) throw new PmtilesError("tile out of range");
  let d = 0;
  let tx = x;
  let ty = y;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = tx & s ? 1 : 0;
    const ry = ty & s ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - tx;
        ty = s - 1 - ty;
      }
      [tx, ty] = [ty, tx];
    }
  }
  return (4 ** z - 1) / 3 + d;
}

/** The entry that holds `tileId`: the last one starting at or before it, if it is a leaf pointer or its run reaches it. */
export function findEntry(entries: readonly DirEntry[], tileId: number): DirEntry | undefined {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].tileId <= tileId) lo = mid + 1;
    else hi = mid - 1;
  }
  const e = entries[hi];
  if (!e) return undefined;
  if (e.runLength === 0) return e; // a leaf directory covering this id and more
  return tileId - e.tileId < e.runLength ? e : undefined;
}

function inflate(b: Uint8Array, how: Compression, max: number): Uint8Array {
  if (how === "none") {
    if (b.length > max) throw new PmtilesError("block too large");
    return b;
  }
  try {
    return gunzipSync(b, { maxOutputLength: max });
  } catch {
    throw new PmtilesError("corrupt compressed block");
  }
}

export type ReadOpts = {
  /** Decompressed directory bytes by absolute file offset: a leaf directory is fetched once and the next tile nearby reuses it. */
  directoryCache?: Map<number, DirEntry[]>;
  /** The decompressed tile is refused above this many bytes. */
  maxTileBytes?: number;
};

/** The root directory. */
export async function readRootDirectory(range: RangeFn, h: PmHeader): Promise<DirEntry[]> {
  if (h.rootLength <= 0 || h.rootLength > MAX_DIR_BYTES) throw new PmtilesError("root directory size");
  return parseDirectory(inflate(await range(h.rootOffset, h.rootLength), h.internal, MAX_DIR_BYTES));
}

/** Where tile z/x/y's (compressed) bytes lie in the file, or undefined when the archive has no such tile. Follows leaf directories (at most three levels) through `range`. */
export async function locateTile(range: RangeFn, h: PmHeader, root: readonly DirEntry[], z: number, x: number, y: number, opts: ReadOpts = {}): Promise<{ offset: number; length: number } | undefined> {
  if (z < h.minZoom || z > h.maxZoom) return undefined;
  const id = tileIdOf(z, x, y);
  let entries: readonly DirEntry[] = root;
  for (let depth = 0; depth <= MAX_LEAF_DEPTH; depth++) {
    const e = findEntry(entries, id);
    if (!e) return undefined;
    if (e.runLength > 0) {
      if (e.length <= 0 || e.offset + e.length > h.dataLength) throw new PmtilesError("tile outside the archive");
      return { offset: h.dataOffset + e.offset, length: e.length };
    }
    if (e.length <= 0 || e.offset + e.length > h.leafLength) throw new PmtilesError("leaf directory outside the archive");
    const at = h.leafOffset + e.offset;
    let leaf = opts.directoryCache?.get(at);
    if (!leaf) {
      leaf = parseDirectory(inflate(await range(at, e.length), h.internal, MAX_DIR_BYTES));
      opts.directoryCache?.set(at, leaf);
    }
    entries = leaf;
  }
  throw new PmtilesError("directories nested too deep");
}

/** A tile's stored bytes made ready to decode (gunzipped when the archive says so), refused above `maxBytes` once decompressed. */
export const inflateTile = (stored: Uint8Array, h: PmHeader, maxBytes = MAX_DIR_BYTES): Uint8Array => inflate(stored, h.tile, maxBytes);

/** The (decompressed) bytes of tile z/x/y, or undefined when the archive has no such tile. `root` is the already-read root directory. */
export async function readTile(range: RangeFn, h: PmHeader, root: readonly DirEntry[], z: number, x: number, y: number, opts: ReadOpts = {}): Promise<Uint8Array | undefined> {
  const at = await locateTile(range, h, root, z, x, y, opts);
  return at && inflateTile(await range(at.offset, at.length), h, opts.maxTileBytes);
}
