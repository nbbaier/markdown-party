---
title: "Editor Foundation"
type: feat
date: 2026-02-11
---

# feat: Editor Foundation (Stage 1)

## Overview

Build a working single-user GFM markdown editor in the browser. No backend, no collaboration. This stage proves the editing experience and establishes the project scaffolding that all subsequent stages build on.

The deliverable is a Vite + React + TypeScript app with a Tiptap WYSIWYG editor that supports full GFM (tables, task lists, strikethrough, autolinks), round-trip markdown serialization, a download-as-`.md` export, and localStorage auto-save.

## Problem Statement / Motivation

markdown.party needs a rock-solid editing foundation before collaboration, persistence, or GitHub sync can be layered on. Stage 1 isolates the editor experience so it can be validated independently: if the GFM round-trip is lossy or the editor feels sluggish, those problems compound in later stages.

## Proposed Solution

**Framework:** Plain Vite SPA (React + TypeScript). No TanStack Start — Stage 1 has no SSR, auth, or routing needs. Revisit if needed in Stage 3-4.

**Editor:** Tiptap with `@tiptap/markdown` for GFM serialization (uses MarkedJS under the hood with `gfm: true`).

**Styling:** Tailwind CSS v4 (CSS-first config, `@tailwindcss/vite` plugin) + shadcn/ui.

**Package manager:** bun.

**IaC:** Deferred to Stage 2. Stage 1 uses `bunx vite dev` directly — no Alchemy, no Cloudflare Worker. The Worker passthrough adds setup pain and plugin conflict risk for zero user-facing value at this stage.

### Project Structure

```
markdown-party-v2/
├── docs/                      # Existing specs and plans
├── src/
│   ├── main.tsx               # React entry point
│   ├── App.tsx                # Root component
│   ├── index.css              # Tailwind v4 imports + theme
│   └── components/
│       ├── ui/                # shadcn/ui components (auto-generated)
│       ├── Editor.tsx         # Tiptap editor (extensions configured inline)
│       └── Toolbar.tsx        # Fixed formatting toolbar
├── vite.config.ts
├── tsconfig.json
└── package.json
```

No `lib/`, `types/`, `worker/`, `alchemy.run.ts`, or `.env`. Extensions config (~15 lines) and download logic (~8 lines) live inline in the components that use them. Extract if they grow.

### TypeScript Conventions

- `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json` from day one.
- No `any` usage. Tiptap's `Editor` type from `@tiptap/react` is the primary interface passed between components.
- The editor instance flows from `App.tsx` to `Toolbar.tsx` as a prop (simple prop drilling). No context provider needed for two components.

## Technical Considerations

### Tiptap Extensions for GFM

| GFM Feature | Extension | Notes |
|-------------|-----------|-------|
| Tables | `@tiptap/extension-table` (TableKit) | Bundles Table, TableRow, TableCell, TableHeader |
| Task lists | `@tiptap/extension-task-list` + `@tiptap/extension-task-item` | Configure `nested: true` |
| Strikethrough | Included in `@tiptap/starter-kit` (Strike) | No extra install |
| Autolinks | `@tiptap/extension-link` | Configure `autolink: true` |
| Markdown I/O | `@tiptap/markdown` | Configure `markedOptions: { gfm: true }` |

Pin all Tiptap package versions in `package.json`. Extension ordering matters — follow the order above (StarterKit first, then block-level extensions, then inline, then Markdown last).

Zero React node views in Stage 1. Use Tiptap's native HTML rendering for all nodes including task list checkboxes. This avoids re-render overhead and is simpler to implement.

### Markdown Round-Trip Approach

Use `@tiptap/markdown` with `contentType: 'markdown'` for loading and `editor.getMarkdown()` for export. Key considerations:

