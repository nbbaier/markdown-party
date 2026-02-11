# Editor Migration: minimal-tiptap + shadcn base-ui

**Date:** 2026-02-11
**Status:** Decided
**Participants:** User, Claude

## What We're Building

Replace the current hand-built Tiptap editor components (`editor.tsx`, `toolbar.tsx`) with [minimal-tiptap](https://github.com/Aslam97/minimal-tiptap), a shadcn/ui-native Tiptap wrapper. This gives us a maintained, polished editor toolbar built on shadcn components, while preserving full access to Tiptap's extension system for future advanced features (Yjs collaboration, custom nodes, commenting).

Separately, plan a future migration of shadcn/ui from Radix UI to Base UI once the base-ui variant stabilizes.

## Why This Approach

**Chosen:** Approach A — Adopt minimal-tiptap with Radix-based shadcn now, migrate to base-ui later.

**Rejected alternatives:**
- **B (minimal-tiptap + base-ui now):** Too much upfront work. minimal-tiptap assumes Radix primitives (Popover, Dialog, DropdownMenu, Toggle, ToggleGroup). Porting all of these to base-ui before the base-ui variant is officially stable would block progress and risk API churn.
- **C (Keep custom components, add shadcn):** Maintains all toolbar logic ourselves, misses out on minimal-tiptap's extras (image upload, code highlighting, color picker), more work for less polish.

**Why A wins:**
- Immediate payoff: eliminates ~250 lines of custom toolbar code
- shadcn consistency across the app from the start
- Full Tiptap extension access preserved for future stages (collaboration, custom nodes)
- Zero shadcn components currently in use, so future base-ui migration surface is small
- base-ui shadcn is still pre-release; waiting lets it stabilize

## Key Decisions

1. **Adopt minimal-tiptap now** on current Radix-based shadcn/ui
2. **Defer base-ui migration** until the shadcn base-ui variant is officially released and minimal-tiptap (or a fork) supports it
3. **Swap icons to lucide-react** — minimal-tiptap defaults to Radix icons; we use lucide-react for consistency
4. **Keep Tiptap extension control** — minimal-tiptap wraps Tiptap, so we can still add Yjs, custom nodes, and other extensions as needed
5. **Preserve markdown round-trip** — continue using `@tiptap/markdown` for serialization; verify compatibility with minimal-tiptap's extension set

## What minimal-tiptap Provides

- Pre-built toolbar with configurable sections
- shadcn/ui components: Button, DropdownMenu, Input, Label, Popover, Separator, Switch, Toggle, Tooltip, Dialog, ToggleGroup, Sonner
- Built-in extensions: code block highlighting (lowlight), text color, images with zoom, typography, horizontal rules
- Automatic formatting removal on new blocks
- Performance optimization via `shouldRerenderOnTransaction`
- Multiple output formats (HTML, JSON, text)

## What We Lose / Must Verify

- **Custom auto-save logic:** Currently in `editor.tsx` — need to ensure we can still access the editor instance for `editor.getMarkdown()` and localStorage persistence
- **Keyboard shortcuts:** Cmd+S download shortcut is custom; needs to be preserved
- **Markdown output:** minimal-tiptap may default to HTML output; must configure for markdown via `@tiptap/markdown`
- **Extension compatibility:** Verify our current extensions (Table, TaskList, Link) work alongside minimal-tiptap's built-in set without conflicts

## shadcn Components Needed

minimal-tiptap requires these shadcn/ui components to be installed:
- Button, Dialog, Dropdown Menu, Input, Label, Popover, Separator, Switch, Toggle, Toggle Group, Tooltip, Sonner

We already have `sonner` as a dependency. The rest need to be added via `bunx shadcn@latest add`.

## Base-UI Migration (Future)

**Reference:** https://github.com/shadcn-ui/ui/discussions/9562

When ready, the migration involves:
- Removing `asChild` attributes across components
- Updating Checkbox (`checked` requires strict boolean, new `indeterminate` param)
- Updating ToggleGroup (`value` expects arrays, explicit `multiple` field)
- Replacing Form with Base UI's `Field` component
- Swapping Radix positioning for Floating UI
- Component-by-component replacement (not big-bang)

**Trigger to begin:** When shadcn officially ships the base-ui variant and minimal-tiptap (or community) provides base-ui-compatible components.

## Open Questions

1. Does minimal-tiptap support `@tiptap/markdown` extension natively, or do we need to wire it in ourselves?
2. Can we access the raw Tiptap `editor` instance from minimal-tiptap for auto-save and keyboard shortcuts?
3. What's the bundle size impact of minimal-tiptap's additional extensions (lowlight, image zoom)?
4. Should we fork minimal-tiptap into the project (as shadcn components are copy-paste) or use it as a dependency?

## Migration Steps (High Level)

1. Install shadcn/ui components required by minimal-tiptap
2. Add minimal-tiptap to the project (likely as copied components per shadcn convention)
3. Wire up `@tiptap/markdown` extension
4. Preserve auto-save and keyboard shortcut logic
5. Remove old `toolbar.tsx` and simplify `editor.tsx`
6. Swap Radix icons for lucide-react
7. Verify markdown round-trip with all extensions
8. Update editor styles in `index.css` to work with minimal-tiptap's classes
