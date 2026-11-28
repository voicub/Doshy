# Contributing

## Run it

```bash
cp .env.example .env.local   # HA_URL and HA_TOKEN at least
npm install
npm run dev                  # http://localhost:3000
npm run check                # typecheck + all tests: run before every change goes in
```

Other scripts: `npm run typecheck`, `npm test`, `npm run test:watch`, `npm run build`, `npm start`. Node 22.13 or newer (the database uses `node:sqlite`; tests use Node's type stripping and test runner, no extra tooling).

## Where things live

| folder | what |
|---|---|
| `app/` | Next.js App Router: the single page, the manifest, and `app/api/*` route handlers (`ha`, `db`, `models`, `site`, `automation`). Routes stay thin: validation and logic live in `lib/`. |
| `components/` | React UI. `components/scene/` is the react-three-fiber 3D scene, `components/plan/`, `components/inspector/` and `components/ui/` are panels and widgets. |
| `lib/` | Everything that is not React: plan model and geometry, catalog (`catalog*.ts`, `decor/`, `garden/`, `animals/`), procedural cars, vegetation, textures, the zustand stores, Home Assistant client and server helpers, `lib/db/` (SQLite), `lib/server/` (caches, background work). |
| `docs/` | Feature and operations docs, indexed in [docs/README.md](docs/README.md). |
| `public/` | PWA icons. No third-party 3D models are bundled. |

`lib/` never imports from `components/` or `app/`.

## Rules the project follows

- **Pure `lib` modules are tested by plain `node`.** A module that has a `*.test.ts` imports its neighbours with the `.ts` extension (`./geometry.ts`), and imports no React, no browser globals and no `@/` path alias. Browser-side modules (stores, hooks) may use extensionless imports and are not unit tested.
- **No new npm dependencies** without a very good reason; check whether three, drei, zustand or the standard library already do it.
- **Tests**: `lib/**/*.test.ts`, `node:test` + `node:assert/strict`, static imports only. A test should fail when a user-visible behaviour, boundary, invariant or past regression breaks. Do not pin wording, incidental defaults or implementation details; do not assert only "does not throw"; no wall-clock sleeps (inject a clock), no real network or Home Assistant (inject `fetch`), write files only in a temp dir.
- **Saved plans must keep loading.** Plans are stored as JSON in the browser and in the database; never rename an existing catalog kind id, never change a `Def` size (`w`, `d`, `h`), never repurpose a stored field. New plan fields are optional and read with a default. Changing the starter flat means bumping `STARTER_VERSION` in `lib/starterPlan.ts` deliberately.
- **Catalog bounds golden test**: `lib/catalogBounds.test.ts` compares each kind's size and silhouette to `lib/catalogBounds.golden.json`. A catalog edit that fails it changes how already-saved plans look: fix the edit, not the golden file.
- **Graphics quality tiers** (`lib/quality.ts`): every realism feature reads its numbers from `knobs()` for the current tier (Eco ... Ultra) so it scales down on weak devices (a Raspberry Pi is a target). Do not hard-code a detail level in the scene; add a knob.
- **HUD colours come from theme tokens** (`app/theme-tokens.css`, [docs/themes.md](docs/themes.md)): in CSS and inline styles use `var(--text)`, `rgb(var(--accent-rgb) / .2)` and friends, never a hex or `rgba(...)` literal, so every theme (including the light one) can recolour your UI. Colours stay literal only where they are physical (3D materials, lamps, weather, heat-map palettes, data colours).
- **Database**: schema changes are forward-only migrations in `lib/db/migrations.ts`; never edit a shipped one (migration 4, which introduced several plans, is the pattern: new tables and columns, existing rows moved in the same transaction, a test that migrates a real-shaped file of the previous schema). An existing database is copied to `backups/housey-before-v<N>-<time>.db` automatically before any migration runs, and is never migrated if that copy fails. Every plan function takes the plan's (dashboard) id; the UI says "Plan", code and API say "dashboard". Route handlers must work against the throwaway database when a request carries `X-Housey-Test: <8-32 chars [a-z0-9]>` (development only); use that header for any manual or browser testing so you never touch `data/housey.db`.
- **Secrets** (`HA_TOKEN`, `SKETCHFAB_TOKEN`) are read on the server only and never sent to the browser.
- **TypeScript is strict** (plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`). No `any`; narrow or validate data from Home Assistant, storage, the database and the network instead of casting it.
- Files stay under about 800 lines and functions short; comments say why, not what.

## Dependencies

Runtime dependencies are `next`, `react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `@phosphor-icons/react`, `geist` and `zustand`; all are imported by the code. Versions use caret ranges and `package-lock.json` is the pin: commit it with any dependency change, and review `npm audit` before releasing.

## Credits

Data and licences of third-party services are listed in [CREDITS.md](CREDITS.md); keep it current when a data source changes.
