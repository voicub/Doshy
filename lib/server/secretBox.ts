// Encrypts the Home Assistant tokens kept in the database (docs/multi-home.md). AES-256-GCM with a random key that lives in a file NEXT TO the
// database, never inside it: a copy of the .db (a backup, a "Download everything" file, a throwaway test database) then holds only ciphertext.
// Losing or replacing the key file makes every stored token unreadable, which the rest of the app treats as "enter this token again", never as a crash.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { TEST_DB_PREFIX } from "../db/connection.ts";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = "v1.";

/** A token sealed for storage: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".")}`;
}

/** The text sealed by `seal`, or null for anything else: a wrong key, a damaged value, text that was never sealed. Never throws. */
export function open(key: Buffer, sealed: string): string | null {
  try {
    if (!sealed.startsWith(PREFIX)) return null;
    const [iv, tag, data] = sealed.slice(PREFIX.length).split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !data || iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null; // GCM refuses a wrong key or a changed byte
  }
}

/**
 * Where the key of this database lives: `doshy.key` beside the database (so a Docker volume or the add-on's /data keeps both together), except for a
 * throwaway test database (they share the temp folder), which gets `<file>.key` so a test never touches or shares a real key.
 */
export function keyFileFor(db: DatabaseSync): string {
  const file = String(db.prepare("PRAGMA database_list").all().find((r) => r.name === "main")?.file ?? "");
  if (!file) throw new Error("the database has no file to keep a key beside");
  return basename(file).startsWith(TEST_DB_PREFIX) ? `${file}.key` : join(dirname(file), "doshy.key");
}

// One read per process and file: the key is needed on every request that talks to an extra home.
const g = globalThis as typeof globalThis & { __doshyKeys?: Map<string, Buffer> };
const keys = (g.__doshyKeys ??= new Map<string, Buffer>());

/** The key in `file`, made (random, mode 0600) when there is none yet. A file that is not a valid key is kept aside as `<file>.bad-<time>` and replaced: its tokens could not be read anyway. */
export function loadKey(file: string): Buffer {
  const cached = keys.get(file);
  if (cached) return cached;
  let key: Buffer | null = null;
  try {
    const read = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
    if (read.length === KEY_BYTES) key = read;
    else renameSync(file, `${file}.bad-${Date.now()}`);
  } catch {
    /* no file yet (or one that could not be moved: a new key is tried below) */
  }
  if (!key) {
    key = randomBytes(KEY_BYTES);
    try {
      writeFileSync(file, `${key.toString("hex")}\n`, { mode: 0o600, flag: "wx" });
    } catch {
      // another request made it between our read and write: use theirs
      key = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
      if (key.length !== KEY_BYTES) throw new Error("the key file cannot be used");
    }
    chmodSync(file, 0o600); // `mode` is cut by the umask on creation
  }
  keys.set(file, key);
  return key;
}

/** For tests and after a database swap: forget what was read, so the file is read again. */
export const forgetKeys = (): void => keys.clear();
