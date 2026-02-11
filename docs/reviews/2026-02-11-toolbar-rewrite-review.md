# Code Review: Toolbar Rewrite (6fd7388..cc052a8)

**Branch:** `rewrite/editor-foundation`
**Date:** 2026-02-11
**Commits reviewed:**
- `bca4f42` docs: shadcn tiptap implementation
- `808aafc` feat(toolbar): rewrite toolbar with shadcn/ui components
- `cc052a8` feat: switched to tsgo

**Review agents used:** kieran-typescript-reviewer, security-sentinel, architecture-strategist, pattern-recognition-specialist, performance-oracle, code-simplicity-reviewer

---

## Summary

- **Total Findings:** 11
- **P1 Critical:** 2
- **P2 Important:** 5
- **P3 Nice-to-Have:** 4

The toolbar rewrite is well-structured overall. The component decomposition is clean, the `useEditorState` selector pattern is correct, and the `LinkDialog` extraction is a good separation of concerns. Two findings block merge: an accessibility issue with `Toggle` misuse and a URL validation bypass.

---

## P1 — Critical (Blocks Merge)

### 1. `Toggle` misused for non-toggle action buttons — wrong `aria-pressed` semantics

**File:** `src/components/toolbar.tsx:61-80`
**Flagged by:** All 6 agents

`ToolbarButton` renders a Radix `Toggle` with `pressed={false}` hardcoded for one-shot actions (Insert Table, Horizontal Rule, Download). This emits `aria-pressed="false"` to assistive technology, misleading screen readers into announcing these as toggle buttons that are "not pressed."

**Fix:** Use a plain `<button>` styled with `toggleVariants` for action-only buttons:

```tsx
function ToolbarAction({ onClick, tooltip, children }: {
  onClick: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(toggleVariants({ size: "sm" }))}
          onClick={onClick}
          type="button"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
```

### 2. `isValidLinkUrl` allows protocol-relative URL bypass

**File:** `src/components/link-dialog.tsx:13-21`
**Flagged by:** security-sentinel

The `url.startsWith("/")` check allows `//evil.com/phishing` to pass validation. Browsers resolve `//evil.com` relative to the current protocol, creating a link to `https://evil.com/phishing`. This enables phishing via crafted links.

**Fix:** Add an explicit check before the `/` allowance:

```typescript
function isValidLinkUrl(url: string): boolean {
  const trimmed = url.trim();

  if (trimmed.startsWith("//")) {
    return false;
  }

  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  );
}
```

---

## P2 — Important (Should Fix)

### 3. `onSubmit` type includes `null` but null is never passed

**File:** `src/components/link-dialog.tsx:27`, `src/components/toolbar.tsx:112-115`
**Flagged by:** kieran-typescript-reviewer

`onSubmit: (url: string | null) => void` — the dialog never calls `onSubmit(null)`. Cancellation is handled via `onOpenChange(false)`. The `null` check in `handleLinkSubmit` is dead code.

**Fix:** Narrow to `onSubmit: (url: string) => void` and remove the `null` guard in `handleLinkSubmit`.

### 4. Unused `inputRef` in LinkDialog

**File:** `src/components/link-dialog.tsx:38`
**Flagged by:** kieran-typescript-reviewer, code-simplicity-reviewer, pattern-recognition-specialist

`useRef<HTMLInputElement>(null)` is created and attached but never read. Dead code.

**Fix:** Remove the ref and the `useRef` import, or use it to auto-focus the input on dialog open.

### 5. `radix-ui` barrel import risks bundle bloat

**File:** All `src/components/ui/*.tsx` files
**Flagged by:** performance-oracle

All UI components import from the unified `radix-ui` barrel package (60+ re-exported packages, 5.1MB on disk). Tree-shaking from barrel re-exports is unreliable across bundlers.

**Fix:** Import from scoped packages directly:

```typescript
// Instead of:
import { Tooltip as TooltipPrimitive } from "radix-ui";

// Use:
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
```

### 6. Inline button styles in LinkDialog — no Button component

**File:** `src/components/link-dialog.tsx:91-115`
**Flagged by:** kieran-typescript-reviewer, architecture-strategist, pattern-recognition-specialist

Three buttons use long, duplicated inline Tailwind class strings. The project already has `cva` and `cn()`. A shadcn `Button` component would eliminate duplication and maintain consistency.

**Fix:** Add the shadcn Button component (`npx shadcn add button`) and use it in the dialog footer.

### 7. Missing `rel="noopener noreferrer"` on Link extension config

**File:** `src/components/editor.tsx:68-71`
**Flagged by:** security-sentinel

The Tiptap Link extension is configured without `rel` attributes. The project's own AGENTS.md mandates `rel="noopener"` for links. Defense-in-depth for if `openOnClick` is later enabled.

**Fix:**

```typescript
Link.configure({
  openOnClick: false,
  autolink: true,
  HTMLAttributes: {
    rel: "noopener noreferrer",
  },
}),
```

---

## P3 — Nice-to-Have

### 8. `"use client"` directives are no-ops in Vite SPA

**Files:** `src/components/ui/dialog.tsx:1`, `src/components/ui/separator.tsx:1`
**Flagged by:** kieran-typescript-reviewer, architecture-strategist, pattern-recognition-specialist

These are Next.js Server Component directives that have no effect in a Vite SPA. Present in 2 of 6 UI files, creating inconsistency. Inherited from shadcn CLI scaffolding.

**Fix:** Remove them, or leave if a framework migration is planned.

### 9. Default exports instead of named exports

**Files:** `src/components/toolbar.tsx:82`, `src/components/link-dialog.tsx:30`
**Flagged by:** kieran-typescript-reviewer

AGENTS.md and the shadcn/ui components all favor named exports. The two application components use `export default`.

**Fix:** Switch to named exports and update import sites.

### 10. `LinkDialog` rendered inside `TooltipProvider` scope

**File:** `src/components/toolbar.tsx:278-286`
**Flagged by:** kieran-typescript-reviewer, performance-oracle

The dialog is a sibling to the toolbar div inside `TooltipProvider`. The dialog uses a Portal so it works, but `TooltipProvider` context wraps something unrelated to tooltips.

**Fix:** Move `LinkDialog` outside `TooltipProvider` using a Fragment wrapper.

### 11. Unused CSS theme variables from shadcn scaffolding

**File:** `src/index.css:147-255`
**Flagged by:** kieran-typescript-reviewer, architecture-strategist

Sidebar, chart, and card variables are standard shadcn boilerplate that this editor does not use. Adds ~100 lines of noise.

**Fix:** Trim unused variables for a leaner stylesheet.

---

## Positive Observations

- **`useEditorState` selector pattern** is well-implemented — flat boolean return prevents unnecessary re-renders
- **`LinkDialog` extraction** is clean separation of concerns with a minimal 4-prop interface
- **UI primitive layering** follows shadcn conventions correctly — no business logic in `ui/` components
- **Import graph is acyclic** with proper dependency direction
- **No security issues in shadcn/ui components** — no `dangerouslySetInnerHTML`, `eval()`, or DOM manipulation
- **`isValidLinkUrl` allowlist approach** is fundamentally sound (aside from the `//` bypass)
