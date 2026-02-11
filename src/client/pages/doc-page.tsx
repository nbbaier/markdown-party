import { MilkdownProvider } from "@milkdown/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { DocMetadataResponse } from "../../shared/doc-meta";
import {
  MessageTypeDiscardLocal,
  MessageTypePushLocal,
} from "../../shared/messages";
import { ConflictModal } from "../components/conflict-modal";
import type { EditorHandle } from "../components/editor";
import { Editor } from "../components/editor";
import { SyncStatusBar } from "../components/sync-status-bar";
import { useAuth } from "../contexts/auth-context";
import { useCollabProvider } from "../hooks/use-collab-provider";
import { useEditToken } from "../hooks/use-edit-token";
import { useMarkdownProtocol } from "../hooks/use-markdown-protocol";
import { useSyncStatus } from "../hooks/use-sync-status";
import "./doc-page.css";

type ViewState = "loading" | "not-found" | "editor" | "viewer";

function EditorView({
  docId,
  exportRequestId,
  user,
}: {
  docId: string;
  exportRequestId: number;
  user: { userId: string; login: string; avatarUrl: string } | null;
}) {
  const editorRef = useRef<EditorHandle>(null);
  const [defaultValue, setDefaultValue] = useState<string | undefined>(
    undefined
  );

  const { doc, provider, awareness, connectionState } = useCollabProvider({
    docId,
    user,
  });

  const getMarkdown = useCallback(
    () => editorRef.current?.getMarkdown() ?? "",
    []
  );

  const handleExport = useCallback(() => {
    const markdown = getMarkdown();
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getMarkdown, docId]);

  useEffect(() => {
    if (exportRequestId > 0) {
      handleExport();
    }
  }, [exportRequestId, handleExport]);

  const handleReloadRemote = useCallback((markdown: string) => {
    setDefaultValue(markdown);
  }, []);

  useMarkdownProtocol({
    provider,
    getMarkdown,
    onReloadRemote: handleReloadRemote,
  });
  const { status, send, dismissConflict } = useSyncStatus({
    provider,
    getMarkdown,
  });

  const handlePushLocal = useCallback(() => {
    send({ type: MessageTypePushLocal, payload: {} });
    dismissConflict();
  }, [send, dismissConflict]);

  const handleDiscardLocal = useCallback(() => {
    send({ type: MessageTypeDiscardLocal, payload: {} });
    dismissConflict();
  }, [send, dismissConflict]);

  return (
    <div className="doc-editor">
      <SyncStatusBar
        connectionState={connectionState}
        nextRetryAt={status.nextRetryAt}
        retryAttempt={status.retryAttempt}
        syncState={status.syncState}
      />
      <div className="editor-wrapper">
        {doc ? (
          <MilkdownProvider>
            <Editor
              awareness={awareness}
              defaultValue={defaultValue}
              doc={doc}
              ref={editorRef}
            />
          </MilkdownProvider>
        ) : (
          <div className="editor-loading">
            {(() => {
              if (connectionState === "connecting") {
                return "Connecting...";
              }
              if (connectionState === "disconnected") {
                return "Disconnected";
              }
              return "Loading...";
            })()}
          </div>
        )}
      </div>
      {status.syncState === "conflict" &&
      status.localMarkdown !== undefined &&
      status.remoteMarkdown !== undefined ? (
        <ConflictModal
          localMarkdown={status.localMarkdown}
          onDiscardLocal={handleDiscardLocal}
          onPushLocal={handlePushLocal}
          remoteMarkdown={status.remoteMarkdown}
        />
      ) : null}
    </div>
  );
}

function ReadOnlyView({ docId }: { docId: string }) {
  const [rawContent, setRawContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRawContent() {
      try {
        const response = await fetch(`/${docId}/raw`);
        const text = await response.text();
        if (!cancelled) {
          setRawContent(text);
        }
      } catch {
        if (!cancelled) {
          setRawContent("");
        }
      }
    }

    loadRawContent();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  if (rawContent === null) {
    return <div className="editor-loading">Loading...</div>;
  }

  return (
    <div className="doc-viewer">
      <div className="viewer-notice">
        <p>Read-only view</p>
      </div>
      <pre className="viewer-content">{rawContent || "(empty document)"}</pre>
    </div>
  );
}

interface DocPageProps {
  exportRequestId: number;
}

export function DocPage({ exportRequestId }: DocPageProps) {
  const { docId } = useParams<{ docId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { claiming } = useEditToken(docId);
  const [viewState, setViewState] = useState<ViewState>("loading");

  useEffect(() => {
    if (authLoading || claiming || !docId) {
      return;
    }

    let cancelled = false;

    function checkEditCapability() {
      const hasEditCookie = document.cookie.includes("mp_edit_cap");
      const hasEditToken = !!sessionStorage.getItem(`edit_token:${docId}`);
      return hasEditCookie || hasEditToken;
    }

    function setView(state: ViewState) {
      if (!cancelled) {
        setViewState(state);
      }
    }

    async function resolveDoc() {
      try {
        const metaRes = await fetch(`/api/docs/${docId}`);
        if (!metaRes.ok || cancelled) {
          setView("not-found");
          return;
        }

        const meta = (await metaRes.json()) as DocMetadataResponse;
        if (cancelled) {
          return;
        }
        if (!meta.initialized) {
          setView("not-found");
          return;
        }

        const canEdit = checkEditCapability();
        setView(canEdit ? "editor" : "viewer");
      } catch {
        setView("not-found");
      }
    }

    resolveDoc();
    return () => {
      cancelled = true;
    };
  }, [docId, authLoading, claiming]);

  if (!docId) {
    return null;
  }

  if (viewState === "loading") {
    return (
      <div className="doc-page">
        <div className="editor-loading">Loading...</div>
      </div>
    );
  }

  if (viewState === "not-found") {
    return (
      <div className="doc-page">
        <div className="doc-not-found">
          <h2>Document not found</h2>
          <p>
            This document may have expired or does not exist. Documents expire
            after 24 hours of inactivity.
          </p>
          <a className="btn btn-primary" href="/">
            Create new document
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="doc-page">
      {viewState === "editor" ? (
        <EditorView
          docId={docId}
          exportRequestId={exportRequestId}
          user={user}
        />
      ) : (
        <ReadOnlyView docId={docId} />
      )}
    </div>
  );
}
