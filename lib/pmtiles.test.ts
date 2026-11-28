import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { HEADER_BYTES, PmtilesError, findEntry, locateTile, parseDirectory, parseHeader, readRootDirectory, readTile, tileIdOf } from "./pmtiles.ts";
import { memoryRange, pmtilesArchive, varint } from "./siteOvertureFixture.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

test("tile ids walk the Hilbert curve: zoom levels in order, every id once, neighbours one step apart", () => {
  assert.equal(tileIdOf(0, 0, 0), 0);
  assert.deepEqual([tileIdOf(1, 0, 0), tileIdOf(1, 0, 1), tileIdOf(1, 1, 1), tileIdOf(1, 1, 0)], [1, 2, 3, 4]);
  assert.equal(tileIdOf(2, 0, 0), 5);
  const at = new Map<number, [number, number]>();
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) at.set(tileIdOf(3, x, y), [x, y]);
  assert.equal(at.size, 64);
  for (let id = 21; id < 84; id++) {
    const [a, b] = [at.get(id), at.get(id + 1)];
    assert.ok(a && b, `ids 21..84 are zoom 3: ${id}`);
    assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1, `${id} -> ${id + 1}`);
  }
  assert.ok(tileIdOf(14, 8191, 5450) > tileIdOf(13, 4095, 2724), "a deeper zoom always has a bigger id");
  assert.throws(() => tileIdOf(3, 8, 0), PmtilesError);
  assert.throws(() => tileIdOf(30, 0, 0), PmtilesError);
  assert.throws(() => tileIdOf(3, 1.5, 0), PmtilesError);
});

test("the header: sizes, compression, zoom range; a wrong magic, version or compression is refused", () => {
  const file = pmtilesArchive([{ z: 14, x: 8191, y: 5450, bytes: bytes("tile") }], { minZoom: 5, maxZoom: 14 });
  const h = parseHeader(file.subarray(0, HEADER_BYTES));
  assert.deepEqual([h.rootOffset, h.internal, h.tile, h.tileType, h.minZoom, h.maxZoom], [127, "gzip", "gzip", 1, 5, 14]);
  assert.ok(h.rootLength > 0 && h.dataLength > 0 && h.dataOffset > h.rootOffset);
  const patched = (i: number, v: number) => Uint8Array.from(file.subarray(0, HEADER_BYTES), (b, k) => (k === i ? v : b));
  assert.throws(() => parseHeader(patched(0, 0x58)), PmtilesError, "magic");
  assert.throws(() => parseHeader(patched(7, 2)), PmtilesError, "version");
  assert.throws(() => parseHeader(patched(97, 9)), PmtilesError, "compression");
  assert.throws(() => parseHeader(file.subarray(0, 100)), PmtilesError, "short");
  const huge = Uint8Array.from(file.subarray(0, HEADER_BYTES));
  new DataView(huge.buffer).setBigUint64(8, 2n ** 60n, true);
  assert.throws(() => parseHeader(huge), PmtilesError, "an offset beyond 2^53");
});

test("directories: delta ids, run lengths, and the 0 = 'right after the previous entry' offsets, also past 4 GB", () => {
  const big = 6_000_000_000;
  const raw = Uint8Array.from([
    ...varint(3),
    ...[10, 5, 100].flatMap(varint), // ids 10, 15, 115
    ...[1, 2, 0].flatMap(varint), // runs
    ...[100, 50, 70].flatMap(varint), // lengths
    ...[0 + 1, 0, big + 1].flatMap(varint), // offsets: 0, continues (100), explicit big
  ]);
  const d = parseDirectory(raw);
  assert.deepEqual(d.map((e) => e.tileId), [10, 15, 115]);
  assert.deepEqual(d.map((e) => e.runLength), [1, 2, 0]);
  assert.deepEqual(d.map((e) => e.offset), [0, 100, big]);
  assert.deepEqual(d.map((e) => e.length), [100, 50, 70]);
});

test("a hostile directory is refused instead of allocated", () => {
  assert.throws(() => parseDirectory(Uint8Array.from(varint(1_000_000_000))), PmtilesError, "claims a billion entries");
  assert.throws(() => parseDirectory(Uint8Array.from([...varint(2), 1])), PmtilesError, "truncated");
  assert.throws(() => parseDirectory(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01])), PmtilesError, "a varint without an end");
});

