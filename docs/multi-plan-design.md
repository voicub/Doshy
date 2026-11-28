# Doshy: multiple plans (dashboards) and the PocketBase question

Status: design only. Nothing in the repo was changed. Research date 2026-11-26.
Sources are named inline; anything not observed is marked **[INFERENCE]** or **[VERIFY]**.

---

## 0. Decision summary

| Question | Answer |
|---|---|
| Multiple plans + switching | Yes. One forward migration (`dashboards` table; today's plan becomes dashboard 1 'Home'), new `/api/db/dashboards/*` routes, per-device active plan, plan switcher in the brand corner, manager panel, palette commands. Same on SQLite or PocketBase. |
| Replace `node:sqlite` with PocketBase? | **Recommendation: no, not now.** Do multi-plan on the current SQLite layer. Keep PocketBase as a later, contained swap of `lib/db/*` if a concrete need appears. |
| If the owner still wants it | **Full replacement, no hybrid** (Part 5). Never 'PocketBase only for plan metadata' (split brain) and never a dual-engine interface (two engines to test, ship and debug). |
| Why the recommendation differs from the owner's stated preference | See section 2.3: the feature does not need it, most of its headline features are unused or already solved here, it adds a second process to a server that is 'light on purpose' for a Pi, it is pre-1.0 and its release hosting just moved off GitHub. The owner wrote 'I think PocketBase will be a much better solution', which reads as an opinion, not a requirement: this document gives the evidence and the full PocketBase plan so the owner can still decide. |

---

## 1. PocketBase: verified facts

| Topic | Fact | Source |
|---|---|---|
| What it is | Go backend: embedded SQLite with realtime subscriptions, auth, file storage, dashboard UI, REST-ish API; usable as standalone binary or Go framework | pocketbase.io/docs (Introduction) |
| Current version | Docs header says **v0.42.3** (changelog: 0.42.3 'Increased auto VACUUM threshold ...'). GitHub 'latest' still says v0.40.6 (2026-10-23) | pocketbase.io/docs; GitHub API releases; changelog |
| **Hosting moved** | Maintainer announced (discussion #7841, 2026-09-12) a move to a self-hosted forge `ganigeorgiev.com`; **GitHub repo archived 2026-10-26, no GitHub mirror**; v0.40.6 'will be most likely the last release here'. v0.41.0 migrated the Go module path to `ganigeorgiev.com/pocketbase`. Stable download URL pattern: `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/{tag}/{file}` (redirects). Older releases stay on GitHub | github.com discussion #7841; changelog v0.41.0 |
| Checksums | `.../download/v0.42.3/checksums.txt` exists. Observed sha256: linux_amd64 `89b1ded352404c648dd92c2d884fc8ff7858138697cb1ccb52722ccaa0bbd2a9`, linux_arm64 `f2af25259c5565e856aac5907a8fd9a7ce01d18375ac70b18121c9d41fd56dbe`, darwin_arm64 `232c0d5bbb05185b70eb8b37fa3cd8be0ae9b5ae5cf94cbec6d93f98733e0893`. Same origin serves binary and checksum, so pin the hashes in the repo (trust on first use) and re-verify at implementation time **[VERIFY]** | ganigeorgiev.com checksums.txt |
| Stability warning | 'Still under active development and full backward compatibility is not guaranteed before v1.0.0. NOT recommended for production critical applications yet, unless you are fine with reading the changelog and applying some manual migration steps from time to time.' Examples: v0.40.0 moved to Go 1.27 and `encoding/json/v2` ('not fully backward compatible'); v0.42.0 added a global 401 middleware that regressed the superuser UI, fixed in v0.42.1 the same day | docs Introduction; changelog 0.40.0, 0.42.0/0.42.1 |
| License | MIT | GitHub repo page |
| Artifacts | Per-release zips for linux amd64/arm64/armv7, darwin amd64/arm64, windows... (v0.40.6 sizes: linux_arm64 11.9 MB, linux_amd64 12.8 MB, darwin_arm64 12.2 MB zipped). Pure-Go SQLite driver (`modernc.org/sqlite`), no CGO | GitHub release assets; README build-targets table |
| Process model | `./pocketbase serve` binds `127.0.0.1:8090` by default; `--http=ADDR`; `--dir` sets the data dir (default `pb_data` next to the executable); `--encryptionEnv`; `--dev`; `--queryTimeout`. SIGINT/SIGTERM trigger a graceful shutdown (`Execute()` handles them) | cmd/serve.go, pocketbase.go (v0.40.6) |
| Health | `GET /api/health` -> 200 `{message:"API is healthy.",code:200,data:{}}` | apis/health.go |
| Superuser bootstrap | `pocketbase superuser create|upsert|update|delete EMAIL PASS`, also `superuser otp`, `superuser ips`. `upsert` is idempotent. Password is a CLI argument | cmd/superuser.go |
| Data layout | `pb_data` holds the SQLite DBs and uploaded files (`storage/`); `pb_migrations` holds JS migrations (auto-generated on collection changes when `--automigrate` is on, default for the prebuilt binary); `pb_hooks` for JS hooks | docs Introduction, js-migrations |
| Migrations | JS files `migrate((app)=>{...},(app)=>{...})`, run in a transaction on `serve` or `migrate up`; `migrate collections` snapshot; `migrate history-sync`. `migrate up/down` needs a `serve` restart | docs js-migrations |
| Collections | Base / View / Auth; SQLite tables underneath. Rules (list/view/create/update/delete) null = superuser only (default); superusers bypass all rules | docs collections, api-rules-and-filters |
| JSON field size | `DefaultJSONFieldMaxSize = 1 << 20` (**1 MB default**), configurable via the field's `maxSize` (up to 2^53-1). Request body limit = 32 MB + sum of the collection fields' max sizes | core/field_json.go, apis/middlewares_body_limit.go (v0.40.6) |
| File fields | Only the file NAME is stored in the DB, the file lives on local disk (`pb_data/storage`) or S3. Default max ~5 MB per file (adjustable). Thumbs only for jpg/png/gif/partly webp. Files public by URL unless the field is Protected (short-lived file token) | docs files-handling |
| Realtime | SSE (`GET /api/realtime`, then `POST /api/realtime` to set subscriptions). Collection subscriptions use the ListRule, record subscriptions the ViewRule. Server disconnects an idle client after 5 min; realtime connections are capped at 30 min since v0.38.2 (client reconnects). Subscription topic accepts `?options={query,headers}`, so a `fields` filter can keep events small. Node needs an EventSource implementation for the JS SDK **[VERIFY]** | docs api-realtime; changelog 0.42.3 |
| Backups | Built-in zip of `pb_data` (excludes local backups and S3 files), local or S3, cron schedule from settings; `POST /api/backups`, `.../restore` (**restarts the PocketBase process**, so something must restart it). Docs: copying `pb_data` is fine when the app is stopped. Backup can degrade performance | docs going-to-production, api-backups |
| Docker | **No official image.** Docs give a 6-line Alpine Dockerfile that downloads the release zip; mount a volume on `pb_data` | docs going-to-production |
| Hardening knobs | built-in rate limiter (v0.23+), superuser IP allow-list (v0.38+, `superuser ips` CLI), MFA/OTP for superusers, `GOMEMLIMIT` advice for memory-constrained hosts, optional settings encryption | docs going-to-production |
| JS SDK | npm `pocketbase` (latest tag seen: 0.29.0). Not required: the REST API works with plain `fetch` | registry.npmjs.org |
| Memory footprint on a Pi | **Not measured, no authoritative figure found.** **[INFERENCE]** tens of MB RSS idle for a Go binary with an embedded pure-Go SQLite; must be measured on the real arm64 device | n/a |
| Home Assistant story | No official PocketBase add-on. A community collection (`fabio-garavini/hassio-addons`, topics include `pocketbase`) exists. For Doshy the PocketBase process would live INSIDE the existing add-on image, started by the app; nothing in HA itself integrates with it | GitHub search API |
| Go library vs process | Using it as a Go library means writing Go and building our own binary per arch. The prebuilt binary (JS hooks enabled) is enough here | README |

---

## 2. Evaluation for THIS app

### 2.1 What the app actually needs from storage

From `docs/database.md`: one SQLite file; `settings` (KV, <=256 KB each), `plans` (working row + 30 automatic + 30 saved versions, rev counter, `summary` JSON), `blobs`/`resources` (SHA-256-deduped files up to 25 MB, 500 MB total), `events` (calendar, <=5000), daily `VACUUM INTO` backups (7), safety copy before import, `.housey` everything container (header + raw SQLite bytes), forward-only `PRAGMA user_version` migrations, `quick_check` + quarantine of corrupt files, per-request throwaway DB via `X-Housey-Test`, compare-and-swap on `rev` inside `BEGIN IMMEDIATE`. The server must be 'light on purpose' for a Raspberry Pi (`docs/server.md`). The browser keeps localStorage as the instant copy and polls the server every 15 s.

Observed: the owner's plan is at rev 414, format 15 (GET /api/db/plan).

### 2.2 PocketBase benefits vs. cost, feature by feature

| PocketBase feature | Does Doshy benefit? | Verdict |
|---|---|---|
| Admin UI to inspect/edit data | Real value for debugging. But the data is mostly opaque JSON blobs (plan up to 5 MB); the UI would show one giant JSON cell. A tiny dev-only read-only 'data inspector' route or any SQLite browser gives 80% of it | Nice, not decisive |
| Realtime between wall tablet and phone | Real UX gain (15 s poll today). BUT it can be done without PocketBase: an SSE route `/api/db/stream` fed by an in-process `EventEmitter` on every `putPlan` (about 60 lines; single Node process). With PocketBase the browser must not talk to it directly (auth, port, CORS), so Next would still proxy or re-broadcast the events | Achievable cheaper |
| Auth / users | The app deliberately has no sign-in (README: trusted network or reverse proxy). Next would be the only PocketBase client using a superuser token; PocketBase's user system would sit unused | Not used |
| File storage + thumbnails | Blobs already dedupe by SHA-256 (PocketBase does not dedupe). Thumbs do not apply to glTF/GLB. Default max file 5 MB vs the app's 25 MB (must be raised). Served through Next (loopback) so the 'one-chunk to socket' optimisation in `lib/server/bytesResponse.ts` partly goes. S3 option is irrelevant for a home install | Marginal / slightly worse |
| REST filtering/sorting | The access patterns are: KV by key, plan by id, events by time range. All trivial SQL with indexes | Not needed |
| Built-in backups | Zip of `pb_data` (cron, S3, restore API). But the app already has daily `VACUUM INTO`, safety copy, import/export and the `.housey` container; the container embeds raw SQLite bytes and would have to be redesigned around a zip with several DBs + `storage/` | Replaces working code with different code |
| Mature migrations | Our list is 3 migrations, forward-only, each in a transaction with the version bump. PocketBase migrations are mature, but PocketBase itself is pre-1.0 and its upgrades are the thing that can need 'manual migration steps' | Neutral |
| Auth for future multi-user | Only valuable if multi-household or per-user plans are wanted. Not requested | Speculative |

### 2.3 Costs and risks (all verified against the repo unless marked)

1. **Second process and binary.** Today the image runs `node server.js` as PID 1 (`docker-entrypoint.sh` ends with `exec`). PocketBase needs a supervisor (restart with backoff, SIGTERM forwarding, readiness wait). The add-on runs as root (SUPERVISOR_TOKEN case) and uses `backup: cold` (stops the add-on); PocketBase's graceful shutdown makes that safe, **[VERIFY]** on a real Supervisor (the add-on is still `stage: experimental`, 'not verified on a real Supervisor yet').
2. **Supply chain / availability.** Builds would download from a single-maintainer self-hosted forge because GitHub is archived. CI and Docker builds fail if that host is down, unless the zips are mirrored (a GitHub release or LFS in the Doshy repo, ~12 MB per arch). Pin version + committed sha256.
3. **Pre-1.0 churn.** Official warning (section 1). Every upgrade needs reading a changelog; open-source Doshy users upgrade the image blindly.
4. **Ports and auth between Next and PocketBase.** Bind 127.0.0.1:8090 only, superuser credential generated into `/data`, token refresh on 401, never log it. The `/api/db/*` routes keep their existing same-origin guard; PocketBase's own API would never be reachable from browsers (otherwise it is an unauthenticated-LAN-writable second API with its own rules).
5. **Optimistic concurrency.** Doshy's conflict detection is an atomic `baseRev` compare-and-swap. PocketBase has no conditional update; API rules cannot do arithmetic (`rev = old + 1`), and superusers bypass rules anyway. Options: (a) in-process per-plan mutex in Next (sound only while Next is the single writer: admin-UI edits would bypass it), (b) a `pb_hooks` JS route using `$app.runInTransaction` (a third language/runtime to maintain), (c) one row per revision with a UNIQUE (plan, rev) index (huge storage). Recommended if PB is chosen: (a).
6. **Plan JSON size.** JSON field default max 1 MB; the app accepts 5 MB (`MAX_PLAN_BYTES`). Must set `maxSize` on `plans.json` and on versions' JSON fields explicitly; body limit grows by the sum of field max sizes. Today the server embeds the stored text as is (`planText`, no parse/stringify of megabytes); with PocketBase Next must `JSON.parse`/`stringify` when reading and writing (a few ms at 250 KB, tens of ms at 5 MB on a Pi **[INFERENCE]**). Snapshots (copy working row to a version) currently happen inside SQLite with zero JS copy; with PocketBase they become read + write through Node.
7. **Test isolation.** Today `X-Housey-Test: <token>` -> throwaway SQLite file, opened in ~ms, max 4 alive (`getTestDb`). With PocketBase the only hard isolation is a **separate PocketBase process per token** (`--dir` in the temp folder, own loopback port, migrations applied at start: about a second or more per token **[INFERENCE]**, memory per instance). A `tenant` field enforced server-side shares the real instance, so a single missed filter leaks test writes into the owner's data, which violates the project rule 'agents never touch the real database'.
8. **Dev workflow on the owner's Mac.** `next dev` needs the darwin_arm64 binary downloaded (`scripts/get-pocketbase.mjs`, pinned + checksum), spawned by the dev server; first run needs network. Today it needs nothing.
9. **Image size and builds.** +~12 MB zipped per arch (**[INFERENCE]** ~30-40 MB unpacked, measure). Multi-arch: Dockerfile must map `TARGETARCH` (amd64/arm64) to `linux_${arch}` zip; `node:24-bookworm-slim` has no `unzip` (add it in a throwaway stage). CI (`.github/workflows/build.yml`, `validate.yml`) gets a binary-verification step.
10. **Raspberry Pi specifics.** PocketBase writes request logs to its auxiliary DB by default (`settings.logs.maxDays`, `minLevel` exist; see docs js-migrations example). On an SD card the extra write amplification from a 3 s HA poll is NOT through PocketBase (HA polls go to HA), but every plan/settings save, every 15 s list poll and every file GET would be logged unless configured **[VERIFY]**. `GOMEMLIMIT` recommended in constrained environments.
11. **Backups / `.housey` container.** Needs a redesign: either embed a PocketBase backup zip (format 2, keep reading format 1 forever for old exports) or export collections to JSON + files. Restore through PocketBase's API restarts PocketBase.
12. **The owner's real data.** The importer (section 5.7) is mandatory and is a one-way risk surface: 414 plan revisions, versions, blobs. Everything below is designed so the old `housey.db` is never modified or deleted.
13. **Realtime events carry the whole record.** An update event with a 250 KB JSON plan goes to every subscriber unless the subscription restricts `fields` (supported via topic options). Needs care to avoid broadcasting megabytes.
14. **Request skew.** `node:sqlite` is **Stability 1.2 (release candidate)** since Node v24.15.0 (nodejs.org docs v24.22.3), not experimental any more: the 'it may break' argument against staying is weak.

### 2.4 Options compared

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **D. Stay on SQLite, ship multi-plan now** | One migration; zero new processes; test isolation and backups unchanged; API storage-agnostic so a later swap is contained | No admin UI; realtime stays polling unless the optional SSE package is built | **Recommended** |
| A. Full replacement by PocketBase | Admin UI, realtime, auth available; one storage engine afterwards | Everything in 2.3; +8-12 dev-days **[ESTIMATE]**; mandatory risky data import | Owner's preference; fully designed in Part 5 |
| B. Storage interface with both engines | Lets owner trial PB | Two engines forever; every feature and test twice; interface shaped by the weaker engine | Rejected |
| C. PocketBase only for multi-plan metadata | Smaller PB surface | Split brain: plan JSON in SQLite, metadata in PB, no cross-engine transaction (delete/duplicate/restore cannot be atomic); both costs of running PB, none of the benefit | Rejected |

Recommendation rationale in one line: **multi-plan is a product feature, not a storage feature**; the existing `plans` table already models 'working plan + versions' and gains plans with one column and one table.

Path to PocketBase later: because routes, client sync and UI talk only to `/api/db/*` and `lib/db/*` hides SQLite, swapping the engine later rewrites `lib/db/*`, backup/everything, Docker/add-on plumbing and adds the importer. None of the work in Parts 3-4 is wasted.

---

## 3. Product design (independent of the storage engine)

### 3.1 Vocabulary

- UI word: **Plan** (the owner's word). Code/API word: **dashboard** (`Dashboard`, `dashboards`, `/api/db/dashboards`) because `Plan` is already the TypeScript type of the geometry document (`lib/types.ts`). A one-paragraph glossary goes into `docs/database.md`.
- A **dashboard** = one complete home design: the geometry `Plan` document (walls, openings, rooms, items, levels, voids, ground, paths, site/surroundings and alignment, flows, bearing, building, added) plus its UI memory and metadata.

### 3.2 What is a dashboard

| Field | Type / rule |
|---|---|
| `id` | integer (existing 'Home' keeps working row id mapping; becomes dashboard 1) |
| `name` | 1-60 chars, trimmed, unique case-insensitively among non-deleted plans |
| `icon` | key from a fixed allowlist of Phosphor icons (about 24); stored as `^[a-z0-9-]{1,32}$`, client maps unknown keys to a default |
| `color` | `#rrggbb` or empty (swatch palette in UI) |
| `description` | optional, <=280 chars |
| `thumb` | WebP <=64 KB (320x200) + `thumb_rev` for immutable caching |
| `created_at`, `updated_at`, `sort`, `deleted_at` | ms epoch; `sort` for manual order; `deleted_at` soft delete |
| working plan + versions | existing `plans` rows (`active=1` working, `active=0` versions, `manual` flag) now carry `dashboard_id` |

### 3.3 Global vs per plan

| Item | Scope | Why |
|---|---|---|
| Home Assistant connection (env `HA_URL`/`HA_TOKEN`) | Global | Not in the DB |
| Graphics/quality, display, layout, calendar-card prefs, renderer (localStorage `housey-quality`, `housey-display`, ...) | Global, per device | Device capability |
| Custom pieces catalog (`housey-custom`), car models, favourites | Global | Shared library |
| Imported 3D models, photos, city models (`resources`/`blobs`) | Global shared library | Referenced by id from any plan; deleting a plan never deletes files; duplicating a plan copies references, not blobs |
| Calendar events (`events`) | Global (**decision**, owner may overrule) | Household calendar, not geometry |
| Live layer choice (`housey-live-layer`), paint (`housey-paint`), declutter, sky, recent | Global (as today) | Display preferences that do not contain plan ids |
| Plan JSON incl. site alignment, bearing, levels, ground/paths, flows, entity links inside item params | **Per plan** | Already inside the `Plan` document, so entity links follow the plan automatically |
| `time, cutaway, view, environment, openingDefaults, activeLevel, levelView` (the rest of the persisted `housey-plan` zustand doc, `lib/store.ts` partialize) | **Per plan**, settings row `housey-plan.<id>` | `activeLevel`/`levelView` hold level ids that differ between plans, so the whole remainder moves together (smallest change in `dbClient`) |
| Versions / undo history | Per plan (server versions); undo stack stays in memory and is cleared on switch (store `merge` already resets `past/future/gesture/sel`, `lib/store.ts` around line 358) |
| Camera | Nothing to scope: it is not persisted today (not in `partialize`); resets to the default view on switch |
| Curtain automation | Reads **only the default ('home') plan** | Duplicates share cover entities; scanning every plan would double-command. Memory row `curtain-automation` stays global, keyed by curtain item id, pruned to the default plan's curtains by the existing `saveStore(keep)` logic. Cards on non-default plans show 'automation runs on the home plan' |
| WashData, notifications, calendar services | Plan-independent | HA/global; entity links live in items |
| Per-device selection | localStorage `housey-active-plan` (not part of the `.housey` device keys, a restored id on another device would be wrong) | |

### 3.4 Which plan does a device show

1. URL `?plan=<id>` (kiosk pinning; same pattern as the existing `?kiosk=1`). The Manager has 'Copy kiosk link'.
2. else localStorage `housey-active-plan`.
3. else the server default (`meta.default_dashboard`, set from the manager: 'Make this the home plan').
- If the id no longer exists (deleted elsewhere, backup import): fall back to the default and show a toast; the device's local copy is stashed first (`lib/planStash.ts`).
- When the URL param is present, in-app switching rewrites it with `history.replaceState` so the URL stays the source of truth.

### 3.5 Creating plans

`POST /api/db/dashboards` with `{ name, icon?, color?, description?, plan?, format?, fromId? }`:
- **Blank**: client sends an empty `Plan` (`{walls:[],openings:[],rooms:[],items:[]}` plus defaults).
- **Starter flat**: client sends `starterPlan()` (`lib/starterPlan.ts`, `STARTER_VERSION` as `format`).
- **Duplicate**: `fromId` -> server copies the working row inside SQLite (`INSERT ... SELECT`, no JS copy), not the versions; name '<name> copy'; also copies the `housey-plan.<id>` settings row.
- **Import**: client sends the parsed file (`readPlanFile`, `components/ui/planIO.ts`); the plan file gains an optional `dashboard: {name, icon, color, description}` block so an exported plan re-imports with its identity. Existing import behaviour ('replace current plan') stays available, offered second.

### 3.6 Export / import

- One plan: existing `exportPlan` (JSON with the custom-pieces bundle) plus the `dashboard` block.
- Everything: `.housey` container unchanged (it embeds the whole DB, so it now contains all plans). Importing an old `.housey` or `.db` (older `user_version`) migrates forward and its single plan arrives as 'Home'.

### 3.7 UI

- **Switcher** in the top-left brand corner (`components/ui/Brand.tsx`): the wordmark row gets a chip with the current plan's icon, colour dot and (truncated) name plus a caret. Tap/Enter opens a popover on regular layouts and a bottom sheet on compact (`html:not([data-vp="regular"])` in `compactChrome.css`). List rows >=44 px high, 56x36 thumbnail, name, 'current' mark, `role="listbox"`, arrows/Enter/Esc, focus restored (`useRestoreFocus`). Footer: 'New plan', 'Manage plans...'.
- **Manager** (left panel via `useLeftPanel`/`lp.openPlans`): card grid (thumbnail, name, counts from `summary`, updated time, icon/colour). Per-card menu: Rename/edit (name, icon, colour, description), Duplicate, Make home plan, Copy kiosk link, Export, Delete. Reorder by up/down buttons (no drag required on touch).
- **Command palette** (`components/ui/paletteCommands.ts`, today's 'Open device card...' narrowing pattern becomes a `mode`): 'Switch plan...', 'New plan', 'Duplicate this plan', 'Rename plan...', 'Delete plan...', 'Manage plans'.
- **Delete**: confirm dialog naming the plan and counts; then a toast with **Undo (10 s)**. Server side it is a soft delete at once (other devices see it vanish), restorable for 7 days via `POST /api/db/dashboards/<id>/undelete`; purged by the daily backup tick. The default plan and the last remaining plan cannot be deleted.
- **Thumbnails**: `lib/planThumb.ts`, a pure function drawing walls/rooms/items bounding box to a 2D canvas; works for plans that are not loaded (the manager shows all plans). Generated client-side after the active plan has been quiet for 30 s (and after a duplicate/import), uploaded with `PUT .../thumb`. Missing thumb -> coloured icon tile.
- No new global shortcut (avoids clashes); palette is the keyboard path.

### 3.8 Switching protocol (fast and safe)

1. `await flushNow()` (`lib/dbClient.ts`). If anything is still dirty after the flush (offline/5xx), **refuse** with 'Can't switch while changes are waiting to be saved' (never lose edits).
2. Fetch `GET /api/db/dashboards/<id>/plan` and `GET /api/db/settings` (same call as start-up; the `housey-plan.<id>` row comes with it).
3. Set `planId`, `planRev`, `lastPlanJson`, clear `conflict`/`forceOverwrite`, write localStorage `housey-plan` and `housey-active-plan`, call the store's `rehydrate()` (the existing `applyServerPlan` path, `reason: "switching plan"`, no stash needed because the previous plan lives on the server and its local copy was just flushed).
4. Rig: `setFocusRoom(null)`, isolate off, default camera.
5. HA `states` are untouched: same entity list, no refetch. Only geometry and 3D objects rebuild.
- Target: <=1 request pair and one scene rebuild; **[VERIFY]** time on a Pi 5 and a phone with a 250 KB plan.

### 3.9 Conflicts and multi-device

- Conflict detection stays per plan: `PUT /api/db/dashboards/<id>/plan { plan, baseRev, format, overwrite? }` -> 409 with the server copy, exactly as today.
- Polling changes from `GET plan?since=rev` to `GET /api/db/dashboards` (ETag, small: id, name, icon, color, rev, updatedAt, thumbRev, summary, bytes, defaultId). One request per 15 s, and it surfaces plans created, renamed or deleted on another device. If the active plan's `rev` is newer than the device's, existing `decidePoll` logic applies (apply silently when clean, otherwise the toast).
- Active plan deleted on another device: toast + move to default; device copy stashed.
- Optional later package (not required): `GET /api/db/stream` SSE (in-process emitter) for instant updates, valid on SQLite and on PocketBase (re-broadcast).

### 3.10 Limits

- Max 24 plans (versions are 30 + 30 per plan; worst case grows linearly, the Data panel shows bytes per plan).
- Everything else (5 MB plan, 256 KB settings, 25 MB files, 500 MB resources) unchanged.

---

## 4. Implementation plan, recommended track (SQLite)

### 4.1 Schema: migration 4 (never edit shipped migrations)

```sql
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
ALTER TABLE plans ADD COLUMN dashboard_id INTEGER REFERENCES dashboards (id); -- nullable: SQLite requires a NULL default when adding a REFERENCES column with foreign keys on
INSERT INTO dashboards (id, name, icon, created_at, updated_at) VALUES (1, 'Home', 'house', <now>, <now>);
UPDATE plans SET dashboard_id = 1;
DROP INDEX plans_one_working;
CREATE UNIQUE INDEX plans_one_working ON plans (dashboard_id) WHERE active = 1;
CREATE INDEX plans_versions ON plans (dashboard_id, active, manual, id);
INSERT INTO meta (key, value) VALUES ('default_dashboard', '1');
-- the old single settings row becomes dashboard 1's row
UPDATE settings SET key = 'housey-plan.1' WHERE key = 'housey-plan';
```

Notes: `dashboard_id` stays nullable for SQLite reasons; the code treats NULL as corrupt. `REQUIRED_TABLES` gains `dashboards`. `checkBackupFile` already accepts older `user_version`s and `replaceDatabase` migrates forward, so old backups import as 'Home'.

**Safety copy before migrating** (`lib/db/connection.ts` `openDb`): when the existing file's `user_version` < target, `VACUUM INTO backups/housey-before-v<N>-<ts>.db` first (newest 3 kept, same pattern as `backupBeforeImport`). This protects the owner's real data in all future migrations. An older build opening the v4 file refuses it ('database from a NEWER build', existing behaviour), which is the safe failure.

### 4.2 Server modules

| File | Change |
|---|---|
| `lib/db/migrations.ts` | migration 4; `REQUIRED_TABLES` |
| `lib/db/dashboards.ts` (new) | `listDashboards`, `createDashboard`, `duplicateDashboard`, `patchDashboard`, `softDelete`, `undelete`, `purge(olderThan)`, `setDefault`, `setOrder`, `setThumb`/`getThumb`; limits (24, name rules, icon/colour regexes) |
| `lib/db/plans.ts` | every function takes `dashboardId` (`getPlan`, `getPlanRev`, `putPlan`, `listVersions`, `saveVersion(Of)`, `restoreVersion`, `prune`, `snapshot`); the 5-min throttle and 30+30 pruning apply per plan |
| `lib/db/settings.ts` | allow key pattern `housey-plan.<id>` (still `^[a-z0-9._-]{1,64}$`); `deleteSettingsFor(id)` on purge |
| `lib/db/info.ts` | per-plan counts/bytes |
| `lib/server/curtainAutomation.ts` | `tick` reads `getPlan(db, defaultDashboardId(db))`; cache keyed by `{id, rev}` so changing the default invalidates it |
| `lib/db/connection.ts` | pre-migration safety copy; daily tick also calls `purge` |

### 4.3 Routes (clean cutover; `/api/db/plan*` deleted)

| route | |
|---|---|
| `GET /api/db/dashboards` | `{ defaultId, dashboards: [{ id, name, icon, color, description, rev, updatedAt, format, bytes, summary, thumbRev, sort, createdAt }] }`, ETag/304 |
| `POST /api/db/dashboards` | create / duplicate / import (3.5) |
| `PATCH /api/db/dashboards/[id]` | `{ name?, icon?, color?, description? }` |
| `DELETE /api/db/dashboards/[id]` | soft delete; refuses default/last |
| `POST /api/db/dashboards/[id]/undelete` | within 7 days |
| `PUT /api/db/dashboards/default` | `{ id }` |
| `PUT /api/db/dashboards/order` | `{ ids }` |
| `GET` / `PUT /api/db/dashboards/[id]/plan` | exactly today's `/api/db/plan` contract, per plan |
| `GET` / `POST /api/db/dashboards/[id]/versions`, `POST .../restore` | today's contract, per plan |
| `GET` / `PUT /api/db/dashboards/[id]/thumb` | WebP, `Cache-Control: private, max-age=31536000, immutable` with `?v=<thumbRev>` |

All keep `lib/db/http.ts` guards (same-origin, content type, body caps, write rate limit, `X-Housey-Test`). `app/api/db/backup`, `resources`, `events`, `info`, `settings` unchanged apart from `info` content.

### 4.4 Client

| File | Change |
|---|---|
| `lib/dbApi.ts` | typed calls for all routes above; `fetchPlan(id, since?)`, `savePlan(id, ...)`, `fetchVersions(id)`, etc.; `Dashboard` type |
| `lib/activePlan.ts` (new) | resolve/persist the active id (URL > localStorage > default); `switchPlan(id)`; `useActivePlan` zustand store (id, list, defaultId, thumbs) |
| `lib/dbClient.ts` | `planId` module state; META gains `planId` and `rev` stays bound to it; the `plan` doc kind saves 'the rest' under `housey-plan.<planId>`; `switchPlan` implementation (3.8); poll switches to the list; handle 'active plan deleted' |
| `lib/dbMerge.ts` | `decidePoll` input becomes list entry; `decidePlan` unchanged (per plan) |
| `lib/planStash.ts` | stash index entries get `planId`; 'Restore' targets the matching plan, otherwise offers 'Restore as new plan' (entries without an id belong to the default plan) |
| `lib/store.ts` | no change to the persisted shape; `persist` name stays `housey-plan` (the localStorage doc is 'the plan on screen') |
| `lib/planThumb.ts` (new) | pure 2D thumbnail drawer + scheduler |
| `components/ui/Brand.tsx`, `PlanSwitcher.tsx` (new), `PlanManager.tsx` (new), `PlanEditSheet.tsx` (new), `paletteCommands.ts`, `useLeftPanel.ts`, `Dashboard.tsx`, `lazyPanels.ts`, CSS (`plans.css`, `compactChrome.css`) | UI (3.7) |
| `components/ui/planIO.ts`, `NewPlanParts.tsx` | create/import flows, `dashboard` block |
| `lib/everything.ts` | no format change; `housey-active-plan` is deliberately NOT a device key |

### 4.5 Tests (all node tests on temp DB files; no network)

- `lib/db/migrations.test.ts`: v3 fixture -> v4: counts equal, rev unchanged, plan JSON byte-identical (sha256 before/after), versions preserved, settings row renamed, `default_dashboard = 1`; v4 file refused by a v3 migrator list; safety copy exists.
- `lib/db/dashboards.test.ts`: create/duplicate (copy is inside SQL, versions not copied), name uniqueness, limits, soft delete/undelete/purge, refuse default/last, order, thumb.
- `lib/db/plans.test.ts`: existing cases parameterised by dashboard; throttle/prune per plan; conflict 409 per plan; two writers on separate connections.
- `lib/server/curtainAutomation.test.ts`: reads default plan only; changing default invalidates the cache.
- `lib/dbMerge.test.ts` / new `lib/activePlan.test.ts`: resolution order, deleted-id fallback, refuse-switch-when-dirty, URL rewrite.
- Backup: v3 `.db` and old `.housey` import -> 'Home'.

### 4.6 Docs to update

`docs/database.md` (schema table, API table, glossary, 'Plans are never lost...' section mentions per plan), `docs/server.md` (curtain automation reads the default plan; purge in the daily tick), `README.md` (Your data: multiple plans, kiosk `?plan=`), `CONTRIBUTING.md` (database bullet: migration 4 pattern, safety copy), `docs/home-assistant.md` (kiosk link, add-on notes unchanged), `docs/small-screens.md` (`?kiosk=1&plan=<id>`), `docs/curtains.md` (default plan rule).

### 4.7 Work packages and file ownership (parallelisable)

Contract first: WP-A publishes the function signatures and route payloads in this section (types in `lib/db/dashboards.ts` and `lib/dbApi.ts` stubs agreed before coding).

| WP | Scope | Owns (exclusive) | Depends on | Size **[ESTIMATE]** |
|---|---|---|---|---|
| A. Data layer | migration 4, safety copy, `dashboards.ts`, `plans.ts` parameterised, settings key rule, info | `lib/db/**` (except `http.ts`), their tests | none | M (2 d) |
| B. Routes + automation | new routes, delete `/api/db/plan*`, curtain automation default plan, daily purge hook | `app/api/db/dashboards/**`, `app/api/db/plan/**` (delete), `lib/server/curtainAutomation*`, `app/api/automation/**` | A signatures | S-M (1 d) |
| C. Client sync | `dbApi`, `dbClient`, `dbMerge`, `planStash`, `activePlan`, URL handling | `lib/dbApi.ts`, `lib/dbClient.ts`, `lib/dbMerge*`, `lib/planStash.ts`, `lib/activePlan*` | B payloads | L (3 d, riskiest: sync engine) |
| D. UI | switcher, manager, edit sheet, palette, thumbs, CSS, a11y/touch targets | `components/ui/Brand.tsx`, `PlanSwitcher.tsx`, `PlanManager.tsx`, `PlanEditSheet.tsx`, `paletteCommands.ts`, `lib/planThumb*`, `plans.css`, `compactChrome.css` additions, `Dashboard.tsx` + `useLeftPanel.ts` wiring | C store API (`useActivePlan`) | L (3-4 d) |
| E. Import/export | `planIO.ts`, `NewPlanParts.tsx`, plan file `dashboard` block | those two files | B | S (0.5-1 d) |
| F. Docs + changelog | section 4.6 | `docs/**`, `README.md`, `CONTRIBUTING.md` | A-E | S (0.5 d) |
| G. Optional SSE instant sync | `app/api/db/stream/route.ts`, emitter in `lib/db/plans.ts` hook, client EventSource with poll as fallback | new files only | A-C | S-M (1 d) |

Serial dependency: A -> B -> C -> D; E and F start after B. D can start from a mocked `useActivePlan` once C's store shape is fixed.

### 4.8 Ordered rollout and the owner's real data

1. **Rehearsal on a COPY only.** Copy `data/housey.db` (plus `-wal`/`-shm` if present, ideally with the server stopped or via `/api/db/backup`) to a temp folder; run the new build with `HOUSEY_DB_PATH=<temp>/housey.db` and a different port. Never point the new build at `data/` before this passes.
2. Check on the copy: migration ran once; `plans` row count and `rev` (414) unchanged; sha256 of the working plan JSON before == after; versions count equal; `/api/db/dashboards` shows one plan 'Home'; the UI loads it; create/duplicate/switch/delete+undo; kill the server mid-switch and confirm no data loss.
3. Run `npm test`, typecheck, lint (main agent).
4. Real upgrade: server makes `backups/housey-before-v4-<ts>.db` automatically before migrating, then migrates. Owner also takes a `.housey` export first (manual belt and braces).
5. Open each device once; each keeps its localStorage plan, which binds to dashboard 1 'Home' (meta `planId` set on first run).
6. Rollback: stop, restore the `before-v4` file (or the `.housey` export), run the previous image/tag. The v4 file is never opened by the old build (it refuses it).

---

## 5. Full PocketBase design (owner's preference: full replacement, clean cutover, no shim)

Builds on Parts 3-4 (same routes, same client, same UI). Only the storage engine, process management, importer, backup and tests differ. Effort on top of Part 4: **+8-12 days [ESTIMATE]**.

### 5.1 Architecture

```
browser --(same-origin /api/db/*)--> Next route handlers --(loopback HTTP, superuser token)--> PocketBase 127.0.0.1:8090
                                          |                                                     pb_data: data.db, auxiliary.db, storage/
                                          '-- lib/server/pocketbase.ts: spawn, health, restart, token
```

- Browsers never talk to PocketBase. Same guards as today stay in `lib/db/http.ts`. PocketBase rules are left at 'null' (superuser only) on every collection, so even a leaked port yields 403 to anonymous users.
- Library vs process: prebuilt binary (JS VM included). No Go code, no Go toolchain in CI.
- Plain `fetch` against the REST API; no `pocketbase` npm dependency (rung: stdlib).

### 5.2 Collections (PocketBase JS migration `pb_migrations/<ts>_init.js`, committed)

| Collection | Fields | Notes |
|---|---|---|
| `meta` (base) | `key` text unique, `value` text | `app=housey`, `default_dashboard`, `import_log` |
| `settings` | `key` text unique (regex `^[a-z0-9._-]{1,64}$`), `value` json (`maxSize` 262144), `updated_at` number | includes `housey-plan.<id>` and `curtain-automation` |
| `dashboards` | `name`, `icon`, `color`, `description`, `thumb` file (maxSelect 1, maxSize 65536, thumbs optional), `thumb_rev`, `sort`, `deleted_at` number, `legacy_id` number | unique index on `lower(name)` where not deleted |
| `plans` | `dashboard` relation (cascade delete false), `json` json (**`maxSize` 5242880**), `bytes`, `rev`, `format`, `active` bool, `manual` bool, `label`, `summary` json, `legacy_id` | unique index `(dashboard) WHERE active = true` is NOT expressible via the UI but is via the collection's `indexes` (raw SQL) **[VERIFY]**; index `(dashboard, active, manual)` |
| `blobs` | `hash` text unique, `size` number, `file` file (maxSize 26214400) | one record per SHA-256 |
| `resources` | `id` text pattern `m_*` (custom ids are allowed: 15 chars max **[VERIFY]**: model ids are `m_<uid>`; use `rid` text unique plus PocketBase `id`), `kind`, `name`, `mime`, `blob` relation, `meta` json, `created_at` | |
| `events` | same columns as today, index `start_ms` | |

All rules `null`. `autodate` fields are not used (the app's own ms timestamps stay the contract). PocketBase settings via migration: `logs.maxDays = 2`, `minLevel` raised, batch API off, rate limiter on, `meta.appName='Doshy'`.

### 5.3 Process management

- **Who starts it.** `instrumentation.ts` calls `lib/server/pocketbase.ts` `startPocketBase()` (same place curtain automation starts), so the SAME code path runs in `next dev` on the Mac, `next start`, the Docker image and the add-on, and the existing 'loop on `globalThis`' pattern guards against hot reload duplicates. Rejected: a shell supervisor in `docker-entrypoint.sh` (only covers Docker; dev would differ) and s6/tini (not in this base image).
- **Spawn.** `pocketbase serve --http=127.0.0.1:8090 --dir=<HOUSEY_PB_DIR|/data/pocketbase|data/pb_data> --migrationsDir=<repo>/pb_migrations --encryptionEnv=...` (optional) with `GOMEMLIMIT` env (`HOUSEY_PB_MEMLIMIT`, default `128MiB` **[VERIFY]**). Port from `HOUSEY_PB_PORT` (default 8090; tests use free ports).
- **Readiness.** Poll `GET /api/health` every 200 ms up to 30 s; until ready every `/api/db/*` route answers 503 `{code:'storage_starting'}` (same behaviour the app already has when SQLite cannot open: browsers keep working from localStorage).
- **Crash.** Restart with backoff 1 s doubling to 30 s; routes 503 meanwhile.
- **Shutdown.** On SIGTERM/`exit` forward SIGTERM to the child, wait <=10 s, then SIGKILL. PocketBase's own `/api/backups/<k>/restore` restarts it, which the supervisor handles like a crash.
- **Docker HEALTHCHECK** changes from `GET /` to an endpoint that also checks PocketBase (`/api/db/info`).
- **Superuser bootstrap.** First start: generate `/data/pocketbase/superuser.secret` (32 random bytes hex, mode 0600, never logged, never in env dumps), then on EVERY start run `pocketbase superuser upsert doshy@doshy.local <secret> --dir=...` before `serve` (idempotent, also repairs a deleted superuser). Known weakness: the secret is visible in the child's argv for the milliseconds the CLI runs (single-user container; **[INFERENCE]** acceptable). Next authenticates via `POST /api/collections/_superusers/auth-with-password`, caches the JWT, re-auths on 401. The secret is inside `/data`, therefore inside HA add-on backups, with the same trust level as the DB.
- **Admin UI** reachable only if enabled (`HOUSEY_PB_ADMIN=1` binds `0.0.0.0:8090`; add-on option maps it; also set `superuser ips`). Default off.

### 5.4 Storage adapter (replaces `lib/db/*`)

- New `lib/server/pb/*.ts` with the same exported function names/semantics as today's modules (`getPlan`, `putPlan`, `listVersions`, ...). Routes stay as in 4.3.
- `putPlan` CAS: per-plan in-process async mutex (single Next process is the only writer) + `GET rev` then `PATCH`. Documented ceiling: admin-UI edits and multiple Next instances bypass it. No `pb_hooks`.
- Versions: snapshot = read working record + `POST` a version record (throttle 5 min, prune to 30+30 by listing ids). Slower than `INSERT ... SELECT` but bounded.
- Plan JSON passes through `JSON.parse`/`stringify`; reply bodies are built from the parsed value.
- Files: `POST /api/collections/blobs/records` multipart; `GET /api/files/blobs/<id>/<file>` streamed by Next with the existing ETag/immutable headers; dedupe by `hash` lookup before upload.
- `GET /api/db/info` queries `/api/collections/*/records?perPage=1` for totals + `GET /api/health`.
- Resource caps (25 MB/file, 500 MB total, types per kind) enforced in Next as today.

### 5.5 Test isolation

`X-Housey-Test: <token>` (development only, ignored in production) maps to **a separate PocketBase process per token**: `--dir=<tmp>/housey-test-<token>/pb_data`, free loopback port, migrations applied from `pb_migrations`, LRU max 4 alive (same as `MAX_TEST_DBS`), all killed on exit. Test instance startup cost is **[VERIFY]**. Rejected: a `tenant` field (shared instance; a missed filter leaks into real data).

### 5.6 Backups and the `.housey` container

- Daily backup: `POST /api/backups` (zip of `pb_data`, stored in `pb_data/backups`), keep the newest 7 by cron setting `cronMaxKeep`; safety copy before import via the same API.
- `.housey` format 2: header JSON (as today) + the PocketBase backup zip bytes; `parseHead` keeps accepting `format 1` (raw SQLite) and imports it via the importer's code path (5.7) so old exports never become unreadable. Import = upload zip -> `POST /api/backups/upload` + `.../restore` (PocketBase restarts).
- HA add-on `backup: cold` keeps working: stop the add-on -> PocketBase shuts down gracefully -> Supervisor copies `/data`.

### 5.7 Importer for existing `housey.db` files (mandatory, safe by construction)

`scripts/import-housey-db.mjs --from <housey.db> [--dry-run] [--pb-dir ...]`
1. Opens the source with `new DatabaseSync(file, { readOnly: true })`. Never writes, renames or deletes it (nor its `-wal`/`-shm`). Refuses a source whose `user_version` is newer than the build's list.
2. **Backup first**: copies the source (with WAL via `VACUUM INTO <data>/backups/housey-pre-pocketbase-<ts>.db`, **[VERIFY]** VACUUM INTO on a read-only connection; fallback: file copy while the server is stopped) and prints its sha256.
3. **Dry run (default)**: prints per-table counts, the largest plan JSON vs PocketBase `maxSize`, plan revisions, blob bytes, events, settings keys; validates that every plan JSON parses; exits without touching PocketBase. A real run requires `--apply`.
4. **Apply**: only into an empty PocketBase data dir (refuses a non-empty one); order: dashboards (creating 'Home' from the single working plan), settings, blobs, resources, plans (working + versions keeping `created_at`/`updated_at`/`rev`), events; every record stores `legacy_id`, so a rerun is idempotent (skips existing).
5. **Verify**: counts equal per table; for every plan and version, canonical JSON of source == canonical JSON read back from PocketBase (parse both, deep-equal; byte equality is not guaranteed because PocketBase may re-serialize); for every blob, sha256 of downloaded file == source hash. Prints PASS/FAIL per table; non-zero exit on any FAIL.
6. Writes `import_log` into `meta` (time, counts, source sha256). **Never deletes the old file**; the owner archives it manually after weeks of use.
7. Rehearsal: run steps 2-5 on a COPY of `data/housey.db` into a temp `--pb-dir` with a temp PocketBase instance before ever touching the real one. Do not run against `data/**` from an agent.

### 5.8 Docker, add-on, dev, CI

- **Dockerfile**: new stage `FROM ${NODE} AS pocketbase` with `ARG TARGETARCH PB_VERSION=0.42.3`; install `unzip` + `ca-certificates`; download `https://ganigeorgiev.com/meta/pocketbase/pocketbase/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip`; `sha256sum -c` against committed `scripts/pocketbase.sha256` (both arches, from section 1, re-verified at implementation); `COPY --from=pocketbase /out/pocketbase /usr/local/bin/pocketbase`; `COPY pb_migrations ./pb_migrations`. Env `HOUSEY_PB_DIR=/data/pocketbase`. Volume `/data` already exists. ENTRYPOINT unchanged (node starts and supervises PocketBase); the chown loop in the entrypoint already covers `/data/pocketbase`.
- **Mirror**: attach the pinned zips to a GitHub release of the Doshy repo and fall back to it if the forge is unreachable (GitHub is archived upstream) so CI never depends on one self-hosted host.
- **Add-on** (`doshy/config.yaml`): no new options needed; optional `ports: 8090/tcp: null` + `ports_description` for the admin UI **[VERIFY]** HA semantics of a null port; `backup: cold` stays. `scripts/addon-env.mjs` maps an optional `pocketbase_admin` bool to `HOUSEY_PB_ADMIN`. Re-validate on a real Supervisor (add-on is still `stage: experimental`).
- **Dev on the Mac**: `scripts/get-pocketbase.mjs` (pinned version + sha256, writes `.pocketbase/pocketbase`, git-ignored, skipped when present); `npm run dev` runs it first; `HOUSEY_PB_BIN` overrides. First run needs network. `data/pb_data` replaces `data/housey.db` for dev data.
- **CI** (`.github/workflows/validate.yml`): run `get-pocketbase.mjs` (cached by version), PocketBase storage tests against the real binary on a temp dir; they FAIL (not skip) when the binary is missing in CI (`CI=true`), and print an explicit 'SKIPPED: no pocketbase binary' line locally so a skip is never silent.
- **Upgrade policy**: bump `PB_VERSION` + hashes only together with reading the changelog; PocketBase `migrate` runs automatically at start, always preceded by the same pre-migration backup (copy of `pb_data` by the supervisor when the binary version changed).
- **Rollback**: keep the previous image tag and `housey.db` (untouched). Delete `pb_data`, run the old image: it reads `housey.db` as before. Phones keep their localStorage plan and reconcile with the existing conflict UI.

### 5.9 Work packages (PocketBase track, additional to 4.7)

| WP | Scope | Owns | Size **[ESTIMATE]** |
|---|---|---|---|
| PB-1 Process + bootstrap | `lib/server/pocketbase.ts`, superuser secret, health/503, `instrumentation.ts` hook, `scripts/get-pocketbase.mjs`, `pb_migrations/` | those + `instrumentation.ts` | M (2 d) |
| PB-2 Adapter | `lib/server/pb/**` replacing `lib/db/*` module bodies, route glue, per-plan mutex | `lib/server/pb/**`, `lib/db/**` (rewritten), `app/api/db/**` glue | L (3-4 d); replaces WP-A |
| PB-3 Importer | `scripts/import-housey-db.mjs` + tests on fixture DBs | new files | M (2 d) |
| PB-4 Backup/everything | zip backups, `.housey` format 2 (+ reading 1), import via restore | `lib/everything.ts`, `lib/everythingClient.ts`, backup route | M (1.5 d) |
| PB-5 Test infra | per-token instance manager, CI step, storage tests | `lib/server/pb/testInstance.ts`, `.github/workflows/validate.yml` | M (1.5 d) |
| PB-6 Docker/add-on/docs | Dockerfile, entrypoint/healthcheck, add-on, docs rewrite | `Dockerfile`, `docker-entrypoint.sh`, `doshy/config.yaml`, `scripts/addon-env.mjs`, `docs/**` | M (1-1.5 d) |

Rollout: A -> PB-1 -> PB-2 -> (PB-3 rehearsal on a COPY) -> PB-4/PB-5/PB-6 -> product WPs B-F -> hardware verification -> real import (dry run, backup, apply, verify) -> keep `housey.db` for weeks.

---

## 6. Risks, unknowns, hardware verification

| # | Item | Track | Must verify |
|---|---|---|---|
| 1 | Switch latency and scene rebuild time with a 250 KB plan | both | Pi 5, Pi 4 (7" kiosk), phone |
| 2 | Sync engine regressions (dirty flags, conflict, stash with `planId`) | both | exhaustive `dbMerge` tests + manual two-device test |
| 3 | Two devices on different plans, one deletes/renames/sets default | both | manual + tests |
| 4 | Thumbnail drawing cost and size on Pi; WebP encode support on old Safari | both | `canvas.toBlob('image/webp')` fallback to PNG |
| 5 | Migration 4 on a real-sized DB (the owner's copy) | SQLite | rehearsal copy, timing, sha256 equality |
| 6 | HA add-on with the new image | both | real Supervisor (still experimental) |
| 7 | PocketBase RSS/CPU idle and under save load on arm64; cold start; `GOMEMLIMIT` | PB | Pi; measure with Next + Chromium |
| 8 | PocketBase logging to SD card; `settings.logs` tuning | PB | I/O observation |
| 9 | Availability of `ganigeorgiev.com` downloads; checksum stability | PB | CI dry run; mirror fallback |
| 10 | PocketBase upgrade behaviour (0.42 -> 0.43+) | PB | changelog per bump |
| 11 | `VACUUM INTO` on a read-only connection (importer backup) | PB | one-off experiment on a copy |
| 12 | Custom record ids vs 15-char limit for `m_<uid>` resources | PB | prototype; fallback `rid` field already in 5.2 |
| 13 | Unique partial index on `plans` via collection `indexes` | PB | prototype |
| 14 | Old tab open across the upgrade (`/api/db/plan` gone) | both | accepted; shows 'Not saved' until reload |
| 15 | Realtime events carrying whole plan records | PB, optional SSE | restrict `fields` in subscription options |

---

## 7. Open questions only the owner can answer

1. Accept the recommendation (SQLite multi-plan now, PocketBase deferred)? If PocketBase is a hard requirement, accept the costs in 2.3 and Part 5.
2. Which PocketBase capability do you actually want (admin UI, realtime sync, users/auth, S3)? Several have cheap SQLite equivalents (inspector route, SSE stream).
3. Where does the wall Pi run the server? (`docs/small-screens.md` recommends the server elsewhere; a second process matters most if it is on the Pi.)
4. Curtain automation: default plan only (proposed) or a per-plan switch?
5. 'Lock plan on this device' for kiosks, or is `?plan=<id>` enough?
6. Calendar events global (proposed) or per plan?
7. Plan cap 24 and 7-day soft-delete: OK? 'Recently deleted' list or only the 10 s undo toast?
8. UI word 'Plan' vs 'Dashboard'.
9. OK to drop `/api/db/plan*` with no alias (open tabs need a reload)?
