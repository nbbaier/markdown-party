import type { Editor as TiptapEditor } from "@tiptap/react";
import { toast } from "sonner";

function getFilenameFromEditor(editor: TiptapEditor): string {
  let title = "";
  editor.state.doc.descendants((node) => {
    if (title) {
      return false;
    }
    if (node.type.name === "heading") {
      title = node.textContent.trim();
      return false;
    }
    return true;
  });

  if (!title) {
    return "untitled.md";
  }

  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${sanitized || "untitled"}.md`;
}

export function downloadMarkdown(editor: TiptapEditor): void {
  try {
    const markdown = editor.getMarkdown();
    const filename = getFilenameFromEditor(editor);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error("Failed to export markdown");
  }
}
