# Audit: what `refactor/spec-v2` actually gives us

- **Date:** 2026-07-10
- **Ticket:** [Audit what refactor/spec-v2 actually gives us](https://github.com/nbbaier/markdown-party/issues/6) (wayfinder:research, part of map [#4](https://github.com/nbbaier/markdown-party/issues/4))
- **Branch state audited:** `refactor/spec-v2` @ `9af5db1` (latest); 22 commits ahead of merge-base `c9b5162` (2026-02-10)
- **Method:** static inspection of every worker/shared/client module + a real `bun install` / `typecheck` / `build` / `lint` run in a throwaway worktree.

## TL;DR

The "no backend yet" framing is **stale**. `refactor/spec-v2` is a working full-stack collaborative markdown app: ephemeral anonymous docs, 24h TTL, real Yjs multiplayer, capability edit tokens, GitHub OAuth (PKCE), and debounced Gist auto-sync — all real, none stubbed. Of the review's 4 P1 / 13 P2 findings, **all 4 P1 and every P2 I spot-checked are fixed** in the 15 commits that landed after the review.

Two caveats: (1) the **build is currently broken** by a trivial filename-casing regression in the last commit; (2) the app is **not deployed** anywhere reachable. The editor is **Milkdown**, but the coupling is contained to essentially one component — swapping in Tiptap is an editor-leaf rewrite, not a backend rewrite.

---

## 1. Capabilities — real vs. stubbed

| Capability | Status | Evidence |
| --- | --- | --- |
| Anonymous ephemeral docs | **Real** | `DocRoom` DO creates a room per `doc_id`; `POST /api/docs` mints a `joyful`-format id + edit cookie |
| 24h TTL / auto-expiry | **Real** | `ANONYMOUS_TTL_MS`; alarm-based `checkAndScheduleTtlAlarm()` → `storage.deleteAll()`; skipped for signed-in (persistent) docs |
| Yjs real-time collab | **Real** | `DocRoom extends YServer` (y-partyserver); Yjs snapshots persisted to `yjs_snapshot` SQLite table; `/parties/*` WS route |
| Awareness / cursors | **Real** | `use-collab-provider` sets awareness user field (name/color), guest fallback |
| Edit tokens (capability) | **Real** | claim flow `POST /:doc_id/claim`; SHA-256 hash stored in `room_meta`; timing-safe compare; edit-capability cookie |
| GitHub OAuth | **Real** | PKCE, `state` bound to `__oauth_state` cookie, session in `SESSION_KV`, refresh + logout routes |
| Gist persistence (auto-sync) | **Real** | `onSave()` → debounced `syncToGitHub()` → `writeToGitHub()`; retry/backoff; remote-change + conflict handling; `canonical_markdown` table feeds `/raw` and sync |
| Upload / drag-drop import | **Not implemented** | Deferred to post-MVP per plan; no handler present |
| Import **from** GitHub (two-way) | **Not implemented** | SPEC-v2 describes it; no import route exists (only `POST`/`DELETE /:doc_id/github` to *link/write*) |
| Repo-file destination (vs Gist) | **Not implemented** | Marked "future" in SPEC-v2 |

Bottom line: the entire anonymous-collab + Gist-persistence core is real and coherent. The gaps are all *inbound import* features, explicitly deferred.

## 2. Health — build / typecheck / lint / deploy

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `tsgo --noEmit` | ✅ **Pass** |
| Build | `tsgo -b && vite build` | ❌ **Fails** |
| Lint | `ultracite check` | ❌ **2 errors** |
| Deploy | `curl https://markdown.party` | ❌ **Not live** (no response) |

**The build/lint failure is a single trivial regression** introduced by the *last* commit `9af5db1 "chore: renamed editor and app"`:

- Files on disk are `src/App.tsx` and `src/client/components/Editor.tsx` (capitalized).
- Imports reference `./app` and `../components/editor` (lowercase) in `main.tsx`, `doc-page.tsx`, `use-editor-markdown.ts`.
- macOS's case-insensitive FS lets the dev server and `tsgo --noEmit` tolerate it, but the composite build (`tsgo -b`, TS1149/TS1261) and Biome flag it.

Fix is a one-line-per-import casing alignment. At the *review commit* (`37c0834`) the tree built clean; this regression is post-review.

**Deploy config exists** (`wrangler.jsonc`: `DOC_ROOM` DO + SQLite migration, `SESSION_KV`, SPA asset binding) but there's no evidence of a live deployment; `markdown.party` does not resolve/respond.

## 3. State of the code-review findings

Source: `docs/reviews/2026-02-11-refactor-spec-v2-code-review.md` (written at `37c0834`; 15 commits followed).

**P1 — all 4 fixed:**

| Finding | Fix verified |
| --- | --- |
| P1-1 timing-unsafe token compare | `timingSafeEqual()` via `crypto.subtle.timingSafeEqual` (`doc-room.ts:649`) |
| P1-2 CSRF bypass for anon | `csrfMiddleware` now issues a token to every visitor (`csrf.ts:34-36`) |
| P1-3 `doc_id` cookie injection | `DOC_ID_REGEX` validation on all doc routes (`docs.ts`) |
| P1-4 `gist_id` SSRF | `GIST_ID_REGEX` + filename validation (`docs.ts`) |

**P2 — every one spot-checked is fixed:** rate limiting (P2-1, `worker/shared/rate-limit.ts` wired into create/claim/refresh), typed DO broadcasts (P2-3), CryptoKey caching (P2-4, `keyCache` Map), base64url dedup (P2-6, `shared/base64url.ts`), `doc-meta.ts` now imported everywhere (P2-8), `WorkerEnv` consolidated (P2-9, `worker/shared/env.ts`), `use-collab-provider` deps on `user?.userId` (P2-12), OAuth state bound to cookie (P2-13). Plan gaps (sync-status indicator, ConflictModal wiring) were closed by `de5d6ba`. Dead code called out in P3-5 (`getDefaultJwtOptions`, `needsReEncryption`, `MESSAGE_DIRECTION`) is gone.

Net: the branch is in materially better shape than the review snapshot implies. Treat the review as **largely historical**, not an open task list.

## 4. Editor coupling — how welded to Milkdown?

**Lineage first (matters for the decision):** **Milkdown was the original editor** — it's present at the merge-base `c9b5162` and before. The branches then diverged on the editor: `main` **migrated *off* Milkdown to Tiptap** in commit `0c2160c` ("rewrite: replace editor foundation with Tiptap-based v2", via `rewrite/editor-foundation` → PR #3, a single commit that both added `@tiptap/*` and removed `@milkdown/*`); `refactor/spec-v2` **kept Milkdown** and built the backend on it. So a "swap spec-v2 to Tiptap" is not adopting a novel editor — it's re-converging on the editor `main` already deliberately chose.

**Milkdown touches exactly 4 files, and only one is real coupling:**

- `src/client/components/Editor.tsx` — the only substantive coupling (~230 lines); wires `@milkdown/*` presets + `@milkdown/plugin-collab`.
- `src/client/pages/doc-page.tsx` — just renders `<Editor doc=... awareness=... />`.
- `src/client/styles/editor.css` — styling.
- `src/shared/markdown-protocol.ts` — a *comment* only.

**The backend/collab layer is fully editor-agnostic:**

- `use-collab-provider` produces a Yjs `Doc` + `Awareness` from `y-partyserver` — no editor dependency.
- `DocRoom` stores/loads **Yjs snapshots** — no editor dependency.
- `Editor.tsx` receives `doc`/`awareness` as props and binds them via `collabService.bindDoc()` / `setAwareness()`.

**Cost to swap in Tiptap:** moderate and contained. Both Milkdown and Tiptap are ProseMirror-based and bind Yjs through `y-prosemirror`, so the collab model carries over. The work is:

1. Rewrite `Editor.tsx` against `@tiptap/react` + `@tiptap/extension-collaboration` (+ collaboration-cursor), swap the `@milkdown/*` deps.
2. Add a markdown **serialization shim** (e.g. `tiptap-markdown`) so `getMarkdown()`, the `canonical_markdown` table, `/raw`, and GitHub sync keep producing equivalent markdown — Milkdown gives this for free via remark; Tiptap needs it wired.

Everything else — provider hook, DocRoom, sync/TTL, edit tokens, OAuth, routes — is untouched. **This is the single biggest reason the branch is reusable regardless of which editor `main`'s direction favors.**

## 5. Architecture surface — reusable regardless of direction

**Worker routes** (`worker/index.ts` + `routes/`):
- `GET /api/health`
- `GET /api/auth/github`, `/github/callback`; `POST /api/auth/refresh`, `/logout`
- `POST /api/docs` (create, rate-limited); `GET /api/docs/:doc_id`; `POST /:doc_id/claim` (rate-limited); `POST /:doc_id/edit-token`; `POST` + `DELETE /:doc_id/github`
- `GET /:doc_id/raw` (canonical markdown)
- `ALL /parties/*` (partyserver WS upgrade) → SPA fallback

**DocRoom Durable Object** (`worker/doc-room.ts`, ~1,200 lines): `extends YServer`; SQLite tables `room_meta`, `yjs_snapshot`, `canonical_markdown`; alarm-based TTL; `onSave` GitHub sync with retry/backoff; connection-capability model (owner/editor), `MAX_CONNECTIONS=50`; discriminated-union message protocol.

**Shared modules:**
- `shared/` — `jwt.ts`, `encryption.ts`, `base64url.ts` (key-cached crypto)
- `src/shared/` — `doc-meta.ts`, `edit-cookie.ts`, `messages.ts`, `markdown-protocol.ts`, `sync-state.ts`
- `worker/shared/` — `env.ts`, `session.ts`, `csrf.ts`, `rate-limit.ts`, `auth-middleware.ts`

All of the above (transport, persistence, auth, capability tokens, TTL, sync) is **editor- and product-direction-independent**. The only swappable leaf is the editor component itself.

---

## Implications for the reconciliation decision (map #4)

- The choice is **not** "backend vs. no backend" — spec-v2 *is* the backend, and it works. The real question is which **editor** the reconciled codebase standardizes on, since that's the one welded seam.
- That question is **already half-answered by history**: Milkdown was the original, and `main` deliberately migrated off it to Tiptap (`0c2160c`). Standardizing the reconciled codebase on Tiptap keeps a direction the project has already committed to, rather than reviving the editor it chose to leave.
- `main`'s Tiptap editor and spec-v2's backend are **compatible in principle** (shared ProseMirror + Yjs lineage); porting the editor onto the backend costs ~1 component rewrite + a markdown-serialization shim.
- Before any build effort: land the trivial casing fix so `refactor/spec-v2` builds green again, and decide whether to actually deploy it (config is ready).
