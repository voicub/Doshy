import { BACKUP_URL, ApiError, NetError, importBackup } from "./dbApi";
import { flushNow, discardLocalAndReload } from "./dbClient";
import { DEVICE_KEYS, MAX_HEADER, MAGIC, encodeHead, fileName, parseHead, type Header } from "./everything";
import { TRANSFER_TIMEOUT_MS, within } from "./requestTimeout";

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Everything in one file: waits for pending saves to reach the server, downloads the database backup and adds this device's settings in front of it. */
export async function buildEverything(): Promise<{ blob: Blob; name: string }> {
  await flushNow().catch(() => undefined); // what is still waiting in this browser goes to the server first
  let res: Response;
  try {
    res = await fetch(BACKUP_URL, { cache: "no-store", signal: within(TRANSFER_TIMEOUT_MS) });
  } catch {
    throw new NetError();
  }
  if (!res.ok) throw new ApiError(502, "backup_failed", "The server could not make the backup. Try again in a moment.");
  const db = await res.blob();
  const device = Object.fromEntries(DEVICE_KEYS.map((k) => [k, read(k)]));
  const head = encodeHead(Date.now(), db.size, device);
  return { blob: new Blob([head as BlobPart, db], { type: "application/octet-stream" }), name: fileName() };
}

/** Saves the blob like a download. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type Opened = { ok: true; header: Header; db: Blob } | { ok: false; error: string };

/** Checks a picked file without changing anything. */
export async function openEverything(file: File): Promise<Opened> {
  const head = new Uint8Array(await file.slice(0, MAGIC.length + 4 + MAX_HEADER).arrayBuffer());
  const p = parseHead(head, file.size);
  return p.ok ? { ok: true, header: p.header, db: file.slice(p.dbStart) } : p;
}

/** Replaces everything with the file: the server database (it checks it and keeps a safety copy), then this device's settings, then a reload. */
export async function importEverything(o: Extract<Opened, { ok: true }>): Promise<void> {
  await importBackup(o.db);
  for (const [k, v] of Object.entries(o.header.device)) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the settings of this device just stay as they are */
    }
  }
  discardLocalAndReload();
}
