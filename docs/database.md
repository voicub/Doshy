# Database

Doshy keeps its settings, plans and imported files in one SQLite file, `data/housey.db` (override with `HOUSEY_DB_PATH`; git-ignored). It uses Node's built-in `node:sqlite` (`DatabaseSync`): no native or npm dependency. Server code lives in `lib/db/`, the HTTP routes in `app/api/db/`, the browser side in `lib/dbClient.ts` (sync engine and zustand storage adapter), `lib/activePlan.ts` (the plan on screen, the list of plans and the actions on them), `lib/dbApi.ts` (typed calls), `lib/dbMerge.ts` (pure sync decisions) and `lib/modelStore.ts` (3D model files).

**Vocabulary.** The UI says **Plan**; code and API say **dashboard** (`dashboards`, `/api/db/dashboards`), because `Plan` is already the TypeScript type of the geometry document (`lib/types.ts`). A dashboard is one complete home design: its plan (walls, rooms, items, levels, site...), its saved versions, its own view settings (`housey-plan.<id>`) and its identity (name, icon, colour, description, thumbnail).

The routes have no sign-in, like `/api/ha/*`: run the dashboard on a trusted network or behind a reverse proxy that does the sign-in. They accept only same-origin browser requests (`Sec-Fetch-Site` / `Origin` against `Host` or `X-Forwarded-Host`), refuse unexpected content types, cap body sizes, limit writes to 300 a minute (backup import 3 a minute) and never put paths, SQL or stack traces in an error reply.

## Connection

- One module-level connection, cached on `globalThis` (Next dev re-evaluates modules on hot reload).
- WAL, `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`; prepared statements are cached per connection (`lib/db/sql.ts`); writes use `BEGIN IMMEDIATE`.
- Start-up runs `PRAGMA quick_check(1)` (walks every b-tree page and stops at the first problem; about 22 ms for a 50 MB file, so it is not deferred). A file that is not a database, or fails the check, is moved to `housey.db.corrupt-<time>` (with its `-wal` / `-shm`) and a new one starts. Other failures (busy, read-only disk, a schema from a newer build) leave the file alone and the routes answer 503; the dashboard keeps working from the browser's copy.
- A daily backup (`VACUUM INTO`, once per UTC day, only when the server has been idle for 10 s) goes to `backups/housey-YYYY-MM-DD.db` next to the database; the newest 7 are kept. Right after it, plans deleted more than 7 days ago are purged (`purgeDashboards`). A safety copy `housey-before-import-<ms>.db` (newest 3 kept) is made before a backup import, and **`housey-before-v<N>-<ms>.db` (newest 3 kept) right before a schema migration changes an existing database** (also for a connection that was opened before a hot reload added the migration; if the copy cannot be made the database is not migrated). `VACUUM INTO` is synchronous: it holds the server's event loop for about 150 ms per 27 MB of data (every other request waits), which is why the daily one waits for a quiet moment. The timers are `unref`'d and live on the connection's `globalThis` slot, so a hot reload never starts a second set.

## Schema (`PRAGMA user_version`, forward-only migrations in `lib/db/migrations.ts`)

Each migration runs in its own transaction together with its version bump. Never edit a shipped migration: add one.

