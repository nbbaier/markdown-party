# Code Review: refactor/spec-v2

- **PR:** #2 — "refactor: v2 doc-first architecture with ephemeral anonymous docs"
- **Branch:** `refactor/spec-v2` (8 commits, 76 files, -5.3k/+3.5k lines)
- **Date:** 2026-02-11
- **Plan:** `docs/plans/2026-02-10-feat-v2-collaborative-markdown-editor-revamp-plan.md`

## Review Agents

- kieran-typescript-reviewer
- security-sentinel
- performance-oracle
- architecture-strategist
- pattern-recognition-specialist
- code-simplicity-reviewer

## Summary

| Severity        | Count |
| --------------- | ----- |
| P1 Critical     | 4     |
| P2 Important    | 13    |
| P3 Nice-to-Have | 11    |

Build status: `bun run typecheck` and `bun run check` both pass.

---

## P1 — Critical

### P1-1: Timing-unsafe edit token hash comparison

- **Source:** security-sentinel
- **File:** `worker/doc-room.ts:602`
- **Impact:** The edit token hash is compared with `===`, which is vulnerable to timing side-channel attacks. An attacker measuring response times could progressively guess the stored SHA-256 hash.

```typescript
// Current (vulnerable)
const valid = meta?.editTokenHash === body.tokenHash;
```

- **Fix:** Use `crypto.subtle.timingSafeEqual()` available in the Workers runtime:

```typescript
const encoder = new TextEncoder();
const a = encoder.encode(meta.editTokenHash);
const b = encoder.encode(body.tokenHash);
const valid =
   a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
```

- **Effort:** Small

---

### P1-2: CSRF protection bypassed for anonymous users

- **Source:** security-sentinel
- **File:** `worker/shared/csrf.ts:44-49`
- **Impact:** The CSRF middleware skips enforcement when no `__csrf` cookie is present. Since the CSRF cookie is only set during OAuth callback, all anonymous users have zero CSRF protection. This means `POST /api/docs` (doc creation) and `POST /api/docs/:doc_id/claim` (edit token exchange) are unprotected.

An attacker could craft a page that auto-submits `POST /api/docs/:doc_id/claim` with a stolen edit token, claiming edit rights in the victim's browser.

- **Fix:** Issue CSRF cookies to all visitors on first page load.

- **Effort:** Small

---

### P1-3: `doc_id` parameter not validated — cookie header injection

- **Source:** security-sentinel
- **File:** `worker/routes/docs.ts:151`
- **Impact:** The `doc_id` URL parameter goes directly into a manually constructed `Set-Cookie` header. A `doc_id` containing `; Domain=.evil.com` would inject additional cookie attributes.

```typescript
// Cookie path is built from unvalidated docId
const attrs = buildEditCookieAttributes({ docId });
// Then used in raw string concatenation for Set-Cookie
```

- **Fix:** Validate `doc_id` matches the expected `joyful` format:

```typescript
const DOC_ID_REGEX = /^[a-z]+-[a-z]+-[a-z]+$/;
if (!DOC_ID_REGEX.test(docId)) {
   return c.json({ error: "Invalid document ID" }, 400);
}
```

- **Effort:** Small

---

### P1-4: `gist_id` not validated — SSRF via path traversal

- **Source:** security-sentinel
- **File:** `worker/routes/docs.ts:300`
- **Impact:** User-supplied `gist_id` is interpolated into a GitHub API URL without validation. A crafted `gist_id` like `../users/victim` causes an authenticated request to `https://api.github.com/users/victim`. The bearer token is sent with the request, enabling the attacker to trigger authenticated GitHub API calls to arbitrary endpoints.

- **Fix:**

```typescript
if (gistId && !/^[a-f0-9]+$/i.test(gistId)) {
   return c.json({ error: "Invalid gist ID format" }, 400);
}
if (filename && !/^[\w\-. ]+$/.test(filename)) {
   return c.json({ error: "Invalid filename" }, 400);
}
```

- **Effort:** Small

---

## P2 — Important

### P2-1: No rate limiting on sensitive endpoints

- **Source:** security-sentinel, plan document
- **Files:** `worker/routes/auth.ts`, `worker/routes/docs.ts`
- **Impact:** The plan explicitly called for "Cloudflare rate limiting rules for `POST /api/docs`" but this was not implemented. Sensitive endpoints lack any rate limiting: `POST /api/docs` (mass creation), `POST /api/docs/:doc_id/claim` (token brute-force), `POST /api/auth/refresh` (session refresh flooding).

- **Fix:** Configure Cloudflare Rate Limiting rules at the edge, or implement a DO-based rate limiter.

