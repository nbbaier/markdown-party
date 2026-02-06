# gist.party v2 — Specification

> Instant collaborative markdown editing. No account required. Persist to GitHub when you're ready.

## Problem

Markdown collaboration is stuck between bad options:

- **GitHub**: committing is too heavy, no simultaneous editing, the web editor is clunky
- **Notion/Google Docs**: not real markdown, hard to use locally, can't pipe into CLI tools or AI agents
- **HackMD/CodiMD**: closer, but tied to their own backends, not portable

People want to open a URL, start writing markdown together, and optionally save it somewhere durable. The tool should get out of the way.

## Solution

A web app at `gist.party` that is a collaborative markdown editor first, with optional GitHub persistence (Gists or repos) for signed-in users.

**Core principle**: The product is the editor. GitHub is a storage backend, not a prerequisite.

## User Flows

### Start Editing (No Account)

1. User visits `gist.party`
2. A new document is created immediately — user sees the editor and can start typing
3. URL updates to `gist.party/<doc_id>` (short random ID, e.g. `a7xk2m`)
4. User shares the URL — anyone with it can edit in real-time
5. Document is **ephemeral**: lives for 24 hours after last activity, then deleted

### Start Editing (Signed In)

1. User visits `gist.party` while signed in
2. Same as above, but the document is associated with their account
3. Document persists beyond 24 hours (no auto-expiry)
4. User can optionally save to GitHub (Gist or repo) via "Save to GitHub" in the editor

### Open an Existing Document

1. User visits `gist.party/<doc_id>`
2. If the document exists: editor opens with the content
3. If it doesn't exist: 404 page

### Upload a Document

1. User drags and drops a `.md` file onto the editor, or uses a file picker
2. Content is loaded into a new document
3. Same ephemeral/persistent rules apply based on auth state

### Save to GitHub

1. Signed-in user clicks "Save to GitHub" in the editor toolbar
2. Chooses destination: **New Gist** (secret or public) or **Repository file** (future)
3. Document is written to GitHub via the API
4. Subsequent edits auto-sync to GitHub (debounced)
5. The `doc_id` URL stays the same — it's gist.party's ID, not the Gist ID

### Import from GitHub

1. Signed-in user pastes a Gist URL or uses "Import from GitHub" in the editor
2. Content is loaded into a new document (new `doc_id`)
3. Document is linked to the Gist for two-way sync

### Share & Permissions

Reuses the capability-based edit token model from v1:

1. Document creator gets an **edit link**: `gist.party/<doc_id>#edit=<token>`
2. Anyone with the edit link can edit (token exchanged for edit capability cookie)
3. Anyone with just `gist.party/<doc_id>` (no token) gets **read-only** access
4. Creator can revoke edit tokens and generate new ones
5. For anonymous docs: the creator's browser holds the edit capability via cookie — if they clear cookies, they lose edit access to their own anonymous doc

| User                        | Can view | Can edit | Persists to GitHub |
| --------------------------- | -------- | -------- | ------------------ |
| Creator (anonymous)         | Yes      | Yes      | No                 |
| Creator (signed in)         | Yes      | Yes      | Yes (their token)  |
| Anyone with edit link       | Yes      | Yes      | Via creator's token|
| Anyone with view link       | Yes      | No       | N/A                |

### Viewing / Raw Access

- `gist.party/<doc_id>` — rendered read-only view (if no edit capability)
- `gist.party/<doc_id>/raw` — raw markdown as `text/plain` (for curl, AI agents, scripts)

## Architecture

```
┌─────────────────┐      WebSocket       ┌───────────────────────┐
│   Browser        │◄──────────────────► │  DocRoom DO           │
│                  │  (y-partyserver)    │  (extends YServer)    │
│  Milkdown        │                     │                       │
│  + Yjs doc       │                     │  Yjs CRDT sync/aware  │
│  + YProvider     │                     │  + DO SQLite storage  │
│  + Awareness     │                     │  + onLoad / onSave    │
└─────────────────┘                      └──────────┬────────────┘
       │                                            │
       │ HTTP                             optional fetch/patch
       ▼                                            │
┌─────────────────┐                        ┌────────▼─────────┐
│ Cloudflare      │                        │  GitHub API      │
│ Worker (Hono)   │                        │  (Gists / Repos) │
│                 │                        └──────────────────┘
│ OAuth, API,     │
│ SPA serving     │
│ routePartykitRequest → DO │
└─────────────────┘
```

### DocRoom (renamed from GistRoom, extends YServer)

Each document gets its own Durable Object. The DO is identified by gist.party's own `doc_id`, not a GitHub ID.

