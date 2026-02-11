import { type Editor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Table,
  Quote,
  Minus,
  Download,
  CodeSquare,
} from "lucide-react";
import { downloadMarkdown } from "@/lib/download";
import { toast } from "sonner";

interface ToolbarProps {
  editor: Editor;
}

function ToolbarButton({
  onClick,
  isActive = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        isActive
          ? "bg-gray-200 text-gray-900"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="mx-1 h-6 w-px bg-gray-200" />;
}

function isValidLinkUrl(url: string): boolean {
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("mailto:") ||
    url.startsWith("/") ||
    url.startsWith("#")
  );
}

export default function Toolbar({ editor }: ToolbarProps) {
  const iconSize = 18;
  const activeState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor.isActive("bold"),
      italic: currentEditor.isActive("italic"),
      strike: currentEditor.isActive("strike"),
      code: currentEditor.isActive("code"),
      link: currentEditor.isActive("link"),
      heading1: currentEditor.isActive("heading", { level: 1 }),
      heading2: currentEditor.isActive("heading", { level: 2 }),
      heading3: currentEditor.isActive("heading", { level: 3 }),
      bulletList: currentEditor.isActive("bulletList"),
      orderedList: currentEditor.isActive("orderedList"),
      taskList: currentEditor.isActive("taskList"),
      blockquote: currentEditor.isActive("blockquote"),
      codeBlock: currentEditor.isActive("codeBlock"),
    }),
  });

  const setLink = () => {
    const attrs = editor.getAttributes("link");
    const previousUrl = typeof attrs.href === "string" ? attrs.href : undefined;
    const url = window.prompt("URL", previousUrl ?? "");

    if (url === null) return;

    const trimmedUrl = url.trim();
    if (trimmedUrl === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!isValidLinkUrl(trimmedUrl)) {
      toast.error("Invalid URL");
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: trimmedUrl })
      .run();
  };

  const insertTable = () => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  const handleDownload = () => {
    try {
      downloadMarkdown(editor);
    } catch {
      toast.error("Failed to export markdown");
    }
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-gray-200 bg-white px-4 py-2">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={activeState.bold}
        title="Bold (Cmd+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={activeState.italic}
        title="Italic (Cmd+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={activeState.strike}
        title="Strikethrough"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={activeState.code}
        title="Inline Code"
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={setLink}
        isActive={activeState.link}
        title="Link (Cmd+K)"
      >
        <Link size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        isActive={activeState.heading1}
        title="Heading 1"
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        isActive={activeState.heading2}
        title="Heading 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        isActive={activeState.heading3}
        title="Heading 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={activeState.bulletList}
        title="Bullet List"
      >
        <List size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={activeState.orderedList}
        title="Ordered List"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={activeState.taskList}
        title="Task List"
      >
        <ListTodo size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton onClick={insertTable} title="Insert Table">
        <Table size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={activeState.blockquote}
        title="Blockquote"
      >
        <Quote size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={activeState.codeBlock}
        title="Code Block"
      >
        <CodeSquare size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <div className="ml-auto">
        <ToolbarButton onClick={handleDownload} title="Download .md (Cmd+S)">
          <Download size={iconSize} />
        </ToolbarButton>
      </div>
    </div>
  );
}
