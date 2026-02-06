# gist.party — MVP Implementation Plan

## Overview

The MVP is structured into 6 phases. Phases 1, 3, and 5 each contain independent tracks that can be developed in parallel. The critical path runs through scaffolding → auth + DO → API + collab → GitHub sync → conflict resolution UX. With 2–3 developers, Phases 1 and 3 offer near-linear speedup.

### Phase Summary

| Phase | Name | Tracks | Depends On |
|-------|------|--------|------------|
| 0 | Scaffolding | 1 (sequential) | — |
| 1 | Core Verticals | 3 (parallel) | Phase 0 |
| 2 | Integration | 2 (parallel) | Phase 1 |
| 3 | GitHub Sync, Permissions, Views | 3 (parallel) | Phase 2 |
| 4 | Conflict Resolution + Status UX | 2 (parallel) | Phase 3A |
| 5 | Security Hardening | 6 (parallel) | Phase 3 |

---

## Phase 0: Scaffolding

> **Goal**: A deployable skeleton — Vite dev server, Worker, and a single DO all running locally.

### Tasks

1. Initialize Vite + React + TypeScript project
2. Set up Cloudflare Worker with Hono as the HTTP router
3. Configure `partyserver` + `y-partyserver` for Durable Objects
4. Create `wrangler.toml` with all bindings (KV namespace, DO binding, secrets placeholders)
5. Wire `routePartykitRequest(request, env)` in the Worker for `/parties/gist-room/:gist_id`
6. Set up basic SPA serving via Cloudflare Worker Assets
7. Install all dependencies:
   - Editor: `@milkdown/core`, `@milkdown/react`, `@milkdown/preset-commonmark`, `@milkdown/preset-gfm`, `@milkdown/plugin-collab`, `@milkdown/utils`, `@milkdown/plugin-listener`
   - CRDT: `yjs`, `y-partyserver`
   - Server: `partyserver`, `hono`
   - Rendering: `remark`, `rehype`, `rehype-sanitize`
8. Verify: `wrangler dev` starts, Vite HMR works, a stub DO responds to WebSocket upgrade

### Milestone

`wrangler dev` serves the SPA and a hello-world DO accepts a WebSocket connection.

**No parallelism — this is the foundation for everything.**

---

## Phase 1: Core Verticals (3 parallel tracks)

Three independent tracks with no cross-dependencies. Each can be developed and tested in isolation.

> **Shared interfaces first**: Before the tracks diverge, define the contracts they share: JWT module signature, token encryption module signature, DO SQLite schema, edit capability cookie format, and custom WebSocket message types. This takes ~1 session and prevents integration friction in Phase 2.

### Track A — Auth System

> **Goal**: A user can sign in with GitHub and receive a verified JWT session cookie. Tokens are encrypted at rest.

#### Tasks

1. **OAuth flow**: `GET /api/auth/github` (generate `state` + PKCE verifier, redirect to GitHub) and `GET /api/auth/github/callback` (exchange code for access token, issue JWT cookie)
2. **JWT module**: Sign/verify JWTs with `exp`, `aud`, `iss`, payload `{ userId, login, avatarUrl }`. Must work in both Worker and DO (pure WebCrypto, no Node dependencies).
3. **Token encryption module**: AES-GCM encrypt/decrypt via WebCrypto. Versioned key prefix (`v1:<iv>:<ciphertext>`). On read, select decryption key by version; re-encrypt under current key on next write. Store encrypted GitHub access tokens in Workers KV keyed by `userId`.
4. **Refresh endpoint**: `POST /api/auth/refresh` — validate existing JWT, look up session in KV, issue new JWT (1-hour TTL).
5. **Logout endpoint**: `POST /api/auth/logout` — clear session cookie, revoke server-side session in KV.

#### Milestone

Click "Sign in" → GitHub OAuth → redirect back → JWT cookie set → `/api/auth/refresh` works → `/api/auth/logout` clears session.

---

### Track B — Milkdown Editor

> **Goal**: A functional markdown WYSIWYG editor with local editing (no collaboration yet).

#### Tasks

1. **Milkdown setup**: `@milkdown/core` + `@milkdown/react` with `preset-commonmark` and `preset-gfm`
2. **Markdown serialization**: `getMarkdown()` from `@milkdown/utils` for extracting markdown. On load, pass markdown as `defaultValue` parsed through the remark pipeline.
3. **Change listener**: `plugin-listener` for observing document changes (will be used for save triggers later)
4. **App shell**: React Router (`/` landing page, `/:gist_id` editor/viewer), nav bar with auth state placeholder
5. **UX plugins**: `plugin-slash` for slash commands, `plugin-block` for block-level drag-and-drop

#### Milestone

