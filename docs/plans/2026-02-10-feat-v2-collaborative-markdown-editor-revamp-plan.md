---
title: "feat: Revamp to Collaborative Markdown Editor with Optional GitHub Persistence"
type: feat
date: 2026-02-10
brainstorm: docs/brainstorms/2026-02-10-v2-revamp-brainstorm.md
---

# Revamp to Collaborative Markdown Editor with Optional GitHub Persistence

## Overview

Complete revamp of markdown-party from a "collaborative Gist editor" (requiring GitHub auth to create a room) to a "collaborative markdown editor with optional GitHub persistence." The core shift: the product is the editor. GitHub is a storage backend, not a prerequisite.

**Key changes:**
- Anyone can create and edit a document instantly — no sign-in required
- Documents identified by human-readable `doc_id` via [joyful](https://github.com/haydenbleasel/joyful) (e.g., `amber-fox`, `golden-marble-cathedral`)
- Anonymous docs are ephemeral (24h TTL); signed-in docs are persistent
- GitHub Gist save is opt-in after creation
- Edit capability shared via URL fragment tokens, claimed via cookie

## Problem Statement / Motivation

The v1 app requires GitHub authentication and Gist creation before a user can start editing. This creates unnecessary friction — users must sign in, create a Gist, and wait before they can type. The core value proposition is collaborative markdown editing, not Gist management.

v2 makes the editor the product: visit `/`, start typing immediately. GitHub becomes an optional persistence layer for users who want it.

## Proposed Solution

### Hybrid Clean Rewrite Strategy

Rewrite the core (DocRoom DO, API routes, client UX) from scratch while porting proven, spec-unchanged pieces:

- **Keep as-is:** Auth flow (GitHub OAuth PKCE, JWT cookies), token encryption (AES-GCM), Yjs/y-partyserver integration, Milkdown editor setup, CSRF protection, security headers
- **Rewrite:** DocRoom DO (new identity model, ephemeral TTL, optional GitHub backend), all API routes (doc-first endpoints), client routing and UX (no landing page, capability-based sharing)

### Architecture Summary

```
User visits / ──> SPA loads ──> POST /api/docs ──> DocRoom DO created
                                     │
                                     ├── Returns { doc_id, edit_token }
                                     ├── Sets edit capability cookie
                                     └── URL replaced to /:doc_id
                                          │
                                          ├── WebSocket to /parties/doc-room/:doc_id
                                          ├── Yjs CRDT sync via y-partyserver
                                          └── Optional: POST /api/docs/:doc_id/github
                                               └── Links GitHub Gist for auto-sync
```

## Decisions

These were surfaced by spec-flow analysis and technical review. All resolved.

| Decision | Resolution |
|----------|-----------|
| Anonymous ownership model | Anonymous creators **cannot** revoke edit tokens. Only signed-in owners can. |
| Upload behavior (spec vs brainstorm contradiction) | **Load into current doc** (brainstorm is authoritative, commit `c5f5f69`). Prompt to confirm overwrite if doc has content. |
| Import from URL — client vs server | **Server-side fetch** via `POST /api/import-url` with domain allowlist. **Deferred to post-MVP** — cut from initial implementation. |
| `doc_id` format | Human-readable IDs via [joyful](https://github.com/haydenbleasel/joyful). 3 segments for uniqueness (e.g., `golden-marble-cathedral`). ~2.1 billion combinations. |
| TTL "activity" definition | Any Yjs update from a connection with edit capability resets the 24h clock. |
| Anonymous-to-authenticated upgrade | No automatic upgrade. User must "Save to GitHub" to persist. |
| Cursor identity for anonymous editors | Auto-generated "Guest N" labels with DJB2 color hash (port existing pattern). |
| Edit token persistence across tabs | `sessionStorage` — persists across same-tab navigations but not across browser sessions. |
| Rate limiting on `POST /api/docs` | Use Cloudflare's built-in rate limiting rules (not KV counters — KV is eventually consistent and unreliable for rate limiting). |

## Technical Approach

### Files to Keep (Port With Renames)

| File | Changes Needed |
|------|---------------|
| `worker/routes/auth.ts` | Update JWT audience/issuer from `"gist.party"` to `"markdown.party"` |
| `worker/shared/auth-middleware.ts` | No changes |
| `worker/shared/csrf.ts` | No changes |
| `src/shared/encryption.ts` | No changes |
| `worker/shared/encryption.ts` | No changes |
| `src/shared/jwt.ts` | Update audience/issuer |
| `worker/shared/jwt.ts` | Update audience/issuer |
| `src/client/components/Editor.tsx` | Add Milkdown slash/tooltip plugins |
| `src/client/hooks/use-collab-provider.ts` | Rename `party: "gist-room"` to `"doc-room"`, `gistId` to `docId` |
| `src/client/hooks/use-custom-messages.ts` | No changes |
| `src/client/lib/fetch-with-csrf.ts` | No changes |

### Files to Rewrite

| File | New File | Description |
|------|----------|-------------|
| `worker/gist-room.ts` | `worker/doc-room.ts` | New DocRoom DO with optional GitHub, ephemeral TTL |
| `worker/routes/gists.ts` | `worker/routes/docs.ts` | Doc-first API routes |
| `worker/index.ts` | `worker/index.ts` | New route mounting, updated bindings |
| `src/App.tsx` | `src/App.tsx` | New routing (no landing page) |
| `src/client/pages/gist-page.tsx` | `src/client/pages/doc-page.tsx` | Doc page with new view states |
| `src/client/pages/landing-page.tsx` | *(deleted)* | No landing page in v2 |
| `src/client/components/nav-bar.tsx` | `src/client/components/header-bar.tsx` | Thin header with action icons |
| `src/client/hooks/use-edit-token.ts` | `src/client/hooks/use-edit-token.ts` | Updated claim endpoint path |
| `src/shared/edit-cookie.ts` | `src/shared/edit-cookie.ts` | Path from `gist-room` to `doc-room`, rename fields |
| `src/shared/messages.ts` | `src/shared/messages.ts` | Remove gist-specific fields, typed payload validation |

### Files to Create

| File | Description |
|------|-------------|
| `wrangler.jsonc` | New config with `DOC_ROOM` binding, `DocRoom` class |
| `src/client/components/github-save-modal.tsx` | Save to GitHub dialog (Gist public/secret, filename) |
| `src/shared/doc-meta.ts` | Shared `DocMeta` response type used by both DO and routes |

### Files to Delete

| File | Reason | When |
|------|--------|------|
| `worker/gist-room.ts` | Replaced by `doc-room.ts` | Phase 1 |
| `worker/routes/gists.ts` | Replaced by `docs.ts` | Phase 1 |
| `worker/shared/messages.ts` | Duplicated — use `src/shared/messages.ts` only | Phase 1 |
| `src/client/pages/landing-page.tsx` | No landing page in v2 | Phase 1 |
| `src/client/pages/landing-page.css` | Associated styles | Phase 1 |
| `src/client/pages/not-found-page.tsx` | Replace with expired/not-found variant | Phase 1 |
| `src/client/pages/not-found-page.css` | Associated styles | Phase 1 |
| `src/client/hooks/use-auth.ts` | Duplicated by `auth-context.tsx` (dead code) | Phase 1 |
| `src/shared/schema.ts` | Schema mismatch with actual DO — not used | Phase 1 |
| `src/client/components/nav-bar.tsx` | Replaced by `header-bar.tsx` | Phase 1 |
| `src/client/components/navbar.css` | Associated styles | Phase 1 |

### Implementation Phases

#### Phase 1: Anonymous Editor End-to-End

**Goal:** The entire anonymous editing flow works: visit `/`, get an editor at `/:doc_id`, share via `#edit=<token>`, real-time collaboration, 24h TTL.

This is one atomic unit: DocRoom DO + API routes + client routing + header bar + editor enhancements. Cannot be shipped separately.

**DocRoom DO (`worker/doc-room.ts`):**

- [ ] Create `wrangler.jsonc` with `DOC_ROOM` binding, `DocRoom` class, SQLite migration
- [ ] Create `worker/doc-room.ts` — new DocRoom DO extending YServer:
  - Typed metadata layer (replace stringly-typed `getMeta`/`setMeta`):
    ```typescript
    interface DocRoomMeta {
      initialized: boolean;
      docId: string;
      ownerUserId: string | null;
      editTokenHash: string;
      githubBackend: string | null; // JSON-serialized, Phase 2
      createdAt: string;
      lastActivityAt: string;
    }
    ```
  - `ensureSchema()` — `room_meta` (key-value) and `yjs_snapshot` tables (no separate `canonical_markdown` table — derive on demand)
  - `onStart()` / `onLoad()` — initialize schema, load snapshot, check TTL alarm
  - `initializeRoom(docId, ownerId?, editTokenHash)` — works with or without `ownerId`
  - `onConnect()` — check edit capability cookie, admit read-only or editor. Max 50 connections.
  - `onClose()` — handle owner disconnect, set TTL alarm for anonymous docs
  - `alarm()` — enforce 24h TTL for anonymous docs
  - `onSave()` — snapshot to SQLite. GitHub sync deferred to Phase 2.
  - Use discriminated union narrowing for message handlers (no `as` casts)
- [ ] Delete `worker/gist-room.ts`

**Shared types:**

- [ ] Create `src/shared/doc-meta.ts` — shared `DocMeta` response type for both DO and routes
- [ ] Update `src/shared/edit-cookie.ts`:
  - Rename `gistId` to `docId` throughout
  - Update cookie path from `/parties/gist-room/` to `/parties/doc-room/`
  - Rename cookie name from `gp_edit_cap` to `mp_edit_cap`
- [ ] Update `src/shared/messages.ts`:
  - Remove `gistId` and `filename` from `NeedsInitPayload` — replace with `docId`. Clarify: `needs-init` only fires for GitHub-linked docs whose snapshot expired, not for anonymous docs.
  - Remove dead `ConflictPayload` type (DO uses `RemoteChanged` instead)
  - Add per-type runtime payload validation in `decodeMessage` (wider trust boundary with anonymous users)
  - Add `github-backend-status` message type for Phase 2
- [ ] Delete `worker/shared/messages.ts` — update all `worker/` imports to `../src/shared/messages`

**API routes (`worker/routes/docs.ts`):**

- [ ] Create `worker/routes/docs.ts` with these endpoints:

  | Route | Method | Auth | Description |
  |-------|--------|------|-------------|
  | `/api/docs` | POST | None | Create new doc (joyful ID), return `{ doc_id, edit_token }`, set edit cookie |
  | `/api/docs/:doc_id/claim` | POST | None | Exchange edit token for edit cookie |
  | `/api/docs/:doc_id/edit-token` | POST | Auth (owner) | Regenerate edit token |
  | `/api/docs/:doc_id/github` | POST | Auth (owner) | Link GitHub Gist backend (Phase 2) |
  | `/api/docs/:doc_id/github` | DELETE | Auth (owner) | Unlink GitHub backend (Phase 2) |

- [ ] Add `/:doc_id/raw` route in `worker/index.ts` (per spec — not an `/api/` route)
- [ ] Update `worker/index.ts`:
  - Mount `/api/docs` routes, remove `/api/gists` routes
  - Update CSRF protection paths
  - Update `routePartykitRequest` to use `DocRoom` export
  - Export `DocRoom` class
- [ ] Configure Cloudflare rate limiting rules for `POST /api/docs`
- [ ] Update auth routes: change JWT audience/issuer from `"gist.party"` to `"markdown.party"`
- [ ] Delete `worker/routes/gists.ts`
- [ ] Update `worker-configuration.d.ts` with new `DOC_ROOM` binding type, run `bun run types`

**Client (`src/`):**

- [ ] Rewrite `src/App.tsx`:
  ```
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DocCreator />} />
        <Route path="/:docId" element={<DocPage />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
  ```
- [ ] Create `DocCreator` component (inline — no separate hook file):
  - On mount, call `POST /api/docs`
  - Show minimal loading indicator
  - On success, `history.replaceState` to `/:doc_id`
  - Store `edit_token` in `sessionStorage`
  - On failure, show retry button with error message
- [ ] Rewrite `DocPage` (replacing `GistPage`):
  - Connect WebSocket — DO determines read-only vs editor on connect
  - Handle `#edit=<token>` fragment via `useEditToken` (updated paths)
  - Render `Editor` (edit mode) or read-only view based on capability
- [ ] Create `src/client/components/header-bar.tsx`:
  - Left: App name/logo ("markdown.party")
  - Right actions: Share (dropdown/popover with copy buttons for edit link + read-only link), Export (.md download), Sign In / User avatar+logout
  - "Save to GitHub" button rendered but disabled until Phase 2
- [ ] Add Milkdown plugins to `Editor.tsx`:
  - `@milkdown/plugin-slash` — block formatting via `/` command
  - `@milkdown/plugin-tooltip` — floating inline toolbar on text selection
- [ ] Update `use-collab-provider.ts`:
  - Change `party: "gist-room"` to `party: "doc-room"`
  - Rename `gistId` parameter to `docId`
  - Anonymous cursor identity: auto-generate "Guest N" names with DJB2 color hash
- [ ] Update `use-edit-token.ts`:
  - Change claim endpoint from `/api/gists/:gistId/claim` to `/api/docs/:docId/claim`
- [ ] Delete all v1 dead code: `landing-page.*`, `not-found-page.*`, `nav-bar.tsx`, `navbar.css`, `use-auth.ts`, `schema.ts`

**Global rename (throughout, not as a separate pass):**

- [ ] CSS class names: `gist-page` -> `doc-page`, etc.
- [ ] Text strings: "gist.party" -> "markdown.party"
- [ ] `package.json` name: `gist-party` -> `markdown-party`
- [ ] Update `AGENTS.md` with new architecture description

**Verification:**

- [ ] `bun run typecheck` passes
- [ ] `bun run check` (Biome) passes
- [ ] Verify edit capability cookie appears during WebSocket connection to `/parties/doc-room/:docId`
- [ ] No references to "gist" remain in production code

**Success criteria:** Visiting `/` creates a new doc with a human-readable ID (e.g., `golden-marble-cathedral`) and seamlessly transitions to the editor. Share links with `#edit=<token>` work for anonymous recipients. Docs self-destruct after 24h. Real-time collaboration works.

#### Phase 2: GitHub Persistence (Optional Backend)

**Goal:** Signed-in users can link a GitHub Gist to their doc for auto-sync.

**Tasks:**

- [ ] Implement `POST /api/docs/:doc_id/github` in `docs.ts`:
  - Requires auth (owner only)
  - Creates new GitHub Gist via API using owner's encrypted token
  - Stores `githubBackend: { type: "gist", gistId, filename, etag }` in DO
  - Returns `{ gist_url }`
- [ ] Implement `DELETE /api/docs/:doc_id/github`:
  - Requires auth (owner only)
  - Removes `githubBackend` from DO metadata
  - Does NOT delete the Gist itself
  - Pauses auto-sync
- [ ] Add GitHub sync logic to `DocRoom.onSave()`:
  - Check if `githubBackend` is configured
  - If yes, request canonical markdown from client, debounced conditional write (PATCH with `If-Match`)
  - Port existing `syncToGitHub()`, `handle412Conflict()`, `handleSyncError()` from `GistRoom`
- [ ] Port sync status broadcasting from `GistRoom`:
  - `sync-status` messages (Saved / Saving / Error / Pending)
  - `error-retrying` with exponential backoff
  - `remote-changed` handling
- [ ] Wire up `useSyncStatus` hook to new DocRoom messages
- [ ] Enable "Save to GitHub" button in `HeaderBar`, wire to `github-save-modal.tsx`
- [ ] Create `src/client/components/github-save-modal.tsx`:
  - Destination: Gist (default)
  - Visibility: Public / Secret (default: Secret)
  - Filename: text input (default: "document.md")
  - Description: optional text input
- [ ] Add sync status indicator to `HeaderBar` (only visible when GitHub backend linked)
- [ ] Port `ConflictModal` for push-local / discard-local resolution (use `remote-changed` message, not dead `conflict` type)

**Success criteria:** A signed-in user can save their doc to a GitHub Gist. Subsequent edits auto-sync. Sync status is visible in the header.

## Acceptance Criteria

### Functional Requirements

- [ ] Visiting `/` creates a new anonymous document and seamlessly transitions to `/:doc_id`
- [ ] `doc_id` is human-readable (joyful library, e.g., `golden-marble-cathedral`)
- [ ] Creator automatically has edit access (cookie set on doc creation)
- [ ] Share link `/:doc_id#edit=<token>` grants edit access to anyone who visits it
- [ ] Plain `/:doc_id` provides read-only access
- [ ] Anonymous docs expire 24h after last edit activity
- [ ] Signed-in user docs do not expire
- [ ] Real-time collaboration works (Yjs sync via y-partyserver)
- [ ] Milkdown editor with slash commands (`/`) and floating tooltip toolbar
- [ ] Export/Download as `.md` works
- [ ] Signed-in users can save to GitHub Gist (public or secret)
- [ ] GitHub-linked docs auto-sync with debounced conditional writes
- [ ] Sync status visible in header (Saved / Saving / Error)
- [ ] Upload: drag-and-drop or file picker loads `.md` content into current doc (confirm overwrite if doc has content)

### Non-Functional Requirements

- [ ] `POST /api/docs` rate-limited via Cloudflare rate limiting rules
- [ ] Edit tokens are SHA-256 hashed before storage (never stored raw)
- [ ] Edit cookies are HMAC-signed and path-scoped to `/parties/doc-room/:docId`
- [ ] CSRF protection on all state-changing endpoints
- [ ] Security headers (CSP, X-Frame-Options, etc.) on all responses
- [ ] 2 MB max message size enforced by DO
- [ ] Runtime payload validation in `decodeMessage` for all message types

### Quality Gates

- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun run check` (Biome lint/format) passes
- [ ] No references to "gist" remain in production code
- [ ] All v1 dead code deleted
- [ ] Edit capability cookie verified against WebSocket upgrade path

## Edge Cases to Address During Implementation

These are the tricky lifecycle transitions identified by technical review:

1. **Anonymous user signs in mid-session:** The DO needs to handle this gracefully. The WebSocket connection does not need to reconnect — the session cookie is only checked on initial connect. The user can link GitHub after signing in.
2. **TTL alarm fires with active connections:** The DO should check for active connections before self-destructing. If connections exist, reset the alarm.
3. **`POST /api/docs` failure on `/`:** Show retry button with error message. Do not leave user stuck on a loading spinner.
4. **Concurrent upload while others are editing:** The Yjs CRDT handles this — upload replaces the doc content via a Yjs transaction, which propagates to all connected clients. No special handling needed beyond the overwrite confirmation for the uploading user.
5. **Creator opens second tab:** Edit cookie is present (path-scoped). The `edit_token` for share links is in `sessionStorage` — available in same-tab navigations but not across tabs. Acceptable limitation.

## Dependencies & Prerequisites

- **Cloudflare Workers:** No version changes needed. Current `wrangler ^4.63.0` supports all features.
- **y-partyserver:** Current `^1.0.0` supports DocRoom pattern (same as GistRoom).
- **New dependencies to add:**
  - `joyful` — human-readable document ID generation
  - `@milkdown/plugin-slash` — slash command menu
  - `@milkdown/plugin-tooltip` — floating inline toolbar

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| DO migration from GistRoom to DocRoom | Existing v1 data inaccessible | Clean rewrite — v1 DOs are abandoned. No migration needed. |
| joyful ID collisions | Duplicate doc IDs | 3 segments = ~2.1 billion combinations. Check for collision on creation and regenerate if needed. |
| Edit token leakage via screenshots/screen-share | Unauthorized edit access | Token revocation available for signed-in owners. Accept risk for anonymous creators (documented limitation). |
| Cookie path mismatch after rename | All connections treated as read-only | Explicit verification step: confirm cookie appears during WebSocket upgrade to `/parties/doc-room/:docId`. |

## References & Research

### Internal References

- Current GistRoom DO: `worker/gist-room.ts` (1205 lines — primary reference for DocRoom rewrite)
- Current API routes: `worker/routes/gists.ts` (389 lines)
- Auth flow: `worker/routes/auth.ts`
- Edit cookie: `src/shared/edit-cookie.ts`
- Custom messages: `src/shared/messages.ts`
- Milkdown editor: `src/client/components/Editor.tsx`
- Yjs provider: `src/client/hooks/use-collab-provider.ts`
- Last known wrangler config: git commit `b64e179:wrangler.jsonc`
- tsconfig.worker.json already includes `src/shared` — supports de-duplication of messages.ts

### External

- [joyful](https://github.com/haydenbleasel/joyful) — human-readable ID generation (700K+ combinations at 2 segments, 2.1B+ at 3 segments)

### Brainstorm

- `docs/brainstorms/2026-02-10-v2-revamp-brainstorm.md` — key decisions on entry flow, edit token model, upload UX, GitHub persistence, document lifecycle

### Technical Review Feedback Incorporated

- **DHH reviewer:** Collapsed 6 phases to 2. Cut Import from URL from MVP. Removed redundant `can-edit` and metadata endpoints. Switched rate limiting from KV to Cloudflare rules.
- **Simplicity reviewer:** Inlined doc creation logic (no separate hook file). Share UI as dropdown not modal. Moved github-save-modal to Phase 2. Deleted Phase 6 cleanup — folded into Phase 1.
- **TypeScript reviewer:** Added typed metadata layer for DocRoom. Added runtime payload validation for messages. Extracted shared `DocMeta` type. Use discriminated union narrowing instead of casts. Clarified `needs-init` semantics for v2. Removed dead `ConflictPayload`.
