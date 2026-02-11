import type { Editor as TiptapEditor } from "@tiptap/react";
import { toast } from "sonner";

export function downloadMarkdown(
  editor: TiptapEditor,
  filename = "untitled.md"
): void {
  try {
    const markdown = editor.getMarkdown();
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
