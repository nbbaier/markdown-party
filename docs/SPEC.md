# markdown.party - Product Specification

## Vision

A hosted markdown collaboration tool — "Google Docs but for markdown with a GitHub backend." Go to `markdown.party`, get a document, start editing with anyone. No friction.

Inspired by the gap between GitHub (too heavy for collaboration), Notion (not real markdown, hard to sync locally), and the desire for something that feels native, stays in markdown, and backs up to GitHub automatically.

---

## Core Experience

### Entry Point

- **No auth required.** Landing on `markdown.party` immediately creates a new anonymous document.
- Auth (GitHub OAuth or magic link) is optional and unlocks persistence, GitHub sync, and user namespaces.

### URL Scheme

- **Anonymous/quick docs:** `markdown.party/{random-slug}` (e.g., `markdown.party/abc123`)
- **User-namespaced docs:** `markdown.party/@username/doc-name` for authenticated users
- Both coexist. Anonymous docs can be "claimed" into a user namespace.

### Editor

- **WYSIWYG markdown editor** powered by **Tiptap** (ProseMirror-based) with Yjs integration for real-time collaboration.
- Outputs and stores **GitHub Flavored Markdown (GFM)**: CommonMark + tables, task lists, strikethrough, autolinks.
- No markdown extensions beyond GFM for MVP (no math, no Mermaid).
- Export: download as `.md` file or copy shareable link. No PDF/HTML export for MVP.

### Real-Time Collaboration

- **Unlimited simultaneous editors** (best effort scaling).
- **Cursor presence:** colored cursors with collaborator names visible in the editor.
- CRDT-based via **Yjs** — conflict-free concurrent editing at the character level.

### Permissions (MVP)

- **Link = edit access.** If you have the URL, you can edit. Wiki-style simplicity.
- One additional mode: **read-only links** so doc owners can share a view-only version.
- Two permission levels total. No comments, suggestions, or RBAC for MVP.

---

## Authentication

### Providers

1. **GitHub OAuth** — primary auth. Required for GitHub sync features.
2. **Magic links (email)** — secondary auth for non-GitHub users. Can collaborate but cannot use GitHub sync.

### Anonymous Users

- Can create and edit documents without any auth.
- Anonymous documents expire after **7 days** unless claimed by an authenticated user.
- Claiming an anonymous doc makes it permanent and moves it into the user's namespace.

---

## GitHub Sync

### Target

- **User chooses** the sync target per document:
  - **GitHub Gist** (default, simpler) — each doc maps to a gist.
  - **Repository file** — doc maps to a specific file path in a repo. Power user feature.

### Sync Behavior

- **Auto-sync on idle:** after 30-60 seconds of no edits, automatically commit and push to GitHub.
- Smart debouncing: rapid editing sessions batch into single commits.
- **markdown.party is the source of truth.** Pushes overwrite the GitHub side. No bidirectional merge for MVP.
- A "pull from GitHub" manual action can be added post-MVP for reverse sync.
- Small **"synced" indicator** in the UI shows sync status (syncing, synced, error).

### Commit Messages

- Auto-generated from the diff (simple heuristic or small LLM call — deferred to post-MVP).
- For MVP: descriptive but template-based (e.g., "Update document - {date}" or summary of changed sections).

---

## Document Lifecycle

| State | Storage | Duration |
|-------|---------|----------|
| Active (being edited) | Durable Object (in-memory Yjs state) | While editors are connected |
| Warm (recently edited) | Durable Object storage | Minutes after last editor leaves |
| Cold (inactive) | R2 snapshot | Until next access |
| Anonymous unclaimed | R2 snapshot | 7 days, then deleted |
| Claimed/authenticated | R2 snapshot + D1 metadata | Permanent |
| GitHub-synced | R2 + GitHub (source of truth is markdown.party) | Permanent |

### Version History (MVP)

- **Periodic snapshots** stored independently of GitHub.
- Users can browse and restore previous snapshots from within the editor.
- Snapshot frequency: on every sync, plus periodic intervals during active editing (e.g., every 5 minutes).

---

## Architecture

### Infrastructure: Cloudflare

| Service | Role |
|---------|------|
| **Workers** | API layer, auth handlers, GitHub OAuth flow |
| **Durable Objects** | Per-document WebSocket rooms, Yjs state management, real-time sync |
| **R2** | Cold storage for document snapshots, image uploads |
| **D1** | Document metadata (index, ownership, expiry, GitHub connection config) |
| **Pages** (or Workers Sites) | Static frontend hosting |

### Frontend

