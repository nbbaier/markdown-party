import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../contexts/auth-context";
import "./header-bar.css";

interface GitHubModalProps {
  docId: string;
  onClose: () => void;
  onLinked: (gistUrl: string) => void;
}

function GitHubModal({ docId, onClose, onLinked }: GitHubModalProps) {
  const [gistId, setGistId] = useState("");
  const [filename, setFilename] = useState("document.md");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const modalRef = useRef<HTMLDivElement>(null);

  function getButtonText(): string {
    if (loading) {
      return "Saving...";
    }
    if (mode === "new") {
      return "Create Gist";
    }
    return "Link Gist";
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const body: { gist_id?: string; filename?: string; public?: boolean } =
        mode === "existing"
          ? { gist_id: gistId.trim() }
          : { filename: filename.trim() || "document.md", public: isPublic };

      const res = await fetch(`/api/docs/${docId}/github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to link to GitHub");
      }

      const data = (await res.json()) as { gist_url: string };
      onLinked(data.gist_url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [docId, gistId, filename, isPublic, mode, onClose, onLinked]);

  return (
    <div className="github-modal-overlay">
      <div className="github-modal" ref={modalRef}>
        <h3>Save to GitHub</h3>

        <div className="github-modal-tabs">
          <button
            className={mode === "new" ? "active" : ""}
            onClick={() => setMode("new")}
            type="button"
          >
            Create New Gist
          </button>
          <button
            className={mode === "existing" ? "active" : ""}
            onClick={() => setMode("existing")}
            type="button"
          >
            Link Existing Gist
          </button>
        </div>

        {mode === "new" ? (
          <>
            <div className="github-modal-field">
              <label htmlFor="gist-filename">Filename</label>
              <input
                id="gist-filename"
                onChange={(e) => setFilename(e.target.value)}
                placeholder="document.md"
                type="text"
                value={filename}
              />
            </div>
            <div className="github-modal-field">
              <label>
                <input
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  type="checkbox"
                />
                Public Gist
              </label>
            </div>
          </>
        ) : (
          <div className="github-modal-field">
            <label htmlFor="gist-id">Gist ID or URL</label>
            <input
              id="gist-id"
              onChange={(e) => setGistId(e.target.value)}
              placeholder="abc123... or https://gist.github.com/..."
              type="text"
              value={gistId}
            />
          </div>
        )}

        {error && <div className="github-modal-error">{error}</div>}

        <div className="github-modal-actions">
          <button disabled={loading} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary"
            disabled={loading || (mode === "existing" && !gistId.trim())}
            onClick={handleSubmit}
            type="button"
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ShareMenuProps {
  docId: string;
}

function ShareMenu({ docId }: ShareMenuProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = useCallback(async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard failed
    }
  }, []);

  const readOnlyUrl = `${window.location.origin}/${docId}`;
  const editToken = sessionStorage.getItem(`edit_token:${docId}`);
  const editUrl = editToken
    ? `${window.location.origin}/${docId}#edit=${editToken}`
    : null;

  return (
    <div className="share-menu">
      <div className="share-section">
        <h4>Read-only link</h4>
        <div className="share-row">
          <input readOnly type="text" value={readOnlyUrl} />
          <button
            onClick={() => copyToClipboard(readOnlyUrl, "readonly")}
            type="button"
          >
            {copied === "readonly" ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {editUrl && (
        <div className="share-section">
          <h4>Edit link (share with collaborators)</h4>
          <div className="share-row">
            <input readOnly type="text" value={editUrl} />
            <button
              onClick={() => copyToClipboard(editUrl, "edit")}
              type="button"
            >
              {copied === "edit" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HeaderBar() {
  const { user, logout } = useAuth();
  const { docId } = useParams<{ docId: string }>();
  const [showShare, setShowShare] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [linkedGist, setLinkedGist] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    window.dispatchEvent(new CustomEvent("export-document"));
  }, []);

  const handleGitHubLinked = useCallback((gistUrl: string) => {
    setLinkedGist(gistUrl);
  }, []);

  const canSaveToGitHub = Boolean(user && docId);

  return (
    <header className="header-bar">
      <div className="header-left">
        <a className="header-logo" href="/">
          markdown.party
        </a>
      </div>

      <div className="header-right">
        {docId && (
          <>
            <button
              className="header-btn"
              onClick={() => setShowShare(!showShare)}
              type="button"
            >
              Share
            </button>
            {showShare && (
              <div className="header-popover">
                <ShareMenu docId={docId} />
              </div>
            )}

            <button className="header-btn" onClick={handleExport} type="button">
              Export
            </button>

            {canSaveToGitHub && (
              <button
                className="header-btn"
                onClick={() => setShowGitHub(true)}
                type="button"
              >
                {linkedGist ? "Linked to GitHub" : "Save to GitHub"}
              </button>
            )}
            {showGitHub && (
              <GitHubModal
                docId={docId}
                onClose={() => setShowGitHub(false)}
                onLinked={handleGitHubLinked}
              />
            )}
          </>
        )}

        <div className="header-auth">
          {user ? (
            <div className="header-user">
              <img
                alt={user.login}
                className="header-avatar"
                height={28}
                src={user.avatarUrl}
                width={28}
              />
              <span className="header-username">{user.login}</span>
              <button className="header-btn" onClick={logout} type="button">
                Sign out
              </button>
            </div>
          ) : (
            <a className="header-btn header-signin" href="/api/auth/github">
              Sign in with GitHub
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
