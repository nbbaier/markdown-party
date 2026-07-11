# What Could markdown.party Become?

**Date:** 2026-07-10
**Status:** Divergent brainstorm — no decisions made
**Participants:** User, Claude

## Context

The repo is being picked back up after a pause. Current state: a solid Tiptap
editor foundation (markdown round-trip via `@tiptap/markdown`, localStorage
autosave, shadcn toolbar, theming) with no backend or collaboration layer yet.
`docs/SPEC.md` describes the original vision: "Google Docs for markdown with a
GitHub backend" on Cloudflare (Workers, Durable Objects, R2, D1) with Yjs CRDT
collaboration.

What changed since the spec was written: agents became first-class markdown
collaborators. Tools like [proof-sdk](https://github.com/EveryInc/proof-sdk)
(editor + collab server + provenance model + agent HTTP bridge) signal a new
category: collaborative markdown editing where some participants are agents.
Markdown is already the lingua franca of agents (CLAUDE.md, plan files, specs,
PR bodies), but agents today edit it via blind file writes — no presence, no
suggestions, no provenance, no human watching live.

## The Divergent Sweep

### 1. The original vision, sharpened — disposable multiplayer markdown

`markdown.party/xyz` → instant doc, link = edit, expires in 7 days unless
claimed, syncs to a gist. "Pastebin that grew up." Still valid, but
HedgeDoc/HackMD occupy this space — the wedge is vibe (zero-friction,
ephemeral, GitHub-native), not category creation.

### 2. Give your agent a cursor

The doc is a room; agents join via an **MCP server** the way humans join via
URL. An agent gets presence (named, colored cursor), can comment, propose
suggestion ranges instead of overwriting, and rewrite sections a human
accepts/rejects inline — the primitives proof-sdk exposes over HTTP, packaged
as a consumer product instead of an SDK.

Magic moment: from Claude Code, "open this plan in the party" → URL appears →
you watch the agent's cursor draft the plan live → you edit *its plan while
it's thinking* and it sees your edits as context. The doc becomes a live
steering wheel for agents, not just an artifact.

### 3. The CLI wedge — tmate for markdown

`npx mdparty ./spec.md` → prints a URL → anyone (or any agent) collaborates →
edits stream back into the local file → git-commit as usual.

This inverts the spec's "markdown.party is source of truth": the **file**
stays the source of truth; the party is an ephemeral session over it. It
sidesteps the scariest product problem (being trusted to hold people's
documents permanently) and makes this a tool, not a silo. Sessions could end
in a commit or PR — "the party ends in a merge." The spec's "Local File Sync
(Future)" section already architected for this (clean WebSocket protocol,
long-lived API keys, REST snapshot endpoints).

### 4. Docs as infrastructure — every doc is an API

- `GET /{slug}.md` → raw markdown
- `GET /{slug}.json` → AST
- `GET /{slug}` → the editor
- Webhooks / SSE on change

A doc becomes something agents can subscribe to: a shared spec that coding
agents in several repos watch, implementing changes as humans edit it.
Spec-driven development with the spec as a live endpoint rather than a stale
file.

### 5. Provenance as the product

Character-level attribution (this human, that agent, which model) rendered as
an overlay or heatmap; a badge like "92% human-reviewed." Valuable anywhere
AI-assisted writing needs an audit trail (legal, journalism, academia).
proof-sdk validates that provenance matters; a hosted tool could make it
*visible and social*.

### 6. Suggestions as the merge model — doc-level PRs without git

Google Docs suggesting mode, CRDT-native: anyone (human or agent) forks a doc
into a proposal layer; the owner reviews diffs semantically (by section, not
line) and merges with one click. Git's collaboration model for people who will
never learn git — and a better review surface for agent output than a wall of
green diff.

### 7. Wilder orbits (rapid-fire)

- **Multiplayer prompt/spec writing with the agent in the room** — team
  co-edits a prompt; an agent pane live-previews output as the prompt changes.
- **Agent standup** — N agents across your repos write status into one shared
  doc every morning; you read one page.
- **Docs that run** — fenced code blocks are executable (e.g. via Val Town);
  markdown notebook, zero install.
- **Embeddable SDK** — `<markdown-party doc="…">` web component. (Competes
  head-on with proof-sdk's actual business — probably build *on* that layer,
  not against it.)
- **Interview/pairing pads** — CoderPad for design docs, with an agent as the
  third participant.
- **Claim mechanic as growth loop** — anonymous doc → gets good → "claim it"
  via GitHub OAuth → becomes a gist → you now have an account. The doc is the
  funnel.

## Synthesis: the strongest combined shape

Directions **2 + 3 + 4** compound into something nobody else is:

> Any markdown file, anywhere, can become a live room for humans and agents
> for an hour, then collapse back into a plain file with provenance in the
> history.

- Keeps the Cloudflare/Yjs architecture from SPEC.md almost unchanged.
- Uses the existing Tiptap editor foundation as-is.
- The MCP server and CLI are the cheapest-to-build, most-demoable pieces.
- proof-sdk is *validation*, not competition: they sell primitives to app
  builders; this is the product a person actually opens. Its provenance model
  could potentially be adopted under the hood rather than reinvented.

The original vision (1) remains the substrate — the room must exist before
agents can enter it — but the pitch reframes from "Google Docs for markdown"
to **"the place where you and your agents edit markdown together."** Same
architecture, fresher story.

## Open Questions

- Build the collab layer from scratch (Yjs + Durable Objects per SPEC.md) or
  evaluate proof-sdk's doc-server/agent-bridge as a foundation?
- MCP server first or CLI first as the agent-facing entry point?
- Does the ephemeral/file-as-source-of-truth model replace the spec's
  permanent-hosted-doc model, or do both coexist (claimed docs = hosted,
  CLI sessions = ephemeral)?
- How much of the provenance model is MVP vs. later?
