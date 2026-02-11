# Code Review Findings — PR #3 (rewrite/editor-foundation)

Reviewed 2026-02-11. P1 finding resolved in commit `38925c3`.

---

## P2 — Important (Should Fix)

### 1. `next-themes` dependency is dead code

No `ThemeProvider` wraps the app, so `useTheme()` in `src/components/ui/sonner.tsx` always returns defaults. A Next.js-oriented package in a Vite SPA with no dark mode toggle.

**Fix:** Import `Toaster` directly from `sonner` in `src/app.tsx`, delete `src/components/ui/sonner.tsx`, remove `next-themes` from `package.json`.

### 2. Unused shadcn components and unnecessary dependencies

`src/components/ui/button.tsx` and `src/components/ui/tooltip.tsx` are never imported by any app component. They pull in 5 runtime dependencies that serve no purpose:

- `class-variance-authority`
- `radix-ui`
- `clsx`
- `tailwind-merge`
- `next-themes` (see above)

Also unused: `src/lib/utils.ts` (only imported by the unused components).

**Fix:** Delete `button.tsx`, `tooltip.tsx`, `utils.ts`. Remove the 5 deps from `package.json`. Re-add via `npx shadcn add` when actually needed.

### 3. Missing `aria-pressed` on toolbar toggle buttons

`src/components/toolbar.tsx` — `ToolbarButton` uses visual styling to indicate active state but lacks `aria-pressed`. The project's own Ultracite/AGENTS.md standards require semantic ARIA attributes for accessibility.

**Fix:** Add `aria-pressed={isActive}` to the `<button>` element in `ToolbarButton`.

### 4. Bundle is 708KB (222KB gzip), triggers Vite chunk warning

All Tiptap extensions ship in a single chunk with no code splitting.

**Fix:** Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split Tiptap into its own chunk. Example:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        tiptap: [
          "@tiptap/core",
          "@tiptap/react",
          "@tiptap/starter-kit",
          "@tiptap/pm",
          "@tiptap/markdown",
        ],
      },
    },
  },
},
```

### 5. `beforeunload` save runs unconditionally

`src/components/editor.tsx:112` — `onBeforeUnload` calls `saveToLocalStorage(editor)` even when nothing has changed, serializing the full document unnecessarily.

**Fix:** Guard with `isDirtyRef.current`:

```ts
const onBeforeUnload = () => {
   if (isDirtyRef.current) {
      saveToLocalStorage(editor);
      isDirtyRef.current = false;
   }
};
```

---

## P3 — Nice-to-Have

### 6. Duplicated download error handling

Identical try/catch + `toast.error("Failed to export markdown")` exists in both `src/components/editor.tsx` (Cmd+S handler) and `src/components/toolbar.tsx` (download button). If the message changes, it must be updated in two places.

**Fix:** Move error handling into `downloadMarkdown` in `src/lib/download.ts`, or create a `safeDownloadMarkdown` wrapper both call sites use.

### 7. `URL.revokeObjectURL` called synchronously after click

`src/lib/download.ts:13` — In some browsers, the download may not have started before the object URL is revoked.

**Fix:** `setTimeout(() => URL.revokeObjectURL(url), 1000);`

### 8. Hardcoded download filename `"untitled.md"`

`src/lib/download.ts:10` — Always downloads as `untitled.md` regardless of content.

**Fix:** Accept an optional filename parameter, or extract the first H1 from the markdown:

```ts
export function downloadMarkdown(editor: TiptapEditor, filename = "untitled.md"): void {
```

### 9. `defaultContent` naming inconsistency

`src/components/editor.tsx:20` — Uses camelCase while sibling constants `STORAGE_KEY` and `AUTO_SAVE_INTERVAL` use SCREAMING_SNAKE_CASE.

**Fix:** Rename to `DEFAULT_CONTENT`.

---

## Informational (No Action Required)

- **Security posture is good.** Tiptap's ProseMirror schema prevents XSS. No hardcoded secrets. Link URL validation is sound (Tiptap also validates internally).
- **`window.prompt` for link input** is acceptable for Stage 1, but should become a custom modal in a future stage.
- **Unused CSS theme variables** (sidebar, chart, dark mode) are shadcn scaffolding. Low impact but could be trimmed.
- **`localStorage` error handling** — `getInitialContent` and `saveToLocalStorage` don't catch `localStorage` exceptions (quota exceeded, disabled). Low risk for Stage 1.
- **Stage 2 prep** — Consider extracting persistence logic from `editor.tsx` into a `usePersistence` hook before adding Yjs, so the localStorage mechanism can be swapped cleanly.