**Key changes from v1:**
- Room identity is a random `doc_id`, not a `gist_id`
- GitHub sync is optional — the DO works fully without it
- Ephemeral docs (no owner) have a 24-hour TTL enforced via DO alarm
- The `initialized` flag is set on creation, not on GitHub import

**Behavior:**
- **`onLoad()`**: Loads Yjs snapshot from DO SQLite. If no snapshot, starts with an empty document (no `needs-init` dance for anonymous docs).
- **`onSave()`**: Always writes Yjs snapshot to DO SQLite. If a GitHub backend is configured and the owner is connected, syncs to GitHub (same conditional-write logic as v1). If no GitHub backend, just persists locally.
- **TTL enforcement**: Ephemeral (unowned) docs set a DO alarm for 24 hours after last activity. On alarm, the DO deletes its storage and self-destructs. Any connected clients are disconnected. Owned docs (signed-in creator) have no auto-expiry.
- **`isReadOnly(connection)`**: Same as v1 — connections without edit capability are read-only.
- **Hibernation**: Same as v1 — enabled, rehydrates from SQLite on wake.
- **Limits**: Same as v1 — 2 MB doc size, connection limits, rate limiting.

**Storage (DO SQLite):**
- `docId` — gist.party's document ID
- `yjsSnapshot` — serialized Yjs document
- `canonicalMarkdown` — last serialized markdown string
- `ownerId` — GitHub user ID (null for anonymous docs)
- `githubBackend` — JSON: `{ type: "gist", gistId, filename, etag }` or null
- `editTokenHash` — SHA-256 of the edit token
- `createdAt`, `lastActivityAt`, `lastSavedAt`
- `pendingSync`, `pendingSince` — for GitHub sync (only relevant when backend is configured)

### Cloudflare Worker (Hono)

Same role as v1 but with updated routes.

### Client (React SPA)

Same editor stack (Milkdown + Yjs + y-partyserver) but with a rethought UX:

- **No landing page** — `gist.party` immediately creates a new document and redirects to `gist.party/<doc_id>`
- **Editor toolbar** includes: share, export/download, "Save to GitHub" (if signed in), sign in prompt (if anonymous)
- **Upload**: drag-and-drop or file picker to load a `.md` file into a new doc
- **GitHub features** (save, import, sync status) only appear when signed in and a backend is configured

## Tech Stack

Same as v1. No changes to the underlying technology.

| Component         | Technology                                     |
| ----------------- | ---------------------------------------------- |
| Framework         | Vite + React                                   |
| Editor            | Milkdown (`@milkdown/core`, `@milkdown/react`) |
| Editor presets    | `@milkdown/preset-commonmark`, `@milkdown/preset-gfm` |
| Editor collab     | `@milkdown/plugin-collab` (wraps y-prosemirror)|
| CRDT              | Yjs (via y-prosemirror, managed by Milkdown)   |
| Realtime server   | PartyServer (`partyserver`) on Cloudflare DOs  |
| Yjs integration   | `y-partyserver` (YServer + YProvider)          |
| HTTP router       | Hono                                           |
| Auth              | GitHub OAuth 2.0 (PKCE + state)                |
| Session           | Signed JWT cookies                             |
| Session store     | Workers KV                                     |
| Token encryption  | AES-GCM via WebCrypto (versioned key)          |
| Storage           | DO SQLite (primary), GitHub API (optional sync)|
| Markdown render   | remark + rehype (read-only view)               |
| Deployment        | Cloudflare Workers + Durable Objects           |

## API Routes

| Route                              | Method | Description                                |
| ---------------------------------- | ------ | ------------------------------------------ |
| `/api/docs`                        | POST   | Creates a new document, returns `{ doc_id, edit_token }` |
| `/api/docs/:doc_id/claim`          | POST   | Exchanges edit token for edit capability cookie |
| `/api/docs/:doc_id/edit-token`     | POST   | Revokes + regenerates edit token (owner only) |
| `/api/docs/:doc_id/github`         | POST   | Links document to a GitHub backend (Gist/repo) |
| `/api/docs/:doc_id/github`         | DELETE | Unlinks document from GitHub backend       |
| `/api/auth/github`                 | GET    | Initiates GitHub OAuth flow                |
| `/api/auth/github/callback`        | GET    | OAuth callback, sets session               |
| `/api/auth/refresh`                | POST   | Refreshes JWT cookie                       |
| `/api/auth/logout`                 | POST   | Clears session                             |
| `/parties/doc-room/:doc_id`        | GET    | WebSocket upgrade (via `routePartykitRequest`) |
| `/:doc_id`                         | GET    | Editor (with edit capability) or read-only view |
| `/:doc_id/raw`                     | GET    | Raw markdown as `text/plain`               |

