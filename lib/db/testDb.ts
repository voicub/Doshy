import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "./connection.ts";

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