Editor renders markdown WYSIWYG. User can type, format, and extract the document as a markdown string. No collab or persistence yet.

---

### Track C — GistRoom Durable Object

> **Goal**: A DO that syncs a Yjs document across WebSocket connections and persists snapshots to SQLite.

#### Tasks

1. **`GistRoom` class** extending `YServer` from `y-partyserver`
2. **DO SQLite schema**: `gistId`, `filename`, `etag`, `updatedAt`, `editTokenHash`, `lastSavedAt`, `pendingSync`, `pendingSince`, `initialized`, `ownerUserId`, plus Yjs snapshot blob
3. **`onLoad()`**: Load Yjs snapshot from DO SQLite → apply to `this.document`. (GitHub fetch and staleness checks deferred to Phase 3A.)
4. **`onSave()`**: Write Yjs snapshot to DO SQLite (debounced to 30s via `callbackOptions`, with idle-save and flush-on-disconnect). (GitHub PATCH deferred to Phase 3A.)
5. **Hibernation**: `static options = { hibernate: true }`. `onLoad()` handles rehydration from storage on wake.
6. **`initialized` flag and `ownerUserId`**: Stored in DO SQLite. DO refuses to serve content unless room has been initialized by an owner.
7. **Limits**: 2 MB max document size on inbound Yjs updates. Per-IP and per-room WebSocket connection limits. Message rate limiting on all connections.

#### Milestone

A test client connects via WebSocket, sends Yjs updates, disconnects, reconnects — snapshot is restored from SQLite. Multiple clients see each other's changes broadcast by `YServer`.

---

## Phase 2: Integration (2 parallel tracks)

Both tracks depend on Phase 1 but are independent of each other.

### Track A — Real-time Collaboration (depends on Track 1B + 1C)

> **Goal**: Two browser tabs show real-time collaborative editing with cursors.

#### Tasks

1. **YProvider**: Wire `YProvider` from `y-partyserver/provider` to the Milkdown editor. Configure with `party: "gist-room"` and `room: gistId`.
2. **Collab plugin**: Enable `@milkdown/plugin-collab` — binds `ySyncPlugin`, `yCursorPlugin`, `yUndoPlugin` to the shared `Y.Doc`.
3. **Awareness**: Collaborator cursors, selections, and names (pulled from GitHub profile in the JWT payload).
4. **Custom messages**: Wire `provider.sendMessage()` and `provider.on("custom-message", ...)` for non-Yjs communication (sync status, staleness warnings — payloads to be used in Phase 4).

#### Milestone

Two browser tabs connected to the same GistRoom DO show real-time cursors and edits. Changes persist across page reloads via DO SQLite.

---

### Track B — API Routes (depends on Track 1A + 1C)

> **Goal**: All REST endpoints for gist lifecycle and room initialization.

#### Tasks

1. **`POST /api/gists`**: Auth required. Create a new GitHub Gist (single empty `.md` file, secret by default, optional visibility). Generate edit token (crypto-random, 32+ URL-safe chars). Hash with SHA-256. Initialize DO room (`initialized`, `ownerUserId`, `editTokenHash`, `gistId`, `filename`). Return `{ gist_id, edit_token }`.
2. **`POST /api/gists/:gist_id/import`**: Auth required, owner only. Accept gist URL, validate exactly one file (reject multi-file with clear error). Fetch content via GitHub API. Initialize DO room. Generate edit token. Return `{ gist_id, edit_token }`.
3. **`GET /api/gists/:gist_id`**: Return gist metadata (title, filename, visibility, sync status, owner info). Auth optional.
4. **Auth middleware**: Verify JWT on protected routes. Extract `userId` and `login` for downstream use.

#### Milestone

`curl` can create a gist, import a gist, and fetch metadata. DO rooms are initialized with correct ownership.

---

## Phase 3: GitHub Sync, Permissions, Views (3 parallel tracks)

Three independent tracks. Each depends on Phase 2 but not on each other.

### Track A — GitHub Gist Sync (depends on Phase 2B)

> **Goal**: Edits auto-save to GitHub with conflict detection.

#### Tasks

1. **`onLoad()` GitHub fallback**: If no SQLite snapshot exists, fetch Gist content from GitHub API (decrypt owner token from KV), apply markdown to Yjs doc, store etag.
2. **`onSave()` GitHub PATCH**: If the owner is connected, read token from KV (or in-memory cache), call `PATCH /gists/:id` with `If-Match: <etag>`. Store new `etag` and `updated_at` from response.
3. **412 handling**: If GitHub returns 412 (Precondition Failed), pause autosync, send "Remote changed" custom message to clients.
4. **Error handling**: On 403/429/5xx, pause autosync with exponential backoff. Send "Error (retrying)" custom message. Allow owner to trigger manual retry.
5. **Owner token lifecycle**: Cache owner's decrypted token in memory while connected. Drop cache on disconnect. Set `pendingSync = true` and record `pendingSince` when owner disconnects with unsaved changes.
6. **Staleness detection on load**: If snapshot is older than 5 minutes, validate against GitHub. If `pendingSync` is true, enter conflict state (do not overwrite local). If `pendingSync` is false and remote is newer, apply remote content.

