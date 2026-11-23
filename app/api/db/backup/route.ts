import { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { checkBackupFile, snapshotTo } from "@/lib/db/backup";
import { dbFile, getDb, replaceDatabase } from "@/lib/db/connection";
import { HttpError } from "@/lib/db/errors";
import { api, contentType, reply } from "@/lib/db/http";
import { dbInfo } from "@/lib/db/info";
import { MAX_TOTAL_BYTES } from "@/lib/db/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMPORT_BYTES = MAX_TOTAL_BYTES + 256 * 1024 * 1024; // everything the database may hold, plus its plans and versions

/** A consistent copy of the whole database as one file (made with VACUUM INTO, so it is safe while the dashboard is saving). */
export function GET(req: Request) {
  return api(req, {}, (db) => {
    const dir = mkdtempSync(join(tmpdir(), "housey-backup-"));
    const copy = join(dir, "housey.db");
    try {
      snapshotTo(db, copy);
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    const size = statSync(copy).size;
    const file = createReadStream(copy);
    file.on("close", () => rmSync(dir, { recursive: true, force: true }));
    const day = new Date().toISOString().slice(0, 10);
    // Node's and the DOM's stream types do not unify; it is a plain byte stream either way
    return new Response(Readable.toWeb(file) as unknown as ReadableStream, {
      headers: { "content-type": "application/vnd.sqlite3", "content-length": String(size), "content-disposition": `attachment; filename="doshy-${day}.db"`, "cache-control": "no-store" },
    });
  });
}

/**
 * Replace everything with a backup file (the raw bytes of a .db file). The file is checked first: it must be a healthy SQLite file with
 * Doshy's tables from this or an older build. The current data is kept as a safety copy in the backups folder before it is replaced.
 */
export function POST(req: Request) {
  return api(req, { write: true, heavy: true }, async () => {
    if (req.headers.has("x-housey-test")) throw new HttpError(400, "bad_request", "A backup cannot be imported into a test database."); // the swap works on the real file
    contentType(req, ["application/vnd.sqlite3", "application/octet-stream"]);
    if (!req.body) throw new HttpError(400, "empty", "The file is empty.");
    const upload = join(dirname(dbFile()), `import-${Date.now()}.tmp`);
    let seen = 0;
    const count = new Transform({
      transform(chunk: Buffer, _enc, done) {
        seen += chunk.length;
        done(seen > MAX_IMPORT_BYTES ? new HttpError(413, "too_big", "That backup is too large.") : null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(req.body as unknown as NodeWebStream), count, createWriteStream(upload));
      checkBackupFile(upload);
      replaceDatabase(upload);
    } catch (e) {
      rmSync(upload, { force: true });
      throw e;
    }
    return reply(dbInfo(getDb())); // the old connection was closed by the swap
  });
}
