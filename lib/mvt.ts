// A Mapbox Vector Tile decoder for polygon layers (https://github.com/mapbox/vector-tile-spec/tree/master/2.1): protobuf varints, the tag/value tables and the
// zigzag-encoded MoveTo / LineTo / ClosePath geometry commands. Only polygons are decoded (that is all the building layers hold); other geometry types come out
// without geometry. Every length is checked against the bytes that are left, so a damaged or hostile tile throws `MvtError` instead of looping or allocating.
// No dependency. The node test runner loads this file directly.

export class MvtError extends Error {}

export type MvtValue = string | number | boolean;
export type Ring = [number, number][];
/** One polygon: the outer ring, then its holes, in tile coordinates (0..extent, y down). */
export type MvtPolygon = Ring[];
export type MvtFeature = { id?: number; props: Record<string, MvtValue>; polygons: MvtPolygon[] };
export type MvtLayer = { name: string; extent: number; features: MvtFeature[] };

const MAX_FEATURES = 200_000;
const MAX_POINTS = 2_000_000;

class Reader {
  i = 0;
  readonly b: Uint8Array;
  readonly end: number;
  constructor(b: Uint8Array, end: number = b.length) {
    this.b = b;
    this.end = end;
  }
  get done(): boolean {
    return this.i >= this.end;
  }
  /** An unsigned varint up to 2^53 (protobuf's 64-bit values only ever hold small numbers here). */
  varint(): number {
    let result = 0;
    let scale = 1;
    for (let n = 0; n < 10; n++) {
      if (this.i >= this.end) throw new MvtError("truncated");
      const byte = this.b[this.i++];
      result += (byte & 0x7f) * scale;
      if (byte < 0x80) return result;
      scale *= 128;
    }
    throw new MvtError("varint too long");
  }
  /** A length-delimited field's bytes as a reader over the same buffer. */
  sub(): Reader {
    const len = this.varint();
    if (len > this.end - this.i) throw new MvtError("field longer than the tile");
    const r = new Reader(this.b, this.i + len);
    r.i = this.i;
    this.i += len;
    return r;
  }
  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.advance(8);
    else if (wire === 2) this.advance(this.varint());
    else if (wire === 5) this.advance(4);
    else throw new MvtError(`wire type ${wire}`);
  }
  private advance(n: number): void {
    if (n > this.end - this.i) throw new MvtError("truncated");
    this.i += n;
  }
  string(): string {
    const r = this.sub();
    return new TextDecoder().decode(this.b.subarray(r.i, r.end));
  }
  f32(): number {
    if (this.end - this.i < 4) throw new MvtError("truncated");
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.i, 4).getFloat32(0, true);
    this.i += 4;
    return v;
  }
  f64(): number {
    if (this.end - this.i < 8) throw new MvtError("truncated");
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.i, 8).getFloat64(0, true);
    this.i += 8;
    return v;
  }
}

const unzigzag = (n: number): number => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function readValue(r: Reader): MvtValue {
  let out: MvtValue = "";
  while (!r.done) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 2) out = r.string();
    else if (field === 2 && wire === 5) out = r.f32();
    else if (field === 3 && wire === 1) out = r.f64();
    else if (field === 4 && wire === 0) {
      const v = r.varint();
      out = v >= 2 ** 63 ? v - 2 ** 64 : v;
    } else if (field === 5 && wire === 0) out = r.varint();
    else if (field === 6 && wire === 0) out = unzigzag(r.varint());
    else if (field === 7 && wire === 0) out = r.varint() !== 0;
    else r.skip(wire);
  }
  return out;
}

