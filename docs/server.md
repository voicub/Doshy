# Server: Home Assistant routes, caches and background work

The server is light on purpose: it runs on a Raspberry Pi next to (or instead of) a bigger machine and must stay cheap 24/7. Everything here is about not doing work twice. The database side is in [database.md](database.md).

## Home Assistant routes (`app/api/ha/*`)

All calls go through `lib/haServer.ts` `ha()`: the token never leaves the server, and every call has a **10 s timeout** unless the route sets its own (history 30 s, calendars 8 to 10 s, cameras 8 s), so a stuck Home Assistant cannot pile up every browser's polls behind it. Several routes keep a short answer cache; they all use `lib/server/ttlCache.ts`, which also makes callers that ask while the same answer is being fetched **share that one fetch**, never keeps a failure, and holds a fixed number of keys.

| route | what the server does per request |
|---|---|
| `GET /api/ha/states` | Home Assistant's whole entity list (1000+) cut down to the attributes the dashboard draws (`lib/server/haStates.ts`), serialised **once** and kept 1 s, so any number of browsers cost Home Assistant at most one fetch a second. The reply has an `ETag`; a poller that sends it back as `If-None-Match` gets an empty **304** while nothing changed (`lib/ha.ts` `fetchStates` does, and then hands the store the same entity objects). `Cache-Control: no-store`: no 250 KB copy is written to the browser's disk cache on every poll. `POST /api/ha/service` and `/toggle` forget the cached list, so the re-read the dashboard does 0.4 to 0.6 s after a click is never answered from before the click. |
| `GET /api/ha/history` | cached 30 s per (entities, attributes, hours, points) |
| `GET /api/ha/areas` | Home Assistant renders a template over every area and entity: cached 60 s |
| `GET /api/ha/notifications` | opens one WebSocket to Home Assistant per uncached read: cached 10 s (`?fresh=1` skips the cache) |
| `GET /api/ha/energy-prefs` | opens one WebSocket to Home Assistant (`energy/get_prefs`) per uncached read, cached 60 s; answers `{ guess }` with the sensors of the Energy dashboard setup, or `{ guess: null }` when Home Assistant cannot be asked |
| `GET /api/ha/calendar/list`, `/events` | cached 20 s, events per calendar and range (one failing calendar is retried next time, the others stay cached) |
| `POST /api/ha/service` | the body is validated against the allowlist in `lib/haService.ts`; limits that depend on the entity (min/max, offered modes) come from its attributes, which are asked of Home Assistant at most once per 5 s per entity, so dragging a slider is one lookup, not one per move |
| `GET /api/ha/camera`, `/media-image` | one picture, rate limited; the camera route answers 304 when the picture did not change |

Measured on a reference install (1186 entities, a LAN Home Assistant): a states poll took 107 to 196 ms and 248 KB; a poll that finds nothing new now takes 5 to 16 ms with no body, and while the answer is under a second old Home Assistant is not asked at all. The shaping itself (parse, filter, serialise, hash) is about 6 ms of CPU on a fast laptop, paid once per fetch instead of once per browser per poll.

### Which Home Assistant (several homes, [multi-home.md](multi-home.md))

Every route above starts with `resolveHa(req)` (`lib/haServer.ts`): the home is the id in the request header `X-Doshy-Home` (no header, empty or `main` = the one from `HA_URL` / `HA_TOKEN` or the add-on's Supervisor proxy), and `haFor(home)` is the REST call for it. An unknown id answers a plain **404**, a saved token that cannot be read **409**; the header never reaches the guest routes (a guest link uses its own plan's home). All the caches above are keyed by home id (the states ETag also covers it), so two homes never share an answer; `GET /api/ha/states` also records whether each extra home answered, for the Homes list. The browser sets the header through `lib/haHome.ts` `haFetch`. `instrumentation.ts` starts the curtain loop once per server process: a **server restart** is needed for the loop to pick up a change to how it reaches Home Assistant (a hot reload keeps the loop that is already running).

## Files and models

- `/api/models/import` and `/auto` (a car model, up to 60 MB downloaded, about 40 MB served) and `/api/db/resources/<id>` hand the finished bytes to the socket as one chunk (`lib/server/bytesResponse.ts`). `new Response(bytes)` and `new Response(new Blob([bytes]))` both copy them first (about 25 to 35 ms and a second 40 MB in memory per request). A revalidating browser gets its 304 from the stored hash without reading the file.
- The tile and site caches (`data/site-tiles`, `data/site-cache`) are bounded: tiles to a byte cap (oldest first, counted once per start), site answers to 200 files (30 days; 10 minutes when a part failed). Requests for the same tile or place share one fetch (`inFlight`), and fetches to the third parties are rate limited.

