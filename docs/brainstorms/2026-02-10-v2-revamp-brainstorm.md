---
Date: 2026-02-10
Status: Draft
Spec: SPEC-v2.md
---

# v2 Revamp Brainstorm

## What We're Building

A complete revamp of markdown-party (formerly gist-party) from a "collaborative Gist editor" to a "collaborative markdown editor with optional GitHub persistence." The core shift: the product is the editor. GitHub is a storage backend, not a prerequisite.

## Why This Approach

### Rewrite Strategy: Hybrid Clean Rewrite

Rewrite the core (DocRoom DO, API routes, client UX) from scratch while porting over proven, spec-unchanged pieces:

- **Keep:** Auth flow (GitHub OAuth, JWT cookies), token encryption (AES-GCM), Yjs/y-partyserver integration, Milkdown editor setup
- **Rewrite:** DocRoom DO (new identity model, ephemeral TTL, optional GitHub backend), all API routes (new doc-first endpoints), client routing and UX (no landing page, capability-based sharing)

**Rationale:** The auth, crypto, and Yjs plumbing work correctly and the spec says "same as v1" for those pieces. Rewriting them adds risk and effort for zero benefit. The document model, routes, and UX are fundamentally different and warrant a fresh start.

## Key Decisions

### 1. Entry Flow: Hybrid with Loading State

- SPA loads at `/` with a minimal loading indicator
- Client calls `POST /api/docs` in the background
- URL is replaced to `/:doc_id` once the doc is ready
- User sees the editor appear seamlessly — no full page reload, no jarring redirect

### 2. Edit Token Model: Auto-Cookie for Creator

- `POST /api/docs` returns `{ doc_id, edit_token }` AND sets the edit capability cookie in the response
- Creator's URL is always clean: `/:doc_id` (no fragment)
- Client stores `edit_token` in memory for the "Copy share link" button
- Share link format: `/:doc_id#edit=<token>`
- Recipients visit the share link → client reads the fragment → calls `/api/docs/:doc_id/claim` → gets their own edit cookie
- Read-only access: anyone with just `/:doc_id` (no token, no cookie)

### 3. Upload UX: Load Into Current Doc

- Drag-and-drop or file picker loads content into the current document
- If the doc already has content, prompt to confirm overwrite or create new
- Same doc_id is preserved when loading into current doc

### 4. Editor UI: Milkdown Built-In + Minimal Header

**Formatting controls (in-editor, Milkdown plugins):**
- `@milkdown/plugin-slash` — Type `/` for block formatting (headings, lists, code blocks, etc.)
- `@milkdown/plugin-tooltip` — Select text for floating inline toolbar (bold, italic, link, code)
- Keyboard shortcuts (Cmd+B, Cmd+I, etc.) work naturally

**App actions (header bar):**
- Thin top bar: app name/logo on left, action icons on right
- Actions: Share (copy link), Export/Download (.md), Save to GitHub (signed in), Sign In (anonymous)
- GitHub features (save, sync status) only appear when signed in

### 5. GitHub Persistence: Save to Gist or Repo

**In MVP:**
- Signed-in users can "Save to GitHub" → choose Gist (public/secret) or repo file
- Creates a link between the doc and the GitHub backend
- Subsequent edits auto-sync (debounced, conditional writes)
- Sync status visible in header (Saved / Saving / Error)

**Import:**
- "Import from URL" — paste any URL to a raw markdown file (Gist raw URL, GitHub raw URL, any public .md URL)
- Content is fetched and loaded into the current doc
- One-time copy, no ongoing sync from the source URL
- Works for all users (anonymous and signed in)

**Deferred:**
- Two-way import from existing Gist (link for ongoing sync) — post-MVP

### 6. Document Identity & Lifecycle

- Documents identified by short random `doc_id` (not Gist ID)
- Anonymous docs: ephemeral, 24h TTL after last activity, enforced via DO alarm
- Signed-in user docs: persistent, no auto-expiry
- DocRoom DO is the source of truth; GitHub is optional sync target

## Open Questions

1. **URL format:** Short random ID length/alphabet — what balances readability with collision avoidance? (e.g., nanoid with 6-8 chars?)
2. **Repo file save UX:** When saving to a repo file, how does the user specify the file path and branch? Simple modal with repo picker + path input?
3. **Import from URL — error handling:** What happens if the URL returns non-markdown content, is too large, or is unreachable? Toast notification with error message?
4. **Overwrite confirmation:** When uploading/importing into a doc with existing content — modal dialog or inline prompt?
5. **DO alarm + hibernation:** Verify that DO alarms fire correctly when the DO is hibernated (Cloudflare docs suggest they do, but worth confirming).

## Out of Scope (per spec + decisions)

- Document dashboard / list for signed-in users
- Two-way Gist import with ongoing sync
- Multiple files per document
- Offline support / service worker
- Comments, annotations, version history
- Conflict resolution UI (last write wins for MVP)
- Command palette (Cmd+K) — consider post-MVP
