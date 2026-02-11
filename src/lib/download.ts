import type { Editor as TiptapEditor } from "@tiptap/react";

export function downloadMarkdown(editor: TiptapEditor) {
  const markdown = editor.getMarkdown();
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "untitled.md";
  a.click();

  URL.revokeObjectURL(url);
}
