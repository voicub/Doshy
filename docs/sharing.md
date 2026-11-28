# Sharing

The **Share** button in the dock (also `Share...` in the command palette, `Share my pieces` in My pieces, and `Share a read-only link...` under **More** on a plan card) opens one dialog with four things you can do:

| | what it makes |
|---|---|
| Take a picture | a high-resolution PNG of the 3D view |
| Record a turntable video | a slow 360 degree spin around the home as a video file |
| Share a read-only link | a web address that lets someone look around the home, optionally behind a PIN |
| My pieces | a `.doshypack` file with your own furniture, and importing one |

Nothing here changes your plan. Each page loads the first time it is opened (`components/ui/sharePages.tsx`), so the wall display never downloads any of it.

## Furniture packs

`lib/pieceShare.ts` (parse, validate, build), `lib/pieceShareMerge.ts` (conflicts, the "Imported pack" grouping), `components/ui/SharePack*.tsx` (screens).

- **Export my pieces...** choose all or some of your pieces, a pack name, an optional author and licence note. One `.doshypack` file is a single JSON document: a header (`format`, `version`, `name`, `author`, `licence`, `created`, `app`), the pieces and, for pieces that are imported 3D models, the model files as base64 (only the models the chosen pieces use).
- **Import a pack...** shows what is in the file (name, author, licence note, a picture of every piece) before anything is added. A piece that is already there (same id or same name) is handled in plain words: **Keep both** (the new one gets `(2)`), **Replace mine**, **Skip**, or choose for each piece.
- Every imported piece is tagged with its pack, so **Packs you added** can remove a pack as a whole (it asks first).
- A pack is a file from a stranger. Limits (`PACK_LIMITS`): file 80 MB (checked on `File.size` before it is read), 200 pieces, 40 models, 40 MB of models, 8 levels of nesting, 400 000 objects, 2000 characters per text. Only known fields are copied (an allow-list per object), `__proto__`, `constructor` and `prototype` anywhere make the file hostile, names and ids are sanitised, a `.glb` must start with `glTF`. Model files go through the same checks as a model you import yourself.

## Snapshots and turntable video

`lib/snapshotSize.ts`, `lib/snapshotName.ts`, `lib/snapshotVideo.ts`, `lib/snapshotBridge.ts`, `components/scene/SnapshotBridge.tsx`, `components/ui/snapshotCapture.ts`, `turntableRecord.ts`, `SnapshotPage.tsx`, `VideoPage.tsx`, `SnapshotProgress.tsx`.

- **Picture**: 1x, 2x (default) or 4x of the view, clamped to what the graphics chip reports (`MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE`, `MAX_VIEWPORT_DIMS`) and to a total-pixel budget (6.5 MP on a small or Eco device, 12 MP with the full effects, 16 MP otherwise); the screen says when a size was reduced. The canvas only is saved, so no button or label is ever in the picture. The view is drawn once more at the larger pixel ratio in the same task, copied out, then put back (pixel ratio, background, clear colour, tone mapping are restored in `finally`); the frame loop is not touched.
  - **Transparent background** hides the ground plates and the backdrop and draws the picture straight with the renderer, without the finishing passes (the post stack writes a solid alpha over the whole picture). It looks plainer than the screen; the dialog says so.
  - **Caption** adds `Doshy: <plan name>` on a small plate, lower left. Off unless chosen.
- **Turntable video**: 6 to 20 s (6 s on a weak device), 30 fps, one full turn driven frame by frame through the camera rig, recorded from `canvas.captureStream` with `MediaRecorder` (MP4 when the browser can, else WebM; the screen says which). Where MediaRecorder is missing the page says so in words. The buttons are hidden while it records and only a progress bar with Cancel (or Esc) stays; the camera, the frame pacing and the HUD are restored afterwards, also after Cancel or an error. Keep the tab in front: browsers pause drawing in a background tab and the recording stops.
- File names: `doshy-<plan>-<date>-<size>[-clear].png`, `doshy-<plan>-<date>-<seconds>s.mp4|webm` (`lib/snapshotName.ts`).

