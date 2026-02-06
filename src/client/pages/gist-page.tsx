import { MilkdownProvider } from "@milkdown/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  MessageTypeDiscardLocal,
  MessageTypePushLocal,
} from "../../shared/messages";
import { ConflictModal } from "../components/conflict-modal";
import type { EditorHandle } from "../components/Editor";
import { Editor } from "../components/Editor";
import { MarkdownViewer } from "../components/markdown-viewer";
import { PendingSyncBanner } from "../components/pending-sync-banner";
import { SyncStatusBar } from "../components/sync-status-bar";
import { useAuth } from "../contexts/auth-context";
import { useCollabProvider } from "../hooks/use-collab-provider";
import { useEditToken } from "../hooks/use-edit-token";
import { useMarkdownProtocol } from "../hooks/use-markdown-protocol";
import { useSyncStatus } from "../hooks/use-sync-status";
import { useWarnOnExit } from "../hooks/use-warn-on-exit";
import { NotFoundPage } from "./not-found-page";
import "./gist-page.css";

type ViewState = "loading" | "not-found" | "editor" | "viewer";

interface GistMeta {
  gist_id: string;
  filename: string;
  owner_user_id: string;
  pending_sync: boolean;
  initialized: boolean;
}

function EditorView({
  gistId,
  user,
}: {
  gistId: string;
  user: { userId: string; login: string; avatarUrl: string } | null;
}) {
  const editorRef = useRef<EditorHandle>(null);
  const [exportedMarkdown, setExportedMarkdown] = useState("");
  const [defaultValue, setDefaultValue] = useState<string | undefined>(
    undefined
  );

  const { doc, provider, awareness, connectionState } = useCollabProvider({
    gistId,
    user,
  });

  const getMarkdown = useCallback(
    () => editorRef.current?.getMarkdown() ?? "",
    []
  );

  const { status, send, dismissConflict } = useSyncStatus({
    provider,
    getMarkdown,
  });

  const handleNeedsInit = useCallback(
    async (initGistId: string, _filename: string) => {
      try {
        const res = await fetch(`/api/gists/${initGistId}`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as { content?: string };
        if (data.content) {
          setDefaultValue(data.content);
        }
      } catch {
        // failed to fetch initial content
      }
    },
    []
  );

  const handleReloadRemote = useCallback((markdown: string) => {
    setDefaultValue(markdown);
  }, []);

  useMarkdownProtocol({
    provider,
    getMarkdown,
    onNeedsInit: handleNeedsInit,
    onReloadRemote: handleReloadRemote,
  });

  useWarnOnExit(
    status.syncState === "pending-sync" || status.syncState === "conflict"
  );

  const handleExport = () => {
    const markdown = editorRef.current?.getMarkdown() || "";
    setExportedMarkdown(markdown);
  };

  const handlePushLocal = useCallback(() => {
    send({ type: MessageTypePushLocal, payload: {} });
    dismissConflict();
  }, [send, dismissConflict]);

  const handleDiscardLocal = useCallback(() => {
    send({ type: MessageTypeDiscardLocal, payload: {} });
    dismissConflict();
  }, [send, dismissConflict]);

  return (
    <>
      <div className="gist-header">
        <h2>Editing: {gistId}</h2>
        <div className="gist-header-info">
          <SyncStatusBar
            connectionState={connectionState}
            nextRetryAt={status.nextRetryAt}
            retryAttempt={status.retryAttempt}
            syncState={status.syncState}
          />
        </div>
        <div className="gist-actions">
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            type="button"
          >
            Export Markdown
          </button>
        </div>
      </div>

      {status.syncState === "pending-sync" && status.pendingSince && (
        <PendingSyncBanner
          expiresAt={status.expiresAt}
          getMarkdown={getMarkdown}
          pendingSince={status.pendingSince}
        />
      )}

      {status.syncState === "conflict" &&
        status.remoteMarkdown !== undefined && (
          <ConflictModal
            localMarkdown={status.localMarkdown ?? getMarkdown()}
            onDiscardLocal={handleDiscardLocal}
            onPushLocal={handlePushLocal}
            remoteMarkdown={status.remoteMarkdown}
          />
        )}

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
          <div className="editor-loading">Connecting...</div>
        )}
      </div>

      {exportedMarkdown && (
        <div className="export-preview">
          <h3>Exported Markdown:</h3>
          <pre className="export-content">{exportedMarkdown}</pre>
        </div>
      )}
    </>
  );
}

function ReadOnlyView({ gistId, meta }: { gistId: string; meta: GistMeta }) {
  const [rawContent, setRawContent] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/gists/${gistId}/raw`)
      .then((r) => r.text())
      .then(setRawContent)
      .catch(() => setRawContent(""));
  }, [gistId]);

  if (rawContent === null) {
    return <div className="editor-loading">Loading...</div>;
  }

  return (
    <>
      <div className="gist-header">
        <h2>{meta.filename}</h2>
        <div className="gist-header-info">
          <span className="view-badge">Read-only</span>
        </div>
      </div>
      <div className="viewer-wrapper">
        <MarkdownViewer content={rawContent} />
      </div>
    </>
  );
}

export function GistPage() {
  const { gistId } = useParams<{ gistId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { claiming } = useEditToken(gistId);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [meta, setMeta] = useState<GistMeta | null>(null);

  useEffect(() => {
    if (authLoading || claiming || !gistId) {
      return;
    }

    let cancelled = false;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a complex async function that needs to be split into smaller functions (TODO: work on this)
    async function resolve() {
      try {
        const metaRes = await fetch(`/api/gists/${gistId}`);
        if (metaRes.status === 404) {
          if (!cancelled) {
            setViewState("not-found");
          }
          return;
        }
        if (!metaRes.ok) {
          if (!cancelled) {
            setViewState("not-found");
          }
          return;
        }

        const metaData = (await metaRes.json()) as GistMeta;
        if (cancelled) {
          return;
        }
        setMeta(metaData);

        const editRes = await fetch(`/api/gists/${gistId}/can-edit`, {
          credentials: "include",
        });
        const { canEdit } = (await editRes.json()) as { canEdit: boolean };

        if (!cancelled) {
          setViewState(canEdit ? "editor" : "viewer");
        }
      } catch {
        if (!cancelled) {
          setViewState("not-found");
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [gistId, authLoading, claiming]);

  if (!gistId) {
    return null;
  }

  if (viewState === "loading") {
    return (
      <div className="gist-page">
        <div className="editor-loading">Loading...</div>
      </div>
    );
  }

  if (viewState === "not-found") {
    return <NotFoundPage gistId={gistId} />;
  }

  return (
    <div className="gist-page">
      {viewState === "editor" ? (
        <EditorView gistId={gistId} user={user} />
      ) : (
        meta && <ReadOnlyView gistId={gistId} meta={meta} />
      )}
    </div>
  );
}
