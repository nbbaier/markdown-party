# gist.party MVP Implementation Plan

## Phases

1. Phase 0: Scaffolding
2. Phase 1: Auth + Sessions
3. Phase 2: GistRoom DO + Realtime Core
4. Phase 3: Client Editor + Collaboration
5. Phase 4: Gist API + Share/Edit Tokens
6. Phase 5: Viewer + Raw Endpoint
7. Phase 6: Security + Limits
8. Phase 7: Integration + QA

## Goals and Milestones

- Phase 0
  - Repo structure, Worker + DO bindings, KV/Secrets configured
  - CI basics and local dev scripts ready
- Phase 1
  - GitHub OAuth (PKCE + state) working end-to-end
  - JWT session cookies + refresh/logout implemented
  - Encrypted token storage in KV with versioned keys
- Phase 2
  - GistRoom DO persists Yjs snapshots to DO SQLite
  - WebSocket routing via routePartykitRequest verified
  - onLoad/onSave with conditional GitHub writes and staleness checks
- Phase 3
  - Milkdown editor renders and edits markdown
  - YProvider sync + cursors between two clients
  - Sync status UI wired to DO custom messages
- Phase 4
  - Create/import gist flows functional
  - Edit token generation + claim flow + capability cookie enforcement
  - Read-only connections blocked from writes/awareness
- Phase 5
  - Read-only viewer renders sanitized markdown
  - /raw endpoint returns text/plain with cache control
  - Uninitialized gist shows 404 page
- Phase 6
  - CSP, nosniff, referrer policy, CSRF protections applied
  - Rate limits + 2 MB doc limit enforced
- Phase 7
  - End-to-end flow: create -> edit -> share -> save -> view
  - Conflict flow (If-Match 412) validated
  - Error handling (GitHub 403/429/5xx, auth refresh failure) validated

## Parallel Tracks

- Track A: Worker/Auth/API
  - OAuth PKCE, session cookies, refresh/logout
  - Gist create/import/metadata endpoints
  - Claim/edit-token endpoints + CSRF
- Track B: Durable Object (GistRoom)
  - onLoad/onSave + snapshot persistence
  - GitHub API client + conditional writes + backoff
  - Read-only enforcement + custom messages
- Track C: Client App
  - Milkdown editor + markdown serialization
  - YProvider + awareness + cursors
  - Sync status UI + conflict resolution UI
- Track D: Viewer + Raw
  - Markdown rendering pipeline (sanitized)
  - /raw endpoint behavior and headers
  - Uninitialized gist 404
- Track E: Security + Limits
  - CSP, nosniff, referrer policy headers
  - CSRF double-submit cookie
  - Rate limits and doc size limits
