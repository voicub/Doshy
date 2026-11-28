// One Poly Haven PBR texture as ONE file (a resource of kind "material"): the colour, roughness and normal pictures (1k JPEGs, taken as they are, never re-encoded)
// behind a small JSON header. One file means one resource id in the plan, one row in the database, one entry in a plan export and one cache entry on the
// server, instead of three loose pictures that could get separated. Layout: "DMAT", the header's byte length (u32 little endian), the header (UTF-8 JSON),
// then the pictures back to back. Pure; the node test runner loads it directly (.ts imports).
import { isRecord } from "./guards.ts";
import { sniffImage } from "./siteTiles.ts";

export const MATERIAL_MAGIC = "DMAT";
export const MATERIAL_VERSION = 1;
const MAX_HEADER_BYTES = 4096;

export type MapName = "diff" | "rough" | "nor";
const MAP_NAMES: readonly MapName[] = ["diff", "rough", "nor"];

/** Where a picture sits in the file, relative to the end of the header. */
type Span = { off: number; len: number };

/** What the header says about the material: its Poly Haven id and name, who made it, and how wide one repeat is in real life. */
export type MaterialInfo = {
  /** Poly Haven's asset id (a-z, 0-9, `_`, `-`): lets the owner find it again, and is the credit's link. */
  asset: string;
  name: string;
  authors: string[];
  /** Real width in metres one repeat of the picture covers (from Poly Haven's size in millimetres); undefined when they give none. */
  scaleM?: number;
};

export type MaterialMaps = Partial<Record<MapName, Uint8Array>> & { diff: Uint8Array };

const enc = new TextEncoder();

/** The file's bytes. The pictures are checked to be JPEGs (by their first bytes) and the whole must stay within `maxBytes`; throws a plain sentence otherwise. */
export function packMaterial(info: MaterialInfo, maps: MaterialMaps, maxBytes: number): Uint8Array {
  const spans: Partial<Record<MapName, Span>> = {};
  let at = 0;
  for (const name of MAP_NAMES) {
    const data = maps[name];
    if (!data) continue;
    if (sniffImage(data) !== "image/jpeg") throw new Error("A texture picture is not a JPEG.");
    spans[name] = { off: at, len: data.length };
    at += data.length;
  }
  const header = enc.encode(JSON.stringify({ v: MATERIAL_VERSION, ...info, maps: spans }));
  if (header.length > MAX_HEADER_BYTES) throw new Error("The texture's details are too long.");
  const out = new Uint8Array(8 + header.length + at);
  out.set(enc.encode(MATERIAL_MAGIC), 0);
  new DataView(out.buffer).setUint32(4, header.length, true);
  out.set(header, 8);
  for (const name of MAP_NAMES) {
    const data = maps[name];
    const span = spans[name];
    if (data && span) out.set(data, 8 + header.length + span.off);
  }
  if (out.length > maxBytes) throw new Error("This texture is too big to keep.");
  return out;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>`"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A material file taken apart: the details and the pictures as views into `bytes` (no copy). null when it is not a material file, is cut short, or holds something that is not a JPEG. */
export function readMaterial(bytes: Uint8Array): { info: MaterialInfo; maps: MaterialMaps } | null {
  if (bytes.length < 12 || new TextDecoder("latin1").decode(bytes.subarray(0, 4)) !== MATERIAL_MAGIC) return null;
  const hLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (hLen < 2 || hLen > MAX_HEADER_BYTES || 8 + hLen > bytes.length) return null;
  let head: unknown;
  try {
    head = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(8, 8 + hLen)));
  } catch {
    return null;
  }
  if (!isRecord(head) || head.v !== MATERIAL_VERSION || !isRecord(head.maps)) return null;
  const base = 8 + hLen;
  const maps: Partial<Record<MapName, Uint8Array>> = {};
  for (const name of MAP_NAMES) {
    const span = head.maps[name];
    if (span === undefined) continue;
    if (!isRecord(span) || !Number.isInteger(span.off) || !Number.isInteger(span.len)) return null;
    const off = span.off as number;
    const len = span.len as number;
    if (off < 0 || len <= 0 || base + off + len > bytes.length) return null;
    const data = bytes.subarray(base + off, base + off + len);
    if (sniffImage(data) !== "image/jpeg") return null;
    maps[name] = data;
  }
  if (!maps.diff) return null;
  const asset = text(head.asset, 80);
  const scale = typeof head.scaleM === "number" && Number.isFinite(head.scaleM) && head.scaleM > 0 ? Math.min(100, head.scaleM) : undefined;
  const authors = Array.isArray(head.authors) ? head.authors.map((a) => text(a, 60)).filter(Boolean).slice(0, 6) : [];
  return { info: { asset, name: text(head.name, 80) || asset, authors, ...(scale ? { scaleM: scale } : {}) }, maps: { ...maps, diff: maps.diff } };
}
