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
import { useState } from "react";
import LinkDialog from "@/components/link-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { downloadMarkdown } from "@/lib/download";

interface ToolbarProps {
  editor: Editor;
}

const ICON_SIZE = 18;

function ToolbarToggle({
  pressed,
  onPressedChange,
  tooltip,
  children,
}: {
  pressed?: boolean;
  onPressedChange: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle onPressedChange={onPressedChange} pressed={pressed} size="sm">
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarButton({
  onClick,
  tooltip,
  children,
}: {
  onClick: () => void;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button onClick={onClick} size="sm" type="button" variant="ghost">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export default function Toolbar({ editor }: ToolbarProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDefaultUrl, setLinkDefaultUrl] = useState("");

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

  const openLinkDialog = () => {
    const attrs = editor.getAttributes("link");
    const previousUrl = typeof attrs.href === "string" ? attrs.href : "";
    setLinkDefaultUrl(previousUrl);
    setLinkDialogOpen(true);
  };

  const handleLinkSubmit = (url: string | null) => {
    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 border-b bg-background px-4 py-2">
        <ToolbarToggle
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          pressed={activeState.bold}
          tooltip="Bold (Cmd+B)"
        >
          <Bold size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          pressed={activeState.italic}
          tooltip="Italic (Cmd+I)"
        >
          <Italic size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          pressed={activeState.strike}
          tooltip="Strikethrough"
        >
          <Strikethrough size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() => editor.chain().focus().toggleCode().run()}
          pressed={activeState.code}
          tooltip="Inline Code"
        >
          <Code size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={openLinkDialog}
          pressed={activeState.link}
          tooltip="Link (Cmd+K)"
        >
          <Link size={ICON_SIZE} />
        </ToolbarToggle>

        <Separator className="mx-1 h-6" orientation="vertical" />

        <ToolbarToggle
          onPressedChange={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          pressed={activeState.heading1}
          tooltip="Heading 1"
        >
          <Heading1 size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          pressed={activeState.heading2}
          tooltip="Heading 2"
        >
          <Heading2 size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          pressed={activeState.heading3}
          tooltip="Heading 3"
        >
          <Heading3 size={ICON_SIZE} />
        </ToolbarToggle>

        <Separator className="mx-1 h-6" orientation="vertical" />

        <ToolbarToggle
          onPressedChange={() =>
            editor.chain().focus().toggleBulletList().run()
          }
          pressed={activeState.bulletList}
          tooltip="Bullet List"
        >
          <List size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() =>
            editor.chain().focus().toggleOrderedList().run()
          }
          pressed={activeState.orderedList}
          tooltip="Ordered List"
        >
          <ListOrdered size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() => editor.chain().focus().toggleTaskList().run()}
          pressed={activeState.taskList}
          tooltip="Task List"
        >
          <ListTodo size={ICON_SIZE} />
        </ToolbarToggle>

        <Separator className="mx-1 h-6" orientation="vertical" />

        <ToolbarButton
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          tooltip="Insert Table"
        >
          <Table size={ICON_SIZE} />
        </ToolbarButton>

        <ToolbarToggle
          onPressedChange={() =>
            editor.chain().focus().toggleBlockquote().run()
          }
          pressed={activeState.blockquote}
          tooltip="Blockquote"
        >
          <Quote size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarToggle
          onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
          pressed={activeState.codeBlock}
          tooltip="Code Block"
        >
          <CodeSquare size={ICON_SIZE} />
        </ToolbarToggle>

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          tooltip="Horizontal Rule"
        >
          <Minus size={ICON_SIZE} />
        </ToolbarButton>

        <div className="ml-auto">
          <ToolbarButton
            onClick={() => downloadMarkdown(editor)}
            tooltip="Download .md (Cmd+S)"
          >
            <Download size={ICON_SIZE} />
          </ToolbarButton>
        </div>
      </div>

      <LinkDialog
        defaultUrl={linkDefaultUrl}
        onOpenChange={setLinkDialogOpen}
        onSubmit={handleLinkSubmit}
        open={linkDialogOpen}
      />
    </TooltipProvider>
  );
}
