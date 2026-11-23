# Database

Doshy keeps its settings, plan and imported files in one SQLite file, `data/housey.db` (override with `HOUSEY_DB_PATH`; git-ignored). It uses Node's built-in `node:sqlite` (`DatabaseSync`): no native or npm dependency. Server code lives in `lib/db/`, the HTTP routes in `app/api/db/`, the browser side in `lib/dbClient.ts` (sync engine and zustand storage adapter), `lib/dbApi.ts` (typed calls), `lib/dbMerge.ts` (pure sync decisions) and `lib/modelStore.ts` (3D model files).

The routes have no sign-in, like `/api/ha/*`: run the dashboard on a trusted network or behind a reverse proxy that does the sign-in. They accept only same-origin browser requests (`Sec-Fetch-Site` / `Origin` against `Host` or `X-Forwarded-Host`), refuse unexpected content types, cap body sizes, limit writes to 300 a minute (backup import 3 a minute) and never put paths, SQL or stack traces in an error reply.

## Connection

- One module-level connection, cached on `globalThis` (Next dev re-evaluates modules on hot reload).
- WAL, `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`; prepared statements are cached per connection (`lib/db/sql.ts`); writes use `BEGIN IMMEDIATE`.
- Start-up runs `PRAGMA quick_check(1)` (walks every b-tree page and stops at the first problem; about 22 ms for a 50 MB file, so it is not deferred). A file that is not a database, or fails the check, is moved to `housey.db.corrupt-<time>` (with its `-wal` / `-shm`) and a new one starts. Other failures (busy, read-only disk, a schema from a newer build) leave the file alone and the routes answer 503; the dashboard keeps working from the browser's copy.
- A daily backup (`VACUUM INTO`, once per UTC day, only when the server has been idle for 10 s) goes to `backups/housey-YYYY-MM-DD.db` next to the database; the newest 7 are kept. A safety copy `housey-before-import-<ms>.db` (newest 3 kept) is made before a backup import. `VACUUM INTO` is synchronous: it holds the server's event loop for about 150 ms per 27 MB of data (every other request waits), which is why the daily one waits for a quiet moment. The timers are `unref`'d and live on the connection's `globalThis` slot, so a hot reload never starts a second set.

## Schema (`PRAGMA user_version`, forward-only migrations in `lib/db/migrations.ts`)

Each migration runs in its own transaction together with its version bump. Never edit a shipped migration: add one.