- **Effort:** Medium

---

### P2-2: `handleDiscardLocal` bypasses all validation helpers

**Source:** kieran-typescript-reviewer
**File:** `worker/doc-room.ts:911,926`
**Impact:** Uses raw `JSON.parse` with `as` assertion for both `githubBackend` and session data, while every other method in the file uses dedicated safe-parse helpers (`parseGitHubBackend`, `parseSessionData`). Also duplicates the token-retrieval logic from `getGitHubToken`.

**Fix:** Replace lines 911-933 with calls to `parseGitHubBackend()`, `parseSessionData()`, and `getGitHubToken()`.

**Effort:** Small

---

### P2-3: Type erosion in DO broadcast methods

**Source:** kieran-typescript-reviewer
**Files:** `worker/doc-room.ts:376,383`
**Impact:** `broadcastSyncStatus(state: string)` accepts any string instead of `SyncState`. `broadcastMessage(message: unknown)` accepts anything instead of `CustomMessage`. This bypasses the compile-time safety the discriminated union message protocol provides.

**Fix:** Change signatures to use `SyncState` and `CustomMessage`, use `encodeMessage()` instead of raw `JSON.stringify`.

**Effort:** Small

---

### P2-4: CryptoKey imported fresh on every operation

**Source:** performance-oracle
**Files:** `shared/jwt.ts:35-45`, `shared/encryption.ts:33-42`, `src/shared/edit-cookie.ts:53-62`
**Impact:** Every call to `verifyJwt`, `signJwt`, `signEditCookie`, `verifyEditCookie`, `encrypt`, or `decrypt` calls `crypto.subtle.importKey()`. This happens twice per WebSocket connect and once per GitHub sync. ~2ms overhead per import.

**Fix:** Cache `CryptoKey` in a module-level `Map<string, CryptoKey>` keyed by raw secret:

```typescript
const keyCache = new Map<string, CryptoKey>();
async function importKey(secret: string): Promise<CryptoKey> {
   const cached = keyCache.get(secret);
   if (cached) return cached;
   const key = await crypto.subtle.importKey(/* ... */);
   keyCache.set(secret, key);
   return key;
}
```

**Effort:** Small

---

### P2-5: `findOwnerConnection()` is O(C\*N) with repeated array allocations

**Source:** performance-oracle
**File:** `worker/doc-room.ts:158-170`
**Impact:** Called on every `onSave()` (every 30-60s). Iterates `connectionCapabilities`, and for each owner entry calls `Array.from(this.getConnections())` to materialize the full iterator into an array, then linear-scans. With MAX_CONNECTIONS=50, this means up to 50 full array allocations.

**Fix:** Store `ownerConnectionId` as a class field updated in `onConnect`/`onClose` for O(1) lookup, or at minimum separate the two loops.

**Effort:** Small

---

### P2-6: Duplicated `base64UrlEncode`/`base64UrlDecode` across 4 files

**Source:** pattern-recognition-specialist, code-simplicity-reviewer
**Files:** `shared/jwt.ts:21-33`, `shared/encryption.ts:19-31`, `src/shared/edit-cookie.ts:39-51`, `worker/routes/auth.ts:40-43`
**Impact:** Four copies of identical utility functions. DRY violation. Also uses spread operator (`...bytes`) which could stack-overflow on large payloads.

**Fix:** Extract to `shared/base64url.ts`. Use a loop instead of spread for encoding:

```typescript
let binary = "";
for (let i = 0; i < bytes.length; i++) {
   binary += String.fromCharCode(bytes[i]);
}
```

**Effort:** Small

---

### P2-7: `handleSyncError` and `scheduleRetry` are near-duplicates

**Source:** All 6 agents flagged this
**File:** `worker/doc-room.ts:329-374`
**Impact:** ~15 lines of identical backoff logic (increment attempt, compute delay, broadcast, set timer). Only difference: `handleSyncError` first checks retryability.

**Fix:** `handleSyncError` checks retryability then delegates to `scheduleRetry`:

```typescript
private handleSyncError(status: number): void {
  const isRetryable = status === 403 || status === 429 || status >= 500;
  if (!isRetryable) {
    this.broadcastSyncStatus("error-retrying", `GitHub error: ${status}`);
    return;
  }
  this.scheduleRetry();
}
```

**Effort:** Small

---

### P2-8: `DocMeta` interface duplicated 4 times, shared file unused

