---
title: "Code Review Findings Resolution — PR #3 (rewrite/editor-foundation)"
date: 2026-02-11
category: code-quality
tags:
   - code-review
   - tiptap-editor
   - bundle-optimization
   - accessibility
   - dependency-cleanup
module:
   - editor
   - toolbar
   - download
   - build-config
symptoms:
   - "Dead next-themes dependency with no ThemeProvider"
   - "Unused shadcn components pulling in 5 runtime dependencies"
   - "Toolbar toggle buttons missing aria-pressed attribute"
   - "708KB main bundle triggering Vite chunk warning"
   - "Unconditional beforeunload serialization"
   - "Duplicated download error handling across two files"
   - "Synchronous URL.revokeObjectURL race condition"
   - "Hardcoded download filename"
   - "Inconsistent constant naming convention"
severity: P2/P3
status: resolved
commits:
   - fca7d0e
   - 4f47697
---

# Code Review Findings Resolution

Resolved 9 findings from the code review of PR #3 (`rewrite/editor-foundation`). Five P2 (important) findings were committed first, followed by four P3 (nice-to-have) findings in a separate commit.

## Root Cause

The Tiptap editor v2 rewrite accumulated issues during rapid development:

- **Dead dependencies**: `next-themes` was imported but never used (no `ThemeProvider` wraps the app). Five unused deps (`class-variance-authority`, `clsx`, `next-themes`, `radix-ui`, `tailwind-merge`) were pulled in by scaffolded-but-unused shadcn components.
- **Accessibility gap**: `ToolbarButton` used visual styling for active state but lacked `aria-pressed`.
- **Bundle bloat**: All Tiptap extensions shipped in a single 708KB chunk with no code splitting.
- **Unconditional side effect**: `beforeunload` handler serialized the full document even when nothing had changed.
- **Code duplication**: Identical try/catch + `toast.error` existed in both `editor.tsx` and `toolbar.tsx`.
- **Race condition**: `URL.revokeObjectURL` called synchronously before the browser initiated the download.
- **Naming inconsistency**: `defaultContent` used camelCase while sibling constants used `SCREAMING_SNAKE_CASE`.

## Solution

### P2 Fixes (commit `fca7d0e`)

**1. Remove dead next-themes dependency**

```typescript
// BEFORE (app.tsx)
import { Toaster } from "@/components/ui/sonner";

// AFTER — import directly from sonner
import { Toaster } from "sonner";
```

Deleted `src/components/ui/sonner.tsx`.

**2. Delete unused shadcn components and 5 dependencies**

Removed `src/components/ui/button.tsx`, `src/components/ui/tooltip.tsx`, `src/lib/utils.ts`. Ran `bun remove class-variance-authority clsx next-themes radix-ui tailwind-merge`.

**3. Add `aria-pressed` to toolbar toggle buttons**

```typescript
<button
  aria-pressed={isActive}
  className={`rounded p-1.5 transition-colors ${...}`}
  onClick={onClick}
  title={title}
  type="button"
>
```

**4. Split Tiptap into separate chunk**

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        tiptap: [
          "@tiptap/core",
          "@tiptap/react",
          "@tiptap/starter-kit",
          "@tiptap/markdown",
        ],
      },
    },
  },
},
```

Result: main bundle 708KB → 270KB, Tiptap chunk 436KB (loaded separately).

**5. Guard `beforeunload` save with dirty check**

```typescript
const onBeforeUnload = () => {
   if (isDirtyRef.current) {
      saveToLocalStorage(editor);
      isDirtyRef.current = false;
   }
};
```

### P3 Fixes (commit `4f47697`)

**6. Centralize error handling in `downloadMarkdown`**

Moved try/catch + toast into `src/lib/download.ts`. Both call sites now simply call `downloadMarkdown(editor)` without wrapping.

**7. Defer `URL.revokeObjectURL`**

```typescript
// BEFORE
a.click();
URL.revokeObjectURL(url);

// AFTER
a.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

**8. Accept optional filename parameter**

```typescript
export function downloadMarkdown(
  editor: TiptapEditor,
  filename = "untitled.md"
): void {
```

**9. Rename `defaultContent` to `DEFAULT_CONTENT`**

Applied `replace_all` to match `STORAGE_KEY` and `AUTO_SAVE_INTERVAL` convention.

## Gotchas

**`@tiptap/pm` cannot be added to `manualChunks`**. The package lacks a root entry point (its `package.json` has no `"."` specifier in `exports`), causing Rollup to fail with `Missing "." specifier in "@tiptap/pm" package`. Only `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, and `@tiptap/markdown` can be chunked. This is a ProseMirror packaging limitation, not a config error.

## Prevention Strategies

### Dependency auditing

- Run `depcheck` or equivalent in CI to catch unused dependencies before merge.
- When scaffolding with `npx shadcn add`, only add components that are immediately needed.

### Accessibility enforcement

- Biome already lints for many a11y issues. Ensure `aria-pressed` is included in review checklists for any toggle/button component.
- Consider adding `@axe-core/react` for runtime a11y testing during development.

### Bundle size monitoring

- The `manualChunks` config is now in place. Monitor build output for chunk size regressions.
- Consider adding a CI step that fails if any chunk exceeds a size budget.

### Code duplication

- When error handling is identical across call sites, push it into the utility function itself.
- Grep for duplicate `toast.error` strings during review.

### Naming conventions

- All module-level constants should use `SCREAMING_SNAKE_CASE`. Biome does not enforce this by default — rely on code review.

## Checklist for Future Reviews

- [ ] No unused dependencies (`depcheck` or manual audit)
- [ ] All toggle/interactive buttons have `aria-pressed` or equivalent ARIA
- [ ] `vite build` output reviewed for chunk sizes
- [ ] `beforeunload` and similar event handlers are conditional
- [ ] Error handling is not duplicated across components
- [ ] Async resource cleanup (blob URLs, timers) uses deferred revocation
- [ ] Constants follow `SCREAMING_SNAKE_CASE` convention
- [ ] No hardcoded strings that should be parameters

## Cross-References

- [docs/REVIEW-FINDINGS.md](../REVIEW-FINDINGS.md) — Original review findings document
- [docs/REWRITE-LOG.md](../REWRITE-LOG.md) — v2 migration log (Milkdown → Tiptap)
- [docs/IMPLEMENTATION_STAGES.md](../IMPLEMENTATION_STAGES.md) — 7-stage roadmap
- [AGENTS.md](../../AGENTS.md) — Ultracite code standards (accessibility, naming, async patterns)