| table | purpose |
|---|---|
| `meta(key, value)` | `app = housey`, `created_at`, `default_dashboard` (the home plan's id) |
| `settings(key, value JSON, updated_at)` | one row per setting group; key `^[a-z0-9._-]{1,64}$`, value at most 256 KB. Keys in use: `housey-plan.<id>` (one per plan: view, time, cut-away, environment, opening defaults, active level, level view; only for a plan that exists, and the bare `housey-plan` of the single-plan builds is refused), `housey-sky`, `housey-paint`, `housey-declutter`, `housey-live-layer`, `housey-ambient`, `housey-recent`, `housey-custom` (favourites), `housey-car-models`, `housey-plate-fits` (where the number plate goes on every car of a model, a few hundred bytes), and `curtain-automation` (the dawn rule's memory, written by the server itself) |
| `dashboards(id, name, icon, color, description, thumb, thumb_rev, sort, created_at, updated_at, deleted_at)` | one row per plan (at most 24). `name` is 1-60 characters and unique ignoring case among plans that are not deleted; `icon` `^[a-z0-9-]{1,32}$`; `color` `#rrggbb`; `thumb` a WebP of at most 64 KB, `thumb_rev` bumps with each upload; `deleted_at` is a soft delete (7 days to undo, then purged with the plan's rows and settings row) |
| `plans(id, name, json, bytes, version, format, created_at, updated_at, active, manual, summary, dashboard_id)` | per dashboard: the working plan (`active = 1`, one row, `version` = revision counter, `format` = the client's persist version, i.e. the starter-plan generation) and its saved versions (`active = 0`; `manual = 1` for "Save version now"). `summary` is `{ items, walls, rooms }` as JSON, kept beside the plan so lists never have to read the plan text. `dashboard_id` is nullable only because SQLite cannot add a NOT NULL reference column; a NULL is corrupt |
| `blobs(hash, size, data)` | file contents, once per SHA-256 |
| `resources(id, kind, name, mime, hash, meta, created_at)` | `kind` is `model`, `piece`, `image`, `city`, `floor-photo`, `hdri` (a Poly Haven `.hdr` sky) or `material` (a Poly Haven texture as one file); several resources can share one blob. See [polyhaven.md](polyhaven.md) |
| `ha_connections(id, name, base_url, token_enc, token_hint, created_at, last_ok_at, last_error, sort)` | extra Home Assistants ([multi-home.md](multi-home.md)). `token_enc` is AES-256-GCM ciphertext; the key lives in `doshy.key` beside the database, never in it. `dashboards.ha_connection` (nullable, `ON DELETE SET NULL`) names the home a plan shows; NULL = the main home from the environment. Migration 6 |
| `events(id, title, description, location, all_day, start_at, end_at, start_ms, end_ms, created_at)` | the dashboard's own calendar (used when Home Assistant has none); index on `start_ms`; at most 5000 events |

The only departure from "one table with a data column" is `blobs`: model ids are chosen by the browser (`m_<uid>`), so the same file under two ids is stored once by sharing the blob.

## API

All routes: Node runtime, `dynamic = "force-dynamic"`, JSON replies `Cache-Control: no-store`, errors `{ error, code }`.

| route | |
|---|---|
| `GET /api/db/settings` | `{ settings: { key: { value, updatedAt } } }` in one query |
| `PUT /api/db/settings` | `{ settings: { key: value } }`, 1 to 64 keys, all or nothing |
| `GET /api/db/dashboards` | `{ defaultId, dashboards: [{ id, name, icon, color, description, sort, createdAt, updatedAt, thumbRev, rev, format, bytes, summary }] }` in the owner's order, never a plan's text; carries an `ETag` and answers 304 to `If-None-Match` |
| `POST /api/db/dashboards` | `{ name, icon?, color?, description?, plan?, format? }` (blank, template or imported file; `plan` is its first working plan) or `{ fromId, name? }` (copy of another plan's working plan, not its versions). 201 `{ dashboard }`; 409 `name_taken`, `too_many` |
| `PATCH /api/db/dashboards/<id>` | any of `{ name, icon, color, description }` |
| `DELETE /api/db/dashboards/<id>` | soft delete; 409 `is_default` for the home plan, `last_plan` for the only plan |
| `POST /api/db/dashboards/<id>/undelete` | within 7 days (410 `gone` after) |
| `PUT /api/db/dashboards/default` / `PUT /api/db/dashboards/order` | `{ id }` makes it the home plan; `{ ids }` the order to list them in |
| `GET /api/db/dashboards/<id>/plan[?since=rev]` | `{ rev, updatedAt, format, plan }`, `{ rev: 0, plan: null }`, or `{ rev, unchanged: true }`; 404 for a plan that does not exist or is deleted |
| `PUT /api/db/dashboards/<id>/plan` | `{ plan, baseRev, format, overwrite? }` (5 MB). 200 `{ rev, updatedAt, changed }`; **409** `{ code: "conflict", server: { rev, updatedAt, format, plan } }` when `baseRev` is not the latest of THAT plan (nothing written); 404 for a plan that does not exist or is deleted |
| `GET /api/db/dashboards/<id>/versions` | `{ versions: [{ id, label, manual, rev, savedAt, changedAt, bytes, summary }] }` |
| `POST /api/db/dashboards/<id>/versions` | `{ label? }` saves the working plan as a named version; with `{ label, plan, format }` that plan (not the working one) is kept as the version |
| `POST /api/db/dashboards/<id>/restore` | `{ id }`: the version (of this plan only) becomes the working plan; the replaced plan is kept as "Before restore" |
| `GET` / `PUT /api/db/dashboards/<id>/thumb` | the plan's WebP thumbnail (`?v=<thumbRev>` makes it cacheable for a year); `PUT` takes the bytes as `image/webp` (64 KB at most) and returns `{ thumbRev }` |
| `GET /api/db/resources[?kind=&inline=1]` | `{ resources, totals }` without contents; `inline=1` (JSON resources only) adds each piece as `json` |
| `POST /api/db/resources?id=&kind=&name=&meta=` | body is the file, sent with its own type; 25 MB per file, 500 MB in total, type checked per kind |
| `GET /api/db/resources/<id>[?h=<sha256>]` | the file with its stored type. With the matching `h`: `Cache-Control: private, max-age=31536000, immutable`; without: `no-cache` + `ETag`. A revalidation that matches answers 304 from the resource's hash alone (the file is not read); a download hands the bytes to the socket as one chunk, without the extra copy `new Response(bytes)` makes |
| `DELETE /api/db/resources/<id>` | |
| `GET /api/db/info` | sizes, counts, last save, last backup, and per plan its size and number of versions (for the Data panel) |
| `GET /api/db/backup` | a consistent copy of the whole database (`.db`) |
| `POST /api/db/backup` | raw `.db` body: checked (healthy SQLite, our tables, `meta.app`, not from a newer build), safety copy made, then swapped in |
| `GET /api/db/events?start=&end=` / `POST /api/db/events` / `DELETE /api/db/events/<id>` | the dashboard's own calendar, in Home Assistant's event shape |
| `GET /api/automation/curtains` | what the dawn rule last did per curtain (see `docs/curtains.md`) |

### Versions

Per plan: a change to the working plan first keeps the plan it replaces as an automatic version, at most one per 5 minutes and never a copy of the newest version, so an editing session leaves "the plan as it was before" behind. The newest 30 automatic and, separately, the newest 30 saved versions are kept (per plan). Restoring, and "Keep mine" after a conflict, always keep what they replace. A version belongs to one plan and can only be restored into it.

## Browser sync (`lib/dbClient.ts`)

`dbStorage(name, kind, version)` is the `StateStorage` behind `createJSONStorage` for each persisted zustand store (`lib/store.ts`, `lib/sky.ts`, `lib/customStore.ts`, `lib/paintStore.ts`, `lib/liveLayer.ts`, `components/scene/declutterState.ts`, `components/scene/edit/editStore.ts`). Kinds: `settings` (one row), `plan` (the plan in `plans`, the rest as settings) and `pieces` (each custom piece a `piece` resource, the rest as settings).

- **Reads** come from localStorage, synchronously: first paint never waits for the network.
- **Writes** go to localStorage at once and to the server after 800 ms of quiet (a store that writes the same text again costs nothing). The page being hidden sends what is pending with `fetch(..., { keepalive: true })` when it fits in 60 KB; larger changes wait in localStorage and go at the next start. A "dirty" mark per store survives reloads.
- **Start** (once, after every store has registered): one `GET` each for settings, the plan list and pieces, then the chosen plan; then per store `lib/dbMerge.ts` decides. Server empty and device has data: upload (the one-time migration; the local copy stays). Device has nothing or is simply behind: take the server's, write it to localStorage and `rehydrate()` the store. Device has unsaved edits on the latest revision: send them. Both changed, or the device has a plan it never synced that differs from the server's: the toast asks (Load / Keep mine; Load keeps this device's copy once under `housey-plan-before-load`).
- **Which plan a device shows** (`pickPlan`): `?plan=<id>` in the URL (a kiosk), else the plan this device last chose (`localStorage` `housey-active-plan`; deliberately not a `.housey` device key, since another device's ids are not ours), else the server's home plan. A plan that no longer exists is skipped and the screen says so. The copy in localStorage (`housey-plan`, "the plan on screen") is of one plan, recorded as `planId` in `housey-db-sync`; a device from before several plans binds it to plan 1 'Home' (what migration 4 made of the old single plan). If the copy is of another plan than the one chosen it is kept in the stash first and sent to the server as a saved version of its own plan. A tab that finds another tab of the same browser has opened a different plan stops saving and asks for a reload, so one tab's copy is never sent as another plan.
- **Switching** (`switchPlanTo`, wrapped by `switchPlan` in `lib/activePlan.ts`): everything unsaved is sent first; a switch is refused while anything is still waiting (offline, a conflict), so no edit is ever lost. Then the other plan and its settings row are fetched and swapped into the local copy in one step; the store re-reads it, room focus and isolation reset, undo history starts empty. The camera is not persisted, so it starts from the default view.
- **Polling**: every 15 s while the tab is visible, `GET /api/db/dashboards` with the last `ETag` (an empty 304 when nothing changed in any plan). It also shows plans created, renamed or deleted on other devices. When the plan on screen has a newer revision, it is fetched and applied only when there is nothing unsaved and no save in flight, otherwise the toast appears. When the plan on screen was deleted elsewhere, the screen moves to the home plan, this device's copy is kept in the stash (and sent as a version of the home plan) and a notice says so.
- **Offline**: network errors, 5xx and 429 retry after 1, 2, 4 ... 30 s, and also when the browser reports `online`, on the next edit and on the next poll. The corner shows "Offline, will sync". A 4xx (too big, refused) shows "Not saved" with the reason and is retried at the next edit.
- **3D models** (`lib/modelStore.ts`): IndexedDB is a read-through copy. `putModel` keeps the model locally and uploads it (a refusal such as "too big" is thrown with a readable message and nothing is kept; offline it is queued and uploaded later); `getModel` falls back to the server and copies the file down; models that only exist in IndexedDB and are used by a custom piece are uploaded once at start.

## Tests

`npm test` runs `lib/db/*.test.ts` (migrations including a real-shaped schema-3 file moved to schema 4 with its plan byte for byte, the safety copy, refusing a newer schema, corruption recovery, version throttling and pruning per plan, conflicts per plan, two writers on separate connections in worker threads, plans: limits, names, copies, soft delete, purge, home plan, order, thumbnails; resource dedupe and limits, settings keys, request guards, backups including restoring an old file), `lib/dbMerge.test.ts` (the sync decisions and which plan opens), `lib/dbClient.*.test.ts` (the browser sync engine against the real data layer: opening, switching, refusing to switch with unsent edits, a plan deleted elsewhere, a pinned kiosk, two tabs) and `lib/server/curtainAutomation.test.ts`, all on temp database files.

## Plans are never lost to a sync decision

- **Rotating stash** (`lib/planStash.ts`, kept by `lib/dbStash.ts`): before anything replaces the plan in localStorage (loading the server's version, a restore from the Data panel, a backup import, taking the server's plan at start, adopting another device's change, opening another plan with unsent edits) the plan now there is copied to `housey-plan-before-load-1..10` (newest 10; time, reason, the plan it was of and item / wall / room counts in `housey-plan-stash-index`). Copies made before several plans existed belong to the home plan. `housey-plan-before-load` (the older single slot) is copied into the stash once and is never written, moved or deleted. When storage is full the oldest entries give way, never the newest. The banner and the Data panel's "Restore" list only offer the copies of the plan on screen.
- **Mirrored to the server**: a stashed plan that mattered (Load, backup import, the older slot, a restore) is also sent as a saved version "This device, before loading 18:10" (`POST /api/db/dashboards/<id>/versions` with `{ label, plan, format }`; the working plan is untouched) of the plan it was a copy of, or of the home plan when that plan is gone, so any device can restore it. If the server is down it is sent later.
- **Banner**: "We kept your previous plan from ...: Restore it / Not now" shows from localStorage alone (no server needed) while a stashed plan that differs from the plan on screen has not been dealt with.
- **Two versions of your plan**: when this device and the server differ and neither is the untouched starter, the choice shows both sides (items, walls, rooms, when) with **Keep this device's version** as the primary button; **Load the server's version...** needs a second confirm and says the device's plan is stored first. A device that never synced and has its own plan is never silently replaced: it is kept when the server only has the untouched starter (the server's plan stays as a version), and the user decides otherwise.
- **Tests never touch the real database**: in development a request with `X-Housey-Test: <8-32 chars a-z0-9>` is served from a throwaway database in the temp folder (`getTestDb`); it is ignored in production and cannot import backups.

## Why SQLite, not PocketBase

Several plans were built on the current SQLite layer after comparing a full PocketBase replacement (design record: [multi-plan-design.md](multi-plan-design.md) section 2). In short:

- Multi-plan is a product feature, not a storage feature; it needs one table and one column, not a new engine.
- PocketBase is pre-1.0 (its docs warn about manual migration steps) and its repository moved to ganigeorgiev.com (the GitHub repo was archived in October 2026), so builds would depend on one self-hosted forge.
- It would be a second process to supervise on the Pi and in the add-on, next to a server that is meant to stay light.
- Test isolation (`X-Housey-Test` throwaway databases) and the compare-and-swap on `rev` are cheap in SQLite and would need a process per token and a per-plan mutex with PocketBase.
- `lib/db/*` hides the engine, so this can be revisited later as a contained swap if a concrete need (admin UI, realtime sync) appears.