- **Semantic equivalence, not byte-for-byte.** Extra blank lines may collapse, trailing whitespace may be trimmed. This is acceptable — the rendered output must be identical.
- **HTML passthrough:** GFM allows raw HTML. For Stage 1, preserve it in serialization, and rely on ProseMirror schema filtering in the editor pipeline (not DOMPurify) to reject unsupported structures.
- **Known limitations:** Only one child node per table cell (no lists inside cells, no multi-paragraph cells). HTML comments are lost on round-trip. Custom markdown syntax requires custom MarkedJS tokenizers.
- **Validation approach:** Test round-trip early — this is the highest-risk technical area. If `@tiptap/markdown` is lossy for critical GFM features, discover it before building the UI on top.

### Performance (10,000+ Words)

Do not pre-optimize. Build the editor, then paste a 10,000-word document and see if it feels fine. If it does not, profile with Chrome DevTools Performance panel and fix what is actually slow.

Likely optimizations if needed (apply only after measuring):
- Isolate the editor component from unrelated React state to prevent unnecessary re-renders.
- `shouldRerenderOnTransaction: false` and `useEditorState` for selective subscriptions.
- `requestIdleCallback` (with `setTimeout` fallback for Safari) for serialization during auto-save.

### Tailwind v4 + shadcn/ui Setup

Tailwind v4 uses CSS-first configuration — no `tailwind.config.js`. The `@tailwindcss/vite` plugin replaces PostCSS. shadcn/ui initializes via `bunx shadcn@latest init` and components are added individually (`bunx shadcn@latest add button`).

```typescript
// vite.config.ts
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

### Editor UI

Minimal chrome: a viewport-filling editor with a single fixed toolbar row:
- Inline formatting: bold, italic, strikethrough, code, link
- Block-level actions: heading level, table insert, task list toggle
- A "Download .md" button (top-right)
- No sidebar, no file browser, no settings panel
- No bubble/floating toolbar — one toolbar paradigm is enough for MVP. Add a bubble toolbar as polish later if desired.

Keyboard shortcuts: standard Tiptap defaults (Cmd+B, Cmd+I, Cmd+K for link, Tab in tables). Cmd+S triggers download.

### Data Persistence (Stage 1 Scope)

No backend persistence, but **localStorage auto-save** to prevent accidental data loss:
- Auto-save editor content (as markdown string) to `localStorage` every 10 seconds and on `beforeunload`.
- On load, check localStorage and restore if content exists.
- This is throwaway scaffolding — Stage 3 replaces it with R2/D1 persistence.

### Download Behavior

- Filename: `untitled.md` (no timestamp — simple for now; Stage 6 adds document naming).
- Encoding: UTF-8 without BOM.
- Mechanism: `Blob` + `URL.createObjectURL` + programmatic `<a>` click. Inline in the component — no separate module.
- If serialization throws, show a shadcn/ui toast with the error; don't download a corrupt file.

## Acceptance Criteria

### Functional Requirements

- [x] Editor loads in a viewport-filling layout with minimal chrome
- [x] All GFM features work in the editor:
  - [x] Tables: create, edit cells, add/remove rows and columns
  - [x] Task lists: create, toggle checkboxes by clicking
  - [x] Strikethrough: apply via toolbar or `~~text~~` syntax
  - [x] Autolinks: URLs auto-convert to clickable links
- [x] Markdown round-trip: type content in editor, export to GFM, re-import — rendered output is identical
- [x] "Download as .md" exports valid GFM that renders correctly in GitHub / VS Code
- [x] Standard keyboard shortcuts work (Cmd+B, Cmd+I, Cmd+K, Cmd+S for download)
- [x] Editor content auto-saves to localStorage; survives page refresh

### Non-Functional Requirements

- [ ] Editor feels responsive with a 10,000-word document (no perceivable lag when typing, smooth scrolling)
- [ ] shadcn/ui components render correctly (buttons, tooltips, toasts). Deferred — shadcn/ui will be installed separately.
- [x] `bun run dev` starts the app locally without errors
- [x] Vite hot reload works during development
- [x] Builds successfully with `bun run build`
- [x] `strict: true` TypeScript — no `any`, no type errors

### Quality Gates

- [ ] GFM round-trip validated manually with a representative markdown document covering: tables with formatting, nested task lists, strikethrough, autolinks, code blocks with language specifiers, nested lists, emphasis combinations
- [ ] No console errors on load or during normal editing
- [ ] Works in latest Chrome; spot-check Firefox and Safari

## Success Metrics

- A developer can clone the repo, run `bun install && bun run dev`, and start editing markdown immediately.
- Exported `.md` files render identically on GitHub when pasted into a gist.
- The editing experience feels native — no perceivable lag, no formatting glitches.

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@tiptap/markdown` round-trip lossy for edge cases | Medium | High | Test round-trip early (step 2); accept semantic equivalence over byte-for-byte |
| Tailwind v4 + shadcn/ui compatibility issues | Low | Medium | shadcn/ui explicitly supports Tailwind v4; fallback to v3 if needed |
| Table editing UX is clunky in Tiptap | Medium | Medium | Accept Tiptap's default table UX for MVP; polish in Stage 6 |
| `@tiptap/markdown` is still in beta | Medium | Low | Pin version; the core MarkedJS integration is stable |