#### Milestone

Create a doc → edit → changes auto-save to a real GitHub Gist. Edit the Gist externally → DO detects conflict on next save.

---

### Track B — Edit Permissions (depends on Phase 2B)

> **Goal**: Capability-based edit tokens control who can write.

#### Tasks

1. **`POST /api/gists/:gist_id/claim`**: Auth required. Accept `{ token }` in body. Hash and compare against DO-stored `editTokenHash`. If valid, set edit capability cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, path-scoped to `/parties/gist-room/:gist_id`, 24h TTL). Return 200.
2. **`POST /api/gists/:gist_id/edit-token`**: Auth required, owner only. Revoke current token (clear hash in DO, kick existing editor WebSocket connections). Generate new token. Return `{ edit_token }`.
3. **`isReadOnly(connection)`**: Validate the edit capability cookie on WebSocket connection. Connections without a valid cookie are read-only — `YServer` silently drops incoming Yjs updates. Awareness updates from read-only connections are also rejected.
4. **Client-side token exchange**: On opening an edit link (`gist.party/<gist_id>#edit=<token>`), extract token from URL fragment, POST to `/claim`, then connect WebSocket with the capability cookie.
5. **Revocation UX**: Owner clicks "Revoke" → existing editors are disconnected and must re-claim with a new link.

#### Milestone

Share edit link → collaborator claims token → edits are accepted. Revoke token → collaborator is kicked. Connections without valid capability are read-only.

---

### Track C — Read-only Views (depends on Phase 2A)

> **Goal**: Anonymous users and users without edit capability see rendered markdown.

#### Tasks

1. **Rendered view**: `/:gist_id` serves a rendered markdown page for unauthenticated or unauthorized users. Uses `remark` + `rehype` + `rehype-sanitize` (shared AST pipeline with Milkdown for consistency).
2. **Raw endpoint**: `/:gist_id/raw` returns raw markdown as `text/plain; charset=utf-8`. Headers: `X-Content-Type-Options: nosniff`, `Cache-Control: no-cache`.
3. **Uninitialized room 404**: If the room is not initialized, serve a "Not hosted on gist.party" page for both view and raw endpoints.
4. **View routing**: Detect auth state + edit capability. If authorized editor → load Milkdown editor. If not → load read-only rendered view.

#### Milestone

Anonymous user visits `gist.party/<gist_id>` → sees rendered markdown. `curl gist.party/<gist_id>/raw` → gets raw text. Uninitialized room → 404 page.

---

## Phase 4: Conflict Resolution + Status UX (2 parallel tracks)

Depends on Phase 3A (GitHub sync must be working for conflict states to exist).

### Track A — Staleness & Conflict Resolution

> **Goal**: Owner can resolve conflicts between local and remote state.

#### Tasks

1. **`onCustomMessage()` handler**: Receive conflict resolution actions from owner (`push_local`, `discard_local`). Restrict to owner connection only.
2. **Push local**: Owner chooses "Push local to remote" → DO force-patches GitHub (no `If-Match`), resumes autosync, broadcasts success to all clients.
3. **Discard local**: Owner chooses "Discard local, reload remote" → DO fetches fresh content from GitHub, replaces Yjs doc, resumes autosync, broadcasts updated state.
4. **Pending sync durability**: Retain unsynced state for 30 days. Track `pendingSince` timestamp. After 30 days, discard the unsynced snapshot.
5. **Pending sync on reconnect**: When owner reconnects with `pendingSync = true`, attempt to sync immediately. If conflict detected (etag mismatch), enter conflict state rather than overwriting.

#### Milestone

Edit Gist externally → DO detects conflict → owner sees modal → chooses push or discard → state resolves cleanly.

---

### Track B — Sync Status UI

> **Goal**: Users always know the current sync state of their document.

#### Tasks

1. **Status indicators**: Reactive component showing: "Saved", "Saving...", "Pending sync (owner offline)", "Remote changed", "Error (retrying)"
2. **Pending sync banner**: Persistent banner when `pendingSync` is true. Shows expiry date (`pendingSince` + 30 days). Includes "Download .md" one-click export button.
3. **Conflict resolution modal** (owner only): "Push local to remote" vs "Discard local, reload remote" with a markdown diff preview of local vs remote content.
4. **Manual retry**: When in error state, show a button for the owner to trigger a manual GitHub sync attempt.
5. **Warn on exit**: If `pendingSync` is true, show a `beforeunload` warning that changes are not yet synced to GitHub.
6. **Custom message wiring**: Subscribe to provider custom messages (`sync-status`, `remote-changed`, `error-retrying`, `conflict`) and update UI state accordingly.

