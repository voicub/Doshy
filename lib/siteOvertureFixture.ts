// Builds tiny synthetic Mapbox Vector Tiles and PMTiles archives for the tests (and nothing else): the same byte layouts the real files use, small enough to read in a
// test, so the PMTiles reader and the vector tile decoder are exercised without the network and without anyone's real neighbourhood. Not part of the app.
import { gzipSync } from "node:zlib";
import type { MvtValue } from "./mvt.ts";
import { tileIdOf } from "./pmtiles.ts";

export function varint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}

const zig = (n: number): number => (n >= 0 ? n * 2 : -n * 2 - 1);
const field = (num: number, wire: number): number[] => varint(num * 8 + wire);
const lengthDelimited = (num: number, body: number[]): number[] => [...field(num, 2), ...varint(body.length), ...body];
const str = (s: string): number[] => [...new TextEncoder().encode(s)];

/** A polygon as rings in tile units: the outer ring clockwise on screen (positive shoelace area, y down), holes the other way. */
export type FixturePolygon = [number, number][][];

export type FixtureFeature = { id?: number; props: Record<string, MvtValue>; polygons?: FixturePolygon[]; /** emit this geometry type instead of polygons (1 = point) */ type?: number };

function ringCommands(ring: [number, number][], cursor: { x: number; y: number }): number[] {
  const out: number[] = [...varint((1 << 3) | 1)];
  const step = ([x, y]: [number, number]) => {
    out.push(...varint(zig(x - cursor.x)), ...varint(zig(y - cursor.y)));
    cursor.x = x;
    cursor.y = y;
  };
  step(ring[0]);
  out.push(...varint(((ring.length - 1) << 3) | 2));
  ring.slice(1).forEach(step);
  out.push(...varint((1 << 3) | 7));
  return out;
}

const valueMessage = (v: MvtValue): number[] => {
  if (typeof v === "string") return lengthDelimited(1, str(v));
  if (typeof v === "boolean") return [...field(7, 0), v ? 1 : 0];
  if (Number.isInteger(v)) return v >= 0 ? [...field(5, 0), ...varint(v)] : [...field(6, 0), ...varint(zig(v))];
  const f = new Uint8Array(8);
  new DataView(f.buffer).setFloat64(0, v, true);
  return [...field(3, 1), ...f];
};

/** One layer message. The values table and keys table are written AFTER the features (as real encoders may), so the decoder must not assume an order. */
export function mvtLayer(name: string, features: FixtureFeature[], extent = 4096): number[] {
  const keys: string[] = [];
  const values: MvtValue[] = [];
  const featureBytes = features.map((f) => {
    const tags: number[] = [];
    for (const [k, v] of Object.entries(f.props)) {
      let ki = keys.indexOf(k);
      if (ki < 0) ki = keys.push(k) - 1;
      let vi = values.findIndex((x) => x === v);
      if (vi < 0) vi = values.push(v) - 1;
      tags.push(ki, vi);
    }
    const cursor = { x: 0, y: 0 };
    const geometry = f.type === 1 ? [...varint((1 << 3) | 1), ...varint(zig(10)), ...varint(zig(10))] : (f.polygons ?? []).flatMap((p) => p.flatMap((r) => ringCommands(r, cursor)));
    return lengthDelimited(2, [...(f.id === undefined ? [] : [...field(1, 0), ...varint(f.id)]), ...lengthDelimited(2, tags.flatMap(varint)), ...field(3, 0), ...varint(f.type ?? 3), ...lengthDelimited(4, geometry)]);
  });
  return [...lengthDelimited(1, str(name)), ...featureBytes.flat(), ...keys.flatMap((k) => lengthDelimited(3, str(k))), ...values.flatMap((v) => lengthDelimited(4, valueMessage(v))), ...field(5, 0), ...varint(extent), ...field(15, 0), 2];
}