## Read-only guest links

`Share > Share a read-only link` makes `https://<your host>/view/<token>` for **one** plan. The visitor sees the home in 3D (turn, zoom, look into one room, switch storeys) and nothing else: no editing, no devices to switch, no panels, no settings.

### What the owner chooses

Name (only you see it), an optional **PIN** (4 to 8 digits), **how long it works** (1 hour, 1 day, 7 days, never), **Show live states (read-only)** (off by default: on/off words and numbers for the lights and sensors the plan is linked to, under made-up ids, no names, pictures or attributes), **Show the real home location** (off by default: without it the plan has no coordinates, compass bearing or surroundings). Up to 10 links per plan. The list shows when each was last opened and **Turn off** removes a link at once. The address is shown **once**, when the link is made; the database keeps only its SHA-256.

### Read this first: the owner screen has no sign-in

Doshy has no login. **Anyone who can reach the Doshy address can open the owner screen, change your plan and (when Home Assistant is linked) switch your devices.** A guest link only limits what someone *with the link* can do; it does not hide the rest of the server. So guest links are only safe to send outside your home network when the public address reaches **only** the guest part. Two ways:

1. **A second Doshy for the public, `DOSHY_GUEST_ONLY=1`.** Start another copy of Doshy on the same database with `DOSHY_GUEST_ONLY=1` in its environment and expose only that one. It answers `404` to everything except `/view/*`, `/api/guest/*`, `/_next/*` (Next's own files), the icons (`/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/apple-touch-icon.png`, `/favicon.ico`) and `/manifest.webmanifest`. It starts no backups and no background jobs of its own (`instrumentation.ts`, `lib/db/connection.ts`). The gate is `proxy.ts` (Next 16's request gate, formerly "middleware") deciding with the tested `lib/guestOnly.ts`; paths that two programs could read two ways (`%2e`, `%2f`, `%5c`, `\`, `..`, `//`) are refused.
2. **A reverse proxy or tunnel in front of the ordinary Doshy** that lets through exactly the same list and nothing else. Whatever you use, the allow-list is:

   | path | why |
   |---|---|
   | `/view/*` | the guest page |
   | `/api/guest/*` | its data (plan, session/PIN, states, model files) |
   | `/_next/*` | Next's scripts, styles and fonts |
   | `/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/apple-touch-icon.png`, `/favicon.ico`, `/manifest.webmanifest` | icons |

   Everything else (`/`, `/api/db/*`, `/api/ha/*`, `/api/site/*`, `/api/models/*`, `/api/automation/*`, `/sw.js`) must be refused by the proxy. **Pass the visitor's address** (`X-Forwarded-For`): the PIN lockout is counted per address, and without it every visitor looks like one address and one person's wrong tries lock everybody. The server reads the **last** `X-Forwarded-For` entry (the one your proxy appended), never the first (the visitor can write that one).

   Nginx:

   ```nginx
   location ~ ^/(view/|api/guest/|_next/) { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }
   location ~ ^/(icon\.svg|icon-192\.png|icon-512\.png|icon-maskable-512\.png|apple-touch-icon\.png|favicon\.ico|manifest\.webmanifest)$ { proxy_pass http://127.0.0.1:3000; }
   location / { return 404; }
   ```

   Caddy:

   ```caddy
   example.com {
     @guest path /view/* /api/guest/* /_next/* /icon.svg /icon-192.png /icon-512.png /icon-maskable-512.png /apple-touch-icon.png /favicon.ico /manifest.webmanifest
     handle @guest { reverse_proxy 127.0.0.1:3000 }
     handle { respond 404 }
   }
   ```

   Cloudflare Tunnel: one ingress rule per path in the table (`service: http://localhost:3000`, `path: ^/(view/|api/guest/|_next/)`), then a final `service: http_status:404`. Use https at the public address: the PIN cookie is then `Secure`.

### What the visitor's browser does

The page keeps the shared plan **in this tab's memory only** (`lib/guestMode.ts`): it never reads or writes the Doshy copy of the plan, pieces or settings in that browser's storage (the same browser may be yours, trying the link), never starts the database sync, never calls Home Assistant. The only things stored are the device's own display and graphics settings (interface size, graphics quality, which graphics chip), which every Doshy page keeps. A guard on `window.fetch` (`lib/guestFetch.ts`) refuses, in the browser and with a console note naming the path, any request but `/api/guest/<its token>/...` and Next's files; device controls are switched off in the store and in `lib/ha.ts` (`assertLive`). These are belts for the page's own honesty; the server does not rely on them.

### Threat model

| threat | what is done |
|---|---|
| **Guessing a token** | 128 random bits (`crypto.randomBytes(16)`, base64url, 22 characters). Stored only as SHA-256. Requests with a token that matches no link are limited to 20 a minute per address (`unknown`), and every kind of "no such link" (unknown, malformed, revoked, expired, plan deleted) is the same `404` with the same words. |
| **PIN brute force** | PIN is optional and a second lock for a link that was forwarded. Stored as a salted `scrypt` hash (N=2^14, 16-byte salt); compared in constant time. 5 wrong PINs from one address for one link, or 25 from anywhere for one link, lock it for 15 minutes; the try is counted *before* the slow check so parallel requests cannot get extra tries, and a try during the lockout is refused even with the right PIN (`429`, `Retry-After`). Counters are in memory and bounded (a client inventing keys cannot grow them); a restart clears them. A PIN has only 4 to 8 digits: for a link that matters, also use a short expiry. |
| **Enumeration** | One `404` for all failures; list and revoke exist only on the owner routes (`/api/db/guest-links`), which a guest-only copy does not serve. |
| **Session cookie confusion** | After a right PIN: `doshy_guest`, `HttpOnly`, `SameSite=Strict`, `Path=/api/guest/<token>`, `Secure` over https, valid 8 hours or until the link expires. Its value is an HMAC keyed with that link's own PIN hash, so it works for that link only and dies with it. It is never sent to `/api/db`, `/api/ha` or another link. |
| **CSRF on create / revoke** | `POST /api/db/guest-links` and `DELETE /api/db/guest-links/<id>` go through the same checks as every `/api/db` write: `Sec-Fetch-Site` must be `same-origin` and the `Origin` host must equal the `Host` (or `X-Forwarded-Host`); counted by the write rate limit; JSON only, 4 KB. Verified: a cross-origin `Origin` and `Sec-Fetch-Site: cross-site` both get `403`. The PIN entry (`POST .../session`) is same-origin checked too. |
| **XSS in plan names** | Names are plain text twice: the server strips markup characters, control characters and line breaks and cuts them to 80 (`lib/guestPlan.ts`, `plainText`), and React shows them as text, never as HTML. The page title is set as text. |
| **Path traversal in resource ids** | `/api/guest/<token>/resource/<id>`: the id must match the resource id pattern **and** be a model file used by a custom piece of *this link's* plan, or a Poly Haven `material` texture worn by a floor, wall face, ground area or path of it; anything else (another plan's model, a photo, a backup, `..%2f..`) is the same `404`. Files are sent with `nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`. |
| **Leaking private data** | The plan is built from an allow-list (`lib/guestPlan.ts`): walls, openings, rooms, furniture, levels, roof, ground, paths and nothing else. Never included: scenes, notes, measurements, power flows, the floor photo, device names. Home Assistant ids are removed, or with live states replaced by made-up ids (`light.g3`) whose real ids stay on the server; live states pass a word list or a number and a few numeric attributes. Coordinates, bearing and surroundings only when the owner ticked the box. Checked against a real plan: no real entity id, no `scenes`, `site`, `annotations`, `trace`, `added` in the answer. |
| **DoS by huge plans or floods** | A plan is up to 5 MB: the cleaned answer is kept for 10 s per link and revision (32 entries), so polling guests do not each cause a parse. Per address: 240 requests a minute, 60 model downloads a minute. PIN bodies are read with a 256 byte cap. At most 10 links per plan; expired links are dropped 7 days after they expire. |
| **Caching by proxies and the browser** | Every guest page and answer: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` (`proxy.ts` and the handlers). The offline service worker never caches `/view/*` or `/api/guest/*` (`lib/swRules.ts`). |
| **Secrets in logs** | The handlers log nothing but "unexpected error" without detail (it could hold the address); nothing is put in a URL but the token itself; the token is never sent to the owner routes. |
| **Link kept after the plan is deleted** | A link to a deleted (soft-deleted) plan answers `404`; it works again if the plan is restored. |
| **An old link read by someone else** | Turn it off. It is a row delete: the next request is `404`, also for browsers holding a session cookie. A viewer already on the page notices at its next check (30 s). |
| **The owner screen on the same host** | Not protected by any of this (no sign-in, see above): use the allow-list or `DOSHY_GUEST_ONLY=1`. |

### Technical notes

- Table `guest_links(id, dashboard_id, token_hash, pin_hash, pin_salt, created_at, expires_at, last_used_at, label, live, location)` is migration 5 (forward only, safety copy first, like every migration; `docs/database.md`). Routes: owner `GET/POST /api/db/guest-links`, `DELETE /api/db/guest-links/<id>`; guest `GET/POST /api/guest/<token>/session`, `GET .../plan`, `GET .../states`, `GET .../resource/<id>`. Code: `lib/server/guest*.ts`, `lib/guestPlan.ts`, `lib/guestApi.ts`, `components/ui/Guest*.tsx`, `app/view/[token]/page.tsx`.
- The viewer polls the plan every 30 s (only redraws when its revision changed) and, with live states, the states every 5 s, only while the page is visible.
- `DOSHY_GUEST_ONLY=1` is read at request time by `proxy.ts`; restart the second Doshy after changing it.

## Checks

`npm run check` covers the pure parts and the server: pack parse and merge including hostile files (`lib/pieceShare.test.ts`), sizes, names and the turntable schedule (`lib/snapshot*.test.ts`), token and PIN hashing, lockout, expiry, revoke, the plan sanitiser, the route handlers on a temporary database, cookies and the guest-only gate (`lib/server/guest*.test.ts`, `lib/guestPlan.test.ts`, `lib/guestOnly.test.ts`), the page's request guard and API client (`lib/guestFetch.test.ts`, `lib/guestApi.test.ts`, `lib/guestMode.test.ts`).

Browser checks run in development against a throwaway database (`X-Housey-Test`, through a local proxy that forces the header), with the guest in a second, separate browser context:

- pack: hostile files rejected (prototype key, nesting, wrong type, not JSON, huge text), a valid pack previewed, added, re-imported with the conflict choices, exported, the export read back by the real parser, packs removed;
- picture: 2x PNG at exactly 2560x1600; transparent 1x with a see-through corner and the caption; the screen unchanged afterwards;
- video: 6 s MP4, 1600x1000, playable, HUD hidden while recording, camera and HUD back after;
- guest link with a PIN: 4 wrong PINs counted down, the 5th locks, the right PIN is refused during the lockout, a second link opened with its PIN shows the home, rooms can be looked into, clicking lights and floors sends nothing but the guest API's own requests; revoking the link gives `404` and the page says so; also a link without a PIN and with live states; screenshots at 1280x800 and 800x480.

Not verified in a browser: a guest page for a plan that uses an imported 3D model piece (the model route is covered by a handler test only), an https deployment behind a real reverse proxy or tunnel (the `Secure` cookie and `X-Forwarded-For` handling are unit-tested only), and a second Doshy started with `DOSHY_GUEST_ONLY=1` (the gate is a tested pure function; no second server was started).