**Source:** kieran-typescript-reviewer, pattern-recognition-specialist
**Files:** `worker/doc-room.ts:31` (DocRoomMeta), `worker/routes/docs.ts:28` (DocMeta), `src/shared/doc-meta.ts:3` (DocMeta), `src/client/pages/doc-page.tsx:14` (DocMeta)
**Impact:** `src/shared/doc-meta.ts` was created per the plan as the single source of truth. It also defines `DocMetadataResponse`, `CreateDocResponse`, `ClaimEditResponse`, and `EditTokenResponse`. Nothing imports any of them. All dead code.

**Fix:** Import from `src/shared/doc-meta.ts` everywhere. Remove local definitions.

**Effort:** Small

---

### P2-9: `WorkerEnv`/`Env` interface duplicated 5 times

**Source:** architecture-strategist, pattern-recognition-specialist
**Files:** `worker/index.ts:11`, `worker/doc-room.ts:22`, `worker/routes/docs.ts:12`, `worker/routes/auth.ts:7`, `worker/shared/auth-middleware.ts:4`
**Impact:** Same bindings shape defined redundantly. Any new binding requires updating 5 files.

**Fix:** Define `WorkerBindings` once in `worker/shared/env.ts` and compose Hono `Env` types from it.

**Effort:** Small

---

### P2-10: Module organization: `src/shared/` documented as client-scoped but used by worker

**Source:** architecture-strategist
**Files:** AGENTS.md, `worker/doc-room.ts` imports from `../src/shared/`
**Impact:** AGENTS.md claims `src/shared/` is "scoped to client" but the DO imports `edit-cookie.ts` and `messages.ts` from it. The boundary is not enforced by tsconfig.

**Fix:** Either consolidate `src/shared/` into root `shared/` (matching actual usage), or update AGENTS.md documentation.

**Effort:** Medium

---

### P2-11: JWT payload claims not sanitized

**Source:** security-sentinel
**File:** `worker/routes/auth.ts:136-137`
**Impact:** `login` and `avatarUrl` from GitHub API stored without validation. A `login` with HTML or an `avatarUrl` with `javascript:` protocol could be a stored XSS vector (though React escapes by default in JSX).

**Fix:** Validate `login` matches `/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/`, validate `avatarUrl` starts with `https://avatars.githubusercontent.com/`.

**Effort:** Small

---

### P2-12: `useCollabProvider` depends on `user` object reference

**Source:** performance-oracle
**File:** `src/client/hooks/use-collab-provider.ts:124`
**Impact:** The `useEffect` depends on `user`, which is a new object reference from `useState` on every auth state change. If `AuthProvider` re-renders with same values, the collab provider is destroyed and recreated, causing WebSocket disconnect/reconnect.

**Fix:** Depend on `user?.userId` instead of the `user` object.

**Effort:** Small

---

### P2-13: OAuth state not bound to user session

**Source:** security-sentinel
**File:** `worker/routes/auth.ts:47-73`
**Impact:** The OAuth state parameter in KV is not bound to any client-side identifier. An attacker could initiate an OAuth flow, then trick a victim into completing it with the attacker's state (login CSRF / session fixation). PKCE provides code-level protection, but session-level binding is absent.

**Fix:** Set a random pre-auth cookie when initiating the flow and verify it on callback.

**Effort:** Medium

---

## P3 — Nice-to-Have

### P3-1: 7 `parse*` methods share identical boilerplate

**File:** `worker/doc-room.ts:994-1173`
**Impact:** ~80 LOC of repeated try/catch + typeof + null-check. Could be reduced with a generic `safeParseJson` helper.

### P3-2: Cookie construction duplicated in docs.ts

**File:** `worker/routes/docs.ts:137-155,188-206`
**Impact:** Identical cookie-building block in `POST /` and `POST /:doc_id/claim`. Extract `buildEditCookieHeader(docId, secret)`.

### P3-3: Session cookie regex duplicated 4 times with inconsistent naming

**Files:** `doc-room.ts:14` (`SESSION_COOKIE_REGEXP`), `auth.ts:17`, `docs.ts:45`, `auth-middleware.ts:21` (all `SESSION_COOKIE_REGEX`)
**Fix:** Extract to `worker/shared/session.ts`.

### P3-4: JWT options duplicated 7 times

**Files:** `doc-room.ts:857`, `docs.ts:111`, `auth.ts:188,207,237,270`, `auth-middleware.ts:33`
**Impact:** The `getDefaultJwtOptions(secret)` helper already exists in `shared/jwt.ts:125` but nobody uses it.

### P3-5: Dead code