## Data Flow: Edit -> Save

1. User types in Milkdown
2. ProseMirror transaction applied to local Yjs document via `ySyncPlugin`
3. `YProvider` syncs update to DocRoom DO via WebSocket
4. `YServer` broadcasts to all connected clients
5. `onSave()` fires after debounce (30 seconds)
6. Yjs snapshot written to DO SQLite (always)
7. If GitHub backend configured + owner connected: request canonical markdown from client, write to GitHub with conditional `If-Match` header
8. If no GitHub backend: done — document lives in DO storage only
9. `lastActivityAt` updated (resets 24h TTL for ephemeral docs)

## Auth Model

- **Anonymous users**: No auth required. Full editing via edit capability token/cookie. No persistence beyond 24h TTL.
- **GitHub OAuth**: Signs in with `gist` scope (for Gist read/write) or `repo` scope (for repo file access, future). Access token encrypted in Workers KV (same as v1).
- **Session**: Signed JWT cookies (same as v1). Used for cursor identity (name, avatar) and GitHub API access.
- **Edit permissions**: Capability-based edit tokens, same as v1 but decoupled from Gist ownership. The document creator (anonymous or signed-in) is the "owner" who controls edit tokens.

## Security

All security measures from v1 carry forward:
- XSS-safe markdown rendering (`rehype-sanitize`, CSP)
- Raw endpoint: `text/plain`, `nosniff`, `no-cache`
- `Referrer-Policy: strict-origin`
- CSRF protection (double-submit cookie)
- IP rate-limiting on anonymous views
- WebSocket rate limiting, connection limits, 2 MB doc size limit
- Encrypted GitHub token storage (AES-GCM, versioned keys)
- Edit tokens in URL fragments (never in Referer headers)

## MVP Scope (v2)

### In Scope

- Visit `gist.party` → immediately in a new document, editing
- Real-time collaborative editing with cursors
- Capability-based edit tokens (share link to grant edit access)
- Anonymous ephemeral documents (24h TTL after last activity)
- Upload `.md` file to create a new document
- Export / download as `.md`
- Raw markdown endpoint (`/:doc_id/raw`)
- Read-only rendered view for users without edit capability
- GitHub OAuth sign-in
- "Save to Gist" for signed-in users (creates/links a Gist)
- Auto-sync to linked Gist (debounced, conditional writes)
- Sync status UI (Saved / Saving / Error)
- Security hardening (carried forward from v1)

### Out of Scope (Future)

- Save to GitHub repo file (beyond Gists)
- Document dashboard / list for signed-in users
- Multiple files per document
- Offline support / service worker
- Comments / annotations
- Version history browsing
- Custom domains
- Syntax highlighting in code block preview
- Export to PDF
- Conflict resolution UI (simplify for MVP — last write wins with warning)
- Pending sync with 30-day retention (simplify — if owner disconnects, retry on reconnect)

## What Changed from v1

| Aspect | v1 | v2 |
| --- | --- | --- |
| Core identity | Collaborative Gist editor | Collaborative markdown editor |
| Entry point | Landing page with "New Document" + "Import Gist" | Instant editor — no landing page |
| Account required | Yes, to do anything useful | No — anonymous editing works fully |
| Document ID | Gist ID | gist.party's own random ID |
| Document lifetime | Tied to Gist (permanent) | Ephemeral (24h) or persistent (signed in) |
| GitHub role | The backend | Optional persistence layer |
| Conflict resolution | Full UI with diff preview | Simplified (out of scope for MVP) |
| Pending sync | 30-day retention with expiry banner | Simplified (retry on reconnect) |
| Gist import | Primary flow | Secondary feature |
| Landing page | Marketing page with feature cards | None — the app is the editor |

## Open Questions

1. **URL format**: Short random IDs (e.g. `a7xk2m`) — what length/alphabet balances readability with collision avoidance?
2. **Document dashboard**: Should signed-in users see a list of their documents? If so, where does it live (separate page, or a sidebar in the editor)?
3. **Upload UX**: Drag-and-drop onto editor, or a separate "upload" button, or both?
4. **Repo file sync**: What does "save to a repo file" look like? Commit to a branch? Which file path? (Deferred to post-MVP but worth thinking about.)
5. **Ephemeral doc cleanup**: DO alarms for TTL enforcement — what happens if the DO is hibernated at the time of expiry? (Need to verify DO alarm behavior during hibernation.)