## Background work

- **Dawn rule for curtains** (`lib/server/curtainAutomation.ts`, started from `instrumentation.ts`): one look a minute. It reads **only the home plan** (the server's default plan, `meta.default_dashboard`; other plans are ignored, because copies of a plan share cover entities and would double-command), re-reading it only when its revision changed or another plan became the home plan, and asks Home Assistant for just the sun and the linked covers (`states/<entity>`, a few small requests; past 8 entities it takes the full list once instead). Each look has a 10 s timeout, a failed look backs off to 15 minutes, and the loop lives on `globalThis`, so a hot reload cannot start a second one.
- **Daily backup and purge**: see [database.md](database.md#connection). The timer is checked once a minute, is `unref`'d, and does nothing unless the server has been idle for 10 s. It also removes plans deleted more than 7 days ago.

## Staying responsive (a screen left on for months)

- **Every request the page makes has a deadline** (`lib/requestTimeout.ts`: 15 s for small calls, 40 s for history, 120 s for file transfers). A request nobody answers (a wedged server, a half-open Wi-Fi socket, a proxy that swallowed it) holds one of the browser's six HTTP/1.1 connections to the server for minutes. Measured with a proxy that never answers `/api/ha/states`: the 3 s poll took all six connections in 15 s, after which every other call (plan saves, service calls, history, lazy panels) queued behind them while the 3D view and HUD kept running. Now one poll runs at a time (`lib/singleFlight.ts`), it gives up after 15 s and the banner says the server did not answer, and nothing else is held up.
- **Readings are checked on the way in** (`lib/server/haAttributes.ts`): `HAState` promises numbers, text and lists, and Home Assistant forwards whatever an integration sent. An attribute of the wrong type is dropped (a number sent as text is read as the number), so one odd reading cannot crash a component. The compiler asks for a line there whenever `HAState` gains an attribute.
- **A crash never leaves a blank page**: `app/error.tsx` (and `global-error.tsx` for the page shell) show a plain card, drop the readings and start again by itself, after 3 s, then 10 s, 30 s, and once a minute while the same problem keeps coming back (`lib/recover.ts`). The 3D view is watched too (`lib/frameWatchdog.ts`): a throw inside a frame callback skips the draw on every refresh (the picture froze for good and logged 60 errors a second), and graphics that were lost and never restored stayed on the notice for ever; with no finished frame for 10 s while the tab is visible the view is built again, waiting 20 s, 40 s, up to 5 minutes if that does not cure it.
- To reproduce any of this, put a small reverse proxy in front of `next dev` that can hold requests, rewrite `/api/ha/states` and add the `X-Housey-Test` header; a headless tab on the proxy's own origin also keeps its `localStorage` apart from other tabs.

## Deploying (`next build` and `next start`)

- `next.config.ts` keeps Next's defaults on purpose: gzip is on (`compress`), and there is nothing to configure for images (the app does not use `next/image`). Checked against the Next 16 docs and not changed: `poweredByHeader: false` only drops an `X-Powered-By: Next.js` header from page replies (a few bytes, no speed); `experimental.optimizePackageImports` is documented by Next as experimental and not recommended for production, so `@phosphor-icons/react` and `@react-three/drei` (not in Next's default list) were left alone until a production build can show a difference.
- Behind a reverse proxy that compresses (nginx, Caddy) set `compress: false` so a response is not compressed twice; on the Pi itself a browser on `localhost` gains nothing from gzip, but the polls are now mostly empty 304s, so it costs next to nothing.
- `output: "standalone"` (a trimmed `.next/standalone` folder) is **not** enabled: it does not copy `.env.local`, so `HA_URL` / `HA_TOKEN` would have to be set in the service's environment, and the data folders (`data/`, `HOUSEY_DB_PATH`) are resolved from the working directory. If you want the smaller deployment, set those variables in the systemd unit and check where `data/` ends up before trusting it.
- Node's built-in `fetch` keeps connections to Home Assistant alive (4 s idle timeout), which covers the 3 s poll; Doshy does not add an HTTP agent dependency for it.
