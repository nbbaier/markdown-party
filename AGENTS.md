# markdown-party

Real-time collaborative markdown editor backed by GitHub Gists, deployed on Cloudflare Workers + Durable Objects.

## Commands

- **Build**: `bun run build` (runs `tsc -b && vite build`)
- **Dev server**: `bun run dev`
- **Typecheck**: `bun run typecheck` (uses `tsgo --noEmit`)
- **Lint/format check**: `bun run check` (Ultracite/Biome)
- **Lint/format fix**: `bun run fix`
- **Generate worker types**: `bun run types` (wrangler types)
- **No test runner is configured.**

## Architecture

- **`src/`** — React 19 SPA (Vite): Milkdown editor, Yjs collab via y-partyserver, react-router-dom routing.
- **`worker/`** — Cloudflare Worker: Hono HTTP router (`worker/routes/`), `GistRoom` Durable Object (`worker/gist-room.ts`) extending YServer for Yjs CRDT sync + DO SQLite persistence. Entry: `worker/index.ts`.
- **`src/shared/`** and **`worker/shared/`** — shared types/utilities scoped to client and worker respectively.
- **Config**: `tsconfig.json` references `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json`. Wrangler config in `wrangler.jsonc`. Biome config in `biome.jsonc` extends `ultracite/biome/core` + `ultracite/biome/react`.

## Code Style

- TypeScript strict mode (`strictNullChecks`). Prefer `unknown` over `any`, use narrowing over assertions.
- `const` by default, arrow functions, `for...of`, template literals, destructuring, `?.` and `??`.
- React: function components, hooks at top level, semantic HTML, accessibility attributes.
- Async: `async/await` only, no raw `.then()` chains. Throw `Error` objects, use early returns.
- Run `bun run fix` before committing. No `console.log` or `debugger` in production code.