## Implementation Sequence

1. **Scaffold project** — `bun create vite`, install Tiptap + Tailwind + shadcn/ui deps, configure `vite.config.ts` with strict `tsconfig.json`
2. **Build Tiptap editor + verify round-trip** — configure GFM extensions inline in `Editor.tsx`, wire into React, immediately test markdown round-trip with a representative GFM document. This is the highest-risk step — discover serialization issues before building the UI.
3. **Implement markdown I/O + localStorage auto-save** — `contentType: 'markdown'` for loading, `editor.getMarkdown()` for export, periodic save to localStorage, restore on load
4. **Build fixed toolbar + download** — single toolbar row for all formatting actions, download button with inline Blob logic, keyboard shortcuts, error toast
5. **Validate + polish** — test all GFM features end-to-end, paste a 10,000-word document and confirm performance, spot-check Firefox/Safari, fix any issues

## Deferred to Stage 2

The following items were in the original plan but deferred based on technical review:

- **Alchemy + Cloudflare Worker** — no backend logic runs in Stage 1. Add when WebSocket/Durable Object support is needed.
- **Bubble/floating toolbar** — one toolbar paradigm is enough for MVP. Add as polish later.
- **`requestIdleCallback` optimization** — premature without profiling data. Apply if performance testing reveals issues.
- **Formal test corpus with assertions** — no test runner is set up. Manual validation with a representative `.md` file suffices for Stage 1. Consider adding Vitest + automated round-trip tests once the editor is stable.

## References & Research

### Key Packages

- `@tiptap/react`, `@tiptap/core`, `@tiptap/starter-kit` — editor core
- `@tiptap/markdown` — GFM serialization via MarkedJS
- `@tiptap/extension-table` — TableKit (Table, TableRow, TableCell, TableHeader)
- `@tiptap/extension-task-list`, `@tiptap/extension-task-item` — task list support
- `@tiptap/extension-link` — autolink support
- `tailwindcss`, `@tailwindcss/vite` — Tailwind v4 with Vite plugin

### Documentation

- [Tiptap Markdown Extension](https://tiptap.dev/docs/editor/markdown) — installation, basic usage, limitations
- [Tiptap Performance Guide](https://tiptap.dev/docs/guides/performance) — React-specific optimizations
- [shadcn/ui Vite Installation](https://ui.shadcn.com/docs/installation/vite) — setup process
- [shadcn/ui Tailwind v4 Guide](https://ui.shadcn.com/docs/tailwind-v4) — v4-specific setup
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, Vite plugin
- [GFM Spec](https://github.github.com/gfm/) — authoritative GFM reference

### Internal References

- `docs/SPEC.md` — full product specification
- `docs/IMPLEMENTATION_STAGES.md` — 7-stage implementation plan
