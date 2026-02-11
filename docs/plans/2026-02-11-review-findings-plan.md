---
title: "Address Code Review Findings"
type: fix
date: 2026-02-11
---

# fix: Address Code Review Findings

## Context

The `feat/editor-foundation` branch implements a Tiptap GFM markdown editor. A 6-agent code review identified 6 P2 (important) and 9 P3 (nice-to-have) findings. This plan addresses all of them in three sequential steps: a P2 fix commit, a shadcn/ui installation, and a P3 cleanup commit.

## Execution Checklist

- [x] 1.1 Fix silent error swallowing in download
- [x] 1.2 Break circular dependency
- [x] 1.3 Use `useEditorState` for toolbar
- [x] 1.4 Add dirty flag to auto-save
- [x] 1.5 Add link URL validation
- [x] 1.6 Update plan doc acceptance criteria
- [x] 2.1 Run `bunx shadcn@latest init`
- [x] 2.2 Run `bunx shadcn@latest add button`
- [x] 2.3 Run `bunx shadcn@latest add tooltip`
- [x] 2.4 Run `bunx shadcn@latest add sonner`
- [x] 2.5 Update `App.tsx` to shadcn `<Toaster>` wrapper if needed
- [x] 3.1 Simplify autoSaveRef
- [x] 3.2 Inline beforeunload handler
- [x] 3.3 Remove unused img CSS
- [x] 3.4 Replace `as` cast with runtime guard
- [x] 3.5 Add error handling on localStorage restore
- [x] 3.6 Disable table resizing
- [x] 3.7 Normalize useCallback usage
- [x] 3.8 Keep `@` alias in active use
- [x] Verification commands complete

## Step 1: P2 Fixes (single commit)

### 1.1 Fix silent error swallowing in download
**Files:** `src/components/Editor.tsx`, `src/components/Toolbar.tsx`

- Remove try/catch from `downloadMarkdown` — let it throw naturally
- Remove the comment on line 141
- In `Toolbar.tsx`, keep the existing try/catch in `handleDownload` (it now actually catches)
- In `Editor.tsx` Cmd+S handler (line 107), wrap `downloadMarkdown(editor)` in try/catch with `toast.error()`
- Add `import { toast } from "sonner"` to `Editor.tsx`

### 1.2 Break circular dependency
**Files:** new `src/lib/download.ts`, `src/components/Editor.tsx`, `src/components/Toolbar.tsx`

- Create `src/lib/download.ts` with the `downloadMarkdown` function (no try/catch — plain function that may throw)
- Update both `Editor.tsx` and `Toolbar.tsx` to import from `"@/lib/download"` (this also validates the existing `@` alias config, addressing P3 item 9 by using it rather than removing it)
- Remove the `downloadMarkdown` export from `Editor.tsx`

### 1.3 Use `useEditorState` for toolbar
**File:** `src/components/Toolbar.tsx`

- Import `useEditorState` from `@tiptap/react`
- Add a selector that derives all 13 active states into an object
- Replace all `editor.isActive(...)` calls in JSX with reads from the derived state object
- Keep `editor` prop for command execution (`.chain().focus()...`)

### 1.4 Add dirty flag to auto-save
**File:** `src/components/Editor.tsx`

- Add `const isDirtyRef = useRef(false)`
- Add `onUpdate` callback to `useEditor` config: `onUpdate: () => { isDirtyRef.current = true; }`
- In the auto-save interval, check `isDirtyRef.current` before serializing; reset to `false` after save

### 1.5 Add link URL validation
**File:** `src/components/Toolbar.tsx`

- After `window.prompt`, validate URL protocol before calling `setLink`
- Allow `http://`, `https://`, `mailto:`, and relative paths (starting with `/` or `#`)
- Show `toast.error("Invalid URL")` for rejected URLs (e.g., `javascript:`)
- Add `import { toast } from "sonner"` (already imported)

### 1.6 Update plan doc acceptance criteria
**File:** `docs/plans/2026-02-11-feat-editor-foundation-plan.md`

- Uncheck the shadcn/ui acceptance criterion and add a note: "Deferred — shadcn/ui will be installed separately"
- Correct the DOMPurify reference in the markdown round-trip section (finding #14 from P3, fits naturally here): note that protection is via ProseMirror schema filtering, not DOMPurify

## Step 2: Install shadcn/ui (between commits)

- Run `bunx shadcn@latest init` to scaffold shadcn/ui (creates `src/components/ui/`, updates CSS)
- Run `bunx shadcn@latest add button` to add the Button component
- Run `bunx shadcn@latest add tooltip` to add Tooltip (useful for toolbar)
- Run `bunx shadcn@latest add sonner` to add shadcn's Sonner wrapper (replaces direct sonner import)
- Update `App.tsx` to use shadcn's `<Toaster>` if the wrapper differs
- Commit the shadcn/ui scaffolding

## Step 3: P3 Cleanup (single commit)

### 3.1 Simplify autoSaveRef (item 7)
**File:** `src/components/Editor.tsx`
- Replace `useRef` + `autoSaveRef.current` with a local `const id = setInterval(...)` in the effect
- Remove `useRef` from imports if no longer used

### 3.2 Inline beforeunload handler (item 8)
**File:** `src/components/Editor.tsx`
- Remove `handleBeforeUnload` useCallback
- Inline `const onBeforeUnload = () => saveToLocalStorage(editor)` directly in the useEffect
- Remove `useCallback` from imports if no longer used

### 3.3 Remove unused img CSS (item 10)
**File:** `src/index.css`
- Delete `.tiptap img { max-width: 100%; height: auto; }` block (lines 93-96)

### 3.4 Replace `as` cast with runtime guard (item 11)
**File:** `src/components/Toolbar.tsx`
- Replace `editor.getAttributes("link").href as string | undefined`
- With: `const attrs = editor.getAttributes("link"); const previousUrl = typeof attrs.href === "string" ? attrs.href : undefined;`

### 3.5 Add error handling on localStorage restore (item 12)
**File:** `src/components/Editor.tsx`
- Wrap the `onCreate` callback's `setContent` in try/catch
- On failure, fall back to `defaultContent` and clear the corrupted localStorage entry

### 3.6 Disable table resizing (item 13)
**File:** `src/components/Editor.tsx`
- Change `Table.configure({ resizable: true })` to `Table.configure({ resizable: false })`

### 3.7 Normalize useCallback usage (item 15)
**File:** `src/components/Toolbar.tsx`
- Remove `useCallback` from `setLink`, `insertTable`, `handleDownload` since `ToolbarButton` is not memoized
- Or: keep them and document the convention — decide based on whether shadcn Button is memoized

### 3.8 Skip item 9 (@ alias)
The `@` alias will now be used by the `src/lib/download.ts` import (from step 1.2), so it is no longer unused.

## Verification

1. `bun run build` — must succeed with no type errors
2. `bun run dev` — editor loads, toolbar works, auto-save works
3. Test download: Cmd+S triggers download, toolbar download button works
4. Test error path: temporarily break `getMarkdown()` to verify toast appears
5. Test link validation: try entering `javascript:alert(1)` in link prompt — should show error toast
6. Verify toolbar doesn't flash/re-render on every keystroke (React DevTools Profiler)
7. `bun run lint` — no lint errors
