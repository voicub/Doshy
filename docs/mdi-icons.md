# Material Design icons

Home Assistant's own icon set (Material Design Icons, `mdi:lightbulb`) can be used for device markers. Doshy gets the drawings from the Iconify API through its own server and keeps them, so the plan keeps working offline.

## What it does

- **Device icons** (Display panel): "From Home Assistant" (default) or "Doshy's own". With the first, a linked device wears the icon Home Assistant gives it: its own `mdi:` icon attribute, or a usual one for its kind (a door shows open or closed). A device with no icon keeps Doshy's marker. Saved on this device.
- **Choose icon** (inspector, on a linked device): tab "Doshy icons" is the built-in set of 90 icons; tab "Home Assistant (MDI)" has search over all Material Design icons, ready-made groups and "Used lately". An icon you pick always wins over the automatic one and is saved with the plan.
- "Automatic" clears your choice.

## How to use it

1. Select a linked device, open **Icon** and press **Choose icon**.
2. Switch to **Home Assistant (MDI)**. Type at least two letters, or pick a group.
3. Tap an icon once its drawing has loaded (cells are disabled until then).
4. The icon is stored in the plan (`plan.icons`) and survives export and import, other machines and guest links.

## What leaves the machine

Only an icon name or a search word, in a fixed URL to `api.iconify.design` with a User-Agent naming Doshy. Nothing about your home. Set `DOSHY_EXTERNAL_DATA=0` (also `off`, `false`, `no`) and the server never contacts Iconify: the routes answer 403 and the picker says "Downloads from the internet are switched off on this server". Icons already in your plan or browser cache still show.

## Safety: strict SVG check

An icon body comes from a third party and is stored in localStorage, in plans and in guest pages, so it is re-checked everywhere it is read (server, browser, plan load). Only `path`, `circle`, `rect` and `g` with numeric or fixed-word attributes pass; scripts, styles, links, event handlers, unknown elements or attributes, bad numbers, unbalanced groups or bodies over 6000 characters are dropped. The stored text is rebuilt from the checked parts. Names must be lower-case words joined by hyphens, at most 60 characters.

## Caches and limits

| where | what |
|---|---|
| server memory | 600 icons; found icons 24 h, "no such icon" 1 h; searches 1 h (100 entries) |
| server disk | `<HOUSEY_SITE_CACHE or data/site-cache>/mdi`, 8 MiB cap, disposable |
| browser | `housey-mdi-cache` in localStorage, newest 200 icons |
| plan | up to 200 different hand-picked icons (`MAX_PLAN_ICONS`); more is refused with a message |

- Per request: 1 to 40 names; search returns at most 96 (the picker asks 48).
- Rate limits: 300 requests a minute from browsers, and at most 60 calls a minute from the server to Iconify. Iconify timeout 10 s, answers capped at 512 KiB, redirects refused.
- The browser batches icons asked for within a moment (24 per batch), retries a failed ask after 1 minute and a missing icon after 10 minutes.
- Renamed icons (aliases) resolve to the parent drawing; flipped or rotated aliases are not used.

## Offline, guests and fallback

- Offline or Iconify unreachable: icons already cached or stored in the plan show; others are skipped and the picker says "The icon service cannot be reached right now".
- A marker without a drawing shows Doshy's own icon. The 90-icon Doshy set needs no network at all.
- Guest pages never call the icon routes (and with `DOSHY_GUEST_ONLY=1` they answer 404); guests see the drawings carried by the plan, else Doshy's own icon.

## Routes

`GET /api/icons/mdi?names=a,b` (one bad name refuses the list), `GET /api/icons/mdi/<name>` (404 if none), `GET /api/icons/search?q=lamp&limit=48`. Errors carry `code`: `off`, `slow_down`, `offline`, `failed`.

## For contributors

- `lib/mdi.ts` pure rules (name regex, `cleanMdiBody`, `cleanMdiIcon`, Iconify answer readers, cache helpers). `lib/mdiAuto.ts` automatic icon table. `lib/mdiPlan.ts` `plan.icons` (`iconsFor`, `withMdiIcons`, `withItemIcon`). `lib/mdiClient.ts` browser transport. `lib/mdiStore.ts` settings, cache, batching loader.
- `lib/server/mdiIcons.ts` the Iconify client (injected fetch, fixed host). `lib/server/mdiService.ts` shared gate (guest-only, same origin, `DOSHY_EXTERNAL_DATA`, rate limit) for `app/api/icons/**`.
- UI: `components/inspector/IconPicker.tsx`, `MdiPicker.tsx`, `components/ui/IconSettings.tsx`, `MdiGlyph.tsx`.
- Invariants: every body goes through `cleanMdiIcon`; plans keep only icons some item names; the guest page makes no icon requests.

## Not verified

- Live calls to Iconify and its current fair-use limits.
- That guest links and exports carry `plan.icons` end to end (read from `planFile.ts` and `mdiPlan.ts` usage, not exercised).
- Appearance of every automatic icon against Home Assistant's own.
