import type { DatabaseSync } from "node:sqlite";

/**
 * Forward-only schema migrations, applied in order. `PRAGMA user_version` is the number of migrations already applied.
 * NEVER edit a migration that has shipped: add a new one at the end.
 */
type Migration = (db: DatabaseSync) => void;

export const MIGRATIONS: Migration[] = [
  // 1: everything the dashboard keeps
  (db) =>
    db.exec(`
      -- schema / app info
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta (key, value) VALUES ('app', 'housey'), ('created_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      -- dashboard settings: one JSON value per key
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

      -- the working plan (active = 1, at most one) and its saved versions (active = 0). version = revision counter.
      CREATE TABLE plans (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        json TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL,
        format INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        manual INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX plans_one_working ON plans (active) WHERE active = 1;

      -- file contents, stored once per content hash (sha-256)
      CREATE TABLE blobs (hash TEXT PRIMARY KEY, size INTEGER NOT NULL, data BLOB NOT NULL);

      -- imported 3D models, custom pieces and images; several can share one blob
      CREATE TABLE resources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        hash TEXT NOT NULL REFERENCES blobs (hash),
        meta TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX resources_kind ON resources (kind, created_at);
      CREATE INDEX resources_hash ON resources (hash);
    `),
  // 2: what a plan holds (item, wall and room counts) next to it, so versions can be shown with previews without reading megabytes of JSON
  (db) =>
    db.exec(`
      ALTER TABLE plans ADD COLUMN summary TEXT NOT NULL DEFAULT '';
      UPDATE plans SET summary = json_object(
        'items', json_array_length(json_extract(json, '$.items')),
        'walls', json_array_length(json_extract(json, '$.walls')),
        'rooms', json_array_length(json_extract(json, '$.rooms'))
      ) WHERE json_valid(json) AND json_type(json) = 'object';
    `),
  // 3: the dashboard's own calendar (used when Home Assistant has no calendar). All-day events keep their dates in start_at/end_at (end exclusive) and UTC midnights in start_ms/end_ms; timed ones keep instants.
  (db) =>
    db.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        all_day INTEGER NOT NULL DEFAULT 0,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX events_start ON events (start_ms);
    `),
  // 4: several plans ("dashboards"). Today's single plan becomes dashboard 1 'Home' (its working row, versions and settings row move with it, byte for byte: only
  // the owner column and the settings key change). `dashboard_id` stays nullable because SQLite cannot add a NOT NULL reference column; the code treats NULL as corrupt.
  (db) =>
    db.exec(`
      CREATE TABLE dashboards (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        thumb BLOB,
        thumb_rev INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE UNIQUE INDEX dashboards_name ON dashboards (lower(name)) WHERE deleted_at IS NULL;
      -- dated from the plan it takes over (the manager shows "updated"), or from now when the database has none
      INSERT INTO dashboards (id, name, icon, created_at, updated_at)
        SELECT 1, 'Home', 'house', COALESCE(MIN(created_at), strftime('%s', 'now') * 1000), COALESCE(MIN(created_at), strftime('%s', 'now') * 1000) FROM plans;

      ALTER TABLE plans ADD COLUMN dashboard_id INTEGER REFERENCES dashboards (id);
      UPDATE plans SET dashboard_id = 1;
      DROP INDEX plans_one_working;
      CREATE UNIQUE INDEX plans_one_working ON plans (dashboard_id) WHERE active = 1;
      CREATE INDEX plans_versions ON plans (dashboard_id, active, manual, id);

      INSERT INTO meta (key, value) VALUES ('default_dashboard', '1');
      UPDATE settings SET key = 'housey-plan.1' WHERE key = 'housey-plan';
    `),
  // 5: read-only guest links ("Share a read-only link", docs/sharing.md). Only a SHA-256 of the link's token is stored (the link itself is shown once, when it is made) and the
  // PIN only as a salted scrypt hash. `expires_at` null = never; `live` and `location` are the owner's two opt-ins (read-only live states, real home location). Revoking a link
  // deletes its row; deleting a plan for good takes its links with it.
  (db) =>
    db.exec(`
      CREATE TABLE guest_links (
        id TEXT PRIMARY KEY,
        dashboard_id INTEGER NOT NULL REFERENCES dashboards (id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        pin_hash TEXT,
        pin_salt TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        last_used_at INTEGER,
        label TEXT NOT NULL DEFAULT '',
        live INTEGER NOT NULL DEFAULT 0,
        location INTEGER NOT NULL DEFAULT 0,
        CHECK ((pin_hash IS NULL) = (pin_salt IS NULL))
      );
      CREATE INDEX guest_links_plan ON guest_links (dashboard_id, created_at);
    `),
  // 6: several Home Assistants ("homes", docs/multi-home.md). Each extra home is one row; the one from the server's environment is never stored ('main'). The token is
  // kept only as AES-256-GCM ciphertext (`token_enc`) and its key is NOT in this file, so a copy of the database holds no usable token; `token_hint` is its last 4 characters
  // for the screen. A plan names the home it shows in `dashboards.ha_connection` (NULL = the main home); deleting a home sends its plans back to the main home by itself.
  (db) =>
    db.exec(`
      CREATE TABLE ha_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        token_enc TEXT NOT NULL,
        token_hint TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        last_ok_at INTEGER,
        last_error TEXT,
        sort INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX ha_connections_name ON ha_connections (lower(name));
      ALTER TABLE dashboards ADD COLUMN ha_connection TEXT REFERENCES ha_connections (id) ON DELETE SET NULL;
    `),
];

/** Tables a Doshy database must have (used to recognise a backup file). */
export const REQUIRED_TABLES = ["meta", "settings", "plans", "blobs", "resources"];

export function userVersion(db: DatabaseSync): number {
  return Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
}

/**
 * Bring the database up to date. Each migration runs in its own transaction together with its version bump, so a failure leaves the
 * database exactly at the previous version. A database from a NEWER build is refused (never downgraded or touched).
 */
export function migrate(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): number {
  for (;;) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const v = userVersion(db); // read inside the lock: another process may have just migrated
      if (v > migrations.length) throw new Error(`database schema ${v} is newer than this build (${migrations.length})`);
      if (v === migrations.length) {
        db.exec("COMMIT");
        return v;
      }
      migrations[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw e;
    }
  }
}
