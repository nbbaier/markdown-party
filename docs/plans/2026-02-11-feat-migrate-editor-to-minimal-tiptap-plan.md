---
title: "feat: Rewrite toolbar with shadcn/ui components"
type: feat
date: 2026-02-11
---

# feat: Rewrite toolbar with shadcn/ui components

## Overview

Replace the hand-built toolbar in `toolbar.tsx` with shadcn/ui primitives (`Toggle`, `Separator`, `Tooltip`, `Dialog`). Replace the `window.prompt` link input with a proper link dialog. Update hardcoded colors in `.tiptap` styles to shadcn semantic tokens for dark mode readiness.

Leave `editor.tsx` untouched — its persistence logic, extension wiring, and keyboard shortcuts already work cleanly.

## Problem Statement

The toolbar (`src/components/toolbar.tsx`, 261 lines) uses raw `<button>` elements with hand-rolled active states and a custom `ToolbarButton` component. The link input uses `window.prompt`. This creates:
- Visual inconsistency with future shadcn-based UI elsewhere in the app
- A poor link editing UX (`window.prompt` is modal, ugly, and non-customizable)
- Hardcoded gray/blue colors that won't work with dark mode

## Proposed Solution

Targeted rewrite of `toolbar.tsx` to use shadcn components. No new architecture, no third-party editor wrapper, no changes to `editor.tsx`.

### What Changes

| Current | After |
|---|---|
| Custom `ToolbarButton` component (27 lines) | shadcn `Toggle` |
| Custom `Separator` component (3 lines) | shadcn `Separator` |
| No button tooltips | shadcn `Tooltip` with keyboard shortcut hints |
| `window.prompt` for link URL | shadcn `Dialog` + `Input` + `Label` |
| Hardcoded `var(--color-gray-*)` in `.tiptap` CSS | shadcn semantic tokens (`--border`, `--muted`, etc.) |

### What Does NOT Change

- `src/components/editor.tsx` — untouched (persistence, extensions, shortcuts all stay)
- `src/lib/download.ts` — untouched
- `src/app.tsx` — untouched (keep direct `sonner` import)
- `vite.config.ts` — untouched (no new Tiptap extensions, no chunk changes)
- Tiptap extensions — same set (StarterKit, Table, TaskList, Link, Markdown)

### Architecture

```
src/
├── components/
│   ├── editor.tsx              ← UNCHANGED
│   ├── toolbar.tsx             ← Rewritten to use shadcn primitives
│   ├── link-dialog.tsx         ← NEW: replaces window.prompt (~40 lines)
│   └── ui/                     ← shadcn/ui components (generated)
│       ├── toggle.tsx
│       ├── separator.tsx
│       ├── tooltip.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       └── label.tsx
├── lib/
│   ├── download.ts             ← UNCHANGED
│   └── utils.ts                ← NEW: cn() helper (required by shadcn)
└── index.css                   ← Updated: semantic tokens in .tiptap styles
```

## Implementation

### Step 1: Install shadcn/ui components

- [ ] Re-add `src/lib/utils.ts` with `cn()` helper
- [ ] Install 6 shadcn components: `bunx shadcn@latest add toggle separator tooltip dialog input label`
- [ ] Verify `bun x ultracite check` passes
- [ ] Verify `vite build` succeeds

**Files created:**
- `src/lib/utils.ts`
- `src/components/ui/toggle.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`

### Step 2: Build link dialog component

- [ ] Create `src/components/link-dialog.tsx` using shadcn `Dialog`, `Input`, `Label`
- [ ] Accept props: `open`, `onOpenChange`, `defaultUrl`, `onSubmit(url: string | null)`
- [ ] Validate URL against the same allowlist as current code (http, https, mailto, relative, anchor)
- [ ] Support three actions: set link (submit URL), remove link (submit empty), cancel (close dialog)
- [ ] Show validation error inline for invalid URLs
- [ ] Auto-focus the input field on open

### Step 3: Rewrite toolbar with shadcn components

