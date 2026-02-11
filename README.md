# markdown-party

Real-time collaborative markdown editor with optional GitHub Gist persistence. Deployed on Cloudflare Workers + Durable Objects.

## Quick Start

```bash
bun run dev      # Start dev server
bun run build    # Build for production
bun run check    # Lint and check formatting
bun run fix      # Auto-fix lint and formatting issues
bun run types    # Generate Cloudflare Worker types
```

## Features

- **No sign-in required** — Create and edit documents instantly
- **Real-time collaboration** — Multiple users editing the same document simultaneously via Yjs CRDT
- **Human-readable IDs** — Documents identified by joyful names (e.g., `golden-marble-cathedral`)
- **Anonymous documents** — Ephemeral with 24-hour TTL, no persistence required
- **Share with tokens** — Generate shareable links with edit permissions
- **GitHub Gist integration** — Optional persistence for signed-in users (Phase 2)
- **Rich markdown editing** — Milkdown editor with slash commands and floating tooltips

## Architecture

### Frontend (`src/`)

- **Framework**: React 19 SPA built with Vite
- **Editor**: Milkdown with slash commands and floating tooltip
- **Collaboration**: Yjs CRDT sync via y-partyserver
- **Routing**: react-router-dom with `/` (create) and `/:docId` (edit) routes

### Backend (`worker/`)

- **Runtime**: Cloudflare Workers
- **Router**: Hono HTTP framework
- **Document Persistence**: DocRoom Durable Object extending YServer
- **Storage**: DO SQLite for document persistence
- **API**: RESTful endpoints in `worker/routes/`

### Shared Code

- **`src/shared/`** — Shared types and utilities for client
- **`worker/shared/`** — Shared types and utilities for worker

## Document Lifecycle

1. User visits `/` → SPA creates doc via `POST /api/docs`
2. Receives `{ doc_id, edit_token }` and sets cookie for edit capability
3. Redirected to `/:doc_id`
4. WebSocket connects to `/parties/doc-room/:doc_id` for real-time sync
5. Share via `/:doc_id#edit=<token>` to grant edit access to others
6. Anonymous docs automatically expire 24 hours after last edit activity
7. Signed-in users can save to GitHub Gist for permanent persistence

## Configuration

- **TypeScript**: `tsconfig.json` references `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json`
- **Wrangler**: Configuration in `wrangler.jsonc`
- **Secrets**: Use Wrangler secrets or local `.dev.vars` (not `vars` in `wrangler.jsonc`)
- **Code Quality**: Biome config in `biome.jsonc` extends ultracite/biome presets

## Code Style

- TypeScript strict mode with `strictNullChecks` enabled
- Prefer `unknown` over `any`, use type narrowing over assertions
- `const` by default, arrow functions, destructuring, optional chaining (`?.`) and nullish coalescing (`??`)
- React: function components, hooks at top level, semantic HTML, accessibility attributes
- Async: `async/await` only, no `.then()` chains; throw `Error` objects and use early returns
- Run `bun run fix` before committing
- No `console.log` or `debugger` in production code

## Development

### TypeScript and Linting

```bash
bun run typecheck    # Run TypeScript type checking
bun run check        # Lint and format check via Biome/Ultracite
bun run fix          # Auto-fix lint and formatting issues
```

### Building

```bash
bun run build        # Runs: tsc -b && vite build
```

The project uses TypeScript project references for proper incremental builds across worker, client, and shared code.

## GitHub OAuth Setup

To enable GitHub authentication and Gist persistence, configure the following:

### 1. Create GitHub OAuth Applications

You need to create separate OAuth apps for development and production (GitHub only allows one callback URL per app).

#### Development App

1. Go to your GitHub account → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the form:
   - **Application name**: markdown.party dev (or your preferred dev name)
   - **Homepage URL**: `http://localhost:8787`
   - **Authorization callback URL**: `http://localhost:8787/api/auth/github/callback`
4. Copy the **Client ID** and **Client Secret** for use in your local `.dev.vars` file

#### Production App

1. Go to your GitHub account → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the form:
   - **Application name**: markdown.party (or your preferred name)
   - **Homepage URL**: `https://markdown.party` (or your custom domain)
   - **Authorization callback URL**: `https://markdown.party/api/auth/github/callback`
4. Copy the **Client ID** and **Client Secret** for use in production secrets

### 2. Configure Environment Variables

#### Local Development (`.dev.vars`)

Create a `.dev.vars` file in the project root (this is not committed to git):

```
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
JWT_SECRET=your_random_jwt_secret_here
ENCRYPTION_KEY_V1=your_random_encryption_key_here
```

Generate random secrets:

```bash
# Generate 32-byte random strings for JWT_SECRET and ENCRYPTION_KEY_V1
openssl rand -hex 32
```

#### Production Deployment

Configure secrets via Wrangler:

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY_V1
```

### 3. GitHub OAuth Scopes

The application requests the following scopes:

- **`gist`** — Create and manage Gists
- **`read:user`** — Read user profile information

### 4. How It Works

1. User clicks "Sign in with GitHub" on the frontend
2. Redirected to `/api/auth/github` which initiates OAuth flow
3. GitHub redirects back to `/api/auth/github/callback` with authorization code
4. Backend exchanges code for access token (via PKCE flow)
5. GitHub access token is encrypted and stored in SESSION_KV (30-day TTL)
6. JWT session cookie issued for client authentication (1-hour TTL)
7. User can now link documents to GitHub Gists for persistence

### 5. Session Management

- **Session cookie** (`__session`): JWT token, 1-hour TTL, auto-renewed on document access
- **Session storage** (KV): Encrypted GitHub access token, 30-day TTL
- Logout via `POST /api/auth/logout` clears both session and tokens

## Deployment

This project is designed to run on Cloudflare Workers with Durable Objects. Deploy with:

```bash
wrangler deploy
```

Ensure all necessary secrets are configured in your Cloudflare environment before deploying.
