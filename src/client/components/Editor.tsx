import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { getMarkdown } from "@milkdown/utils/lib/macro/get-markdown";
import type { Ctx } from "@milkdown/ctx";

import "./editor.css";

export interface EditorHandle {
  getMarkdown: () => string;
  isDirty: () => boolean;
  markClean: () => void;
}

export interface EditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  readonly?: boolean;
}

function EditorComponent(
  { defaultValue = "", onChange, readonly = false }: EditorProps,
  ref: React.Ref<EditorHandle>
) {
  const ctxRef = useRef<Ctx | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(defaultValue);

  const { loading, get } = useEditor(
    (root) => {
      const editor = root
        .config((ctx) => {
          ctx.set(listenerCtx, new listener());
          ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
            }
            debounceRef.current = setTimeout(() => {
              setIsDirty(markdown !== lastSavedRef.current);
              onChange?.(markdown);
            }, 300);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(listener);

      if (defaultValue) {
        // Milkdown will parse the defaultValue markdown on initialization
      }

      return editor;
    },
    [defaultValue, onChange]
  );

  // Store ctx reference when editor is ready
  useEffect(() => {
    const editor = get();
    if (editor && !loading) {
      editor.create().then((ctx) => {
        ctxRef.current = ctx;
      });
    }
  }, [get, loading]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleGetMarkdown = useCallback((): string => {
    if (!ctxRef.current) return "";
    return ctxRef.current.call(getMarkdown());
  }, []);

  const handleIsDirty = useCallback((): boolean => {
    return isDirty;
  }, [isDirty]);

  const handleMarkClean = useCallback((): void => {
    lastSavedRef.current = handleGetMarkdown();
    setIsDirty(false);
  }, [handleGetMarkdown]);

  useImperativeHandle(ref, () => ({
    getMarkdown: handleGetMarkdown,
    isDirty: handleIsDirty,
    markClean: handleMarkClean,
  }));

  if (loading) {
    return <div className="editor-loading">Loading editor...</div>;
  }

  return (
    <div className={`editor-container ${readonly ? "readonly" : ""}`}>
      <Milkdown />
    </div>
  );
}

export const Editor = forwardRef(EditorComponent);

// Convenience wrapper with provider
export function EditorWithProvider(props: EditorProps & { ref?: React.Ref<EditorHandle> }) {
  return (
    <MilkdownProvider>
      <Editor {...props} ref={props.ref} />
    </MilkdownProvider>
  );
}
