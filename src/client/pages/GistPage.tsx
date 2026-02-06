import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Editor, EditorHandle } from "../components/Editor";
import { MilkdownProvider } from "@milkdown/react";
import "./gist-page.css";

export function GistPage() {
  const { gistId } = useParams<{ gistId: string }>();
  const editorRef = useRef<EditorHandle>(null);
  const [exportedMarkdown, setExportedMarkdown] = useState("");

  // Placeholder markdown for testing
  const defaultMarkdown = `# Welcome to gist.party

This is a **collaborative** markdown editor powered by Milkdown and Yjs.

## Features

- WYSIWYG editing
- Real-time collaboration (coming soon)
- GitHub Gist integration (coming soon)

## Try it out

Type "/" for slash commands or use Markdown syntax:

### Heading 3

**Bold text** and *italic text*

- List item 1
- List item 2
  - Nested item

- [ ] Task 1
- [x] Task 2 (done)

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |

\`\`\`javascript
console.log("Hello from gist.party!");
\`\`\`

> This is a blockquote

---

Enjoy editing!
`;

  const handleExport = () => {
    const markdown = editorRef.current?.getMarkdown() || "";
    setExportedMarkdown(markdown);
    console.log("Exported markdown:", markdown);
  };

  const handleChange = (markdown: string) => {
    // This will be debounced (300ms) by the Editor component
    console.log("Content changed:", markdown.substring(0, 100) + "...");
  };

  return (
    <div className="gist-page">
      <div className="gist-header">
        <h2>Editing: {gistId}</h2>
        <div className="gist-actions">
          <button type="button" className="btn btn-secondary" onClick={handleExport}>
            Export Markdown
          </button>
        </div>
      </div>

      <div className="editor-wrapper">
        <MilkdownProvider>
          <Editor
            ref={editorRef}
            defaultValue={defaultMarkdown}
            onChange={handleChange}
          />
        </MilkdownProvider>
      </div>

      {exportedMarkdown && (
        <div className="export-preview">
          <h3>Exported Markdown:</h3>
          <pre className="export-content">{exportedMarkdown}</pre>
        </div>
      )}
    </div>
  );
}
