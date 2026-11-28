import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "./connection.ts";
import { MIGRATIONS, migrate } from "./migrations.ts";

/** A throwaway database in its own temp folder, for tests. Call `cleanup()` when done. */
export function tempDb(): { db: DatabaseSync; file: string; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "housey-db-test-"));
  const file = join(dir, "housey.db");
  const db = openDb(file);
  return {
    db,
    file,
    dir,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A plan JSON the server accepts, with a marker so tests can tell plans apart. */
export const planJson = (marker: string | number) => JSON.stringify({ walls: [], openings: [], rooms: [], items: [], marker });

export type V3Fixture = { file: string; dir: string; planJson: string; rev: number; versions: number; cleanup: () => void };

/**
 * A database file exactly as the build before multi-plan left it (schema 3): one working plan at revision `rev` with 109 items, `versions` saved
 * versions, the single `housey-plan` settings row and a couple of unrelated rows. Closed again, so a test can open it with the current code.
 */
export function v3Fixture(rev = 414, versions = 5): V3Fixture {
  const dir = mkdtempSync(join(tmpdir(), "housey-v3-test-"));
  const file = join(dir, "housey.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db, MIGRATIONS.slice(0, 3));
  const items = Array.from({ length: 109 }, (_, i) => ({ id: `i${i}`, kind: "box", x: i, y: i * 2, rot: 0, w: 1, d: 1, h: 1, note: "é \u2028 \"q\"" }));
  const json = JSON.stringify({ walls: [{ id: "w" }], openings: [], rooms: [{ id: "r" }], items, marker: "home" });
  const summary = JSON.stringify({ items: 109, walls: 1, rooms: 1 });
  const ins = db.prepare("INSERT INTO plans (name, json, bytes, version, format, created_at, updated_at, active, manual, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (let v = 0; v < versions; v++) ins.run(v % 2 ? "Saved version" : "", json.replace("home", `old${v}`), Buffer.byteLength(json) + 1, rev - 10 + v, 15, 1000 + v, 1000 + v, 0, v % 2, summary);
  ins.run("Working plan", json, Buffer.byteLength(json), rev, 15, 500, 9000, 1, 0, summary);
  const set = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  set.run("housey-plan", JSON.stringify({ state: { time: 12, activeLevel: "ground" }, version: 15 }), 7000);
  set.run("housey-sky", JSON.stringify({ state: { timeMode: "manual" }, version: 3 }), 7001);
  db.close();
  return { file, dir, planJson: json, rev, versions, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