/** Polygons from the geometry command stream: a ring with positive area (shoelace, y down) starts a polygon, a negative one is a hole of the last polygon. */
function readPolygons(r: Reader, budget: { points: number }): MvtPolygon[] {
  const polygons: MvtPolygon[] = [];
  let ring: Ring = [];
  let x = 0;
  let y = 0;
  const close = () => {
    if (ring.length >= 3) {
      let area = 0;
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k];
        const [bx, by] = ring[(k + 1) % ring.length];
        area += ax * by - bx * ay;
      }
      if (area > 0) polygons.push([ring]);
      else if (area < 0 && polygons.length) polygons[polygons.length - 1].push(ring);
    }
    ring = [];
  };
  while (!r.done) {
    const cmd = r.varint();
    const id = cmd % 8;
    const count = Math.floor(cmd / 8);
    if (id === 7) {
      close();
      continue;
    }
    if (id !== 1 && id !== 2) throw new MvtError("unknown geometry command");
    if (count > r.end - r.i) throw new MvtError("geometry longer than its bytes");
    for (let k = 0; k < count; k++) {
      x += unzigzag(r.varint());
      y += unzigzag(r.varint());
      if (id === 1) close(); // a new ring starts at every MoveTo
      if (++budget.points > MAX_POINTS) throw new MvtError("too many points");
      ring.push([x, y]);
    }
  }
  close();
  return polygons;
}

function readFeature(r: Reader, keys: string[], values: MvtValue[], budget: { points: number }): MvtFeature | undefined {
  let id: number | undefined;
  let type = 0;
  const props: Record<string, MvtValue> = {};
  let geometry: Reader | undefined;
  while (!r.done) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 0) id = r.varint();
    else if (field === 2 && wire === 2) {
      const t = r.sub();
      const pairs: number[] = [];
      while (!t.done) pairs.push(t.varint());
      for (let k = 0; k + 1 < pairs.length; k += 2) {
        const key = keys[pairs[k]];
        const value = values[pairs[k + 1]];
        if (key !== undefined && value !== undefined) props[key] = value;
      }
    } else if (field === 3 && wire === 0) type = r.varint();
    else if (field === 4 && wire === 2) geometry = r.sub();
    else r.skip(wire);
  }
  return { ...(id === undefined ? {} : { id }), props, polygons: type === 3 && geometry ? readPolygons(geometry, budget) : [] };
}

function readLayer(r: Reader): MvtLayer {
  let name = "";
  let extent = 4096;
  const keys: string[] = [];
  const values: MvtValue[] = [];
  const featureAt: Reader[] = [];
  while (!r.done) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 1 && wire === 2) name = r.string();
    else if (field === 2 && wire === 2) {
      if (featureAt.length >= MAX_FEATURES) throw new MvtError("too many features");
      featureAt.push(r.sub());
    } else if (field === 3 && wire === 2) keys.push(r.string());
    else if (field === 4 && wire === 2) values.push(readValue(r.sub()));
    else if (field === 5 && wire === 0) extent = r.varint();
    else r.skip(wire);
  }
  if (!(extent > 0 && extent <= 1 << 20)) throw new MvtError("bad extent");
  // features are decoded last: their tags point into the key and value tables, which may come after them in the message
  const budget = { points: 0 };
  const features: MvtFeature[] = [];
  for (const f of featureAt) {
    const feature = readFeature(f, keys, values, budget);
    if (feature) features.push(feature);
  }
  return { name, extent, features };
}

/** The layers of a (decompressed) tile; with `only`, other layers are skipped without being decoded. */
export function decodeMvt(bytes: Uint8Array, only?: readonly string[]): MvtLayer[] {
  const tile = new Reader(bytes);
  const layers: MvtLayer[] = [];
  while (!tile.done) {
    const tag = tile.varint();
    if (Math.floor(tag / 8) === 3 && tag % 8 === 2) {
      const sub = tile.sub();
      if (only) {
        // peek the name (field 1) without decoding the rest
        const peek = new Reader(sub.b, sub.end);
        peek.i = sub.i;
        let name = "";
        while (!peek.done) {
          const t = peek.varint();
          if (t === 10) {
            name = peek.string();
            break;
          }
          peek.skip(t % 8);
        }
        if (!only.includes(name)) continue;
      }
      layers.push(readLayer(sub));
    } else tile.skip(tag % 8);
  }
  return layers;
}
