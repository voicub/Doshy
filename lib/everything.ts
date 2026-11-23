// "Export everything": ONE file (.housey) holding the server database backup (plan, versions, settings, custom pieces, 3D models, calendar events, automation memory)
// and this device's own settings (display, graphics, calendar view...). Layout: 10 bytes magic, 4 bytes big-endian header length, the JSON header, then the raw database bytes.
// No base64 and no dependency: the browser concatenates Blobs. Pure; the node test runner loads this file directly.
import { isRecord } from "./guards.ts";

export const MAGIC = "HOUSEYALL1";
export const FILE_EXT = ".housey";
export const MAX_HEADER = 256 * 1024;
const MAX_DEVICE_VALUE = 64 * 1024;

/** The settings that live only in this browser (everything else is in the database). Anything else is ignored on import. */
export const DEVICE_KEYS = [
  "housey-layout",
  "housey-display",
  "housey-quality",
  "housey-calendar-card",
  "housey-calendar-hidden",
  "housey-calendar-view",
  "housey-recent-entities",
  "housey-inbox-seen",
] as const;

export type Header = { format: 1; app: "housey"; createdAt: number; dbBytes: number; device: Record<string, string> };

const te = new TextEncoder();
const td = new TextDecoder("utf-8", { fatal: true });

/** The bytes in front of the database. */
export function encodeHead(createdAt: number, dbBytes: number, device: Record<string, string | null | undefined>): Uint8Array {
  const clean: Record<string, string> = {};
  for (const k of DEVICE_KEYS) {
    const v = device[k];
    if (typeof v === "string" && v.length <= MAX_DEVICE_VALUE) clean[k] = v;
  }
  const header: Header = { format: 1, app: "housey", createdAt, dbBytes, device: clean };
  const json = te.encode(JSON.stringify(header));
  const out = new Uint8Array(MAGIC.length + 4 + json.length);
  out.set(te.encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(MAGIC.length, json.length);
  out.set(json, MAGIC.length + 4);
  return out;
}

type Parsed = { ok: true; header: Header; dbStart: number } | { ok: false; error: string };

/** Reads the start of a file (at least the first MAX_HEADER + 14 bytes). Never trusts a length it has not checked. */
export function parseHead(bytes: Uint8Array, fileSize: number): Parsed {
  const bad = (error: string): Parsed => ({ ok: false, error });
  if (bytes.length < MAGIC.length + 4 || td.decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) return bad("This is not a Doshy export file.");
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(MAGIC.length);
  if (len < 2 || len > MAX_HEADER || MAGIC.length + 4 + len > bytes.length) return bad("This export file is damaged.");
  let raw: unknown;
  try {
    raw = JSON.parse(td.decode(bytes.subarray(MAGIC.length + 4, MAGIC.length + 4 + len)));
  } catch {
    return bad("This export file is damaged.");
  }
  if (!isRecord(raw)) return bad("This export file is damaged.");
  const r = raw;
  if (r.app !== "housey") return bad("This is not a Doshy export file.");
  if (r.format !== 1) return bad("This export was made by a newer version of Doshy. Update the app first.");
  const dbBytes = r.dbBytes;
  const dbStart = MAGIC.length + 4 + len;
  if (typeof dbBytes !== "number" || !Number.isInteger(dbBytes) || dbBytes < 1 || dbStart + dbBytes !== fileSize) return bad("This export file is incomplete. Download it again.");
  const device: Record<string, string> = {};
  if (isRecord(r.device)) {
    for (const k of DEVICE_KEYS) {
      const v = r.device[k];
      if (typeof v === "string" && v.length <= MAX_DEVICE_VALUE) device[k] = v;
    }
  }
  const createdAt = typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : 0;
  return { ok: true, header: { format: 1, app: "housey", createdAt, dbBytes, device }, dbStart };
}

/** "doshy-everything-2026-11-22.housey" (local date). */
export function fileName(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `doshy-everything-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${FILE_EXT}`;
}