- [ ] Replace `ToolbarButton` with shadcn `Toggle` (use `pressed` prop for active state)
- [ ] Replace hand-rolled `Separator` with shadcn `Separator` (orientation="vertical")
- [ ] Wrap each toggle in shadcn `Tooltip` with label + keyboard shortcut
- [ ] Replace `window.prompt` link flow with `LinkDialog` component from Step 2
- [ ] Keep the same toolbar layout: inline marks | headings | lists | blocks | download (ml-auto)
- [ ] Keep all existing `editor.chain().focus()...run()` command calls — they don't change
- [ ] Keep the `useEditorState` selector for active states — it doesn't change
- [ ] Remove the biome-ignore lint suppression for `window.prompt` (no longer needed)

**Files modified:**
- `src/components/toolbar.tsx` (rewrite)

**Files deleted:**
- None (toolbar.tsx is rewritten in place)

### Step 4: Update editor styles for dark mode readiness

Update hardcoded Tailwind color vars in `.tiptap` styles (`src/index.css` lines 12-145) to shadcn semantic tokens:

| Current | Replace With | Elements |
|---|---|---|
| `var(--color-gray-100)` | `var(--muted)` | Code block bg, table header bg |
| `var(--color-gray-200)` | `var(--accent)` | Inline code bg |
| `var(--color-gray-300)` | `var(--border)` | Blockquote border, table borders, hr |
| `var(--color-gray-500)` | `var(--muted-foreground)` | Blockquote text |
| `var(--color-gray-600)` | `var(--muted-foreground)` | Code block text |
| `var(--color-blue-100)` | `var(--accent)` | Selected table cell |
| `var(--color-blue-600)` | `var(--primary)` | Link color |

- [ ] Update each `.tiptap` CSS rule per the table above
- [ ] Verify editor content renders correctly in light mode
- [ ] Run `bun x ultracite fix` and `bun x ultracite check`

**Files modified:**
- `src/index.css`

## Acceptance Criteria

### Functional

- [ ] All toolbar formatting works: bold, italic, strikethrough, inline code, headings (1-3), bullet list, ordered list, task list, blockquote, code block, horizontal rule, table (3x3), link
- [ ] Link dialog opens when clicking the link button
- [ ] Link dialog pre-fills the current link URL when editing an existing link
- [ ] Submitting an empty URL in the link dialog removes the link
- [ ] Invalid URLs show an inline validation error
- [ ] Download button still works (triggers markdown export)
- [ ] Cmd+S / Ctrl+S still downloads (handled by `editor.tsx`, untouched)
- [ ] Auto-save still works (handled by `editor.tsx`, untouched)
- [ ] Markdown round-trip still works (no extension changes)
- [ ] Toast notifications still work for errors

### Non-Functional

- [ ] All toolbar toggles have `aria-pressed` (provided by shadcn Toggle)
- [ ] All toolbar buttons have tooltips with keyboard shortcut hints
- [ ] `bun x ultracite check` passes
- [ ] `vite build` succeeds with no new warnings
- [ ] Bundle size increase is minimal (only shadcn components + Radix primitives, no new Tiptap extensions)

## Dependencies

- shadcn/ui components require `class-variance-authority`, `clsx`, `tailwind-merge` (auto-installed by `bunx shadcn add`)
- Radix UI primitives for Toggle, Separator, Tooltip, Dialog (auto-installed)
- No new Tiptap extensions or dependencies

## Future Considerations

- **base-ui migration:** When shadcn ships the base-ui variant, only 6 components need migrating (vs. 12+ in the previous plan). Defer until stable.
- **minimal-tiptap adoption:** If the project later needs features like code highlighting, image upload, or a richer toolbar, minimal-tiptap can be reconsidered at that point — with a clearer understanding of actual needs.
- **Dark mode toggle:** The semantic token migration in Step 4 prepares the editor styles for dark mode, but no toggle is added in this scope.

## References

- Current toolbar: `src/components/toolbar.tsx`
- Current editor (untouched): `src/components/editor.tsx`
- Editor styles: `src/index.css:12-145`
- shadcn config: `components.json`
- Brainstorm: `docs/brainstorms/2026-02-11-editor-migration-brainstorm.md`
- Tiptap chunks gotcha: `docs/solutions/code-quality/tiptap-editor-code-quality-cleanup.md:147`
