import { useCallback, useEffect, useRef, useState } from "react";

interface GitHubModalProps {
  docId: string;
  onClose: () => void;
  onLinked: (gistUrl: string) => void;
}

export function GitHubModal({ docId, onClose, onLinked }: GitHubModalProps) {
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
