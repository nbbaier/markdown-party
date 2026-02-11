import { type Editor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  CodeSquare,
  Download,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table,
} from "lucide-react";
import { toast } from "sonner";
import { downloadMarkdown } from "@/lib/download";

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
      aria-pressed={isActive}
      className={`rounded p-1.5 transition-colors ${
        isActive
          ? "bg-gray-200 text-gray-900"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
      onClick={onClick}
      title={title}
      type="button"
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
    // biome-ignore lint/suspicious/noAlert: Using prompt for link input until a custom modal is built
    const url = window.prompt("URL", previousUrl ?? "");

    if (url === null) {
      return;
    }

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
    downloadMarkdown(editor);
  };

  return (
    <div className="flex items-center gap-0.5 border-gray-200 border-b bg-white px-4 py-2">
      <ToolbarButton
        isActive={activeState.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Cmd+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Cmd+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline Code"
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.link}
        onClick={setLink}
        title="Link (Cmd+K)"
      >
        <Link size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        isActive={activeState.heading1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.heading2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.heading3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        isActive={activeState.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        title="Task List"
      >
        <ListTodo size={iconSize} />
      </ToolbarButton>

      <Separator />

      <ToolbarButton onClick={insertTable} title="Insert Table">
        <Table size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        <Quote size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        isActive={activeState.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
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
