// A small Wavefront OBJ reader for city models: vertices, triangles and the `o` objects (Vectiler's `--splitMeshes 1` writes one object per building / road).
// Reads bytes directly (a 3 x 3 tile export is tens of MB: decoding it to a string first would double the memory) and hands the main thread back every few
// milliseconds, so the 3D view keeps moving while a model loads. Pure; the node test runner loads this file directly.

/** `start` / `end` index `ObjModel.tris` (corner indices, three per triangle). */
export type ObjMesh = { name: string; start: number; end: number };
export type ObjModel = {
  /** x, y, z per vertex, in the file's own units. */
  pos: Float32Array;
  /** Three vertex indices per triangle (polygons with more corners are fanned). */
  tris: Uint32Array;
  meshes: ObjMesh[];
};

/** A file with more vertices than this is refused: it would not fit the memory of a phone or a Raspberry Pi anyway. */
export const MAX_OBJ_VERTICES = 4_000_000;
const SLICE_MS = 8;
const LINES_PER_CHECK = 2048;

const NL = 10;
const SPACE = 32;
const TAB = 9;
const CR = 13;
const MINUS = 45;
const PLUS = 43;
const DOT = 46;
const E_LOW = 101;
const E_UP = 69;
const ZERO = 48;
const NINE = 57;
const V = 118;
const F = 102;
const O = 111;

const isDigit = (c: number) => c >= ZERO && c <= NINE;
const isBlank = (c: number) => c === SPACE || c === TAB || c === CR;

/** Growable typed array: appends without the per-element cost of a JS array. */
class Grow<T extends Float32Array | Uint32Array> {
  data: T;
  length = 0;
  make: (n: number) => T;
  constructor(make: (n: number) => T, size: number) {
    this.make = make;
    this.data = make(size);
  }
  push(v: number) {
    if (this.length === this.data.length) {
      const bigger = this.make(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    this.data[this.length++] = v;
  }
  /** An exactly sized copy. */
  done(): T {
    const out = this.make(this.length);
    out.set(this.data.subarray(0, this.length));
    return out;
  }
}

/** A number at `i` (after blanks): its value and the index just after it, NaN value when there is none. */
function readNumber(b: Uint8Array, i: number, end: number): [number, number] {
  while (i < end && isBlank(b[i])) i++;
  let neg = false;
  if (b[i] === MINUS || b[i] === PLUS) neg = b[i++] === MINUS;
  let v = 0;
  let digits = 0;
  while (i < end && isDigit(b[i])) {
    v = v * 10 + (b[i++] - ZERO);
    digits++;
  }
  if (b[i] === DOT) {
    i++;
    let scale = 0.1;
    while (i < end && isDigit(b[i])) {
      v += (b[i++] - ZERO) * scale;
      scale *= 0.1;
      digits++;
    }
  }
  if (!digits) return [NaN, i];
  if (b[i] === E_LOW || b[i] === E_UP) {
    i++;
    let eneg = false;
    if (b[i] === MINUS || b[i] === PLUS) eneg = b[i++] === MINUS;
    let e = 0;
    while (i < end && isDigit(b[i])) e = e * 10 + (b[i++] - ZERO);
    v *= 10 ** (eneg ? -e : e);
  }
  return [neg ? -v : v, i];
}

/** The vertex number of one face corner (`7`, `7/2`, `7//3`, `7/2/3`), 1-based or negative (counted back from the last vertex), as a 0-based index; -1 when there is none or it is out of range. */
function corner(b: Uint8Array, i: number, end: number, nv: number): [number, number] {
  while (i < end && isBlank(b[i])) i++;
  const [raw, after] = readNumber(b, i, end);
  let j = after;
  while (j < end && !isBlank(b[j])) j++; // skip /vt/vn
  const idx = raw < 0 ? nv + raw : raw - 1;
  return [Number.isInteger(idx) && idx >= 0 && idx < nv ? idx : -1, j];
}

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));
const names = new TextDecoder();

/**
 * Parse an OBJ. `yieldToUi` is awaited about every SLICE_MS milliseconds (default: a macrotask turn). Unknown lines (vt, vn, usemtl, ...) are skipped; a face
 * that names a vertex that does not exist is dropped whole, so a damaged file cannot make an out-of-range read later. Throws when there is no triangle at all
 * or the file has more than MAX_OBJ_VERTICES vertices.
 */
export async function parseObj(b: Uint8Array, yieldToUi: () => Promise<void> = nextTick, now: () => number = () => performance.now()): Promise<ObjModel> {
  const pos = new Grow((n) => new Float32Array(n), 3 * 4096);
  const tris = new Grow((n) => new Uint32Array(n), 3 * 4096);
  const meshes: ObjMesh[] = [];
  const face: number[] = [];
  let nv = 0;
  let sliceStart = now();
  let lines = 0;
  let i = 0;
  const n = b.length;
  while (i < n) {
    let end = i;
    while (end < n && b[end] !== NL) end++;
    const c0 = b[i];
    const c1 = b[i + 1];
    if (c0 === V && isBlank(c1)) {
      const [x, a] = readNumber(b, i + 1, end);
      const [y, c] = readNumber(b, a, end);
      const [z] = readNumber(b, c, end);
      if (Number.isNaN(x + y + z)) throw new Error("A point in the city model is not a number.");
      if (++nv > MAX_OBJ_VERTICES) throw new Error("The city model has too many points to load. Make it with fewer tiles.");
      pos.push(x);
      pos.push(y);
      pos.push(z);
    } else if (c0 === O && isBlank(c1)) {
      const open = meshes[meshes.length - 1];
      if (open) open.end = tris.length;
      let s = i + 1;
      while (s < end && isBlank(b[s])) s++;
      let e = end;
      while (e > s && isBlank(b[e - 1])) e--;
      meshes.push({ name: names.decode(b.subarray(s, e)), start: tris.length, end: tris.length });
    } else if (c0 === F && isBlank(c1)) {
      face.length = 0;
      let at = i + 1;
      for (;;) {
        while (at < end && isBlank(b[at])) at++;
        if (at >= end) break;
        const [idx, next] = corner(b, at, end, nv);
        if (idx < 0) {
          face.length = 0;
          break;
        }
        face.push(idx);
        at = next;
      }
      if (face.length >= 3) {
        if (!meshes.length) meshes.push({ name: "", start: tris.length, end: tris.length });
        for (let k = 1; k + 1 < face.length; k++) {
          tris.push(face[0]);
          tris.push(face[k]);
          tris.push(face[k + 1]);
        }
      }
    }
    i = end + 1;
    if (++lines % LINES_PER_CHECK === 0 && now() - sliceStart > SLICE_MS) {
      await yieldToUi();
      sliceStart = now();
    }
  }
  const last = meshes[meshes.length - 1];
  if (last) last.end = tris.length;
  if (!tris.length) throw new Error("There is no building or road in that city model.");
  return { pos: pos.done(), tris: tris.done(), meshes };
}
