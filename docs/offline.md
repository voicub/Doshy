# Offline shell (service worker)

Doshy installs a small **service worker** (`public/sw.js`) in production builds. It lets a screen start and show its **last known state** when the Wi-Fi or the Doshy server is down, and keeps the app files on the device so a reload is quick.

> **What was and was not tested.** The decision rules and the worker's own functions (what it caches, what it never caches, stale marking, trimming, install, update and clean-up) are tested in `lib/swRules.test.ts`, which runs the real `public/sw.js` in a Node sandbox with a fake cache and a fake network. **A real service worker has not been run in a browser yet**: the dev server (`next dev`) cannot register it by design, so registration, the offline chip, the update toast and "Clear offline cache" are **unverified until a production build or Docker run** (see [Manual verification](#manual-verification)).

## Read this first: it needs https or localhost

Browsers register service workers **only on `https://` pages and on `localhost`**. A plain `http://pi:3000` or `http://homeassistant.local:3000` address **will not register a worker at all**: everything else in Doshy works as before, but there is no offline copy, no offline chip from the worker, and the Display row "Clear offline cache" is hidden (the browser reports no service worker support there).

Options:

- Put Doshy behind an **https reverse proxy** (Caddy, nginx, Nginx Proxy Manager, Home Assistant's own proxy ...). This is the proper fix.
- For a **kiosk only**, Chromium can be told to treat one address as secure: `--unsafely-treat-insecure-origin-as-secure=http://<server>:3000` together with `--user-data-dir=<a folder>`. That weakens the browser's security checks, so do not use it on a general-purpose profile (the same caveat as in [small-screens.md](small-screens.md)).
- The server machine itself, opened as `http://localhost:3000`, works without either.

## What it does

| | |
|---|---|
| **Page load** (`/`, any query string: the kiosk address `/?kiosk=1&plan=2` shares one stored page) | Network first. If the server does not answer within 3 seconds, is down, or answers with a server error, the stored page is shown. |
| **App files** (`/_next/static/*` scripts, styles and fonts, and the icons in `public/`) | Cache first: the file is kept the first time and served from the device afterwards. File names carry a hash, so a changed file has a new name. |
| **Last known states** (`GET /api/ha/states`) and **a plan's working copy** (`GET /api/db/dashboards/<id>/plan`) | Network first with a 6 second wait. If the network fails (or the server answers with an error such as Home Assistant being down) the stored copy is served and **marked stale**. |
| Everything else | Not touched: the worker does not answer, the browser behaves as if there were no worker. |

At install the worker fetches `/` and the script, style and font files named in its HTML, so the first offline start works. Files loaded later (for example a part of the 3D view that loads on demand) are stored the first time they are used. So: **after the first install, reload once while online** and the app is ready for offline.

## What it never caches

- Anything that is not a `GET` (saves, toggles, scenes, uploads, deletes). They go straight to the network.
- `/view/*` (the guest page, whose link token is in the address) and `/api/guest*`. The owner's stored page is never offered as an offline answer for a guest link.
- `/api/ha/service`, `/api/ha/scene`, `/api/ha/automation`, `/api/ha/camera` and every other route that is not named in the table above (the default is "do not touch").
- A request with an `Authorization` header, a `Range` header, or an `X-Housey-Test` header (the test database switch: a throwaway database must never be cached or served as the real one).
- Anything from another origin.
- `?since=` plan polls (their answer is a tiny "unchanged" note that must never replace a stored plan).
- Responses that are not a plain `200`, and any response over a size limit (8 MB for app files, 6 MB for a plan or states copy, 2 MB for the page).

Caches are named `doshy-static-v<version>`, `doshy-shell-v<version>` and `doshy-data-v<version>` and are bounded (400, 2 and 24 entries; the oldest are dropped first). A copy of the states is rewritten at most every 15 seconds.

## The offline chip

While the browser is offline, the states poll is failing, or the worker answered with a stored copy, a small chip near the top centre says **"Offline: showing the last known state (12 min ago)"**. The age is when the stored copy was made (or when the last live update arrived). It disappears by itself when live data returns. Before any live data has been seen it says "Offline: no live data yet". The existing "Home Assistant unreachable" banner and the "Offline, will sync" save status stay as they are.

When the worker is active and Home Assistant is down, the dashboard server's error is replaced by the stored states, so you may see the chip instead of the red banner.

## Edits need the server (no offline write queue)

Edits made while offline are **not queued by the worker**, on purpose. A second queue would compete with the one the app already has and could replay old writes over a newer plan. What happens instead is what always happened: the plan is saved in the browser at once, the corner shows "Offline, will sync" (or "Not saved" if the server refuses), and the app sends the change when the server is back, with its revision check (see [database.md](database.md)). Toggling a light or running a scene while offline simply fails, because Home Assistant cannot be reached.

### Why a stored plan can never overwrite a newer one

- The worker only stores and serves **reads**. A write (`PUT`/`POST`/`DELETE`) is never answered by it.
- Every answer the worker serves from its cache carries `X-Doshy-Cache: stale` and `X-Doshy-Cached-At: <time>`. `lib/dbApi.ts` treats such an answer **exactly like "server unreachable"** (the same path as being offline: the browser's own copy stays, edits wait). Without that, a stored plan older than this device's last save would have looked like "the server moved on" at start-up and replaced the newer local copy. The stale states answer, on the other hand, is accepted by `lib/ha.ts` and shown with the chip.
- A save still carries the revision it is based on (`baseRev`); the server refuses it if another save came first, and the existing conflict choice appears. A stale copy cannot change that number.

In practice the stored plan is a safety net: the app starts from the browser's own copy and does not use the worker's copy of the plan.

## Update toast

The worker's address carries the app version (`/sw.js?v=<package.json version>`; set at build time in `next.config.ts`). A new version installs a new worker, which **waits**. When it is ready a toast says **"A new version is ready. Reload"**. Reload makes the new worker take over (`skipWaiting`, only after your tap) and the page reloads once. Dismiss keeps the old version until the app is closed. The new worker deletes the old version's caches when it activates.

- A rebuild **without a version bump** installs no new worker: pages are network first, so a reload shows the new build anyway, and hashed files are new files.
- A kiosk that never reloads keeps its running page until Chromium restarts (the start script in [small-screens.md](small-screens.md) restarts it if you add the nightly cron line). The worker is checked for changes once an hour.
- After a version bump the first reload may show the toast although the page is already new; Reload is harmless.

## Clear offline cache

**Menu > Settings > Display > Offline copy > Clear offline cache** unregisters the worker, deletes every `doshy-*` cache and reloads. Use it if a stored copy ever misbehaves. Your plan and settings are not touched (they live in the browser's storage and the database). In a production build a fresh worker registers again after the reload. The row is hidden where the browser has no service worker support (plain http). In `next dev` the app also removes any Doshy worker an earlier production run left on the same address, so hot reload is never served from a cache.

## Raspberry Pi kiosk

- The Pi needs an https address (or the Chromium flag above), or none of this applies.
- With it, a Pi that boots before the server or loses Wi-Fi still shows the stored page and the last known state with the chip, then recovers by itself (the states poll runs every 3 seconds).
- The worker adds little work: it stores a copy of the states at most every 15 seconds and nothing else on a poll.

## For developers

- `public/sw.js` is a classic script that imports nothing. `lib/swRules.ts` holds the same decision table and constants for tests and for the page. **Change a rule in both**; `lib/swRules.test.ts` runs both on the same cases (and a wide matrix) and fails if they disagree.
- `lib/offlineWorker.ts` registers the worker (**only when `process.env.NODE_ENV === 'production'`**), watches for a waiting update, applies it and clears the cache. `components/OfflineClient.tsx` starts it and draws `components/ui/OfflineChip.tsx` and `components/ui/UpdateToast.tsx`; `components/ui/ClearOfflineCache.tsx` is the Display row. `lib/offlineStatus.ts` has the chip's text and time-ago helper.
- The worker only reads headers the page also reads (`X-Doshy-Cache`, `X-Doshy-Cached-At`): the names are constants in `lib/swRules.ts`.

## Manual verification

On a **production build** (`npm run build && npm start`, or the Docker image) opened as `http://localhost:3000` or over https. Do not run `next build` while `next dev` runs.

1. Open DevTools > **Application > Service Workers**: `sw.js?v=<version>` is "activated and is running". **Application > Cache storage** lists `doshy-static-v<version>`, `doshy-shell-v<version>` (one entry, `/`) and, after a few seconds, `doshy-data-v<version>` (`/api/ha/states`, `/api/db/dashboards/<id>/plan`).
2. Reload once, then tick **Offline** in the Service Workers panel (or the Network tab's throttling) and reload. The app starts, the chip says "Offline: showing the last known state (N min ago)". Untick Offline: the chip disappears within a few seconds.
3. While offline, change something in the plan: "Offline, will sync" appears; untick Offline: it saves and the plan keeps the change. Check that no write request is answered by the worker (Network tab: no "(ServiceWorker)" on PUT/POST).
4. Open the kiosk address `/?kiosk=1&plan=2` offline: it starts from the same stored page.
5. Open a guest link (`/view/<token>`) offline: the browser's own offline error, not the owner's dashboard.
6. Update flow: change `version` in `package.json`, rebuild, restart, reload the page: a worker with the new version waits ("waiting to activate"), the toast appears; tap **Reload**: the page reloads once, the new worker is active and the old `doshy-*-v<old>` caches are gone.
7. **Clear offline cache** (Display): the worker disappears from the Service Workers panel, no `doshy-*` caches remain, and the page reloads (and registers again).
8. Over plain `http://<other-host>:3000`: no worker registers, the Display row is absent, the app works as before.
9. `next dev`: no worker registers, and a worker left from step 1 on the same address is removed.
