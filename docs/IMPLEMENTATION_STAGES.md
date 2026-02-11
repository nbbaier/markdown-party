# markdown.party - Staged Implementation Plan

Each stage is self-contained and testable. Early stages run locally via Vite dev server; production deployment happens when real infrastructure lands.

Infrastructure-as-code via [Alchemy](https://alchemy.run) from Stage 2 onward — Cloudflare resources are defined in `alchemy.run.ts` when backend logic is needed.

---

## Stage 1: Editor Foundation

**Goal:** A working single-user markdown editor in the browser. No backend, no collaboration. Prove the editing experience.

### Deliverables

- Project scaffolding: Vite + React + TypeScript (plain Vite SPA — no TanStack Start needed at this stage)
- Tailwind CSS v4 + shadcn/ui setup
- Tiptap editor configured for GFM (tables, task lists, strikethrough, autolinks) with `@tiptap/markdown` for serialization
- Fixed formatting toolbar (inline + block-level actions)
- Editor fills the viewport with minimal chrome
- Markdown round-trip: Tiptap document <-> GFM markdown (semantic equivalence)
- "Download as .md" button that exports current editor content
- localStorage auto-save (every 10s + on `beforeunload`) — throwaway scaffolding for Stage 1
- `strict: true` TypeScript from day one

### Testable Outcomes

- [ ] Type markdown in the WYSIWYG editor, download the `.md` file, open it in another editor — content is valid GFM
- [ ] All GFM features work: tables render and are editable, task lists toggle, strikethrough applies
- [ ] Editor feels responsive with a 10,000-word document
- [ ] shadcn/ui components render correctly (buttons, tooltips, toasts)
- [ ] `bun run dev` starts the app locally without errors
- [ ] Editor content auto-saves to localStorage; survives page refresh
- [ ] GFM round-trip validated manually (tables, task lists, strikethrough, autolinks, code blocks, nested lists)

### Key Decisions (Resolved)

- **Vite vs TanStack Start:** Plain Vite SPA. No SSR, auth, or routing needs in Stage 1. Revisit in Stage 3-4.
- **Tiptap extensions:** StarterKit, TableKit (`@tiptap/extension-table`), `@tiptap/extension-task-list` + `@tiptap/extension-task-item`, `@tiptap/extension-link`, `@tiptap/markdown`
- **Markdown serializer:** `@tiptap/markdown` with `markedOptions: { gfm: true }`
- **Alchemy/Workers:** Deferred to Stage 2 — no backend logic runs in Stage 1

---

## Stage 2: Real-Time Collaboration

**Goal:** Two browser tabs can edit the same document simultaneously with live cursor presence. The core "party" feature.

### Deliverables

- Alchemy project initialized (`alchemy.run.ts` with Vite resource, Worker entrypoint, `.env`)
- Yjs integration: `y-prosemirror` binding to the Tiptap editor
- Cloudflare Durable Object that acts as a WebSocket room per document
  - Accepts WebSocket connections
  - Relays Yjs sync/awareness messages between connected clients
  - Holds Yjs document state in memory
- Cloudflare Worker that routes `/doc/{slug}` WebSocket upgrades to the correct Durable Object
- Alchemy resource definitions: Worker + Durable Object class binding
- Random slug generation for new documents (nanoid or similar)
- URL routing: `/{slug}` loads the editor and connects to the Durable Object
- Yjs awareness protocol: cursor positions + randomly assigned display names/colors
- Cursor rendering in the editor (colored cursors with name labels)
- Collaborator count indicator in the UI

### Testable Outcomes

- [ ] Open `localhost:8787/abc123` in two browser tabs — edits in one appear instantly in the other
- [ ] Cursors are visible across tabs with distinct colors and names
- [ ] Three or more simultaneous editors work without conflicts or dropped updates
- [ ] Creating a new doc (landing on `/`) generates a random slug and redirects
- [ ] Closing a tab removes that user's cursor from other editors
- [ ] `alchemy dev` starts the Worker + Durable Object locally via miniflare

### Key Decisions

- Yjs WebSocket protocol: use `y-websocket` server logic adapted for Durable Objects, or implement from scratch using Yjs encoding utilities
- Durable Object hibernation API: use hibernatable WebSockets from the start (recommended) or standard WebSockets

---

## Stage 3: Persistence & Document Lifecycle

**Goal:** Documents survive server restarts and Durable Object evictions. Anonymous docs expire. The data layer is real.

### Deliverables

- R2 bucket for document snapshots (Yjs encoded state)
- D1 database with schema:
  - `documents` table: id, slug, title, owner_id (nullable), created_at, updated_at, expires_at
  - `users` table: id, github_id, email, username, created_at (schema ready for Stage 4)
- Durable Object persistence:
  - On hibernation/idle: flush Yjs state to R2
  - On wake: hydrate Yjs state from R2
  - Periodic flush during active editing (every 5 min) as crash protection
- Document creation flow: create D1 row + Durable Object on first visit
- Anonymous document expiry: `expires_at` set to 7 days from creation
- Background cleanup: scheduled Worker (cron trigger) that deletes expired docs from D1 + R2
- Snapshot system: save timestamped snapshots to R2 on each periodic flush
- Alchemy resource definitions: R2 bucket, D1 database, cron trigger

### Testable Outcomes

- [ ] Create a doc, add content, wait for idle flush, restart the Durable Object — content is preserved
- [ ] D1 `documents` table has a row for every created document
- [ ] R2 contains a binary Yjs snapshot for each document
- [ ] Snapshots accumulate over time (multiple versions stored)
- [ ] Expired anonymous docs are cleaned up by the scheduled worker
- [ ] `alchemy dev` provisions local R2 + D1 via miniflare

### Key Decisions

- R2 key structure for snapshots (e.g., `docs/{slug}/current.yjs`, `docs/{slug}/snapshots/{timestamp}.yjs`)
- Snapshot retention policy: how many snapshots to keep per doc

---

## Stage 4: Authentication & User Identity

**Goal:** Users can sign in, own documents, claim anonymous docs, and have a namespace.

### Deliverables

- GitHub OAuth flow (Worker handles `/auth/github/callback`)
- Magic link auth (Worker sends email via a transactional email service, validates tokens)
- Session management: encrypted cookies or JWTs stored in D1
- User creation in D1 `users` table on first sign-in
- "Claim this document" action: associates an anonymous doc with the signed-in user, clears `expires_at`
- User namespace routing: `/@{username}/{doc-name}` resolves to the correct document
- Named documents: authenticated users can set a doc name (slug under their namespace)
- Awareness protocol upgrade: display GitHub username/avatar instead of random names
- API key generation for authenticated users (future-proofing for CLI/local sync)
- Alchemy resource definitions: any additional KV namespaces or secrets for auth tokens

### Testable Outcomes

- [ ] "Sign in with GitHub" redirects to GitHub, returns to the app, and the user is authenticated
- [ ] Magic link flow: enter email, receive link, click link, authenticated
- [ ] Signed-in user's cursor shows their GitHub username and avatar
- [ ] Claiming an anonymous doc moves it under the user's namespace
- [ ] `/@username/my-doc` resolves correctly
- [ ] Signing out clears the session and reverts to anonymous cursor identity
- [ ] API keys can be generated and used to authenticate WebSocket connections

### Key Decisions

- Session storage: encrypted cookies (stateless) vs D1 session table (server-side)
- Email provider for magic links (Resend, Cloudflare Email Workers, etc.)
- How usernames are derived (GitHub username by default, editable?)

---

## Stage 5: GitHub Sync

**Goal:** Documents push to GitHub gists or repo files automatically. The GitHub backend is real.

### Deliverables

- GitHub sync configuration UI per document:
  - Connect to GitHub (uses existing OAuth token)
  - Choose target: new gist, existing gist, or file in a repo
  - Repo file picker: select repo + file path
- Auto-sync engine:
  - Debounced idle detection (30-60s of no edits)
  - Convert current Yjs state to GFM markdown
  - Push to GitHub via API (create/update gist or commit to repo)
  - Template-based commit messages (e.g., "Update {doc-name} — {date}")
- Sync status indicator in the editor UI (idle, syncing, synced, error)
- D1 schema addition: `github_connections` table (doc_id, type, gist_id/repo/path, last_synced_at)
- Error handling: surface GitHub API errors (rate limits, auth failures) to the user
- Manual "Push now" button as an override to the auto-sync timer

### Testable Outcomes

- [ ] Connect a doc to a new gist — gist is created on GitHub with the doc content
- [ ] Edit the doc, wait for idle sync — gist is updated with a new revision
- [ ] Connect a doc to a repo file — commits appear in the repo
- [ ] Rapid edits batch into a single commit (not one per keystroke)
- [ ] Sync status indicator reflects the actual state (shows spinner during push, checkmark after)
- [ ] Disconnecting GitHub sync stops future pushes
- [ ] Rate limit errors are shown to the user with a retry option

### Key Decisions

- GitHub API: REST vs GraphQL for gist/repo operations
- Commit author: use the user's GitHub identity or a bot account
- Rate limit strategy: per-user sync queue with exponential backoff

---

## Stage 6: Document Management & Version History

**Goal:** Users can find their documents and travel through time. The product feels complete.

### Deliverables

- Recent docs page (`/docs` or `/dashboard`):
  - Chronological list of user's documents
  - Shows: title (first heading or "Untitled"), last edited, collaborator count, GitHub sync status
  - "New document" button
- Version history panel in the editor:
  - List of snapshots with timestamps
  - Preview a snapshot (read-only view)
  - Restore a snapshot (replaces current doc content, creates a new snapshot of the pre-restore state)
- Read-only links: generate a `/{slug}?view=readonly` URL that loads the editor in view-only mode
- "Copy link" and "Copy read-only link" sharing UI
- Image upload:
  - Paste/drop images into the editor
  - Upload to R2 for non-synced docs (public URL)
  - Upload to GitHub repo for synced docs (commit image to `assets/` directory)
  - Insert markdown image syntax into the editor
- Download as `.md` (already built in Stage 1, just ensure it still works with all features)

### Testable Outcomes

- [ ] Recent docs page lists all documents owned by the signed-in user
- [ ] Clicking a doc in the list opens it in the editor
- [ ] Version history panel shows snapshots with correct timestamps
- [ ] Restoring a snapshot replaces the editor content and notifies collaborators
- [ ] Read-only link opens the doc without edit capability
- [ ] Pasting an image uploads it and inserts the correct markdown
- [ ] Images in GitHub-synced docs appear in the repo's `assets/` directory

### Key Decisions

- Version history UI: sidebar panel, dropdown, or modal
- Image upload size limits
- Read-only enforcement: server-side (Durable Object rejects writes) or client-side only

---

## Stage 7: Production Hardening & Launch

**Goal:** Ship it. The app is deployed to `markdown.party`, abuse-resistant, and ready for real users.

### Deliverables

- Production Alchemy deployment: `alchemy deploy` provisions all Cloudflare resources
  - Worker (with Durable Object bindings)
  - R2 bucket
  - D1 database
  - Custom domain: `markdown.party`
  - Cron triggers for cleanup jobs
- IP-based rate limiting on document creation (Cloudflare Workers rate limiting or custom D1-based)
- Landing page: brief explanation of what markdown.party is, with a "Start writing" CTA that creates a new doc
- Error handling audit: graceful degradation for WebSocket disconnects, R2 failures, GitHub API errors
- Loading states: skeleton UI while Durable Object hydrates, reconnection UI on WebSocket drop
- Mobile responsiveness: editor works on tablets, readable on phones
- Dark mode (shadcn/ui default theme toggle)
- Open source prep: LICENSE, README, contributing guide
- Basic analytics: document creation count, active connections (optional, privacy-respecting)

### Testable Outcomes

- [ ] `markdown.party` loads and creates a new document
- [ ] Full flow works end-to-end: create doc, collaborate, sign in, claim doc, connect GitHub, auto-sync
- [ ] Rate limiting blocks excessive anonymous doc creation from a single IP
- [ ] WebSocket reconnects gracefully after a network interruption
- [ ] Editor is usable on an iPad
- [ ] Dark/light mode toggle works
- [ ] `alchemy destroy` cleanly tears down all resources (for staging environment testing)

---

## Stage Dependency Graph

```
Stage 1: Editor Foundation
    ↓
Stage 2: Real-Time Collaboration
    ↓
Stage 3: Persistence & Document Lifecycle
    ↓
Stage 4: Authentication & User Identity
    ↓
Stage 5: GitHub Sync
    ↓
Stage 6: Document Management & Version History
    ↓
Stage 7: Production Hardening & Launch
```

Stages are strictly sequential — each builds on the previous. However, within each stage, work items can be parallelized (e.g., in Stage 4, GitHub OAuth and magic links can be built concurrently).

---

## Technology Summary

| Layer | Choice |
|-------|--------|
| Frontend framework | Vite + React (or TanStack Start — decided in Stage 1) |
| Editor | Tiptap + y-prosemirror |
| CRDT | Yjs |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend | Cloudflare Workers |
| Real-time | Cloudflare Durable Objects (WebSocket rooms) |
| Object storage | Cloudflare R2 |
| Database | Cloudflare D1 |
| IaC | Alchemy |
| Auth | GitHub OAuth + magic links |