| Dead Code                         | File                   | Notes                                          |
| --------------------------------- | ---------------------- | ---------------------------------------------- |
| `setMeta` state (write-only)      | `doc-page.tsx:132`     | Value never read                               |
| `DocMeta` interface               | `doc-page.tsx:14-20`   | Only used by dead `setMeta`                    |
| `MESSAGE_DIRECTION` map           | `messages.ts:86-96`    | Never imported                                 |
| `isClientMessage` / `isDOMessage` | `messages.ts:176-182`  | Never imported                                 |
| `ALL_MESSAGE_TYPES` array         | `messages.ts:102-112`  | Only used in `decodeMessage`, could be inlined |
| `needsReEncryption`               | `encryption.ts:67-77`  | Never called                                   |
| `parseEncryptedBlob` (exported)   | `encryption.ts:54-65`  | Only used internally                           |
| `getDefaultJwtOptions`            | `jwt.ts:125-132`       | Never imported                                 |
| `"conflict"` in `SyncState`       | `messages.ts:53`       | No message type sends this state               |
| `verifyJwt;` bare expression      | `auth-middleware.ts:4` | No-op leftover from refactor                   |

### P3-6: `.then()` chains violate style guide

**Files:** `doc-page.tsx:107-110`, `use-edit-token.ts:42-56`
**Impact:** AGENTS.md says "Async: `async/await` only, no raw `.then()` chains."

### P3-7: Event-based communication via `window.dispatchEvent`

**Files:** `header-bar.tsx:71`, `doc-page.tsx:57`
**Impact:** Export button dispatches `CustomEvent("export-document")` via window, bypassing React's component tree with no type safety. Works but fragile.

### P3-8: Missing `Strict-Transport-Security` header

**File:** `worker/index.ts:25-44`
**Fix:** Add `c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")`.

### P3-9: Secrets in `vars` instead of Wrangler secrets

**File:** `wrangler.jsonc:12-16`
**Impact:** `GITHUB_CLIENT_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY_V1` in `vars` block signals plain-text env vars. Values are empty (likely overridden via `wrangler secret put`), but the presence in `vars` is misleading.

### P3-10: Dynamic import of encryption module in DO

**File:** `worker/doc-room.ts:291,929`
**Impact:** `await import("../shared/encryption")` used instead of static import. No bundle-splitting benefit since DO is a single module.

### P3-11: `Array.from(getConnections())` for counting

**File:** `worker/doc-room.ts:91,394,430`
**Impact:** Materializes full connection iterator into array just to check `.length`. Use `this.connectionCapabilities.size` as proxy or an iterator-based count.

---

## Plan Compliance

### Phase 1: Anonymous Editor — Implementation Status

| Category      | Planned  | Done | Missing                                 |
| ------------- | -------- | ---- | --------------------------------------- |
| DocRoom DO    | 12 items | 12   | —                                       |
| Shared types  | 4 items  | 3    | `doc-meta.ts` created but unused        |
| API routes    | 8 items  | 7    | Rate limiting not configured            |
| Client        | 12 items | 12   | —                                       |
| Quality gates | 5 items  | 4    | Minor "gist" refs remain in GitHub code |

### Phase 2: GitHub Persistence — Implementation Status

| Category                         | Planned | Done | Missing                                      |
| -------------------------------- | ------- | ---- | -------------------------------------------- |
| GitHub API endpoints             | 2       | 2    | —                                            |
| GitHub sync in onSave            | 1       | 1    | —                                            |
| Sync status broadcasting         | 1       | 1    | —                                            |
| useSyncStatus hook               | 1       | 1    | —                                            |
| Save to GitHub button + modal    | 2       | 2    | —                                            |
| Sync status indicator in header  | 1       | 0    | Not implemented                              |
| ConflictModal wired into DocPage | 1       | 0    | `conflict-modal.tsx` exists but not rendered |

### Deviations from Plan

1. **`canonical_markdown` table created despite plan.** Plan said "derive on demand." Implementation stores it persistently for `/raw` endpoint and GitHub sync. Arguably an improvement.
2. **Phase 2 implemented alongside Phase 1.** Plan envisioned two phases, branch does both at once. Acceptable.
3. **Shared module consolidation went further.** Plan expected `src/shared/` and `worker/shared/` crypto modules to coexist. Implementation consolidated to root `shared/`. Good change.
4. **Upload/drag-and-drop import.** Listed in acceptance criteria but not implemented. Plan notes "deferred to post-MVP."

---

## Estimated Simplification Potential

- **~200 lines removable** via deduplication and dead code removal
- **~12% duplication rate** across analyzed files (above typical 5-8% threshold)
- Key dedup targets: base64url (4 copies), parse helpers (7 methods), retry logic (2 copies), DocMeta (4 copies), WorkerEnv (5 copies), JWT options (7 occurrences), session cookie regex (4 copies)