| table | purpose |
|---|---|
| `meta(key, value)` | `app = housey`, `created_at` |
| `settings(key, value JSON, updated_at)` | one row per setting group; key `^[a-z0-9._-]{1,64}$`, value at most 256 KB. Keys in use: `housey-plan` (view, time, cut-away, environment, opening defaults, active level, level view), `housey-sky`, `housey-paint`, `housey-declutter`, `housey-live-layer`, `housey-recent`, `housey-custom` (favourites), `housey-car-models`, and `curtain-automation` (the dawn rule's memory, written by the server itself) |
| `plans(id, name, json, bytes, version, format, created_at, updated_at, active, manual, summary)` | the working plan (`active = 1`, one row, `version` = revision counter, `format` = the client's persist version, i.e. the starter-plan generation) and its saved versions (`active = 0`; `manual = 1` for "Save version now"). `summary` is `{ items, walls, rooms }` as JSON, kept beside the plan so the versions list never has to read the plan text |
| `blobs(hash, size, data)` | file contents, once per SHA-256 |
| `resources(id, kind, name, mime, hash, meta, created_at)` | `kind` is `model`, `piece` or `image`; several resources can share one blob |
| `events(id, title, description, location, all_day, start_at, end_at, start_ms, end_ms, created_at)` | the dashboard's own calendar (used when Home Assistant has none); index on `start_ms`; at most 5000 events |

The only departure from "one table with a data column" is `blobs`: model ids are chosen by the browser (`m_<uid>`), so the same file under two ids is stored once by sharing the blob.

## API

All routes: Node runtime, `dynamic = "force-dynamic"`, JSON replies `Cache-Control: no-store`, errors `{ error, code }`.

| route | |
|---|---|
| `GET /api/db/settings` | `{ settings: { key: { value, updatedAt } } }` in one query |
| `PUT /api/db/settings` | `{ settings: { key: value } }`, 1 to 64 keys, all or nothing |
| `GET /api/db/plan[?since=rev]` | `{ rev, updatedAt, format, plan }`, `{ rev: 0, plan: null }`, or `{ rev, unchanged: true }` |
| `PUT /api/db/plan` | `{ plan, baseRev, format, overwrite? }` (5 MB). 200 `{ rev, updatedAt, changed }`; **409** `{ code: "conflict", server: { rev, updatedAt, format, plan } }` when `baseRev` is not the latest (nothing written) |
| `GET /api/db/plan/versions` | `{ versions: [{ id, label, manual, rev, savedAt, changedAt, bytes, summary }] }` |
| `POST /api/db/plan/versions` | `{ label? }` saves the working plan as a named version |
| `POST /api/db/plan/restore` | `{ id }`: the version becomes the working plan; the replaced plan is kept as "Before restore" |
| `GET /api/db/resources[?kind=&inline=1]` | `{ resources, totals }` without contents; `inline=1` (JSON resources only) adds each piece as `json` |
| `POST /api/db/resources?id=&kind=&name=&meta=` | body is the file, sent with its own type; 25 MB per file, 500 MB in total, type checked per kind |
| `GET /api/db/resources/<id>[?h=<sha256>]` | the file with its stored type. With the matching `h`: `Cache-Control: private, max-age=31536000, immutable`; without: `no-cache` + `ETag`. A revalidation that matches answers 304 from the resource's hash alone (the file is not read); a download hands the bytes to the socket as one chunk, without the extra copy `new Response(bytes)` makes |
| `DELETE /api/db/resources/<id>` | |
| `GET /api/db/info` | sizes, counts, last save, last backup (for the Data panel) |
| `GET /api/db/backup` | a consistent copy of the whole database (`.db`) |
| `POST /api/db/backup` | raw `.db` body: checked (healthy SQLite, our tables, `meta.app`, not from a newer build), safety copy made, then swapped in |
| `GET /api/db/events?start=&end=` / `POST /api/db/events` / `DELETE /api/db/events/<id>` | the dashboard's own calendar, in Home Assistant's event shape |
| `GET /api/automation/curtains` | what the dawn rule last did per curtain (see `docs/curtains.md`) |

### Versions

A change to the working plan first keeps the plan it replaces as an automatic version, at most one per 5 minutes and never a copy of the newest version, so an editing session leaves "the plan as it was before" behind. The newest 30 automatic and, separately, the newest 30 saved versions are kept. Restoring, and "Keep mine" after a conflict, always keep what they replace.

## Browser sync (`lib/dbClient.ts`)

`dbStorage(name, kind, version)` is the `StateStorage` behind `createJSONStorage` for each persisted zustand store (`lib/store.ts`, `lib/sky.ts`, `lib/customStore.ts`, `lib/paintStore.ts`, `lib/liveLayer.ts`, `components/scene/declutterState.ts`, `components/scene/edit/editStore.ts`). Kinds: `settings` (one row), `plan` (the plan in `plans`, the rest as settings) and `pieces` (each custom piece a `piece` resource, the rest as settings).

- **Reads** come from localStorage, synchronously: first paint never waits for the network.
- **Writes** go to localStorage at once and to the server after 800 ms of quiet (a store that writes the same text again costs nothing). The page being hidden sends what is pending with `fetch(..., { keepalive: true })` when it fits in 60 KB; larger changes wait in localStorage and go at the next start. A "dirty" mark per store survives reloads.
- **Start** (once, after every store has registered): one `GET` each for settings, plan and pieces; then per store `lib/dbMerge.ts` decides. Server empty and device has data: upload (the one-time migration; the local copy stays). Device has nothing or is simply behind: take the server's, write it to localStorage and `rehydrate()` the store. Device has unsaved edits on the latest revision: send them. Both changed, or the device has a plan it never synced that differs from the server's: the toast asks (Load / Keep mine; Load keeps this device's copy once under `housey-plan-before-load`).
- **Polling**: every 15 s while the tab is visible, `GET /api/db/plan?since=rev`; a newer plan is applied only when there is nothing unsaved and no save in flight, otherwise the toast appears.
- **Offline**: network errors, 5xx and 429 retry after 1, 2, 4 ... 30 s, and also when the browser reports `online`, on the next edit and on the next poll. The corner shows "Offline, will sync". A 4xx (too big, refused) shows "Not saved" with the reason and is retried at the next edit.
- **3D models** (`lib/modelStore.ts`): IndexedDB is a read-through copy. `putModel` keeps the model locally and uploads it (a refusal such as "too big" is thrown with a readable message and nothing is kept; offline it is queued and uploaded later); `getModel` falls back to the server and copies the file down; models that only exist in IndexedDB and are used by a custom piece are uploaded once at start.

## Tests

`npm test` runs `lib/db/*.test.ts` (migrations, corruption recovery, version throttling and pruning, conflicts, two writers on separate connections in worker threads, resource dedupe and limits, settings allowlist, request guards, backups) and `lib/dbMerge.test.ts` (the sync decisions), all on temp database files.

## Plans are never lost to a sync decision

- **Rotating stash** (`lib/planStash.ts`): before anything replaces the plan in localStorage (loading the server's version, a restore from the Data panel, a backup import, taking the server's plan at start, adopting another device's change) the plan now there is copied to `housey-plan-before-load-1..10` (newest 10; time, reason and item / wall / room counts in `housey-plan-stash-index`). `housey-plan-before-load` (the older single slot) is copied into the stash once and is never written, moved or deleted. When storage is full the oldest entries give way, never the newest.
- **Mirrored to the server**: a stashed plan that mattered (Load, backup import, the older slot, a restore) is also sent as a saved version "This device, before loading 18:10" (`POST /api/db/plan/versions` with `{ label, plan, format }`; the working plan is untouched), so any device can restore it. If the server is down it is sent later.
- **Banner**: "We kept your previous plan from ...: Restore it / Not now" shows from localStorage alone (no server needed) while a stashed plan that differs from the plan on screen has not been dealt with.
- **Two versions of your plan**: when this device and the server differ and neither is the untouched starter, the choice shows both sides (items, walls, rooms, when) with **Keep this device's version** as the primary button; **Load the server's version...** needs a second confirm and says the device's plan is stored first. A device that never synced and has its own plan is never silently replaced: it is kept when the server only has the untouched starter (the server's plan stays as a version), and the user decides otherwise.
- **Tests never touch the real database**: in development a request with `X-Housey-Test: <8-32 chars a-z0-9>` is served from a throwaway database in the temp folder (`getTestDb`); it is ignored in production and cannot import backups.