export const mvtTile = (layers: number[][]): Uint8Array => Uint8Array.from(layers.flatMap((l) => lengthDelimited(3, l)));

/** An axis-aligned square ring, clockwise on screen. */
export const square = (x: number, y: number, size: number): [number, number][] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
export const hole = (x: number, y: number, size: number): [number, number][] => [[x, y], [x, y + size], [x + size, y + size], [x + size, y]];

// ---- PMTiles ------------------------------------------------------------------------------------------------------------------------

export type ArchiveTile = { z: number; x: number; y: number; bytes: Uint8Array };

type Entry = { tileId: number; offset: number; length: number; runLength: number };

function directory(entries: Entry[]): Uint8Array {
  const out: number[] = [...varint(entries.length)];
  let last = 0;
  for (const e of entries) {
    out.push(...varint(e.tileId - last));
    last = e.tileId;
  }
  for (const e of entries) out.push(...varint(e.runLength));
  for (const e of entries) out.push(...varint(e.length));
  entries.forEach((e, i) => out.push(...varint(i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length ? 0 : e.offset + 1)));
  return gzipSync(Uint8Array.from(out));
}

/**
 * A PMTiles v3 archive: gzip directories and tiles. With `leafSize` > 0 the tile entries are split into leaf directories of that many entries each and the root
 * only points at them (the real archive does this), so the reader's leaf path is exercised. Returns the bytes of the whole file.
 */
export function pmtilesArchive(tiles: ArchiveTile[], opts: { leafSize?: number; minZoom?: number; maxZoom?: number } = {}): Uint8Array {
  const sorted = tiles.map((t) => ({ ...t, tileId: tileIdOf(t.z, t.x, t.y), packed: gzipSync(t.bytes) })).sort((a, b) => a.tileId - b.tileId);
  let offset = 0;
  const entries: Entry[] = sorted.map((t) => {
    const e = { tileId: t.tileId, offset, length: t.packed.length, runLength: 1 };
    offset += t.packed.length;
    return e;
  });
  const data = Buffer.concat(sorted.map((t) => t.packed));
  let rootEntries = entries;
  const leaves: Uint8Array[] = [];
  if (opts.leafSize) {
    rootEntries = [];
    let leafOffset = 0;
    for (let i = 0; i < entries.length; i += opts.leafSize) {
      const chunk = entries.slice(i, i + opts.leafSize);
      const bytes = directory(chunk);
      rootEntries.push({ tileId: chunk[0].tileId, offset: leafOffset, length: bytes.length, runLength: 0 });
      leaves.push(bytes);
      leafOffset += bytes.length;
    }
  }
  const root = directory(rootEntries);
  const meta = gzipSync(Buffer.from("{}"));
  const leafBytes = Buffer.concat(leaves);
  const header = Buffer.alloc(127);
  header.write("PMTiles", 0, "ascii");
  header[7] = 3;
  const dataOffset = 127 + root.length + meta.length + leafBytes.length;
  const u64 = (o: number, v: number) => header.writeBigUInt64LE(BigInt(v), o);
  u64(8, 127);
  u64(16, root.length);
  u64(24, 127 + root.length);
  u64(32, meta.length);
  u64(40, 127 + root.length + meta.length);
  u64(48, leafBytes.length);
  u64(56, dataOffset);
  u64(64, data.length);
  u64(72, tiles.length);
  u64(80, tiles.length);
  u64(88, tiles.length);
  header.set([1, 2, 2, 1, opts.minZoom ?? 0, opts.maxZoom ?? 14], 96);
  return Buffer.concat([header, root, meta, leafBytes, data]);
}

/** A `range` function over bytes in memory, counting its calls. */
export function memoryRange(file: Uint8Array) {
  const calls: [number, number][] = [];
  return {
    calls,
    range: async (offset: number, length: number): Promise<Uint8Array> => {
      calls.push([offset, length]);
      return file.slice(offset, offset + length);
    },
  };
}
