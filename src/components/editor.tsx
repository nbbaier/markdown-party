import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadMarkdown } from "@/lib/download";
import { Toolbar } from "./toolbar";

const STORAGE_KEY_PREFIX = "markdown-party-content";
const AUTO_SAVE_INTERVAL = 10_000;
const WHITESPACE_RE = /\s+/;

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

function updatePageTitle(editor: TiptapEditor) {
  let title = "";
  editor.state.doc.descendants((node) => {
    if (title) {
      return false;
    }
    if (node.type.name === "heading") {
      title = node.textContent;
      return false;
    }
    return true;
  });
  document.title = title ? `${title} — markdown.party` : "markdown.party";
}

function EditorLayout({
  editor,
  isDragOver,
  saveStatus,
}: {
  editor: TiptapEditor;
  isDragOver: boolean;
  saveStatus: "saved" | "unsaved";
}) {
  const wordCount = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const text = e.state.doc.textContent;
      return text.trim() === "" ? 0 : text.trim().split(WHITESPACE_RE).length;
    },
  });

  return (
    <div className="flex h-screen flex-col">
      <Toolbar editor={editor} />
      <div
        className={`flex-1 overflow-y-auto px-8 py-6 md:px-16 lg:px-32 ${isDragOver ? "bg-primary/5 ring-2 ring-primary ring-inset" : ""}`}
        id="editor-drop-zone"
      >
        <div className="mx-auto max-w-3xl">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-1.5 text-muted-foreground text-xs">
        <span>
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
        <span>{saveStatus === "saved" ? "Saved" : "Unsaved changes"}</span>
      </div>
    </div>
  );
}

export function Editor() {
  const isDirtyRef = useRef(false);
  const storageKeyRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved">("saved");

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
      updatePageTitle(e);
    },
    onUpdate: ({ editor: e }) => {
      isDirtyRef.current = true;
      setSaveStatus("unsaved");
      updatePageTitle(e);
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
      setSaveStatus("saved");
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
        setSaveStatus("saved");
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editor]);

  // Save on visibility change
  useEffect(() => {
    if (!editor) {
      return;
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isDirtyRef.current) {
        saveToLocalStorage(editor, ensureStorageKey(storageKeyRef));
        isDirtyRef.current = false;
        setSaveStatus("saved");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [editor]);

  // Cmd+S to download
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editor) {
          downloadMarkdown(editor);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  // Drag-and-drop .md file import
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const zone = document.getElementById("editor-drop-zone");
    if (!zone) {
      return;
    }

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragOver(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer?.files[0];
      if (!file) {
        return;
      }

      if (!(file.name.endsWith(".md") || file.name.endsWith(".markdown"))) {
        toast.error("Only .md files are supported");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === "string") {
          editor.commands.setContent(content, { contentType: "markdown" });
          saveToLocalStorage(editor, ensureStorageKey(storageKeyRef));
          isDirtyRef.current = false;
          toast.success(`Loaded ${file.name}`);
        }
      };
      reader.readAsText(file);
    };

    zone.addEventListener("dragover", onDragOver);
    zone.addEventListener("dragleave", onDragLeave);
    zone.addEventListener("drop", onDrop);

    return () => {
      zone.removeEventListener("dragover", onDragOver);
      zone.removeEventListener("dragleave", onDragLeave);
      zone.removeEventListener("drop", onDrop);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <EditorLayout
      editor={editor}
      isDragOver={isDragOver}
      saveStatus={saveStatus}
    />
  );
}
