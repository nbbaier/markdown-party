# Rewrite Log

## 2026-02-11: Editor Foundation Rewrite

### What happened

The `markdown-party` codebase was replaced with a clean editor foundation originally developed in a separate repo (`markdown-party-v2`). The v2 work was done on a `feat/editor-foundation` branch and then copied into `markdown-party` on the `rewrite/editor-foundation` branch (commit `0c2160c`).

### What was removed

- **Editor**: Milkdown (plugin-based, ProseMirror)
- **Real-time collaboration**: Yjs, y-partyserver, @milkdown/plugin-collab
- **Backend**: Cloudflare Workers, Hono, PartyServer, wrangler config
- **Auth**: GitHub OAuth, magic links, CSRF, JWT, encryption utilities
- **Routing**: React Router, multi-document pages (gist page, landing page, not-found)
- **Markdown pipeline**: remark, rehype, unified
- **Tooling**: Biome linter, tsgo compiler, ultracite

All removed code is preserved in git history on `main` and other branches (`refactor/spec-v2`, `nbbaier/algiers`, `nbbaier/brisbane`).

### What was added

- **Editor**: Tiptap 3.19 with GFM support (tables, task lists, strikethrough)
- **UI**: shadcn components (Button, Tooltip, Sonner), Lucide icons
- **Styling**: Tailwind CSS 4.1
- **Toolbar**: Rich formatting toolbar (headings, lists, code blocks, links, tables)
- **Persistence**: localStorage auto-save (10s interval), Cmd/Ctrl+S to download .md
- **Tooling**: ESLint 9, Vite 7.3

### Why

The original codebase had accumulated complexity across editor, collaboration, auth, and backend layers. The rewrite starts from a focused, client-side-only editor foundation with the intent to layer features back incrementally on a cleaner base, using Tiptap instead of Milkdown.

### What's next

See [IMPLEMENTATION_STAGES.md](./IMPLEMENTATION_STAGES.md) and [SPEC.md](./SPEC.md) for the roadmap.