- **React SPA** built with **Vite** (or **TanStack Start** if SSR/server functions prove valuable for auth flows and landing pages — evaluate during implementation).
- **Tiptap** editor with `y-prosemirror` binding for Yjs collaboration.
- **shadcn/ui** component library + **Tailwind CSS v4** for styling.
- Deployed to Cloudflare Workers/Pages.

### Real-Time Layer

- **Yjs** CRDT for document state.
- **y-websocket** protocol over Cloudflare Durable Objects.
- Each document gets its own Durable Object instance (natural 1:1 mapping).
- Durable Object handles:
  - WebSocket connection management
  - Yjs document state
  - Awareness protocol (cursor positions, user presence)
  - Persistence (flush to R2 on hibernation)

### Data Flow

```
Browser (Tiptap + y-prosemirror)
    ↕ WebSocket
Durable Object (Yjs doc state + awareness)
    ↓ on idle / hibernation
R2 (Yjs document snapshot)
    ↓ on sync trigger
GitHub API (commit + push to gist/repo)
```

### Local File Sync (Future Architecture Consideration)

The system should be architected so that a CLI tool or filesystem watcher can be added later without major refactoring. Key design decisions to support this:

- Durable Objects expose a clean WebSocket protocol that non-browser clients can connect to.
- The Yjs document format is the canonical representation — any client that speaks Yjs can participate.
- Auth tokens should support long-lived API keys (not just session cookies) for CLI usage.
- The document API should have REST endpoints for snapshot read/write in addition to the WebSocket real-time channel.

---

## Image Handling

- Paste/drop images into the editor.
- **GitHub-synced docs:** images are pushed to the connected GitHub repo (in a conventional path like `assets/` or `images/`).
- **Non-synced docs:** images uploaded to **R2** with public URLs.
- Images are referenced as standard markdown image syntax (`![alt](url)`).

---

## Document Management (MVP)

- Authenticated users get a **minimal "recent docs" page** — chronological list of their documents.
- No folders, tags, or search for MVP.
- Each entry shows: doc title (first heading or "Untitled"), last edited date, collaborator count.

---

## Abuse Prevention (MVP)

- **IP-based rate limiting** on anonymous document creation.
- Reasonable limits: e.g., 10 anonymous docs per IP per hour.
- Consider **Cloudflare Turnstile** (free CAPTCHA alternative) if anonymous abuse becomes a problem post-launch.

---

## Branding & Design

- **Warm middle ground** — friendly and approachable but not goofy.
- Think Linear's polish with a touch of personality. The "party" in the name is playful but the tool is credible.
- Clean typography, good use of whitespace, subtle color accents.
- Dark mode support (standard with shadcn/ui).

---

## Monetization

- **Free and open source.** No paid tiers, no feature gating.
- Community-driven development.

---

## AI Features

- **Deferred to post-MVP.** No AI integration in the initial release.
- Future candidates: AI-generated commit messages, document summarization, writing assistance, AI as a @mentionable collaborator.

---

## MVP Scope Summary

### In Scope

- Anonymous instant document creation
- WYSIWYG Tiptap markdown editor with GFM support
- Real-time collaboration via Yjs + Durable Objects
- Cursor presence (names + colors)
- GitHub OAuth + magic link authentication
- User namespaces (`@username/doc-name`)
- GitHub sync (gist or repo, user chooses)
- Auto-sync on idle with debouncing
- Document snapshots + version history (browse/restore)
- Image upload (R2 for anonymous, GitHub for synced docs)
- Recent docs listing for authenticated users
- Read-only shareable links
- Download as .md
- IP rate limiting
- shadcn/ui + Tailwind v4 styling
- Cloudflare-native deployment (Workers, DO, R2, D1)

### Out of Scope (Post-MVP)

- AI features (commit messages, writing assistance, AI collaborator)
- Offline editing support
- Local file sync CLI
- Bidirectional GitHub sync (pull from GitHub)
- Full permission model (comments, suggestions, RBAC)
- Document search, folders, tags
- PDF/HTML export
- Markdown extensions beyond GFM (math, Mermaid, etc.)
- Abuse prevention beyond basic rate limiting

---

## Open Questions

1. **TanStack Start vs plain Vite:** Evaluate whether TanStack Start's server functions and file-based routing provide enough benefit for auth flows and SEO to justify the additional complexity over a pure Vite SPA.
2. **Snapshot granularity:** How many snapshots to retain per document, and for how long? Needs a retention policy.
3. **GitHub API rate limits:** With auto-sync, heavy usage could hit GitHub's API rate limits. May need per-user sync queuing or backoff strategies.
4. **Durable Object hibernation:** Cloudflare's hibernation API affects how/when Yjs state is flushed to R2. Needs implementation spike.
5. **Image storage limits:** Should there be size/count limits on image uploads for anonymous docs?
