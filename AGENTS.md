# Doshy: context for agents and contributors

Isometric Home Assistant dashboard and home design tool: Next.js 16, React 19, react-three-fiber, zustand, strict TypeScript, SQLite (`node:sqlite`).

- Run: `npm run dev`; verify with `npm run check` (typecheck + `node --test` over `lib/**/*.test.ts`). Do not run `next build` while `next dev` is running.
- Layout, rules (pure lib modules, plan compatibility, catalog golden test, quality tiers, DB test header) and dependency policy: [CONTRIBUTING.md](CONTRIBUTING.md). Docs index: [docs/README.md](docs/README.md).
- `data/`, `.env*`, `housey-plan.json` and `ref-img/` are the maintainer's local files and are git-ignored: never edit, commit or delete them. `data/housey.db` is real data: send `X-Housey-Test: <8-32 chars [a-z0-9]>` on every `/api/db/*` request when testing.
- Do not edit `lib/catalogBounds.golden.json`, `STARTER_VERSION` semantics, existing catalog kind ids or `Def` sizes: saved plans depend on them.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
