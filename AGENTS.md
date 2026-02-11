# markdown-party

Real-time collaborative markdown editor with optional GitHub Gist persistence. Deployed on Cloudflare Workers + Durable Objects.

## Commands

- **Build**: `bun run build` (runs `tsc -b && vite build`)
- **Dev server**: `bun run dev`
- **Typecheck**: `bun run typecheck` (uses `tsgo --noEmit`)
- **Lint/format check**: `bun run check` (Ultracite/Biome)
- **Lint/format fix**: `bun run fix`
- **Generate worker types**: `bun run types` (wrangler types)
- **No test runner is configured.**

## Architecture

### Overview

markdown.party is a collaborative markdown editor where anyone can create and edit documents instantly — no sign-in required. Documents are identified by human-readable IDs (e.g., `golden-marble-cathedral` via the `joyful` library). Anonymous docs are ephemeral (24h TTL), while signed-in users can save to GitHub Gists for persistence.

### Key Components

- **`src/`** — React 19 SPA (Vite):
   - Milkdown editor with slash commands and floating tooltip
   - Yjs collaboration via y-partyserver
   - react-router-dom routing (`/` creates doc, `/:docId` edits)

- **`worker/`** — Cloudflare Worker:
   - Hono HTTP router (`worker/routes/`)
   - `DocRoom` Durable Object (`worker/doc-room.ts`) extending YServer for Yjs CRDT sync + DO SQLite persistence
   - Entry: `worker/index.ts`

- **`src/shared/`** and **`worker/shared/`** — shared types/utilities scoped to client and worker respectively

### Document Lifecycle

1. User visits `/` → SPA creates doc via `POST /api/docs` → Gets `{ doc_id, edit_token }`
2. Cookie set for edit capability → Redirected to `/:doc_id`
3. WebSocket connects to `/parties/doc-room/:doc_id`
4. Yjs sync enables real-time collaboration
5. Share via `/:doc_id#edit=<token>` grants edit access
6. Anonymous docs expire 24h after last edit activity
7. Signed-in users can save to GitHub Gist (Phase 2)

### Config

- `tsconfig.json` references `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json`
- Wrangler config in `wrangler.jsonc`
- Biome config in `biome.jsonc` extends `ultracite/biome/core` + `ultracite/biome/react`

## Code Style

- TypeScript strict mode (`strictNullChecks`). Prefer `unknown` over `any`, use narrowing over assertions.
- `const` by default, arrow functions, `for...of`, template literals, destructuring, `?.` and `??`.
- React: function components, hooks at top level, semantic HTML, accessibility attributes.
- Async: `async/await` only, no raw `.then()` chains. Throw `Error` objects, use early returns.
- Run `bun run fix` before committing. No `console.log` or `debugger` in production code.
