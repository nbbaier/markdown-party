import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../contexts/auth-context";
import { GitHubModal } from "./github-save-modal";
import "./header-bar.css";

interface HeaderBarProps {
  onExportDocument?: () => void;
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

export function HeaderBar({ onExportDocument }: HeaderBarProps) {
  const { user, logout } = useAuth();
  const { docId } = useParams<{ docId: string }>();
  const [showShare, setShowShare] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [linkedGist, setLinkedGist] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    onExportDocument?.();
  }, [onExportDocument]);

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