#### Milestone

Full sync status lifecycle visible in UI. Conflict modal works end-to-end. Pending sync banner shows with export.

---

## Phase 5: Security Hardening (6 parallel tasks)

All tasks are independent of each other. Each can be implemented and tested in isolation. Depends on Phase 3 (all features must exist before hardening).

### Task 1 — Content Security Policy

- Restrictive CSP on all HTML responses: no inline scripts, restricted `img-src` and `frame-src`
- Verify Milkdown editor and remark rendering work within the policy

### Task 2 — CSRF Protection

- Set `__csrf` non-HttpOnly cookie on auth responses (login callback and refresh)
- SPA reads cookie value, sends it as `X-CSRF-Token` header on all POST requests
- Server middleware validates header matches cookie on: `/api/gists`, `/api/gists/:id/import`, `/api/gists/:id/claim`, `/api/gists/:id/edit-token`, `/api/auth/logout`
- `SameSite=Strict` on session cookie provides primary protection; double-submit is defense-in-depth

### Task 3 — Referrer Policy

- All responses include `Referrer-Policy: strict-origin`
- Defense-in-depth for edit token leakage (token is already in URL fragment, not sent in Referer)

### Task 4 — Rate Limiting

- IP-based rate limiting on anonymous viewer requests (`/:gist_id`, `/:gist_id/raw`) to prevent `gist_id` enumeration
- Per-IP and per-room WebSocket connection limits

### Task 5 — WebSocket Hardening

- Message rate limiting on all WebSocket connections
- 2 MB maximum document size enforced on inbound Yjs updates
- Read-only connections cannot send awareness updates (prevents cursor spoofing)

### Task 6 — Raw Endpoint Headers

- `Content-Type: text/plain; charset=utf-8`
- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-cache` (allow conditional requests via ETag/If-None-Match)

---

## Dependency Graph

```
Phase 0 (scaffolding)
  │
  ├── Track 1A (auth) ──────────┐
  │                              ├── Track 2B (API routes) ──┐
  ├── Track 1C (GistRoom DO) ───┤                            ├── Track 3A (GitHub sync) ──► Phase 4 (conflicts + status UX)
  │                              ├── Track 2A (collab) ──────┤
  ├── Track 1B (editor) ────────┘                            ├── Track 3B (edit permissions)
  │                                                          │
  │                                                          ├── Track 3C (read-only views)
  │                                                          │
  │                                                          └── Phase 5 (security hardening)
```

### Critical Path

```
Phase 0 → Track 1A (auth) + Track 1C (DO) → Track 2B (API) → Track 3A (GitHub sync) → Phase 4A (conflicts)
```

This is the longest chain. Everything else can be developed in parallel alongside it.

### Cross-Track Dependencies (shared interfaces)

Define these contracts before Phase 1 tracks diverge:

| Interface | Producer | Consumers | Notes |
|---|---|---|---|
| JWT sign/verify module | Track 1A | Track 1C (DO), Track 2B (API) | Pure WebCrypto, no Node deps |
| Token encryption module | Track 1A | Track 1C (DO), Track 2B (API) | AES-GCM, versioned key prefix |
| DO SQLite schema | Track 1C | Track 2B (API), Track 3A/B | Column names, types, constraints |
| Edit capability cookie format | Track 3B (permissions) | Track 1C (DO `isReadOnly`) | Cookie name, path scope, validation |
| Custom message protocol | Track 1C (DO) | Track 2A (collab), Track 4B (status UI) | Message type enum + payload shapes |
| Sync status state machine | Track 3A (sync) | Track 4B (status UI) | States + transitions |

---

## Parallelization Summary

| Phase | Max Parallel Tracks | Solo Dev Approach | 2-3 Dev Approach |
|-------|--------------------:|-------------------|------------------|
| 0 | 1 | Sequential | Sequential |
| 1 | 3 | Auth → DO → Editor | One each |
| 2 | 2 | API → Collab | One each |
| 3 | 3 | Sync → Permissions → Views | One each (or sync + remaining) |
| 4 | 2 | Conflicts → Status UI | One each |
| 5 | 6 | Any order | Split evenly |

**Solo dev note**: Even without parallelism, the phased structure helps by keeping each unit small and testable before integrating. Build each track to a working milestone before moving on.

**Team note**: The biggest wins are Phase 1 (3 independent tracks) and Phase 3 (3 independent tracks). A 3-person team can nearly halve the timeline compared to solo by splitting these phases.
