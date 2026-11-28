# Several homes (one Home Assistant per plan)

The same Doshy server can show several homes: 'Main flat', 'Holiday house', 'Parents'. Each **plan** is linked to one **home** (a Home Assistant address plus a long-lived token). Switching plans switches the whole live side: states, history, services, scenes, automations, calendar, notifications, energy setup, cameras and WashData all come from that plan's Home Assistant.

The Home Assistant the server was set up with (`HA_URL` / `HA_TOKEN`, or the add-on's Supervisor proxy) is the built-in **Main home** (id `main`). Every plan that names no home uses it, so a single-home Doshy behaves exactly as before: no extra request, no extra label, no extra form field.

## Using it

- **Add a home**: Plans panel > Homes > Add a home (also: command palette "Manage homes", Data panel > Other homes). Name, address (`http://homeassistant.local:8123`), long-lived token (Home Assistant: profile > Security > Long-lived access tokens). **Test connection** works before saving.
- **Pick a home for a plan**: the "Home Assistant" choice in the new-plan and edit-plan forms (only shown once there is a second home). A copy of a plan keeps its home.
- The top bar says `HA ONLINE · Holiday house` (the compact strip shows the name when that home is offline). A home that is off shows "Holiday house is offline"; the other homes are unaffected.
- **Delete a home**: refused while plans show it, unless you choose to switch those plans to the Main home.

## How it works

- Storage: table `ha_connections` (migration 6) and `dashboards.ha_connection` (nullable, references it, `ON DELETE SET NULL`). API: `GET/POST /api/db/connections`, `PATCH/DELETE /api/db/connections/<id>` (`?movePlans=1`), `POST /api/db/connections/test`. Code: `lib/db/connections.ts`, `lib/server/haUrl.ts`, `haProbe.ts`, `secretBox.ts`.
- The browser sends `X-Doshy-Home: <id>` (set by `lib/haHome.ts` from the plan on screen; absent = main) on every `/api/ha/*` call through `haFetch`. The server resolves it once per request (`resolveHa` in `lib/haServer.ts`); an unknown id is a plain 404, a token that cannot be read is a plain 409. Artwork `<img>` URLs carry `?home=` instead (an image cannot send a header).
- Caches are per home: the states list (and its ETag, which also covers the home id), areas, history, replay, calendar, notifications, energy setup, and the service-attribute cache. On a plan switch to another home the browser drops its states, history samples, notifications, calendar, areas and the "unchanged" memory, and ignores answers still on their way from the old home.
- Guest links never read the header: the live states of a guest link come from the home of the link's own plan, decided on the server.
- The dawn curtain automation still looks only at the default plan, now through that plan's home.
- The offline service worker never caches or serves `/api/ha/states` for an extra home (the one cached copy is the main home's).

## Threat model

- **Token at rest**: AES-256-GCM, random 32-byte key in `doshy.key` next to the database (Docker: `/data/doshy.key`, mode 0600, created on first use). A copy of the `.db` (daily backups, "download everything", safety copies, the throwaway test databases) holds only ciphertext, a plan export holds no token, and a restore on a machine without the key shows "Token needs to be entered again" for each home instead of failing. Back up `/data` as a whole only if you accept that it carries the key too. A damaged key file is kept as `doshy.key.bad-<time>` and replaced.
- **Token in use**: never returned by any API (the list shows name, address, the last 4 characters, status), never logged, never in an error sentence, never in the browser. A new address needs the token typed again, so a saved token cannot be pointed at another machine.
- **SSRF**: addresses must be `http(s)`, with no sign-in part, query or fragment. LAN, private and loopback addresses are allowed (Home Assistant lives there); link-local addresses are blocked (`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::/32`, and the IPv4-mapped forms), checked when saving, testing and on every call (a host name is re-resolved at most once a minute). Redirects are never followed with the token. Limit: the name is resolved once for the check and once to connect, so a hostile DNS that flips between the two can still win; closing that needs a custom connect function (a new dependency). Adding, changing and testing a home are same-origin only and limited to 10 a minute.
- **Switches**: `DOSHY_ALLOW_CUSTOM_HA=0` refuses adding or changing homes (existing ones keep working); `DOSHY_GUEST_ONLY=1` refuses it too.
- **Test isolation**: a request with `X-Housey-Test` works on a throwaway database that has no homes (its key file sits beside it), so extra homes never exist there unless a test makes them; the main home from the environment still answers reads.
- **A plan file** (`doshy-plan.json`) carries only the home's NAME. On import the new plan is linked only to a home with the same name; otherwise it starts on the Main home and the form says so.
