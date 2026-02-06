# gist.party — MVP Implementation Plan

## Overview

The MVP is structured into 4 phases. Phase 1 contains 4 independent work streams that can be developed in parallel after scaffolding is complete. Phase 2 integrates them, and Phase 3 hardens the result.

---

## Phase 0: Project Scaffolding

> **Goal**: A deployable skeleton — Vite dev server, Worker, and a single DO all running locally.

### Tasks

1. Initialize Vite + React + TypeScript project
2. Set up Cloudflare Worker with Hono as the HTTP router
3. Configure `partyserver` + `y-partyserver` for Durable Objects
4. Create `wrangler.toml` with all bindings (KV namespace, DO binding, secrets placeholders)
5. Install all dependencies:
   - Editor: `@milkdown/core`, `@milkdown/react`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/plugin-collab`, `@milkdown/utils`, `@milkdown/plugin-listener`
   - CRDT: `yjs`, `y-partyserver`
   - Server: `partyserver`, `hono`
   - Rendering: `remark`, `rehype`, `rehype-sanitize`
6. Verify: `wrangler dev` starts, Vite HMR works, a stub DO responds to WebSocket upgrade

### Milestone

- `wrangler dev` serves the SPA and a hello-world DO accepts a WebSocket connection.

---

## Phase 1: Core Verticals (parallel)

Four independent streams. Each can be developed and unit-tested in isolation.

### Stream A — Auth System

> **Goal**: A user can sign in with GitHub and receive a verified JWT session cookie.

#### Tasks

1. **OAuth flow**: `GET /api/auth/github` (generate state + PKCE verifier, redirect to GitHub) and `GET /api/auth/github/callback` (exchange code for token, issue JWT cookie)
2. **JWT module**: Sign/verify JWTs with `exp`, `aud`, `iss`, payload `{ userId, login, avatarUrl }`. Must be usable in both the Worker and the DO (pure WebCrypto, no Node dependencies).
3. **Token encryption module**: AES-GCM encrypt/decrypt via WebCrypto. Versioned key prefix (`v1:<iv>:<ciphertext>`). Store encrypted GitHub access tokens in Workers KV keyed by `userId`.
4. **Refresh endpoint**: `POST /api/auth/refresh` — validate existing JWT, look up session in KV, issue new JWT.
5. **Logout endpoint**: `POST /api/auth/logout` — clear cookie, delete session from KV.
6. **CSRF protection**: Set `__csrf` cookie on auth responses. Middleware validates `X-CSRF-Token` header matches cookie on all POST routes.

#### Milestone

- End-to-end: click "Sign in" → GitHub OAuth → redirected back → JWT cookie set → `/api/auth/refresh` works → `/api/auth/logout` clears session.

---

### Stream B — GistRoom Durable Object

> **Goal**: A DO that syncs a Yjs document, persists to SQLite, and reads/writes GitHub Gists.

#### Tasks

1. **GistRoom class** extending `YServer` from `y-partyserver`
2. **DO SQLite schema**: `gistId`, `filename`, `etag`, `updatedAt`, `editTokenHash`, `lastSavedAt`, `pendingSync`, `pendingSince`, `initialized`, `ownerUserId`, plus Yjs snapshot blob
3. **`onLoad()`**:
   - Load Yjs snapshot from SQLite → apply to `this.document`
   - If no snapshot and room is initialized → fetch from GitHub API (decrypt owner token from KV), apply markdown to Yjs doc, store etag
   - Staleness check: if snapshot is older than 5 min, validate against GitHub. If `pendingSync` is true, enter conflict state. If not, apply remote content if newer.
4. **`onSave()`** (configured with 30s debounce, idle-save, flush-on-disconnect):
   - Always write Yjs snapshot to SQLite
   - If owner connected: PATCH GitHub with `If-Match: <etag>`. On 412 → pause autosync, send "Remote changed" custom message. On 403/429/5xx → exponential backoff, send "Error (retrying)" message.
   - If owner not connected: set `pendingSync = true`, record `pendingSince`
5. **`isReadOnly(connection)`**: validate edit capability cookie. Return `true` if missing/invalid.
6. **`onCustomMessage()`**: handle sync status queries, conflict resolution actions (owner-only: push local / discard local)
7. **Hibernation**: `static options = { hibernate: true }`, `onLoad()` handles rehydration
8. **Limits**: 2 MB max document size on inbound updates, per-IP and per-room connection limits, message rate limiting

#### Milestone

- A test client connects via WebSocket, edits are persisted to SQLite, and a mock GitHub API receives conditional PATCHes. Read-only connections cannot modify the document.

---

### Stream C — Editor UI

> **Goal**: A collaborative Milkdown editor with sync status indicators and conflict resolution UX.

#### Tasks

1. **Milkdown setup**: `@milkdown/core` + `@milkdown/react` with `preset-commonmark` and `preset-gfm`
2. **Collab plugin**: Wire `@milkdown/plugin-collab` to a `Y.Doc` and `YProvider` from `y-partyserver/provider` (configure with `party: "gist-room"`, `room: gistId`)
3. **Awareness**: Cursor labels showing collaborator name + avatar (from JWT payload)
4. **App shell**: Router (`/` landing, `/:gist_id` editor/viewer), nav bar with auth state, "New Document" and "Import Gist" actions
5. **Sync status bar**: Reactive component showing current state:
   - "Saved" / "Saving…" / "Pending sync (owner offline)" / "Remote changed" / "Error (retrying)"
6. **Conflict resolution modal** (owner only): "Push local to remote" vs "Discard local, reload remote", with a markdown diff preview
7. **Pending sync banner**: Persistent banner with expiry date and "Download .md" button
8. **Read-only view**: Rendered markdown (remark + rehype + rehype-sanitize) for anonymous/unauthorized users
9. **Custom messages**: `provider.sendMessage()` / `provider.on("custom-message", ...)` for sync status and staleness warnings

#### Milestone

- Editor renders markdown WYSIWYG, two browser tabs show real-time collaborative cursors and edits against a local `YProvider` (can use a mock or local DO).

---

### Stream D — API Routes & Gist CRUD

> **Goal**: All REST endpoints for gist lifecycle and edit token management.

#### Tasks

1. **`POST /api/gists`**: Auth required. Create a new GitHub Gist (single empty `.md` file, secret by default, optional visibility param). Generate edit token (crypto-random, 32+ chars). Hash with SHA-256. Initialize DO room (set `initialized`, `ownerUserId`, `editTokenHash`, `gistId`, `filename`). Return `{ gist_id, edit_token }`.
2. **`GET /api/gists/:gist_id`**: Return gist metadata (title, filename, visibility, sync status, owner info). Auth optional (public metadata).
3. **`POST /api/gists/:gist_id/import`**: Auth required, owner only. Accept a gist URL, validate it has exactly one file (reject multi-file with error). Fetch content. Initialize DO room. Generate edit token. Return `{ gist_id, edit_token }`.
4. **`POST /api/gists/:gist_id/claim`**: Auth required. Accept `{ token }` in body. Hash and compare against DO storage. If valid, set edit capability cookie (HttpOnly, Secure, SameSite=Strict, path-scoped to `/parties/gist-room/:gist_id`, 24h TTL). Return 200.
5. **`POST /api/gists/:gist_id/edit-token`**: Auth required, owner only. Revoke current edit token (clear hash in DO, kick existing editor WebSockets). Generate new token. Return `{ edit_token }`.
6. **`GET /:gist_id/raw`**: If room initialized, return raw markdown as `text/plain`. Headers: `X-Content-Type-Options: nosniff`, `Cache-Control: no-cache`. If uninitialized, 404.

#### Milestone

- `curl` can create a gist, import a gist, claim an edit token, and fetch raw markdown. All endpoints enforce auth and CSRF where required.

---

## Phase 2: Integration

> **Goal**: All four streams wired together into a working app.

### Tasks

1. Wire `routePartykitRequest(request, env)` in the Worker to route `/parties/gist-room/:gist_id` WebSocket upgrades to GistRoom DOs
2. Connect the editor's `YProvider` to the live DO endpoint
3. Connect API routes to DO internals (create/import initialize room state, claim validates against DO-stored hash)
4. Wire auth context into the editor: detect owner vs collaborator vs anonymous, show/hide edit controls, enforce read-only fallback
5. Integrate the read-only rendered view at `/:gist_id` for unauthenticated or unauthorized users
6. End-to-end user flows:
   - Sign in → create doc → edit → auto-save to GitHub
   - Share edit link → collaborator claims → real-time co-editing
   - Anonymous visit → read-only rendered view
   - Disconnect owner → pending sync banner → reconnect → sync resumes

### Milestone

- Two users in different browsers can sign in, one creates a doc, shares an edit link, and both collaboratively edit with changes persisting to a real GitHub Gist.

---

## Phase 3: Security Hardening & Polish

> **Goal**: Production-ready security posture and edge-case handling.

### Tasks

1. **Headers**: `Content-Security-Policy` (no inline scripts, restricted `img-src`/`frame-src`), `Referrer-Policy: strict-origin`, `X-Content-Type-Options: nosniff` on all responses
2. **Rate limiting**: IP-based rate limiting on anonymous viewer requests (gist_id enumeration prevention)
3. **WebSocket hardening**: Enforce per-IP and per-room connection limits, message rate limiting, reject awareness updates from read-only connections
4. **Uninitialized room 404**: Serve a "Not hosted on gist.party" page for `/:gist_id` and `/:gist_id/raw` when the room is not initialized
5. **Pending sync durability**: 30-day retention, expiry banner, one-click `.md` export, discard after expiry
6. **Error UX polish**: GitHub API failure states (backoff + retry UI), auth refresh failure (graceful fallback to read-only + re-auth prompt)
7. **End-to-end testing** of all user flows, including conflict scenarios and error states

### Milestone

- All security headers present. Rate limits enforced. Conflict and error flows tested. Ready for first deploy.

---

## Dependency Graph

```
Phase 0 (scaffold)
  │
  ├── Stream A (auth) ─────────────┐
  │                                │
  ├── Stream B (GistRoom DO) ──────┤
  │                                ├── Phase 2 (integration) ── Phase 3 (hardening)
  ├── Stream C (editor UI) ────────┤
  │                                │
  └── Stream D (API routes) ───────┘
```

### Cross-stream dependencies to watch

| Dependency | Producer | Consumer | Interface |
|---|---|---|---|
| JWT sign/verify | Stream A | Stream B, D | Shared module (pure WebCrypto) |
| Token encryption | Stream A | Stream B, D | Shared module |
| DO SQLite schema | Stream B | Stream D | Schema definition |
| Edit capability cookie format | Stream D (claim) | Stream B (isReadOnly) | Cookie name + validation logic |
| Custom message protocol | Stream B | Stream C | Message type enum + payloads |

> **Recommendation**: Define the shared interfaces (JWT module, encryption module, DO schema, cookie format, custom message types) as the first task in Phase 1 before the streams diverge. This takes ~1 session and eliminates integration friction later.
