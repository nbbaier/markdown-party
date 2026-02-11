import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { downloadMarkdown } from "@/lib/download";
import { Toolbar } from "./toolbar";

const STORAGE_KEY_PREFIX = "markdown-party-content";
const AUTO_SAVE_INTERVAL = 10_000;

const DEFAULT_CONTENT = `# Welcome to markdown.party

Start typing your markdown here. This editor supports **GitHub Flavored Markdown** including:

- **Bold**, *italic*, and ~~strikethrough~~ text
- [Links](https://example.com) that auto-detect URLs
- Task lists with checkboxes
- Tables
- Code blocks and inline \`code\`

## Task List

- [ ] Try out the editor
- [ ] Test markdown export
- [x] Have fun!

## Table Example

| Feature | Status |
|---------|--------|
| Tables | Working |
| Task lists | Working |
| Strikethrough | Working |

Happy writing!
`;

function getStorageKey(): string {
  const url = new URL(window.location.href);
  const existing = url.searchParams.get("doc");

  if (existing) {
    return `${STORAGE_KEY_PREFIX}:${existing}`;
  }

  const docId = crypto.randomUUID();
  url.searchParams.set("doc", docId);
  window.history.replaceState(null, "", url);
  return `${STORAGE_KEY_PREFIX}:${docId}`;
}

function getInitialContent(storageKey: string): string {
  const saved = localStorage.getItem(storageKey);
  return saved ?? DEFAULT_CONTENT;
}

function saveToLocalStorage(editor: TiptapEditor, storageKey: string) {
  const markdown = editor.getMarkdown();
  localStorage.setItem(storageKey, markdown);
}

function ensureStorageKey(
  storageKeyRef: React.MutableRefObject<string | null>
): string {
  if (!storageKeyRef.current) {
    storageKeyRef.current = getStorageKey();
  }
  return storageKeyRef.current;
}

export function Editor() {
  const isDirtyRef = useRef(false);
  const storageKeyRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
        },
      }),
      Markdown,
    ],
    immediatelyRender: false,
    onCreate: ({ editor: e }) => {
      const storageKey = ensureStorageKey(storageKeyRef);
      try {
        e.commands.setContent(getInitialContent(storageKey), {
          contentType: "markdown",
        });
      } catch {
        localStorage.removeItem(storageKey);
        e.commands.setContent(DEFAULT_CONTENT, { contentType: "markdown" });
      }
    },
    onUpdate: () => {
      isDirtyRef.current = true;
    },
  });

  // Auto-save interval
  useEffect(() => {
    if (!editor) {
      return;
    }

    const id = setInterval(() => {
      if (!isDirtyRef.current) {
        return;
      }
      saveToLocalStorage(editor, ensureStorageKey(storageKeyRef));
      isDirtyRef.current = false;
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(id);
  }, [editor]);

  // Save on beforeunload
  useEffect(() => {
    if (!editor) {
      return;
    }

    const onBeforeUnload = () => {
      if (isDirtyRef.current) {
        saveToLocalStorage(editor, ensureStorageKey(storageKeyRef));
        isDirtyRef.current = false;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editor]);

  // Cmd+S to download
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editor) {
          downloadMarkdown(editor);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-y-auto px-8 py-6 md:px-16 lg:px-32">
        <div className="mx-auto max-w-3xl">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