test("finding a tile: inside a run, between entries, before the first, and a leaf pointer covers everything up to the next entry", () => {
  const entries = [
    { tileId: 10, offset: 0, length: 5, runLength: 3 },
    { tileId: 20, offset: 5, length: 5, runLength: 1 },
    { tileId: 30, offset: 0, length: 9, runLength: 0 },
    { tileId: 60, offset: 10, length: 5, runLength: 1 },
  ];
  assert.equal(findEntry(entries, 11)?.tileId, 10, "inside the run of three");
  assert.equal(findEntry(entries, 13), undefined, "just past it");
  assert.equal(findEntry(entries, 5), undefined, "before the first");
  assert.equal(findEntry(entries, 20)?.tileId, 20);
  assert.equal(findEntry(entries, 21), undefined, "a gap between single tiles");
  assert.equal(findEntry(entries, 45)?.runLength, 0, "a leaf directory");
  assert.equal(findEntry(entries, 60)?.tileId, 60);
  assert.equal(findEntry(entries, 61), undefined);
});

test("reading tiles through the root only, and through leaf directories (fetched once, reused)", async () => {
  const tiles = [8190, 8191, 8192, 8193].flatMap((x) => [5449, 5450].map((y) => ({ z: 14, x, y, bytes: bytes(`tile ${x}/${y}`) })));
  for (const leafSize of [0, 3]) {
    const file = pmtilesArchive(tiles, { leafSize });
    const { range, calls } = memoryRange(file);
    const h = parseHeader(await range(0, HEADER_BYTES));
    const root = await readRootDirectory(range, h);
    const cache = new Map();
    const a = await readTile(range, h, root, 14, 8192, 5450, { directoryCache: cache });
    assert.equal(new TextDecoder().decode(a), "tile 8192/5450", `leafSize ${leafSize}`);
    let before = calls.length;
    const again = await readTile(range, h, root, 14, 8192, 5450, { directoryCache: cache });
    assert.equal(new TextDecoder().decode(again), "tile 8192/5450");
    assert.equal(calls.length - before, 1, "the same tile again: only the tile's bytes, its leaf directory is cached");
    before = calls.length;
    const b = await readTile(range, h, root, 14, 8192, 5449, { directoryCache: cache });
    assert.equal(new TextDecoder().decode(b), "tile 8192/5449");
    assert.ok(calls.length - before <= 2, "a neighbour in another leaf costs its leaf and its bytes at most");
    assert.equal(await readTile(range, h, root, 14, 9000, 5450), undefined, "no such tile");
    before = calls.length;
    assert.equal(await readTile(range, h, root, 3, 1, 1), undefined, "outside the zoom range of the archive");
    assert.equal(calls.length, before, "and no request was made for it");
    if (leafSize) assert.ok(cache.size >= 1);
  }
});

test("a directory entry that points outside the file is an error, not a read", async () => {
  const file = pmtilesArchive([{ z: 14, x: 1, y: 1, bytes: bytes("x") }]);
  const { range } = memoryRange(file);
  const h = parseHeader(await range(0, HEADER_BYTES));
  const evil = [{ tileId: tileIdOf(14, 1, 1), offset: 1e12, length: 10, runLength: 1 }];
  await assert.rejects(readTile(range, h, evil, 14, 1, 1), PmtilesError);
  const leafy = [{ tileId: tileIdOf(14, 1, 1), offset: 0, length: 1e9, runLength: 0 }];
  await assert.rejects(locateTile(range, h, leafy, 14, 1, 1), PmtilesError);
});

test("a corrupt or oversized compressed block is refused", async () => {
  const file = pmtilesArchive([{ z: 14, x: 1, y: 1, bytes: bytes("x") }]);
  const h = parseHeader(file.subarray(0, HEADER_BYTES));
  const rotten = Uint8Array.from(file);
  rotten.fill(0xff, h.rootOffset, h.rootOffset + h.rootLength);
  await assert.rejects(readRootDirectory(memoryRange(rotten).range, h), PmtilesError);
  const bomb = gzipSync(Buffer.alloc(20 * 1024 * 1024));
  const bombed = pmtilesArchive([{ z: 14, x: 1, y: 1, bytes: Buffer.alloc(20 * 1024 * 1024) }]);
  const bh = parseHeader(bombed.subarray(0, HEADER_BYTES));
  const root = await readRootDirectory(memoryRange(bombed).range, bh);
  await assert.rejects(readTile(memoryRange(bombed).range, bh, root, 14, 1, 1, { maxTileBytes: 1024 * 1024 }), PmtilesError, "inflates past the cap");
  assert.ok(bomb.length < 100_000, "the bomb really is small on the wire");
});
