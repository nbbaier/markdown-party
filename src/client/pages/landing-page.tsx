import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./landing-page.css";

export function LandingPage() {
  const navigate = useNavigate();
  const [gistUrl, setGistUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNewDocument = () => {
    const randomId = Math.random().toString(36).substring(2, 15);
    navigate(`/${randomId}`);
  };

  const handleImportGist = async () => {
    const gistId = gistUrl.split("/").pop() || gistUrl;
    if (!gistId) {
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const res = await fetch(`/api/gists/${gistId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: gistUrl }),
        credentials: "include",
      });

      if (res.status === 401) {
        setError("Please sign in to import a gist");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to import gist");
        return;
      }

      const data = (await res.json()) as {
        gist_id: string;
        edit_token?: string;
      };

      if (data.edit_token) {
        navigate(`/${data.gist_id}#edit=${data.edit_token}`);
      } else {
        navigate(`/${data.gist_id}`);
      }
    } catch {
      setError("Failed to import gist");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="landing-page">
      <div className="hero">
        <h1>Collaborative Gist Editing</h1>
        <p className="subtitle">
          Real-time markdown editing powered by Yjs and GitHub Gists
        </p>
      </div>

      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={handleNewDocument}
          type="button"
        >
          New Document
        </button>

        <div className="import-section">
          <input
            className="import-input"
            disabled={importing}
            onChange={(e) => setGistUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImportGist()}
            placeholder="Paste GitHub Gist URL or ID"
            type="text"
            value={gistUrl}
          />
          <button
            className="btn btn-secondary"
            disabled={!gistUrl.trim() || importing}
            onClick={handleImportGist}
            type="button"
          >
            {importing ? "Importing..." : "Import Gist"}
          </button>
          {error && <p className="import-error">{error}</p>}
        </div>
      </div>

      <div className="features">
        <div className="feature">
          <h3>Real-time Collaboration</h3>
          <p>Edit together with others in real-time using Yjs</p>
        </div>
        <div className="feature">
          <h3>GitHub Integration</h3>
          <p>Sync your changes directly to GitHub Gists</p>
        </div>
        <div className="feature">
          <h3>WYSIWYG Editor</h3>
          <p>Beautiful markdown editing with live preview</p>
        </div>
      </div>
    </div>
  );
}
